/**
 * Unit tests for ErrorTracker
 * 
 * Tests error categorization, logging, and metric publishing functionality.
 */

import { ErrorTracker, ErrorCategory } from '../../../lib/monitoring/error-tracker';
import { StructuredLogger } from '../../../lib/monitoring/structured-logger';
import { MetricPublisher } from '../../../lib/monitoring/metric-publisher';
import { MetricUnit } from '../../../lib/monitoring/types';

// Mock dependencies
jest.mock('../../../lib/monitoring/structured-logger');
jest.mock('../../../lib/monitoring/metric-publisher');

describe('ErrorTracker', () => {
  let errorTracker: ErrorTracker;
  let mockLogger: jest.Mocked<StructuredLogger>;
  let mockMetricPublisher: jest.Mocked<MetricPublisher>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock instances
    mockLogger = new StructuredLogger() as jest.Mocked<StructuredLogger>;
    mockMetricPublisher = new MetricPublisher() as jest.Mocked<MetricPublisher>;

    // Mock methods
    mockLogger.error = jest.fn();
    mockLogger.warn = jest.fn();
    mockMetricPublisher.publishMetric = jest.fn().mockResolvedValue(undefined);

    // Create error tracker with mocked dependencies
    errorTracker = new ErrorTracker(mockLogger, mockMetricPublisher);
  });

  describe('Error Categorization', () => {
    it('should categorize validation errors correctly', () => {
      const errors = [
        new Error('Invalid input provided'),
        new Error('Required field missing'),
        new Error('Malformed request body'),
      ];

      errors.forEach(error => {
        const category = errorTracker.getErrorCategory(error);
        expect(category).toBe(ErrorCategory.VALIDATION);
      });
    });

    it('should categorize authentication errors correctly', () => {
      const errors = [
        new Error('Authentication failed'),
        new Error('Invalid token provided'),
        new Error('Unauthorized access'),
        new Error('Missing credentials'),
      ];

      errors.forEach(error => {
        const category = errorTracker.getErrorCategory(error);
        expect(category).toBe(ErrorCategory.AUTHENTICATION);
      });
    });

    it('should categorize timeout errors correctly', () => {
      const errors = [
        new Error('Request timeout'),
        new Error('Operation timed out'),
        new Error('Connection timeout exceeded'),
      ];

      errors.forEach(error => {
        const category = errorTracker.getErrorCategory(error);
        expect(category).toBe(ErrorCategory.TIMEOUT);
      });
    });

    it('should categorize throttling errors correctly', () => {
      const errors = [
        new Error('ThrottlingException: Rate exceeded'),
        new Error('Too many requests'),
        new Error('Rate limit exceeded'),
      ];

      errors.forEach(error => {
        const category = errorTracker.getErrorCategory(error);
        expect(category).toBe(ErrorCategory.THROTTLING);
      });
    });

    it('should categorize unknown errors as service errors', () => {
      const errors = [
        new Error('Internal server error'),
        new Error('Database connection failed'),
        new Error('Unexpected error occurred'),
      ];

      errors.forEach(error => {
        const category = errorTracker.getErrorCategory(error);
        expect(category).toBe(ErrorCategory.SERVICE);
      });
    });

    it('should handle errors without stack traces', () => {
      const error = new Error('Test error');
      delete error.stack;

      const category = errorTracker.getErrorCategory(error);
      expect(category).toBe(ErrorCategory.SERVICE);
    });
  });

  describe('Generic Error Tracking', () => {
    it('should log error with correct context', async () => {
      const error = new Error('Test error');
      const context = {
        component: 'TestComponent',
        operation: 'testOperation',
        requestId: 'req-123',
      };

      await errorTracker.trackError(error, context);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Test error',
        error,
        expect.objectContaining({
          component: 'TestComponent',
          operation: 'testOperation',
          requestId: 'req-123',
          metadata: expect.objectContaining({
            errorCategory: ErrorCategory.SERVICE,
          }),
        })
      );
    });

    it('should publish error metrics with category and component', async () => {
      const error = new Error('Test error');
      const context = {
        component: 'TestComponent',
      };

      await errorTracker.trackError(error, context);

      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        'VocalShield/Errors',
        'ErrorCount',
        1,
        MetricUnit.Count,
        {
          Category: ErrorCategory.SERVICE,
          Component: 'TestComponent',
        }
      );

      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        'VocalShield/Errors',
        'TotalErrors',
        1,
        MetricUnit.Count,
        {
          Component: 'TestComponent',
        }
      );
    });

    it('should handle metric publishing failures gracefully', async () => {
      mockMetricPublisher.publishMetric.mockRejectedValue(new Error('Metric publish failed'));

      const error = new Error('Test error');
      const context = {
        component: 'TestComponent',
      };

      // Should not throw
      await expect(errorTracker.trackError(error, context)).resolves.not.toThrow();

      // Should log warning about metric failure
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to publish error metrics',
        expect.objectContaining({
          component: 'ErrorTracker',
        })
      );
    });
  });

  describe('Lambda Error Tracking', () => {
    it('should log Lambda error with stack trace and context', async () => {
      const error = new Error('Lambda execution failed');
      const context = {
        component: 'AuthLambda',
        operation: 'authenticateUser',
        requestId: 'req-123',
        functionName: 'vocalshield-auth',
        functionVersion: '$LATEST',
      };

      await errorTracker.trackLambdaError(error, context);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Lambda function error: Lambda execution failed',
        error,
        expect.objectContaining({
          component: 'AuthLambda',
          operation: 'authenticateUser',
          requestId: 'req-123',
          metadata: expect.objectContaining({
            functionName: 'vocalshield-auth',
            functionVersion: '$LATEST',
            errorCategory: ErrorCategory.SERVICE,
          }),
        })
      );
    });

    it('should publish metrics for Lambda errors', async () => {
      const error = new Error('Lambda timeout');
      const context = {
        component: 'ProcessorLambda',
        functionName: 'vocalshield-processor',
      };

      await errorTracker.trackLambdaError(error, context);

      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        'VocalShield/Errors',
        'ErrorCount',
        1,
        MetricUnit.Count,
        {
          Category: ErrorCategory.TIMEOUT,
          Component: 'ProcessorLambda',
        }
      );
    });
  });

  describe('API Gateway Error Tracking', () => {
    it('should log API Gateway error with request details and response code', async () => {
      const error = new Error('Bad request');
      const context = {
        component: 'APIGateway',
        operation: 'handleRequest',
        requestId: 'req-456',
        requestPath: '/api/analyze',
        httpMethod: 'POST',
        statusCode: 400,
        requestDetails: {
          headers: { 'content-type': 'application/json' },
        },
      };

      await errorTracker.trackAPIGatewayError(error, context);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'API Gateway request failed: Bad request',
        error,
        expect.objectContaining({
          component: 'APIGateway',
          operation: 'handleRequest',
          requestId: 'req-456',
          metadata: expect.objectContaining({
            requestPath: '/api/analyze',
            httpMethod: 'POST',
            statusCode: 400,
            requestDetails: expect.any(Object),
            errorCategory: ErrorCategory.VALIDATION, // "Bad request" is a validation error
          }),
        })
      );
    });

    it('should publish metrics for API Gateway errors', async () => {
      const error = new Error('Internal server error');
      const context = {
        component: 'APIGateway',
        requestPath: '/api/analyze',
        statusCode: 500,
      };

      await errorTracker.trackAPIGatewayError(error, context);

      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        'VocalShield/Errors',
        'ErrorCount',
        1,
        MetricUnit.Count,
        {
          Category: ErrorCategory.SERVICE,
          Component: 'APIGateway',
        }
      );
    });
  });

  describe('DynamoDB Error Tracking', () => {
    it('should log DynamoDB error with operation type and item key', async () => {
      const error = new Error('ConditionalCheckFailedException');
      const context = {
        component: 'DataLayer',
        operation: 'updateUserRecord',
        requestId: 'req-789',
        tableName: 'VocalShield-Users',
        operationType: 'UpdateItem' as const,
        itemKey: { userId: 'user-123' },
      };

      await errorTracker.trackDynamoDBError(error, context);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'DynamoDB operation failed: ConditionalCheckFailedException',
        error,
        expect.objectContaining({
          component: 'DataLayer',
          operation: 'updateUserRecord',
          requestId: 'req-789',
          metadata: expect.objectContaining({
            tableName: 'VocalShield-Users',
            operationType: 'UpdateItem',
            itemKey: { userId: 'user-123' },
            errorCategory: ErrorCategory.SERVICE,
          }),
        })
      );
    });

    it('should categorize DynamoDB throttling errors correctly', async () => {
      const error = new Error('ProvisionedThroughputExceededException');
      const context = {
        component: 'DataLayer',
        tableName: 'VocalShield-Sessions',
        operationType: 'PutItem' as const,
      };

      await errorTracker.trackDynamoDBError(error, context);

      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        'VocalShield/Errors',
        'ErrorCount',
        1,
        MetricUnit.Count,
        {
          Category: ErrorCategory.THROTTLING,
          Component: 'DataLayer',
        }
      );
    });

    it('should publish metrics for DynamoDB errors', async () => {
      const error = new Error('ResourceNotFoundException');
      const context = {
        component: 'DataLayer',
        tableName: 'VocalShield-Users',
        operationType: 'GetItem' as const,
      };

      await errorTracker.trackDynamoDBError(error, context);

      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        'VocalShield/Errors',
        'ErrorCount',
        1,
        MetricUnit.Count,
        {
          Category: ErrorCategory.SERVICE,
          Component: 'DataLayer',
        }
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle errors with empty messages', async () => {
      const error = new Error('');
      const context = {
        component: 'TestComponent',
      };

      await errorTracker.trackError(error, context);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockMetricPublisher.publishMetric).toHaveBeenCalled();
    });

    it('should handle context with all optional fields', async () => {
      const error = new Error('Test error');
      const context = {
        component: 'TestComponent',
        operation: 'testOp',
        requestId: 'req-123',
        userId: 'user-456',
        metadata: {
          customField: 'customValue',
        },
      };

      await errorTracker.trackError(error, context);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Test error',
        error,
        expect.objectContaining({
          component: 'TestComponent',
          operation: 'testOp',
          requestId: 'req-123',
          userId: 'user-456',
          metadata: expect.objectContaining({
            customField: 'customValue',
            errorCategory: ErrorCategory.SERVICE,
          }),
        })
      );
    });

    it('should handle context with minimal fields', async () => {
      const error = new Error('Test error');
      const context = {
        component: 'TestComponent',
      };

      await errorTracker.trackError(error, context);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Test error',
        error,
        expect.objectContaining({
          component: 'TestComponent',
        })
      );
    });
  });
});
