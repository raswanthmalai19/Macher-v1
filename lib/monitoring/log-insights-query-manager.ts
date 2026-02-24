/**
 * LogInsightsQueryManager - Execute and manage CloudWatch Logs Insights queries
 * 
 * This manager provides methods to execute saved queries, create new saved queries,
 * and list available queries for analyzing CloudWatch Logs data.
 * 
 * Features:
 * - Execute pre-defined queries for common scenarios
 * - Create and manage saved queries
 * - Query results with statistics
 * 
 * Usage:
 * ```typescript
 * const manager = new LogInsightsQueryManager();
 * const result = await manager.executeSavedQuery('error-analysis', {
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
} from '@aws-sdk/client-cloudwatch-logs';

/**
 * Time range for query execution
 */
export interface TimeRange {
  startTime: Date;
  endTime: Date;
}

/**
 * Query result with log records and statistics
 */
export interface QueryResult {
  results: LogRecord[];
  statistics: {
    recordsMatched: number;
    recordsScanned: number;
    bytesScanned: number;
  };
}

/**
 * Log record with dynamic fields
 */
export interface LogRecord {
  [field: string]: string | number;
}

/**
 * Saved query configuration
 */
export interface SavedQuery {
  name: string;
  queryString: string;
  logGroupNames: string[];
}

/**
 * Saved query definitions for common scenarios
 */
const SAVED_QUERIES: Record<string, SavedQuery> = {
  'error-analysis': {
    name: 'error-analysis',
    queryString: `
      fields @timestamp, level, component, message, error.type, error.message
      | filter level = "ERROR"
      | stats count() as errorCount by component, error.type
      | sort errorCount desc
    `.trim(),
    logGroupNames: ['/aws/lambda/vocalshield'],
  },
  'latency-analysis': {
    name: 'latency-analysis',
    queryString: `
      fields @timestamp, operation, duration
      | filter duration > 0
      | stats pct(duration, 50) as p50, pct(duration, 90) as p90, pct(duration, 99) as p99 by operation
      | sort p99 desc
    `.trim(),
    logGroupNames: ['/aws/lambda/vocalshield'],
  },
  'user-activity-analysis': {
    name: 'user-activity-analysis',
    queryString: `
      fields @timestamp, userId, operation
      | filter userId != ""
      | stats count() as requestCount by userId
      | sort requestCount desc
      | limit 100
    `.trim(),
    logGroupNames: ['/aws/lambda/vocalshield'],
  },
  'security-event-analysis': {
    name: 'security-event-analysis',
    queryString: `
      fields @timestamp, userId, operation, metadata.reason, metadata.sourceIp
      | filter operation = "authenticateUser" and level = "ERROR"
      | stats count() as failedAttempts by userId, metadata.sourceIp
      | sort failedAttempts desc
    `.trim(),
    logGroupNames: ['/aws/lambda/vocalshield'],
  },
};

/**
 * LogInsightsQueryManager class for executing and managing CloudWatch Logs Insights queries
 */
export class LogInsightsQueryManager {
  private client: CloudWatchLogsClient;
  private customQueries: Map<string, SavedQuery>;

  /**
   * Create a new LogInsightsQueryManager
   * @param region AWS region (defaults to us-east-1)
   */
  constructor(region: string = 'us-east-1') {
    this.client = new CloudWatchLogsClient({ region });
    this.customQueries = new Map();
  }

  /**
   * Execute a saved query by name
   * @param queryName Name of the saved query
   * @param timeRange Time range for the query
   * @returns Query results with statistics
   */
  public async executeSavedQuery(
    queryName: string,
    timeRange: TimeRange
  ): Promise<QueryResult> {
    // Check if query exists in saved queries or custom queries
    const savedQuery = SAVED_QUERIES[queryName] || this.customQueries.get(queryName);
    
    if (!savedQuery) {
      throw new Error(`Saved query not found: ${queryName}`);
    }

    return this.executeQuery(
      savedQuery.queryString,
      savedQuery.logGroupNames,
      timeRange
    );
  }

  /**
   * Create a new saved query
   * @param name Query name
   * @param query Query string in CloudWatch Logs Insights syntax
   * @param logGroups Log group names to query
   */
  public async createSavedQuery(
    name: string,
    query: string,
    logGroups: string[]
  ): Promise<void> {
    // Validate query name doesn't conflict with built-in queries
    if (SAVED_QUERIES[name]) {
      throw new Error(`Cannot override built-in query: ${name}`);
    }

    // Validate inputs
    if (!name || name.trim().length === 0) {
      throw new Error('Query name cannot be empty');
    }

    if (!query || query.trim().length === 0) {
      throw new Error('Query string cannot be empty');
    }

    if (!logGroups || logGroups.length === 0) {
      throw new Error('At least one log group must be specified');
    }

    // Store the custom query
    this.customQueries.set(name, {
      name,
      queryString: query.trim(),
      logGroupNames: logGroups,
    });
  }

  /**
   * List all available saved queries (built-in and custom)
   * @returns Array of saved queries
   */
  public async listSavedQueries(): Promise<SavedQuery[]> {
    const builtInQueries = Object.values(SAVED_QUERIES);
    const customQueries = Array.from(this.customQueries.values());
    
    return [...builtInQueries, ...customQueries];
  }

  /**
   * Execute a CloudWatch Logs Insights query
   * @param queryString Query string in CloudWatch Logs Insights syntax
   * @param logGroupNames Log group names to query
   * @param timeRange Time range for the query
   * @returns Query results with statistics
   */
  private async executeQuery(
    queryString: string,
    logGroupNames: string[],
    timeRange: TimeRange
  ): Promise<QueryResult> {
    // Start the query
    const startCommand = new StartQueryCommand({
      logGroupNames,
      queryString,
      startTime: Math.floor(timeRange.startTime.getTime() / 1000),
      endTime: Math.floor(timeRange.endTime.getTime() / 1000),
    });

    const startResponse = await this.client.send(startCommand);
    const queryId = startResponse.queryId;

    if (!queryId) {
      throw new Error('Failed to start query: no query ID returned');
    }

    // Poll for query results
    return this.pollQueryResults(queryId);
  }

  /**
   * Poll for query results until complete
   * @param queryId Query ID from StartQuery
   * @returns Query results with statistics
   */
  private async pollQueryResults(queryId: string): Promise<QueryResult> {
    const maxAttempts = 60; // 30 seconds max (500ms * 60)
    const pollInterval = 500; // 500ms

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const getCommand = new GetQueryResultsCommand({ queryId });
      const response = await this.client.send(getCommand);

      if (response.status === QueryStatus.Complete) {
        // Parse results
        const results: LogRecord[] = [];
        
        if (response.results) {
          for (const resultRow of response.results) {
            const record: LogRecord = {};
            
            for (const field of resultRow) {
              if (field.field && field.value !== undefined) {
                // Try to parse numeric values
                const numValue = Number(field.value);
                record[field.field] = isNaN(numValue) ? field.value : numValue;
              }
            }
            
            results.push(record);
          }
        }

        return {
          results,
          statistics: {
            recordsMatched: response.statistics?.recordsMatched || 0,
            recordsScanned: response.statistics?.recordsScanned || 0,
            bytesScanned: response.statistics?.bytesScanned || 0,
          },
        };
      }

      if (response.status === QueryStatus.Failed || response.status === QueryStatus.Cancelled) {
        throw new Error(`Query failed with status: ${response.status}`);
      }

      // Wait before next poll
      await this.sleep(pollInterval);
    }

    throw new Error('Query timeout: exceeded maximum wait time of 30 seconds');
  }

  /**
   * Sleep for specified milliseconds
   * @param ms Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a singleton instance for convenience
 */
export const logInsightsQueryManager = new LogInsightsQueryManager();
