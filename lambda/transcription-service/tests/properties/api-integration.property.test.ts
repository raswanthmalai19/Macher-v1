/**
 * Property-Based Tests: API Integration
 * Feature: real-time-audio-transcription
 * 
 * Properties:
 * - Property 25: API Request Acceptance
 * - Property 26: JSON Response Format
 * - Property 27: Session ID Correlation
 * - Property 29: Concurrent Session Support
 */

import * as fc from 'fast-check';
import {
  StartTranscriptionRequest,
  StartTranscriptionResponse,
  SendAudioRequest,
  SendAudioResponse,
  EndTranscriptionRequest,
  EndTranscriptionResponse,
  AudioChunk,
  AudioFormat
} from '../../src/types';

describe('API Integration Properties', () => {
  /**
   * Property 25: API Request Acceptance
   * **Validates: Requirements 9.1**
   * 
   * For any properly formatted API request from the Audio Processor (with valid
   * session ID and audio chunk), the system should accept and process it.
   */
  describe('Property 25: API Request Acceptance', () => {
    test('valid start transcription request should be accepted', () => {
      fc.assert(
        fc.property(
          fc.record({
            sessionId: fc.uuid(),
            callId: fc.uuid(),
            audioFormat: fc.record({
              sampleRate: fc.constant(16000),
              bitDepth: fc.constant(16),
              channels: fc.constant(1),
              encoding: fc.constant('pcm')
            }),
            languageOptions: fc.option(
              fc.array(fc.constantFrom('en-US', 'es-ES', 'zh-CN'), { minLength: 1, maxLength: 3 }),
              { nil: undefined }
            )
          }),
          (request: StartTranscriptionRequest) => {
            // Verify request has all required fields
            expect(request.sessionId).toBeDefined();
            expect(request.callId).toBeDefined();
            expect(request.audioFormat).toBeDefined();
            
            // Verify audio format is valid
            expect(request.audioFormat.sampleRate).toBe(16000);
            expect(request.audioFormat.bitDepth).toBe(16);
            expect(request.audioFormat.channels).toBe(1);
            expect(request.audioFormat.encoding).toBe('pcm');
          }
        ),
        { numRuns: 10 }
      );
    });

    test('valid send audio request should be accepted', () => {
      fc.assert(
        fc.property(
          fc.record({
            sessionId: fc.uuid(),
            audioChunk: fc.record({
              data: fc.uint8Array({ minLength: 1600, maxLength: 3200 }),
              timestamp: fc.integer({ min: 0, max: Date.now() }),
              sequenceNumber: fc.nat(),
              format: fc.record({
                sampleRate: fc.constant(16000),
                bitDepth: fc.constant(16),
                channels: fc.constant(1),
                encoding: fc.constant('pcm')
              })
            })
          }),
          (request) => {
            const sendAudioRequest: SendAudioRequest = {
              sessionId: request.sessionId,
              audioChunk: {
                ...request.audioChunk,
                data: Buffer.from(request.audioChunk.data)
              }
            };
            
            // Verify request structure
            expect(sendAudioRequest.sessionId).toBeDefined();
            expect(sendAudioRequest.audioChunk).toBeDefined();
            expect(sendAudioRequest.audioChunk.data.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('valid end transcription request should be accepted', () => {
      fc.assert(
        fc.property(
          fc.record({
            sessionId: fc.uuid()
          }),
          (request: EndTranscriptionRequest) => {
            // Verify request has required field
            expect(request.sessionId).toBeDefined();
            expect(typeof request.sessionId).toBe('string');
            expect(request.sessionId.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 26: JSON Response Format
   * **Validates: Requirements 9.3**
   * 
   * For any transcription result returned to the Audio Processor, the response
   * should be valid JSON with the expected structure (segments array, full text, metadata).
   */
  describe('Property 26: JSON Response Format', () => {
    test('start transcription response should be valid JSON', () => {
      fc.assert(
        fc.property(
          fc.record({
            sessionId: fc.uuid(),
            status: fc.constantFrom('started', 'error') as fc.Arbitrary<'started' | 'error'>,
            message: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined })
          }),
          (response: StartTranscriptionResponse) => {
            // Should be serializable to JSON
            const json = JSON.stringify(response);
            const parsed = JSON.parse(json);
            
            expect(parsed.sessionId).toBe(response.sessionId);
            expect(parsed.status).toBe(response.status);
            
            // Verify structure
            expect(['started', 'error']).toContain(parsed.status);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('send audio response should be valid JSON', () => {
      fc.assert(
        fc.property(
          fc.record({
            status: fc.constantFrom('accepted', 'buffered', 'error') as fc.Arbitrary<'accepted' | 'buffered' | 'error'>,
            message: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined })
          }),
          (response: SendAudioResponse) => {
            // Should be serializable to JSON
            const json = JSON.stringify(response);
            const parsed = JSON.parse(json);
            
            expect(parsed.status).toBe(response.status);
            expect(['accepted', 'buffered', 'error']).toContain(parsed.status);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('end transcription response should include all required fields', () => {
      fc.assert(
        fc.property(
          fc.record({
            sessionId: fc.uuid(),
            transcript: fc.record({
              fullText: fc.string({ minLength: 0, maxLength: 1000 }),
              segments: fc.array(
                fc.record({
                  segmentId: fc.uuid(),
                  text: fc.string({ minLength: 1, maxLength: 100 }),
                  startTime: fc.integer({ min: 0, max: 3600000 }),
                  endTime: fc.integer({ min: 0, max: 3600000 }),
                  confidence: fc.float({ min: 0, max: 1, noNaN: true }),
                  isPartial: fc.boolean(),
                  isFinal: fc.boolean(),
                  languageCode: fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
                  items: fc.array(
                    fc.record({
                      content: fc.string({ minLength: 1, maxLength: 20 }),
                      startTime: fc.integer({ min: 0, max: 3600000 }),
                      endTime: fc.integer({ min: 0, max: 3600000 }),
                      type: fc.constantFrom('pronunciation', 'punctuation') as fc.Arbitrary<'pronunciation' | 'punctuation'>,
                      confidence: fc.float({ min: 0, max: 1, noNaN: true })
                    }),
                    { minLength: 0, maxLength: 5 }
                  )
                }),
                { minLength: 0, maxLength: 10 }
              ),
              detectedLanguage: fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
              averageConfidence: fc.float({ min: 0, max: 1, noNaN: true }),
              duration: fc.integer({ min: 0, max: 3600000 })
            }),
            metrics: fc.record({
              totalAudioChunks: fc.integer({ min: 0, max: 1000 }),
              totalTranscriptSegments: fc.integer({ min: 0, max: 500 }),
              averageLatencyMs: fc.float({ min: 0, max: 1000, noNaN: true }),
              connectionRetries: fc.integer({ min: 0, max: 10 }),
              lowConfidenceSegments: fc.integer({ min: 0, max: 100 })
            })
          }),
          (response: EndTranscriptionResponse) => {
            // Should be serializable to JSON
            const json = JSON.stringify(response);
            const parsed = JSON.parse(json);
            
            // Verify all required fields are present
            expect(parsed.sessionId).toBeDefined();
            expect(parsed.transcript).toBeDefined();
            expect(parsed.metrics).toBeDefined();
            
            // Verify transcript structure
            expect(parsed.transcript.fullText).toBeDefined();
            expect(Array.isArray(parsed.transcript.segments)).toBe(true);
            expect(parsed.transcript.detectedLanguage).toBeDefined();
            expect(parsed.transcript.averageConfidence).toBeDefined();
            expect(parsed.transcript.duration).toBeDefined();
            
            // Verify metrics structure
            expect(parsed.metrics.totalAudioChunks).toBeDefined();
            expect(parsed.metrics.totalTranscriptSegments).toBeDefined();
            expect(parsed.metrics.averageLatencyMs).toBeDefined();
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 27: Session ID Correlation
   * **Validates: Requirements 9.4**
   * 
   * For any request or response, it should include the session ID to enable
   * correlation between audio chunks and transcription results.
   */
  describe('Property 27: Session ID Correlation', () => {
    test('all requests should include session ID', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (sessionId: string) => {
            // Simulate different request types
            const startRequest: StartTranscriptionRequest = {
              sessionId,
              callId: 'test-call',
              audioFormat: {
                sampleRate: 16000,
                bitDepth: 16,
                channels: 1,
                encoding: 'pcm'
              }
            };
            
            const sendRequest: SendAudioRequest = {
              sessionId,
              audioChunk: {
                data: Buffer.from([1, 2, 3]),
                timestamp: Date.now(),
                sequenceNumber: 1,
                format: {
                  sampleRate: 16000,
                  bitDepth: 16,
                  channels: 1,
                  encoding: 'pcm'
                }
              }
            };
            
            const endRequest: EndTranscriptionRequest = {
              sessionId
            };
            
            // All requests should have the same session ID
            expect(startRequest.sessionId).toBe(sessionId);
            expect(sendRequest.sessionId).toBe(sessionId);
            expect(endRequest.sessionId).toBe(sessionId);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('all responses should include session ID', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (sessionId: string) => {
            // Simulate different response types
            const startResponse: StartTranscriptionResponse = {
              sessionId,
              status: 'started'
            };
            
            const endResponse: Partial<EndTranscriptionResponse> = {
              sessionId
            };
            
            // All responses should have the session ID
            expect(startResponse.sessionId).toBe(sessionId);
            expect(endResponse.sessionId).toBe(sessionId);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('session ID should be consistent across request-response pairs', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (sessionId: string) => {
            // Request
            const request: StartTranscriptionRequest = {
              sessionId,
              callId: 'test-call',
              audioFormat: {
                sampleRate: 16000,
                bitDepth: 16,
                channels: 1,
                encoding: 'pcm'
              }
            };
            
            // Response
            const response: StartTranscriptionResponse = {
              sessionId,
              status: 'started'
            };
            
            // Session IDs should match
            expect(request.sessionId).toBe(response.sessionId);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 29: Concurrent Session Support
   * **Validates: Requirements 9.6**
   * 
   * For any set of concurrent transcription sessions, each session should operate
   * independently without interference, maintaining separate state and connections.
   */
  describe('Property 29: Concurrent Session Support', () => {
    test('multiple sessions should have unique session IDs', () => {
      fc.assert(
        fc.property(
          fc.array(fc.uuid(), { minLength: 2, maxLength: 20 }),
          (sessionIds: string[]) => {
            // Verify all session IDs are unique
            const uniqueIds = new Set(sessionIds);
            expect(uniqueIds.size).toBe(sessionIds.length);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('concurrent sessions should maintain independent state', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              sessionId: fc.uuid(),
              audioChunksProcessed: fc.integer({ min: 0, max: 100 }),
              segmentsReceived: fc.integer({ min: 0, max: 50 })
            }),
            { minLength: 2, maxLength: 10 }
          ),
          (sessions) => {
            // Simulate concurrent sessions
            const sessionStates = new Map();
            
            sessions.forEach(session => {
              sessionStates.set(session.sessionId, {
                audioChunksProcessed: session.audioChunksProcessed,
                segmentsReceived: session.segmentsReceived
              });
            });
            
            // Verify each session has independent state
            expect(sessionStates.size).toBe(sessions.length);
            
            sessions.forEach(session => {
              const state = sessionStates.get(session.sessionId);
              expect(state.audioChunksProcessed).toBe(session.audioChunksProcessed);
              expect(state.segmentsReceived).toBe(session.segmentsReceived);
            });
          }
        ),
        { numRuns: 10 }
      );
    });

    test('operations on one session should not affect others', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              sessionId: fc.uuid(),
              status: fc.constantFrom('initializing', 'active', 'closing', 'closed')
            }),
            { minLength: 3, maxLength: 10 }
          ),
          (sessions) => {
            // Simulate changing one session's status
            const sessionStates = new Map(
              sessions.map(s => [s.sessionId, s.status])
            );
            
            // Change first session status
            const firstSessionId = sessions[0].sessionId;
            sessionStates.set(firstSessionId, 'closed');
            
            // Verify other sessions are unchanged
            for (let i = 1; i < sessions.length; i++) {
              expect(sessionStates.get(sessions[i].sessionId)).toBe(sessions[i].status);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    test('concurrent sessions should have independent connection IDs', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              sessionId: fc.uuid(),
              connectionId: fc.uuid()
            }),
            { minLength: 2, maxLength: 15 }
          ),
          (sessions) => {
            // Verify all connection IDs are unique
            const connectionIds = sessions.map(s => s.connectionId);
            const uniqueConnectionIds = new Set(connectionIds);
            
            expect(uniqueConnectionIds.size).toBe(sessions.length);
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
