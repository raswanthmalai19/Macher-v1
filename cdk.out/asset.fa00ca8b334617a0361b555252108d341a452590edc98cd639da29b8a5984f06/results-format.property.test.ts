/**
 * Property-Based Test: Results Format Completeness
 * Feature: competition-mvp-backend
 * Property 14: Results Format Completeness
 * 
 * **Validates: Requirements 5.2**
 * 
 * For any fraud analysis result, the formatted message should contain all required fields
 * in the correct format: type, callSessionId, timestamp, riskScore, threatLevel,
 * fraudIndicators, and reasoning. Field types must be correct, values within valid ranges,
 * and the message must be JSON serializable.
 */

import * as fc from 'fast-check';
import { formatFraudAlertMessage, FraudAlertMessage } from './index';
import { FraudAnalysisResult } from './bedrock-client';

describe('Property 14: Results Format Completeness', () => {
  test('any fraud analysis result should produce a complete, valid formatted message', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary fraud analysis results
        fc.record({
          riskScore: fc.integer({ min: 0, max: 100 }),
          threatLevel: fc.constantFrom('SAFE', 'CAUTION', 'DANGER') as fc.Arbitrary<'SAFE' | 'CAUTION' | 'DANGER'>,
          fraudIndicators: fc.array(
            fc.record({
              type: fc.constantFrom(
                'URGENCY',
                'PAYMENT_REQUEST',
                'IMPERSONATION',
                'THREAT',
                'PERSONAL_INFO_REQUEST'
              ) as fc.Arbitrary<'URGENCY' | 'PAYMENT_REQUEST' | 'IMPERSONATION' | 'THREAT' | 'PERSONAL_INFO_REQUEST'>,
              description: fc.string({ minLength: 1, maxLength: 200 }),
              confidence: fc.float({ min: 0, max: 1, noNaN: true })
            }),
            { minLength: 0, maxLength: 10 }
          ),
          reasoning: fc.string({ minLength: 1, maxLength: 500 }),
          knowledgeBaseReferences: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 5 }),
          tokenUsage: fc.record({
            inputTokens: fc.integer({ min: 0, max: 10000 }),
            outputTokens: fc.integer({ min: 0, max: 5000 })
          })
        }),
        fc.string({ minLength: 1, maxLength: 100 }), // callSessionId
        (analysisResult: FraudAnalysisResult, callSessionId: string) => {
          // Format the fraud alert message
          const message = formatFraudAlertMessage(analysisResult, callSessionId);

          // Property 1: All required fields must be present
          expect(message).toHaveProperty('type');
          expect(message).toHaveProperty('callSessionId');
          expect(message).toHaveProperty('timestamp');
          expect(message).toHaveProperty('riskScore');
          expect(message).toHaveProperty('threatLevel');
          expect(message).toHaveProperty('fraudIndicators');
          expect(message).toHaveProperty('reasoning');

          // Property 2: Field types must be correct
          expect(typeof message.type).toBe('string');
          expect(typeof message.callSessionId).toBe('string');
          expect(typeof message.timestamp).toBe('number');
          expect(typeof message.riskScore).toBe('number');
          expect(typeof message.threatLevel).toBe('string');
          expect(Array.isArray(message.fraudIndicators)).toBe(true);
          expect(typeof message.reasoning).toBe('string');

          // Property 3: Type field must be 'fraud_analysis'
          expect(message.type).toBe('fraud_analysis');

          // Property 4: callSessionId must match input
          expect(message.callSessionId).toBe(callSessionId);

          // Property 5: riskScore must be 0-100
          expect(message.riskScore).toBeGreaterThanOrEqual(0);
          expect(message.riskScore).toBeLessThanOrEqual(100);

          // Property 6: threatLevel must be SAFE, CAUTION, or DANGER
          expect(['SAFE', 'CAUTION', 'DANGER']).toContain(message.threatLevel);

          // Property 7: fraudIndicators must be an array
          expect(Array.isArray(message.fraudIndicators)).toBe(true);

          // Property 8: Each fraud indicator must have type and description
          message.fraudIndicators.forEach(indicator => {
            expect(indicator).toHaveProperty('type');
            expect(indicator).toHaveProperty('description');
            expect(typeof indicator.type).toBe('string');
            expect(typeof indicator.description).toBe('string');
            expect(indicator.type.length).toBeGreaterThan(0);
            expect(indicator.description.length).toBeGreaterThan(0);
          });

          // Property 9: reasoning must be ≤200 characters
          expect(message.reasoning.length).toBeLessThanOrEqual(200);
          expect(message.reasoning.length).toBeGreaterThan(0);

          // Property 10: timestamp must be a valid Unix timestamp
          expect(message.timestamp).toBeGreaterThan(0);
          expect(Number.isInteger(message.timestamp)).toBe(true);
        }
      ),
      { numRuns: 20 } // User preference for faster execution
    );
  });

  test('formatted messages should be JSON serializable and deserializable', () => {
    fc.assert(
      fc.property(
        fc.record({
          riskScore: fc.integer({ min: 0, max: 100 }),
          threatLevel: fc.constantFrom('SAFE', 'CAUTION', 'DANGER') as fc.Arbitrary<'SAFE' | 'CAUTION' | 'DANGER'>,
          fraudIndicators: fc.array(
            fc.record({
              type: fc.constantFrom(
                'URGENCY',
                'PAYMENT_REQUEST',
                'IMPERSONATION',
                'THREAT',
                'PERSONAL_INFO_REQUEST'
              ) as fc.Arbitrary<'URGENCY' | 'PAYMENT_REQUEST' | 'IMPERSONATION' | 'THREAT' | 'PERSONAL_INFO_REQUEST'>,
              description: fc.string({ minLength: 1, maxLength: 200 }),
              confidence: fc.float({ min: 0, max: 1, noNaN: true })
            }),
            { minLength: 0, maxLength: 10 }
          ),
          reasoning: fc.string({ minLength: 1, maxLength: 500 }),
          knowledgeBaseReferences: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 5 }),
          tokenUsage: fc.record({
            inputTokens: fc.integer({ min: 0, max: 10000 }),
            outputTokens: fc.integer({ min: 0, max: 5000 })
          })
        }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (analysisResult: FraudAnalysisResult, callSessionId: string) => {
          const message = formatFraudAlertMessage(analysisResult, callSessionId);

          // Should be serializable to JSON and back without data loss
          const json = JSON.stringify(message);
          const parsed: FraudAlertMessage = JSON.parse(json);

          // Verify all fields are preserved
          expect(parsed.type).toBe(message.type);
          expect(parsed.callSessionId).toBe(message.callSessionId);
          expect(parsed.timestamp).toBe(message.timestamp);
          expect(parsed.riskScore).toBe(message.riskScore);
          expect(parsed.threatLevel).toBe(message.threatLevel);
          expect(parsed.reasoning).toBe(message.reasoning);
          expect(parsed.fraudIndicators.length).toBe(message.fraudIndicators.length);

          // Verify fraud indicators are preserved
          parsed.fraudIndicators.forEach((indicator, index) => {
            expect(indicator.type).toBe(message.fraudIndicators[index].type);
            expect(indicator.description).toBe(message.fraudIndicators[index].description);
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  test('formatted messages with invalid input should still produce valid output', () => {
    fc.assert(
      fc.property(
        // Generate potentially invalid fraud analysis results
        fc.record({
          riskScore: fc.oneof(
            fc.integer({ min: 0, max: 100 }),
            fc.integer({ min: -100, max: -1 }), // Invalid: negative
            fc.integer({ min: 101, max: 200 }), // Invalid: > 100
            fc.constant(NaN), // Invalid: NaN
            fc.constant(null as any), // Invalid: null
            fc.constant(undefined as any) // Invalid: undefined
          ),
          threatLevel: fc.oneof(
            fc.constantFrom('SAFE', 'CAUTION', 'DANGER'),
            fc.constant('INVALID' as any), // Invalid threat level
            fc.constant('' as any), // Invalid: empty string
            fc.constant(null as any) // Invalid: null
          ) as fc.Arbitrary<'SAFE' | 'CAUTION' | 'DANGER'>,
          fraudIndicators: fc.oneof(
            fc.array(
              fc.record({
                type: fc.constantFrom(
                  'URGENCY',
                  'PAYMENT_REQUEST',
                  'IMPERSONATION',
                  'THREAT',
                  'PERSONAL_INFO_REQUEST'
                ) as fc.Arbitrary<'URGENCY' | 'PAYMENT_REQUEST' | 'IMPERSONATION' | 'THREAT' | 'PERSONAL_INFO_REQUEST'>,
                description: fc.string({ minLength: 1, maxLength: 200 }),
                confidence: fc.float({ min: 0, max: 1, noNaN: true })
              }),
              { minLength: 0, maxLength: 10 }
            ),
            fc.constant(null as any), // Invalid: null
            fc.constant(undefined as any) // Invalid: undefined
          ),
          reasoning: fc.oneof(
            fc.string({ minLength: 1, maxLength: 500 }),
            fc.constant(''), // Edge case: empty string
            fc.constant(null as any), // Invalid: null
            fc.constant(undefined as any) // Invalid: undefined
          ),
          knowledgeBaseReferences: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 5 }),
          tokenUsage: fc.record({
            inputTokens: fc.integer({ min: 0, max: 10000 }),
            outputTokens: fc.integer({ min: 0, max: 5000 })
          })
        }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (analysisResult: FraudAnalysisResult, callSessionId: string) => {
          // Even with invalid input, formatter should produce valid output
          const message = formatFraudAlertMessage(analysisResult, callSessionId);

          // All required fields must still be present
          expect(message).toHaveProperty('type');
          expect(message).toHaveProperty('callSessionId');
          expect(message).toHaveProperty('timestamp');
          expect(message).toHaveProperty('riskScore');
          expect(message).toHaveProperty('threatLevel');
          expect(message).toHaveProperty('fraudIndicators');
          expect(message).toHaveProperty('reasoning');

          // Output must always be valid, even if input was invalid
          expect(message.type).toBe('fraud_analysis');
          expect(message.riskScore).toBeGreaterThanOrEqual(0);
          expect(message.riskScore).toBeLessThanOrEqual(100);
          expect(['SAFE', 'CAUTION', 'DANGER']).toContain(message.threatLevel);
          expect(Array.isArray(message.fraudIndicators)).toBe(true);
          expect(message.reasoning.length).toBeGreaterThan(0);
          expect(message.reasoning.length).toBeLessThanOrEqual(200);

          // Should still be JSON serializable
          expect(() => JSON.stringify(message)).not.toThrow();
        }
      ),
      { numRuns: 20 }
    );
  });

  test('reasoning truncation should preserve message validity', () => {
    fc.assert(
      fc.property(
        fc.record({
          riskScore: fc.integer({ min: 0, max: 100 }),
          threatLevel: fc.constantFrom('SAFE', 'CAUTION', 'DANGER') as fc.Arbitrary<'SAFE' | 'CAUTION' | 'DANGER'>,
          fraudIndicators: fc.array(
            fc.record({
              type: fc.constantFrom(
                'URGENCY',
                'PAYMENT_REQUEST',
                'IMPERSONATION',
                'THREAT',
                'PERSONAL_INFO_REQUEST'
              ) as fc.Arbitrary<'URGENCY' | 'PAYMENT_REQUEST' | 'IMPERSONATION' | 'THREAT' | 'PERSONAL_INFO_REQUEST'>,
              description: fc.string({ minLength: 1, maxLength: 200 }),
              confidence: fc.float({ min: 0, max: 1, noNaN: true })
            }),
            { minLength: 0, maxLength: 10 }
          ),
          // Generate reasoning that's often longer than 200 characters
          reasoning: fc.string({ minLength: 150, maxLength: 1000 }),
          knowledgeBaseReferences: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 5 }),
          tokenUsage: fc.record({
            inputTokens: fc.integer({ min: 0, max: 10000 }),
            outputTokens: fc.integer({ min: 0, max: 5000 })
          })
        }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (analysisResult: FraudAnalysisResult, callSessionId: string) => {
          const message = formatFraudAlertMessage(analysisResult, callSessionId);

          // Reasoning must always be ≤200 characters
          expect(message.reasoning.length).toBeLessThanOrEqual(200);

          // If original was >200, should end with '...'
          if (analysisResult.reasoning.length > 200) {
            expect(message.reasoning.endsWith('...')).toBe(true);
            expect(message.reasoning.length).toBe(200);
          } else {
            // If original was ≤200, should be preserved exactly
            expect(message.reasoning).toBe(analysisResult.reasoning);
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});
