/**
 * Property-based tests for ErrorTracker
 * 
 * Feature: monitoring-and-observability
 * 
 * These tests validate universal correctness properties for error tracking
 * across randomized inputs.
 */

import * as fc from 'fast-check';
import { ErrorTracker, ErrorCategory } from '../../../lib/monitoring/error-tracker';
import { StructuredLogger } from '../../../lib/monitoring/structured-logger';
import { MetricPublisher } from '../../../lib/monitoring/metric-publisher';
import { MetricUnit } from '../../../lib/monitoring/types';

// Mock dependencies
jest.mock('../../../lib/monitoring/structured-logger');
jest.mock('../../../lib/monitoring/metric-publisher');

describe('ErrorTracker - Property-Based Tests', () => {
  let mockLogger: jest.Mocked<StructuredLogger>;
  let mockMetricPublisher: jest.Mocked<MetricPublisher>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = new StructuredLogger() as jest.Mocked<StructuredLogger>;
    mockMetricPublisher = new MetricPublisher() as jest.Mocked<MetricPublisher>;
    mockLogger.error = jest.fn();
    mockLogger.warn = jest.fn();
    mockMetricPublisher.publishMetric = jest.fn().mockResolvedValue(undefined);
  });

  /**
   * Property 14: Error Logging Completeness
   * 
   * For any error occurring in any component (Lambda exception, API Gateway failure,
   * DynamoDB operation failure), a structured log entry should be created containing
   * error message, stack trace (for exceptions), component name, operation name, and context.
   * 
   * **Validates: Requirements 8.1, 8.2, 8.3**
   */
  describe('Property 14: Error Logging Completeness', () => {
    it('should log all errors with complete context information', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
            component: fc.string({ minLength: 1, maxLength: 50 }),
            operation: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            requestId: fc.option(fc.uuid()),
            userId: fc.option(fc.uuid()),
            metadata: fc.option(fc.dictionary(fc.string(), fc.string())),
          }),
          async (testData) => {
            // Clear mocks for this iteration
            jest.clearAllMocks();
            
            const errorTracker = new ErrorTracker(mockLogger, mockMetricPublisher);
            const error = new Error(testData.errorMessage);

            const context = {
              component: testData.component,
              operation: testData.operation || undefined,
              requestId: testData.requestId || undefined,
              userId: testData.userId || undefined,
              metadata: testData.metadata || undefined,
            };

            await errorTracker.trackError(error, context);

            // Verify logger.error was called
            expect(mockLogger.error).toHaveBeenCalledTimes(1);

            // Verify the call includes error message
            const loggerCall = mockLogger.error.mock.calls[0];
            expect(loggerCall[0]).toBe(testData.errorMessage);

            // Verify the call includes the error object
            expect(loggerCall[1]).toBe(error);

            // Verify the call includes context with component
            const logContext = loggerCall[2];
            expect(logContext).toBeDefined();
            expect(logContext).toHaveProperty('component', testData.component);

            // Verify optional fields are included when present
            if (testData.operation) {
              expect(logContext).toHaveProperty('operation', testData.operation);
            }
            if (testData.requestId) {
              expect(logContext).toHaveProperty('requestId', testData.requestId);
            }
            if (testData.userId) {
              expect(logContext).toHaveProperty('userId', testData.userId);
            }

            // Verify metadata includes error category
            expect(logContext).toHaveProperty('metadata');
            if (logContext && logContext.metadata) {
              expect(logContext.metadata).toBeDefined();
              expect(logContext.metadata).toHaveProperty('errorCategory');
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should log Lambda errors with function-specific context', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
            component: fc.string({ minLength: 1, maxLength: 50 }),
            functionName: fc.string({ minLength: 1, maxLength: 50 }),
            functionVersion: fc.constantFrom('$LATEST', '1', '2', '3'),
            requestId: fc.uuid(),
          }),
          async (testData) => {
            // Clear mocks for this iteration
            jest.clearAllMocks();
            
            const errorTracker = new ErrorTracker(mockLogger, mockMetricPublisher);
            const error = new Error(testData.errorMessage);

            await errorTracker.trackLambdaError(error, {
              component: testData.component,
              functionName: testData.functionName,
              functionVersion: testData.functionVersion,
              requestId: testData.requestId,
            });

            expect(mockLogger.error).toHaveBeenCalledTimes(1);

            const logContext = mockLogger.error.mock.calls[0][2];
            expect(logContext).toBeDefined();
            if (logContext && logContext.metadata) {
              expect(logContext.metadata).toBeDefined();
              expect(logContext.metadata).toHaveProperty('functionName', testData.functionName);
              expect(logContext.metadata).toHaveProperty('functionVersion', testData.functionVersion);
            }
            expect(logContext).toHaveProperty('requestId', testData.requestId);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should log API Gateway errors with request details and response code', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
            component: fc.string({ minLength: 1, maxLength: 50 }),
            requestPath: fc.constantFrom('/api/analyze', '/api/connect', '/api/disconnect'),
            httpMethod: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
            statusCode: fc.integer({ min: 400, max: 599 }),
          }),
          async (testData) => {
            // Clear mocks for this iteration
            jest.clearAllMocks();
            
            const errorTracker = new ErrorTracker(mockLogger, mockMetricPublisher);
            const error = new Error(testData.errorMessage);

            await errorTracker.trackAPIGatewayError(error, {
              component: testData.component,
              requestPath: testData.requestPath,
              httpMethod: testData.httpMethod,
              statusCode: testData.statusCode,
            });

            expect(mockLogger.error).toHaveBeenCalledTimes(1);

            const logContext = mockLogger.error.mock.calls[0][2];
            expect(logContext).toBeDefined();
            if (logContext && logContext.metadata) {
              expect(logContext.metadata).toBeDefined();
              expect(logContext.metadata).toHaveProperty('requestPath', testData.requestPath);
              expect(logContext.metadata).toHaveProperty('httpMethod', testData.httpMethod);
              expect(logContext.metadata).toHaveProperty('statusCode', testData.statusCode);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should log DynamoDB errors with operation type and item key', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
            component: fc.string({ minLength: 1, maxLength: 50 }),
            tableName: fc.constantFrom('VocalShield-Users', 'VocalShield-Sessions', 'VocalShield-Calls'),
            operationType: fc.constantFrom('GetItem', 'PutItem', 'UpdateItem', 'DeleteItem', 'Query', 'Scan'),
            itemKey: fc.dictionary(fc.string(), fc.string()),
          }),
          async (testData) => {
            // Clear mocks for this iteration
            jest.clearAllMocks();
            
            const errorTracker = new ErrorTracker(mockLogger, mockMetricPublisher);
            const error = new Error(testData.errorMessage);

            await errorTracker.trackDynamoDBError(error, {
              component: testData.component,
              tableName: testData.tableName,
              operationType: testData.operationType as any,
              itemKey: testData.itemKey,
            });

            expect(mockLogger.error).toHaveBeenCalledTimes(1);

            const logContext = mockLogger.error.mock.calls[0][2];
            expect(logContext).toBeDefined();
            if (logContext && logContext.metadata) {
              expect(logContext.metadata).toBeDefined();
              expect(logContext.metadata).toHaveProperty('tableName', testData.tableName);
              expect(logContext.metadata).toHaveProperty('operationType', testData.operationType);
              expect(logContext.metadata).toHaveProperty('itemKey', testData.itemKey);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 15: Error Categorization
   * 
   * For any error logged by the system, it should be assigned to exactly one error
   * category (validation, authentication, service, timeout, throttling) and a metric
   * should be published for that category.
   * 
   * **Validates: Requirements 8.4, 8.5**
   */
  describe('Property 15: Error Categorization', () => {
    it('should assign exactly one category to every error', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
            component: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          async (testData) => {
            // Clear mocks for this iteration
            jest.clearAllMocks();
            
            const errorTracker = new ErrorTracker(mockLogger, mockMetricPublisher);
            const error = new Error(testData.errorMessage);

            const category = errorTracker.getErrorCategory(error);

            // Verify category is one of the valid categories
            expect(Object.values(ErrorCategory)).toContain(category);

            // Verify it's exactly one category (not undefined, not multiple)
            expect(category).toBeDefined();
            expect(typeof category).toBe('string');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should publish metrics with the assigned category', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
            component: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          async (testData) => {
            // Clear mocks for this iteration
            jest.clearAllMocks();
            
            const errorTracker = new ErrorTracker(mockLogger, mockMetricPublisher);
            const error = new Error(testData.errorMessage);

            await errorTracker.trackError(error, {
              component: testData.component,
            });

            // Verify ErrorCount metric was published with category dimension
            const errorCountCalls = mockMetricPublisher.publishMetric.mock.calls.filter(
              call => call[1] === 'ErrorCount'
            );
            expect(errorCountCalls.length).toBeGreaterThan(0);

            const errorCountCall = errorCountCalls[0];
            expect(errorCountCall[0]).toBe('VocalShield/Errors');
            expect(errorCountCall[2]).toBe(1);
            expect(errorCountCall[3]).toBe(MetricUnit.Count);
            expect(errorCountCall[4]).toHaveProperty('Category');
            expect(errorCountCall[4]).toHaveProperty('Component', testData.component);

            // Verify category is valid
            const category = errorCountCall[4].Category;
            expect(Object.values(ErrorCategory)).toContain(category);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should consistently categorize validation errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            'Invalid input',
            'Required field missing',
            'Malformed request',
            'Validation failed'
          ),
          async (errorMessage) => {
            // Clear mocks for this iteration
            jest.clearAllMocks();
            
            const errorTracker = new ErrorTracker(mockLogger, mockMetricPublisher);
            const error = new Error(errorMessage);

            const category = errorTracker.getErrorCategory(error);
            expect(category).toBe(ErrorCategory.VALIDATION);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should consistently categorize authentication errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            'Authentication failed',
            'Invalid token',
            'Unauthorized access',
            'Missing credentials'
          ),
          async (errorMessage) => {
            // Clear mocks for this iteration
            jest.clearAllMocks();
            
            const errorTracker = new ErrorTracker(mockLogger, mockMetricPublisher);
            const error = new Error(errorMessage);

            const category = errorTracker.getErrorCategory(error);
            expect(category).toBe(ErrorCategory.AUTHENTICATION);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should consistently categorize timeout errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            'Request timeout',
            'Operation timed out',
            'Connection timeout',
            'TimeoutException'
          ),
          async (errorMessage) => {
            // Clear mocks for this iteration
            jest.clearAllMocks();
            
            const errorTracker = new ErrorTracker(mockLogger, mockMetricPublisher);
            const error = new Error(errorMessage);

            const category = errorTracker.getErrorCategory(error);
            expect(category).toBe(ErrorCategory.TIMEOUT);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should consistently categorize throttling errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            'ThrottlingException',
            'Rate limit exceeded',
            'Too many requests',
            'TooManyRequestsException'
          ),
          async (errorMessage) => {
            // Clear mocks for this iteration
            jest.clearAllMocks();
            
            const errorTracker = new ErrorTracker(mockLogger, mockMetricPublisher);
            const error = new Error(errorMessage);

            const category = errorTracker.getErrorCategory(error);
            expect(category).toBe(ErrorCategory.THROTTLING);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should publish both ErrorCount and TotalErrors metrics', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
            component: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          async (testData) => {
            // Clear mocks for this iteration
            jest.clearAllMocks();
            
            const errorTracker = new ErrorTracker(mockLogger, mockMetricPublisher);
            const error = new Error(testData.errorMessage);

            await errorTracker.trackError(error, {
              component: testData.component,
            });

            // Verify both metrics were published
            const metricCalls = mockMetricPublisher.publishMetric.mock.calls;
            const errorCountCalls = metricCalls.filter(call => call[1] === 'ErrorCount');
            const totalErrorsCalls = metricCalls.filter(call => call[1] === 'TotalErrors');

            expect(errorCountCalls.length).toBe(1);
            expect(totalErrorsCalls.length).toBe(1);

            // Verify ErrorCount has Category dimension
            expect(errorCountCalls[0][4]).toHaveProperty('Category');
            expect(errorCountCalls[0][4]).toHaveProperty('Component', testData.component);

            // Verify TotalErrors has only Component dimension
            expect(totalErrorsCalls[0][4]).toHaveProperty('Component', testData.component);
            expect(totalErrorsCalls[0][4]).not.toHaveProperty('Category');
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Additional property: Error tracking should be resilient to metric failures
   */
  describe('Property: Resilience to Metric Failures', () => {
    it('should continue logging even when metric publishing fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
            component: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          async (testData) => {
            // Clear mocks for this iteration
            jest.clearAllMocks();
            
            // Mock metric publisher to fail
            mockMetricPublisher.publishMetric.mockRejectedValue(new Error('Metric publish failed'));

            const errorTracker = new ErrorTracker(mockLogger, mockMetricPublisher);
            const error = new Error(testData.errorMessage);

            // Should not throw
            await expect(
              errorTracker.trackError(error, { component: testData.component })
            ).resolves.not.toThrow();

            // Should still log the error
            expect(mockLogger.error).toHaveBeenCalledTimes(1);

            // Should log a warning about metric failure
            expect(mockLogger.warn).toHaveBeenCalledWith(
              'Failed to publish error metrics',
              expect.objectContaining({
                component: 'ErrorTracker',
              })
            );
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
