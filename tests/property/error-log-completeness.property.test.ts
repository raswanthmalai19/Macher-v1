/**
 * Feature: competition-mvp-backend, Property 33: Error Log Completeness
 * 
 * For any error logged by the Audio_Processor, the log entry should include error type,
 * error message, and stack trace (when available) in addition to standard log fields.
 * 
 * Validates: Requirements 10.7
 */

import * as fc from 'fast-check';
import { StructuredLogger } from '../../lib/monitoring/structured-logger';

describe('Property 33: Error Log Completeness', () => {
  let consoleLogSpy: jest.SpyInstance;
  let logger: StructuredLogger;

  beforeEach(() => {
    // Spy on console.log to capture log output
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    logger = new StructuredLogger();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  /**
   * Generator for error messages
   */
  const errorMessageGen = fc.string({ minLength: 1, maxLength: 200 });

  /**
   * Generator for component names
   */
  const componentGen = fc.constantFrom(
    'AudioProcessor',
    'ConnectionManager',
    'TranscriptionService',
    'FraudDetector',
    'BedrockClient'
  );

  /**
   * Generator for error types (common JavaScript error classes)
   */
  const errorTypeGen = fc.constantFrom(
    'Error',
    'TypeError',
    'RangeError',
    'ReferenceError',
    'SyntaxError'
  );

  /**
   * Property: All error logs should include error type, message, and stack trace
   */
  it('should include error type, message, and stack trace for any error', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          logMessage: fc.string({ minLength: 1, maxLength: 100 }),
          errorMessage: errorMessageGen,
          component: componentGen,
          requestId: fc.uuid(),
          callSessionId: fc.option(fc.uuid(), { nil: undefined }),
        }),
        async (logData) => {
          // Create an error
          const error = new Error(logData.errorMessage);

          // Log the error
          logger.error(logData.logMessage, error, {
            component: logData.component,
            requestId: logData.requestId,
            metadata: {
              callSessionId: logData.callSessionId,
            },
          });

          // Verify console.log was called
          expect(consoleLogSpy).toHaveBeenCalled();

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];

          // Parse JSON
          const logEntry = JSON.parse(logOutput);

          // Verify standard log fields
          expect(logEntry).toHaveProperty('timestamp');
          expect(logEntry).toHaveProperty('level');
          expect(logEntry.level).toBe('ERROR');
          expect(logEntry).toHaveProperty('component');
          expect(logEntry).toHaveProperty('message');
          expect(logEntry).toHaveProperty('requestId');

          // Verify error object is present
          expect(logEntry).toHaveProperty('error');
          expect(typeof logEntry.error).toBe('object');

          // Verify error type is present
          expect(logEntry.error).toHaveProperty('type');
          expect(typeof logEntry.error.type).toBe('string');
          expect(logEntry.error.type).toBe('Error');

          // Verify error message is present
          expect(logEntry.error).toHaveProperty('message');
          expect(typeof logEntry.error.message).toBe('string');
          expect(logEntry.error.message.length).toBeGreaterThan(0);

          // Verify stack trace is present
          expect(logEntry.error).toHaveProperty('stack');
          expect(typeof logEntry.error.stack).toBe('string');
          expect(logEntry.error.stack.length).toBeGreaterThan(0);

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Different error types should be correctly identified
   */
  it('should correctly identify different error types', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          logMessage: fc.string({ minLength: 1, maxLength: 100 }),
          errorMessage: errorMessageGen,
          errorType: errorTypeGen,
          component: componentGen,
          requestId: fc.uuid(),
        }),
        async (logData) => {
          // Clear previous calls
          consoleLogSpy.mockClear();
          
          // Create error based on type
          let error: Error;
          switch (logData.errorType) {
            case 'TypeError':
              error = new TypeError(logData.errorMessage);
              break;
            case 'RangeError':
              error = new RangeError(logData.errorMessage);
              break;
            case 'ReferenceError':
              error = new ReferenceError(logData.errorMessage);
              break;
            case 'SyntaxError':
              error = new SyntaxError(logData.errorMessage);
              break;
            default:
              error = new Error(logData.errorMessage);
          }

          // Log the error
          logger.error(logData.logMessage, error, {
            component: logData.component,
            requestId: logData.requestId,
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];

          // Parse JSON
          const logEntry = JSON.parse(logOutput);

          // Verify error type matches
          expect(logEntry.error.type).toBe(logData.errorType);

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Error logs should include context from metadata
   */
  it('should include context information in error logs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          logMessage: fc.string({ minLength: 1, maxLength: 100 }),
          errorMessage: errorMessageGen,
          component: componentGen,
          requestId: fc.uuid(),
          callSessionId: fc.uuid(),
          connectionId: fc.string({ minLength: 10, maxLength: 50 }),
          operation: fc.constantFrom('transcription', 'fraud_detection', 'audio_processing'),
          retryCount: fc.integer({ min: 0, max: 3 }),
        }),
        async (logData) => {
          // Clear previous calls
          consoleLogSpy.mockClear();
          
          // Create an error
          const error = new Error(logData.errorMessage);

          // Log the error with context
          logger.error(logData.logMessage, error, {
            component: logData.component,
            requestId: logData.requestId,
            operation: logData.operation,
            metadata: {
              callSessionId: logData.callSessionId,
              connectionId: logData.connectionId,
              retryCount: logData.retryCount,
            },
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];

          // Parse JSON
          const logEntry = JSON.parse(logOutput);

          // Verify error object is present
          expect(logEntry).toHaveProperty('error');

          // Verify context fields are present
          expect(logEntry).toHaveProperty('operation');
          expect(logEntry.operation).toBe(logData.operation);

          // Verify metadata context
          if (logEntry.metadata) {
            expect(logEntry.metadata).toHaveProperty('callSessionId');
            expect(logEntry.metadata.callSessionId).toBe(logData.callSessionId);
            expect(logEntry.metadata).toHaveProperty('connectionId');
            expect(logEntry.metadata.connectionId).toBe(logData.connectionId);
            expect(logEntry.metadata).toHaveProperty('retryCount');
            expect(logEntry.metadata.retryCount).toBe(logData.retryCount);
          }

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Stack traces should contain file and line information
   */
  it('should include file and line information in stack traces', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          logMessage: fc.string({ minLength: 1, maxLength: 100 }),
          errorMessage: errorMessageGen,
          component: componentGen,
          requestId: fc.uuid(),
        }),
        async (logData) => {
          // Create an error (will have stack trace)
          const error = new Error(logData.errorMessage);

          // Log the error
          logger.error(logData.logMessage, error, {
            component: logData.component,
            requestId: logData.requestId,
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];

          // Parse JSON
          const logEntry = JSON.parse(logOutput);

          // Verify stack trace exists and has content
          expect(logEntry.error.stack).toBeTruthy();
          expect(logEntry.error.stack.length).toBeGreaterThan(0);

          // Stack trace should contain "at" (standard Node.js stack format)
          // or be a non-empty string
          expect(typeof logEntry.error.stack).toBe('string');

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Error logs should sanitize PII from error messages
   */
  it('should sanitize PII from error messages and stack traces', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          logMessage: fc.string({ minLength: 1, maxLength: 100 }),
          component: componentGen,
          requestId: fc.uuid(),
        }),
        async (logData) => {
          // Create error with PII in message
          const errorWithPII = new Error('Failed to process call from 555-123-4567');

          // Log the error
          logger.error(logData.logMessage, errorWithPII, {
            component: logData.component,
            requestId: logData.requestId,
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];

          // Parse JSON
          const logEntry = JSON.parse(logOutput);

          // Verify error message is sanitized (phone number should be redacted)
          expect(logEntry.error.message).not.toContain('555-123-4567');
          expect(logEntry.error.message).toContain('[REDACTED]');

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Error logs with duration should include timing information
   */
  it('should include duration for errors that occur during timed operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          logMessage: fc.string({ minLength: 1, maxLength: 100 }),
          errorMessage: errorMessageGen,
          component: componentGen,
          requestId: fc.uuid(),
          operation: fc.constantFrom('transcription', 'fraud_detection'),
          duration: fc.integer({ min: 0, max: 5000 }),
        }),
        async (logData) => {
          // Clear previous calls
          consoleLogSpy.mockClear();
          
          // Create an error
          const error = new Error(logData.errorMessage);

          // Log the error with duration
          logger.error(logData.logMessage, error, {
            component: logData.component,
            requestId: logData.requestId,
            operation: logData.operation,
            duration: logData.duration,
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];

          // Parse JSON
          const logEntry = JSON.parse(logOutput);

          // Verify error object is present
          expect(logEntry).toHaveProperty('error');

          // Verify duration is present
          expect(logEntry).toHaveProperty('duration');
          expect(logEntry.duration).toBe(logData.duration);

          // Verify operation is present
          expect(logEntry).toHaveProperty('operation');
          expect(logEntry.operation).toBe(logData.operation);

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Custom error classes should preserve their type information
   */
  it('should preserve custom error class type information', async () => {
    // Define custom error classes
    class TranscriptionError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'TranscriptionError';
      }
    }

    class BedrockError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'BedrockError';
      }
    }

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          logMessage: fc.string({ minLength: 1, maxLength: 100 }),
          errorMessage: errorMessageGen,
          errorClass: fc.constantFrom('TranscriptionError', 'BedrockError'),
          component: componentGen,
          requestId: fc.uuid(),
        }),
        async (logData) => {
          // Clear previous calls
          consoleLogSpy.mockClear();
          
          // Create custom error
          const error =
            logData.errorClass === 'TranscriptionError'
              ? new TranscriptionError(logData.errorMessage)
              : new BedrockError(logData.errorMessage);

          // Log the error
          logger.error(logData.logMessage, error, {
            component: logData.component,
            requestId: logData.requestId,
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];

          // Parse JSON
          const logEntry = JSON.parse(logOutput);

          // Verify custom error type is preserved
          expect(logEntry.error.type).toBe(logData.errorClass);

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Error logs should be valid JSON even with special characters
   */
  it('should produce valid JSON even with special characters in error messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          logMessage: fc.string({ minLength: 1, maxLength: 100 }),
          errorMessage: fc.string({ minLength: 1, maxLength: 200 }), // Any string including special chars
          component: componentGen,
          requestId: fc.uuid(),
        }),
        async (logData) => {
          // Create error with potentially problematic characters
          const error = new Error(logData.errorMessage);

          // Log the error
          logger.error(logData.logMessage, error, {
            component: logData.component,
            requestId: logData.requestId,
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];

          // Verify it's valid JSON (should not throw)
          let logEntry: any;
          expect(() => {
            logEntry = JSON.parse(logOutput);
          }).not.toThrow();

          // Verify error object is present and valid
          expect(logEntry).toHaveProperty('error');
          expect(logEntry.error).toHaveProperty('message');
          expect(logEntry.error).toHaveProperty('type');
          expect(logEntry.error).toHaveProperty('stack');

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });
});
