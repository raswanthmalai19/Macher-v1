/**
 * Unit tests for type definitions
 */

import {
  AudioFormat,
  AudioChunk,
  TranscriptionConfig,
  TranscriptSegment,
  SessionMetrics,
} from '../../src/types';

describe('Type Definitions', () => {
  describe('AudioFormat', () => {
    it('should create valid audio format', () => {
      const format: AudioFormat = {
        sampleRate: 16000,
        bitDepth: 16,
        channels: 1,
        encoding: 'pcm',
      };

      expect(format.sampleRate).toBe(16000);
      expect(format.bitDepth).toBe(16);
      expect(format.channels).toBe(1);
      expect(format.encoding).toBe('pcm');
    });
  });

  describe('AudioChunk', () => {
    it('should create valid audio chunk', () => {
      const chunk: AudioChunk = {
        data: Buffer.from([1, 2, 3, 4]),
        timestamp: Date.now(),
        sequenceNumber: 1,
        format: {
          sampleRate: 16000,
          bitDepth: 16,
          channels: 1,
          encoding: 'pcm',
        },
      };

      expect(chunk.data).toBeInstanceOf(Buffer);
      expect(chunk.sequenceNumber).toBe(1);
      expect(chunk.format.sampleRate).toBe(16000);
    });
  });

  describe('TranscriptionConfig', () => {
    it('should create valid transcription config', () => {
      const config: TranscriptionConfig = {
        languageOptions: ['en-US', 'es-ES', 'zh-CN'],
        enablePartialResults: true,
        sampleRate: 16000,
        enableLanguageIdentification: true,
      };

      expect(config.languageOptions).toHaveLength(3);
      expect(config.enablePartialResults).toBe(true);
      expect(config.sampleRate).toBe(16000);
    });
  });

  describe('TranscriptSegment', () => {
    it('should create valid transcript segment', () => {
      const segment: TranscriptSegment = {
        segmentId: 'seg-123',
        text: 'Hello world',
        startTime: 0,
        endTime: 1.5,
        confidence: 0.95,
        isPartial: false,
        isFinal: true,
        languageCode: 'en-US',
        items: [],
      };

      expect(segment.text).toBe('Hello world');
      expect(segment.confidence).toBe(0.95);
      expect(segment.isFinal).toBe(true);
    });
  });

  describe('SessionMetrics', () => {
    it('should create valid session metrics', () => {
      const metrics: SessionMetrics = {
        totalAudioChunks: 100,
        totalTranscriptSegments: 50,
        averageLatencyMs: 250,
        connectionRetries: 0,
        lowConfidenceSegments: 2,
      };

      expect(metrics.totalAudioChunks).toBe(100);
      expect(metrics.averageLatencyMs).toBe(250);
      expect(metrics.lowConfidenceSegments).toBe(2);
    });
  });
});
