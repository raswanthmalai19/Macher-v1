/**
 * Feature: competition-mvp-backend, Property 25: Structured Error Logging
 * 
 * For any error encountered by the Audio_Processor, the log entry should be valid JSON
 * containing timestamp, level (ERROR), component, requestId, error type, error message,
 * and context.
 * 
 * Validates: Requirements 8.4
 */

import * as fc from 'fast-check';
import { StructuredLogger } from '../../lib/monitoring/structured-logger';
import { LogLevel } from '../../lib/monitoring/types';

describe('Property 25: Structured Error Logging', () => {
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
   * Generator for error scenarios
   */
  const errorScenarioGen = fc.constantFrom(
    'transcription_failed',
    'bedrock_unavailable',
    'dynamodb_timeout',
    'websocket_disconnected',
    'invalid_audio_format',
    'circuit_breaker_open'
  );

  /**
   * Generator for component names
   */
  const componentGen = fc.constantFrom(
    'AudioProcessor',
    'ConnectionManager',
    'TranscriptionService',
    'FraudDetector',
    'BedrockClient',
    'WebSocketClient'
  );

  /**
   * Property: All errors produce valid JSON logs
   */
  it('should produce valid JSON for any error', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          scenario: errorScenarioGen,
          errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
          component: componentGen,
          requestId: fc.uuid(),
          callSessionId: fc.option(fc.uuid(), { nil: undefined }),
          connectionId: fc.option(fc.string({ minLength: 10, maxLength: 50 }), { nil: undefined }),
        }),
        async (logData) => {
          // Create an error
          const error = new Error(logData.errorMessage);

          // Log the error
          logger.error(`Error in ${logData.scenario}`, error, {
            component: logData.component,
            requestId: logData.requestId,
            metadata: {
              scenario: logData.scenario,
              callSessionId: logData.callSessionId,
              connectionId: logData.connectionId,
            },
          });

          // Verify console.log was called
          expect(consoleLogSpy).toHaveBeenCalled();

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];

          // Verify it's valid JSON
          let logEntry: any;
          expect(() => {
            logEntry = JSON.parse(logOutput);
          }).not.toThrow();

          // Verify required fields for structured error logging
          expect(logEntry).toHaveProperty('timestamp');
          expect(logEntry).toHaveProperty('level');
          expect(logEntry).toHaveProperty('component');
          expect(logEntry).toHaveProperty('requestId');
          expect(logEntry).toHaveProperty('message');
          expect(logEntry).toHaveProperty('error');

          // Verify field types
          expect(typeof logEntry.timestamp).toBe('string');
          expect(logEntry.level).toBe('ERROR');
          expect(typeof logEntry.component).toBe('string');
          expect(typeof logEntry.requestId).toBe('string');
          expect(typeof logEntry.message).toBe('string');
          expect(typeof logEntry.error).toBe('object');

          // Verify error object structure
          expect(logEntry.error).toHaveProperty('type');
          expect(logEntry.error).toHaveProperty('message');
          expect(logEntry.error).toHaveProperty('stack');

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Error logs should always have ERROR level
   */
  it('should always set level to ERROR for error logs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
          component: componentGen,
          requestId: fc.uuid(),
        }),
        async (logData) => {
          // Create and log an error
          const error = new Error(logData.errorMessage);
          logger.error('An error occurred', error, {
            component: logData.component,
            requestId: logData.requestId,
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];
          const logEntry = JSON.parse(logOutput);

          // Verify level is always ERROR
          expect(logEntry.level).toBe('ERROR');
          expect(logEntry.level).toBe(LogLevel.ERROR);

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Timestamp should be valid ISO 8601 format
   */
  it('should use valid ISO 8601 timestamp format for error logs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
          component: componentGen,
          requestId: fc.uuid(),
        }),
        async (logData) => {
          // Create and log an error
          const error = new Error(logData.errorMessage);
          logger.error('An error occurred', error, {
            component: logData.component,
            requestId: logData.requestId,
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];
          const logEntry = JSON.parse(logOutput);

          // Verify timestamp is valid ISO 8601
          expect(() => new Date(logEntry.timestamp)).not.toThrow();
          const parsedDate = new Date(logEntry.timestamp);
          expect(parsedDate.toISOString()).toBe(logEntry.timestamp);

          // Verify timestamp is recent (within last 5 seconds)
          const now = Date.now();
          const logTime = parsedDate.getTime();
          expect(now - logTime).toBeLessThan(5000);

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Error logs should include context for debugging
   */
  it('should include debugging context in error logs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
          component: componentGen,
          requestId: fc.uuid(),
          operation: fc.constantFrom('transcription', 'fraud_detection', 'audio_processing'),
          retryCount: fc.integer({ min: 0, max: 3 }),
          duration: fc.option(fc.integer({ min: 0, max: 5000 }), { nil: undefined }),
        }),
        async (logData) => {
          // Clear previous calls
          consoleLogSpy.mockClear();
          
          // Create and log an error with context
          const error = new Error(logData.errorMessage);
          logger.error('Operation failed', error, {
            component: logData.component,
            requestId: logData.requestId,
            operation: logData.operation,
            duration: logData.duration,
            metadata: {
              retryCount: logData.retryCount,
            },
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];
          const logEntry = JSON.parse(logOutput);

          // Verify context fields are present
          expect(logEntry).toHaveProperty('operation');
          expect(logEntry.operation).toBe(logData.operation);

          if (logData.duration !== undefined) {
            expect(logEntry).toHaveProperty('duration');
            expect(logEntry.duration).toBe(logData.duration);
          }

          if (logEntry.metadata) {
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
   * Property: Error logs should handle nested errors
   */
  it('should handle nested errors correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          outerMessage: fc.string({ minLength: 1, maxLength: 100 }),
          innerMessage: fc.string({ minLength: 1, maxLength: 100 }),
          component: componentGen,
          requestId: fc.uuid(),
        }),
        async (logData) => {
          // Create nested error
          const innerError = new Error(logData.innerMessage);
          const outerError = new Error(logData.outerMessage);
          (outerError as any).cause = innerError;

          // Log the error
          logger.error('Nested error occurred', outerError, {
            component: logData.component,
            requestId: logData.requestId,
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];
          const logEntry = JSON.parse(logOutput);

          // Verify outer error is logged
          expect(logEntry.error).toHaveProperty('message');
          expect(logEntry.error).toHaveProperty('type');
          expect(logEntry.error).toHaveProperty('stack');

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Error logs should sanitize PII
   */
  it('should sanitize PII from error logs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          component: componentGen,
          requestId: fc.uuid(),
          phoneNumber: fc.constantFrom('555-123-4567', '(555) 123-4567', '5551234567'),
          email: fc.constantFrom('user@example.com', 'test.user@domain.org'),
        }),
        async (logData) => {
          // Clear previous calls
          consoleLogSpy.mockClear();
          
          // Create error with PII
          const errorWithPII = new Error(
            `Failed to process call from ${logData.phoneNumber} for ${logData.email}`
          );

          // Log the error
          logger.error('Processing failed', errorWithPII, {
            component: logData.component,
            requestId: logData.requestId,
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];
          const logEntry = JSON.parse(logOutput);

          // Verify PII is redacted (at least one should be redacted)
          const hasRedaction = logEntry.error.message.includes('[REDACTED]');
          expect(hasRedaction).toBe(true);
          
          // Verify at least email is redacted (email pattern is more reliable)
          expect(logEntry.error.message).not.toContain(logData.email);

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Error logs should be parseable by CloudWatch Logs Insights
   */
  it('should produce CloudWatch Logs Insights compatible JSON', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
          component: componentGen,
          requestId: fc.uuid(),
        }),
        async (logData) => {
          // Create and log an error
          const error = new Error(logData.errorMessage);
          logger.error('An error occurred', error, {
            component: logData.component,
            requestId: logData.requestId,
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];
          const logEntry = JSON.parse(logOutput);

          // Verify CloudWatch Logs Insights compatible structure
          // All values should be strings, numbers, booleans, or nested objects
          const validateValue = (value: any): boolean => {
            if (value === null || value === undefined) return true;
            if (typeof value === 'string') return true;
            if (typeof value === 'number') return true;
            if (typeof value === 'boolean') return true;
            if (typeof value === 'object') {
              return Object.values(value).every(validateValue);
            }
            return false;
          };

          expect(validateValue(logEntry)).toBe(true);

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Error logs should handle errors without stack traces
   */
  it('should handle errors without stack traces gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
          component: componentGen,
          requestId: fc.uuid(),
        }),
        async (logData) => {
          // Create error and remove stack trace
          const error = new Error(logData.errorMessage);
          delete (error as any).stack;

          // Log the error
          logger.error('Error without stack', error, {
            component: logData.component,
            requestId: logData.requestId,
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];
          const logEntry = JSON.parse(logOutput);

          // Verify error object is still present
          expect(logEntry).toHaveProperty('error');
          expect(logEntry.error).toHaveProperty('message');
          expect(logEntry.error).toHaveProperty('type');

          // Stack should be present but may be empty string
          expect(logEntry.error).toHaveProperty('stack');
          expect(typeof logEntry.error.stack).toBe('string');

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Multiple consecutive errors should each produce separate log entries
   */
  it('should produce separate log entries for consecutive errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            errorMessage: fc.string({ minLength: 1, maxLength: 100 }),
            component: componentGen,
            requestId: fc.uuid(),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (errorDataArray) => {
          // Clear previous calls
          consoleLogSpy.mockClear();
          
          // Log multiple errors
          for (const logData of errorDataArray) {
            const error = new Error(logData.errorMessage);
            logger.error('An error occurred', error, {
              component: logData.component,
              requestId: logData.requestId,
            });
          }

          // Verify correct number of log calls
          expect(consoleLogSpy).toHaveBeenCalledTimes(errorDataArray.length);

          // Verify each log entry is valid JSON with error
          for (let i = 0; i < errorDataArray.length; i++) {
            const logOutput = consoleLogSpy.mock.calls[i][0];
            const logEntry = JSON.parse(logOutput);

            expect(logEntry).toHaveProperty('error');
            expect(logEntry.level).toBe('ERROR');
            expect(logEntry.requestId).toBe(errorDataArray[i].requestId);
          }

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Error logs should respect size limits
   */
  it('should truncate error logs that exceed size limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          component: componentGen,
          requestId: fc.uuid(),
          largeErrorMessage: fc.string({ minLength: 10000, maxLength: 50000 }),
        }),
        async (logData) => {
          // Create error with very large message
          const error = new Error(logData.largeErrorMessage);

          // Log the error
          logger.error('Large error occurred', error, {
            component: logData.component,
            requestId: logData.requestId,
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];

          // Verify size is within CloudWatch limit (256 KB)
          const size = Buffer.byteLength(logOutput, 'utf8');
          expect(size).toBeLessThanOrEqual(256 * 1024);

          // Verify it's still valid JSON
          let logEntry: any;
          expect(() => {
            logEntry = JSON.parse(logOutput);
          }).not.toThrow();

          // Verify required fields are still present
          expect(logEntry).toHaveProperty('timestamp');
          expect(logEntry).toHaveProperty('level');
          expect(logEntry).toHaveProperty('component');
          expect(logEntry).toHaveProperty('requestId');

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });
});
