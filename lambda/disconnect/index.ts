import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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
 * This handler is idempotent - if the connection is not found, it logs a warning
 * but returns success (200) since the desired state is already achieved.
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
    // Validate connection ID
    if (!connectionId) {
      log({
        level: 'ERROR',
        message: 'Connection ID missing from request',
      });
      return {
        statusCode: 400,
        body: 'Invalid disconnection request',
      };
    }

    // Update connection status in DynamoDB
    // Table has composite key (connectionId + connectedAt), so query first
    const disconnectedAt = Date.now();

    const queryResult = await docClient.send(
      new QueryCommand({
        TableName: CONNECTIONS_TABLE,
        KeyConditionExpression: 'connectionId = :cid',
        ExpressionAttributeValues: { ':cid': connectionId },
        Limit: 1,
      })
    );

    if (queryResult.Items && queryResult.Items.length > 0) {
      const connectedAt = queryResult.Items[0].connectedAt;

      await docClient.send(
        new UpdateCommand({
          TableName: CONNECTIONS_TABLE,
          Key: {
            connectionId,
            connectedAt,
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
    } else {
      log({
        level: 'WARN',
        message: 'Connection not found in database for disconnect',
        connectionId,
      });
    }

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

    // Log warning if connection not found (idempotent behavior)
    if (err.name === 'ResourceNotFoundException' || err.message.includes('not found')) {
      log({
        level: 'WARN',
        message: 'Connection not found in database (already cleaned up)',
        connectionId,
        duration,
      });
      // Return 200 for idempotent behavior
      return {
        statusCode: 200,
      };
    }

    log({
      level: 'ERROR',
      message: 'Failed to update connection status',
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
