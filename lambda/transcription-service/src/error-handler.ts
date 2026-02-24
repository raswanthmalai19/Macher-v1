/**
 * Error Handler for Transcription Service
 * 
 * Provides centralized error handling, categorization, and logging
 * Requirements: 7.1, 7.4, 9.5
 */

import { ErrorResponse } from './types';

/**
 * Logger interface for structured logging
 */
interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  CONNECTION = 'connection',
  VALIDATION = 'validation',
  API = 'api',
  INTERNAL = 'internal',
}

/**
 * Custom error class for transcription service errors
 */
export class TranscriptionError extends Error {
  constructor(
    public category: ErrorCategory,
    public code: string,
    message: string,
    public retryable: boolean = false,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

/**
 * Error Handler for centralized error management
 */
export class ErrorHandler {
  constructor(private logger: Logger) {}

  /**
   * Handle and log an error with full context
   * Requirement 7.1: Error logging with context
   */
  handleError(
    error: Error | TranscriptionError,
    sessionId: string,
    context?: Record<string, unknown>
  ): ErrorResponse {
    const timestamp = Date.now();

    // Determine error category and retryability
    let category: ErrorCategory;
    let code: string;
    let retryable: boolean;
    let details: Record<string, unknown> | undefined;

    if (error instanceof TranscriptionError) {
      category = error.category;
      code = error.code;
      retryable = error.retryable;
      details = error.details;
    } else {
      // Generic error - classify as internal
      category = ErrorCategory.INTERNAL;
      code = 'INTERNAL_ERROR';
      retryable = false;
      details = { originalError: error.name };
    }

    // Log error with full context
    this.logger.error('Transcription error occurred', {
      sessionId,
      errorCategory: category,
      errorCode: code,
      errorMessage: error.message,
      retryable,
      timestamp,
      ...context,
      ...details,
    });

    // Create error response
    return {
      status: 'error',
      errorType: category,
      errorCode: code,
      errorMessage: error.message,
      sessionId,
      timestamp,
      retryable,
      details,
    };
  }

  /**
   * Create a connection error
   */
  createConnectionError(message: string, retryable: boolean = true): TranscriptionError {
    return new TranscriptionError(
      ErrorCategory.CONNECTION,
      'CONNECTION_ERROR',
      message,
      retryable
    );
  }

  /**
   * Create a validation error
   * Requirement 9.5: Malformed input validation
   */
  createValidationError(message: string, details?: Record<string, unknown>): TranscriptionError {
    return new TranscriptionError(
      ErrorCategory.VALIDATION,
      'VALIDATION_ERROR',
      message,
      false, // Validation errors are not retryable
      details
    );
  }

  /**
   * Create an API error
   */
  createApiError(
    message: string,
    code: string,
    retryable: boolean = false
  ): TranscriptionError {
    return new TranscriptionError(
      ErrorCategory.API,
      code,
      message,
      retryable
    );
  }

  /**
   * Create an internal error
   */
  createInternalError(message: string, details?: Record<string, unknown>): TranscriptionError {
    return new TranscriptionError(
      ErrorCategory.INTERNAL,
      'INTERNAL_ERROR',
      message,
      false,
      details
    );
  }

  /**
   * Determine if an error is retryable
   */
  isRetryable(error: Error | TranscriptionError): boolean {
    if (error instanceof TranscriptionError) {
      return error.retryable;
    }
    return false;
  }

  /**
   * Parse Amazon Transcribe API error
   * Requirement 7.6: Rate limit handling
   */
  parseTranscribeError(error: any): TranscriptionError {
    const errorCode = error.code || error.name || 'UNKNOWN_ERROR';
    const errorMessage = error.message || 'Unknown error from Amazon Transcribe';

    // Determine if error is retryable based on error code
    const retryableErrors = [
      'ThrottlingException',
      'LimitExceededException',
      'ServiceUnavailableException',
      'InternalFailureException',
      'RequestTimeout',
    ];

    const retryable = retryableErrors.includes(errorCode);

    return new TranscriptionError(
      ErrorCategory.API,
      errorCode,
      errorMessage,
      retryable,
      { originalError: error }
    );
  }

  /**
   * Check if error is a rate limit error
   * Requirement 7.6: Rate limit handling
   */
  isRateLimitError(error: Error | TranscriptionError): boolean {
    if (error instanceof TranscriptionError) {
      return (
        error.code === 'ThrottlingException' ||
        error.code === 'LimitExceededException'
      );
    }
    return false;
  }
}
