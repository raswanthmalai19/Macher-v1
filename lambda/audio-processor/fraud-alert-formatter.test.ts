import { formatFraudAlertMessage } from './index';
import { FraudAnalysisResult } from './bedrock-client';

/**
 * Unit tests for fraud alert message formatter
 * 
 * Requirements 5.2: Format FraudAnalysisResponse as JSON containing Risk_Score, 
 * Threat_Level, fraud indicators, and timestamp
 * 
 * Tests verify:
 * - All required fields are present in formatted message
 * - Reasoning is truncated to 200 characters
 * - Invalid values are normalized to safe defaults
 * - Fraud indicators are simplified for mobile display
 */

describe('formatFraudAlertMessage', () => {
  describe('Valid fraud analysis results', () => {
    it('should format a complete fraud analysis result with all fields', () => {
      const analysisResult: FraudAnalysisResult = {
        riskScore: 85,
        threatLevel: 'DANGER',
        fraudIndicators: [
          {
            type: 'URGENCY',
            description: 'Caller is pressuring for immediate action',
            confidence: 0.9,
          },
          {
            type: 'PAYMENT_REQUEST',
            description: 'Requesting payment via gift cards',
            confidence: 0.85,
          },
        ],
        reasoning: 'This call exhibits multiple fraud indicators including urgency tactics and unusual payment methods.',
        knowledgeBaseReferences: ['irs-scams.md'],
        tokenUsage: {
          inputTokens: 150,
          outputTokens: 75,
        },
      };

      const callSessionId = 'test-session-123';
      const result = formatFraudAlertMessage(analysisResult, callSessionId);

      // Verify message type
      expect(result.type).toBe('fraud_analysis');

      // Verify call session ID
      expect(result.callSessionId).toBe(callSessionId);

      // Verify timestamp is present and recent
      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('number');
      expect(result.timestamp).toBeGreaterThan(Date.now() - 1000); // Within last second

      // Verify risk score
      expect(result.riskScore).toBe(85);

      // Verify threat level
      expect(result.threatLevel).toBe('DANGER');

      // Verify fraud indicators are simplified (no confidence field)
      expect(result.fraudIndicators).toHaveLength(2);
      expect(result.fraudIndicators[0]).toEqual({
        type: 'URGENCY',
        description: 'Caller is pressuring for immediate action',
      });
      expect(result.fraudIndicators[1]).toEqual({
        type: 'PAYMENT_REQUEST',
        description: 'Requesting payment via gift cards',
      });

      // Verify reasoning is preserved (under 200 chars)
      expect(result.reasoning).toBe(analysisResult.reasoning);
    });

    it('should format a SAFE threat level result', () => {
      const analysisResult: FraudAnalysisResult = {
        riskScore: 15,
        threatLevel: 'SAFE',
        fraudIndicators: [],
        reasoning: 'No fraud indicators detected in this conversation.',
        knowledgeBaseReferences: [],
        tokenUsage: {
          inputTokens: 100,
          outputTokens: 50,
        },
      };

      const result = formatFraudAlertMessage(analysisResult, 'safe-call-456');

      expect(result.type).toBe('fraud_analysis');
      expect(result.riskScore).toBe(15);
      expect(result.threatLevel).toBe('SAFE');
      expect(result.fraudIndicators).toHaveLength(0);
      expect(result.reasoning).toBe('No fraud indicators detected in this conversation.');
    });

    it('should format a CAUTION threat level result', () => {
      const analysisResult: FraudAnalysisResult = {
        riskScore: 50,
        threatLevel: 'CAUTION',
        fraudIndicators: [
          {
            type: 'PERSONAL_INFO_REQUEST',
            description: 'Caller is asking for personal information',
            confidence: 0.6,
          },
        ],
        reasoning: 'Some suspicious elements detected. Exercise caution.',
        knowledgeBaseReferences: [],
        tokenUsage: {
          inputTokens: 120,
          outputTokens: 60,
        },
      };

      const result = formatFraudAlertMessage(analysisResult, 'caution-call-789');

      expect(result.type).toBe('fraud_analysis');
      expect(result.riskScore).toBe(50);
      expect(result.threatLevel).toBe('CAUTION');
      expect(result.fraudIndicators).toHaveLength(1);
      expect(result.fraudIndicators[0].type).toBe('PERSONAL_INFO_REQUEST');
    });
  });

  describe('Reasoning truncation', () => {
    it('should truncate reasoning to 200 characters for mobile display', () => {
      const longReasoning = 'This is a very long reasoning text that exceeds 200 characters. '.repeat(10);
      
      const analysisResult: FraudAnalysisResult = {
        riskScore: 75,
        threatLevel: 'DANGER',
        fraudIndicators: [],
        reasoning: longReasoning,
        knowledgeBaseReferences: [],
        tokenUsage: {
          inputTokens: 200,
          outputTokens: 100,
        },
      };

      const result = formatFraudAlertMessage(analysisResult, 'long-reasoning-call');

      // Verify reasoning is truncated to 200 characters (197 + '...')
      expect(result.reasoning.length).toBe(200);
      expect(result.reasoning.endsWith('...')).toBe(true);
      expect(result.reasoning.substring(0, 197)).toBe(longReasoning.substring(0, 197));
    });

    it('should preserve reasoning under 200 characters without truncation', () => {
      const shortReasoning = 'This is a short reasoning text.';
      
      const analysisResult: FraudAnalysisResult = {
        riskScore: 40,
        threatLevel: 'CAUTION',
        fraudIndicators: [],
        reasoning: shortReasoning,
        knowledgeBaseReferences: [],
        tokenUsage: {
          inputTokens: 80,
          outputTokens: 40,
        },
      };

      const result = formatFraudAlertMessage(analysisResult, 'short-reasoning-call');

      // Verify reasoning is preserved exactly
      expect(result.reasoning).toBe(shortReasoning);
      expect(result.reasoning.length).toBeLessThan(200);
    });

    it('should handle reasoning at exactly 200 characters', () => {
      const exactReasoning = 'a'.repeat(200);
      
      const analysisResult: FraudAnalysisResult = {
        riskScore: 60,
        threatLevel: 'CAUTION',
        fraudIndicators: [],
        reasoning: exactReasoning,
        knowledgeBaseReferences: [],
        tokenUsage: {
          inputTokens: 150,
          outputTokens: 75,
        },
      };

      const result = formatFraudAlertMessage(analysisResult, 'exact-reasoning-call');

      // Verify reasoning is preserved (exactly 200 chars, no truncation needed)
      expect(result.reasoning).toBe(exactReasoning);
      expect(result.reasoning.length).toBe(200);
    });
  });

  describe('Invalid or missing values', () => {
    it('should use default CAUTION values for invalid risk score', () => {
      const analysisResult: FraudAnalysisResult = {
        riskScore: -10, // Invalid: negative
        threatLevel: 'SAFE',
        fraudIndicators: [],
        reasoning: 'Test',
        knowledgeBaseReferences: [],
        tokenUsage: {
          inputTokens: 50,
          outputTokens: 25,
        },
      };

      const result = formatFraudAlertMessage(analysisResult, 'invalid-score-call');

      // Should default to 50 (CAUTION range)
      expect(result.riskScore).toBe(50);
    });

    it('should use default CAUTION values for risk score over 100', () => {
      const analysisResult: FraudAnalysisResult = {
        riskScore: 150, // Invalid: over 100
        threatLevel: 'DANGER',
        fraudIndicators: [],
        reasoning: 'Test',
        knowledgeBaseReferences: [],
        tokenUsage: {
          inputTokens: 50,
          outputTokens: 25,
        },
      };

      const result = formatFraudAlertMessage(analysisResult, 'over-100-call');

      // Should default to 50 (CAUTION range)
      expect(result.riskScore).toBe(50);
    });

    it('should use default CAUTION for invalid threat level', () => {
      const analysisResult: FraudAnalysisResult = {
        riskScore: 70,
        threatLevel: 'INVALID' as any, // Invalid threat level
        fraudIndicators: [],
        reasoning: 'Test',
        knowledgeBaseReferences: [],
        tokenUsage: {
          inputTokens: 50,
          outputTokens: 25,
        },
      };

      const result = formatFraudAlertMessage(analysisResult, 'invalid-threat-call');

      // Should default to CAUTION
      expect(result.threatLevel).toBe('CAUTION');
    });

    it('should use default reasoning when missing', () => {
      const analysisResult: FraudAnalysisResult = {
        riskScore: 45,
        threatLevel: 'CAUTION',
        fraudIndicators: [],
        reasoning: '', // Empty reasoning
        knowledgeBaseReferences: [],
        tokenUsage: {
          inputTokens: 50,
          outputTokens: 25,
        },
      };

      const result = formatFraudAlertMessage(analysisResult, 'no-reasoning-call');

      // Should use default reasoning
      expect(result.reasoning).toBe('Analysis completed');
    });

    it('should handle empty fraud indicators array', () => {
      const analysisResult: FraudAnalysisResult = {
        riskScore: 20,
        threatLevel: 'SAFE',
        fraudIndicators: [],
        reasoning: 'No fraud detected',
        knowledgeBaseReferences: [],
        tokenUsage: {
          inputTokens: 50,
          outputTokens: 25,
        },
      };

      const result = formatFraudAlertMessage(analysisResult, 'no-indicators-call');

      expect(result.fraudIndicators).toHaveLength(0);
      expect(Array.isArray(result.fraudIndicators)).toBe(true);
    });
  });

  describe('Fraud indicators formatting', () => {
    it('should remove confidence field from fraud indicators', () => {
      const analysisResult: FraudAnalysisResult = {
        riskScore: 80,
        threatLevel: 'DANGER',
        fraudIndicators: [
          {
            type: 'THREAT',
            description: 'Caller is making threats',
            confidence: 0.95,
          },
        ],
        reasoning: 'Threatening behavior detected',
        knowledgeBaseReferences: [],
        tokenUsage: {
          inputTokens: 100,
          outputTokens: 50,
        },
      };

      const result = formatFraudAlertMessage(analysisResult, 'threat-call');

      // Verify confidence field is removed
      expect(result.fraudIndicators[0]).toEqual({
        type: 'THREAT',
        description: 'Caller is making threats',
      });
      expect('confidence' in result.fraudIndicators[0]).toBe(false);
    });

    it('should handle multiple fraud indicators', () => {
      const analysisResult: FraudAnalysisResult = {
        riskScore: 90,
        threatLevel: 'DANGER',
        fraudIndicators: [
          {
            type: 'URGENCY',
            description: 'Urgent action required',
            confidence: 0.9,
          },
          {
            type: 'PAYMENT_REQUEST',
            description: 'Requesting payment',
            confidence: 0.85,
          },
          {
            type: 'IMPERSONATION',
            description: 'Impersonating authority',
            confidence: 0.8,
          },
        ],
        reasoning: 'Multiple fraud indicators detected',
        knowledgeBaseReferences: [],
        tokenUsage: {
          inputTokens: 150,
          outputTokens: 75,
        },
      };

      const result = formatFraudAlertMessage(analysisResult, 'multi-indicator-call');

      expect(result.fraudIndicators).toHaveLength(3);
      result.fraudIndicators.forEach(indicator => {
        expect(indicator).toHaveProperty('type');
        expect(indicator).toHaveProperty('description');
        expect('confidence' in indicator).toBe(false);
      });
    });
  });

  describe('Required fields validation', () => {
    it('should include all required fields in formatted message', () => {
      const analysisResult: FraudAnalysisResult = {
        riskScore: 55,
        threatLevel: 'CAUTION',
        fraudIndicators: [],
        reasoning: 'Test reasoning',
        knowledgeBaseReferences: [],
        tokenUsage: {
          inputTokens: 100,
          outputTokens: 50,
        },
      };

      const result = formatFraudAlertMessage(analysisResult, 'complete-fields-call');

      // Verify all required fields are present
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('callSessionId');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('riskScore');
      expect(result).toHaveProperty('threatLevel');
      expect(result).toHaveProperty('fraudIndicators');
      expect(result).toHaveProperty('reasoning');

      // Verify field types
      expect(typeof result.type).toBe('string');
      expect(typeof result.callSessionId).toBe('string');
      expect(typeof result.timestamp).toBe('number');
      expect(typeof result.riskScore).toBe('number');
      expect(typeof result.threatLevel).toBe('string');
      expect(Array.isArray(result.fraudIndicators)).toBe(true);
      expect(typeof result.reasoning).toBe('string');
    });

    it('should ensure message is valid JSON serializable', () => {
      const analysisResult: FraudAnalysisResult = {
        riskScore: 65,
        threatLevel: 'CAUTION',
        fraudIndicators: [
          {
            type: 'URGENCY',
            description: 'Test indicator',
            confidence: 0.7,
          },
        ],
        reasoning: 'Test reasoning',
        knowledgeBaseReferences: [],
        tokenUsage: {
          inputTokens: 100,
          outputTokens: 50,
        },
      };

      const result = formatFraudAlertMessage(analysisResult, 'json-test-call');

      // Verify message can be serialized to JSON and back
      const jsonString = JSON.stringify(result);
      expect(() => JSON.parse(jsonString)).not.toThrow();

      const parsed = JSON.parse(jsonString);
      expect(parsed).toEqual(result);
    });
  });
});
