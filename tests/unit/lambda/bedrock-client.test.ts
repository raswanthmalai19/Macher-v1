import { mockClient } from 'aws-sdk-client-mock';
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { invokeBedrockAgent } from '../../../lambda/audio-processor/bedrock-client';

// Mock the Bedrock Agent Runtime client
const bedrockMock = mockClient(BedrockAgentRuntimeClient);

describe('Bedrock Client', () => {
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

  describe('invokeBedrockAgent', () => {
    it('should successfully invoke Bedrock Agent and return fraud analysis result', async () => {
      // Mock successful Bedrock Agent response
      const mockResponse = {
        riskScore: 75,
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
        reasoning: 'Multiple fraud indicators detected including urgency tactics and unusual payment method',
        knowledgeBaseReferences: ['IRS Scam Pattern', 'Gift Card Payment Indicator'],
      };

      // Create async iterable for streaming response
      const mockCompletion = (async function* () {
        // Yield chunk with completion text
        yield {
          chunk: {
            bytes: new TextEncoder().encode(JSON.stringify(mockResponse)),
          },
        };
        
        // Yield trace event
        yield {
          trace: {
            // Trace data would be here
          },
        };
      })();

      bedrockMock.on(InvokeAgentCommand).resolves({
        completion: mockCompletion,
        contentType: 'application/json',
        sessionId: 'test-session-123',
      });

      // Invoke Bedrock Agent
      const result = await invokeBedrockAgent(
        'This is the IRS. You owe back taxes and must pay immediately with gift cards or face arrest.',
        'test-session-123'
      );

      // Verify result structure
      expect(result).toBeDefined();
      expect(result.riskScore).toBe(75);
      expect(result.threatLevel).toBe('DANGER');
      expect(result.fraudIndicators).toHaveLength(2);
      expect(result.fraudIndicators[0].type).toBe('URGENCY');
      expect(result.fraudIndicators[1].type).toBe('PAYMENT_REQUEST');
      expect(result.reasoning).toContain('fraud indicators');
      expect(result.knowledgeBaseReferences).toHaveLength(2);
      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage.inputTokens).toBeGreaterThan(0);
      expect(result.tokenUsage.outputTokens).toBeGreaterThan(0);

      // Verify Bedrock Agent was called with correct parameters
      const calls = bedrockMock.commandCalls(InvokeAgentCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input).toMatchObject({
        agentId: 'test-agent-id',
        agentAliasId: 'test-alias-id',
        sessionId: 'test-session-123',
        enableTrace: true,
      });
    });

    it('should throw error when environment variables are not set', async () => {
      delete process.env.BEDROCK_AGENT_ID;
      delete process.env.BEDROCK_AGENT_ALIAS_ID;

      await expect(
        invokeBedrockAgent('Test transcription', 'test-session-123')
      ).rejects.toThrow('BEDROCK_AGENT_ID and BEDROCK_AGENT_ALIAS_ID environment variables must be set');
    });

    it('should return default CAUTION response on Bedrock Agent invocation failure', async () => {
      bedrockMock.on(InvokeAgentCommand).rejects(new Error('Bedrock service unavailable'));

      const result = await invokeBedrockAgent('Test transcription', 'test-session-123');
      
      // Requirements 8.2: Should return default CAUTION response instead of throwing
      expect(result).toBeDefined();
      expect(result.riskScore).toBe(50);
      expect(result.threatLevel).toBe('CAUTION');
      expect(result.fraudIndicators).toHaveLength(1);
      expect(result.fraudIndicators[0].type).toBe('PERSONAL_INFO_REQUEST');
      expect(result.reasoning).toContain('temporarily unavailable');
      expect(result.tokenUsage.inputTokens).toBe(0);
      expect(result.tokenUsage.outputTokens).toBe(0);
    });

    it('should return default CAUTION response for invalid JSON from Bedrock Agent', async () => {
      // Create async iterable with invalid JSON
      const mockCompletion = (async function* () {
        yield {
          chunk: {
            bytes: new TextEncoder().encode('This is not valid JSON'),
          },
        };
      })();

      bedrockMock.on(InvokeAgentCommand).resolves({
        completion: mockCompletion,
        contentType: 'application/json',
        sessionId: 'test-session-123',
      });

      const result = await invokeBedrockAgent('Test transcription', 'test-session-123');
      
      // Requirements 8.2: Should return default CAUTION response instead of throwing
      expect(result).toBeDefined();
      expect(result.riskScore).toBe(50);
      expect(result.threatLevel).toBe('CAUTION');
      expect(result.reasoning).toContain('temporarily unavailable');
    });

    it('should return default values when response fields are missing', async () => {
      // Mock response with minimal fields
      const mockResponse = {};

      const mockCompletion = (async function* () {
        yield {
          chunk: {
            bytes: new TextEncoder().encode(JSON.stringify(mockResponse)),
          },
        };
      })();

      bedrockMock.on(InvokeAgentCommand).resolves({
        completion: mockCompletion,
        contentType: 'application/json',
        sessionId: 'test-session-123',
      });

      const result = await invokeBedrockAgent('Test transcription', 'test-session-123');

      // Verify default values are used (Requirements 8.2: default CAUTION response)
      // When riskScore is missing, default to 50 (CAUTION range) for safety
      expect(result.riskScore).toBe(50);
      expect(result.threatLevel).toBe('CAUTION');
      expect(result.fraudIndicators).toEqual([]);
      expect(result.reasoning).toBe('Analysis completed');
      expect(result.knowledgeBaseReferences).toEqual([]);
    });

    it('should estimate token usage based on text length when not provided', async () => {
      const transcription = 'This is a test transcription with multiple words to estimate token count';
      const mockResponse = {
        riskScore: 50,
        threatLevel: 'CAUTION',
        fraudIndicators: [],
        reasoning: 'No significant fraud indicators detected',
        knowledgeBaseReferences: [],
      };

      const mockCompletion = (async function* () {
        yield {
          chunk: {
            bytes: new TextEncoder().encode(JSON.stringify(mockResponse)),
          },
        };
      })();

      bedrockMock.on(InvokeAgentCommand).resolves({
        completion: mockCompletion,
        contentType: 'application/json',
        sessionId: 'test-session-123',
      });

      const result = await invokeBedrockAgent(transcription, 'test-session-123');

      // Verify token usage is estimated (roughly 1 token per 4 characters)
      const expectedInputTokens = Math.ceil(transcription.length / 4);
      const expectedOutputTokens = Math.ceil(JSON.stringify(mockResponse).length / 4);
      
      expect(result.tokenUsage.inputTokens).toBeGreaterThanOrEqual(expectedInputTokens - 5);
      expect(result.tokenUsage.inputTokens).toBeLessThanOrEqual(expectedInputTokens + 5);
      expect(result.tokenUsage.outputTokens).toBeGreaterThanOrEqual(expectedOutputTokens - 5);
      expect(result.tokenUsage.outputTokens).toBeLessThanOrEqual(expectedOutputTokens + 5);
    });

    it('should log PII entities redacted by Guardrails', async () => {
      // Mock response with fraud analysis
      const mockResponse = {
        riskScore: 60,
        threatLevel: 'CAUTION',
        fraudIndicators: [],
        reasoning: 'Potential fraud detected',
        knowledgeBaseReferences: [],
      };

      // Create async iterable with guardrail trace showing PII redaction
      const mockCompletion = (async function* () {
        // Yield trace event with guardrail information
        yield {
          trace: {
            trace: {
              guardrailTrace: {
                action: 'INTERVENED',
                inputAssessments: [
                  {
                    sensitiveInformationPolicy: {
                      piiEntities: [
                        {
                          type: 'NAME',
                          action: 'ANONYMIZED',
                          match: 'John Doe',
                        },
                        {
                          type: 'PHONE',
                          action: 'ANONYMIZED',
                          match: '555-1234',
                        },
                        {
                          type: 'ADDRESS',
                          action: 'ANONYMIZED',
                          match: '123 Main St',
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        } as any;
        
        // Yield chunk with completion text
        yield {
          chunk: {
            bytes: new TextEncoder().encode(JSON.stringify(mockResponse)),
          },
        } as any;
      })();

      bedrockMock.on(InvokeAgentCommand).resolves({
        completion: mockCompletion as any,
        contentType: 'application/json',
        sessionId: 'test-session-123',
      });

      // Spy on console.log to verify PII redaction logging
      const consoleLogSpy = jest.spyOn(console, 'log');

      // Invoke Bedrock Agent
      const result = await invokeBedrockAgent(
        'My name is John Doe, call me at 555-1234, I live at 123 Main St',
        'test-session-123'
      );

      // Verify result is returned
      expect(result).toBeDefined();
      expect(result.riskScore).toBe(60);

      // Verify PII redaction was logged
      const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      
      // Find the guardrail action log
      const guardrailActionLog = logs.find(log => log.message === 'Guardrail action detected');
      expect(guardrailActionLog).toBeDefined();
      expect(guardrailActionLog.guardrailAction).toBe('INTERVENED');
      
      // Find the PII entities redacted log
      const piiRedactedLog = logs.find(log => log.message === 'PII entities redacted by Guardrails');
      expect(piiRedactedLog).toBeDefined();
      expect(piiRedactedLog.piiEntitiesRedacted).toEqual(['NAME', 'PHONE', 'ADDRESS']);
      expect(piiRedactedLog.piiEntityCount).toBe(3);

      consoleLogSpy.mockRestore();
    });

    it('should log when no PII is detected', async () => {
      // Mock response
      const mockResponse = {
        riskScore: 20,
        threatLevel: 'SAFE',
        fraudIndicators: [],
        reasoning: 'No fraud detected',
        knowledgeBaseReferences: [],
      };

      // Create async iterable with guardrail trace showing no PII
      const mockCompletion = (async function* () {
        // Yield trace event with guardrail information but no PII entities
        yield {
          trace: {
            trace: {
              guardrailTrace: {
                action: 'NONE',
                inputAssessments: [
                  {
                    sensitiveInformationPolicy: {
                      piiEntities: [],
                    },
                  },
                ],
              },
            },
          },
        } as any;
        
        // Yield chunk with completion text
        yield {
          chunk: {
            bytes: new TextEncoder().encode(JSON.stringify(mockResponse)),
          },
        } as any;
      })();

      bedrockMock.on(InvokeAgentCommand).resolves({
        completion: mockCompletion as any,
        contentType: 'application/json',
        sessionId: 'test-session-123',
      });

      // Spy on console.log to verify logging
      const consoleLogSpy = jest.spyOn(console, 'log');

      // Invoke Bedrock Agent
      const result = await invokeBedrockAgent(
        'This is a normal conversation with no personal information',
        'test-session-123'
      );

      // Verify result is returned
      expect(result).toBeDefined();
      expect(result.riskScore).toBe(20);

      // Verify "No PII detected" was logged
      const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      const noPiiLog = logs.find(log => log.message === 'No PII detected in transcription');
      expect(noPiiLog).toBeDefined();

      consoleLogSpy.mockRestore();
    });

    // Task 8.5: Validation tests for fraud analysis response
    describe('Response Validation (Task 8.5)', () => {
      it('should validate riskScore is between 0-100 and correct invalid values', async () => {
        // Mock response with invalid riskScore
        const mockResponse = {
          riskScore: 150, // Invalid: > 100
          threatLevel: 'DANGER',
          fraudIndicators: [],
          reasoning: 'Test',
          knowledgeBaseReferences: [],
        };

        const mockCompletion = (async function* () {
          yield {
            chunk: {
              bytes: new TextEncoder().encode(JSON.stringify(mockResponse)),
            },
          };
        })();

        bedrockMock.on(InvokeAgentCommand).resolves({
          completion: mockCompletion,
          contentType: 'application/json',
          sessionId: 'test-session-123',
        });

        const consoleLogSpy = jest.spyOn(console, 'log');

        const result = await invokeBedrockAgent('Test', 'test-session-123');

        // Should default to 50 (CAUTION)
        expect(result.riskScore).toBe(50);
        expect(result.threatLevel).toBe('CAUTION');

        // Verify warning was logged
        const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
        const warningLog = logs.find(log => log.message === 'Invalid riskScore in Bedrock response, using default value');
        expect(warningLog).toBeDefined();
        expect(warningLog?.level).toBe('WARN');

        consoleLogSpy.mockRestore();
      });

      it('should validate threatLevel matches riskScore range (SAFE: 0-33)', async () => {
        const mockResponse = {
          riskScore: 20,
          threatLevel: 'DANGER', // Invalid: should be SAFE
          fraudIndicators: [],
          reasoning: 'Test',
          knowledgeBaseReferences: [],
        };

        const mockCompletion = (async function* () {
          yield {
            chunk: {
              bytes: new TextEncoder().encode(JSON.stringify(mockResponse)),
            },
          };
        })();

        bedrockMock.on(InvokeAgentCommand).resolves({
          completion: mockCompletion,
          contentType: 'application/json',
          sessionId: 'test-session-123',
        });

        const consoleLogSpy = jest.spyOn(console, 'log');

        const result = await invokeBedrockAgent('Test', 'test-session-123');

        // Should correct to SAFE
        expect(result.riskScore).toBe(20);
        expect(result.threatLevel).toBe('SAFE');

        // Verify warning was logged
        const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
        const warningLog = logs.find(log => log.message === 'threatLevel does not match riskScore range, correcting to match');
        expect(warningLog).toBeDefined();
        expect(warningLog?.providedThreatLevel).toBe('DANGER');
        expect(warningLog?.expectedThreatLevel).toBe('SAFE');

        consoleLogSpy.mockRestore();
      });

      it('should validate threatLevel matches riskScore range (CAUTION: 34-66)', async () => {
        const mockResponse = {
          riskScore: 50,
          threatLevel: 'SAFE', // Invalid: should be CAUTION
          fraudIndicators: [],
          reasoning: 'Test',
          knowledgeBaseReferences: [],
        };

        const mockCompletion = (async function* () {
          yield {
            chunk: {
              bytes: new TextEncoder().encode(JSON.stringify(mockResponse)),
            },
          };
        })();

        bedrockMock.on(InvokeAgentCommand).resolves({
          completion: mockCompletion,
          contentType: 'application/json',
          sessionId: 'test-session-123',
        });

        const result = await invokeBedrockAgent('Test', 'test-session-123');

        // Should correct to CAUTION
        expect(result.riskScore).toBe(50);
        expect(result.threatLevel).toBe('CAUTION');
      });

      it('should validate threatLevel matches riskScore range (DANGER: 67-100)', async () => {
        const mockResponse = {
          riskScore: 85,
          threatLevel: 'CAUTION', // Invalid: should be DANGER
          fraudIndicators: [],
          reasoning: 'Test',
          knowledgeBaseReferences: [],
        };

        const mockCompletion = (async function* () {
          yield {
            chunk: {
              bytes: new TextEncoder().encode(JSON.stringify(mockResponse)),
            },
          };
        })();

        bedrockMock.on(InvokeAgentCommand).resolves({
          completion: mockCompletion,
          contentType: 'application/json',
          sessionId: 'test-session-123',
        });

        const result = await invokeBedrockAgent('Test', 'test-session-123');

        // Should correct to DANGER
        expect(result.riskScore).toBe(85);
        expect(result.threatLevel).toBe('DANGER');
      });

      it('should validate fraudIndicators array structure and filter invalid entries', async () => {
        const mockResponse = {
          riskScore: 60,
          threatLevel: 'CAUTION',
          fraudIndicators: [
            {
              type: 'URGENCY',
              description: 'Valid indicator',
              confidence: 0.8,
            },
            {
              // Missing type
              description: 'Invalid - no type',
              confidence: 0.7,
            },
            {
              type: 'PAYMENT_REQUEST',
              // Missing description
              confidence: 0.9,
            },
            {
              type: 'THREAT',
              description: 'Invalid - bad confidence',
              confidence: 1.5, // Invalid: > 1.0
            },
            {
              type: 'IMPERSONATION',
              description: 'Another valid indicator',
              confidence: 0.6,
            },
          ],
          reasoning: 'Test',
          knowledgeBaseReferences: [],
        };

        const mockCompletion = (async function* () {
          yield {
            chunk: {
              bytes: new TextEncoder().encode(JSON.stringify(mockResponse)),
            },
          };
        })();

        bedrockMock.on(InvokeAgentCommand).resolves({
          completion: mockCompletion,
          contentType: 'application/json',
          sessionId: 'test-session-123',
        });

        const consoleLogSpy = jest.spyOn(console, 'log');

        const result = await invokeBedrockAgent('Test', 'test-session-123');

        // Should only include valid indicators (first and last)
        expect(result.fraudIndicators).toHaveLength(2);
        expect(result.fraudIndicators[0].type).toBe('URGENCY');
        expect(result.fraudIndicators[1].type).toBe('IMPERSONATION');

        // Verify warnings were logged for invalid indicators
        const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
        const warningLogs = logs.filter(log => log.message === 'Invalid fraud indicator structure, excluding from results');
        expect(warningLogs.length).toBe(3); // 3 invalid indicators

        consoleLogSpy.mockRestore();
      });

      it('should handle non-array fraudIndicators gracefully', async () => {
        const mockResponse = {
          riskScore: 40,
          threatLevel: 'CAUTION',
          fraudIndicators: 'not an array', // Invalid type
          reasoning: 'Test',
          knowledgeBaseReferences: [],
        };

        const mockCompletion = (async function* () {
          yield {
            chunk: {
              bytes: new TextEncoder().encode(JSON.stringify(mockResponse)),
            },
          };
        })();

        bedrockMock.on(InvokeAgentCommand).resolves({
          completion: mockCompletion,
          contentType: 'application/json',
          sessionId: 'test-session-123',
        });

        const consoleLogSpy = jest.spyOn(console, 'log');

        const result = await invokeBedrockAgent('Test', 'test-session-123');

        // Should default to empty array
        expect(result.fraudIndicators).toEqual([]);

        // Verify warning was logged
        const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
        const warningLog = logs.find(log => log.message === 'fraudIndicators is not an array in Bedrock response, using empty array');
        expect(warningLog).toBeDefined();

        consoleLogSpy.mockRestore();
      });

      it('should extract token usage from response metadata', async () => {
        const transcription = 'This is a test transcription with some words';
        const mockResponse = {
          riskScore: 30,
          threatLevel: 'SAFE',
          fraudIndicators: [],
          reasoning: 'No fraud detected in this conversation',
          knowledgeBaseReferences: [],
        };

        const mockCompletion = (async function* () {
          yield {
            chunk: {
              bytes: new TextEncoder().encode(JSON.stringify(mockResponse)),
            },
          };
        })();

        bedrockMock.on(InvokeAgentCommand).resolves({
          completion: mockCompletion,
          contentType: 'application/json',
          sessionId: 'test-session-123',
        });

        const result = await invokeBedrockAgent(transcription, 'test-session-123');

        // Verify token usage is estimated (roughly 1 token per 4 characters)
        expect(result.tokenUsage.inputTokens).toBeGreaterThan(0);
        expect(result.tokenUsage.outputTokens).toBeGreaterThan(0);
        expect(result.tokenUsage.inputTokens).toBeCloseTo(Math.ceil(transcription.length / 4), 2);
      });
    });
  });
});

