/**
 * Unit tests for analysis threshold checker
 * 
 * Requirements 3.7: Trigger fraud analysis when transcription reaches 50 words OR 10 seconds of speech
 * 
 * Task 7.3: Write unit tests for threshold logic
 */

import { CallSessionState, checkAnalysisThreshold, triggerFraudAnalysis } from './index';

// Mock the log function to avoid console output during tests
jest.mock('./index', () => {
  const actual = jest.requireActual('./index');
  return {
    ...actual,
    log: jest.fn(),
  };
});

describe('Analysis Threshold Checker - Unit Tests', () => {
  describe('checkAnalysisThreshold', () => {
    test('should trigger analysis at exactly 50 words (speechDuration < 10)', () => {
      const session: CallSessionState = {
        callSessionId: 'test-session-1',
        connectionId: 'test-connection-1',
        startTime: Date.now(),
        transcriptionBuffer: ['test transcription with fifty words'],
        wordCount: 50,
        speechDuration: 5,
        lastAnalysisTime: 0,
        analysisCount: 0,
        currentRiskScore: 0,
        currentThreatLevel: 'SAFE',
      };

      const result = checkAnalysisThreshold(session);
      expect(result).toBe(true);
    });

    test('should trigger analysis at exactly 10 seconds (wordCount < 50)', () => {
      const session: CallSessionState = {
        callSessionId: 'test-session-2',
        connectionId: 'test-connection-2',
        startTime: Date.now(),
        transcriptionBuffer: ['short transcription'],
        wordCount: 20,
        speechDuration: 10,
        lastAnalysisTime: 0,
        analysisCount: 0,
        currentRiskScore: 0,
        currentThreatLevel: 'SAFE',
      };

      const result = checkAnalysisThreshold(session);
      expect(result).toBe(true);
    });

    test('should NOT trigger analysis below both thresholds (wordCount < 50 AND speechDuration < 10)', () => {
      const session: CallSessionState = {
        callSessionId: 'test-session-3',
        connectionId: 'test-connection-3',
        startTime: Date.now(),
        transcriptionBuffer: ['short text'],
        wordCount: 30,
        speechDuration: 5,
        lastAnalysisTime: 0,
        analysisCount: 0,
        currentRiskScore: 0,
        currentThreatLevel: 'SAFE',
      };

      const result = checkAnalysisThreshold(session);
      expect(result).toBe(false);
    });

    test('should trigger analysis when word count exceeds 50 words', () => {
      const session: CallSessionState = {
        callSessionId: 'test-session-4',
        connectionId: 'test-connection-4',
        startTime: Date.now(),
        transcriptionBuffer: ['test transcription'],
        wordCount: 75,
        speechDuration: 5,
        lastAnalysisTime: 0,
        analysisCount: 0,
        currentRiskScore: 0,
        currentThreatLevel: 'SAFE',
      };

      const result = checkAnalysisThreshold(session);
      expect(result).toBe(true);
    });

    test('should trigger analysis when speech duration exceeds 10 seconds', () => {
      const session: CallSessionState = {
        callSessionId: 'test-session-5',
        connectionId: 'test-connection-5',
        startTime: Date.now(),
        transcriptionBuffer: ['test transcription'],
        wordCount: 20,
        speechDuration: 15.5,
        lastAnalysisTime: 0,
        analysisCount: 0,
        currentRiskScore: 0,
        currentThreatLevel: 'SAFE',
      };

      const result = checkAnalysisThreshold(session);
      expect(result).toBe(true);
    });

    test('should trigger analysis when both thresholds are met', () => {
      const session: CallSessionState = {
        callSessionId: 'test-session-6',
        connectionId: 'test-connection-6',
        startTime: Date.now(),
        transcriptionBuffer: ['test transcription'],
        wordCount: 60,
        speechDuration: 12,
        lastAnalysisTime: 0,
        analysisCount: 0,
        currentRiskScore: 0,
        currentThreatLevel: 'SAFE',
      };

      const result = checkAnalysisThreshold(session);
      expect(result).toBe(true);
    });

    test('should NOT trigger at 49 words and 9 seconds', () => {
      const session: CallSessionState = {
        callSessionId: 'test-session-7',
        connectionId: 'test-connection-7',
        startTime: Date.now(),
        transcriptionBuffer: ['test'],
        wordCount: 49,
        speechDuration: 9,
        lastAnalysisTime: 0,
        analysisCount: 0,
        currentRiskScore: 0,
        currentThreatLevel: 'SAFE',
      };

      const result = checkAnalysisThreshold(session);
      expect(result).toBe(false);
    });
  });

  describe('triggerFraudAnalysis - Buffer Clearing', () => {
    test('should clear transcription buffer after analysis', async () => {
      const session: CallSessionState = {
        callSessionId: 'test-session-8',
        connectionId: 'test-connection-8',
        startTime: Date.now(),
        transcriptionBuffer: ['segment 1', 'segment 2', 'segment 3'],
        wordCount: 50,
        speechDuration: 10,
        lastAnalysisTime: 0,
        analysisCount: 0,
        currentRiskScore: 0,
        currentThreatLevel: 'SAFE',
      };

      expect(session.transcriptionBuffer.length).toBe(3);
      
      await triggerFraudAnalysis(session);
      
      expect(session.transcriptionBuffer).toEqual([]);
      expect(session.transcriptionBuffer.length).toBe(0);
    });

    test('should reset word count to 0 after analysis', async () => {
      const session: CallSessionState = {
        callSessionId: 'test-session-9',
        connectionId: 'test-connection-9',
        startTime: Date.now(),
        transcriptionBuffer: ['test'],
        wordCount: 50,
        speechDuration: 10,
        lastAnalysisTime: 0,
        analysisCount: 0,
        currentRiskScore: 0,
        currentThreatLevel: 'SAFE',
      };

      expect(session.wordCount).toBe(50);
      
      await triggerFraudAnalysis(session);
      
      expect(session.wordCount).toBe(0);
    });

    test('should reset speech duration to 0 after analysis', async () => {
      const session: CallSessionState = {
        callSessionId: 'test-session-10',
        connectionId: 'test-connection-10',
        startTime: Date.now(),
        transcriptionBuffer: ['test'],
        wordCount: 50,
        speechDuration: 10,
        lastAnalysisTime: 0,
        analysisCount: 0,
        currentRiskScore: 0,
        currentThreatLevel: 'SAFE',
      };

      expect(session.speechDuration).toBe(10);
      
      await triggerFraudAnalysis(session);
      
      expect(session.speechDuration).toBe(0);
    });

    test('should update lastAnalysisTime after analysis', async () => {
      const beforeTime = Date.now();
      
      const session: CallSessionState = {
        callSessionId: 'test-session-11',
        connectionId: 'test-connection-11',
        startTime: Date.now(),
        transcriptionBuffer: ['test'],
        wordCount: 50,
        speechDuration: 10,
        lastAnalysisTime: 0,
        analysisCount: 0,
        currentRiskScore: 0,
        currentThreatLevel: 'SAFE',
      };

      expect(session.lastAnalysisTime).toBe(0);
      
      await triggerFraudAnalysis(session);
      
      expect(session.lastAnalysisTime).toBeGreaterThanOrEqual(beforeTime);
      expect(session.lastAnalysisTime).toBeLessThanOrEqual(Date.now());
    });

    test('should increment analysisCount after analysis', async () => {
      const session: CallSessionState = {
        callSessionId: 'test-session-12',
        connectionId: 'test-connection-12',
        startTime: Date.now(),
        transcriptionBuffer: ['test'],
        wordCount: 50,
        speechDuration: 10,
        lastAnalysisTime: 0,
        analysisCount: 0,
        currentRiskScore: 0,
        currentThreatLevel: 'SAFE',
      };

      expect(session.analysisCount).toBe(0);
      
      await triggerFraudAnalysis(session);
      
      expect(session.analysisCount).toBe(1);
    });

    test('should handle multiple analyses in same session', async () => {
      const session: CallSessionState = {
        callSessionId: 'test-session-13',
        connectionId: 'test-connection-13',
        startTime: Date.now(),
        transcriptionBuffer: ['test'],
        wordCount: 50,
        speechDuration: 10,
        lastAnalysisTime: Date.now() - 5000,
        analysisCount: 2,
        currentRiskScore: 0,
        currentThreatLevel: 'SAFE',
      };

      expect(session.analysisCount).toBe(2);
      
      await triggerFraudAnalysis(session);
      
      expect(session.analysisCount).toBe(3);
    });

    test('should clear large buffer to prevent memory overflow', async () => {
      const largeBuffer = Array(100).fill('test segment');
      const session: CallSessionState = {
        callSessionId: 'test-session-14',
        connectionId: 'test-connection-14',
        startTime: Date.now(),
        transcriptionBuffer: largeBuffer,
        wordCount: 200,
        speechDuration: 20,
        lastAnalysisTime: 0,
        analysisCount: 0,
        currentRiskScore: 0,
        currentThreatLevel: 'SAFE',
      };

      expect(session.transcriptionBuffer.length).toBe(100);
      
      await triggerFraudAnalysis(session);
      
      expect(session.transcriptionBuffer).toEqual([]);
      expect(session.transcriptionBuffer.length).toBe(0);
    });

    test('should reset all buffer-related fields after analysis', async () => {
      const session: CallSessionState = {
        callSessionId: 'test-session-15',
        connectionId: 'test-connection-15',
        startTime: Date.now(),
        transcriptionBuffer: ['segment 1', 'segment 2'],
        wordCount: 75,
        speechDuration: 15,
        lastAnalysisTime: 0,
        analysisCount: 0,
        currentRiskScore: 0,
        currentThreatLevel: 'SAFE',
      };

      await triggerFraudAnalysis(session);
      
      // Verify all buffer-related fields are reset
      expect(session.transcriptionBuffer).toEqual([]);
      expect(session.wordCount).toBe(0);
      expect(session.speechDuration).toBe(0);
      expect(session.analysisCount).toBe(1);
      expect(session.lastAnalysisTime).toBeGreaterThan(0);
    });
  });
});
