/**
 * Feature: competition-mvp-backend, Property 31: Structured Logging Format
 * 
 * For any operation logged by the Audio_Processor, the log entry should be valid JSON
 * containing timestamp, level (INFO/WARN/ERROR), component, requestId, message,
 * Connection_ID, and Call_Session ID.
 * 
 * Validates: Requirements 10.1, 10.2, 10.3
 */

import * as fc from 'fast-check';
import { StructuredLogger } from '../../lib/monitoring/structured-logger';
import { LogLevel } from '../../lib/monitoring/types';

describe('Property 31: Structured Logging Format', () => {
  let consoleLogSpy: jest.SpyInstance;
  let logger: StructuredLogger;

  beforeEach(() => {
    // Spy on console.log to capture log output
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    logger = new StructuredLogger();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleLogSpy.mockClear();
  });

  /**
   * Generator for valid log messages
   */
  const logMessageGen = fc.string({ minLength: 1, maxLength: 500 });

  /**
   * Generator for component names
   */
  const componentGen = fc.constantFrom(
    'AudioProcessor',
    'ConnectionManager',
    'TranscriptionService',
    'FraudDetector',
    'WebSocketClient'
  );

  /**
   * Generator for request IDs (UUID format)
   */
  const requestIdGen = fc.uuid();

  /**
   * Generator for connection IDs
   */
  const connectionIdGen = fc.string({ minLength: 10, maxLength: 50 });

  /**
   * Generator for call session IDs (UUID format)
   */
  const callSessionIdGen = fc.uuid();

  /**
   * Generator for log levels
   */
  const logLevelGen = fc.constantFrom(LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR);

  /**
   * Property: All INFO logs produce valid JSON with required fields
   */
  it('should produce valid JSON with all required fields for INFO logs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          message: logMessageGen,
          component: componentGen,
          requestId: requestIdGen,
          connectionId: fc.option(connectionIdGen, { nil: undefined }),
        }),
        async (logData) => {
          // Clear previous calls
          consoleLogSpy.mockClear();
          
          // Log an INFO message
          logger.info(logData.message, {
            component: logData.component,
            requestId: logData.requestId,
            metadata: {
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

          // Verify required fields are present
          expect(logEntry).toHaveProperty('timestamp');
          expect(logEntry).toHaveProperty('level');
          expect(logEntry).toHaveProperty('component');
          expect(logEntry).toHaveProperty('message');
          expect(logEntry).toHaveProperty('requestId');

          // Verify field types
          expect(typeof logEntry.timestamp).toBe('string');
          expect(logEntry.level).toBe('INFO');
          expect(typeof logEntry.component).toBe('string');
          expect(typeof logEntry.message).toBe('string');
          expect(typeof logEntry.requestId).toBe('string');

          // Verify timestamp is valid ISO 8601 format
          expect(() => new Date(logEntry.timestamp)).not.toThrow();
          expect(new Date(logEntry.timestamp).toISOString()).toBe(logEntry.timestamp);

          // Verify component matches input
          expect(logEntry.component).toBe(logData.component);
          
          // Verify requestId is present
          expect(logEntry.requestId).toBeTruthy();
          expect(typeof logEntry.requestId).toBe('string');

          // Verify message is present
          expect(logEntry.message).toBeTruthy();

          // Verify connection ID is in metadata if provided
          if (logData.connectionId) {
            expect(logEntry.metadata).toHaveProperty('connectionId');
            expect(typeof logEntry.metadata.connectionId).toBe('string');
          }

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: All WARN logs produce valid JSON with required fields
   */
  it('should produce valid JSON with all required fields for WARN logs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          message: logMessageGen,
          component: componentGen,
          requestId: requestIdGen,
          connectionId: fc.option(connectionIdGen, { nil: undefined }),
          callSessionId: fc.option(callSessionIdGen, { nil: undefined }),
        }),
        async (logData) => {
          // Log a WARN message
          logger.warn(logData.message, {
            component: logData.component,
            requestId: logData.requestId,
            metadata: {
              connectionId: logData.connectionId,
              callSessionId: logData.callSessionId,
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

          // Verify required fields are present
          expect(logEntry).toHaveProperty('timestamp');
          expect(logEntry).toHaveProperty('level');
          expect(logEntry).toHaveProperty('component');
          expect(logEntry).toHaveProperty('message');
          expect(logEntry).toHaveProperty('requestId');

          // Verify level is WARN
          expect(logEntry.level).toBe('WARN');

          // Verify field types
          expect(typeof logEntry.timestamp).toBe('string');
          expect(typeof logEntry.component).toBe('string');
          expect(typeof logEntry.message).toBe('string');
          expect(typeof logEntry.requestId).toBe('string');

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: All ERROR logs produce valid JSON with required fields
   */
  it('should produce valid JSON with all required fields for ERROR logs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          message: logMessageGen,
          component: componentGen,
          requestId: requestIdGen,
          errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
          connectionId: fc.option(connectionIdGen, { nil: undefined }),
          callSessionId: fc.option(callSessionIdGen, { nil: undefined }),
        }),
        async (logData) => {
          // Create an error
          const error = new Error(logData.errorMessage);

          // Log an ERROR message
          logger.error(logData.message, error, {
            component: logData.component,
            requestId: logData.requestId,
            metadata: {
              connectionId: logData.connectionId,
              callSessionId: logData.callSessionId,
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

          // Verify required fields are present
          expect(logEntry).toHaveProperty('timestamp');
          expect(logEntry).toHaveProperty('level');
          expect(logEntry).toHaveProperty('component');
          expect(logEntry).toHaveProperty('message');
          expect(logEntry).toHaveProperty('requestId');

          // Verify level is ERROR
          expect(logEntry.level).toBe('ERROR');

          // Verify field types
          expect(typeof logEntry.timestamp).toBe('string');
          expect(typeof logEntry.component).toBe('string');
          expect(typeof logEntry.message).toBe('string');
          expect(typeof logEntry.requestId).toBe('string');

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Log entries should be deterministic for the same input
   * (except for timestamp which changes)
   */
  it('should produce consistent log structure for the same input', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          message: logMessageGen,
          component: componentGen,
          requestId: requestIdGen,
        }),
        async (logData) => {
          // Clear and log first time
          consoleLogSpy.mockClear();
          logger.info(logData.message, {
            component: logData.component,
            requestId: logData.requestId,
          });

          const firstLog = JSON.parse(consoleLogSpy.mock.calls[0][0]);

          // Clear and log second time
          consoleLogSpy.mockClear();
          logger.info(logData.message, {
            component: logData.component,
            requestId: logData.requestId,
          });

          const secondLog = JSON.parse(consoleLogSpy.mock.calls[0][0]);

          // Verify same structure (excluding timestamp which will differ)
          expect(secondLog.level).toBe(firstLog.level);
          expect(secondLog.component).toBe(firstLog.component);
          expect(secondLog.message).toBe(firstLog.message);
          
          // Both should have requestId
          expect(secondLog.requestId).toBeTruthy();
          expect(firstLog.requestId).toBeTruthy();

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: All log levels should produce valid JSON
   */
  it('should produce valid JSON for any log level', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          level: logLevelGen,
          message: logMessageGen,
          component: componentGen,
          requestId: requestIdGen,
        }),
        async (logData) => {
          // Clear any previous calls
          consoleLogSpy.mockClear();
          
          // Log based on level
          if (logData.level === LogLevel.INFO) {
            logger.info(logData.message, {
              component: logData.component,
              requestId: logData.requestId,
            });
          } else if (logData.level === LogLevel.WARN) {
            logger.warn(logData.message, {
              component: logData.component,
              requestId: logData.requestId,
            });
          } else {
            logger.error(logData.message, new Error('Test error'), {
              component: logData.component,
              requestId: logData.requestId,
            });
          }

          // Verify console.log was called
          expect(consoleLogSpy).toHaveBeenCalled();

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];

          // Verify it's valid JSON
          let logEntry: any;
          expect(() => {
            logEntry = JSON.parse(logOutput);
          }).not.toThrow();

          // Verify required fields
          expect(logEntry).toHaveProperty('timestamp');
          expect(logEntry).toHaveProperty('level');
          expect(logEntry).toHaveProperty('component');
          expect(logEntry).toHaveProperty('message');
          expect(logEntry).toHaveProperty('requestId');

          // Verify level matches
          expect(logEntry.level).toBe(logData.level);

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Log entries should never exceed CloudWatch size limit (256 KB)
   */
  it('should truncate log entries that exceed size limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          message: fc.string({ minLength: 1, maxLength: 1000 }),
          component: componentGen,
          requestId: requestIdGen,
          largeMetadata: fc.array(
            fc.record({
              key: fc.string({ minLength: 10, maxLength: 100 }),
              value: fc.string({ minLength: 100, maxLength: 1000 }),
            }),
            { minLength: 0, maxLength: 300 }
          ),
        }),
        async (logData) => {
          // Create large metadata object
          const metadata: Record<string, string> = {};
          logData.largeMetadata.forEach((item) => {
            metadata[item.key] = item.value;
          });

          // Log with large metadata
          logger.info(logData.message, {
            component: logData.component,
            requestId: logData.requestId,
            metadata,
          });

          // Verify console.log was called
          expect(consoleLogSpy).toHaveBeenCalled();

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];

          // Verify size is within limit
          const size = Buffer.byteLength(logOutput, 'utf8');
          expect(size).toBeLessThanOrEqual(256 * 1024);

          // Verify it's still valid JSON
          let logEntry: any;
          expect(() => {
            logEntry = JSON.parse(logOutput);
          }).not.toThrow();

          // If truncated, should have _truncated flag
          if (size >= 256 * 1024 - 1000) {
            expect(logEntry.metadata).toHaveProperty('_truncated');
            expect(logEntry.metadata._truncated).toBe(true);
          }

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });
});
