/**
 * Cost monitoring module for tracking Bedrock token usage and Free Tier compliance
 * 
 * Requirements 4.8, 9.7: Track token usage and log warnings when approaching $200 credit limit
 */

/**
 * Structured log entry interface
 */
interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  component: string;
  message: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cumulativeInputTokens?: number;
  cumulativeOutputTokens?: number;
  cumulativeTotalTokens?: number;
  estimatedCost?: number;
  cumulativeCost?: number;
  creditLimit?: number;
  percentageUsed?: number;
  callSessionId?: string;
}

/**
 * Write structured JSON log to CloudWatch
 */
function log(entry: Omit<LogEntry, 'timestamp' | 'component'>): void {
  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    component: 'CostMonitor',
    ...entry,
  };
  console.log(JSON.stringify(logEntry));
}

/**
 * Claude 3.5 Sonnet pricing (as of 2024)
 * Source: https://aws.amazon.com/bedrock/pricing/
 */
const PRICING = {
  INPUT_TOKEN_COST_PER_MILLION: 3.0, // $3 per 1M input tokens
  OUTPUT_TOKEN_COST_PER_MILLION: 15.0, // $15 per 1M output tokens
};

/**
 * Competition credit limits and thresholds
 */
const CREDIT_LIMIT = 200; // $200 competition credits
const WARNING_THRESHOLD = CREDIT_LIMIT * 0.8; // 80% = $160
const ERROR_THRESHOLD = CREDIT_LIMIT * 0.95; // 95% = $190

/**
 * In-memory cumulative token usage tracking
 * Note: In production, this should be persisted to DynamoDB or similar
 * For MVP, we use Lambda memory (resets on cold start, but sufficient for demo)
 */
let cumulativeInputTokens = 0;
let cumulativeOutputTokens = 0;

/**
 * Calculate estimated cost based on token usage
 * 
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Estimated cost in USD
 */
export function calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * PRICING.INPUT_TOKEN_COST_PER_MILLION;
  const outputCost = (outputTokens / 1_000_000) * PRICING.OUTPUT_TOKEN_COST_PER_MILLION;
  return inputCost + outputCost;
}

/**
 * Get cumulative token usage
 * 
 * @returns Object containing cumulative input, output, and total tokens
 */
export function getCumulativeUsage(): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
} {
  const totalTokens = cumulativeInputTokens + cumulativeOutputTokens;
  const estimatedCost = calculateCost(cumulativeInputTokens, cumulativeOutputTokens);
  
  return {
    inputTokens: cumulativeInputTokens,
    outputTokens: cumulativeOutputTokens,
    totalTokens,
    estimatedCost,
  };
}

/**
 * Reset cumulative token usage (for testing purposes)
 */
export function resetCumulativeUsage(): void {
  cumulativeInputTokens = 0;
  cumulativeOutputTokens = 0;
  
  log({
    level: 'INFO',
    message: 'Cumulative token usage reset',
  });
}

/**
 * Track token usage for a Bedrock API call and check thresholds
 * 
 * Requirements 4.8: Track Bedrock input and output tokens for each API call
 * Requirements 9.7: Log WARNING at 80% and ERROR at 95% of $200 credit limit
 * 
 * @param inputTokens - Number of input tokens used in this call
 * @param outputTokens - Number of output tokens used in this call
 * @param callSessionId - Optional call session ID for correlation
 */
export function trackTokenUsage(
  inputTokens: number,
  outputTokens: number,
  callSessionId?: string
): void {
  // Accumulate tokens
  cumulativeInputTokens += inputTokens;
  cumulativeOutputTokens += outputTokens;
  
  const totalTokens = inputTokens + outputTokens;
  const cumulativeTotalTokens = cumulativeInputTokens + cumulativeOutputTokens;
  
  // Calculate costs
  const callCost = calculateCost(inputTokens, outputTokens);
  const cumulativeCost = calculateCost(cumulativeInputTokens, cumulativeOutputTokens);
  const percentageUsed = (cumulativeCost / CREDIT_LIMIT) * 100;
  
  // Log token usage for this call
  log({
    level: 'INFO',
    message: 'Token usage tracked for Bedrock API call',
    callSessionId,
    inputTokens,
    outputTokens,
    totalTokens,
    cumulativeInputTokens,
    cumulativeOutputTokens,
    cumulativeTotalTokens,
    estimatedCost: callCost,
    cumulativeCost,
    creditLimit: CREDIT_LIMIT,
    percentageUsed,
  });
  
  // Requirements 9.7: Check thresholds and log warnings/errors
  if (cumulativeCost >= ERROR_THRESHOLD) {
    // 95% threshold - ERROR level
    log({
      level: 'ERROR',
      message: 'CRITICAL: Token usage has reached 95% of credit limit',
      callSessionId,
      cumulativeInputTokens,
      cumulativeOutputTokens,
      cumulativeTotalTokens,
      cumulativeCost,
      creditLimit: CREDIT_LIMIT,
      percentageUsed,
    });
  } else if (cumulativeCost >= WARNING_THRESHOLD) {
    // 80% threshold - WARNING level
    log({
      level: 'WARN',
      message: 'WARNING: Token usage has reached 80% of credit limit',
      callSessionId,
      cumulativeInputTokens,
      cumulativeOutputTokens,
      cumulativeTotalTokens,
      cumulativeCost,
      creditLimit: CREDIT_LIMIT,
      percentageUsed,
    });
  }
}
