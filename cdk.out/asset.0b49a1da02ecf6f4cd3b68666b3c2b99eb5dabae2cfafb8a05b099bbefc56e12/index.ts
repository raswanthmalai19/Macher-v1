import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { captureAWSv3Client } from 'aws-xray-sdk-core';

// Initialize DynamoDB client with X-Ray tracing
const ddbClient = captureAWSv3Client(new DynamoDBClient({}));
const docClient = DynamoDBDocumentClient.from(ddbClient);

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE_NAME!;

/**
 * Structured log entry interface
 */
interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
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
 * Lambda handler for WebSocket $connect route
 * 
 * Validates incoming connection requests and stores connection metadata in DynamoDB.
 * 
 * @param event - API Gateway WebSocket event
 * @returns API Gateway response with status code
 */
export async function handler(
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> {
  const startTime = Date.now();
  const connectionId = event.requestContext.connectionId;
  // Use connectionId as sourceIp placeholder (actual IP not available in V2 events)
  const sourceIp = connectionId;
  const userAgent = 'websocket-client';

  log({
    level: 'INFO',
    message: 'WebSocket connection request received',
    connectionId,
  });

  try {
    // Validate connection request
    if (!connectionId) {
      log({
        level: 'ERROR',
        message: 'Connection ID missing from request',
      });
      return {
        statusCode: 400,
        body: 'Invalid connection request',
      };
    }

    // Store connection metadata in DynamoDB
    const connectedAt = Date.now();
    const ttl = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now

    await docClient.send(
      new PutCommand({
        TableName: CONNECTIONS_TABLE,
        Item: {
          connectionId,
          connectedAt,
          status: 'active',
          sourceIp,
          userAgent,
          ttl,
        },
      })
    );

    const duration = Date.now() - startTime;

    log({
      level: 'INFO',
      message: 'Connection established successfully',
      connectionId,
      duration,
    });

    return {
      statusCode: 200,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error as Error;

    log({
      level: 'ERROR',
      message: 'Failed to establish connection',
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
      body: 'Internal server error',
    };
  }
}
