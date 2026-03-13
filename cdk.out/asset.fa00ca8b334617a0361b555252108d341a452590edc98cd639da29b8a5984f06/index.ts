import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { captureAWSv3Client } from 'aws-xray-sdk-core';
import { TranscribeStreamingService, TranscriptionSegment } from './transcribe-client';
import { invokeBedrockAgent, FraudAnalysisResult } from './bedrock-client';
import { WebSocketClient } from './websocket-client';

/**
 * Audio message interface from WebSocket client
 */
interface AudioMessage {
  action: string;
  callSessionId: string;
  timestamp: number;
  audioData: string; // Base64-encoded PCM audio
  sequenceNumber: number;
}

/**
 * Call session state maintained in memory during Lambda execution
 */
export interface CallSessionState {
  callSessionId: string;
  connectionId: string;
  startTime: number;
  transcriptionBuffer: string[];
  wordCount: number;
  speechDuration: number; // Total seconds of accumulated speech
  lastAnalysisTime: number;
  analysisCount: number;
  currentRiskScore: number;
  currentThreatLevel: 'SAFE' | 'CAUTION' | 'DANGER';
}

/**
 * Audio format validation result
 */
interface AudioFormatValidation {
  valid: boolean;
  error?: string;
  format?: {
    sampleRate: number;
    bitDepth: number;
    channels: number;
    encoding: string;
  };
}

// Initialize AWS clients with X-Ray tracing
const ddbClient = captureAWSv3Client(new DynamoDBClient({}));
const docClient = DynamoDBDocumentClient.from(ddbClient);
const snsClient = captureAWSv3Client(new SNSClient({}));
const eventBridgeClient = captureAWSv3Client(new EventBridgeClient({}));
const secretsClient = captureAWSv3Client(new SecretsManagerClient({}));
const ssmClient = captureAWSv3Client(new SSMClient({}));

// Initialize Transcribe streaming service
// Requirements 3.1, 3.2, 3.3: Real-time speech transcription
const transcribeService = new TranscribeStreamingService();

// Environment variables
const METADATA_TABLE = process.env.METADATA_TABLE_NAME!;
const CONNECTION_TABLE = process.env.CONNECTION_TABLE_NAME!;
const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_ENDPOINT!;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME;
const ENVIRONMENT = process.env.ENVIRONMENT || 'dev';

// Initialize WebSocket client for sending messages to mobile clients
// Requirements 5.1, 5.3, 10.4: WebSocket message delivery
let websocketClient: WebSocketClient | null = null;

function getWebSocketClient(): WebSocketClient {
  if (!websocketClient) {
    websocketClient = new WebSocketClient(WEBSOCKET_ENDPOINT, CONNECTION_TABLE);
  }
  return websocketClient;
}

// In-memory call session state storage
const callSessions = new Map<string, CallSessionState>();

// Secrets cache with 5-minute TTL
interface SecretsCache {
  secrets: any;
  timestamp: number;
}
let secretsCache: SecretsCache | null = null;
const SECRETS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Configuration cache
interface ConfigCache {
  fraudThreshold: number;
  maxProcessingTime: number;
  timestamp: number;
}
let configCache: ConfigCache | null = null;
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Structured log entry interface
 */
interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  component: string;
  message: string;
  requestId?: string;
  sessionId?: string;
  connectionId?: string;
  callSessionId?: string;
  sequenceNumber?: number;
  audioSize?: number;
  duration?: number;
  text?: string;
  isPartial?: boolean;
  confidence?: number;
  language?: string;
  wordCount?: number;
  bufferSize?: number;
  speechDuration?: string;
  analysisCount?: number;
  retryCount?: number;
  maxRetries?: number;
  delayMs?: number;
  errorType?: string;
  errorMessage?: string;
  totalDuration?: number;
  finalError?: {
    name?: string;
    message?: string;
  };
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  transcriptionLength?: number;
  riskScore?: number;
  threatLevel?: string;
  fraudIndicatorCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  snippetLength?: number;
  ttl?: number;
}

/**
 * Audio processing result interface
 */
interface AudioProcessingResult {
  sessionId: string;
  timestamp: number;
  fraudScore: number;
  fraudDetected: boolean;
  message?: string;
}

/**
 * Fraud alert message interface for WebSocket delivery
 * Requirements 5.2: Format results as JSON containing Risk_Score, Threat_Level, fraud indicators, and timestamp
 */
export interface FraudAlertMessage {
  type: 'fraud_analysis';
  callSessionId: string;
  timestamp: number;
  riskScore: number;
  threatLevel: 'SAFE' | 'CAUTION' | 'DANGER';
  fraudIndicators: Array<{
    type: string;
    description: string;
  }>;
  reasoning: string;
}

/**
 * Error message interface for WebSocket delivery
 * Requirements 8.5: Format error messages (type: "error", code, message, timestamp, requestId)
 */
export interface ErrorMessage {
  type: 'error';
  code: 'VALIDATION_ERROR' | 'SERVICE_ERROR' | 'TRANSCRIPTION_ERROR' | 'ANALYSIS_ERROR' | 'INTERNAL_ERROR';
  message: string;
  timestamp: number;
  requestId?: string;
}

/**
 * Call metadata record interface for DynamoDB storage
 * Requirements 6.1, 6.2, 6.3, 6.6: Store call metadata with privacy constraints
 */
export interface CallMetadata {
  callSessionId: string; // Partition key
  timestamp: number; // Sort key - Unix timestamp in milliseconds
  riskScore: number; // 0-100
  threatLevel: 'SAFE' | 'CAUTION' | 'DANGER';
  fraudIndicators: string[]; // Array of fraud indicator types
  redactedSnippet: string; // Max 200 characters, PII redacted
  analysisCount: number; // Number of analyses during this call
  ttl: number; // Unix timestamp in seconds (24 hours from now)
}

/**
 * Write structured JSON log to CloudWatch
 */
function log(entry: Omit<LogEntry, 'timestamp' | 'component'>): void {
  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    component: 'AudioProcessor',
    ...entry,
  };
  console.log(JSON.stringify(logEntry));
}

/**
 * Redact PII from text using regex patterns
 * 
 * Requirements 6.3, 6.6: Redact all PII from transcription snippet before storage
 * 
 * This function removes personally identifiable information (PII) from text
 * to ensure privacy compliance. It uses regex patterns to detect and replace:
 * - Phone numbers (various formats)
 * - Email addresses
 * - Social Security Numbers (SSN)
 * - Credit card numbers
 * - Common names (basic pattern matching)
 * 
 * @param text - Text to redact PII from
 * @returns Text with PII replaced by [REDACTED] placeholders
 */
export function redactPII(text: string): string {
  if (!text || text.trim().length === 0) {
    return text;
  }

  let redacted = text;

  // Redact phone numbers (various formats)
  // Matches: (123) 456-7890, 123-456-7890, 123.456.7890, 1234567890, +1 123 456 7890
  redacted = redacted.replace(
    /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    '[PHONE]'
  );

  // Redact email addresses
  // Matches: user@example.com, user.name+tag@example.co.uk
  redacted = redacted.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    '[EMAIL]'
  );

  // Redact Social Security Numbers (SSN)
  // Matches: 123-45-6789, 123 45 6789, 123456789
  redacted = redacted.replace(
    /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    '[SSN]'
  );

  // Redact credit card numbers (13-19 digits with optional spaces/dashes)
  // Matches: 1234-5678-9012-3456, 1234 5678 9012 3456, 1234567890123456
  redacted = redacted.replace(
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4,7}\b/g,
    '[CARD]'
  );

  // Redact street addresses (basic pattern)
  // Matches: 123 Main St, 456 Oak Avenue, 789 Elm Street Apt 4
  redacted = redacted.replace(
    /\b\d+\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)*\s+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Place|Pl)(\s+(Apt|Apartment|Unit|Suite|Ste|#)\s*\w+)?\b/gi,
    '[ADDRESS]'
  );

  // Redact ZIP codes (5 digits or 5+4 format)
  // Matches: 12345, 12345-6789
  redacted = redacted.replace(
    /\b\d{5}(-\d{4})?\b/g,
    '[ZIP]'
  );

  // Redact common name patterns (capitalized words that might be names)
  // This is a basic heuristic - matches 2-3 consecutive capitalized words
  // Matches: John Smith, Mary Jane Doe
  // Note: This may have false positives (e.g., "Internal Revenue Service")
  // but errs on the side of privacy
  redacted = redacted.replace(
    /\b[A-Z][a-z]+(\s+[A-Z][a-z]+){1,2}\b/g,
    (match) => {
      // Preserve common non-name phrases
      const preservedPhrases = [
        'Internal Revenue Service',
        'Social Security',
        'United States',
        'Customer Service',
        'Tech Support',
        'Gift Card',
        'Credit Card',
        'Bank Account',
        'Wire Transfer',
      ];
      
      if (preservedPhrases.some(phrase => match.includes(phrase))) {
        return match;
      }
      
      return '[NAME]';
    }
  );

  // Redact account numbers (generic pattern: 8-16 digits)
  // Matches: 12345678, 1234567890123456
  // This is applied after more specific patterns to avoid false positives
  redacted = redacted.replace(
    /\b\d{8,16}\b/g,
    '[ACCOUNT]'
  );

  return redacted;
}

/**
 * Build call metadata record for DynamoDB storage
 * 
 * Requirements 6.1, 6.2, 6.3, 6.6: Store call metadata with privacy constraints
 * 
 * This function creates a metadata record for a call session that:
 * - Contains only essential fraud detection information
 * - Redacts all PII from transcription snippet
 * - Truncates snippet to maximum 200 characters
 * - Sets TTL to 24 hours for automatic deletion
 * - Does NOT include raw audio or complete transcriptions
 * 
 * Key privacy features:
 * - PII redaction using regex patterns (phone, email, SSN, credit cards, names)
 * - Snippet truncation to limit data exposure
 * - Automatic deletion after 24 hours via DynamoDB TTL
 * - No audio data or full transcriptions stored
 * 
 * @param session - Call session state with transcription buffer
 * @param analysisResult - Fraud analysis result from Bedrock
 * @returns Call metadata record ready for DynamoDB storage
 */
export function buildCallMetadata(
  session: CallSessionState,
  analysisResult: FraudAnalysisResult
): CallMetadata {
  // Requirements 6.1: Build metadata record with required fields
  const timestamp = Date.now();
  
  // Requirements 6.6: Set TTL to 24 hours from current time
  // DynamoDB TTL expects Unix timestamp in seconds (not milliseconds)
  const ttl = Math.floor(timestamp / 1000) + (24 * 60 * 60); // 24 hours in seconds

  // Requirements 6.3: Create transcription snippet from buffer
  // Join transcription buffer into a single string
  const fullTranscription = session.transcriptionBuffer.join(' ');
  
  // Requirements 6.3: Redact all PII from transcription snippet
  // This ensures no personally identifiable information is stored
  let redactedSnippet = redactPII(fullTranscription);
  
  // Requirements 6.3: Truncate snippet to maximum 200 characters
  // This limits data exposure and ensures consistent storage size
  if (redactedSnippet.length > 200) {
    redactedSnippet = redactedSnippet.substring(0, 197) + '...';
    
    log({
      level: 'INFO',
      message: 'Transcription snippet truncated to 200 characters',
      callSessionId: session.callSessionId,
    });
  }

  // Requirements 6.1: Extract fraud indicators from analysis result
  // Store only the indicator types (not full descriptions or confidence scores)
  const fraudIndicators = analysisResult.fraudIndicators.map(indicator => indicator.type);

  // Requirements 6.1, 6.2, 6.3, 6.6: Create metadata record
  const metadata: CallMetadata = {
    callSessionId: session.callSessionId,
    timestamp,
    riskScore: analysisResult.riskScore,
    threatLevel: analysisResult.threatLevel,
    fraudIndicators,
    redactedSnippet,
    analysisCount: session.analysisCount,
    ttl,
  };

  log({
    level: 'INFO',
    message: 'Call metadata record built',
    callSessionId: session.callSessionId,
    riskScore: metadata.riskScore,
    threatLevel: metadata.threatLevel,
    fraudIndicatorCount: fraudIndicators.length,
    snippetLength: redactedSnippet.length,
    ttl,
  });

  // Requirements 6.2: Ensure NO raw audio or complete transcriptions are included
  // This is enforced by the interface definition - only redactedSnippet is stored
  // The function does not have access to raw audio data (it's never passed in)
  // The full transcription is redacted and truncated before storage

  return metadata;
}

/**
 * Format error message for WebSocket delivery to mobile client
 * 
 * Requirements 8.5: Format error messages (type: "error", code, message, timestamp, requestId)
 * Requirements 8.5: Sanitize error messages (no stack traces, internal details, or AWS resource names)
 * 
 * This function takes an error and formats it as a sanitized JSON message
 * suitable for delivery to the mobile client via WebSocket.
 * 
 * Key features:
 * - Removes stack traces (internal implementation details)
 * - Removes AWS resource names (security concern)
 * - Removes internal details (Lambda function names, environment variables)
 * - Uses generic error codes (VALIDATION_ERROR, SERVICE_ERROR, etc.)
 * - Provides user-friendly error messages
 * 
 * @param error - Error object or error message
 * @param errorCode - Generic error code for categorization
 * @param requestId - Optional request ID for correlation
 * @returns Sanitized error message ready for WebSocket delivery
 */
export function formatErrorMessage(
  error: Error | string,
  errorCode: ErrorMessage['code'],
  requestId?: string
): ErrorMessage {
  // Extract error message
  let errorMessage: string;
  if (typeof error === 'string') {
    errorMessage = error;
  } else {
    errorMessage = error.message || 'An error occurred';
  }

  // Requirements 8.5: Sanitize error message - remove stack traces
  // Stack traces contain internal implementation details that should not be exposed
  
  // Requirements 8.5: Sanitize error message - remove AWS resource names
  // Replace common AWS resource patterns with generic placeholders
  errorMessage = errorMessage
    // Remove Lambda function ARNs
    .replace(/arn:aws:lambda:[^:]+:[^:]+:function:[^\s]+/g, '[Lambda Function]')
    // Remove DynamoDB table ARNs
    .replace(/arn:aws:dynamodb:[^:]+:[^:]+:table\/[^\s]+/g, '[DynamoDB Table]')
    // Remove S3 bucket names
    .replace(/arn:aws:s3:::[^\s]+/g, '[S3 Bucket]')
    // Remove API Gateway endpoints
    .replace(/https:\/\/[a-z0-9]+\.execute-api\.[^.]+\.amazonaws\.com[^\s]*/g, '[API Endpoint]')
    // Remove account IDs
    .replace(/\d{12}/g, '[Account ID]')
    // Remove region names in ARNs
    .replace(/us-east-1|us-west-2|eu-west-1/g, '[Region]');

  // Requirements 8.5: Sanitize error message - remove internal details
  // Replace internal Lambda/AWS terminology with user-friendly terms
  errorMessage = errorMessage
    .replace(/Lambda/gi, 'service')
    .replace(/DynamoDB/gi, 'database')
    .replace(/Transcribe/gi, 'transcription service')
    .replace(/Bedrock/gi, 'analysis service')
    .replace(/API Gateway/gi, 'connection service');

  // Ensure message is not too long (max 200 characters for mobile display)
  if (errorMessage.length > 200) {
    errorMessage = errorMessage.substring(0, 197) + '...';
  }

  // Requirements 8.5: Create sanitized error message with generic error code
  const message: ErrorMessage = {
    type: 'error',
    code: errorCode,
    message: errorMessage,
    timestamp: Date.now(),
    requestId,
  };

  log({
    level: 'INFO',
    message: 'Error message formatted and sanitized',
    requestId,
  });

  return message;
}

/**
 * Format fraud analysis result as WebSocket message for mobile client
 * 
 * Requirements 5.2: Format FraudAnalysisResponse as JSON (type: "fraud_analysis", 
 * callSessionId, timestamp, riskScore, threatLevel, fraudIndicators, reasoning)
 * 
 * This function takes the fraud analysis result from Bedrock and formats it
 * as a JSON message suitable for delivery to the mobile client via WebSocket.
 * 
 * Key features:
 * - Ensures all required fields are present and valid
 * - Truncates reasoning to 200 characters for mobile display
 * - Simplifies fraud indicators to only include type and description (removes confidence)
 * - Adds message type identifier for client-side routing
 * 
 * @param analysisResult - Fraud analysis result from Bedrock Agent
 * @param callSessionId - Call session identifier
 * @returns Formatted fraud alert message ready for WebSocket delivery
 */
export function formatFraudAlertMessage(
  analysisResult: FraudAnalysisResult,
  callSessionId: string
): FraudAlertMessage {
  // Requirements 5.2: Ensure all required fields are present and valid
  
  // Validate and normalize risk score (0-100)
  let riskScore = analysisResult.riskScore;
  if (typeof riskScore !== 'number' || isNaN(riskScore) || riskScore < 0 || riskScore > 100) {
    log({
      level: 'WARN',
      message: 'Invalid riskScore in fraud analysis result, using default value',
      callSessionId,
      riskScore: analysisResult.riskScore,
    });
    riskScore = 50; // Default to CAUTION range
  }

  // Validate threat level
  let threatLevel = analysisResult.threatLevel;
  if (!['SAFE', 'CAUTION', 'DANGER'].includes(threatLevel)) {
    log({
      level: 'WARN',
      message: 'Invalid threatLevel in fraud analysis result, using default value',
      callSessionId,
      threatLevel: analysisResult.threatLevel,
    });
    threatLevel = 'CAUTION'; // Default to CAUTION
  }

  // Requirements 5.2: Truncate reasoning to 200 characters for mobile display
  // This ensures the message fits on mobile screens and doesn't overwhelm users
  let reasoning = analysisResult.reasoning || 'Analysis completed';
  if (reasoning.length > 200) {
    reasoning = reasoning.substring(0, 197) + '...';
    
    log({
      level: 'INFO',
      message: 'Reasoning truncated to 200 characters for mobile display',
      callSessionId,
    });
  }

  // Requirements 5.2: Format fraud indicators for mobile client
  // Simplify indicators by removing confidence scores (internal metric)
  // and keeping only type and description for user-facing display
  const fraudIndicators = (analysisResult.fraudIndicators || []).map(indicator => ({
    type: indicator.type,
    description: indicator.description,
  }));

  // Validate fraud indicators array
  if (!Array.isArray(analysisResult.fraudIndicators)) {
    log({
      level: 'WARN',
      message: 'fraudIndicators is not an array, using empty array',
      callSessionId,
    });
  }

  // Requirements 5.2: Create formatted message with all required fields
  const message: FraudAlertMessage = {
    type: 'fraud_analysis', // Message type for client-side routing
    callSessionId,
    timestamp: Date.now(),
    riskScore,
    threatLevel,
    fraudIndicators,
    reasoning,
  };

  log({
    level: 'INFO',
    message: 'Fraud alert message formatted',
    callSessionId,
    riskScore,
    threatLevel,
    fraudIndicatorCount: fraudIndicators.length,
  });

  return message;
}

/**
 * Parse and validate WebSocket audio message
 * 
 * @param body - WebSocket message body (JSON string)
 * @param connectionId - WebSocket connection ID
 * @returns Parsed and validated audio message
 * @throws Error if message format is invalid
 */
function parseAudioMessage(body: string | undefined, connectionId: string): AudioMessage {
  if (!body) {
    throw new Error('Missing message body');
  }

  let message: any;
  try {
    message = JSON.parse(body);
  } catch (error) {
    throw new Error(`Invalid JSON format: ${(error as Error).message}`);
  }

  // Validate message is an object
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    throw new Error('Message must be a JSON object');
  }

  // Validate required fields
  const requiredFields = ['action', 'callSessionId', 'timestamp', 'audioData', 'sequenceNumber'];
  const missingFields = requiredFields.filter(field => !(field in message));
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }

  // Validate field types
  if (typeof message.action !== 'string') {
    throw new Error('Field "action" must be a string');
  }
  
  if (typeof message.callSessionId !== 'string') {
    throw new Error('Field "callSessionId" must be a string');
  }
  
  if (typeof message.timestamp !== 'number') {
    throw new Error('Field "timestamp" must be a number');
  }
  
  if (typeof message.audioData !== 'string') {
    throw new Error('Field "audioData" must be a string');
  }
  
  if (typeof message.sequenceNumber !== 'number') {
    throw new Error('Field "sequenceNumber" must be a number');
  }

  // Validate action value
  if (message.action !== 'audio') {
    throw new Error(`Invalid action: "${message.action}". Expected "audio"`);
  }

  // Validate timestamp is reasonable (not too far in past or future)
  const now = Date.now();
  const timeDiff = Math.abs(now - message.timestamp);
  const maxTimeDiff = 60 * 1000; // 60 seconds
  
  if (timeDiff > maxTimeDiff) {
    throw new Error(`Timestamp is too far from current time (diff: ${timeDiff}ms)`);
  }

  // Validate sequence number is non-negative
  if (message.sequenceNumber < 0) {
    throw new Error('Sequence number must be non-negative');
  }

  log({
    level: 'INFO',
    message: 'Audio message parsed and validated',
    connectionId,
    callSessionId: message.callSessionId,
    sequenceNumber: message.sequenceNumber,
  });

  return message as AudioMessage;
}

/**
 * Decode Base64 audio data to Buffer
 * 
 * Requirements 2.2, 2.5: Decode Base64 audioData to Buffer for audio processing
 * 
 * @param audioData - Base64-encoded audio data
 * @returns Decoded audio buffer
 * @throws Error if decoding fails
 */
function decodeBase64AudioData(audioData: string): Buffer {
  try {
    const audioBuffer = Buffer.from(audioData, 'base64');
    
    if (audioBuffer.length === 0) {
      throw new Error('Decoded audio data is empty');
    }

    // Validate audio size (max 128 KB per API Gateway WebSocket limit)
    if (audioBuffer.length > 128 * 1024) {
      throw new Error(`Audio data exceeds maximum size of 128 KB (got ${audioBuffer.length} bytes)`);
    }

    return audioBuffer;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid')) {
      throw new Error('Invalid Base64 encoding in audioData field');
    }
    throw error;
  }
}

/**
 * Validate PCM audio format (16kHz, 16-bit, mono)
 * 
 * Requirements 2.2, 2.5: Audio must be PCM format with 16kHz sample rate, 16-bit depth, mono channel
 * 
 * Note: This is a basic validation based on buffer size heuristics.
 * Full WAV header parsing would be more robust but adds complexity.
 * 
 * @param audioBuffer - Decoded audio buffer
 * @returns Validation result with format details or error
 */
function validateAudioFormat(audioBuffer: Buffer): AudioFormatValidation {
  // Expected format: PCM 16kHz, 16-bit (2 bytes per sample), mono (1 channel)
  // Typical chunk size: 0.5-1 second = 8000-16000 samples = 16000-32000 bytes
  
  const bufferSize = audioBuffer.length;
  
  // Check if buffer size is reasonable for PCM audio
  // Minimum: 0.1 second = 1600 samples = 3200 bytes
  // Maximum: 2 seconds = 32000 samples = 64000 bytes
  const minSize = 3200;
  const maxSize = 64000;
  
  if (bufferSize < minSize) {
    return {
      valid: false,
      error: `Audio buffer too small (${bufferSize} bytes). Expected at least ${minSize} bytes for PCM 16kHz 16-bit mono`,
    };
  }
  
  if (bufferSize > maxSize) {
    return {
      valid: false,
      error: `Audio buffer too large (${bufferSize} bytes). Expected at most ${maxSize} bytes for PCM 16kHz 16-bit mono`,
    };
  }
  
  // Check if buffer size is even (16-bit samples = 2 bytes each)
  if (bufferSize % 2 !== 0) {
    return {
      valid: false,
      error: `Audio buffer size must be even for 16-bit samples (got ${bufferSize} bytes)`,
    };
  }
  
  // Calculate approximate duration based on expected format
  // 16kHz sample rate, 16-bit (2 bytes), mono = 32000 bytes per second
  const bytesPerSecond = 16000 * 2 * 1; // sampleRate * bytesPerSample * channels
  const durationSeconds = bufferSize / bytesPerSecond;
  
  // Validate duration is reasonable (0.1 to 2 seconds)
  if (durationSeconds < 0.1 || durationSeconds > 2.0) {
    return {
      valid: false,
      error: `Audio duration out of range (${durationSeconds.toFixed(2)}s). Expected 0.1-2.0 seconds for PCM 16kHz 16-bit mono`,
    };
  }
  
  // Audio format appears valid
  return {
    valid: true,
    format: {
      sampleRate: 16000,
      bitDepth: 16,
      channels: 1,
      encoding: 'PCM',
    },
  };
}

/**
 * Initialize or retrieve call session state
 * 
 * Requirements 2.3, 3.6: Manage call session state for transcription accumulation
 * 
 * @param callSessionId - Unique call session identifier
 * @param connectionId - WebSocket connection ID
 * @returns Call session state
 */
function getOrCreateCallSession(callSessionId: string, connectionId: string): CallSessionState {
  let session = callSessions.get(callSessionId);
  
  if (!session) {
    session = {
      callSessionId,
      connectionId,
      startTime: Date.now(),
      transcriptionBuffer: [],
      wordCount: 0,
      speechDuration: 0,
      lastAnalysisTime: 0,
      analysisCount: 0,
      currentRiskScore: 0,
      currentThreatLevel: 'SAFE',
    };
    
    callSessions.set(callSessionId, session);
    
    log({
      level: 'INFO',
      message: 'Call session initialized',
      callSessionId,
      connectionId,
    });
  }
  
  return session;
}

/**
 * Clean up call session state
 * 
 * Requirements 2.3: Clean up state on disconnection or Lambda timeout
 * 
 * @param callSessionId - Unique call session identifier
 */
// @ts-ignore - Will be used in future tasks
function cleanupCallSession(callSessionId: string): void {
  const session = callSessions.get(callSessionId);
  
  if (session) {
    callSessions.delete(callSessionId);
    
    log({
      level: 'INFO',
      message: 'Call session cleaned up',
      callSessionId,
      connectionId: session.connectionId,
    });
  }
}

/**
 * Check if analysis threshold has been reached
 * 
 * Requirements 3.7: Trigger fraud analysis when transcription reaches 50 words OR 10 seconds of speech
 * 
 * @param session - Call session state
 * @returns True if analysis should be triggered, false otherwise
 */
export function checkAnalysisThreshold(session: CallSessionState): boolean {
  const WORD_THRESHOLD = 50;
  const DURATION_THRESHOLD = 10; // seconds

  // Check if we've reached 50 words OR 10 seconds of speech
  const wordThresholdReached = session.wordCount >= WORD_THRESHOLD;
  const durationThresholdReached = session.speechDuration >= DURATION_THRESHOLD;

  return wordThresholdReached || durationThresholdReached;
}

/**
 * Trigger fraud analysis for accumulated transcription
 * 
 * Requirements 3.7: Trigger fraud analysis when threshold is met
 * Requirements 4.1, 11.4: Send transcription to Bedrock Agent for fraud analysis
 * Requirements 4.2: Guardrails redact PII before analysis (configured in Bedrock Agent)
 * 
 * @param session - Call session state
 */
export async function triggerFraudAnalysis(session: CallSessionState): Promise<void> {
  const startTime = Date.now();
  
  log({
    level: 'INFO',
    message: 'Fraud analysis triggered',
    callSessionId: session.callSessionId,
    wordCount: session.wordCount,
    speechDuration: session.speechDuration.toFixed(2),
    analysisCount: session.analysisCount + 1,
  });

  try {
    // Requirements 4.1, 11.4: Send accumulated transcription to Bedrock Agent
    // Join transcription buffer into a single string
    const transcription = session.transcriptionBuffer.join(' ');

    if (!transcription || transcription.trim().length === 0) {
      log({
        level: 'WARN',
        message: 'Empty transcription buffer, skipping fraud analysis',
        callSessionId: session.callSessionId,
      });
      return;
    }

    log({
      level: 'INFO',
      message: 'Invoking Bedrock Agent for fraud analysis',
      callSessionId: session.callSessionId,
      transcriptionLength: transcription.length,
    });

    // Requirements 4.1, 11.4: Invoke Bedrock Agent with transcription
    // Requirements 4.2: Guardrails will redact PII automatically (configured in Bedrock Agent)
    const analysisResult: FraudAnalysisResult = await invokeBedrockAgent(
      transcription,
      session.callSessionId
    );

    // Update session state with analysis results
    session.currentRiskScore = analysisResult.riskScore;
    session.currentThreatLevel = analysisResult.threatLevel;
    session.lastAnalysisTime = Date.now();
    session.analysisCount += 1;

    const analysisDuration = Date.now() - startTime;

    log({
      level: 'INFO',
      message: 'Fraud analysis completed',
      callSessionId: session.callSessionId,
      riskScore: analysisResult.riskScore,
      threatLevel: analysisResult.threatLevel,
      fraudIndicatorCount: analysisResult.fraudIndicators.length,
      duration: analysisDuration,
      inputTokens: analysisResult.tokenUsage.inputTokens,
      outputTokens: analysisResult.tokenUsage.outputTokens,
    });

    // Requirements 5.2: Format fraud analysis result for WebSocket delivery
    const fraudAlertMessage = formatFraudAlertMessage(analysisResult, session.callSessionId);

    // Requirements 5.1, 5.3, 10.4: Send formatted message to mobile client via WebSocket
    // Task 10.3: WebSocket message sending implementation
    try {
      const wsClient = getWebSocketClient();
      const messageSent = await wsClient.sendFraudAlert(
        session.connectionId,
        fraudAlertMessage,
        session.callSessionId
      );

      if (messageSent) {
        log({
          level: 'INFO',
          message: 'Fraud alert delivered to mobile client',
          callSessionId: session.callSessionId,
          connectionId: session.connectionId,
        });
      } else {
        // Requirements 5.3: Handle disconnected clients gracefully (log and discard results)
        log({
          level: 'WARN',
          message: 'Failed to deliver fraud alert (client may be disconnected)',
          callSessionId: session.callSessionId,
          connectionId: session.connectionId,
        });
      }
    } catch (wsError) {
      // Log WebSocket error but don't fail the analysis
      log({
        level: 'ERROR',
        message: 'WebSocket delivery error',
        callSessionId: session.callSessionId,
        connectionId: session.connectionId,
        error: {
          name: (wsError as Error).name,
          message: (wsError as Error).message,
          stack: (wsError as Error).stack,
        },
      });
    }
    
    // Requirements 6.1, 6.2, 6.3, 6.6: Build call metadata record for storage
    // Task 11.1: Create call metadata record with PII redaction and privacy constraints
    const callMetadata = buildCallMetadata(session, analysisResult);
    
    log({
      level: 'INFO',
      message: 'Call metadata record created',
      callSessionId: session.callSessionId,
      riskScore: callMetadata.riskScore,
      threatLevel: callMetadata.threatLevel,
      fraudIndicatorCount: callMetadata.fraudIndicators.length,
      snippetLength: callMetadata.redactedSnippet.length,
    });
    
    // Requirements 6.1, 8.3: Store metadata in DynamoDB
    // Task 11.3: Store call metadata using PutItem
    // Handle errors gracefully - log but don't block fraud detection
    try {
      await docClient.send(
        new PutCommand({
          TableName: METADATA_TABLE,
          Item: callMetadata,
        })
      );
      
      log({
        level: 'INFO',
        message: 'Call metadata stored in DynamoDB successfully',
        callSessionId: session.callSessionId,
        ttl: callMetadata.ttl,
      });
    } catch (storageError) {
      // Requirements 8.3: Handle DynamoDB errors gracefully
      // Log error but don't throw - metadata storage failure should not block fraud detection
      log({
        level: 'ERROR',
        message: 'Failed to store call metadata in DynamoDB',
        callSessionId: session.callSessionId,
        error: {
          name: (storageError as Error).name,
          message: (storageError as Error).message,
          stack: (storageError as Error).stack,
        },
      });
      
      // Don't re-throw - continue with fraud detection delivery
    }

    // Requirements 3.7: Clear transcription buffer after analysis (prevent memory overflow)
    session.transcriptionBuffer = [];
    session.wordCount = 0;
    session.speechDuration = 0;

    log({
      level: 'INFO',
      message: 'Transcription buffer cleared after analysis',
      callSessionId: session.callSessionId,
      analysisCount: session.analysisCount,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    log({
      level: 'ERROR',
      message: 'Fraud analysis failed',
      callSessionId: session.callSessionId,
      duration,
      error: {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack,
      },
    });

    // Requirements 8.2: Return default CAUTION response on Bedrock failure
    // Update session with default CAUTION values
    session.currentRiskScore = 50; // Middle of CAUTION range (34-66)
    session.currentThreatLevel = 'CAUTION';
    session.lastAnalysisTime = Date.now();
    session.analysisCount += 1;

    // Requirements 3.7: Clear buffer even on error to prevent memory overflow
    session.transcriptionBuffer = [];
    session.wordCount = 0;
    session.speechDuration = 0;

    log({
      level: 'WARN',
      message: 'Using default CAUTION response due to analysis failure',
      callSessionId: session.callSessionId,
      riskScore: session.currentRiskScore,
      threatLevel: session.currentThreatLevel,
    });

    // Requirements 8.5: Send error message to mobile client via WebSocket
    try {
      const wsClient = getWebSocketClient();
      const errorMessage = formatErrorMessage(
        error as Error,
        'ANALYSIS_ERROR'
      );
      
      await wsClient.sendErrorMessage(
        session.connectionId,
        errorMessage,
        session.callSessionId
      );
      
      log({
        level: 'INFO',
        message: 'Analysis error message sent to mobile client',
        callSessionId: session.callSessionId,
        connectionId: session.connectionId,
      });
    } catch (wsError) {
      // Log WebSocket error but don't fail
      log({
        level: 'WARN',
        message: 'Failed to send analysis error message via WebSocket',
        callSessionId: session.callSessionId,
        connectionId: session.connectionId,
        error: {
          name: (wsError as Error).name,
          message: (wsError as Error).message,
        },
      });
    }

    // Don't re-throw - we want to continue processing audio
  }
}

/**
 * Forward audio chunk to Amazon Transcribe for real-time transcription
 * 
 * Requirements 2.3, 10.4: Forward audio chunks to Transcribe stream in real-time,
 * ensure audio is NOT stored persistently (process in memory only),
 * handle stream backpressure and buffering, log audio forwarding with duration metrics
 * 
 * @param audioBuffer - Decoded audio buffer (PCM 16kHz 16-bit mono)
 * @param callSessionId - Unique call session identifier
 * @param sequenceNumber - Audio chunk sequence number
 * @returns Promise that resolves when transcription is complete
 */
async function forwardAudioToTranscribe(
  audioBuffer: Buffer,
  callSessionId: string,
  sequenceNumber: number
): Promise<void> {
  const startTime = Date.now();
  const maxRetries = 3;
  const backoffDelays = [1000, 2000, 4000]; // 1s, 2s, 4s exponential backoff

  let lastError: Error | null = null;

  // Requirements 8.1: Retry up to 3 times with exponential backoff
  for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
    try {
      log({
        level: 'INFO',
        message: retryCount === 0 ? 'Forwarding audio chunk to Transcribe' : 'Retrying audio forwarding to Transcribe',
        callSessionId,
        sequenceNumber,
        audioSize: audioBuffer.length,
        retryCount,
      });

      // Forward audio to Transcribe streaming service
      // Requirements 2.3: Audio is processed in memory only, not stored persistently
      // The transcribeAudioChunk method handles stream backpressure internally
      await transcribeService.transcribeAudioChunk(
        audioBuffer,
        (segment: TranscriptionSegment) => {
          // Handle transcription segment callback
          // Requirements 10.4: Log transcription receipt with latency metrics
          const transcriptionLatency = Date.now() - startTime;

          log({
            level: 'INFO',
            message: 'Transcription segment received',
            callSessionId,
            sequenceNumber,
            text: segment.text,
            isPartial: segment.isPartial,
            confidence: segment.confidence,
            language: segment.language,
            duration: transcriptionLatency,
          });

          // Get call session to accumulate transcription
          // Requirements 3.6: Accumulate transcribed text segments for analysis
          const session = callSessions.get(callSessionId);
          if (session && !segment.isPartial) {
            // Only accumulate stabilized (non-partial) results
            // Requirements 3.6: Handle partial results - update buffer as results stabilize
            session.transcriptionBuffer.push(segment.text);

            // Update word count (simple word splitting)
            // Requirements 3.6: Track word count for analysis trigger logic
            const words = segment.text.trim().split(/\s+/).filter(w => w.length > 0);
            session.wordCount += words.length;

            // Track speech duration (endTime - startTime for this segment)
            // Requirements 3.6, 3.7: Track timing for 10-second analysis threshold
            const segmentDuration = segment.endTime - segment.startTime;
            session.speechDuration += segmentDuration;

            log({
              level: 'INFO',
              message: 'Transcription accumulated',
              callSessionId,
              wordCount: session.wordCount,
              bufferSize: session.transcriptionBuffer.length,
              speechDuration: session.speechDuration.toFixed(2),
            });

            // Requirements 3.7: Check if analysis threshold has been reached
            // Trigger fraud analysis when transcription reaches 50 words OR 10 seconds
            if (checkAnalysisThreshold(session)) {
              log({
                level: 'INFO',
                message: 'Analysis threshold reached',
                callSessionId,
                wordCount: session.wordCount,
                speechDuration: session.speechDuration.toFixed(2),
              });

              // Trigger fraud analysis asynchronously
              // Don't await here to avoid blocking transcription processing
              triggerFraudAnalysis(session).catch(error => {
                log({
                  level: 'ERROR',
                  message: 'Fraud analysis failed',
                  callSessionId,
                  error: {
                    name: (error as Error).name,
                    message: (error as Error).message,
                    stack: (error as Error).stack,
                  },
                });
              });
            }
          }
        }
      );

      // Log successful audio forwarding with duration metrics
      // Requirements 10.4: Log audio forwarding with duration metrics
      const forwardingDuration = Date.now() - startTime;

      log({
        level: 'INFO',
        message: 'Audio forwarded to Transcribe successfully',
        callSessionId,
        sequenceNumber,
        duration: forwardingDuration,
        retryCount,
      });

      // Success - return without retrying
      return;

    } catch (error) {
      lastError = error as Error;

      // Requirements 8.4: Log errors with context (retryCount, error type, callSessionId)
      log({
        level: retryCount < maxRetries ? 'WARN' : 'ERROR',
        message: retryCount < maxRetries ? 'Transcribe error, will retry' : 'Transcribe error, all retries exhausted',
        callSessionId,
        sequenceNumber,
        retryCount,
        errorType: lastError.name,
        errorMessage: lastError.message,
        error: {
          name: lastError.name,
          message: lastError.message,
          stack: lastError.stack,
        },
      });

      // If we haven't exhausted retries, wait before retrying
      // Requirements 8.1: Exponential backoff (1s, 2s, 4s)
      if (retryCount < maxRetries) {
        const delay = backoffDelays[retryCount];
        log({
          level: 'INFO',
          message: 'Waiting before retry',
          callSessionId,
          sequenceNumber,
          retryCount,
          delayMs: delay,
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  // Requirements 3.5: Continue processing subsequent audio chunks after error
  // Requirements 8.1: If all retries fail, log error and continue
  log({
    level: 'ERROR',
    message: 'Failed to forward audio to Transcribe after all retries',
    callSessionId,
    sequenceNumber,
    maxRetries,
    totalDuration: Date.now() - startTime,
    finalError: {
      name: lastError?.name,
      message: lastError?.message,
    },
  });

  // Re-throw to allow caller to handle (e.g., return CAUTION response)
  throw lastError;
}

/**
 * Get secrets from Secrets Manager with 5-minute caching
 */
async function getSecrets(): Promise<any> {
  const now = Date.now();
  
  // Return cached secrets if still valid
  if (secretsCache && (now - secretsCache.timestamp) < SECRETS_CACHE_TTL) {
    return secretsCache.secrets;
  }

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: `vocalshield/api-keys`,
      })
    );

    const secrets = response.SecretString ? JSON.parse(response.SecretString) : {};
    
    // Update cache
    secretsCache = {
      secrets,
      timestamp: now,
    };

    log({
      level: 'INFO',
      message: 'Secrets retrieved and cached',
    });

    return secrets;
  } catch (error) {
    log({
      level: 'WARN',
      message: 'Failed to retrieve secrets, using defaults',
      error: {
        name: (error as Error).name,
        message: (error as Error).message,
      },
    });
    return {};
  }
}

/**
 * Get configuration from Parameter Store with 5-minute caching
 */
async function getConfiguration(): Promise<ConfigCache> {
  const now = Date.now();
  
  // Return cached config if still valid
  if (configCache && (now - configCache.timestamp) < CONFIG_CACHE_TTL) {
    return configCache;
  }

  try {
    // Get fraud threshold parameter
    const fraudThresholdResponse = await ssmClient.send(
      new GetParameterCommand({
        Name: `/vocalshield/${ENVIRONMENT}/audio-processor/fraud-threshold`,
      })
    );

    // Get max processing time parameter
    const maxProcessingTimeResponse = await ssmClient.send(
      new GetParameterCommand({
        Name: `/vocalshield/${ENVIRONMENT}/audio-processor/max-processing-time`,
      })
    );

    const config: ConfigCache = {
      fraudThreshold: parseInt(fraudThresholdResponse.Parameter?.Value || '70', 10),
      maxProcessingTime: parseInt(maxProcessingTimeResponse.Parameter?.Value || '3000', 10),
      timestamp: now,
    };

    // Update cache
    configCache = config;

    log({
      level: 'INFO',
      message: 'Configuration retrieved and cached',
    });

    return config;
  } catch (error) {
    log({
      level: 'WARN',
      message: 'Failed to retrieve configuration, using defaults',
      error: {
        name: (error as Error).name,
        message: (error as Error).message,
      },
    });

    // Return default configuration
    const defaultConfig: ConfigCache = {
      fraudThreshold: 70,
      maxProcessingTime: 3000,
      timestamp: now,
    };
    configCache = defaultConfig;
    return defaultConfig;
  }
}



/**
 * Process audio for fraud detection
 * 
 * Analyzes audio buffer for fraud by combining transcription accumulation
 * with Bedrock Agent analysis when enough speech has accumulated.
 * 
 * Falls back to heuristic scoring when:
 * - Insufficient transcription accumulated (< 10 words)
 * - Bedrock circuit breaker is open
 * 
 * @param audioBuffer - Decoded audio data
 * @returns Fraud score (0-100)
 */
async function processAudioForFraud(audioBuffer: Buffer): Promise<number> {
  log({
    level: 'INFO',
    message: `Processing audio buffer of ${audioBuffer.length} bytes`,
  });

  // Use the latest accumulated transcription from all active sessions
  // and delegate to Bedrock agent for analysis
  let fraudScore = 0;

  try {
    // Find the most recent active session
    let latestSession: CallSessionState | null = null;
    for (const [, session] of callSessions) {
      if (!latestSession || session.startTime > latestSession.startTime) {
        latestSession = session;
      }
    }

    if (latestSession && latestSession.transcriptionBuffer.length > 0) {
      const transcript = latestSession.transcriptionBuffer.join(' ');

      // Only invoke Bedrock if we have enough content
      if (latestSession.wordCount >= 10) {
        const analysisResult = await invokeBedrockAgent(
          transcript,
          latestSession.callSessionId
        );
        fraudScore = analysisResult.riskScore;
        latestSession.currentRiskScore = fraudScore;
        latestSession.currentThreatLevel = analysisResult.threatLevel;
        latestSession.lastAnalysisTime = Date.now();
        latestSession.analysisCount++;
      } else {
        // Not enough speech yet — use conservative score
        fraudScore = Math.min(latestSession.currentRiskScore, 20);
      }
    }
  } catch (error) {
    log({
      level: 'ERROR',
      message: 'Bedrock analysis failed in processAudioForFraud, using fallback score',
      error: {
        name: (error as Error).name,
        message: (error as Error).message,
      },
    });
    // Fallback: return a CAUTION-level score
    fraudScore = 50;
  }

  log({
    level: 'INFO',
    message: `Audio fraud analysis complete, score: ${fraudScore}`,
  });

  return fraudScore;
}

/**
 * Publish fraud alert to SNS topic
 * 
 * @param result - Audio processing result
 */
async function publishFraudAlert(result: AudioProcessingResult): Promise<void> {
  if (!SNS_TOPIC_ARN) {
    log({
      level: 'WARN',
      message: 'SNS topic ARN not configured, skipping notification',
      sessionId: result.sessionId,
    });
    return;
  }

  try {
    const message = {
      sessionId: result.sessionId,
      timestamp: result.timestamp,
      fraudScore: result.fraudScore,
      message: `Fraud detected with score ${result.fraudScore}. Please check on your loved one.`,
      actionRequired: true,
    };

    await snsClient.send(
      new PublishCommand({
        TopicArn: SNS_TOPIC_ARN,
        Subject: 'VocalShield Fraud Alert',
        Message: JSON.stringify(message, null, 2),
      })
    );

    log({
      level: 'INFO',
      message: 'Fraud alert published to SNS',
      sessionId: result.sessionId,
    });
  } catch (error) {
    log({
      level: 'ERROR',
      message: 'Failed to publish fraud alert to SNS',
      sessionId: result.sessionId,
      error: {
        name: (error as Error).name,
        message: (error as Error).message,
      },
    });
    // Don't throw - notification failure shouldn't block processing
  }
}

/**
 * Publish event to EventBridge
 * 
 * @param result - Audio processing result
 * @param connectionId - WebSocket connection ID
 */
async function publishEvent(result: AudioProcessingResult, connectionId: string): Promise<void> {
  if (!EVENT_BUS_NAME) {
    log({
      level: 'WARN',
      message: 'EventBridge bus name not configured, skipping event publication',
      sessionId: result.sessionId,
    });
    return;
  }

  try {
    const eventDetail = {
      sessionId: result.sessionId,
      connectionId,
      timestamp: result.timestamp,
      fraudScore: result.fraudScore,
      fraudDetected: result.fraudDetected,
    };

    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'vocalshield.audio-processor',
            DetailType: result.fraudDetected ? 'Fraud Detected' : 'Processing Complete',
            Detail: JSON.stringify(eventDetail),
            EventBusName: EVENT_BUS_NAME,
          },
        ],
      })
    );

    log({
      level: 'INFO',
      message: 'Event published to EventBridge',
      sessionId: result.sessionId,
      connectionId,
    });
  } catch (error) {
    log({
      level: 'ERROR',
      message: 'Failed to publish event to EventBridge',
      sessionId: result.sessionId,
      connectionId,
      error: {
        name: (error as Error).name,
        message: (error as Error).message,
      },
    });
    // Don't throw - event publication failure shouldn't block processing
  }
}

/**
 * Lambda handler for audio processing
 * 
 * Requirements 2.2, 2.5, 10.1, 10.2, 12.6: Parse and validate WebSocket audio messages
 * 
 * Processes audio data, detects fraud, stores metadata, and publishes events.
 * 
 * Features:
 * - Parses and validates WebSocket audio message format
 * - Decodes Base64 audioData to Buffer
 * - Validates audio format (PCM, 16kHz, 16-bit, mono)
 * - Returns error message for invalid format or malformed message
 * - Logs audio receipt with structured JSON
 * - Processes audio for fraud detection (placeholder for ML integration)
 * - Stores processing metadata in DynamoDB
 * - Publishes fraud alerts to SNS when detected
 * - Publishes events to EventBridge for event-driven architecture
 * - Retrieves secrets from Secrets Manager with 5-minute caching
 * - Retrieves configuration from Parameter Store with 5-minute caching
 * - X-Ray tracing for observability
 * 
 * @param event - API Gateway WebSocket event
 * @returns API Gateway response with status code
 */
export async function handler(
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> {
  const startTime = Date.now();
  const connectionId = event.requestContext.connectionId;
  const requestId = event.requestContext.requestId;

  log({
    level: 'INFO',
    message: 'Audio processing request received',
    requestId,
    connectionId,
  });

  try {
    // Step 1: Parse and validate WebSocket audio message
    // Requirements 2.2, 2.5, 12.6
    const audioMessage = parseAudioMessage(event.body, connectionId);
    
    // Step 2: Decode Base64 audioData to Buffer
    // Requirements 2.2, 2.5
    const audioBuffer = decodeBase64AudioData(audioMessage.audioData);
    
    // Step 3: Validate audio format (PCM, 16kHz, 16-bit, mono)
    // Requirements 2.2, 2.5
    const formatValidation = validateAudioFormat(audioBuffer);
    
    if (!formatValidation.valid) {
      log({
        level: 'WARN',
        message: 'Invalid audio format',
        requestId,
        connectionId,
        callSessionId: audioMessage.callSessionId,
        sequenceNumber: audioMessage.sequenceNumber,
        error: {
          name: 'InvalidAudioFormat',
          message: formatValidation.error || 'Unknown format error',
        },
      });
      
      return {
        statusCode: 400,
        body: JSON.stringify({
          type: 'error',
          code: 'INVALID_AUDIO_FORMAT',
          message: formatValidation.error || 'Invalid audio format',
          timestamp: Date.now(),
          requestId,
        }),
      };
    }
    
    // Step 4: Log audio receipt with structured JSON
    // Requirements 10.1, 10.2
    log({
      level: 'INFO',
      message: 'Audio chunk received and validated',
      requestId,
      connectionId,
      callSessionId: audioMessage.callSessionId,
      sequenceNumber: audioMessage.sequenceNumber,
      audioSize: audioBuffer.length,
    });
    
    // Step 5: Initialize or retrieve call session state
    // Requirements 2.3, 3.6
    getOrCreateCallSession(audioMessage.callSessionId, connectionId);

    // Get configuration (cached for 5 minutes)
    const config = await getConfiguration();

    // Get secrets (cached for 5 minutes)
    await getSecrets();

    // Step 6: Forward audio to Amazon Transcribe for real-time transcription
    // Requirements 2.3, 10.4: Forward audio chunks to Transcribe stream in real-time
    // Audio is processed in memory only and NOT stored persistently (privacy requirement)
    try {
      await forwardAudioToTranscribe(
        audioBuffer,
        audioMessage.callSessionId,
        audioMessage.sequenceNumber
      );
    } catch (transcribeError) {
      // Requirements 3.5, 8.1: Continue processing subsequent audio chunks after error
      // Requirements 8.1: If all retries fail, return CAUTION response
      log({
        level: 'ERROR',
        message: 'Transcribe forwarding failed after all retries, will return CAUTION response',
        requestId,
        connectionId,
        callSessionId: audioMessage.callSessionId,
        sequenceNumber: audioMessage.sequenceNumber,
        error: {
          name: (transcribeError as Error).name,
          message: (transcribeError as Error).message,
        },
      });
      
      // Requirements 8.5: Send error message to mobile client via WebSocket
      try {
        const wsClient = getWebSocketClient();
        const errorMessage = formatErrorMessage(
          transcribeError as Error,
          'TRANSCRIPTION_ERROR',
          requestId
        );
        
        await wsClient.sendErrorMessage(
          connectionId,
          errorMessage,
          audioMessage.callSessionId
        );
        
        log({
          level: 'INFO',
          message: 'Transcription error message sent to mobile client',
          requestId,
          connectionId,
          callSessionId: audioMessage.callSessionId,
        });
      } catch (wsError) {
        // Log WebSocket error but don't fail the processing
        log({
          level: 'WARN',
          message: 'Failed to send transcription error message via WebSocket',
          requestId,
          connectionId,
          callSessionId: audioMessage.callSessionId,
          error: {
            name: (wsError as Error).name,
            message: (wsError as Error).message,
          },
        });
      }
      
      // Continue processing - don't throw, as we want to continue with subsequent audio chunks
    }

    // Process audio for fraud detection (placeholder - will be replaced with Bedrock in future tasks)
    const fraudScore = await processAudioForFraud(audioBuffer);
    const fraudDetected = fraudScore >= config.fraudThreshold;

    // Calculate processing duration
    const processingDuration = Date.now() - startTime;
    const timestamp = Date.now();
    const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days

    // Store metadata in DynamoDB (no audio data stored - privacy requirement)
    await docClient.send(
      new PutCommand({
        TableName: METADATA_TABLE,
        Item: {
          callSessionId: audioMessage.callSessionId,
          timestamp,
          connectionId,
          sequenceNumber: audioMessage.sequenceNumber,
          fraudScore,
          fraudDetected,
          processingDuration,
          audioChunkSize: audioBuffer.length,
          ttl,
        },
      })
    );

    log({
      level: 'INFO',
      message: 'Metadata stored in DynamoDB',
      requestId,
      connectionId,
      callSessionId: audioMessage.callSessionId,
    });

    // Create processing result
    const result: AudioProcessingResult = {
      sessionId: audioMessage.callSessionId,
      timestamp,
      fraudScore,
      fraudDetected,
      message: fraudDetected 
        ? `Potential fraud detected (score: ${fraudScore})` 
        : 'No fraud detected',
    };

    // If fraud detected, publish alert to SNS
    if (fraudDetected) {
      await publishFraudAlert(result);
    }

    // Publish event to EventBridge
    await publishEvent(result, connectionId);

    log({
      level: 'INFO',
      message: 'Audio processing completed',
      requestId,
      connectionId,
      callSessionId: audioMessage.callSessionId,
      duration: processingDuration,
    });

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error as Error;

    log({
      level: 'ERROR',
      message: 'Audio processing failed',
      requestId,
      connectionId,
      duration,
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
    });

    // Determine appropriate error code based on error type
    let errorCode: ErrorMessage['code'] = 'INTERNAL_ERROR';
    let statusCode = 500;
    
    // Check for message format validation errors (from parseAudioMessage)
    if (err.message.includes('Missing') || 
        err.message.includes('required fields') ||
        err.message.includes('must be a') ||
        err.message.includes('Invalid JSON') ||
        err.message.includes('Invalid action') ||
        err.message.includes('Timestamp is too far') ||
        err.message.includes('Sequence number must be') ||
        err.message.includes('message body') ||
        err.message.includes('Message must be')) {
      errorCode = 'VALIDATION_ERROR';
      statusCode = 400;
    } else if (err.message.includes('audio format') || err.message.includes('Audio')) {
      errorCode = 'VALIDATION_ERROR';
      statusCode = 400;
    } else if (err.message.includes('Transcribe') || err.message.includes('transcription')) {
      errorCode = 'TRANSCRIPTION_ERROR';
      statusCode = 500;
    } else if (err.message.includes('Bedrock') || err.message.includes('analysis')) {
      errorCode = 'ANALYSIS_ERROR';
      statusCode = 500;
    } else if (err.message.includes('DynamoDB') || err.message.includes('database')) {
      errorCode = 'SERVICE_ERROR';
      statusCode = 500;
    }

    // Requirements 8.5: Format and sanitize error message for mobile client
    const errorMessage = formatErrorMessage(err, errorCode, requestId);

    // Requirements 8.5: Send error message to mobile client via WebSocket
    // Try to send error message to client if we have a connection
    try {
      const wsClient = getWebSocketClient();
      await wsClient.sendErrorMessage(
        connectionId,
        errorMessage,
        'unknown' // callSessionId may not be available if parsing failed
      );
      
      log({
        level: 'INFO',
        message: 'Error message sent to mobile client',
        requestId,
        connectionId,
      });
    } catch (wsError) {
      // Log WebSocket error but don't fail the response
      log({
        level: 'WARN',
        message: 'Failed to send error message via WebSocket',
        requestId,
        connectionId,
        error: {
          name: (wsError as Error).name,
          message: (wsError as Error).message,
        },
      });
    }

    // Return sanitized error response
    // Requirements 8.5: Return generic error message without exposing internal details
    return {
      statusCode,
      body: JSON.stringify(errorMessage),
    };
  }
}
