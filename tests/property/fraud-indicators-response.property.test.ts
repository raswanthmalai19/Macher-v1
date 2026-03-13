import * as fc from 'fast-check';
import { invokeBedrockAgent } from '../../lambda/audio-processor/bedrock-client';
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { mockClient } from 'aws-sdk-client-mock';

/**
 * Feature: competition-mvp-backend, Property 12: Fraud Indicators in Response
 * 
 * For any fraud detection with indicators, the response should include a non-empty array
 * with type, description, and confidence for each indicator.
 * 
 * Validates: Requirements 4.7
 */
describe('Property 12: Fraud Indicators in Response', () => {
  const bedrockMock = mockClient(BedrockAgentRuntimeClient);

  beforeEach(() => {
    bedrockMock.reset();
    // Set required environment variables
    process.env.BEDROCK_AGENT_ID = 'test-agent-id';
    process.env.BEDROCK_AGENT_ALIAS_ID = 'test-alias-id';
    process.env.AWS_REGION = 'us-east-1';
  });

  afterEach(() => {
    delete process.env.BEDROCK_AGENT_ID;
    delete process.env.BEDROCK_AGENT_ALIAS_ID;
  });

  test('fraud detection with indicators includes non-empty array with required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate transcription with potential fraud content
        fc.record({
          transcription: fc.string({ minLength: 50, maxLength: 500 }),
          sessionId: fc.uuid(),
          // Generate fraud indicators with required fields
          fraudIndicators: fc.array(
            fc.record({
              type: fc.constantFrom('URGENCY', 'PAYMENT_REQUEST', 'IMPERSONATION', 'THREAT', 'PERSONAL_INFO_REQUEST'),
              description: fc.string({ minLength: 10, maxLength: 100 }),
              confidence: fc.double({ min: 0, max: 1, noNaN: true }),
            }),
            { minLength: 1, maxLength: 5 } // At least 1 indicator
          ),
          riskScore: fc.integer({ min: 34, max: 100 }), // CAUTION or DANGER range (likely to have indicators)
        }),
        async ({ transcription, sessionId, fraudIndicators, riskScore }) => {
          // Determine threat level based on risk score
          let threatLevel: 'SAFE' | 'CAUTION' | 'DANGER';
          if (riskScore <= 33) {
            threatLevel = 'SAFE';
          } else if (riskScore <= 66) {
            threatLevel = 'CAUTION';
          } else {
            threatLevel = 'DANGER';
          }

          // Mock Bedrock response with fraud indicators
          const mockResponse = {
            riskScore,
            threatLevel,
            fraudIndicators,
            reasoning: 'Fraud indicators detected',
            knowledgeBaseReferences: ['scam-pattern-1'],
          };

          // Create async iterable for streaming response
          async function* generateCompletion() {
            yield {
              chunk: {
                bytes: new TextEncoder().encode(JSON.stringify(mockResponse)),
              },
            };
          }

          bedrockMock.on(InvokeAgentCommand).resolves({
            completion: generateCompletion(),
            contentType: 'application/json',
            sessionId: sessionId,
          });

          // Invoke Bedrock Agent
          const result = await invokeBedrockAgent(transcription, sessionId);

          // Property assertions: Fraud indicators must be non-empty array with required fields
          expect(result.fraudIndicators).toBeDefined();
          expect(Array.isArray(result.fraudIndicators)).toBe(true);
          expect(result.fraudIndicators.length).toBeGreaterThan(0);

          // Each fraud indicator must have type, description, and confidence
          for (const indicator of result.fraudIndicators) {
            // Type must be a valid fraud indicator type
            expect(indicator.type).toBeDefined();
            expect(typeof indicator.type).toBe('string');
            expect(['URGENCY', 'PAYMENT_REQUEST', 'IMPERSONATION', 'THREAT', 'PERSONAL_INFO_REQUEST']).toContain(indicator.type);

            // Description must be a non-empty string
            expect(indicator.description).toBeDefined();
            expect(typeof indicator.description).toBe('string');
            expect(indicator.description.length).toBeGreaterThan(0);

            // Confidence must be a number between 0 and 1
            expect(indicator.confidence).toBeDefined();
            expect(typeof indicator.confidence).toBe('number');
            expect(indicator.confidence).toBeGreaterThanOrEqual(0);
            expect(indicator.confidence).toBeLessThanOrEqual(1);
            expect(Number.isFinite(indicator.confidence)).toBe(true);
          }
        }
      ),
      { numRuns: 20 } // Use 20 runs as specified in the task context
    );
  });

  test('fraud detection filters out invalid fraud indicators', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: fc.string({ minLength: 50, maxLength: 500 }),
          sessionId: fc.uuid(),
          riskScore: fc.integer({ min: 34, max: 100 }),
        }),
        async ({ transcription, sessionId, riskScore }) => {
          // Determine threat level
          let threatLevel: 'SAFE' | 'CAUTION' | 'DANGER';
          if (riskScore <= 33) {
            threatLevel = 'SAFE';
          } else if (riskScore <= 66) {
            threatLevel = 'CAUTION';
          } else {
            threatLevel = 'DANGER';
          }

          // Mock response with mix of valid and invalid indicators
          const mockResponse = {
            riskScore,
            threatLevel,
            fraudIndicators: [
              // Valid indicator
              {
                type: 'URGENCY',
                description: 'Caller demands immediate action',
                confidence: 0.85,
              },
              // Invalid: missing type
              {
                description: 'Some description',
                confidence: 0.7,
              },
              // Invalid: missing description
              {
                type: 'PAYMENT_REQUEST',
                confidence: 0.9,
              },
              // Invalid: missing confidence
              {
                type: 'THREAT',
                description: 'Threatening language detected',
              },
              // Invalid: confidence out of range
              {
                type: 'IMPERSONATION',
                description: 'Impersonating authority',
                confidence: 1.5,
              },
              // Valid indicator
              {
                type: 'PERSONAL_INFO_REQUEST',
                description: 'Requesting sensitive information',
                confidence: 0.75,
              },
            ],
            reasoning: 'Multiple fraud indicators detected',
            knowledgeBaseReferences: [],
          };

          // Create async iterable
          async function* generateCompletion() {
            yield {
              chunk: {
                bytes: new TextEncoder().encode(JSON.stringify(mockResponse)),
              },
            };
          }

          bedrockMock.on(InvokeAgentCommand).resolves({
            completion: generateCompletion(),
            contentType: 'application/json',
            sessionId: sessionId,
          });

          // Invoke Bedrock Agent
          const result = await invokeBedrockAgent(transcription, sessionId);

          // Property: Only valid indicators should be included
          expect(result.fraudIndicators).toBeDefined();
          expect(Array.isArray(result.fraudIndicators)).toBe(true);
          
          // Should have exactly 2 valid indicators (filtered from 6 total)
          expect(result.fraudIndicators.length).toBe(2);

          // All returned indicators must be valid
          for (const indicator of result.fraudIndicators) {
            expect(indicator.type).toBeDefined();
            expect(typeof indicator.type).toBe('string');
            expect(indicator.description).toBeDefined();
            expect(typeof indicator.description).toBe('string');
            expect(indicator.description.length).toBeGreaterThan(0);
            expect(indicator.confidence).toBeDefined();
            expect(typeof indicator.confidence).toBe('number');
            expect(indicator.confidence).toBeGreaterThanOrEqual(0);
            expect(indicator.confidence).toBeLessThanOrEqual(1);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  test('fraud detection with no indicators returns empty array', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: fc.string({ minLength: 50, maxLength: 500 }),
          sessionId: fc.uuid(),
          riskScore: fc.integer({ min: 0, max: 33 }), // SAFE range (unlikely to have indicators)
        }),
        async ({ transcription, sessionId, riskScore }) => {
          // Mock response with no fraud indicators (SAFE call)
          const mockResponse = {
            riskScore,
            threatLevel: 'SAFE',
            fraudIndicators: [], // Empty array for safe calls
            reasoning: 'No fraud indicators detected',
            knowledgeBaseReferences: [],
          };

          // Create async iterable
          async function* generateCompletion() {
            yield {
              chunk: {
                bytes: new TextEncoder().encode(JSON.stringify(mockResponse)),
              },
            };
          }

          bedrockMock.on(InvokeAgentCommand).resolves({
            completion: generateCompletion(),
            contentType: 'application/json',
            sessionId: sessionId,
          });

          // Invoke Bedrock Agent
          const result = await invokeBedrockAgent(transcription, sessionId);

          // Property: Empty array is valid for SAFE calls
          expect(result.fraudIndicators).toBeDefined();
          expect(Array.isArray(result.fraudIndicators)).toBe(true);
          expect(result.fraudIndicators.length).toBe(0);
        }
      ),
      { numRuns: 20 }
    );
  });
});
