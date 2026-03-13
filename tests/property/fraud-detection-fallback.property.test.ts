import * as fc from 'fast-check';
import { invokeBedrockAgent } from '../../lambda/audio-processor/bedrock-client';
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { mockClient } from 'aws-sdk-client-mock';
import { bedrockCircuitBreaker } from '../../lambda/audio-processor/circuit-breaker';

/**
 * Feature: competition-mvp-backend, Property 23: Fraud Detection Fallback
 * 
 * For any Fraud_Detector failure (Bedrock unavailable, timeout, error), the Audio_Processor
 * should return a default response with Threat_Level=CAUTION and appropriate error message
 * to the mobile client.
 * 
 * Validates: Requirements 8.2
 */
describe('Property 23: Fraud Detection Fallback', () => {
  const bedrockMock = mockClient(BedrockAgentRuntimeClient);

  beforeEach(() => {
    bedrockMock.reset();
    // Reset circuit breaker before each test
    bedrockCircuitBreaker.reset();
    // Set required environment variables
    process.env.BEDROCK_AGENT_ID = 'test-agent-id';
    process.env.BEDROCK_AGENT_ALIAS_ID = 'test-alias-id';
    process.env.AWS_REGION = 'us-east-1';
  });

  afterEach(() => {
    delete process.env.BEDROCK_AGENT_ID;
    delete process.env.BEDROCK_AGENT_ALIAS_ID;
    bedrockCircuitBreaker.reset();
  });

  test('returns default CAUTION response when Bedrock service is unavailable', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: fc.string({ minLength: 50, maxLength: 500 }),
          sessionId: fc.uuid(),
        }),
        async ({ transcription, sessionId }) => {
          // Mock Bedrock to throw service unavailable error
          bedrockMock.on(InvokeAgentCommand).rejects(new Error('ServiceUnavailable'));

          // Invoke Bedrock Agent (should not throw, should return fallback)
          const result = await invokeBedrockAgent(transcription, sessionId);

          // Property: Must return default CAUTION response
          expect(result).toBeDefined();
          expect(result.threatLevel).toBe('CAUTION');
          expect(result.riskScore).toBe(50); // Middle of CAUTION range
          expect(result.reasoning).toContain('temporarily unavailable');
          expect(result.fraudIndicators).toBeDefined();
          expect(Array.isArray(result.fraudIndicators)).toBe(true);
          expect(result.fraudIndicators.length).toBeGreaterThan(0);
          
          // Should have a fallback indicator
          const fallbackIndicator = result.fraudIndicators[0];
          expect(fallbackIndicator.type).toBe('PERSONAL_INFO_REQUEST');
          expect(fallbackIndicator.description).toContain('Unable to analyze');
          expect(fallbackIndicator.confidence).toBe(0.5);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('returns default CAUTION response when Bedrock times out', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: fc.string({ minLength: 50, maxLength: 500 }),
          sessionId: fc.uuid(),
        }),
        async ({ transcription, sessionId }) => {
          // Mock Bedrock to throw timeout error
          bedrockMock.on(InvokeAgentCommand).rejects(new Error('TimeoutError'));

          // Invoke Bedrock Agent
          const result = await invokeBedrockAgent(transcription, sessionId);

          // Property: Must return default CAUTION response
          expect(result.threatLevel).toBe('CAUTION');
          expect(result.riskScore).toBe(50);
          expect(result.reasoning).toContain('temporarily unavailable');
        }
      ),
      { numRuns: 20 }
    );
  });

  test('returns default CAUTION response when Bedrock returns network error', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: fc.string({ minLength: 50, maxLength: 500 }),
          sessionId: fc.uuid(),
        }),
        async ({ transcription, sessionId }) => {
          // Mock Bedrock to throw network error
          bedrockMock.on(InvokeAgentCommand).rejects(new Error('NetworkError'));

          // Invoke Bedrock Agent
          const result = await invokeBedrockAgent(transcription, sessionId);

          // Property: Must return default CAUTION response
          expect(result.threatLevel).toBe('CAUTION');
          expect(result.riskScore).toBe(50);
          expect(result.reasoning).toContain('temporarily unavailable');
        }
      ),
      { numRuns: 20 }
    );
  });

  test('returns default CAUTION response when Bedrock returns invalid JSON', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: fc.string({ minLength: 50, maxLength: 500 }),
          sessionId: fc.uuid(),
        }),
        async ({ transcription, sessionId }) => {
          // Mock Bedrock to return invalid JSON
          async function* generateInvalidCompletion() {
            yield {
              chunk: {
                bytes: new TextEncoder().encode('This is not valid JSON'),
              },
            };
          }

          bedrockMock.on(InvokeAgentCommand).resolves({
            completion: generateInvalidCompletion(),
            contentType: 'application/json',
            sessionId: sessionId,
          });

          // Invoke Bedrock Agent
          const result = await invokeBedrockAgent(transcription, sessionId);

          // Property: Must return default CAUTION response when parsing fails
          expect(result.threatLevel).toBe('CAUTION');
          expect(result.riskScore).toBe(50);
          expect(result.reasoning).toContain('temporarily unavailable');
        }
      ),
      { numRuns: 20 }
    );
  });

  test('fallback response has valid structure matching FraudAnalysisResult', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: fc.string({ minLength: 50, maxLength: 500 }),
          sessionId: fc.uuid(),
        }),
        async ({ transcription, sessionId }) => {
          // Mock Bedrock to fail
          bedrockMock.on(InvokeAgentCommand).rejects(new Error('ServiceError'));

          // Invoke Bedrock Agent
          const result = await invokeBedrockAgent(transcription, sessionId);

          // Property: Fallback response must have all required fields
          expect(result.riskScore).toBeDefined();
          expect(typeof result.riskScore).toBe('number');
          expect(result.riskScore).toBeGreaterThanOrEqual(0);
          expect(result.riskScore).toBeLessThanOrEqual(100);

          expect(result.threatLevel).toBeDefined();
          expect(['SAFE', 'CAUTION', 'DANGER']).toContain(result.threatLevel);

          expect(result.fraudIndicators).toBeDefined();
          expect(Array.isArray(result.fraudIndicators)).toBe(true);

          expect(result.reasoning).toBeDefined();
          expect(typeof result.reasoning).toBe('string');

          expect(result.knowledgeBaseReferences).toBeDefined();
          expect(Array.isArray(result.knowledgeBaseReferences)).toBe(true);

          expect(result.tokenUsage).toBeDefined();
          expect(result.tokenUsage.inputTokens).toBeDefined();
          expect(result.tokenUsage.outputTokens).toBeDefined();
        }
      ),
      { numRuns: 20 }
    );
  });

  test('retries before returning fallback response', async () => {
    // This test needs to run in isolation to count retries accurately
    const transcription = 'This is a test transcription that is long enough to be valid for analysis purposes';
    const sessionId = 'test-session-retry-count';
    
    // Reset circuit breaker to ensure clean state
    bedrockCircuitBreaker.reset();
    
    // Mock Bedrock to fail consistently
    let callCount = 0;
    bedrockMock.on(InvokeAgentCommand).callsFake(() => {
      callCount++;
      throw new Error('ServiceUnavailable');
    });

    // Invoke Bedrock Agent
    const result = await invokeBedrockAgent(transcription, sessionId);

    // Property: Should retry 2 times (total 3 attempts) before fallback
    // Initial attempt + 2 retries = 3 total calls
    expect(callCount).toBe(3);
    expect(result.threatLevel).toBe('CAUTION');
  });

  test('fallback response is user-friendly and actionable', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: fc.string({ minLength: 50, maxLength: 500 }),
          sessionId: fc.uuid(),
        }),
        async ({ transcription, sessionId }) => {
          // Mock Bedrock to fail
          bedrockMock.on(InvokeAgentCommand).rejects(new Error('ServiceError'));

          // Invoke Bedrock Agent
          const result = await invokeBedrockAgent(transcription, sessionId);

          // Property: Fallback message should be clear and actionable
          expect(result.reasoning).not.toContain('error');
          expect(result.reasoning).not.toContain('failed');
          expect(result.reasoning).not.toContain('exception');
          expect(result.reasoning.toLowerCase()).toContain('caution');
          
          // Should provide guidance to user
          const indicator = result.fraudIndicators[0];
          expect(indicator.description).toContain('Unable to analyze');
          expect(indicator.description.toLowerCase()).toContain('caution');
        }
      ),
      { numRuns: 20 }
    );
  });
});
