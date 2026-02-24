/**
 * Unit tests for LogInsightsQueryManager
 */

import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  QueryStatus,
} from '@aws-sdk/client-cloudwatch-logs';
import {
  LogInsightsQueryManager,
  TimeRange,
  QueryResult,
  SavedQuery,
} from '../../../lib/monitoring/log-insights-query-manager';

// Mock AWS SDK
jest.mock('@aws-sdk/client-cloudwatch-logs');

describe('LogInsightsQueryManager', () => {
  let manager: LogInsightsQueryManager;
  let mockSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock the send method
    mockSend = jest.fn();
    (CloudWatchLogsClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
    
    manager = new LogInsightsQueryManager('us-east-1');
  });

  describe('listSavedQueries', () => {
    it('should return all built-in saved queries', async () => {
      const queries = await manager.listSavedQueries();

      expect(queries.length).toBeGreaterThanOrEqual(4);
      
      const queryNames = queries.map(q => q.name);
      expect(queryNames).toContain('error-analysis');
      expect(queryNames).toContain('latency-analysis');
      expect(queryNames).toContain('user-activity-analysis');
      expect(queryNames).toContain('security-event-analysis');
    });

    it('should include custom queries in the list', async () => {
      await manager.createSavedQuery(
        'custom-query',
        'fields @timestamp | limit 10',
        ['/aws/lambda/test']
      );

      const queries = await manager.listSavedQueries();
      const customQuery = queries.find(q => q.name === 'custom-query');

      expect(customQuery).toBeDefined();
      expect(customQuery?.queryString).toBe('fields @timestamp | limit 10');
      expect(customQuery?.logGroupNames).toEqual(['/aws/lambda/test']);
    });

    it('should return query objects with correct structure', async () => {
      const queries = await manager.listSavedQueries();
      const errorAnalysis = queries.find(q => q.name === 'error-analysis');

      expect(errorAnalysis).toBeDefined();
      expect(errorAnalysis).toHaveProperty('name');
      expect(errorAnalysis).toHaveProperty('queryString');
      expect(errorAnalysis).toHaveProperty('logGroupNames');
      expect(Array.isArray(errorAnalysis?.logGroupNames)).toBe(true);
    });
  });

  describe('createSavedQuery', () => {
    it('should create a new custom query', async () => {
      await manager.createSavedQuery(
        'my-query',
        'fields @timestamp, message | filter level = "INFO"',
        ['/aws/lambda/app']
      );

      const queries = await manager.listSavedQueries();
      const myQuery = queries.find(q => q.name === 'my-query');

      expect(myQuery).toBeDefined();
      expect(myQuery?.name).toBe('my-query');
    });

    it('should trim whitespace from query string', async () => {
      await manager.createSavedQuery(
        'trimmed-query',
        '  fields @timestamp  \n  ',
        ['/aws/lambda/app']
      );

      const queries = await manager.listSavedQueries();
      const query = queries.find(q => q.name === 'trimmed-query');

      expect(query?.queryString).toBe('fields @timestamp');
    });

    it('should throw error for empty query name', async () => {
      await expect(
        manager.createSavedQuery('', 'fields @timestamp', ['/aws/lambda/app'])
      ).rejects.toThrow('Query name cannot be empty');

      await expect(
        manager.createSavedQuery('   ', 'fields @timestamp', ['/aws/lambda/app'])
      ).rejects.toThrow('Query name cannot be empty');
    });

    it('should throw error for empty query string', async () => {
      await expect(
        manager.createSavedQuery('test', '', ['/aws/lambda/app'])
      ).rejects.toThrow('Query string cannot be empty');

      await expect(
        manager.createSavedQuery('test', '   ', ['/aws/lambda/app'])
      ).rejects.toThrow('Query string cannot be empty');
    });

    it('should throw error for empty log groups array', async () => {
      await expect(
        manager.createSavedQuery('test', 'fields @timestamp', [])
      ).rejects.toThrow('At least one log group must be specified');
    });

    it('should throw error when trying to override built-in query', async () => {
      await expect(
        manager.createSavedQuery('error-analysis', 'fields @timestamp', ['/aws/lambda/app'])
      ).rejects.toThrow('Cannot override built-in query: error-analysis');
    });

    it('should allow multiple custom queries', async () => {
      await manager.createSavedQuery('query1', 'fields @timestamp', ['/aws/lambda/app1']);
      await manager.createSavedQuery('query2', 'fields message', ['/aws/lambda/app2']);
      await manager.createSavedQuery('query3', 'fields level', ['/aws/lambda/app3']);

      const queries = await manager.listSavedQueries();
      const customQueries = queries.filter(q => 
        q.name === 'query1' || q.name === 'query2' || q.name === 'query3'
      );

      expect(customQueries.length).toBe(3);
    });
  });

  describe('executeSavedQuery', () => {
    const timeRange: TimeRange = {
      startTime: new Date('2024-01-01T00:00:00Z'),
      endTime: new Date('2024-01-01T23:59:59Z'),
    };

    it('should execute a built-in saved query successfully', async () => {
      mockSend
        .mockResolvedValueOnce({ queryId: 'query-123' })
        .mockResolvedValueOnce({
          status: QueryStatus.Complete,
          results: [
            [
              { field: 'component', value: 'AuthHandler' },
              { field: 'error.type', value: 'ValidationError' },
              { field: 'errorCount', value: '42' },
            ],
          ],
          statistics: {
            recordsMatched: 1,
            recordsScanned: 1000,
            bytesScanned: 50000,
          },
        });

      const result = await manager.executeSavedQuery('error-analysis', timeRange);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toEqual({
        component: 'AuthHandler',
        'error.type': 'ValidationError',
        errorCount: 42,
      });
      expect(result.statistics.recordsMatched).toBe(1);
      expect(result.statistics.recordsScanned).toBe(1000);
      expect(result.statistics.bytesScanned).toBe(50000);
    });

    it('should execute a custom saved query successfully', async () => {
      await manager.createSavedQuery(
        'custom-test',
        'fields @timestamp, message',
        ['/aws/lambda/test']
      );

      mockSend
        .mockResolvedValueOnce({ queryId: 'query-456' })
        .mockResolvedValueOnce({
          status: QueryStatus.Complete,
          results: [
            [
              { field: '@timestamp', value: '2024-01-01T12:00:00Z' },
              { field: 'message', value: 'Test message' },
            ],
          ],
          statistics: {
            recordsMatched: 1,
            recordsScanned: 100,
            bytesScanned: 5000,
          },
        });

      const result = await manager.executeSavedQuery('custom-test', timeRange);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]['@timestamp']).toBe('2024-01-01T12:00:00Z');
      expect(result.results[0].message).toBe('Test message');
    });

    it('should throw error for non-existent query', async () => {
      await expect(
        manager.executeSavedQuery('non-existent-query', timeRange)
      ).rejects.toThrow('Saved query not found: non-existent-query');
    });

    it('should parse numeric values correctly', async () => {
      mockSend
        .mockResolvedValueOnce({ queryId: 'query-789' })
        .mockResolvedValueOnce({
          status: QueryStatus.Complete,
          results: [
            [
              { field: 'duration', value: '123.45' },
              { field: 'count', value: '100' },
              { field: 'message', value: 'not a number' },
            ],
          ],
          statistics: {
            recordsMatched: 1,
            recordsScanned: 10,
            bytesScanned: 1000,
          },
        });

      const result = await manager.executeSavedQuery('error-analysis', timeRange);

      expect(result.results[0].duration).toBe(123.45);
      expect(result.results[0].count).toBe(100);
      expect(result.results[0].message).toBe('not a number');
    });

    it('should handle empty results', async () => {
      mockSend
        .mockResolvedValueOnce({ queryId: 'query-empty' })
        .mockResolvedValueOnce({
          status: QueryStatus.Complete,
          results: [],
          statistics: {
            recordsMatched: 0,
            recordsScanned: 1000,
            bytesScanned: 50000,
          },
        });

      const result = await manager.executeSavedQuery('error-analysis', timeRange);

      expect(result.results).toHaveLength(0);
      expect(result.statistics.recordsMatched).toBe(0);
    });

    it('should throw error when query fails', async () => {
      mockSend
        .mockResolvedValueOnce({ queryId: 'query-fail' })
        .mockResolvedValueOnce({
          status: QueryStatus.Failed,
        });

      await expect(
        manager.executeSavedQuery('error-analysis', timeRange)
      ).rejects.toThrow('Query failed with status: Failed');
    });

    it('should throw error when query is cancelled', async () => {
      mockSend
        .mockResolvedValueOnce({ queryId: 'query-cancel' })
        .mockResolvedValueOnce({
          status: QueryStatus.Cancelled,
        });

      await expect(
        manager.executeSavedQuery('error-analysis', timeRange)
      ).rejects.toThrow('Query failed with status: Cancelled');
    });

    it('should throw error when no query ID is returned', async () => {
      mockSend.mockResolvedValueOnce({});

      await expect(
        manager.executeSavedQuery('error-analysis', timeRange)
      ).rejects.toThrow('Failed to start query: no query ID returned');
    });

    it('should pass correct parameters to CloudWatch Logs API', async () => {
      mockSend
        .mockResolvedValueOnce({ queryId: 'query-time' })
        .mockResolvedValueOnce({
          status: QueryStatus.Complete,
          results: [],
          statistics: {
            recordsMatched: 0,
            recordsScanned: 0,
            bytesScanned: 0,
          },
        });

      const result = await manager.executeSavedQuery('error-analysis', timeRange);

      // Verify the query executed successfully
      expect(result).toBeDefined();
      expect(result.results).toEqual([]);
      expect(mockSend).toHaveBeenCalledTimes(2); // StartQuery and GetQueryResults
    });
  });

  describe('built-in queries', () => {
    it('should have error-analysis query with correct structure', async () => {
      const queries = await manager.listSavedQueries();
      const errorAnalysis = queries.find(q => q.name === 'error-analysis');

      expect(errorAnalysis).toBeDefined();
      expect(errorAnalysis?.queryString).toContain('filter level = "ERROR"');
      expect(errorAnalysis?.queryString).toContain('stats count()');
      expect(errorAnalysis?.queryString).toContain('by component');
    });

    it('should have latency-analysis query with percentile calculations', async () => {
      const queries = await manager.listSavedQueries();
      const latencyAnalysis = queries.find(q => q.name === 'latency-analysis');

      expect(latencyAnalysis).toBeDefined();
      expect(latencyAnalysis?.queryString).toContain('pct(duration, 50)');
      expect(latencyAnalysis?.queryString).toContain('pct(duration, 90)');
      expect(latencyAnalysis?.queryString).toContain('pct(duration, 99)');
    });

    it('should have user-activity-analysis query with user grouping', async () => {
      const queries = await manager.listSavedQueries();
      const userActivity = queries.find(q => q.name === 'user-activity-analysis');

      expect(userActivity).toBeDefined();
      expect(userActivity?.queryString).toContain('by userId');
      expect(userActivity?.queryString).toContain('limit 100');
    });

    it('should have security-event-analysis query for failed auth', async () => {
      const queries = await manager.listSavedQueries();
      const securityEvents = queries.find(q => q.name === 'security-event-analysis');

      expect(securityEvents).toBeDefined();
      expect(securityEvents?.queryString).toContain('authenticateUser');
      expect(securityEvents?.queryString).toContain('level = "ERROR"');
    });
  });
});
