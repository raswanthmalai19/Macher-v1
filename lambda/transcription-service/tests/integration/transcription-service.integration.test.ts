/**
 * Integration Tests for Real-Time Audio Transcription Service
 * 
 * Tests the full flow: start session → send audio → receive results → end session
 * Uses mock Amazon Transcribe WebSocket server
 */

import { TranscriptionServiceManager } from '../../src/transcription-service-manager';
import { 
  StartTranscriptionRequest, 
  SendAudioRequest, 
  EndTranscriptionRequest,
  AudioChunk,
  AudioFormat 
} from '../../src/types';

describe('Transcription Service Integration Tests', () => {
  let serviceManager: TranscriptionServiceManager;
  
  beforeEach(() => {
    serviceManager = new TranscriptionServiceManager();
  });

  afterEach(async () => {
    await serviceManager.shutdown();
  });

  describe('Happy Path - Successful Transcription', () => {
    it('should complete full transcription flow', async () => {
      // Start session
      const startRequest: StartTranscriptionRequest = {
        sessionId: 'test-session-1',
        callId: 'call-123',
        audioFormat: {
          sampleRate: 16000,
          bitDepth: 16,
          channels: 1,
          encoding: 'pcm',
        },
        languageOptions: ['en-US', 'es-ES', 'zh-CN'],
      };

      const startResponse = await serviceManager.startSession(startRequest);
      expect(startResponse.status).toBe('started');
      expect(startResponse.sessionId).toBe('test-session-1');

      // Send audio chunks
      const audioFormat: AudioFormat = {
        sampleRate: 16000,
        bitDepth: 16,
        channels: 1,
        encoding: 'pcm',
      };

      // Create test audio data (100ms of silence at 16kHz, 16-bit, mono)
      const chunkSize = 16000 * 2 * 0.1; // 3200 bytes
      const audioData = Buffer.alloc(chunkSize);

      for (let i = 0; i < 5; i++) {
        const audioChunk: AudioChunk = {
          data: audioData,
          timestamp: Date.now(),
          sequenceNumber: i,
          format: audioFormat,
        };

        const sendRequest: SendAudioRequest = {
          sessionId: 'test-session-1',
          audioChunk,
        };

        const sendResponse = await serviceManager.processAudioChunk(sendRequest);
        expect(sendResponse.status).toBe('accepted');
      }

      // Get session status
      const status = serviceManager.getSessionStatus('test-session-1');
      expect(status.isActive).toBe(true);
      expect(status.audioChunksProcessed).toBe(5);

      // End session
      const endRequest: EndTranscriptionRequest = {
        sessionId: 'test-session-1',
      };

      const endResponse = await serviceManager.endSession(endRequest);
      expect(endResponse.sessionId).toBe('test-session-1');
      expect(endResponse.transcript).toBeDefined();
      expect(endResponse.metrics).toBeDefined();
      expect(endResponse.metrics.totalAudioChunks).toBe(5);
    }, 30000); // 30 second timeout for integration test
  });

  describe('Error Scenarios', () => {
    it('should handle invalid audio format', async () => {
      const startRequest: StartTranscriptionRequest = {
        sessionId: 'test-session-2',
        callId: 'call-456',
        audioFormat: {
          sampleRate: 16000,
          bitDepth: 16,
          channels: 1,
          encoding: 'pcm',
        },
      };

      await serviceManager.startSession(startRequest);

      // Send audio with invalid format
      const invalidAudioChunk: AudioChunk = {
        data: Buffer.alloc(0), // Empty data
        timestamp: Date.now(),
        sequenceNumber: 0,
        format: {
          sampleRate: 8000, // Wrong sample rate
          bitDepth: 8, // Wrong bit depth
          channels: 2, // Wrong channels
          encoding: 'mp3', // Wrong encoding
        },
      };

      const sendRequest: SendAudioRequest = {
        sessionId: 'test-session-2',
        audioChunk: invalidAudioChunk,
      };

      const sendResponse = await serviceManager.processAudioChunk(sendRequest);
      // Should either convert or reject
      expect(['accepted', 'error']).toContain(sendResponse.status);

      await serviceManager.endSession({ sessionId: 'test-session-2' });
    });

    it('should handle session not found', async () => {
      const sendRequest: SendAudioRequest = {
        sessionId: 'non-existent-session',
        audioChunk: {
          data: Buffer.alloc(3200),
          timestamp: Date.now(),
          sequenceNumber: 0,
          format: {
            sampleRate: 16000,
            bitDepth: 16,
            channels: 1,
            encoding: 'pcm',
          },
        },
      };

      const sendResponse = await serviceManager.processAudioChunk(sendRequest);
      expect(sendResponse.status).toBe('error');
      expect(sendResponse.message).toContain('not found');
    });

    it('should handle duplicate session start', async () => {
      const startRequest: StartTranscriptionRequest = {
        sessionId: 'test-session-3',
        callId: 'call-789',
        audioFormat: {
          sampleRate: 16000,
          bitDepth: 16,
          channels: 1,
          encoding: 'pcm',
        },
      };

      const firstStart = await serviceManager.startSession(startRequest);
      expect(firstStart.status).toBe('started');

      const secondStart = await serviceManager.startSession(startRequest);
      expect(secondStart.status).toBe('error');
      expect(secondStart.message).toContain('already exists');

      await serviceManager.endSession({ sessionId: 'test-session-3' });
    });
  });

  describe('Concurrent Sessions', () => {
    it('should handle multiple concurrent sessions', async () => {
      const sessions = ['session-a', 'session-b', 'session-c'];
      
      // Start all sessions
      for (const sessionId of sessions) {
        const startRequest: StartTranscriptionRequest = {
          sessionId,
          callId: `call-${sessionId}`,
          audioFormat: {
            sampleRate: 16000,
            bitDepth: 16,
            channels: 1,
            encoding: 'pcm',
          },
        };

        const response = await serviceManager.startSession(startRequest);
        expect(response.status).toBe('started');
      }

      // Send audio to all sessions
      const audioData = Buffer.alloc(3200);
      for (const sessionId of sessions) {
        const sendRequest: SendAudioRequest = {
          sessionId,
          audioChunk: {
            data: audioData,
            timestamp: Date.now(),
            sequenceNumber: 0,
            format: {
              sampleRate: 16000,
              bitDepth: 16,
              channels: 1,
              encoding: 'pcm',
            },
          },
        };

        const response = await serviceManager.processAudioChunk(sendRequest);
        expect(response.status).toBe('accepted');
      }

      // Verify all sessions are independent
      for (const sessionId of sessions) {
        const status = serviceManager.getSessionStatus(sessionId);
        expect(status.isActive).toBe(true);
        expect(status.audioChunksProcessed).toBe(1);
      }

      // End all sessions
      for (const sessionId of sessions) {
        await serviceManager.endSession({ sessionId });
      }
    }, 30000);
  });

  describe('Cost Tracking', () => {
    it('should track cumulative transcription duration', async () => {
      const initialDuration = serviceManager.getCumulativeTranscriptionDuration();

      const startRequest: StartTranscriptionRequest = {
        sessionId: 'test-session-cost',
        callId: 'call-cost',
        audioFormat: {
          sampleRate: 16000,
          bitDepth: 16,
          channels: 1,
          encoding: 'pcm',
        },
      };

      await serviceManager.startSession(startRequest);

      // Send 10 chunks (1 second of audio)
      const audioData = Buffer.alloc(3200);
      for (let i = 0; i < 10; i++) {
        await serviceManager.processAudioChunk({
          sessionId: 'test-session-cost',
          audioChunk: {
            data: audioData,
            timestamp: Date.now(),
            sequenceNumber: i,
            format: {
              sampleRate: 16000,
              bitDepth: 16,
              channels: 1,
              encoding: 'pcm',
            },
          },
        });
      }

      await serviceManager.endSession({ sessionId: 'test-session-cost' });

      const finalDuration = serviceManager.getCumulativeTranscriptionDuration();
      expect(finalDuration).toBeGreaterThan(initialDuration);
    });
  });

  describe('Performance Metrics', () => {
    it('should collect session metrics', async () => {
      const startRequest: StartTranscriptionRequest = {
        sessionId: 'test-session-metrics',
        callId: 'call-metrics',
        audioFormat: {
          sampleRate: 16000,
          bitDepth: 16,
          channels: 1,
          encoding: 'pcm',
        },
      };

      await serviceManager.startSession(startRequest);

      // Send audio chunks
      const audioData = Buffer.alloc(3200);
      for (let i = 0; i < 3; i++) {
        await serviceManager.processAudioChunk({
          sessionId: 'test-session-metrics',
          audioChunk: {
            data: audioData,
            timestamp: Date.now(),
            sequenceNumber: i,
            format: {
              sampleRate: 16000,
              bitDepth: 16,
              channels: 1,
              encoding: 'pcm',
            },
          },
        });
      }

      const endResponse = await serviceManager.endSession({ 
        sessionId: 'test-session-metrics' 
      });

      expect(endResponse.metrics).toBeDefined();
      expect(endResponse.metrics.totalAudioChunks).toBe(3);
      expect(endResponse.metrics.averageLatencyMs).toBeGreaterThanOrEqual(0);
      expect(endResponse.metrics.connectionRetries).toBeGreaterThanOrEqual(0);
    });
  });
});
