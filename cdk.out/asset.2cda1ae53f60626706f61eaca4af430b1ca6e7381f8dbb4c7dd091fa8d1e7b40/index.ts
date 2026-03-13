import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { captureAWSv3Client } from 'aws-xray-sdk-core';

// Initialize DynamoDB client with X-Ray tracing
const ddbClient = captureAWSv3Client(new DynamoDBClient({}));
const docClient = DynamoDBDocumentClient.from(ddbClient);

const METADATA_TABLE = process.env.METADATA_TABLE_NAME!;

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
 * Lambda handler for audio processing
 * 
 * Processes audio data, detects fraud (placeholder), stores metadata.
 * This is a minimal implementation for Task 5.1 - full implementation in Task 5.3.
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
    // Placeholder: Decode and validate audio data
    // Full implementation in Task 5.3
    
    const processingDuration = Date.now() - startTime;
    const timestamp = Date.now();
    const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days

    // Store metadata in DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: METADATA_TABLE,
        Item: {
          sessionId,
          timestamp,
          connectionId,
          fraudScore: 0, // Placeholder
          fraudDetected: false,
          processingDuration,
          ttl,
        },
      })
    );

    log({
      level: 'INFO',
      message: 'Audio processing completed',
      sessionId,
      connectionId,
      duration: processingDuration,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        sessionId,
        timestamp,
        fraudScore: 0,
        fraudDetected: false,
      }),
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
        message: 'Failed to process audio',
        timestamp: Date.now(),
      }),
    };
  }
}
