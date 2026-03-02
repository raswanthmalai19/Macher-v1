/**
 * Unit Tests: LogInsightsQueryManager
 * 
 * Tests query syntax validation, saved query management, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LogInsightsQueryManager,
  TimeRange,
  SavedQuery,
} from '../../../lib/monitoring/log-insights-query-manager';
import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  QueryStatus,
} from '@aws-sdk/client-cloudwatch-logs';

// Mock AWS SDK
vi.mock('@aws-sdk/client-cloudwatch-logs');

describe('LogInsightsQueryManager', () => {
  let manager: LogInsightsQueryManager;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSend = vi.fn();
    (CloudWatchLogsClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      send: mockSend,
    }));
    
    manager = new LogInsightsQueryManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Saved Queries', () => {
    it('should have pre-defined saved queries', () => {
      const queries = manager.listSavedQueries();
      
      expect(queries.length).toBeGreaterThan(0);
      expect(queries.some(q => q.name === 'error-analysis')).toBe(true);
      expect(queries.some(q => q.name === 'latency-analysis')).toBe(true);
      expect(queries.some(q => q.name === 'user-activity')).toBe(true);
      expect(queries.some(q => q.name === 'security-events')).toBe(true);
    });

    it('should return valid query strings for all saved queries', () => {
      const queries = manager.listSavedQueries();
      
      queries.forEach(query => {
        expect(query.queryString).toBeTruthy();
        expect(query.queryString.length).toBeGreaterThan(0);
        expect(query.logGroupNames).toBeTruthy();
        expect(query.logGroupNames.length).toBeGreaterThan(0);
      });
    });

    it('should have valid error-analysis query syntax', () => {
      const queries = manager.listSavedQueries();
      const errorQuery = queries.find(q => q.name === 'error-analysis');
      
      expect(errorQuery).toBeDefined();
      expect(errorQuery!.queryString).toContain('fields');
      expect(errorQuery!.queryString).toContain('filter');
      expect(errorQuery!.queryString).toContain('stats');
      expect(errorQuery!.queryString).toContain('ERROR');
    });

    it('should have valid latency-analysis query with percentiles', () => {
      const queries = manager.listSavedQueries();
      const latencyQuery = queries.find(q => q.name === 'latency-analysis');
      
      expect(latencyQuery).toBeDefined();
      expect(latencyQuery!.queryString).toContain('pct(duration, 50)');
      expect(latencyQuery!.queryString).toContain('pct(duration, 90)');
      expect(latencyQuery!.queryString).toContain('pct(duration, 99)');
    });

    it('should have valid user-activity query', () => {
      const queries = manager.listSavedQueries();
      const userQuery = queries.find(q => q.name === 'user-activity');
      
      expect(userQuery).toBeDefined();
      expect(userQuery!.queryString).toContain('userId');
      expect(userQuery!.queryString).toContain('stats count()');
    });

    it('should have valid security-events query', () => {
      const queries = manager.listSavedQueries();
      const securityQuery = queries.find(q => q.name === 'security-events');
      
      expect(securityQuery).toBeDefined();
      expect(securityQuery!.queryString).toContain('authenticate');
      expect(securityQuery!.queryString).toContain('ERROR');
    });

    it('should allow creating custom saved queries', () => {
      const customQuery = {
        name: 'custom-test',
        queryString: 'fields @timestamp | limit 10',
        logGroupNames: ['/aws/lambda/test'],
        description: 'Test query',
      };

      manager.createSavedQuery(
        customQuery.name,
        customQuery.queryString,
        customQuery.logGroupNames,
        customQuery.description
      );

      const queries = manager.listSavedQueries();
      const found = queries.find(q => q.name === 'custom-test');
      
      expect(found).toBeDefined();
      expect(found!.queryString).toBe(customQuery.queryString);
      expect(found!.logGroupNames).toEqual(customQuery.logGroupNames);
    });
  });

  describe('Query Execution', () => {
    it('should execute saved query successfully', async () => {
      const queryId = 'test-query-id';
      const timeRange: TimeRange = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-02T00:00:00Z'),
      };

      // Mock start query
      mockSend.mockImplementationOnce(() => Promise.resolve({ queryId }));

      // Mock get results
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          status: QueryStatus.Complete,
          results: [
            [
              { field: 'component', value: 'TestComponent' },
              { field: 'count', value: '42' },
            ],
          ],
          statistics: {
            recordsMatched: 1,
            recordsScanned: 100,
            bytesScanned: 1024,
          },
        })
      );

      const result = await manager.executeSavedQuery('error-analysis', timeRange);

      expect(result.results.length).toBe(1);
      expect(result.results[0].component).toBe('TestComponent');
      expect(result.results[0].count).toBe(42); // Should parse as number
      expect(result.statistics.recordsMatched).toBe(1);
    });

    it('should throw error for non-existent saved query', async () => {
      const timeRange: TimeRange = {
        startTime: new Date(),
        endTime: new Date(),
      };

      await expect(
        manager.executeSavedQuery('non-existent-query', timeRange)
      ).rejects.toThrow('Saved query not found');
    });

    it('should handle query with no results', async () => {
      const queryId = 'empty-query';
      const timeRange: TimeRange = {
        startTime: new Date(),
        endTime: new Date(),
      };

      mockSend.mockImplementationOnce(() => Promise.resolve({ queryId }));
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          status: QueryStatus.Complete,
          results: [],
          statistics: {
            recordsMatched: 0,
            recordsScanned: 0,
            bytesScanned: 0,
          },
        })
      );

      const result = await manager.executeSavedQuery('error-analysis', timeRange);

      expect(result.results.length).toBe(0);
      expect(result.statistics.recordsMatched).toBe(0);
    });

    it('should parse numeric values correctly', async () => {
      const queryId = 'numeric-query';
      const timeRange: TimeRange = {
        startTime: new Date(),
        endTime: new Date(),
      };

      mockSend.mockImplementationOnce(() => Promise.resolve({ queryId }));
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          status: QueryStatus.Complete,
          results: [
            [
              { field: 'count', value: '123' },
              { field: 'duration', value: '456.78' },
              { field: 'name', value: 'test' },
            ],
          ],
          statistics: {
            recordsMatched: 1,
            recordsScanned: 1,
            bytesScanned: 100,
          },
        })
      );

      const result = await manager.executeQuery(
        'fields count, duration, name',
        ['/aws/lambda/test'],
        timeRange
      );

      expect(result.results[0].count).toBe(123);
      expect(result.results[0].duration).toBe(456.78);
      expect(result.results[0].name).toBe('test');
    });

    it('should handle failed query status', async () => {
      const queryId = 'failed-query';
      const timeRange: TimeRange = {
        startTime: new Date(),
        endTime: new Date(),
      };

      mockSend.mockImplementationOnce(() => Promise.resolve({ queryId }));
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          status: QueryStatus.Failed,
        })
      );

      await expect(
        manager.executeSavedQuery('error-analysis', timeRange)
      ).rejects.toThrow(/failed/i);
    });

    it('should handle cancelled query status', async () => {
      const queryId = 'cancelled-query';
      const timeRange: TimeRange = {
        startTime: new Date(),
        endTime: new Date(),
      };

      mockSend.mockImplementationOnce(() => Promise.resolve({ queryId }));
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          status: QueryStatus.Cancelled,
        })
      );

      await expect(
        manager.executeSavedQuery('error-analysis', timeRange)
      ).rejects.toThrow(/cancelled/i);
    });

    it('should handle missing queryId in start response', async () => {
      const timeRange: TimeRange = {
        startTime: new Date(),
        endTime: new Date(),
      };

      mockSend.mockImplementationOnce(() => Promise.resolve({}));

      await expect(
        manager.executeSavedQuery('error-analysis', timeRange)
      ).rejects.toThrow(/no queryId/i);
    });
  });

  describe('Time Range Handling', () => {
    it('should convert time range to Unix timestamps', async () => {
      const queryId = 'time-test';
      const timeRange: TimeRange = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-02T00:00:00Z'),
      };

      mockSend.mockImplementationOnce((command) => {
        expect(command.input.startTime).toBe(Math.floor(timeRange.startTime.getTime() / 1000));
        expect(command.input.endTime).toBe(Math.floor(timeRange.endTime.getTime() / 1000));
        return Promise.resolve({ queryId });
      });

      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          status: QueryStatus.Complete,
          results: [],
          statistics: { recordsMatched: 0, recordsScanned: 0, bytesScanned: 0 },
        })
      );

      await manager.executeSavedQuery('error-analysis', timeRange);
    });
  });
});
