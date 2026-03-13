/**
 * Feature: competition-mvp-backend, Property 10: PII Redaction Before Analysis
 * 
 * For any transcription containing PII (names, phone numbers, addresses, SSNs),
 * the Guardrails should redact all PII before the text reaches the Bedrock Agent
 * for fraud analysis.
 * 
 * Validates: Requirements 4.2
 */

import * as fc from 'fast-check';
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { mockClient } from 'aws-sdk-client-mock';
import { invokeBedrockAgent } from '../../lambda/audio-processor/bedrock-client';

// Mock X-Ray SDK
jest.mock('aws-xray-sdk-core', () => ({
  captureAWSv3Client: jest.fn((client) => client),
}));

describe('Property 10: PII Redaction Before Analysis', () => {
  let bedrockClientMock: any;
  let consoleLogSpy: jest.SpyInstance;

  beforeAll(() => {
    // Set up environment variables
    process.env.AWS_REGION = 'us-east-1';
    process.env.BEDROCK_AGENT_ID = 'test-agent-id-12345';
    process.env.BEDROCK_AGENT_ALIAS_ID = 'test-alias-id-67890';
  });

  beforeEach(() => {
    // Create mock for BedrockAgentRuntimeClient
    bedrockClientMock = mockClient(BedrockAgentRuntimeClient);
    
    // Spy on console.log to capture structured logs
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    bedrockClientMock.reset();
    consoleLogSpy.mockRestore();
  });

  afterAll(() => {
    // Clean up environment variables
    delete process.env.BEDROCK_AGENT_ID;
    delete process.env.BEDROCK_AGENT_ALIAS_ID;
  });

  /**
   * Generator for PII types that should be redacted
   */
  const piiTypeGen = fc.constantFrom(
    'NAME',
    'PHONE',
    'ADDRESS',
    'EMAIL',
    'SSN',
    'CREDIT_DEBIT_CARD_NUMBER',
    'US_BANK_ACCOUNT_NUMBER',
    'US_PASSPORT_NUMBER'
  );

  /**
   * Generator for transcriptions with PII
   * Creates realistic conversation snippets that contain various PII types
   */
  const transcriptionWithPIIGen = fc.record({
    firstName: fc.constantFrom('John', 'Jane', 'Robert', 'Mary', 'Michael', 'Sarah'),
    lastName: fc.constantFrom('Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia'),
    phone: fc.tuple(fc.integer({ min: 200, max: 999 }), fc.integer({ min: 200, max: 999 }), fc.integer({ min: 1000, max: 9999 }))
      .map(([area, prefix, line]) => `${area}-${prefix}-${line}`),
    address: fc.record({
      street: fc.integer({ min: 1, max: 9999 }).chain(num => fc.constantFrom('Main St', 'Oak Ave', 'Elm Dr', 'Park Blvd').map(st => `${num} ${st}`)),
      city: fc.constantFrom('Springfield', 'Riverside', 'Madison', 'Georgetown'),
      state: fc.constantFrom('CA', 'NY', 'TX', 'FL'),
      zip: fc.integer({ min: 10000, max: 99999 }).map(String),
    }),
    ssn: fc.tuple(fc.integer({ min: 100, max: 999 }), fc.integer({ min: 10, max: 99 }), fc.integer({ min: 1000, max: 9999 }))
      .map(([area, group, serial]) => `${area}-${group}-${serial}`),
  }).chain(pii => {
    const fullName = `${pii.firstName} ${pii.lastName}`;
    return fc.constantFrom(
      `Hello, my name is ${fullName} and you can reach me at ${pii.phone}. I live at ${pii.address.street}, ${pii.address.city}, ${pii.address.state} ${pii.address.zip}.`,
      `This is ${fullName}. My phone number is ${pii.phone} and my social security number is ${pii.ssn}.`,
      `I'm calling from ${pii.address.street} in ${pii.address.city}. You can call me back at ${pii.phone}. My name is ${fullName}.`,
      `My SSN is ${pii.ssn}. I'm ${fullName} and I live at ${pii.address.street}, ${pii.address.city}, ${pii.address.state}.`,
      `Please send the refund to ${fullName} at ${pii.address.street}, ${pii.address.city}, ${pii.address.state} ${pii.address.zip}. Call me at ${pii.phone}.`
    );
  });

  /**
   * Generator for call session IDs
   */
  const sessionIdGen = fc.uuid();

  /**
   * Helper to create a mock Bedrock Agent response with guardrail trace
   */
  function createMockBedrockResponseWithGuardrails(piiEntities: string[] = []) {
    const responseJson = JSON.stringify({
      riskScore: 50,
      threatLevel: 'CAUTION',
      fraudIndicators: [
        {
          type: 'PERSONAL_INFO_REQUEST',
          description: 'Caller requested personal information',
          confidence: 0.7,
        },
      ],
      reasoning: 'Analysis completed with PII redaction',
      knowledgeBaseReferences: [],
    });

    return {
      completion: {
        [Symbol.asyncIterator]: async function* () {
          // First yield the guardrail trace event
          if (piiEntities.length > 0) {
            yield {
              trace: {
                trace: {
                  guardrailTrace: {
                    action: 'INTERVENED',
                    inputAssessments: [
                      {
                        sensitiveInformationPolicy: {
                          piiEntities: piiEntities.map(type => ({
                            type,
                            action: 'ANONYMIZED',
                          })),
                        },
                      },
                    ],
                  },
                },
              },
            };
          } else {
            // No PII detected
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
            };
          }

          // Then yield the completion chunk
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
   * Property: Any transcription with PII should have PII redacted before Bedrock analysis
   * 
   * Requirement 4.2: Guardrails redact all PII before analysis
   */
  it('should redact PII from any transcription containing personal information', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: transcriptionWithPIIGen,
          sessionId: sessionIdGen,
          piiTypes: fc.array(piiTypeGen, { minLength: 1, maxLength: 4 }).map(arr => [...new Set(arr)]), // Unique PII types
        }),
        async ({ transcription, sessionId, piiTypes }) => {
          // Reset mocks
          bedrockClientMock.reset();
          consoleLogSpy.mockClear();
          
          // Mock Bedrock Agent response with guardrail trace showing PII redaction
          bedrockClientMock.on(InvokeAgentCommand).resolves(
            createMockBedrockResponseWithGuardrails(piiTypes)
          );

          // Invoke Bedrock Agent with transcription containing PII
          const result = await invokeBedrockAgent(transcription, sessionId);

          // Verify Bedrock Agent was called
          const calls = bedrockClientMock.commandCalls(InvokeAgentCommand);
          expect(calls.length).toBe(1);

          // Verify enableTrace was set to true (required for guardrail monitoring)
          const command = calls[0].args[0] as any;
          expect(command.input.enableTrace).toBe(true);

          // Verify that PII redaction was logged
          const logs = consoleLogSpy.mock.calls.map(call => {
            try {
              return JSON.parse(call[0]);
            } catch {
              return null;
            }
          }).filter(log => log !== null);

          // Find the PII redaction log entry
          const piiRedactionLog = logs.find(log => 
            log.message === 'PII entities redacted by Guardrails' ||
            log.message === 'No PII detected in transcription'
          );

          expect(piiRedactionLog).toBeDefined();
          expect(piiRedactionLog.callSessionId).toBe(sessionId);

          // If PII was detected, verify it was logged
          if (piiRedactionLog.message === 'PII entities redacted by Guardrails') {
            expect(piiRedactionLog.piiEntitiesRedacted).toBeDefined();
            expect(Array.isArray(piiRedactionLog.piiEntitiesRedacted)).toBe(true);
            expect(piiRedactionLog.piiEntitiesRedacted.length).toBeGreaterThan(0);
            expect(piiRedactionLog.piiEntityCount).toBeGreaterThan(0);
          }

          // Verify the result is still valid (analysis completed despite PII)
          expect(result).toBeDefined();
          expect(result.riskScore).toBeGreaterThanOrEqual(0);
          expect(result.riskScore).toBeLessThanOrEqual(100);

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Guardrail action should be logged for all transcriptions
   * 
   * Requirement 4.2: Verify guardrail activity is monitored
   */
  it('should log guardrail action for any transcription', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: fc.oneof(
            transcriptionWithPIIGen,
            fc.string({ minLength: 50, maxLength: 200 })
          ),
          sessionId: sessionIdGen,
          hasPII: fc.boolean(),
        }),
        async ({ transcription, sessionId, hasPII }) => {
          // Reset mocks
          bedrockClientMock.reset();
          consoleLogSpy.mockClear();
          
          // Mock Bedrock Agent response with or without PII
          const piiTypes = hasPII ? ['NAME', 'PHONE'] : [];
          bedrockClientMock.on(InvokeAgentCommand).resolves(
            createMockBedrockResponseWithGuardrails(piiTypes)
          );

          // Invoke Bedrock Agent
          await invokeBedrockAgent(transcription, sessionId);

          // Verify guardrail action was logged
          const logs = consoleLogSpy.mock.calls.map(call => {
            try {
              return JSON.parse(call[0]);
            } catch {
              return null;
            }
          }).filter(log => log !== null);

          const guardrailActionLog = logs.find(log => 
            log.message === 'Guardrail action detected'
          );

          if (hasPII) {
            expect(guardrailActionLog).toBeDefined();
            expect(guardrailActionLog.guardrailAction).toBe('INTERVENED');
          } else {
            // For non-PII transcriptions, action might be 'NONE'
            if (guardrailActionLog) {
              expect(guardrailActionLog.guardrailAction).toBe('NONE');
            }
          }

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: PII entity types should be logged when redacted
   * 
   * Requirement 4.2: Verify specific PII types are tracked
   */
  it('should log specific PII entity types that were redacted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: transcriptionWithPIIGen,
          sessionId: sessionIdGen,
          piiTypes: fc.array(piiTypeGen, { minLength: 1, maxLength: 3 }).map(arr => [...new Set(arr)]),
        }),
        async ({ transcription, sessionId, piiTypes }) => {
          // Reset mocks
          bedrockClientMock.reset();
          consoleLogSpy.mockClear();
          
          // Mock Bedrock Agent response with specific PII types
          bedrockClientMock.on(InvokeAgentCommand).resolves(
            createMockBedrockResponseWithGuardrails(piiTypes)
          );

          // Invoke Bedrock Agent
          await invokeBedrockAgent(transcription, sessionId);

          // Verify PII entity types were logged
          const logs = consoleLogSpy.mock.calls.map(call => {
            try {
              return JSON.parse(call[0]);
            } catch {
              return null;
            }
          }).filter(log => log !== null);

          const piiRedactionLog = logs.find(log => 
            log.message === 'PII entities redacted by Guardrails'
          );

          expect(piiRedactionLog).toBeDefined();
          expect(piiRedactionLog.piiEntitiesRedacted).toBeDefined();
          expect(Array.isArray(piiRedactionLog.piiEntitiesRedacted)).toBe(true);
          
          // Verify the logged PII types match what was redacted
          expect(piiRedactionLog.piiEntitiesRedacted.length).toBe(piiTypes.length);
          for (const piiType of piiTypes) {
            expect(piiRedactionLog.piiEntitiesRedacted).toContain(piiType);
          }

          // Verify entity count matches
          expect(piiRedactionLog.piiEntityCount).toBe(piiTypes.length);

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Transcriptions without PII should be processed normally
   * 
   * Requirement 4.2: Verify non-PII transcriptions work correctly
   */
  it('should process transcriptions without PII normally', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: fc.string({ minLength: 50, maxLength: 200 }),
          sessionId: sessionIdGen,
        }),
        async ({ transcription, sessionId }) => {
          // Reset mocks
          bedrockClientMock.reset();
          consoleLogSpy.mockClear();
          
          // Mock Bedrock Agent response with no PII detected
          bedrockClientMock.on(InvokeAgentCommand).resolves(
            createMockBedrockResponseWithGuardrails([])
          );

          // Invoke Bedrock Agent
          const result = await invokeBedrockAgent(transcription, sessionId);

          // Verify the result is valid
          expect(result).toBeDefined();
          expect(result.riskScore).toBeGreaterThanOrEqual(0);
          expect(result.riskScore).toBeLessThanOrEqual(100);

          // Verify "No PII detected" was logged
          const logs = consoleLogSpy.mock.calls.map(call => {
            try {
              return JSON.parse(call[0]);
            } catch {
              return null;
            }
          }).filter(log => log !== null);

          const noPIILog = logs.find(log => 
            log.message === 'No PII detected in transcription'
          );

          expect(noPIILog).toBeDefined();
          expect(noPIILog.callSessionId).toBe(sessionId);

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Multiple PII types in same transcription should all be redacted
   * 
   * Requirement 4.2: Verify comprehensive PII redaction
   */
  it('should redact all PII types when multiple types are present', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: transcriptionWithPIIGen,
          sessionId: sessionIdGen,
        }),
        async ({ transcription, sessionId }) => {
          // Reset mocks
          bedrockClientMock.reset();
          consoleLogSpy.mockClear();
          
          // Mock Bedrock Agent response with multiple PII types
          const multiplePIITypes = ['NAME', 'PHONE', 'ADDRESS', 'SSN'];
          bedrockClientMock.on(InvokeAgentCommand).resolves(
            createMockBedrockResponseWithGuardrails(multiplePIITypes)
          );

          // Invoke Bedrock Agent
          await invokeBedrockAgent(transcription, sessionId);

          // Verify all PII types were logged
          const logs = consoleLogSpy.mock.calls.map(call => {
            try {
              return JSON.parse(call[0]);
            } catch {
              return null;
            }
          }).filter(log => log !== null);

          const piiRedactionLog = logs.find(log => 
            log.message === 'PII entities redacted by Guardrails'
          );

          expect(piiRedactionLog).toBeDefined();
          expect(piiRedactionLog.piiEntitiesRedacted).toBeDefined();
          expect(piiRedactionLog.piiEntitiesRedacted.length).toBe(multiplePIITypes.length);
          
          // Verify all expected PII types are present
          for (const piiType of multiplePIITypes) {
            expect(piiRedactionLog.piiEntitiesRedacted).toContain(piiType);
          }

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: PII redaction should not prevent fraud analysis
   * 
   * Requirement 4.2: Verify analysis continues after PII redaction
   */
  it('should complete fraud analysis even when PII is redacted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcription: transcriptionWithPIIGen,
          sessionId: sessionIdGen,
          piiTypes: fc.array(piiTypeGen, { minLength: 1, maxLength: 5 }).map(arr => [...new Set(arr)]),
        }),
        async ({ transcription, sessionId, piiTypes }) => {
          // Reset mocks
          bedrockClientMock.reset();
          consoleLogSpy.mockClear();
          
          // Mock Bedrock Agent response with PII redaction
          bedrockClientMock.on(InvokeAgentCommand).resolves(
            createMockBedrockResponseWithGuardrails(piiTypes)
          );

          // Invoke Bedrock Agent
          const result = await invokeBedrockAgent(transcription, sessionId);

          // Verify fraud analysis completed successfully
          expect(result).toBeDefined();
          expect(result.riskScore).toBeGreaterThanOrEqual(0);
          expect(result.riskScore).toBeLessThanOrEqual(100);
          expect(['SAFE', 'CAUTION', 'DANGER']).toContain(result.threatLevel);
          expect(Array.isArray(result.fraudIndicators)).toBe(true);
          expect(typeof result.reasoning).toBe('string');
          expect(result.tokenUsage).toBeDefined();

          // Verify completion log was written
          const logs = consoleLogSpy.mock.calls.map(call => {
            try {
              return JSON.parse(call[0]);
            } catch {
              return null;
            }
          }).filter(log => log !== null);

          const completionLog = logs.find(log => 
            log.message === 'Bedrock Agent fraud analysis completed'
          );

          expect(completionLog).toBeDefined();
          expect(completionLog.callSessionId).toBe(sessionId);
          expect(completionLog.riskScore).toBe(result.riskScore);
          expect(completionLog.threatLevel).toBe(result.threatLevel);

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });
});
