import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { captureAWSv3Client } from 'aws-xray-sdk-core';

// Initialize DynamoDB client with X-Ray tracing
const ddbClient = captureAWSv3Client(new DynamoDBClient({}));
const docClient = DynamoDBDocumentClient.from(ddbClient);

// Initialize Secrets Manager client with X-Ray tracing
const secretsClient = captureAWSv3Client(new SecretsManagerClient({}));

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE_NAME!;
const API_KEYS_SECRET_NAME = process.env.API_KEYS_SECRET_NAME || 'macher/api-keys';

// Cache for API keys (to avoid repeated Secrets Manager calls)
let cachedApiKeys: { websocketApiKey: string } | null = null;
let cacheExpiry = 0;

/**
 * Extended WebSocket event interface with query parameters
 * WebSocket connections pass parameters during the upgrade request
 */
interface WebSocketConnectEvent extends APIGatewayProxyWebsocketEventV2 {
  queryStringParameters?: {
    apiKey?: string;
    callSessionId?: string;
    userId?: string;
  };
}

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
 * Retrieve API keys from Secrets Manager with caching
 * Cache expires after 5 minutes to balance security and performance
 */
async function getApiKeys(): Promise<{ websocketApiKey: string }> {
  const now = Date.now();
  
  // Return cached keys if still valid
  if (cachedApiKeys && now < cacheExpiry) {
    return cachedApiKeys;
  }

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: API_KEYS_SECRET_NAME,
      })
    );

    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }

    const secretData = JSON.parse(response.SecretString);
    cachedApiKeys = {
      websocketApiKey: secretData.websocketApiKey,
    };
    
    // Cache for 5 minutes
    cacheExpiry = now + 5 * 60 * 1000;
    
    return cachedApiKeys;
  } catch (error) {
    log({
      level: 'ERROR',
      message: 'Failed to retrieve API keys from Secrets Manager',
      error: {
        name: (error as Error).name,
        message: (error as Error).message,
      },
    });
    throw error;
  }
}

/**
 * Validate API key from query parameters
 * WebSocket connections pass the API key during connection upgrade
 */
async function validateApiKey(event: WebSocketConnectEvent): Promise<boolean> {
  try {
    // Extract API key from query parameters
    const providedApiKey = event.queryStringParameters?.apiKey;

    if (!providedApiKey) {
      log({
        level: 'WARN',
        message: 'API key missing from request',
        connectionId: event.requestContext.connectionId,
      });
      return false;
    }

    // Retrieve valid API keys from Secrets Manager
    const { websocketApiKey } = await getApiKeys();

    // Validate the provided API key
    const isValid = providedApiKey === websocketApiKey;

    if (!isValid) {
      log({
        level: 'WARN',
        message: 'Invalid API key provided',
        connectionId: event.requestContext.connectionId,
      });
    }

    return isValid;
  } catch (error) {
    log({
      level: 'ERROR',
      message: 'API key validation failed',
      connectionId: event.requestContext.connectionId,
      error: {
        name: (error as Error).name,
        message: (error as Error).message,
      },
    });
    return false;
  }
}

/**
 * Lambda handler for WebSocket $connect route
 * 
 * Validates incoming connection requests and stores connection metadata in DynamoDB.
 * Enforces API key authentication (Requirement 12.1).
 * 
 * @param event - API Gateway WebSocket event
 * @returns API Gateway response with status code
 */
export async function handler(
  event: WebSocketConnectEvent
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

    // Validate API key (Requirement 12.1)
    const isValidApiKey = await validateApiKey(event);
    if (!isValidApiKey) {
      log({
        level: 'WARN',
        message: 'Connection rejected: Invalid or missing API key',
        connectionId,
      });
      return {
        statusCode: 401,
        body: JSON.stringify({
          error: 'Unauthorized',
          message: 'Valid API key required for WebSocket connection',
        }),
      };
    }

    // Extract optional parameters from query string
    const callSessionId = event.queryStringParameters?.callSessionId;
    const userId = event.queryStringParameters?.userId;

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
          callSessionId,
          userId,
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
