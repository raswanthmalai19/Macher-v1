/**
 * Property Test: Log Insights Query Performance
 * Feature: monitoring-and-observability
 * Property 33: Log Insights Query Performance
 * 
 * Validates: Requirements 6.6
 * 
 * Property: For any CloudWatch Logs Insights query over a 24-hour time range,
 * the query should complete within 30 seconds.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import {
  LogInsightsQueryManager,
  TimeRange,
  QueryResult,
} from '../../../lib/monitoring/log-insights-query-manager';
import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  QueryStatus,
} from '@aws-sdk/client-cloudwatch-logs';

// Mock AWS SDK
vi.mock('@aws-sdk/client-cloudwatch-logs');

describe('Property 33: Log Insights Query Performance', () => {
  let manager: LogInsightsQueryManager;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSend = vi.fn();
    (CloudWatchLogsClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      send: mockSend,
    }));
    
    manager = new LogInsightsQueryManager({
      queryTimeout: 30000,
      pollInterval: 100,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should complete queries within 30 seconds for 24-hour time ranges', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random query parameters
        fc.record({
          queryName: fc.constantFrom('error-analysis', 'latency-analysis', 'user-activity', 'security-events'),
          endTime: fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }),
          recordCount: fc.integer({ min: 0, max: 10000 }),
          pollCycles: fc.integer({ min: 1, max: 10 }),
        }),
        async ({ queryName, endTime, recordCount, pollCycles }) => {
          // Calculate start time (24 hours before end time)
          const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
          const timeRange: TimeRange = { startTime, endTime };

          // Mock query ID
          const queryId = `query-${Date.now()}-${Math.random()}`;

          // Mock StartQueryCommand response
          mockSend.mockImplementationOnce(() =>
            Promise.resolve({ queryId })
          );

          // Mock GetQueryResultsCommand responses (simulate polling)
          for (let i = 0; i < pollCycles - 1; i++) {
            mockSend.mockImplementationOnce(() =>
              Promise.resolve({
                status: QueryStatus.Running,
                results: [],
              })
            );
          }

          // Final response with results
          const mockResults = Array.from({ length: recordCount }, (_, i) => [
            { field: '@timestamp', value: new Date().toISOString() },
            { field: 'component', value: `Component${i % 5}` },
            { field: 'count', value: String(Math.floor(Math.random() * 100)) },
          ]);

          mockSend.mockImplementationOnce(() =>
            Promise.resolve({
              status: QueryStatus.Complete,
              results: mockResults,
              statistics: {
                recordsMatched: recordCount,
                recordsScanned: recordCount * 2,
                bytesScanned: recordCount * 1024,
              },
            })
          );

          // Execute query and measure time
          const startExecution = Date.now();
          const result = await manager.executeSavedQuery(queryName, timeRange);
          const executionTime = Date.now() - startExecution;

          // Verify query completed within 30 seconds
          expect(executionTime).toBeLessThan(30000);

          // Verify result structure
          expect(result).toHaveProperty('results');
          expect(result).toHaveProperty('statistics');
          expect(Array.isArray(result.results)).toBe(true);
          expect(result.results.length).toBe(recordCount);
          expect(result.statistics.recordsMatched).toBe(recordCount);
          expect(result.statistics.recordsScanned).toBeGreaterThanOrEqual(recordCount);
          expect(result.statistics.bytesScanned).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle queries with varying result sizes efficiently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          resultSize: fc.integer({ min: 0, max: 10000 }),
          fieldCount: fc.integer({ min: 1, max: 20 }),
        }),
        async ({ resultSize, fieldCount }) => {
          const queryId = `query-${Date.now()}`;
          const timeRange: TimeRange = {
            startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
            endTime: new Date(),
          };

          // Mock responses
          mockSend.mockImplementationOnce(() => Promise.resolve({ queryId }));

          // Generate mock results with varying field counts
          const mockResults = Array.from({ length: resultSize }, (_, i) =>
            Array.from({ length: fieldCount }, (_, j) => ({
              field: `field${j}`,
              value: `value${i}-${j}`,
            }))
          );

          mockSend.mockImplementationOnce(() =>
            Promise.resolve({
              status: QueryStatus.Complete,
              results: mockResults,
              statistics: {
                recordsMatched: resultSize,
                recordsScanned: resultSize,
                bytesScanned: resultSize * fieldCount * 100,
              },
            })
          );

          const startTime = Date.now();
          const result = await manager.executeQuery(
            'fields @timestamp | limit 10000',
            ['/aws/lambda/test'],
            timeRange
          );
          const duration = Date.now() - startTime;

          // Should complete quickly (within timeout)
          expect(duration).toBeLessThan(30000);

          // Verify all results parsed correctly
          expect(result.results.length).toBe(resultSize);
          if (resultSize > 0) {
            expect(Object.keys(result.results[0]).length).toBe(fieldCount);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should timeout queries that exceed 30 seconds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const queryId = 'timeout-query';
          const timeRange: TimeRange = {
            startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
            endTime: new Date(),
          };

          // Mock start query
          mockSend.mockImplementationOnce(() => Promise.resolve({ queryId }));

          // Mock infinite running status (will cause timeout)
          mockSend.mockImplementation(() =>
            Promise.resolve({
              status: QueryStatus.Running,
              results: [],
            })
          );

          // Should throw timeout error
          await expect(
            manager.executeSavedQuery('error-analysis', timeRange)
          ).rejects.toThrow(/timeout/i);
        }
      ),
      { numRuns: 10 } // Fewer runs since this tests timeout behavior
    );
  });

  it('should handle concurrent queries efficiently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 10 }),
        async (concurrentQueries) => {
          const timeRange: TimeRange = {
            startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
            endTime: new Date(),
          };

          // Setup mocks for concurrent queries
          const queryPromises: Promise<QueryResult>[] = [];

          for (let i = 0; i < concurrentQueries; i++) {
            const queryId = `query-${i}`;

            // Mock start query
            mockSend.mockImplementationOnce(() => Promise.resolve({ queryId }));

            // Mock complete response
            mockSend.mockImplementationOnce(() =>
              Promise.resolve({
                status: QueryStatus.Complete,
                results: [[{ field: 'count', value: String(i) }]],
                statistics: {
                  recordsMatched: 1,
                  recordsScanned: 1,
                  bytesScanned: 100,
                },
              })
            );

            queryPromises.push(
              manager.executeSavedQuery('error-analysis', timeRange)
            );
          }

          const startTime = Date.now();
          const results = await Promise.all(queryPromises);
          const totalDuration = Date.now() - startTime;

          // All queries should complete
          expect(results.length).toBe(concurrentQueries);

          // Total time should be reasonable (concurrent execution)
          expect(totalDuration).toBeLessThan(30000);

          // Each result should be valid
          results.forEach((result) => {
            expect(result).toHaveProperty('results');
            expect(result).toHaveProperty('statistics');
          });
        }
      ),
      { numRuns: 50 }
    );
  });
});
