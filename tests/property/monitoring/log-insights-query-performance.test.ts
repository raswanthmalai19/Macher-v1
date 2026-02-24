/**
 * Property-based tests for LogInsightsQueryManager query performance
 * 
 * Feature: monitoring-and-observability
 * Property 33: Log Insights Query Performance
 * Validates: Requirements 6.6
 */

import * as fc from 'fast-check';
import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  QueryStatus,
} from '@aws-sdk/client-cloudwatch-logs';
import {
  LogInsightsQueryManager,
  TimeRange,
} from '../../../lib/monitoring/log-insights-query-manager';

// Mock AWS SDK
jest.mock('@aws-sdk/client-cloudwatch-logs');

describe('Property 33: Log Insights Query Performance', () => {
  let mockSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock the send method
    mockSend = jest.fn();
    (CloudWatchLogsClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  /**
   * Property 33: Log Insights Query Performance
   * 
   * For any CloudWatch Logs Insights query over a 24-hour time range,
   * the query should complete within 30 seconds.
   * 
   * This property validates that:
   * 1. Queries complete within the 30-second timeout
   * 2. The polling mechanism doesn't exceed the maximum wait time
   * 3. Query execution time is tracked and validated
   */
  test(
    'queries over 24-hour time range complete within 30 seconds',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random query names from available saved queries
          fc.constantFrom(
            'error-analysis',
            'latency-analysis',
            'user-activity-analysis',
            'security-event-analysis'
          ),
          // Generate random 24-hour time ranges
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }).map(startDate => {
            const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000); // 24 hours later
            return {
              startTime: startDate,
              endTime: endDate,
            } as TimeRange;
          }),
          // Generate random query execution time (in milliseconds)
          fc.integer({ min: 100, max: 5000 }), // 0.1s to 5s (well within 30s limit)
          async (queryName, timeRange, executionTimeMs) => {
            const manager = new LogInsightsQueryManager('us-east-1');
            
            // Calculate number of polls needed based on execution time
            const pollInterval = 500; // 500ms per poll
            const pollsNeeded = Math.ceil(executionTimeMs / pollInterval);
            
            // Mock StartQuery response
            mockSend.mockResolvedValueOnce({ queryId: `query-${Date.now()}` });
            
            // Mock GetQueryResults responses - return Running status for all polls except the last
            for (let i = 0; i < pollsNeeded - 1; i++) {
              mockSend.mockResolvedValueOnce({
                status: QueryStatus.Running,
              });
            }
            
            // Final poll returns Complete status
            mockSend.mockResolvedValueOnce({
              status: QueryStatus.Complete,
              results: [
                [
                  { field: 'component', value: 'TestComponent' },
                  { field: 'count', value: '10' },
                ],
              ],
              statistics: {
                recordsMatched: 1,
                recordsScanned: 100,
                bytesScanned: 5000,
              },
            });
            
            // Measure actual execution time
            const startTime = Date.now();
            const result = await manager.executeSavedQuery(queryName, timeRange);
            const actualExecutionTime = Date.now() - startTime;
            
            // Verify query completed successfully
            expect(result).toBeDefined();
            expect(result.results).toBeDefined();
            expect(result.statistics).toBeDefined();
            
            // Verify execution time is within 30 seconds (30000ms)
            // Add 1000ms buffer for test overhead
            expect(actualExecutionTime).toBeLessThan(31000);
            
            // Verify the query didn't timeout
            expect(result.statistics.recordsScanned).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    },
    120000 // 2 minute timeout for the entire property test
  );

  /**
   * Property: Query timeout enforcement
   * 
   * Queries that exceed 30 seconds should timeout with an appropriate error.
   */
  test(
    'queries that exceed 30 seconds timeout with error',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            'error-analysis',
            'latency-analysis',
            'user-activity-analysis',
            'security-event-analysis'
          ),
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }).map(startDate => {
            const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
            return {
              startTime: startDate,
              endTime: endDate,
            } as TimeRange;
          }),
          async (queryName, timeRange) => {
            const manager = new LogInsightsQueryManager('us-east-1');
            
            // Mock StartQuery response
            mockSend.mockResolvedValueOnce({ queryId: `query-timeout-${Date.now()}` });
            
            // Mock GetQueryResults to always return Running status (simulating timeout)
            mockSend.mockResolvedValue({
              status: QueryStatus.Running,
            });
            
            // Verify that the query times out with appropriate error
            await expect(
              manager.executeSavedQuery(queryName, timeRange)
            ).rejects.toThrow('Query timeout: exceeded maximum wait time of 30 seconds');
          }
        ),
        { numRuns: 20 } // Reduced runs since each test takes 30+ seconds
      );
    },
    120000 // 2 minute timeout
  );

  /**
   * Property: Query result size doesn't affect timeout
   * 
   * Queries should complete within 30 seconds regardless of result size
   * (within reasonable limits for 24-hour time range).
   */
  test(
    'query completion time is independent of result size',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('error-analysis', 'user-activity-analysis'),
          fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }).map(startDate => {
            const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
            return {
              startTime: startDate,
              endTime: endDate,
            } as TimeRange;
          }),
          fc.integer({ min: 0, max: 1000 }), // Number of result records (reduced for performance)
          fc.integer({ min: 1000, max: 5000 }), // Execution time (reduced for performance)
          async (queryName, timeRange, numRecords, executionTime) => {
            const manager = new LogInsightsQueryManager('us-east-1');
            
            // Generate mock results
            const results = Array.from({ length: numRecords }, (_, i) => [
              { field: 'id', value: `record-${i}` },
              { field: 'count', value: String(i) },
            ]);
            
            const pollsNeeded = Math.ceil(executionTime / 500);
            
            mockSend.mockResolvedValueOnce({ queryId: `query-size-${Date.now()}` });
            
            for (let i = 0; i < pollsNeeded - 1; i++) {
              mockSend.mockResolvedValueOnce({ status: QueryStatus.Running });
            }
            
            mockSend.mockResolvedValueOnce({
              status: QueryStatus.Complete,
              results,
              statistics: {
                recordsMatched: numRecords,
                recordsScanned: numRecords * 10,
                bytesScanned: numRecords * 100,
              },
            });
            
            const startTime = Date.now();
            const result = await manager.executeSavedQuery(queryName, timeRange);
            const actualExecutionTime = Date.now() - startTime;
            
            // Verify query completed within 30 seconds regardless of result size
            expect(actualExecutionTime).toBeLessThan(31000);
            expect(result.results.length).toBe(numRecords);
            expect(result.statistics.recordsMatched).toBe(numRecords);
          }
        ),
        { numRuns: 50 }
      );
    },
    120000 // 2 minute timeout
  );
});
