"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.logInsightsQueryManager = exports.LogInsightsQueryManager = void 0;
const client_cloudwatch_logs_1 = require("@aws-sdk/client-cloudwatch-logs");
/**
 * Saved query definitions for common scenarios
 */
const SAVED_QUERIES = {
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
class LogInsightsQueryManager {
    /**
     * Create a new LogInsightsQueryManager
     * @param region AWS region (defaults to us-east-1)
     */
    constructor(region = 'us-east-1') {
        this.client = new client_cloudwatch_logs_1.CloudWatchLogsClient({ region });
        this.customQueries = new Map();
    }
    /**
     * Execute a saved query by name
     * @param queryName Name of the saved query
     * @param timeRange Time range for the query
     * @returns Query results with statistics
     */
    async executeSavedQuery(queryName, timeRange) {
        // Check if query exists in saved queries or custom queries
        const savedQuery = SAVED_QUERIES[queryName] || this.customQueries.get(queryName);
        if (!savedQuery) {
            throw new Error(`Saved query not found: ${queryName}`);
        }
        return this.executeQuery(savedQuery.queryString, savedQuery.logGroupNames, timeRange);
    }
    /**
     * Create a new saved query
     * @param name Query name
     * @param query Query string in CloudWatch Logs Insights syntax
     * @param logGroups Log group names to query
     */
    async createSavedQuery(name, query, logGroups) {
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
    async listSavedQueries() {
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
    async executeQuery(queryString, logGroupNames, timeRange) {
        // Start the query
        const startCommand = new client_cloudwatch_logs_1.StartQueryCommand({
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
    async pollQueryResults(queryId) {
        const maxAttempts = 60; // 30 seconds max (500ms * 60)
        const pollInterval = 500; // 500ms
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const getCommand = new client_cloudwatch_logs_1.GetQueryResultsCommand({ queryId });
            const response = await this.client.send(getCommand);
            if (response.status === client_cloudwatch_logs_1.QueryStatus.Complete) {
                // Parse results
                const results = [];
                if (response.results) {
                    for (const resultRow of response.results) {
                        const record = {};
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
            if (response.status === client_cloudwatch_logs_1.QueryStatus.Failed || response.status === client_cloudwatch_logs_1.QueryStatus.Cancelled) {
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
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.LogInsightsQueryManager = LogInsightsQueryManager;
/**
 * Create a singleton instance for convenience
 */
exports.logInsightsQueryManager = new LogInsightsQueryManager();
//# sourceMappingURL=log-insights-query-manager.js.map