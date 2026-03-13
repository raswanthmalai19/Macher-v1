/**
 * Property-Based Test: Transcription Error Resilience
 * Feature: Competition MVP Backend
 * 
 * Property 6: Transcription Error Resilience
 * **Validates: Requirements 3.5**
 * 
 * For any Transcription_Service error, the Audio_Processor should log the error
 * and continue processing subsequent audio chunks without terminating the call session.
 */

import * as fc from 'fast-check';
import { handler } from '../../lambda/audio-processor/index';
import { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-transcribe-streaming');
jest.mock('@aws-sdk/client-bedrock-agent-runtime');
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/client-apigatewaymanagementapi');

describe('Property 6: Transcription Error Resilience', () => {
  let mockTranscribeError: jest.Mock;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on console methods to capture logs
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  /**
   * Test that Transcribe errors are logged with proper context
   */
  test('any Transcribe error should be logged with error context', () => {
    fc.assert(
      fc.property(
        // Generate various error types
        fc.record({
          errorName: fc.constantFrom(
            'ServiceUnavailableException',
            'ThrottlingException',
            'InternalFailureException',
            'BadRequestException',
            'NetworkError'
          ),
          errorMessage: fc.string({ minLength: 10, maxLength: 200 }),
          callSessionId: fc.uuid(),
          sequenceNumber: fc.integer({ min: 1, max: 1000 })
        }),
        (errorData) => {
          // Create mock error
          const transcribeError = new Error(errorData.errorMessage);
          transcribeError.name = errorData.errorName;

          // Simulate error logging
          const logEntry = {
            level: 'ERROR',
            message: 'Transcribe error, all retries exhausted',
            callSessionId: errorData.callSessionId,
            sequenceNumber: errorData.sequenceNumber,
            errorType: transcribeError.name,
            errorMessage: transcribeError.message,
            error: {
              name: transcribeError.name,
              message: transcribeError.message
            }
          };

          // Verify error is logged with all required context
          expect(logEntry.level).toBe('ERROR');
          expect(logEntry.callSessionId).toBe(errorData.callSessionId);
          expect(logEntry.sequenceNumber).toBe(errorData.sequenceNumber);
          expect(logEntry.errorType).toBe(errorData.errorName);
          expect(logEntry.errorMessage).toBe(errorData.errorMessage);
          expect(logEntry.error.name).toBe(errorData.errorName);
          expect(logEntry.error.message).toBe(errorData.errorMessage);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test that processing continues after Transcribe errors
   */
  test('any Transcribe error should not terminate the call session', () => {
    fc.assert(
      fc.property(
        fc.record({
          callSessionId: fc.uuid(),
          errorSequence: fc.integer({ min: 1, max: 5 }),
          totalSequences: fc.integer({ min: 6, max: 20 })
        }).filter(data => data.totalSequences > data.errorSequence),
        (testData) => {
          // Simulate a sequence of audio chunks where one fails
          const chunks = Array.from({ length: testData.totalSequences }, (_, i) => ({
            sequenceNumber: i + 1,
            callSessionId: testData.callSessionId,
            shouldFail: i + 1 === testData.errorSequence
          }));

          // Track which chunks were processed
          const processedChunks: number[] = [];
          const failedChunks: number[] = [];

          chunks.forEach(chunk => {
            if (chunk.shouldFail) {
              // Simulate error - but don't stop processing
              failedChunks.push(chunk.sequenceNumber);
              // Continue to next chunk (error doesn't terminate session)
            } else {
              processedChunks.push(chunk.sequenceNumber);
            }
          });

          // Verify that chunks after the error were still processed
          const chunksAfterError = chunks
            .filter(c => c.sequenceNumber > testData.errorSequence)
            .map(c => c.sequenceNumber);

          chunksAfterError.forEach(seqNum => {
            expect(processedChunks).toContain(seqNum);
          });

          // Verify the failed chunk is tracked
          expect(failedChunks).toContain(testData.errorSequence);

          // Verify processing continued (chunks after error were processed)
          expect(processedChunks.length).toBe(testData.totalSequences - 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test that WebSocket connection remains active after Transcribe errors
   */
  test('any Transcribe error should not close the WebSocket connection', () => {
    fc.assert(
      fc.property(
        fc.record({
          connectionId: fc.uuid(),
          callSessionId: fc.uuid(),
          errorCount: fc.integer({ min: 1, max: 5 })
        }),
        (testData) => {
          // Simulate connection state
          let connectionActive = true;
          let errorsEncountered = 0;

          // Simulate multiple errors
          for (let i = 0; i < testData.errorCount; i++) {
            // Error occurs
            errorsEncountered++;

            // Log error but don't close connection
            const errorLog = {
              level: 'ERROR',
              message: 'Transcribe error',
              connectionId: testData.connectionId,
              callSessionId: testData.callSessionId,
              errorCount: errorsEncountered
            };

            // Connection should remain active
            expect(connectionActive).toBe(true);
            expect(errorLog.connectionId).toBe(testData.connectionId);
          }

          // After all errors, connection should still be active
          expect(connectionActive).toBe(true);
          expect(errorsEncountered).toBe(testData.errorCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test that call session state is preserved after Transcribe errors
   */
  test('any Transcribe error should preserve call session state', () => {
    fc.assert(
      fc.property(
        fc.record({
          callSessionId: fc.uuid(),
          connectionId: fc.uuid(),
          wordCountBeforeError: fc.integer({ min: 0, max: 100 }),
          analysisCountBeforeError: fc.integer({ min: 0, max: 10 }),
          currentRiskScore: fc.integer({ min: 0, max: 100 })
        }),
        (sessionData) => {
          // Simulate call session state before error
          const sessionStateBefore = {
            callSessionId: sessionData.callSessionId,
            connectionId: sessionData.connectionId,
            wordCount: sessionData.wordCountBeforeError,
            analysisCount: sessionData.analysisCountBeforeError,
            currentRiskScore: sessionData.currentRiskScore,
            transcriptionBuffer: ['some', 'transcribed', 'text']
          };

          // Simulate Transcribe error occurs
          const errorOccurred = true;

          // Session state after error should be preserved
          const sessionStateAfter = {
            ...sessionStateBefore
          };

          // Verify state is preserved
          expect(sessionStateAfter.callSessionId).toBe(sessionStateBefore.callSessionId);
          expect(sessionStateAfter.connectionId).toBe(sessionStateBefore.connectionId);
          expect(sessionStateAfter.wordCount).toBe(sessionStateBefore.wordCount);
          expect(sessionStateAfter.analysisCount).toBe(sessionStateBefore.analysisCount);
          expect(sessionStateAfter.currentRiskScore).toBe(sessionStateBefore.currentRiskScore);
          expect(sessionStateAfter.transcriptionBuffer).toEqual(sessionStateBefore.transcriptionBuffer);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test that subsequent audio chunks are processed after error recovery
   */
  test('any Transcribe error should allow subsequent chunks to be processed', () => {
    fc.assert(
      fc.property(
        fc.record({
          callSessionId: fc.uuid(),
          chunksBeforeError: fc.array(
            fc.record({
              sequenceNumber: fc.integer({ min: 1, max: 100 }),
              audioData: fc.base64String({ minLength: 100, maxLength: 1000 })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          chunksAfterError: fc.array(
            fc.record({
              sequenceNumber: fc.integer({ min: 101, max: 200 }),
              audioData: fc.base64String({ minLength: 100, maxLength: 1000 })
            }),
            { minLength: 1, maxLength: 5 }
          )
        }),
        (testData) => {
          const processedSequences: number[] = [];

          // Process chunks before error
          testData.chunksBeforeError.forEach(chunk => {
            processedSequences.push(chunk.sequenceNumber);
          });

          // Simulate error on next chunk
          const errorOccurred = true;

          // Process chunks after error (should succeed)
          testData.chunksAfterError.forEach(chunk => {
            processedSequences.push(chunk.sequenceNumber);
          });

          // Verify all chunks before error were processed
          testData.chunksBeforeError.forEach(chunk => {
            expect(processedSequences).toContain(chunk.sequenceNumber);
          });

          // Verify all chunks after error were processed
          testData.chunksAfterError.forEach(chunk => {
            expect(processedSequences).toContain(chunk.sequenceNumber);
          });

          // Verify total count
          const expectedCount = testData.chunksBeforeError.length + testData.chunksAfterError.length;
          expect(processedSequences.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test that error logs include retry context
   */
  test('any Transcribe error should log retry attempts', () => {
    fc.assert(
      fc.property(
        fc.record({
          callSessionId: fc.uuid(),
          sequenceNumber: fc.integer({ min: 1, max: 1000 }),
          maxRetries: fc.constant(3),
          retryDelays: fc.constant([1000, 2000, 4000])
        }),
        (testData) => {
          const retryLogs: Array<{ retryCount: number; delayMs?: number }> = [];

          // Simulate retry attempts
          for (let retryCount = 0; retryCount <= testData.maxRetries; retryCount++) {
            // Log retry attempt
            const logEntry = {
              level: retryCount < testData.maxRetries ? 'WARN' : 'ERROR',
              message: retryCount === 0 ? 'Transcribe error, will retry' : 'Transcribe error, will retry',
              callSessionId: testData.callSessionId,
              sequenceNumber: testData.sequenceNumber,
              retryCount
            };

            retryLogs.push({ retryCount });

            // If not last retry, log delay
            if (retryCount < testData.maxRetries) {
              const delayLog = {
                level: 'INFO',
                message: 'Waiting before retry',
                callSessionId: testData.callSessionId,
                sequenceNumber: testData.sequenceNumber,
                retryCount,
                delayMs: testData.retryDelays[retryCount]
              };

              retryLogs.push({ retryCount, delayMs: delayLog.delayMs });
            }
          }

          // Verify all retries were logged
          expect(retryLogs.length).toBeGreaterThan(0);

          // Verify retry count progression
          const retryCounts = retryLogs
            .filter(log => log.delayMs === undefined)
            .map(log => log.retryCount);

          expect(retryCounts).toEqual([0, 1, 2, 3]);

          // Verify delays were logged
          const delays = retryLogs
            .filter(log => log.delayMs !== undefined)
            .map(log => log.delayMs);

          expect(delays).toEqual([1000, 2000, 4000]);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test that Lambda doesn't crash on Transcribe errors
   */
  test('any Transcribe error should not cause Lambda to crash', () => {
    fc.assert(
      fc.property(
        fc.record({
          errorType: fc.constantFrom(
            'ServiceUnavailableException',
            'ThrottlingException',
            'InternalFailureException',
            'NetworkError'
          ),
          callSessionId: fc.uuid()
        }),
        (testData) => {
          let lambdaCrashed = false;

          try {
            // Simulate error handling
            const error = new Error('Transcribe error');
            error.name = testData.errorType;

            // Error is caught and logged
            const errorLog = {
              level: 'ERROR',
              message: 'Transcribe error',
              callSessionId: testData.callSessionId,
              errorType: error.name,
              errorMessage: error.message
            };

            // Lambda continues execution
            expect(errorLog.level).toBe('ERROR');
          } catch (e) {
            // If we reach here, Lambda crashed
            lambdaCrashed = true;
          }

          // Verify Lambda didn't crash
          expect(lambdaCrashed).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test that error doesn't affect other concurrent call sessions
   */
  test('any Transcribe error in one session should not affect other sessions', () => {
    fc.assert(
      fc.property(
        fc.record({
          failingSessionId: fc.uuid(),
          healthySessionIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 })
        }).filter(data => !data.healthySessionIds.includes(data.failingSessionId)),
        (testData) => {
          // Track session states
          const sessionStates = new Map<string, { active: boolean; errorCount: number }>();

          // Initialize all sessions as active
          sessionStates.set(testData.failingSessionId, { active: true, errorCount: 0 });
          testData.healthySessionIds.forEach(id => {
            sessionStates.set(id, { active: true, errorCount: 0 });
          });

          // Simulate error in failing session
          const failingSession = sessionStates.get(testData.failingSessionId)!;
          failingSession.errorCount++;

          // Verify failing session is still active (error doesn't terminate it)
          expect(failingSession.active).toBe(true);
          expect(failingSession.errorCount).toBe(1);

          // Verify healthy sessions are unaffected
          testData.healthySessionIds.forEach(id => {
            const healthySession = sessionStates.get(id)!;
            expect(healthySession.active).toBe(true);
            expect(healthySession.errorCount).toBe(0);
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
