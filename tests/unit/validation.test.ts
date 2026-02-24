/**
 * Unit tests for validation module
 * 
 * Tests validation logic for all API inputs to ensure proper error handling
 * and descriptive error messages for malformed requests.
 * 
 * Requirements: 9.5
 */

import {
  validateAudioFormat,
  validateAudioChunk,
  validateLanguageOptions,
  validateStartTranscriptionRequest,
  validateSendAudioRequest,
  validateEndTranscriptionRequest,
  validateAndParseJSON,
} from '../../lambda/transcription-service/src/validation';
import { AudioFormat, AudioChunk } from '../../lambda/transcription-service/src/types';

describe('Validation Module', () => {
  describe('validateAndParseJSON', () => {
    it('should reject undefined body', () => {
      const result = validateAndParseJSON(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Request body is required');
    });

    it('should reject empty string', () => {
      const result = validateAndParseJSON('   ');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Request body cannot be empty');
    });

    it('should reject invalid JSON', () => {
      const result = validateAndParseJSON('{ invalid json }');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Invalid JSON');
    });

    it('should accept valid JSON', () => {
      const result = validateAndParseJSON('{"key": "value"}');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ key: 'value' });
      expect(result.errors).toEqual([]);
    });
  });

  describe('validateAudioFormat', () => {
    const validFormat: AudioFormat = {
      sampleRate: 16000,
      bitDepth: 16,
      channels: 1,
      encoding: 'pcm',
    };

    it('should accept valid audio format', () => {
      const result = validateAudioFormat(validFormat);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject non-object format', () => {
      const result = validateAudioFormat('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('audioFormat must be an object');
    });

    it('should reject invalid sample rate', () => {
      const result = validateAudioFormat({ ...validFormat, sampleRate: 8000 });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sampleRate'))).toBe(true);
    });

    it('should reject missing sample rate', () => {
      const format = { ...validFormat };
      delete (format as any).sampleRate;
      const result = validateAudioFormat(format);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sampleRate'))).toBe(true);
    });

    it('should reject invalid bit depth', () => {
      const result = validateAudioFormat({ ...validFormat, bitDepth: 8 });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('bitDepth'))).toBe(true);
    });

    it('should reject invalid channels', () => {
      const result = validateAudioFormat({ ...validFormat, channels: 2 });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('channels'))).toBe(true);
    });

    it('should reject invalid encoding', () => {
      const result = validateAudioFormat({ ...validFormat, encoding: 'mp3' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('encoding'))).toBe(true);
    });

    it('should reject empty encoding', () => {
      const result = validateAudioFormat({ ...validFormat, encoding: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('encoding'))).toBe(true);
    });

    it('should accept case-insensitive PCM encoding', () => {
      const result = validateAudioFormat({ ...validFormat, encoding: 'PCM' });
      expect(result.valid).toBe(true);
    });
  });

  describe('validateAudioChunk', () => {
    const validChunk: AudioChunk = {
      data: Buffer.from([1, 2, 3, 4]),
      timestamp: Date.now(),
      sequenceNumber: 0,
      format: {
        sampleRate: 16000,
        bitDepth: 16,
        channels: 1,
        encoding: 'pcm',
      },
    };

    it('should accept valid audio chunk', () => {
      const result = validateAudioChunk(validChunk);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject non-object chunk', () => {
      const result = validateAudioChunk('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('audioChunk must be an object');
    });

    it('should reject empty buffer', () => {
      const result = validateAudioChunk({ ...validChunk, data: Buffer.from([]) });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('data'))).toBe(true);
    });

    it('should accept valid base64 string', () => {
      const base64Data = Buffer.from([1, 2, 3, 4]).toString('base64');
      const result = validateAudioChunk({ ...validChunk, data: base64Data as any });
      expect(result.valid).toBe(true);
    });

    it('should reject invalid base64 string', () => {
      const result = validateAudioChunk({ ...validChunk, data: 'not-base64!!!' as any });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('data'))).toBe(true);
    });

    it('should reject future timestamp', () => {
      const futureTime = Date.now() + 120000; // 2 minutes in future
      const result = validateAudioChunk({ ...validChunk, timestamp: futureTime });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('future'))).toBe(true);
    });

    it('should reject very old timestamp', () => {
      const oldTime = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
      const result = validateAudioChunk({ ...validChunk, timestamp: oldTime });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('too old'))).toBe(true);
    });

    it('should reject negative sequence number', () => {
      const result = validateAudioChunk({ ...validChunk, sequenceNumber: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sequenceNumber'))).toBe(true);
    });

    it('should accept zero sequence number', () => {
      const result = validateAudioChunk({ ...validChunk, sequenceNumber: 0 });
      expect(result.valid).toBe(true);
    });

    it('should reject missing format', () => {
      const chunk = { ...validChunk };
      delete (chunk as any).format;
      const result = validateAudioChunk(chunk);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('format'))).toBe(true);
    });

    it('should reject invalid format', () => {
      const result = validateAudioChunk({
        ...validChunk,
        format: { ...validChunk.format, sampleRate: 8000 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sampleRate'))).toBe(true);
    });
  });

  describe('validateLanguageOptions', () => {
    it('should accept valid language options', () => {
      const result = validateLanguageOptions(['en-US', 'es-ES', 'zh-CN']);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject non-array', () => {
      const result = validateLanguageOptions('en-US');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('languageOptions must be an array');
    });

    it('should reject empty array', () => {
      const result = validateLanguageOptions([]);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('at least one'))).toBe(true);
    });

    it('should reject invalid language code', () => {
      const result = validateLanguageOptions(['en-US', 'invalid-code']);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('invalid language code'))).toBe(true);
    });

    it('should reject non-string elements', () => {
      const result = validateLanguageOptions(['en-US', 123 as any]);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('non-empty string'))).toBe(true);
    });

    it('should accept all supported language codes', () => {
      const validCodes = ['en-US', 'es-ES', 'zh-CN', 'en-GB', 'fr-FR', 'de-DE', 'it-IT', 'pt-BR', 'ja-JP', 'ko-KR'];
      const result = validateLanguageOptions(validCodes);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateStartTranscriptionRequest', () => {
    const validRequest = {
      sessionId: 'session-123',
      callId: 'call-456',
      audioFormat: {
        sampleRate: 16000,
        bitDepth: 16,
        channels: 1,
        encoding: 'pcm',
      },
      languageOptions: ['en-US', 'es-ES'],
    };

    it('should accept valid request', () => {
      const result = validateStartTranscriptionRequest(validRequest);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject non-object request', () => {
      const result = validateStartTranscriptionRequest('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Request must be an object');
    });

    it('should reject missing sessionId', () => {
      const request = { ...validRequest };
      delete (request as any).sessionId;
      const result = validateStartTranscriptionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sessionId'))).toBe(true);
    });

    it('should reject empty sessionId', () => {
      const result = validateStartTranscriptionRequest({ ...validRequest, sessionId: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sessionId'))).toBe(true);
    });

    it('should reject too long sessionId', () => {
      const longId = 'a'.repeat(300);
      const result = validateStartTranscriptionRequest({ ...validRequest, sessionId: longId });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sessionId') && e.includes('256'))).toBe(true);
    });

    it('should reject missing callId', () => {
      const request = { ...validRequest };
      delete (request as any).callId;
      const result = validateStartTranscriptionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('callId'))).toBe(true);
    });

    it('should reject missing audioFormat', () => {
      const request = { ...validRequest };
      delete (request as any).audioFormat;
      const result = validateStartTranscriptionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('audioFormat'))).toBe(true);
    });

    it('should reject invalid audioFormat', () => {
      const result = validateStartTranscriptionRequest({
        ...validRequest,
        audioFormat: { ...validRequest.audioFormat, sampleRate: 8000 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sampleRate'))).toBe(true);
    });

    it('should accept request without languageOptions', () => {
      const request = { ...validRequest };
      delete (request as any).languageOptions;
      const result = validateStartTranscriptionRequest(request);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid languageOptions', () => {
      const result = validateStartTranscriptionRequest({
        ...validRequest,
        languageOptions: ['invalid-code'],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('invalid language code'))).toBe(true);
    });
  });

  describe('validateSendAudioRequest', () => {
    const validRequest = {
      sessionId: 'session-123',
      audioChunk: {
        data: Buffer.from([1, 2, 3, 4]),
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

    it('should accept valid request', () => {
      const result = validateSendAudioRequest(validRequest);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject non-object request', () => {
      const result = validateSendAudioRequest('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Request must be an object');
    });

    it('should reject missing sessionId', () => {
      const request = { ...validRequest };
      delete (request as any).sessionId;
      const result = validateSendAudioRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sessionId'))).toBe(true);
    });

    it('should reject missing audioChunk', () => {
      const request = { ...validRequest };
      delete (request as any).audioChunk;
      const result = validateSendAudioRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('audioChunk'))).toBe(true);
    });

    it('should reject invalid audioChunk', () => {
      const result = validateSendAudioRequest({
        ...validRequest,
        audioChunk: {
          ...validRequest.audioChunk,
          sequenceNumber: -1,
        },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sequenceNumber'))).toBe(true);
    });
  });

  describe('validateEndTranscriptionRequest', () => {
    const validRequest = {
      sessionId: 'session-123',
    };

    it('should accept valid request', () => {
      const result = validateEndTranscriptionRequest(validRequest);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject non-object request', () => {
      const result = validateEndTranscriptionRequest('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Request must be an object');
    });

    it('should reject missing sessionId', () => {
      const result = validateEndTranscriptionRequest({});
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sessionId'))).toBe(true);
    });

    it('should reject empty sessionId', () => {
      const result = validateEndTranscriptionRequest({ sessionId: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sessionId'))).toBe(true);
    });

    it('should reject too long sessionId', () => {
      const longId = 'a'.repeat(300);
      const result = validateEndTranscriptionRequest({ sessionId: longId });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sessionId') && e.includes('256'))).toBe(true);
    });
  });

  describe('Edge cases and error messages', () => {
    it('should provide descriptive error for multiple validation failures', () => {
      const invalidRequest = {
        sessionId: '',
        callId: '',
        audioFormat: {
          sampleRate: 8000,
          bitDepth: 8,
          channels: 2,
          encoding: 'mp3',
        },
      };
      const result = validateStartTranscriptionRequest(invalidRequest);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(3);
    });

    it('should handle null values gracefully', () => {
      const result = validateStartTranscriptionRequest(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Request must be an object');
    });

    it('should handle undefined values gracefully', () => {
      const result = validateStartTranscriptionRequest(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Request must be an object');
    });
  });
});
