/**
 * Unit tests for Transcribe Streaming Client
 * 
 * Validates Requirements 3.1, 3.2, 3.3
 */

import { TranscribeStreamingService, createTranscribeService } from './transcribe-client';

describe('TranscribeStreamingService', () => {
  describe('Configuration', () => {
    test('should initialize with default configuration', () => {
      const service = createTranscribeService();
      const config = service.getConfig();

      // Requirement 3.1: Initialize with us-east-1 region
      expect(config.region).toBe('us-east-1');
      
      // Requirement 3.2: Configure with 16kHz sample rate and PCM encoding
      expect(config.mediaSampleRateHertz).toBe(16000);
      expect(config.mediaEncoding).toBe('pcm');
      
      // Requirement 3.3: Enable partial results stabilization with high stability
      expect(config.enablePartialResultsStabilization).toBe(true);
      expect(config.partialResultsStability).toBe('high');
      
      // Language code should be undefined for auto-detect
      expect(config.languageCode).toBeUndefined();
    });

    test('should allow custom configuration', () => {
      const service = createTranscribeService({
        region: 'us-west-2',
        partialResultsStability: 'medium',
      });
      const config = service.getConfig();

      expect(config.region).toBe('us-west-2');
      expect(config.partialResultsStability).toBe('medium');
      
      // Other defaults should remain
      expect(config.mediaSampleRateHertz).toBe(16000);
      expect(config.mediaEncoding).toBe('pcm');
      expect(config.enablePartialResultsStabilization).toBe(true);
    });

    test('should support explicit language code', () => {
      const service = createTranscribeService({
        languageCode: 'en-US',
      });
      const config = service.getConfig();

      expect(config.languageCode).toBe('en-US');
    });
  });

  describe('Audio Stream Creation', () => {
    test('should create service instance', () => {
      const service = createTranscribeService();
      expect(service).toBeInstanceOf(TranscribeStreamingService);
    });

    test('should expose transcribeAudioChunk method', () => {
      const service = createTranscribeService();
      expect(typeof service.transcribeAudioChunk).toBe('function');
    });

    test('should expose startStreamTranscription method', () => {
      const service = createTranscribeService();
      expect(typeof service.startStreamTranscription).toBe('function');
    });
  });

  describe('Configuration Validation', () => {
    test('should validate sample rate is 16000', () => {
      const service = createTranscribeService();
      const config = service.getConfig();
      
      // Requirement 3.2: MediaSampleRateHertz must be 16000
      expect(config.mediaSampleRateHertz).toBe(16000);
    });

    test('should validate encoding is PCM', () => {
      const service = createTranscribeService();
      const config = service.getConfig();
      
      // Requirement 3.2: MediaEncoding must be pcm
      expect(config.mediaEncoding).toBe('pcm');
    });

    test('should validate partial results stabilization is enabled', () => {
      const service = createTranscribeService();
      const config = service.getConfig();
      
      // Requirement 3.3: EnablePartialResultsStabilization must be true
      expect(config.enablePartialResultsStabilization).toBe(true);
    });

    test('should validate partial results stability is high', () => {
      const service = createTranscribeService();
      const config = service.getConfig();
      
      // Requirement 3.3: PartialResultsStability must be high
      expect(config.partialResultsStability).toBe('high');
    });
  });
});

describe('Example 1: Transcribe Configuration', () => {
  /**
   * Example 1: Transcribe Configuration
   * Validates: Requirements 3.2, 3.3
   * 
   * Verify Transcribe is configured with language detection (English, Spanish, Mandarin)
   * and partial results stabilization
   */
  test('should configure Transcribe with language detection and partial results stabilization', () => {
    const service = createTranscribeService();
    const config = service.getConfig();

    // Requirement 3.2: Language detection for English, Spanish, and Mandarin
    // When languageCode is undefined, auto-detect is enabled
    expect(config.languageCode).toBeUndefined();
    
    // Requirement 3.2: MediaSampleRateHertz: 16000
    expect(config.mediaSampleRateHertz).toBe(16000);
    
    // Requirement 3.2: MediaEncoding: pcm
    expect(config.mediaEncoding).toBe('pcm');
    
    // Requirement 3.3: EnablePartialResultsStabilization: true
    expect(config.enablePartialResultsStabilization).toBe(true);
    
    // Requirement 3.3: PartialResultsStability: high
    expect(config.partialResultsStability).toBe('high');
  });

  test('should support explicit language codes for English, Spanish, and Mandarin', () => {
    // Test English
    const serviceEN = createTranscribeService({ languageCode: 'en-US' });
    expect(serviceEN.getConfig().languageCode).toBe('en-US');
    
    // Test Spanish
    const serviceES = createTranscribeService({ languageCode: 'es-US' });
    expect(serviceES.getConfig().languageCode).toBe('es-US');
    
    // Test Mandarin
    const serviceZH = createTranscribeService({ languageCode: 'zh-CN' });
    expect(serviceZH.getConfig().languageCode).toBe('zh-CN');
  });
});
