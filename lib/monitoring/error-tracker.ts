/**
 * ErrorTracker - Comprehensive error tracking and categorization
 * 
 * This class handles error tracking across all VocalShield components,
 * categorizing errors by type, logging with full context, and publishing
 * error metrics to CloudWatch.
 * 
 * Features:
 * - Error categorization (validation, authentication, service, timeout, throttling)
 * - Structured error logging with stack traces
 * - Error count metrics by category and component
 * - Context preservation for debugging
 * 
 * Usage:
 * ```typescript
 * const tracker = new ErrorTracker();
 * await tracker.trackError(error, {
 *   component: 'AuthLambda',
 *   operation: 'authenticateUser',
 *   requestId: 'req-123'
 * });
 * ```
 */

import { StructuredLogger } from './structured-logger';
import { MetricPublisher } from './metric-publisher';
import { MetricUnit, LogContext } from './types';

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  SERVICE = 'service',
  TIMEOUT = 'timeout',
  THROTTLING = 'throttling'
}

/**
 * Error context for tracking
 */
export interface ErrorContext {
  component: string;
  operation?: string;
  requestId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Lambda function error context
 */
export interface LambdaErrorContext extends ErrorContext {
  functionName?: string;
  functionVersion?: string;
}

/**
 * API Gateway error context
 */
export interface APIGatewayErrorContext extends ErrorContext {
  requestPath?: string;
  httpMethod?: string;
  statusCode?: number;
  requestDetails?: Record<string, unknown>;
}

/**
 * DynamoDB error context
 */
export interface DynamoDBErrorContext extends ErrorContext {
  tableName?: string;
  operationType?: 'GetItem' | 'PutItem' | 'UpdateItem' | 'DeleteItem' | 'Query' | 'Scan';
  itemKey?: Record<string, unknown>;
}

/**
 * ErrorTracker class for comprehensive error tracking
 */
export class ErrorTracker {
  private readonly logger: StructuredLogger;
  private readonly metricPublisher: MetricPublisher;

  constructor(logger?: StructuredLogger, metricPublisher?: MetricPublisher) {
    this.logger = logger || new StructuredLogger();
    this.metricPublisher = metricPublisher || new MetricPublisher();
  }

  /**
   * Track a generic error with automatic categorization
   */
  public async trackError(error: Error, context: ErrorContext): Promise<void> {
    const category = this.categorizeError(error);
    
    // Log error with full context
    this.logError(error, category, context);
    
    // Publish error metrics
    await this.publishErrorMetrics(category, context.component);
  }

  /**
   * Track a Lambda function error
   * Requirement 8.1: Log Lambda errors with stack trace and context
   */
  public async trackLambdaError(error: Error, context: LambdaErrorContext): Promise<void> {
    const category = this.categorizeError(error);
    
    // Enhanced context for Lambda errors
    const enhancedContext: LogContext = {
      component: context.component,
      operation: context.operation,
      requestId: context.requestId,
      userId: context.userId,
      metadata: {
        ...context.metadata,
        functionName: context.functionName,
        functionVersion: context.functionVersion,
        errorCategory: category,
      },
    };

    // Log with stack trace
    this.logger.error(
      `Lambda function error: ${error.message}`,
      error,
      enhancedContext
    );

    // Publish metrics
    await this.publishErrorMetrics(category, context.component);
  }

  /**
   * Track an API Gateway error
   * Requirement 8.2: Log API Gateway errors with request details and response code
   */
  public async trackAPIGatewayError(error: Error, context: APIGatewayErrorContext): Promise<void> {
    const category = this.categorizeError(error);
    
    // Enhanced context for API Gateway errors
    const enhancedContext: LogContext = {
      component: context.component,
      operation: context.operation,
      requestId: context.requestId,
      userId: context.userId,
      metadata: {
        ...context.metadata,
        requestPath: context.requestPath,
        httpMethod: context.httpMethod,
        statusCode: context.statusCode,
        requestDetails: context.requestDetails,
        errorCategory: category,
      },
    };

    // Log with request details
    this.logger.error(
      `API Gateway request failed: ${error.message}`,
      error,
      enhancedContext
    );

    // Publish metrics
    await this.publishErrorMetrics(category, context.component);
  }

  /**
   * Track a DynamoDB error
   * Requirement 8.3: Log DynamoDB errors with operation type and item key
   */
  public async trackDynamoDBError(error: Error, context: DynamoDBErrorContext): Promise<void> {
    const category = this.categorizeError(error);
    
    // Enhanced context for DynamoDB errors
    const enhancedContext: LogContext = {
      component: context.component,
      operation: context.operation,
      requestId: context.requestId,
      userId: context.userId,
      metadata: {
        ...context.metadata,
        tableName: context.tableName,
        operationType: context.operationType,
        itemKey: context.itemKey,
        errorCategory: category,
      },
    };

    // Log with operation details
    this.logger.error(
      `DynamoDB operation failed: ${error.message}`,
      error,
      enhancedContext
    );

    // Publish metrics
    await this.publishErrorMetrics(category, context.component);
  }

  /**
   * Categorize error by type
   * Requirement 8.4: Categorize errors by type
   */
  private categorizeError(error: Error): ErrorCategory {
    const errorMessage = error.message.toLowerCase();
    const errorName = error.name.toLowerCase();

    // Throttling errors (check first as they're most specific)
    if (
      errorName.includes('throttl') ||
      errorMessage.includes('throttl') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests') ||
      errorMessage.includes('toomanyrequests') ||
      errorName.includes('throttlingexception') ||
      errorName.includes('toomanyrequestsexception') ||
      errorMessage.includes('provisionedthroughputexceeded')
    ) {
      return ErrorCategory.THROTTLING;
    }

    // Timeout errors
    if (
      errorName.includes('timeout') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('timed out') ||
      errorName.includes('timeoutexception')
    ) {
      return ErrorCategory.TIMEOUT;
    }

    // Authentication errors
    if (
      errorName.includes('auth') ||
      errorName.includes('unauthorized') ||
      errorName.includes('forbidden') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('authorization') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('token') ||
      errorMessage.includes('credentials')
    ) {
      return ErrorCategory.AUTHENTICATION;
    }

    // Validation errors
    if (
      errorName.includes('validation') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('required') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('malformed') ||
      errorMessage.includes('bad request') ||
      errorMessage.includes('validation failed')
    ) {
      return ErrorCategory.VALIDATION;
    }

    // Default to service error
    return ErrorCategory.SERVICE;
  }

  /**
   * Log error with full context
   */
  private logError(error: Error, category: ErrorCategory, context: ErrorContext): void {
    const logContext: LogContext = {
      component: context.component,
      operation: context.operation,
      requestId: context.requestId,
      userId: context.userId,
      metadata: {
        ...context.metadata,
        errorCategory: category,
      },
    };

    this.logger.error(error.message, error, logContext);
  }

  /**
   * Publish error count metrics by category and component
   * Requirement 8.5: Track error counts by category and component
   */
  private async publishErrorMetrics(category: ErrorCategory, component: string): Promise<void> {
    try {
      // Publish error count metric with category and component dimensions
      await this.metricPublisher.publishMetric(
        'VocalShield/Errors',
        'ErrorCount',
        1,
        MetricUnit.Count,
        {
          Category: category,
          Component: component,
        }
      );

      // Also publish total error count for the component
      await this.metricPublisher.publishMetric(
        'VocalShield/Errors',
        'TotalErrors',
        1,
        MetricUnit.Count,
        {
          Component: component,
        }
      );
    } catch (metricError) {
      // Don't let metric publishing failures affect error tracking
      this.logger.warn('Failed to publish error metrics', {
        component: 'ErrorTracker',
        metadata: {
          error: (metricError as Error).message,
        },
      });
    }
  }

  /**
   * Get error category for an error (public utility method)
   */
  public getErrorCategory(error: Error): ErrorCategory {
    return this.categorizeError(error);
  }
}

/**
 * Create a singleton error tracker instance for convenience
 */
export const errorTracker = new ErrorTracker();
