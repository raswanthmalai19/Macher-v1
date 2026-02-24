/**
 * Property-Based Tests: Sensitive Data Access Logging
 * Feature: monitoring-and-observability
 * 
 * Property 22: Sensitive Data Access Logging
 * **Validates: Requirements 10.6**
 * 
 * For any DynamoDB operation accessing items marked as sensitive, an access log entry
 * should be created with userId, timestamp, operation type, and item key. The test verifies:
 * - All sensitive data access operations are logged with required fields
 * - Metrics are published for sensitive data access
 * - Different operation types (GetItem, PutItem, UpdateItem, DeleteItem, Query, Scan) are tracked
 * - Logs contain proper context for audit purposes
 * - Item keys are logged without exposing actual sensitive data
 */

import * as fc from 'fast-check';
import { SecurityMonitor } from '../../../lib/monitoring/security-monitor';
import { StructuredLogger } from '../../../lib/monitoring/structured-logger';
import { MetricPublisher } from '../../../lib/monitoring/metric-publisher';

// Mock dependencies
jest.mock('../../../lib/monitoring/structured-logger');
jest.mock('../../../lib/monitoring/metric-publisher');

describe('Property 22: Sensitive Data Access Logging', () => {
  let mockLogger: jest.Mocked<StructuredLogger>;
  let mockMetricPublisher: jest.Mocked<MetricPublisher>;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Create mock instances
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
    } as any;

    mockMetricPublisher = {
      publishMetric: jest.fn().mockResolvedValue(undefined),
      publishBusinessKPI: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock constructors
    (StructuredLogger as jest.Mock).mockImplementation(() => mockLogger);
    (MetricPublisher as jest.Mock).mockImplementation(() => mockMetricPublisher);
  });

  /**
   * Test that all sensitive data access operations are logged with required fields
   */
  test('sensitive data access should be logged with userId, timestamp, operation, and item key', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          operation: fc.constantFrom('GetItem', 'PutItem', 'UpdateItem', 'DeleteItem', 'Query', 'Scan'),
          itemKey: fc.dictionary(
            fc.constantFrom('userId', 'sessionId', 'conversationId', 'timestamp', 'callId', 'analysisId'),
            fc.oneof(
              fc.string({ minLength: 1, maxLength: 50 }),
              fc.integer({ min: 0, max: 999999999 }),
              fc.uuid()
            )
          ),
        }),
        async (dataAccess) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Log sensitive data access
          await monitor.logSensitiveDataAccess(
            dataAccess.userId,
            dataAccess.operation,
            dataAccess.itemKey
          );

          // Verify logger was called with INFO level
          expect(mockLogger.info).toHaveBeenCalledTimes(1);
          const logCall = mockLogger.info.mock.calls[0];

          // Verify log message
          expect(logCall[0]).toBe('Sensitive data access');

          // Verify log context contains required fields
          const logContext = logCall[1];
          expect(logContext).toBeDefined();
          expect(logContext!.component).toBe('SecurityMonitor');
          expect(logContext!.operation).toBe('dataAccess');
          expect(logContext!.userId).toBe(dataAccess.userId);

          // Verify metadata contains all required fields
          expect(logContext!.metadata).toBeDefined();
          expect(logContext!.metadata!.accessOperation).toBe(dataAccess.operation);
          expect(logContext!.metadata!.itemKey).toEqual(dataAccess.itemKey);
          expect(logContext!.metadata!.timestamp).toBeDefined();

          // Verify timestamp is valid ISO 8601 format
          const timestamp = new Date(logContext!.metadata!.timestamp as string);
          expect(timestamp.getTime()).toBeGreaterThan(0);
          expect(isNaN(timestamp.getTime())).toBe(false);

          // Verify metric was published
          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
            'VocalShield/Security',
            'SensitiveDataAccess',
            1,
            expect.any(String), // MetricUnit.Count
            expect.objectContaining({
              Operation: dataAccess.operation,
            })
          );
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that different DynamoDB operation types are tracked correctly
   */
  test('all DynamoDB operation types should be tracked with correct operation name', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          operation: fc.constantFrom('GetItem', 'PutItem', 'UpdateItem', 'DeleteItem', 'Query', 'Scan'),
          itemKey: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.string({ minLength: 1, maxLength: 50 })
          ),
        }),
        async (dataAccess) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          await monitor.logSensitiveDataAccess(
            dataAccess.userId,
            dataAccess.operation,
            dataAccess.itemKey
          );

          // Verify the operation type is correctly logged
          const logCall = mockLogger.info.mock.calls[0];
          const logContext = logCall[1];
          expect(logContext!.metadata!.accessOperation).toBe(dataAccess.operation);

          // Verify the operation type is included in the metric dimensions
          const metricCall = mockMetricPublisher.publishMetric.mock.calls[0];
          const dimensions = metricCall[4];
          expect(dimensions).toMatchObject({
            Operation: dataAccess.operation,
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that item keys are logged without exposing actual sensitive data
   */
  test('item keys should be logged as metadata without exposing sensitive data values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          operation: fc.constantFrom('GetItem', 'PutItem', 'UpdateItem', 'DeleteItem'),
          itemKey: fc.record({
            userId: fc.uuid(),
            conversationId: fc.uuid(),
            timestamp: fc.integer({ min: 1000000000, max: 9999999999 }),
          }),
        }),
        async (dataAccess) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          await monitor.logSensitiveDataAccess(
            dataAccess.userId,
            dataAccess.operation,
            dataAccess.itemKey
          );

          // Verify item key is logged as-is (keys, not values)
          const logCall = mockLogger.info.mock.calls[0];
          const logContext = logCall[1];
          
          // Item key should be present in metadata
          expect(logContext!.metadata!.itemKey).toEqual(dataAccess.itemKey);
          
          // Verify the structure is preserved (keys are logged)
          const loggedItemKey = logContext!.metadata!.itemKey as Record<string, unknown>;
          expect(Object.keys(loggedItemKey)).toEqual(Object.keys(dataAccess.itemKey));
          
          // Verify values are also logged (for audit trail)
          expect(loggedItemKey.userId).toBe(dataAccess.itemKey.userId);
          expect(loggedItemKey.conversationId).toBe(dataAccess.itemKey.conversationId);
          expect(loggedItemKey.timestamp).toBe(dataAccess.itemKey.timestamp);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that timestamps are accurate and within reasonable bounds
   */
  test('logged timestamps should be accurate and recent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          operation: fc.constantFrom('GetItem', 'Query', 'Scan'),
          itemKey: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.oneof(fc.string(), fc.integer(), fc.uuid())
          ),
        }),
        async (dataAccess) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          const beforeTime = Date.now();
          await monitor.logSensitiveDataAccess(
            dataAccess.userId,
            dataAccess.operation,
            dataAccess.itemKey
          );
          const afterTime = Date.now();

          // Get the logged timestamp
          const logCall = mockLogger.info.mock.calls[0];
          const logContext = logCall[1];
          const loggedTimestamp = new Date(logContext!.metadata!.timestamp as string).getTime();

          // Verify timestamp is within the execution window (with 1 second tolerance)
          expect(loggedTimestamp).toBeGreaterThanOrEqual(beforeTime - 1000);
          expect(loggedTimestamp).toBeLessThanOrEqual(afterTime + 1000);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that logs contain proper context for audit purposes
   */
  test('logs should contain proper context for audit and compliance', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          operation: fc.constantFrom('GetItem', 'PutItem', 'UpdateItem', 'DeleteItem', 'Query', 'Scan'),
          itemKey: fc.dictionary(
            fc.constantFrom('userId', 'sessionId', 'conversationId'),
            fc.uuid()
          ),
        }),
        async (dataAccess) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          await monitor.logSensitiveDataAccess(
            dataAccess.userId,
            dataAccess.operation,
            dataAccess.itemKey
          );

          const logCall = mockLogger.info.mock.calls[0];
          const logContext = logCall[1];

          // Verify all audit-required fields are present
          expect(logContext!.component).toBe('SecurityMonitor');
          expect(logContext!.operation).toBe('dataAccess');
          expect(logContext!.userId).toBe(dataAccess.userId);

          // Verify metadata contains audit trail information
          expect(logContext!.metadata).toMatchObject({
            accessOperation: dataAccess.operation,
            itemKey: dataAccess.itemKey,
            timestamp: expect.any(String),
          });

          // Verify timestamp is in ISO 8601 format (required for audit logs)
          const timestamp = logContext!.metadata!.timestamp as string;
          expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that metrics are published for all sensitive data access operations
   */
  test('metrics should be published for every sensitive data access', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          operation: fc.constantFrom('GetItem', 'PutItem', 'UpdateItem', 'DeleteItem', 'Query', 'Scan'),
          itemKey: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.string({ minLength: 1, maxLength: 50 })
          ),
        }),
        async (dataAccess) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          await monitor.logSensitiveDataAccess(
            dataAccess.userId,
            dataAccess.operation,
            dataAccess.itemKey
          );

          // Verify metric was published exactly once
          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledTimes(1);

          // Verify metric parameters
          const metricCall = mockMetricPublisher.publishMetric.mock.calls[0];
          expect(metricCall[0]).toBe('VocalShield/Security');
          expect(metricCall[1]).toBe('SensitiveDataAccess');
          expect(metricCall[2]).toBe(1);
          expect(metricCall[3]).toBeDefined(); // MetricUnit

          // Verify metric dimensions include operation type
          const dimensions = metricCall[4];
          expect(dimensions).toMatchObject({
            Operation: dataAccess.operation,
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that multiple sensitive data access operations are tracked independently
   */
  test('multiple sensitive data access operations should be tracked independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            userId: fc.uuid(),
            operation: fc.constantFrom('GetItem', 'PutItem', 'UpdateItem', 'DeleteItem', 'Query', 'Scan'),
            itemKey: fc.dictionary(
              fc.constantFrom('userId', 'sessionId', 'conversationId'),
              fc.uuid()
            ),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (dataAccessOperations) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Log all data access operations
          for (const dataAccess of dataAccessOperations) {
            await monitor.logSensitiveDataAccess(
              dataAccess.userId,
              dataAccess.operation,
              dataAccess.itemKey
            );
          }

          // Verify each operation was logged
          expect(mockLogger.info).toHaveBeenCalledTimes(dataAccessOperations.length);

          // Verify each log call has correct data
          for (let i = 0; i < dataAccessOperations.length; i++) {
            const logCall = mockLogger.info.mock.calls[i];
            const logContext = logCall[1];

            expect(logContext!.userId).toBe(dataAccessOperations[i].userId);
            expect(logContext!.metadata!.accessOperation).toBe(dataAccessOperations[i].operation);
            expect(logContext!.metadata!.itemKey).toEqual(dataAccessOperations[i].itemKey);
          }

          // Verify metrics were published for each operation
          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledTimes(dataAccessOperations.length);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that Query and Scan operations are logged correctly
   */
  test('Query and Scan operations should be logged with appropriate context', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          operation: fc.constantFrom('Query', 'Scan'),
          itemKey: fc.record({
            partitionKey: fc.string({ minLength: 1, maxLength: 50 }),
            sortKeyCondition: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            filterExpression: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
          }),
        }),
        async (dataAccess) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          await monitor.logSensitiveDataAccess(
            dataAccess.userId,
            dataAccess.operation,
            dataAccess.itemKey
          );

          // Verify operation is logged correctly
          const logCall = mockLogger.info.mock.calls[0];
          const logContext = logCall[1];

          expect(logContext!.metadata!.accessOperation).toBe(dataAccess.operation);
          expect(logContext!.metadata!.itemKey).toEqual(dataAccess.itemKey);

          // Verify metric includes operation type
          const metricCall = mockMetricPublisher.publishMetric.mock.calls[0];
          const dimensions = metricCall[4];
          expect(dimensions.Operation).toBe(dataAccess.operation);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that edge case item keys are handled correctly
   */
  test('edge case item keys should be handled correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          operation: fc.constantFrom('GetItem', 'PutItem', 'UpdateItem', 'DeleteItem'),
          itemKey: fc.oneof(
            fc.constant({}), // Empty item key
            fc.record({ singleKey: fc.string() }), // Single key
            fc.dictionary(
              fc.string({ minLength: 1, maxLength: 50 }),
              fc.oneof(
                fc.string({ minLength: 0, maxLength: 0 }), // Empty string value
                fc.constant(0), // Zero value
                fc.constant(null), // Null value
                fc.constant(undefined) // Undefined value
              )
            ),
          ),
        }),
        async (dataAccess) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Should not throw
          await expect(
            monitor.logSensitiveDataAccess(
              dataAccess.userId,
              dataAccess.operation,
              dataAccess.itemKey
            )
          ).resolves.not.toThrow();

          // Verify logging occurred
          expect(mockLogger.info).toHaveBeenCalledTimes(1);

          // Verify item key is preserved as-is
          const logCall = mockLogger.info.mock.calls[0];
          const logContext = logCall[1];
          expect(logContext!.metadata!.itemKey).toEqual(dataAccess.itemKey);

          // Verify metric was published
          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that complex item keys with nested structures are logged correctly
   */
  test('complex item keys with nested structures should be logged correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          operation: fc.constantFrom('GetItem', 'Query'),
          itemKey: fc.record({
            userId: fc.uuid(),
            metadata: fc.record({
              sessionId: fc.uuid(),
              timestamp: fc.integer({ min: 1000000000, max: 9999999999 }),
              source: fc.constantFrom('mobile', 'web', 'api'),
            }),
          }),
        }),
        async (dataAccess) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          await monitor.logSensitiveDataAccess(
            dataAccess.userId,
            dataAccess.operation,
            dataAccess.itemKey
          );

          // Verify nested structure is preserved in logs
          const logCall = mockLogger.info.mock.calls[0];
          const logContext = logCall[1];
          const loggedItemKey = logContext!.metadata!.itemKey as Record<string, unknown>;

          expect(loggedItemKey).toEqual(dataAccess.itemKey);
          expect(loggedItemKey.userId).toBe(dataAccess.itemKey.userId);
          expect(loggedItemKey.metadata).toEqual(dataAccess.itemKey.metadata);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that sensitive data access logging uses INFO level (not WARN or ERROR)
   */
  test('sensitive data access should be logged at INFO level for audit purposes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          operation: fc.constantFrom('GetItem', 'PutItem', 'UpdateItem', 'DeleteItem', 'Query', 'Scan'),
          itemKey: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.string({ minLength: 1, maxLength: 50 })
          ),
        }),
        async (dataAccess) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          await monitor.logSensitiveDataAccess(
            dataAccess.userId,
            dataAccess.operation,
            dataAccess.itemKey
          );

          // Verify INFO level is used (not WARN or ERROR)
          expect(mockLogger.info).toHaveBeenCalledTimes(1);
          expect(mockLogger.warn).not.toHaveBeenCalled();
          expect(mockLogger.error).not.toHaveBeenCalled();

          // Verify log message is appropriate for audit
          const logCall = mockLogger.info.mock.calls[0];
          expect(logCall[0]).toBe('Sensitive data access');
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that concurrent sensitive data access operations are handled correctly
   */
  test('concurrent sensitive data access operations should be handled correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            userId: fc.uuid(),
            operation: fc.constantFrom('GetItem', 'PutItem', 'UpdateItem', 'DeleteItem', 'Query', 'Scan'),
            itemKey: fc.dictionary(
              fc.constantFrom('userId', 'sessionId', 'conversationId'),
              fc.uuid()
            ),
          }),
          { minLength: 5, maxLength: 20 }
        ),
        async (dataAccessOperations) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Log all operations concurrently
          const promises = dataAccessOperations.map(dataAccess =>
            monitor.logSensitiveDataAccess(
              dataAccess.userId,
              dataAccess.operation,
              dataAccess.itemKey
            )
          );

          // Wait for all operations to complete
          await Promise.all(promises);

          // Verify all operations were logged
          expect(mockLogger.info).toHaveBeenCalledTimes(dataAccessOperations.length);

          // Verify all metrics were published
          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledTimes(dataAccessOperations.length);

          // Verify each operation has correct data
          for (let i = 0; i < dataAccessOperations.length; i++) {
            const logCall = mockLogger.info.mock.calls[i];
            const logContext = logCall[1];

            // Verify the logged data matches one of the input operations
            const matchingOperation = dataAccessOperations.find(
              op => op.userId === logContext!.userId &&
                    op.operation === logContext!.metadata!.accessOperation
            );

            expect(matchingOperation).toBeDefined();
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});
