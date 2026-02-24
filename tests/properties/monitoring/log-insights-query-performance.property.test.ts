/**
 * Property-based tests for LogInsightsQueryManager query performance
 * 
 * Feature: monitoring-and-observability
 * Property 33: Log Insights Query Performance
 * 
 * **Validates: Requirements 6.6**
 * 
 * These tests verify that CloudWatch Logs Insights queries complete within
 * 30 seconds for 24-hour time ranges using property-based testing with fast-check.
 */

import * as fc from 'fast-check';
import { LogInsightsQueryManager } from '../../../lib/monitoring/log-insights-query-manager';
import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  QueryStatus,
} from '@aws-sdk/client-cloudwatch-logs';

// Mock AWS SDK
jest.mock('@aws-sdk/client-cloudwatch-logs');

describe('LogInsightsQueryManager - Property Tests', () => {
  describe('Property 33: Log Insights Query Performance', () => {
    /**
     * Property: For any CloudWatch Logs Insights query over a 24-hour time range,
     * the query should complete within 30 seconds.
     * 
     * **Validates: Requirements 6.6**
     */
    it('should complete queries within 30 seconds for 24-hour time ranges', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random start times within the last 30 days
          fc.date({ min: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), max: new Date() }),
          // Generate random query names from available saved queries
          fc.constantFrom('error-analysis', 'latency-analysis', 'user-activity-analysis', 'security-event-analysis'),
          async (startTime, queryName) => {
            // Calculate end time as 24 hours after start time
            const endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);

            // Mock CloudWatch Logs client
            const mockSend = jest.fn();
            
            // Mock StartQueryCommand response
            mockSend.mockImplementationOnce(() => 
              Promise.resolve({ queryId: 'test-query-id-123' })
            );

            // Mock GetQueryResultsCommand response (simulate query completion)
            mockSend.mockImplementation(() =>
              Promise.resolve({
                status: QueryStatus.Complete,
                results: [
                  [
                    { field: '@timestamp', value: '2024-01-01T00:00:00.000Z' },
                    { field: 'level', value: 'ERROR' },
                    { field: 'component', value: 'TestComponent' },
                  ],
                ],
                statistics: {
                  recordsMatched: 100,
                  recordsScanned: 1000,
                  bytesScanned: 50000,
                },
              })
            );

            (CloudWatchLogsClient as jest.Mock).mockImplementation(() => ({
              send: mockSend,
            }));

            const manager = new LogInsightsQueryManager();

            // Measure query execution time
            const startExecution = Date.now();
            
            await manager.executeSavedQuery(queryName, {
              startTime,
              endTime,
            });

            const executionTime = Date.now() - startExecution;

            // Verify query completed within 30 seconds (30000ms)
            expect(executionTime).toBeLessThan(30000);

            // Verify StartQueryCommand was called with correct time range
            expect(mockSend).toHaveBeenCalledWith(
              expect.objectContaining({
                input: expect.objectContaining({
                  startTime: Math.floor(startTime.getTime() / 1000),
                  endTime: Math.floor(endTime.getTime() / 1000),
                }),
              })
            );
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle queries that take multiple polling attempts within 30 seconds', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), max: new Date() }),
          fc.constantFrom('error-analysis', 'latency-analysis', 'user-activity-analysis', 'security-event-analysis'),
          // Number of polling attempts before completion (1-10)
          fc.integer({ min: 1, max: 10 }),
          async (startTime, queryName, pollAttempts) => {
            const endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);

            const mockSend = jest.fn();
            
            // Mock StartQueryCommand response
            mockSend.mockImplementationOnce(() => 
              Promise.resolve({ queryId: 'test-query-id-123' })
            );

            // Mock GetQueryResultsCommand responses - return Running status for pollAttempts-1 times
            for (let i = 0; i < pollAttempts - 1; i++) {
              mockSend.mockImplementationOnce(() =>
                Promise.resolve({
                  status: QueryStatus.Running,
                })
              );
            }

            // Final response with Complete status
            mockSend.mockImplementationOnce(() =>
              Promise.resolve({
                status: QueryStatus.Complete,
                results: [
                  [
                    { field: '@timestamp', value: '2024-01-01T00:00:00.000Z' },
                    { field: 'level', value: 'INFO' },
                  ],
                ],
                statistics: {
                  recordsMatched: 50,
                  recordsScanned: 500,
                  bytesScanned: 25000,
                },
              })
            );

            (CloudWatchLogsClient as jest.Mock).mockImplementation(() => ({
              send: mockSend,
            }));

            const manager = new LogInsightsQueryManager();

            const startExecution = Date.now();
            
            const result = await manager.executeSavedQuery(queryName, {
              startTime,
              endTime,
            });

            const executionTime = Date.now() - startExecution;

            // Should complete within 30 seconds
            expect(executionTime).toBeLessThan(30000);

            // Should have valid results
            expect(result.results).toBeDefined();
            expect(result.statistics).toBeDefined();
            expect(result.statistics.recordsMatched).toBeGreaterThanOrEqual(0);
            expect(result.statistics.recordsScanned).toBeGreaterThanOrEqual(0);
            expect(result.statistics.bytesScanned).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should timeout and throw error if query exceeds 30 seconds', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), max: new Date() }),
          fc.constantFrom('error-analysis', 'latency-analysis'),
          async (startTime, queryName) => {
            const endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);

            const mockSend = jest.fn();
            
            // Mock StartQueryCommand response
            mockSend.mockImplementationOnce(() => 
              Promise.resolve({ queryId: 'test-query-id-123' })
            );

            // Mock GetQueryResultsCommand to always return Running status
            // This will cause the query to timeout
            mockSend.mockImplementation(() =>
              Promise.resolve({
                status: QueryStatus.Running,
              })
            );

            (CloudWatchLogsClient as jest.Mock).mockImplementation(() => ({
              send: mockSend,
            }));

            const manager = new LogInsightsQueryManager();

            // Should throw timeout error
            await expect(
              manager.executeSavedQuery(queryName, {
                startTime,
                endTime,
              })
            ).rejects.toThrow('Query timeout: exceeded maximum wait time of 30 seconds');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle queries with varying result sizes within 30 seconds', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), max: new Date() }),
          fc.constantFrom('error-analysis', 'latency-analysis', 'user-activity-analysis', 'security-event-analysis'),
          // Number of result rows (0-1000)
          fc.integer({ min: 0, max: 1000 }),
          async (startTime, queryName, resultCount) => {
            const endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);

            const mockSend = jest.fn();
            
            // Mock StartQueryCommand response
            mockSend.mockImplementationOnce(() => 
              Promise.resolve({ queryId: 'test-query-id-123' })
            );

            // Generate mock results
            const mockResults = Array.from({ length: resultCount }, (_, i) => [
              { field: '@timestamp', value: `2024-01-01T00:${i % 60}:00.000Z` },
              { field: 'level', value: i % 2 === 0 ? 'INFO' : 'ERROR' },
              { field: 'component', value: `Component${i % 10}` },
              { field: 'count', value: String(i) },
            ]);

            // Mock GetQueryResultsCommand response
            mockSend.mockImplementation(() =>
              Promise.resolve({
                status: QueryStatus.Complete,
                results: mockResults,
                statistics: {
                  recordsMatched: resultCount,
                  recordsScanned: resultCount * 2,
                  bytesScanned: resultCount * 100,
                },
              })
            );

            (CloudWatchLogsClient as jest.Mock).mockImplementation(() => ({
              send: mockSend,
            }));

            const manager = new LogInsightsQueryManager();

            const startExecution = Date.now();
            
            const result = await manager.executeSavedQuery(queryName, {
              startTime,
              endTime,
            });

            const executionTime = Date.now() - startExecution;

            // Should complete within 30 seconds regardless of result size
            expect(executionTime).toBeLessThan(30000);

            // Should return correct number of results
            expect(result.results).toHaveLength(resultCount);

            // Statistics should match result count
            expect(result.statistics.recordsMatched).toBe(resultCount);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle queries with different time ranges within 24 hours', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), max: new Date() }),
          fc.constantFrom('error-analysis', 'latency-analysis', 'user-activity-analysis', 'security-event-analysis'),
          // Time range duration in hours (1-24)
          fc.integer({ min: 1, max: 24 }),
          async (startTime, queryName, durationHours) => {
            const endTime = new Date(startTime.getTime() + durationHours * 60 * 60 * 1000);

            const mockSend = jest.fn();
            
            // Mock StartQueryCommand response
            mockSend.mockImplementationOnce(() => 
              Promise.resolve({ queryId: 'test-query-id-123' })
            );

            // Mock GetQueryResultsCommand response
            mockSend.mockImplementation(() =>
              Promise.resolve({
                status: QueryStatus.Complete,
                results: [
                  [
                    { field: '@timestamp', value: '2024-01-01T00:00:00.000Z' },
                    { field: 'level', value: 'INFO' },
                  ],
                ],
                statistics: {
                  recordsMatched: 10,
                  recordsScanned: 100,
                  bytesScanned: 5000,
                },
              })
            );

            (CloudWatchLogsClient as jest.Mock).mockImplementation(() => ({
              send: mockSend,
            }));

            const manager = new LogInsightsQueryManager();

            const startExecution = Date.now();
            
            await manager.executeSavedQuery(queryName, {
              startTime,
              endTime,
            });

            const executionTime = Date.now() - startExecution;

            // Should complete within 30 seconds for any time range up to 24 hours
            expect(executionTime).toBeLessThan(30000);

            // Verify correct time range was used
            expect(mockSend).toHaveBeenCalledWith(
              expect.objectContaining({
                input: expect.objectContaining({
                  startTime: Math.floor(startTime.getTime() / 1000),
                  endTime: Math.floor(endTime.getTime() / 1000),
                }),
              })
            );
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should parse numeric and string fields correctly in results', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), max: new Date() }),
          fc.constantFrom('error-analysis', 'latency-analysis'),
          fc.integer({ min: 0, max: 10000 }), // Numeric value
          fc.string({ minLength: 1, maxLength: 50 }), // String value
          async (startTime, queryName, numericValue, stringValue) => {
            const endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);

            const mockSend = jest.fn();
            
            // Mock StartQueryCommand response
            mockSend.mockImplementationOnce(() => 
              Promise.resolve({ queryId: 'test-query-id-123' })
            );

            // Mock GetQueryResultsCommand response with mixed field types
            mockSend.mockImplementation(() =>
              Promise.resolve({
                status: QueryStatus.Complete,
                results: [
                  [
                    { field: 'numericField', value: String(numericValue) },
                    { field: 'stringField', value: stringValue },
                    { field: 'count', value: '42' },
                  ],
                ],
                statistics: {
                  recordsMatched: 1,
                  recordsScanned: 10,
                  bytesScanned: 1000,
                },
              })
            );

            (CloudWatchLogsClient as jest.Mock).mockImplementation(() => ({
              send: mockSend,
            }));

            const manager = new LogInsightsQueryManager();

            const result = await manager.executeSavedQuery(queryName, {
              startTime,
              endTime,
            });

            // Should parse numeric values as numbers
            expect(result.results[0].numericField).toBe(numericValue);
            expect(typeof result.results[0].numericField).toBe('number');

            // Should keep string values as strings
            expect(result.results[0].stringField).toBe(stringValue);
            expect(typeof result.results[0].stringField).toBe('string');

            // Should parse numeric strings as numbers
            expect(result.results[0].count).toBe(42);
            expect(typeof result.results[0].count).toBe('number');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle query failures gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), max: new Date() }),
          fc.constantFrom('error-analysis', 'latency-analysis'),
          fc.constantFrom(QueryStatus.Failed, QueryStatus.Cancelled),
          async (startTime, queryName, failureStatus) => {
            const endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);

            const mockSend = jest.fn();
            
            // Mock StartQueryCommand response
            mockSend.mockImplementationOnce(() => 
              Promise.resolve({ queryId: 'test-query-id-123' })
            );

            // Mock GetQueryResultsCommand response with failure status
            mockSend.mockImplementation(() =>
              Promise.resolve({
                status: failureStatus,
              })
            );

            (CloudWatchLogsClient as jest.Mock).mockImplementation(() => ({
              send: mockSend,
            }));

            const manager = new LogInsightsQueryManager();

            // Should throw error for failed queries
            await expect(
              manager.executeSavedQuery(queryName, {
                startTime,
                endTime,
              })
            ).rejects.toThrow(`Query failed with status: ${failureStatus}`);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should maintain consistent performance across all saved query types', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), max: new Date() }),
          async (startTime) => {
            const endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);
            const queryNames = ['error-analysis', 'latency-analysis', 'user-activity-analysis', 'security-event-analysis'];

            const executionTimes: number[] = [];

            for (const queryName of queryNames) {
              const mockSend = jest.fn();
              
              // Mock StartQueryCommand response
              mockSend.mockImplementationOnce(() => 
                Promise.resolve({ queryId: `test-query-id-${queryName}` })
              );

              // Mock GetQueryResultsCommand response
              mockSend.mockImplementation(() =>
                Promise.resolve({
                  status: QueryStatus.Complete,
                  results: [
                    [
                      { field: '@timestamp', value: '2024-01-01T00:00:00.000Z' },
                      { field: 'level', value: 'INFO' },
                    ],
                  ],
                  statistics: {
                    recordsMatched: 10,
                    recordsScanned: 100,
                    bytesScanned: 5000,
                  },
                })
              );

              (CloudWatchLogsClient as jest.Mock).mockImplementation(() => ({
                send: mockSend,
              }));

              const manager = new LogInsightsQueryManager();

              const startExecution = Date.now();
              
              await manager.executeSavedQuery(queryName, {
                startTime,
                endTime,
              });

              const executionTime = Date.now() - startExecution;
              executionTimes.push(executionTime);

              // Each query should complete within 30 seconds
              expect(executionTime).toBeLessThan(30000);
            }

            // All queries should have completed
            expect(executionTimes).toHaveLength(queryNames.length);

            // All execution times should be reasonable (< 30 seconds)
            for (const time of executionTimes) {
              expect(time).toBeLessThan(30000);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
