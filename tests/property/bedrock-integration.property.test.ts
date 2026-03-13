/**
 * Feature: competition-mvp-backend, Property 9: Bedrock Agent Integration
 * 
 * For any transcription ready for analysis, the Audio_Processor should invoke
 * Amazon Bedrock Agent with Claude 3.5 Sonnet, passing the redacted transcription
 * and call session context with correct parameters.
 * 
 * Validates: Requirements 4.1
 */

import * as fc from 'fast-check';
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { mockClient } from 'aws-sdk-client-mock';
import { invokeBedrockAgent } from '../../lambda/audio-processor/bedrock-client';

// Mock X-Ray SDK
jest.mock('aws-xray-sdk-core', () => ({
  captureAWSv3Client: jest.fn((client) => client),
}));

describe('Property 9: Bedrock Agent Integration', () => {
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
   * Generator for valid transcription text
   * Transcriptions should be realistic conversation snippets (10-500 words)
   */
  const transcriptionGen = fc
    .array(fc.lorem({ maxCount: 20 }), { minLength: 10, maxLength: 50 })
    .map((words) => words.join(' '));

  /**
   * Generator for call session IDs
   */
  const sessionIdGen = fc.uuid();

  /**
   * Helper to create a mock Bedrock Agent response
   */
  function createMockBedrockResponse(riskScore: number = 50) {
    const threatLevel = riskScore <= 33 ? 'SAFE' : riskScore <= 66 ? 'CAUTION' : 'DANGER';
    
    const responseJson = JSON.stringify({
      riskScore,
      threatLevel,
      fraudIndicators: [
        {
          type: 'URGENCY',
          description: 'Caller is pressuring for immediate action',
          confidence: 0.8,
        },
      ],
      reasoning: 'Analysis completed successfully',
      knowledgeBaseReferences: ['irs-scams.md'],
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
   * Property: Any valid transcription should invoke Bedrock Agent with correct parameters
   * 
   * Requirement 4.1: Invoke Amazon Bedrock Agent with Claude 3.5 Sonnet
   */
  it('should invoke Bedrock Agent with correct parameters for any valid transcription', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: transcriptionGen,
          sessionId: sessionIdGen,
        }),
        async ({ transcription, sessionId }) => {
          // Reset mock before each property test iteration
          bedrockClientMock.reset();
          
          // Mock successful Bedrock Agent response
          bedrockClientMock.on(InvokeAgentCommand).resolves(createMockBedrockResponse());

          // Invoke Bedrock Agent
          const result = await invokeBedrockAgent(transcription, sessionId);

          // Verify Bedrock Agent was called exactly once
          const calls = bedrockClientMock.commandCalls(InvokeAgentCommand);
          expect(calls.length).toBe(1);

          const command = calls[0].args[0] as any;
          const input = command.input;

          // Requirement 4.1: Verify correct parameters
          expect(input.agentId).toBe('test-agent-id-12345');
          expect(input.agentAliasId).toBe('test-alias-id-67890');
          expect(input.sessionId).toBe(sessionId);
          expect(input.inputText).toBe(transcription);
          
          // Requirement 4.1, 11.4: Verify enableTrace is true to capture Guardrails and Knowledge Base activity
          expect(input.enableTrace).toBe(true);

          // Verify result structure
          expect(result).toBeDefined();
          expect(typeof result.riskScore).toBe('number');
          expect(['SAFE', 'CAUTION', 'DANGER']).toContain(result.threatLevel);
          expect(Array.isArray(result.fraudIndicators)).toBe(true);
          expect(typeof result.reasoning).toBe('string');
          expect(Array.isArray(result.knowledgeBaseReferences)).toBe(true);
          expect(result.tokenUsage).toBeDefined();
          expect(typeof result.tokenUsage.inputTokens).toBe('number');
          expect(typeof result.tokenUsage.outputTokens).toBe('number');

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Bedrock Agent should always be invoked with enableTrace set to true
   * 
   * Requirement 4.1, 11.4: Enable trace to capture Guardrails and Knowledge Base activity
   */
  it('should always enable trace for Guardrails and Knowledge Base monitoring', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: transcriptionGen,
          sessionId: sessionIdGen,
        }),
        async ({ transcription, sessionId }) => {
          // Reset mock before each property test iteration
          bedrockClientMock.reset();
          
          // Mock successful Bedrock Agent response
          bedrockClientMock.on(InvokeAgentCommand).resolves(createMockBedrockResponse());

          // Invoke Bedrock Agent
          await invokeBedrockAgent(transcription, sessionId);

          // Verify enableTrace is always true
          const calls = bedrockClientMock.commandCalls(InvokeAgentCommand);
          expect(calls.length).toBe(1);

          const command = calls[0].args[0] as any;
          const input = command.input;

          // Requirement 4.1, 11.4: enableTrace must be true
          expect(input.enableTrace).toBe(true);

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Bedrock Agent should return a valid FraudAnalysisResult structure
   * 
   * Requirement 4.1: Verify the response structure is correct
   */
  it('should return a valid FraudAnalysisResult for any transcription', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: transcriptionGen,
          sessionId: sessionIdGen,
          riskScore: fc.integer({ min: 0, max: 100 }),
        }),
        async ({ transcription, sessionId, riskScore }) => {
          // Mock Bedrock Agent response with varying risk scores
          bedrockClientMock.on(InvokeAgentCommand).resolves(createMockBedrockResponse(riskScore));

          // Invoke Bedrock Agent
          const result = await invokeBedrockAgent(transcription, sessionId);

          // Verify FraudAnalysisResult structure
          expect(result).toMatchObject({
            riskScore: expect.any(Number),
            threatLevel: expect.stringMatching(/^(SAFE|CAUTION|DANGER)$/),
            fraudIndicators: expect.any(Array),
            reasoning: expect.any(String),
            knowledgeBaseReferences: expect.any(Array),
            tokenUsage: {
              inputTokens: expect.any(Number),
              outputTokens: expect.any(Number),
            },
          });

          // Verify risk score is within valid range
          expect(result.riskScore).toBeGreaterThanOrEqual(0);
          expect(result.riskScore).toBeLessThanOrEqual(100);

          // Verify token usage is positive
          expect(result.tokenUsage.inputTokens).toBeGreaterThan(0);
          expect(result.tokenUsage.outputTokens).toBeGreaterThan(0);

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Session ID should be passed correctly to Bedrock Agent
   * 
   * Requirement 4.1: Verify sessionId parameter is used correctly
   */
  it('should pass the session ID correctly to Bedrock Agent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: transcriptionGen,
          sessionId: sessionIdGen,
        }),
        async ({ transcription, sessionId }) => {
          // Reset mock before each property test iteration
          bedrockClientMock.reset();
          
          // Mock successful Bedrock Agent response
          bedrockClientMock.on(InvokeAgentCommand).resolves(createMockBedrockResponse());

          // Invoke Bedrock Agent
          await invokeBedrockAgent(transcription, sessionId);

          // Verify session ID is passed correctly
          const calls = bedrockClientMock.commandCalls(InvokeAgentCommand);
          expect(calls.length).toBe(1);

          const command = calls[0].args[0] as any;
          const input = command.input;

          // Session ID should match exactly
          expect(input.sessionId).toBe(sessionId);

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Transcription text should be passed as inputText to Bedrock Agent
   * 
   * Requirement 4.1: Verify transcription is sent correctly
   */
  it('should pass transcription text as inputText to Bedrock Agent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: transcriptionGen,
          sessionId: sessionIdGen,
        }),
        async ({ transcription, sessionId }) => {
          // Reset mock before each property test iteration
          bedrockClientMock.reset();
          
          // Mock successful Bedrock Agent response
          bedrockClientMock.on(InvokeAgentCommand).resolves(createMockBedrockResponse());

          // Invoke Bedrock Agent
          await invokeBedrockAgent(transcription, sessionId);

          // Verify transcription is passed as inputText
          const calls = bedrockClientMock.commandCalls(InvokeAgentCommand);
          expect(calls.length).toBe(1);

          const command = calls[0].args[0] as any;
          const input = command.input;

          // Transcription should match exactly
          expect(input.inputText).toBe(transcription);

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Agent ID and Alias ID should be consistent across all invocations
   * 
   * Requirement 4.1: Verify agent configuration is consistent
   */
  it('should use consistent agent ID and alias ID for all invocations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            transcription: transcriptionGen,
            sessionId: sessionIdGen,
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (invocations) => {
          // Reset mock before each property test iteration
          bedrockClientMock.reset();
          
          // Mock successful Bedrock Agent responses
          bedrockClientMock.on(InvokeAgentCommand).resolves(createMockBedrockResponse());

          // Invoke Bedrock Agent multiple times
          for (const { transcription, sessionId } of invocations) {
            await invokeBedrockAgent(transcription, sessionId);
          }

          // Verify all calls use the same agent ID and alias ID
          const calls = bedrockClientMock.commandCalls(InvokeAgentCommand);
          expect(calls.length).toBe(invocations.length);

          const firstCall = calls[0].args[0] as any;
          const firstInput = firstCall.input;

          for (const call of calls) {
            const command = call.args[0] as any;
            const input = command.input;

            expect(input.agentId).toBe(firstInput.agentId);
            expect(input.agentAliasId).toBe(firstInput.agentAliasId);
            expect(input.agentId).toBe('test-agent-id-12345');
            expect(input.agentAliasId).toBe('test-alias-id-67890');
          }

          return true;
        }
      ),
      { numRuns: 10, timeout: 30000 }
    );
  });

  /**
   * Property: Bedrock Agent should handle empty fraud indicators gracefully
   * 
   * Requirement 4.1: Verify response parsing handles edge cases
   */
  it('should handle responses with empty fraud indicators', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: transcriptionGen,
          sessionId: sessionIdGen,
        }),
        async ({ transcription, sessionId }) => {
          // Mock Bedrock Agent response with no fraud indicators
          const responseJson = JSON.stringify({
            riskScore: 10,
            threatLevel: 'SAFE',
            fraudIndicators: [],
            reasoning: 'No fraud detected',
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

          // Invoke Bedrock Agent
          const result = await invokeBedrockAgent(transcription, sessionId);

          // Verify result structure is still valid
          expect(result.fraudIndicators).toEqual([]);
          expect(result.knowledgeBaseReferences).toEqual([]);
          expect(result.riskScore).toBe(10);
          expect(result.threatLevel).toBe('SAFE');

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Token usage should be tracked for all invocations
   * 
   * Requirement 4.8: Verify token usage tracking
   */
  it('should track token usage for all Bedrock Agent invocations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: transcriptionGen,
          sessionId: sessionIdGen,
        }),
        async ({ transcription, sessionId }) => {
          // Mock successful Bedrock Agent response
          bedrockClientMock.on(InvokeAgentCommand).resolves(createMockBedrockResponse());

          // Invoke Bedrock Agent
          const result = await invokeBedrockAgent(transcription, sessionId);

          // Verify token usage is tracked
          expect(result.tokenUsage).toBeDefined();
          expect(result.tokenUsage.inputTokens).toBeGreaterThan(0);
          expect(result.tokenUsage.outputTokens).toBeGreaterThan(0);

          // Token usage should be reasonable (rough estimate: 1 token ≈ 4 characters)
          const expectedInputTokens = Math.ceil(transcription.length / 4);
          expect(result.tokenUsage.inputTokens).toBeGreaterThanOrEqual(expectedInputTokens * 0.5);
          expect(result.tokenUsage.inputTokens).toBeLessThanOrEqual(expectedInputTokens * 2);

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });
});
