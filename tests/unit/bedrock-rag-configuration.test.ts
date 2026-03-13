import { invokeBedrockAgent } from '../../lambda/audio-processor/bedrock-client';
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { mockClient } from 'aws-sdk-client-mock';

/**
 * Example 5: Bedrock RAG Configuration
 * 
 * Verify Fraud Detector uses RAG with Knowledge Base during analysis.
 * 
 * Validates: Requirements 11.4
 */
describe('Example 5: Bedrock RAG Configuration', () => {
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

  test('Bedrock Agent invocation enables trace for RAG monitoring', async () => {
    // Requirement 11.4: Verify enableTrace is set to true for RAG monitoring
    const transcription = 'This is a test transcription for RAG verification';
    const sessionId = 'test-session-rag';

    // Mock successful Bedrock response
    async function* generateCompletion() {
      yield {
        chunk: {
          bytes: new TextEncoder().encode(JSON.stringify({
            riskScore: 25,
            threatLevel: 'SAFE',
            fraudIndicators: [],
            reasoning: 'No fraud detected',
            knowledgeBaseReferences: ['irs-scams.md'],
          })),
        },
      };
    }

    bedrockMock.on(InvokeAgentCommand).resolves({
      completion: generateCompletion(),
      contentType: 'application/json',
      sessionId: sessionId,
    });

    // Invoke Bedrock Agent
    await invokeBedrockAgent(transcription, sessionId);

    // Verify that InvokeAgentCommand was called with enableTrace: true
    const calls = bedrockMock.commandCalls(InvokeAgentCommand);
    expect(calls.length).toBeGreaterThan(0);

    const firstCall = calls[0];
    expect(firstCall.args[0].input).toBeDefined();
    expect(firstCall.args[0].input.enableTrace).toBe(true);
  });

  test('Bedrock Agent response includes Knowledge Base references', async () => {
    // Requirement 11.4: Verify RAG returns Knowledge Base references
    const transcription = 'I received a call saying I owe taxes and need to pay immediately';
    const sessionId = 'test-session-kb-refs';

    // Mock Bedrock response with Knowledge Base references
    async function* generateCompletion() {
      yield {
        chunk: {
          bytes: new TextEncoder().encode(JSON.stringify({
            riskScore: 85,
            threatLevel: 'DANGER',
            fraudIndicators: [
              {
                type: 'URGENCY',
                description: 'Immediate payment demand',
                confidence: 0.9,
              },
            ],
            reasoning: 'IRS scam pattern detected',
            knowledgeBaseReferences: [
              'irs-scams.md',
              'fraud-indicators.md',
            ],
          })),
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

    // Verify Knowledge Base references are included in response
    expect(result.knowledgeBaseReferences).toBeDefined();
    expect(Array.isArray(result.knowledgeBaseReferences)).toBe(true);
    expect(result.knowledgeBaseReferences.length).toBeGreaterThan(0);
    expect(result.knowledgeBaseReferences).toContain('irs-scams.md');
  });

  test('Bedrock Agent uses orchestration trace for Knowledge Base lookups', async () => {
    // Requirement 11.4: Verify orchestration trace indicates KB usage
    const transcription = 'Someone called about my computer having a virus';
    const sessionId = 'test-session-orchestration';

    let orchestrationTraceDetected = false;

    // Mock Bedrock response with orchestration trace
    async function* generateCompletion() {
      // First yield a trace event showing orchestration (KB lookup)
      yield {
        trace: {
          trace: {
            orchestrationTrace: {
              modelInvocationInput: {
                text: 'Analyzing for tech support scam patterns',
              },
            },
          },
        },
      };

      // Then yield the completion
      yield {
        chunk: {
          bytes: new TextEncoder().encode(JSON.stringify({
            riskScore: 75,
            threatLevel: 'DANGER',
            fraudIndicators: [
              {
                type: 'IMPERSONATION',
                description: 'Tech support impersonation',
                confidence: 0.85,
              },
            ],
            reasoning: 'Tech support scam pattern detected',
            knowledgeBaseReferences: ['tech-support-scams.md'],
          })),
        },
      };
    }

    bedrockMock.on(InvokeAgentCommand).resolves({
      completion: generateCompletion(),
      contentType: 'application/json',
      sessionId: sessionId,
    });

    // Spy on console.log to capture orchestration trace logs
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation((message) => {
      try {
        const log = JSON.parse(message);
        if (log.message && log.message.includes('Orchestration trace detected')) {
          orchestrationTraceDetected = true;
        }
      } catch {
        // Not JSON, ignore
      }
    });

    // Invoke Bedrock Agent
    const result = await invokeBedrockAgent(transcription, sessionId);

    // Verify orchestration trace was detected (indicating KB lookup)
    expect(orchestrationTraceDetected).toBe(true);
    expect(result.knowledgeBaseReferences).toContain('tech-support-scams.md');

    consoleLogSpy.mockRestore();
  });

  test('Bedrock Agent configuration includes agent ID and alias ID', async () => {
    // Requirement 11.4: Verify Bedrock Agent is properly configured
    const transcription = 'Test transcription';
    const sessionId = 'test-session-config';

    // Mock successful response
    async function* generateCompletion() {
      yield {
        chunk: {
          bytes: new TextEncoder().encode(JSON.stringify({
            riskScore: 30,
            threatLevel: 'SAFE',
            fraudIndicators: [],
            reasoning: 'Safe call',
            knowledgeBaseReferences: [],
          })),
        },
      };
    }

    bedrockMock.on(InvokeAgentCommand).resolves({
      completion: generateCompletion(),
      contentType: 'application/json',
      sessionId: sessionId,
    });

    // Invoke Bedrock Agent
    await invokeBedrockAgent(transcription, sessionId);

    // Verify InvokeAgentCommand was called with correct agent configuration
    const calls = bedrockMock.commandCalls(InvokeAgentCommand);
    expect(calls.length).toBeGreaterThan(0);

    const firstCall = calls[0];
    const input = firstCall.args[0].input;

    expect(input.agentId).toBe('test-agent-id');
    expect(input.agentAliasId).toBe('test-alias-id');
    expect(input.sessionId).toBe(sessionId);
    expect(input.inputText).toBe(transcription);
  });

  test('RAG enhances fraud detection with Knowledge Base context', async () => {
    // Requirement 11.4: Verify RAG provides context-aware fraud detection
    const transcription = 'You need to pay your taxes immediately or you will be arrested';
    const sessionId = 'test-session-rag-context';

    // Mock Bedrock response showing RAG-enhanced detection
    async function* generateCompletion() {
      yield {
        chunk: {
          bytes: new TextEncoder().encode(JSON.stringify({
            riskScore: 95,
            threatLevel: 'DANGER',
            fraudIndicators: [
              {
                type: 'URGENCY',
                description: 'Immediate action demanded',
                confidence: 0.95,
              },
              {
                type: 'THREAT',
                description: 'Arrest threat',
                confidence: 0.9,
              },
              {
                type: 'IMPERSONATION',
                description: 'IRS impersonation',
                confidence: 0.85,
              },
            ],
            reasoning: 'Classic IRS scam pattern: urgency + arrest threat + payment demand',
            knowledgeBaseReferences: [
              'irs-scams.md',
              'fraud-indicators.md',
            ],
          })),
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

    // Verify RAG-enhanced detection
    expect(result.threatLevel).toBe('DANGER');
    expect(result.riskScore).toBeGreaterThan(90);
    expect(result.fraudIndicators.length).toBeGreaterThan(0);
    expect(result.knowledgeBaseReferences.length).toBeGreaterThan(0);
    
    // Verify reasoning references Knowledge Base patterns
    expect(result.reasoning.toLowerCase()).toContain('scam');
  });

  test('Knowledge Base references are optional for safe calls', async () => {
    // Requirement 11.4: Verify RAG doesn't require KB references for safe calls
    const transcription = 'Hello, this is a normal conversation about the weather';
    const sessionId = 'test-session-safe-call';

    // Mock safe call response without KB references
    async function* generateCompletion() {
      yield {
        chunk: {
          bytes: new TextEncoder().encode(JSON.stringify({
            riskScore: 5,
            threatLevel: 'SAFE',
            fraudIndicators: [],
            reasoning: 'Normal conversation, no fraud indicators detected',
            knowledgeBaseReferences: [],
          })),
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

    // Verify safe call doesn't require KB references
    expect(result.threatLevel).toBe('SAFE');
    expect(result.knowledgeBaseReferences).toBeDefined();
    expect(Array.isArray(result.knowledgeBaseReferences)).toBe(true);
    // KB references can be empty for safe calls
  });
});
