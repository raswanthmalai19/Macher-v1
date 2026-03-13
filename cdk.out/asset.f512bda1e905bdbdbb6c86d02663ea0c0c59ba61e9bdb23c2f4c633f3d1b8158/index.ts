import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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
 * Lambda handler for WebSocket $disconnect route
 * 
 * Updates connection status to disconnected and records disconnection timestamp.
 * 
 * @param event - API Gateway WebSocket event
 * @returns API Gateway response with status code
 */
export async function handler(
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> {
  const startTime = Date.now();
  const connectionId = event.requestContext.connectionId;

  log({
    level: 'INFO',
    message: 'WebSocket disconnection request received',
    connectionId,
  });

  try {
    // Update connection status in DynamoDB
    const disconnectedAt = Date.now();

    await docClient.send(
      new UpdateCommand({
        TableName: CONNECTIONS_TABLE,
        Key: {
          connectionId,
          connectedAt: event.requestContext.connectedAt || 0,
        },
        UpdateExpression: 'SET #status = :status, disconnectedAt = :disconnectedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': 'disconnected',
          ':disconnectedAt': disconnectedAt,
        },
      })
    );

    const duration = Date.now() - startTime;

    log({
      level: 'INFO',
      message: 'Connection disconnected successfully',
      connectionId,
      duration,
    });

    return {
      statusCode: 200,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error as Error;

    // Log error but return 200 (idempotent operation)
    log({
      level: 'WARN',
      message: 'Failed to update disconnection status (non-critical)',
      connectionId,
      duration,
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
    });

    // Return 200 even on error - disconnection is idempotent
    return {
      statusCode: 200,
    };
  }
}
