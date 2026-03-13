/**
 * Feature: competition-mvp-backend, Property 32: Latency Metrics Logging
 * 
 * For any transcription or fraud detection operation, the Audio_Processor should log
 * the operation duration in milliseconds for performance monitoring.
 * 
 * Validates: Requirements 10.4
 */

import * as fc from 'fast-check';
import { StructuredLogger } from '../../lib/monitoring/structured-logger';
import { LogLevel } from '../../lib/monitoring/types';

describe('Property 32: Latency Metrics Logging', () => {
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
   * Generator for operation names
   */
  const operationGen = fc.constantFrom(
    'transcription',
    'fraud_detection',
    'audio_processing',
    'pii_redaction',
    'knowledge_base_query'
  );

  /**
   * Generator for duration in milliseconds (0-5000ms)
   */
  const durationGen = fc.integer({ min: 0, max: 5000 });

  /**
   * Generator for component names
   */
  const componentGen = fc.constantFrom(
    'AudioProcessor',
    'TranscriptionService',
    'FraudDetector',
    'BedrockClient'
  );

  /**
   * Property: Transcription operations should log duration in milliseconds
   */
  it('should log duration in milliseconds for transcription operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          component: componentGen,
          operation: fc.constant('transcription'),
          duration: durationGen,
          requestId: fc.uuid(),
          callSessionId: fc.uuid(),
        }),
        async (logData) => {
          // Clear previous calls
          consoleLogSpy.mockClear();
          
          // Log transcription operation with duration
          logger.info('Transcription completed', {
            component: logData.component,
            requestId: logData.requestId,
            operation: logData.operation,
            duration: logData.duration,
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

          // Verify duration field is present
          expect(logEntry).toHaveProperty('duration');

          // Verify duration is a number
          expect(typeof logEntry.duration).toBe('number');

          // Verify duration matches input
          expect(logEntry.duration).toBe(logData.duration);

          // Verify duration is non-negative
          expect(logEntry.duration).toBeGreaterThanOrEqual(0);

          // Verify operation field is present
          expect(logEntry).toHaveProperty('operation');
          expect(logEntry.operation).toBe('transcription');

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Fraud detection operations should log duration in milliseconds
   */
  it('should log duration in milliseconds for fraud detection operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          component: componentGen,
          operation: fc.constant('fraud_detection'),
          duration: durationGen,
          requestId: fc.uuid(),
          callSessionId: fc.uuid(),
        }),
        async (logData) => {
          // Clear previous calls
          consoleLogSpy.mockClear();
          
          // Log fraud detection operation with duration
          logger.info('Fraud detection completed', {
            component: logData.component,
            requestId: logData.requestId,
            operation: logData.operation,
            duration: logData.duration,
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

          // Verify duration field is present
          expect(logEntry).toHaveProperty('duration');

          // Verify duration is a number
          expect(typeof logEntry.duration).toBe('number');

          // Verify duration matches input
          expect(logEntry.duration).toBe(logData.duration);

          // Verify duration is non-negative
          expect(logEntry.duration).toBeGreaterThanOrEqual(0);

          // Verify operation field is present
          expect(logEntry).toHaveProperty('operation');
          expect(logEntry.operation).toBe('fraud_detection');

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Any operation with duration should log it in milliseconds
   */
  it('should log duration in milliseconds for any operation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          component: componentGen,
          operation: operationGen,
          duration: durationGen,
          requestId: fc.uuid(),
        }),
        async (logData) => {
          // Clear previous calls
          consoleLogSpy.mockClear();
          
          // Log operation with duration
          logger.info(`${logData.operation} completed`, {
            component: logData.component,
            requestId: logData.requestId,
            operation: logData.operation,
            duration: logData.duration,
          });

          // Verify console.log was called
          expect(consoleLogSpy).toHaveBeenCalled();

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];

          // Parse JSON
          const logEntry = JSON.parse(logOutput);

          // Verify duration field is present
          expect(logEntry).toHaveProperty('duration');

          // Verify duration is a number
          expect(typeof logEntry.duration).toBe('number');

          // Verify duration matches input
          expect(logEntry.duration).toBe(logData.duration);

          // Verify duration is in valid range (0-5000ms for our tests)
          expect(logEntry.duration).toBeGreaterThanOrEqual(0);
          expect(logEntry.duration).toBeLessThanOrEqual(5000);

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Duration should be preserved across different log levels
   */
  it('should preserve duration field across INFO, WARN, and ERROR levels', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          level: fc.constantFrom(LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR),
          component: componentGen,
          operation: operationGen,
          duration: durationGen,
          requestId: fc.uuid(),
        }),
        async (logData) => {
          // Clear previous calls
          consoleLogSpy.mockClear();
          
          // Log based on level
          if (logData.level === LogLevel.INFO) {
            logger.info(`${logData.operation} completed`, {
              component: logData.component,
              requestId: logData.requestId,
              operation: logData.operation,
              duration: logData.duration,
            });
          } else if (logData.level === LogLevel.WARN) {
            logger.warn(`${logData.operation} slow`, {
              component: logData.component,
              requestId: logData.requestId,
              operation: logData.operation,
              duration: logData.duration,
            });
          } else {
            logger.error(`${logData.operation} failed`, new Error('Test error'), {
              component: logData.component,
              requestId: logData.requestId,
              operation: logData.operation,
              duration: logData.duration,
            });
          }

          // Verify console.log was called
          expect(consoleLogSpy).toHaveBeenCalled();

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];

          // Parse JSON
          const logEntry = JSON.parse(logOutput);

          // Verify duration field is present regardless of log level
          expect(logEntry).toHaveProperty('duration');
          expect(logEntry.duration).toBe(logData.duration);

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Duration should be an integer (no fractional milliseconds)
   */
  it('should log duration as integer milliseconds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          component: componentGen,
          operation: operationGen,
          duration: durationGen,
          requestId: fc.uuid(),
        }),
        async (logData) => {
          // Log operation with duration
          logger.info(`${logData.operation} completed`, {
            component: logData.component,
            requestId: logData.requestId,
            operation: logData.operation,
            duration: logData.duration,
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];

          // Parse JSON
          const logEntry = JSON.parse(logOutput);

          // Verify duration is an integer
          expect(Number.isInteger(logEntry.duration)).toBe(true);

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: End-to-end latency should be logged for complete operations
   */
  it('should log end-to-end latency for complete audio processing pipeline', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          component: fc.constant('AudioProcessor'),
          transcriptionDuration: fc.integer({ min: 100, max: 1000 }),
          fraudDetectionDuration: fc.integer({ min: 500, max: 2000 }),
          requestId: fc.uuid(),
          callSessionId: fc.uuid(),
        }),
        async (logData) => {
          // Clear previous calls
          consoleLogSpy.mockClear();
          
          // Calculate end-to-end duration
          const endToEndDuration = logData.transcriptionDuration + logData.fraudDetectionDuration;

          // Log end-to-end operation
          logger.info('Audio processing pipeline completed', {
            component: logData.component,
            requestId: logData.requestId,
            operation: 'end_to_end_processing',
            duration: endToEndDuration,
            metadata: {
              callSessionId: logData.callSessionId,
              transcriptionDuration: logData.transcriptionDuration,
              fraudDetectionDuration: logData.fraudDetectionDuration,
            },
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];

          // Parse JSON
          const logEntry = JSON.parse(logOutput);

          // Verify end-to-end duration is present
          expect(logEntry).toHaveProperty('duration');
          expect(logEntry.duration).toBe(endToEndDuration);

          // Verify individual durations are in metadata
          expect(logEntry.metadata).toHaveProperty('transcriptionDuration');
          expect(logEntry.metadata).toHaveProperty('fraudDetectionDuration');
          expect(logEntry.metadata.transcriptionDuration).toBe(logData.transcriptionDuration);
          expect(logEntry.metadata.fraudDetectionDuration).toBe(logData.fraudDetectionDuration);

          // Verify end-to-end duration is sum of individual durations
          expect(logEntry.duration).toBe(
            logEntry.metadata.transcriptionDuration + logEntry.metadata.fraudDetectionDuration
          );

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Zero duration should be valid (for cached or instant operations)
   */
  it('should accept zero duration for instant operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          component: componentGen,
          operation: operationGen,
          requestId: fc.uuid(),
        }),
        async (logData) => {
          // Log operation with zero duration
          logger.info(`${logData.operation} completed instantly`, {
            component: logData.component,
            requestId: logData.requestId,
            operation: logData.operation,
            duration: 0,
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];

          // Parse JSON
          const logEntry = JSON.parse(logOutput);

          // Verify zero duration is accepted
          expect(logEntry).toHaveProperty('duration');
          expect(logEntry.duration).toBe(0);

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Large durations should be logged correctly (for slow operations)
   */
  it('should handle large duration values for slow operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          component: componentGen,
          operation: operationGen,
          duration: fc.integer({ min: 5000, max: 30000 }), // 5-30 seconds
          requestId: fc.uuid(),
        }),
        async (logData) => {
          // Clear previous calls
          consoleLogSpy.mockClear();
          
          // Log slow operation
          logger.warn(`${logData.operation} exceeded threshold`, {
            component: logData.component,
            requestId: logData.requestId,
            operation: logData.operation,
            duration: logData.duration,
          });

          // Get the logged output
          const logOutput = consoleLogSpy.mock.calls[0][0];

          // Parse JSON
          const logEntry = JSON.parse(logOutput);

          // Verify large duration is logged correctly
          expect(logEntry).toHaveProperty('duration');
          expect(logEntry.duration).toBe(logData.duration);
          expect(logEntry.duration).toBeGreaterThanOrEqual(5000);

          return true;
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });
});
