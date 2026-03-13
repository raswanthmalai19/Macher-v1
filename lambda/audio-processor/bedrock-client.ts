import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { captureAWSv3Client } from 'aws-xray-sdk-core';
import { bedrockCircuitBreaker } from './circuit-breaker';
import { trackTokenUsage } from './cost-monitor';

/**
 * Fraud analysis result from Bedrock Agent
 */
export interface FraudAnalysisResult {
  riskScore: number; // 0-100
  threatLevel: 'SAFE' | 'CAUTION' | 'DANGER';
  fraudIndicators: Array<{
    type: 'URGENCY' | 'PAYMENT_REQUEST' | 'IMPERSONATION' | 'THREAT' | 'PERSONAL_INFO_REQUEST';
    description: string;
    confidence: number; // 0.0 to 1.0
  }>;
  reasoning: string;
  knowledgeBaseReferences: string[];
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Structured log entry interface
 */
interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  component: string;
  message: string;
  callSessionId?: string;
  duration?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  riskScore?: number;
  threatLevel?: string;
  providedThreatLevel?: string;
  expectedThreatLevel?: string;
  fraudIndicatorCount?: number;
  guardrailAction?: string;
  piiEntitiesRedacted?: string[];
  piiEntityCount?: number;
  indicatorIndex?: number;
  hasType?: boolean;
  hasDescription?: boolean;
  hasConfidence?: boolean;
  retryAttempt?: number;
  maxRetries?: number;
  delayMs?: number;
  circuitState?: string;
  failureCount?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Write structured JSON log to CloudWatch
 */
function log(entry: Omit<LogEntry, 'timestamp' | 'component'>): void {
  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    component: 'BedrockClient',
    ...entry,
  };
  console.log(JSON.stringify(logEntry));
}

// Initialize Bedrock Agent Runtime client with X-Ray tracing
// Requirements 4.1, 11.4: Initialize BedrockAgentRuntimeClient with us-east-1 region
const bedrockClient = captureAWSv3Client(
  new BedrockAgentRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1',
  })
);

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper with exponential backoff
 * Requirements 8.2, 8.4: Retry up to 2 times with exponential backoff (1s, 2s)
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  baseDelay: number = 1000,
  sessionId: string
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff: 1s, 2s
        
        log({
          level: 'WARN',
          message: `Bedrock API call failed, retrying in ${delay}ms`,
          callSessionId: sessionId,
          error: {
            name: lastError.name,
            message: lastError.message,
          },
          retryAttempt: attempt + 1,
          maxRetries,
          delayMs: delay,
        });
        
        await sleep(delay);
      }
    }
  }
  
  // All retries exhausted
  throw lastError;
}

/**
 * Create default CAUTION response for fallback
 * Requirements 8.2: Return default CAUTION response on Bedrock failure
 */
function createDefaultCautionResponse(sessionId: string): FraudAnalysisResult {
  log({
    level: 'WARN',
    message: 'Returning default CAUTION response due to Bedrock failure',
    callSessionId: sessionId,
  });
  
  return {
    riskScore: 50, // Middle of CAUTION range
    threatLevel: 'CAUTION',
    fraudIndicators: [
      {
        type: 'PERSONAL_INFO_REQUEST',
        description: 'Unable to analyze call - exercise caution',
        confidence: 0.5,
      },
    ],
    reasoning: 'Analysis service temporarily unavailable. Please exercise caution during this call.',
    knowledgeBaseReferences: [],
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
    },
  };
}

/**
 * Invoke Bedrock Agent for fraud analysis
 * 
 * Requirements 4.1, 11.4: Send transcription to Bedrock Agent for fraud analysis
 * Requirements 4.2: Guardrails redact PII before analysis (configured in Bedrock Agent)
 * Requirements 4.8: Track token usage for cost monitoring
 * Requirements 8.2: Return default CAUTION response on failure
 * Requirements 8.4: Retry with exponential backoff
 * Requirements 8.6: Circuit breaker pattern
 * 
 * @param transcription - Accumulated transcription text (will be PII-redacted by Guardrails)
 * @param sessionId - Call session ID for tracking
 * @returns Fraud analysis result with risk score, threat level, and indicators
 * @throws Error if Bedrock Agent invocation fails after retries and circuit breaker is open
 */
export async function invokeBedrockAgent(
  transcription: string,
  sessionId: string
): Promise<FraudAnalysisResult> {
  // Requirements 8.6: Check circuit breaker before attempting call
  if (!bedrockCircuitBreaker.canExecute()) {
    log({
      level: 'ERROR',
      message: 'Circuit breaker is OPEN, returning default CAUTION response',
      callSessionId: sessionId,
      circuitState: bedrockCircuitBreaker.getState(),
      failureCount: bedrockCircuitBreaker.getFailureCount(),
    });
    
    return createDefaultCautionResponse(sessionId);
  }

  const startTime = Date.now();

  // Read environment variables at runtime (not at module load time)
  const BEDROCK_AGENT_ID = process.env.BEDROCK_AGENT_ID;
  const BEDROCK_AGENT_ALIAS_ID = process.env.BEDROCK_AGENT_ALIAS_ID;

  // Validate environment variables
  if (!BEDROCK_AGENT_ID || !BEDROCK_AGENT_ALIAS_ID) {
    throw new Error('BEDROCK_AGENT_ID and BEDROCK_AGENT_ALIAS_ID environment variables must be set');
  }

  log({
    level: 'INFO',
    message: 'Invoking Bedrock Agent for fraud analysis',
    callSessionId: sessionId,
  });

  try {
    // Requirements 8.2, 8.4: Wrap Bedrock call with retry logic
    const result = await retryWithBackoff(
      async () => {
        // Requirements 4.1, 11.4: Create InvokeAgentCommand with agentId, agentAliasId, sessionId, inputText
        // Enable trace to capture Guardrails and Knowledge Base activity
        const command = new InvokeAgentCommand({
          agentId: BEDROCK_AGENT_ID,
          agentAliasId: BEDROCK_AGENT_ALIAS_ID,
          sessionId: sessionId,
          inputText: transcription,
          enableTrace: true, // Capture Guardrails and Knowledge Base activity
        });

        // Send command to Bedrock Agent
        const response = await bedrockClient.send(command);

    // Requirements 4.1: Handle the streaming response from Bedrock Agent (async iterable)
    // The response contains an async iterable of events
    let completionText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    // Process the streaming response
    if (response.completion) {
      for await (const event of response.completion) {
        // Handle chunk events (completion text)
        if (event.chunk && event.chunk.bytes) {
          const chunkBytes = event.chunk.bytes;
          const chunkText = new TextDecoder().decode(chunkBytes);
          completionText += chunkText;
        }

        // Requirements 4.2: Capture Guardrails trace for PII redaction verification
        // Requirements 11.4: Capture Knowledge Base trace for RAG verification
        if (event.trace?.trace) {
          const trace = event.trace.trace;
          
          // Check for guardrail trace to verify PII redaction
          // The Trace type is a union, so we need to check if it has guardrailTrace member
          if ('guardrailTrace' in trace && trace.guardrailTrace) {
            const guardrailTrace = trace.guardrailTrace;
            
            // Log guardrail action (e.g., INTERVENED if PII was redacted)
            if (guardrailTrace.action) {
              log({
                level: 'INFO',
                message: 'Guardrail action detected',
                callSessionId: sessionId,
                guardrailAction: guardrailTrace.action,
              });
            }
            
            // Extract and log PII entities that were redacted
            if (guardrailTrace.inputAssessments) {
              const piiEntities: string[] = [];
              
              // Iterate through all input assessments
              for (const assessment of guardrailTrace.inputAssessments) {
                // Check for sensitive information filters (PII detection)
                if (assessment.sensitiveInformationPolicy?.piiEntities) {
                  for (const entity of assessment.sensitiveInformationPolicy.piiEntities) {
                    if (entity.type && entity.action === 'ANONYMIZED') {
                      piiEntities.push(entity.type);
                    }
                  }
                }
              }
              
              // Log redacted PII entities for monitoring and verification
              if (piiEntities.length > 0) {
                log({
                  level: 'INFO',
                  message: 'PII entities redacted by Guardrails',
                  callSessionId: sessionId,
                  piiEntitiesRedacted: piiEntities,
                  piiEntityCount: piiEntities.length,
                });
              } else {
                log({
                  level: 'INFO',
                  message: 'No PII detected in transcription',
                  callSessionId: sessionId,
                });
              }
            }
          }
          
          // Log Knowledge Base trace for RAG verification
          // OrchestrationTrace indicates the agent is performing orchestration (including KB lookups)
          if ('orchestrationTrace' in trace && trace.orchestrationTrace) {
            log({
              level: 'INFO',
              message: 'Orchestration trace detected (may include Knowledge Base lookup)',
              callSessionId: sessionId,
            });
          }
        }

        // Requirements 4.8: Capture token usage for cost monitoring
        // Note: Token usage is typically in the final event or metadata
        // The exact structure depends on the Bedrock Agent response format
      }
    }

    // Parse the completion text as JSON
    // Expected format: { riskScore, threatLevel, fraudIndicators, reasoning, knowledgeBaseReferences }
    let analysisResult: any;
    try {
      analysisResult = JSON.parse(completionText);
    } catch (parseError) {
      log({
        level: 'ERROR',
        message: 'Failed to parse Bedrock Agent response as JSON',
        callSessionId: sessionId,
        error: {
          name: (parseError as Error).name,
          message: (parseError as Error).message,
        },
      });
      
      // Return default CAUTION response if parsing fails
      throw new Error(`Failed to parse Bedrock Agent response: ${(parseError as Error).message}`);
    }

    // Requirements 4.4, 4.5, 4.7, 4.8: Validate and construct fraud analysis result
    // Validate riskScore is 0-100
    let riskScore = analysisResult.riskScore ?? 50; // Default to CAUTION range
    if (typeof riskScore !== 'number' || riskScore < 0 || riskScore > 100) {
      log({
        level: 'WARN',
        message: 'Invalid riskScore in Bedrock response, using default value',
        callSessionId: sessionId,
        riskScore: analysisResult.riskScore,
      });
      riskScore = 50; // Default to CAUTION
    }

    // Determine expected threat level based on risk score
    // Requirements 4.5: SAFE (0-33), CAUTION (34-66), DANGER (67-100)
    let expectedThreatLevel: 'SAFE' | 'CAUTION' | 'DANGER';
    if (riskScore <= 33) {
      expectedThreatLevel = 'SAFE';
    } else if (riskScore <= 66) {
      expectedThreatLevel = 'CAUTION';
    } else {
      expectedThreatLevel = 'DANGER';
    }

    // Validate threatLevel matches riskScore range
    let threatLevel = analysisResult.threatLevel;
    if (!threatLevel || !['SAFE', 'CAUTION', 'DANGER'].includes(threatLevel)) {
      log({
        level: 'WARN',
        message: 'Invalid or missing threatLevel in Bedrock response, using calculated value',
        callSessionId: sessionId,
        threatLevel: analysisResult.threatLevel,
        riskScore,
      });
      threatLevel = expectedThreatLevel;
    } else if (threatLevel !== expectedThreatLevel) {
      log({
        level: 'WARN',
        message: 'threatLevel does not match riskScore range, correcting to match',
        callSessionId: sessionId,
        providedThreatLevel: threatLevel,
        expectedThreatLevel,
        riskScore,
      });
      threatLevel = expectedThreatLevel;
    }

    // Requirements 4.7: Validate fraudIndicators array structure
    let fraudIndicators = analysisResult.fraudIndicators || [];
    if (!Array.isArray(fraudIndicators)) {
      log({
        level: 'WARN',
        message: 'fraudIndicators is not an array in Bedrock response, using empty array',
        callSessionId: sessionId,
      });
      fraudIndicators = [];
    } else {
      // Validate each fraud indicator has required fields
      fraudIndicators = fraudIndicators.filter((indicator: any, index: number) => {
        const hasType = indicator.type && typeof indicator.type === 'string';
        const hasDescription = indicator.description && typeof indicator.description === 'string';
        const hasConfidence = typeof indicator.confidence === 'number' && 
                             indicator.confidence >= 0 && 
                             indicator.confidence <= 1;

        if (!hasType || !hasDescription || !hasConfidence) {
          log({
            level: 'WARN',
            message: 'Invalid fraud indicator structure, excluding from results',
            callSessionId: sessionId,
            indicatorIndex: index,
            hasType,
            hasDescription,
            hasConfidence,
          });
          return false;
        }
        return true;
      });
    }

    const result: FraudAnalysisResult = {
      riskScore,
      threatLevel,
      fraudIndicators,
      reasoning: analysisResult.reasoning || 'Analysis completed',
      knowledgeBaseReferences: Array.isArray(analysisResult.knowledgeBaseReferences) 
        ? analysisResult.knowledgeBaseReferences 
        : [],
      tokenUsage: {
        // Requirements 4.8: Extract token usage from response metadata
        // Note: Actual token usage should be extracted from Bedrock Agent response metadata
        // For now, we estimate based on text length (rough approximation: 1 token ≈ 4 characters)
        inputTokens: inputTokens || Math.ceil(transcription.length / 4),
        outputTokens: outputTokens || Math.ceil(completionText.length / 4),
      },
    };

    const duration = Date.now() - startTime;
    const totalTokens = result.tokenUsage.inputTokens + result.tokenUsage.outputTokens;

    log({
      level: 'INFO',
      message: 'Bedrock Agent fraud analysis completed',
      callSessionId: sessionId,
      duration,
      inputTokens: result.tokenUsage.inputTokens,
      outputTokens: result.tokenUsage.outputTokens,
      totalTokens,
      riskScore: result.riskScore,
      threatLevel: result.threatLevel,
      fraudIndicatorCount: result.fraudIndicators.length,
    });

    // Requirements 4.8, 9.7: Track token usage and check cost thresholds
    trackTokenUsage(result.tokenUsage.inputTokens, result.tokenUsage.outputTokens, sessionId);

    return result;
      },
      2, // maxRetries
      1000, // baseDelay (1s)
      sessionId
    );

    // Requirements 8.6: Record successful execution in circuit breaker
    bedrockCircuitBreaker.recordSuccess();

    return result;

  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Requirements 8.6: Record failure in circuit breaker
    bedrockCircuitBreaker.recordFailure();
    
    log({
      level: 'ERROR',
      message: 'Bedrock Agent invocation failed after retries',
      callSessionId: sessionId,
      duration,
      circuitState: bedrockCircuitBreaker.getState(),
      failureCount: bedrockCircuitBreaker.getFailureCount(),
      error: {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack,
      },
    });

    // Requirements 8.2: Return default CAUTION response on failure
    return createDefaultCautionResponse(sessionId);
  }
}
