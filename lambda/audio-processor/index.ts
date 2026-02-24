import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { captureAWSv3Client } from 'aws-xray-sdk-core';

// Initialize AWS clients with X-Ray tracing
const ddbClient = captureAWSv3Client(new DynamoDBClient({}));
const docClient = DynamoDBDocumentClient.from(ddbClient);
const snsClient = captureAWSv3Client(new SNSClient({}));
const eventBridgeClient = captureAWSv3Client(new EventBridgeClient({}));
const secretsClient = captureAWSv3Client(new SecretsManagerClient({}));
const ssmClient = captureAWSv3Client(new SSMClient({}));

// Environment variables
const METADATA_TABLE = process.env.METADATA_TABLE_NAME!;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME;
const ENVIRONMENT = process.env.ENVIRONMENT || 'dev';

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
  message: string;
  sessionId?: string;
  connectionId?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
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
 * Write structured JSON log to CloudWatch
 */
function log(entry: Omit<LogEntry, 'timestamp'>): void {
  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  console.log(JSON.stringify(logEntry));
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
 * Decode and validate audio data
 * 
 * @param body - Base64-encoded audio data
 * @returns Decoded audio buffer
 */
function decodeAudioData(body: string | undefined): Buffer {
  if (!body) {
    throw new Error('Missing audio data in request body');
  }

  try {
    // Decode base64 audio data
    const audioBuffer = Buffer.from(body, 'base64');
    
    // Validate audio size (max 128 KB per API Gateway WebSocket limit)
    if (audioBuffer.length > 128 * 1024) {
      throw new Error('Audio data exceeds maximum size of 128 KB');
    }

    if (audioBuffer.length === 0) {
      throw new Error('Audio data is empty');
    }

    return audioBuffer;
  } catch (error) {
    throw new Error(`Failed to decode audio data: ${(error as Error).message}`);
  }
}

/**
 * Process audio for fraud detection
 * 
 * This is a placeholder implementation. In production, this would:
 * 1. Send audio to Amazon Transcribe for speech-to-text
 * 2. Send transcript to Amazon Bedrock for fraud analysis
 * 3. Return fraud score and detection result
 * 
 * @param audioBuffer - Decoded audio data
 * @returns Fraud score (0-100)
 */
async function processAudioForFraud(audioBuffer: Buffer): Promise<number> {
  // Placeholder: Simulate fraud detection
  // In production, integrate with Amazon Transcribe and Bedrock
  
  // Log audio buffer size for monitoring
  log({
    level: 'INFO',
    message: `Processing audio buffer of ${audioBuffer.length} bytes`,
  });
  
  // For now, generate a random fraud score for testing
  // This will be replaced with actual ML-based fraud detection
  const fraudScore = Math.floor(Math.random() * 100);
  
  log({
    level: 'INFO',
    message: 'Audio processed for fraud detection (placeholder)',
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
 * Processes audio data, detects fraud, stores metadata, and publishes events.
 * 
 * Features:
 * - Decodes and validates base64-encoded audio data
 * - Processes audio for fraud detection (placeholder for ML integration)
 * - Stores processing metadata in DynamoDB
 * - Publishes fraud alerts to SNS when detected
 * - Publishes events to EventBridge for event-driven architecture
 * - Retrieves secrets from Secrets Manager with 5-minute caching
 * - Retrieves configuration from Parameter Store with 5-minute caching
 * - Structured JSON logging with sessionId and connectionId
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
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  log({
    level: 'INFO',
    message: 'Audio processing request received',
    sessionId,
    connectionId,
  });

  try {
    // Get configuration (cached for 5 minutes)
    const config = await getConfiguration();

    // Get secrets (cached for 5 minutes)
    await getSecrets();

    // Decode and validate audio data
    const audioBuffer = decodeAudioData(event.body);
    const audioChunkSize = audioBuffer.length;

    log({
      level: 'INFO',
      message: 'Audio data decoded and validated',
      sessionId,
      connectionId,
    });

    // Process audio for fraud detection
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
          sessionId,
          timestamp,
          connectionId,
          fraudScore,
          fraudDetected,
          processingDuration,
          audioChunkSize,
          ttl,
        },
      })
    );

    log({
      level: 'INFO',
      message: 'Metadata stored in DynamoDB',
      sessionId,
      connectionId,
    });

    // Create processing result
    const result: AudioProcessingResult = {
      sessionId,
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
      sessionId,
      connectionId,
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
      sessionId,
      connectionId,
      duration,
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: true,
        code: 'ERROR_PROCESSING_FAILED',
        message: err.message || 'Failed to process audio',
        timestamp: Date.now(),
        sessionId,
      }),
    };
  }
}
