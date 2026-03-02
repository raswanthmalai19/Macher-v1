/**
 * LogInsightsQueryManager - Execute and manage CloudWatch Logs Insights queries
 * 
 * This class provides a convenient interface for executing saved queries
 * and managing common troubleshooting scenarios.
 * 
 * Features:
 * - Pre-defined queries for common scenarios
 * - Query execution with timeout handling
 * - Result parsing and formatting
 * 
 * Usage:
 * ```typescript
 * const manager = new LogInsightsQueryManager({ region: 'us-east-1' });
 * const results = await manager.executeSavedQuery('error-analysis', { 
 *   startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
 *   endTime: new Date()
 * });
 * ```
 */

import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  QueryStatus,
  ResultField,
} from '@aws-sdk/client-cloudwatch-logs';
import { logger } from './structured-logger';

/**
 * Time range for log queries
 */
export interface TimeRange {
  startTime: Date;
  endTime: Date;
}

/**
 * Query result statistics
 */
export interface QueryStatistics {
  recordsMatched: number;
  recordsScanned: number;
  bytesScanned: number;
}

/**
 * Log record from query results
 */
export interface LogRecord {
  [field: string]: string | number;
}

/**
 * Query result
 */
export interface QueryResult {
  results: LogRecord[];
  statistics: QueryStatistics;
}

/**
 * Saved query definition
 */
export interface SavedQuery {
  name: string;
  queryString: string;
  logGroupNames: string[];
  description: string;
}

/**
 * Configuration for LogInsightsQueryManager
 */
export interface LogInsightsQueryManagerConfig {
  region?: string;
  queryTimeout?: number; // milliseconds
  pollInterval?: number; // milliseconds
}

/**
 * LogInsightsQueryManager class
 */
export class LogInsightsQueryManager {
  private readonly client: CloudWatchLogsClient;
  private readonly queryTimeout: number;
  private readonly pollInterval: number;
  private readonly savedQueries: Map<string, SavedQuery>;

  constructor(config: LogInsightsQueryManagerConfig = {}) {
    this.client = new CloudWatchLogsClient({
      region: config.region || process.env.AWS_REGION || 'us-east-1',
    });
    this.queryTimeout = config.queryTimeout || 30000; // 30 seconds
    this.pollInterval = config.pollInterval || 1000; // 1 second
    this.savedQueries = new Map();
    
    // Initialize pre-defined queries
    this.initializeSavedQueries();
  }

  /**
   * Initialize pre-defined saved queries
   */
  private initializeSavedQueries(): void {
    // Error analysis query
    this.savedQueries.set('error-analysis', {
      name: 'error-analysis',
      description: 'Analyze errors by type and component',
      logGroupNames: ['/aws/lambda/macher'],
      queryString: `
        fields @timestamp, component, error.type, error.message
        | filter level = "ERROR"
        | stats count() as errorCount by component, error.type
        | sort errorCount desc
      `.trim(),
    });

    // Latency analysis query
    this.savedQueries.set('latency-analysis', {
      name: 'latency-analysis',
      description: 'Calculate P50/P90/P99 latency by endpoint',
      logGroupNames: ['/aws/lambda/macher'],
      queryString: `
        fields @timestamp, operation, duration
        | filter duration > 0
        | stats pct(duration, 50) as p50, pct(duration, 90) as p90, pct(duration, 99) as p99 by operation
        | sort p99 desc
      `.trim(),
    });

    // User activity analysis query
    this.savedQueries.set('user-activity', {
      name: 'user-activity',
      description: 'Analyze request counts by user',
      logGroupNames: ['/aws/lambda/macher'],
      queryString: `
        fields @timestamp, userId, operation
        | filter userId != ""
        | stats count() as requestCount by userId
        | sort requestCount desc
        | limit 100
      `.trim(),
    });

    // Security event analysis query
    this.savedQueries.set('security-events', {
      name: 'security-events',
      description: 'Analyze failed authentication attempts',
      logGroupNames: ['/aws/lambda/macher'],
      queryString: `
        fields @timestamp, userId, metadata.reason, metadata.sourceIp
        | filter operation = "authenticate" and level = "ERROR"
        | stats count() as failedAttempts by userId, metadata.sourceIp
        | sort failedAttempts desc
      `.trim(),
    });
  }

  /**
   * Execute a saved query
   */
  public async executeSavedQuery(
    queryName: string,
    timeRange: TimeRange
  ): Promise<QueryResult> {
    const savedQuery = this.savedQueries.get(queryName);
    
    if (!savedQuery) {
      throw new Error(`Saved query not found: ${queryName}`);
    }

    logger.info('Executing saved query', {
      component: 'LogInsightsQueryManager',
      metadata: {
        queryName,
        startTime: timeRange.startTime.toISOString(),
        endTime: timeRange.endTime.toISOString(),
      },
    });

    return this.executeQuery(
      savedQuery.queryString,
      savedQuery.logGroupNames,
      timeRange
    );
  }

  /**
   * Execute a custom query
   */
  public async executeQuery(
    queryString: string,
    logGroupNames: string[],
    timeRange: TimeRange
  ): Promise<QueryResult> {
    const startTime = Math.floor(timeRange.startTime.getTime() / 1000);
    const endTime = Math.floor(timeRange.endTime.getTime() / 1000);

    // Start the query
    const startCommand = new StartQueryCommand({
      logGroupNames,
      startTime,
      endTime,
      queryString,
    });

    const startResponse = await this.client.send(startCommand);
    const queryId = startResponse.queryId;

    if (!queryId) {
      throw new Error('Failed to start query: no queryId returned');
    }

    logger.info('Query started', {
      component: 'LogInsightsQueryManager',
      metadata: { queryId },
    });

    // Poll for results
    const results = await this.pollForResults(queryId);

    return results;
  }

  /**
   * Poll for query results with timeout
   */
  private async pollForResults(queryId: string): Promise<QueryResult> {
    const startTime = Date.now();

    while (true) {
      // Check timeout
      if (Date.now() - startTime > this.queryTimeout) {
        throw new Error(`Query timeout after ${this.queryTimeout}ms`);
      }

      // Get query results
      const getCommand = new GetQueryResultsCommand({ queryId });
      const response = await this.client.send(getCommand);

      const status = response.status;

      if (status === QueryStatus.Complete) {
        // Parse results
        const results = this.parseResults(response.results || []);
        const statistics: QueryStatistics = {
          recordsMatched: response.statistics?.recordsMatched || 0,
          recordsScanned: response.statistics?.recordsScanned || 0,
          bytesScanned: response.statistics?.bytesScanned || 0,
        };

        logger.info('Query completed', {
          component: 'LogInsightsQueryManager',
          metadata: {
            queryId,
            recordsMatched: statistics.recordsMatched,
            duration: Date.now() - startTime,
          },
        });

        return { results, statistics };
      }

      if (status === QueryStatus.Failed || status === QueryStatus.Cancelled) {
        throw new Error(`Query ${status.toLowerCase()}: ${queryId}`);
      }

      // Wait before polling again
      await this.sleep(this.pollInterval);
    }
  }

  /**
   * Parse query results into structured records
   */
  private parseResults(results: ResultField[][]): LogRecord[] {
    return results.map((fields) => {
      const record: LogRecord = {};
      
      for (const field of fields) {
        if (field.field && field.value !== undefined) {
          // Try to parse numeric values
          const numValue = Number(field.value);
          record[field.field] = isNaN(numValue) ? field.value : numValue;
        }
      }
      
      return record;
    });
  }

  /**
   * Create a new saved query
   */
  public createSavedQuery(
    name: string,
    queryString: string,
    logGroupNames: string[],
    description: string = ''
  ): void {
    this.savedQueries.set(name, {
      name,
      queryString,
      logGroupNames,
      description,
    });

    logger.info('Saved query created', {
      component: 'LogInsightsQueryManager',
      metadata: { name, description },
    });
  }

  /**
   * List all saved queries
   */
  public listSavedQueries(): SavedQuery[] {
    return Array.from(this.savedQueries.values());
  }

  /**
   * Sleep utility for polling
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a singleton instance for convenience
 */
export const logInsightsQueryManager = new LogInsightsQueryManager();
