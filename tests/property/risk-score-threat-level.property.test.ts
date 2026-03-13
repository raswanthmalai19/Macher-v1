/**
 * Feature: competition-mvp-backend, Property 11: Risk Score and Threat Level Validity
 * 
 * For any fraud analysis result, the Risk_Score should be between 0 and 100 (inclusive),
 * and the Threat_Level should be SAFE (0-33), CAUTION (34-66), or DANGER (67-100)
 * matching the Risk_Score.
 * 
 * Validates: Requirements 4.4, 4.5
 */

import * as fc from 'fast-check';
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { mockClient } from 'aws-sdk-client-mock';
import { invokeBedrockAgent } from '../../lambda/audio-processor/bedrock-client';

// Mock X-Ray SDK
jest.mock('aws-xray-sdk-core', () => ({
  captureAWSv3Client: jest.fn((client) => client),
}));

describe('Property 11: Risk Score and Threat Level Validity', () => {
  let bedrockClientMock: any;

  beforeAll(() => {
    // Set up environment variables
    process.env.AWS_REGION = 'us-east-1';
    process.env.BEDROCK_AGENT_ID = 'test-agent-id-12345';
    process.env.BEDROCK_AGENT_ALIAS_ID = 'test-alias-id-67890';
  });

  beforeEach(() => {
    // Create mock for BedrockAgentRuntimeClient
    bedrockClientMock = mockClient(BedrockAgentRuntimeClient);
  });

  afterEach(() => {
    bedrockClientMock.reset();
  });

  afterAll(() => {
    // Clean up environment variables
    delete process.env.BEDROCK_AGENT_ID;
    delete process.env.BEDROCK_AGENT_ALIAS_ID;
  });

  /**
   * Generator for valid risk scores (0-100)
   */
  const validRiskScoreGen = fc.integer({ min: 0, max: 100 });

  /**
   * Generator for invalid risk scores (outside 0-100 range)
   */
  const invalidRiskScoreGen = fc.oneof(
    fc.integer({ min: -1000, max: -1 }),
    fc.integer({ min: 101, max: 1000 }),
    fc.constant(NaN),
    fc.constant(Infinity),
    fc.constant(-Infinity)
  );

  /**
   * Helper function to determine expected threat level from risk score
   */
  const getExpectedThreatLevel = (riskScore: number): 'SAFE' | 'CAUTION' | 'DANGER' => {
    if (riskScore <= 33) return 'SAFE';
    if (riskScore <= 66) return 'CAUTION';
    return 'DANGER';
  };

  /**
   * Helper to create a mock Bedrock Agent response
   */
  function createMockBedrockResponse(riskScore: number, threatLevel: string) {
    const responseJson = JSON.stringify({
      riskScore,
      threatLevel,
      fraudIndicators: [],
      reasoning: 'Test analysis',
      knowledgeBaseReferences: [],
    });

    return {
      completion: {
        [Symbol.asyncIterator]: async function* () {
          yield {
            chunk: {
              bytes: new TextEncoder().encode(responseJson),
            },
          };
        },
      },
    };
  }

  /**
   * Property: Valid risk scores (0-100) should produce matching threat levels
   */
  it('should produce correct threat level for any valid risk score', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRiskScoreGen,
        fc.constantFrom('SAFE', 'CAUTION', 'DANGER'),
        async (riskScore, providedThreatLevel) => {
          // Reset mock before each iteration
          bedrockClientMock.reset();

          // Mock Bedrock response with the generated risk score and threat level
          bedrockClientMock
            .on(InvokeAgentCommand)
            .resolves(createMockBedrockResponse(riskScore, providedThreatLevel));

          // Call the fraud analysis function
          const result = await invokeBedrockAgent(
            'test-transcription',
            'test-session-id'
          );

          // Verify risk score is within valid range
          expect(result.riskScore).toBeGreaterThanOrEqual(0);
          expect(result.riskScore).toBeLessThanOrEqual(100);
          expect(typeof result.riskScore).toBe('number');
          expect(isNaN(result.riskScore)).toBe(false);
          expect(isFinite(result.riskScore)).toBe(true);

          // Verify threat level is valid
          expect(['SAFE', 'CAUTION', 'DANGER']).toContain(result.threatLevel);

          // Verify threat level matches risk score range
          const expectedThreatLevel = getExpectedThreatLevel(result.riskScore);
          expect(result.threatLevel).toBe(expectedThreatLevel);

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Boundary values should produce correct threat levels
   * Tests the exact boundaries: 0, 33, 34, 66, 67, 100
   */
  it('should correctly classify boundary risk scores', async () => {
    const boundaryTests = [
      { riskScore: 0, expectedThreatLevel: 'SAFE' },
      { riskScore: 33, expectedThreatLevel: 'SAFE' },
      { riskScore: 34, expectedThreatLevel: 'CAUTION' },
      { riskScore: 66, expectedThreatLevel: 'CAUTION' },
      { riskScore: 67, expectedThreatLevel: 'DANGER' },
      { riskScore: 100, expectedThreatLevel: 'DANGER' },
    ];

    for (const { riskScore, expectedThreatLevel } of boundaryTests) {
      // Reset mock
      bedrockClientMock.reset();

      // Mock Bedrock response
      bedrockClientMock
        .on(InvokeAgentCommand)
        .resolves(createMockBedrockResponse(riskScore, expectedThreatLevel));

      // Call the fraud analysis function
      const result = await invokeBedrockAgent(
        'test-transcription',
        'test-session-id'
      );

      // Verify the result
      expect(result.riskScore).toBe(riskScore);
      expect(result.threatLevel).toBe(expectedThreatLevel);
    }
  });

  /**
   * Property: Invalid risk scores should be auto-corrected to valid range
   * The implementation defaults to 50 (CAUTION) for invalid scores
   */
  it('should auto-correct invalid risk scores to default value', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidRiskScoreGen,
        async (invalidRiskScore) => {
          // Reset mock
          bedrockClientMock.reset();

          // Mock Bedrock response with invalid risk score
          bedrockClientMock
            .on(InvokeAgentCommand)
            .resolves(createMockBedrockResponse(invalidRiskScore, 'DANGER'));

          // Call the fraud analysis function
          const result = await invokeBedrockAgent(
            'test-transcription',
            'test-session-id'
          );

          // Verify risk score is corrected to valid range (default: 50)
          expect(result.riskScore).toBeGreaterThanOrEqual(0);
          expect(result.riskScore).toBeLessThanOrEqual(100);
          expect(typeof result.riskScore).toBe('number');
          expect(isNaN(result.riskScore)).toBe(false);
          expect(isFinite(result.riskScore)).toBe(true);

          // Verify threat level matches the corrected risk score
          const expectedThreatLevel = getExpectedThreatLevel(result.riskScore);
          expect(result.threatLevel).toBe(expectedThreatLevel);

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Mismatched threat levels should be auto-corrected
   * If Bedrock returns a threat level that doesn't match the risk score,
   * the implementation should correct it
   */
  it('should auto-correct mismatched threat levels to match risk score', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRiskScoreGen,
        fc.constantFrom('SAFE', 'CAUTION', 'DANGER'),
        async (riskScore, wrongThreatLevel) => {
          const expectedThreatLevel = getExpectedThreatLevel(riskScore);
          
          // Only test when threat level is actually wrong
          if (wrongThreatLevel === expectedThreatLevel) {
            return true; // Skip this case
          }

          // Reset mock
          bedrockClientMock.reset();

          // Mock Bedrock response with mismatched threat level
          bedrockClientMock
            .on(InvokeAgentCommand)
            .resolves(createMockBedrockResponse(riskScore, wrongThreatLevel));

          // Call the fraud analysis function
          const result = await invokeBedrockAgent(
            'test-transcription',
            'test-session-id'
          );

          // Verify risk score is unchanged
          expect(result.riskScore).toBe(riskScore);

          // Verify threat level is corrected to match risk score
          expect(result.threatLevel).toBe(expectedThreatLevel);
          expect(result.threatLevel).not.toBe(wrongThreatLevel);

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Missing threat level should be calculated from risk score
   */
  it('should calculate threat level when missing from Bedrock response', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRiskScoreGen,
        async (riskScore) => {
          // Reset mock
          bedrockClientMock.reset();

          // Mock Bedrock response without threat level
          const responseJson = JSON.stringify({
            riskScore,
            // threatLevel is missing
            fraudIndicators: [],
            reasoning: 'Test analysis',
            knowledgeBaseReferences: [],
          });

          bedrockClientMock.on(InvokeAgentCommand).resolves({
            completion: {
              [Symbol.asyncIterator]: async function* () {
                yield {
                  chunk: {
                    bytes: new TextEncoder().encode(responseJson),
                  },
                };
              },
            },
          });

          // Call the fraud analysis function
          const result = await invokeBedrockAgent(
            'test-transcription',
            'test-session-id'
          );

          // Verify risk score is correct
          expect(result.riskScore).toBe(riskScore);

          // Verify threat level is calculated correctly
          const expectedThreatLevel = getExpectedThreatLevel(riskScore);
          expect(result.threatLevel).toBe(expectedThreatLevel);

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Risk score ranges should map consistently to threat levels
   * SAFE: 0-33, CAUTION: 34-66, DANGER: 67-100
   */
  it('should consistently map risk score ranges to threat levels', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRiskScoreGen,
        async (riskScore) => {
          // Reset mock
          bedrockClientMock.reset();

          const expectedThreatLevel = getExpectedThreatLevel(riskScore);
          
          // Mock Bedrock response
          bedrockClientMock
            .on(InvokeAgentCommand)
            .resolves(createMockBedrockResponse(riskScore, expectedThreatLevel));

          // Call the fraud analysis function
          const result = await invokeBedrockAgent(
            'test-transcription',
            'test-session-id'
          );

          // Verify the mapping is consistent
          if (riskScore <= 33) {
            expect(result.threatLevel).toBe('SAFE');
          } else if (riskScore <= 66) {
            expect(result.threatLevel).toBe('CAUTION');
          } else {
            expect(result.threatLevel).toBe('DANGER');
          }

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });
});
