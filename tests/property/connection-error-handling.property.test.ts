/**
 * Feature: competition-mvp-backend, Property 2: Connection Error Handling
 * 
 * For any invalid connection attempt (missing API key, malformed request, invalid parameters),
 * the WebSocket_Gateway should return a descriptive error code without establishing a connection.
 * 
 * Validates: Requirements 1.6
 */

import * as fc from 'fast-check';
import { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('@aws-sdk/client-secrets-manager');
jest.mock('aws-xray-sdk-core', () => ({
  captureAWSv3Client: jest.fn((client) => client),
}));

describe('Property 2: Connection Error Handling', () => {
  let mockSend: jest.Mock;
  let connectHandler: any;
  const connectionStore = new Map<string, any>();

  beforeAll(async () => {
    // Set up environment
    process.env.CONNECTIONS_TABLE_NAME = 'test-connections-table';
    process.env.API_KEYS_SECRET_NAME = 'test/api-keys';
    process.env.AWS_REGION = 'us-east-1';

    // Mock DynamoDB and Secrets Manager
    mockSend = jest.fn((command) => {
      if (command.constructor.name === 'PutCommand') {
        const item = command.input.Item;
        connectionStore.set(item.connectionId, item);
        return Promise.resolve({});
      }
      
      if (command.constructor.name === 'GetSecretValueCommand') {
        return Promise.resolve({
          SecretString: JSON.stringify({
            websocketApiKey: 'valid-api-key-12345',
          }),
        });
      }

      return Promise.resolve({});
    });

    const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
    (DynamoDBDocumentClient.from as jest.Mock) = jest.fn(() => ({
      send: mockSend,
    }));

    connectHandler = (await import('../../lambda/connect/index')).handler;
  });

  beforeEach(() => {
    connectionStore.clear();
    mockSend.mockClear();
  });

  /**
   * Property: Any connection attempt without a valid API key should be rejected with 401
   */
  it('should reject connections with missing or invalid API keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          connectionId: fc.uuid(),
          callSessionId: fc.uuid(),
          // Generate invalid API keys (anything except the valid one)
          apiKey: fc.option(
            fc.oneof(
              fc.constant(undefined),
              fc.constant(''),
              fc.string().filter(s => s !== 'valid-api-key-12345'),
            )
          ),
        }),
        async (connectionRequest) => {
          const initialSize = connectionStore.size;

          const connectEvent: any = {
            requestContext: {
              routeKey: '$connect',
              connectionId: connectionRequest.connectionId,
              eventType: 'CONNECT',
              requestId: 'test-request-id',
              apiId: 'test-api-id',
              connectedAt: Date.now(),
              requestTimeEpoch: Date.now(),
              stage: 'dev',
              domainName: 'test.execute-api.us-east-1.amazonaws.com',
              requestTime: new Date().toISOString(),
              messageId: 'test-message-id',
              extendedRequestId: 'test-extended-request-id',
              messageDirection: 'IN',
            },
            queryStringParameters: connectionRequest.apiKey !== undefined ? {
              apiKey: connectionRequest.apiKey,
              callSessionId: connectionRequest.callSessionId,
            } : {
              callSessionId: connectionRequest.callSessionId,
            },
            isBase64Encoded: false,
          };

          const response = await connectHandler(connectEvent);

          // Should return 401 Unauthorized
          expect(response.statusCode).toBe(401);

          // Should include error message
          expect(response.body).toBeDefined();
          const body = JSON.parse(response.body);
          expect(body.error).toBe('Unauthorized');

          // Connection should NOT be stored
          expect(connectionStore.size).toBe(initialSize);
          expect(connectionStore.has(connectionRequest.connectionId)).toBe(false);

          return true;
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  });

  /**
   * Property: Connection attempts with missing connectionId should fail gracefully
   */
  it('should handle malformed requests with missing connectionId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          callSessionId: fc.uuid(),
          apiKey: fc.constant('valid-api-key-12345'),
        }),
        async (connectionRequest) => {
          const connectEvent: any = {
            requestContext: {
              routeKey: '$connect',
              // Missing connectionId
              eventType: 'CONNECT',
              requestId: 'test-request-id',
              apiId: 'test-api-id',
              connectedAt: Date.now(),
              requestTimeEpoch: Date.now(),
              stage: 'dev',
              domainName: 'test.execute-api.us-east-1.amazonaws.com',
              requestTime: new Date().toISOString(),
              messageId: 'test-message-id',
              extendedRequestId: 'test-extended-request-id',
              messageDirection: 'IN',
            },
            queryStringParameters: {
              apiKey: connectionRequest.apiKey,
              callSessionId: connectionRequest.callSessionId,
            },
            isBase64Encoded: false,
          };

          const response = await connectHandler(connectEvent);

          // Should return 400 Bad Request
          expect(response.statusCode).toBe(400);

          // Should include descriptive error
          expect(response.body).toBeDefined();
          expect(response.body).toContain('Invalid');

          return true;
        }
      ),
      { numRuns: 10, timeout: 30000 }
    );
  });

  /**
   * Property: All error responses should be descriptive and not expose internal details
   */
  it('should return descriptive errors without exposing internal details', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          connectionId: fc.uuid(),
          apiKey: fc.option(fc.string()),
        }),
        async (connectionRequest) => {
          const connectEvent: any = {
            requestContext: {
              routeKey: '$connect',
              connectionId: connectionRequest.connectionId,
              eventType: 'CONNECT',
              requestId: 'test-request-id',
              apiId: 'test-api-id',
              connectedAt: Date.now(),
              requestTimeEpoch: Date.now(),
              stage: 'dev',
              domainName: 'test.execute-api.us-east-1.amazonaws.com',
              requestTime: new Date().toISOString(),
              messageId: 'test-message-id',
              extendedRequestId: 'test-extended-request-id',
              messageDirection: 'IN',
            },
            queryStringParameters: connectionRequest.apiKey ? {
              apiKey: connectionRequest.apiKey,
            } : undefined,
            isBase64Encoded: false,
          };

          const response = await connectHandler(connectEvent);

          if (response.statusCode !== 200) {
            // Error responses should not contain:
            // - Stack traces
            // - Environment variables
            // - AWS resource names
            // - Internal implementation details
            const body = response.body || '';
            
            expect(body).not.toContain('Error:');
            expect(body).not.toContain('at ');
            expect(body).not.toContain('process.env');
            expect(body).not.toContain('AWS_');
            expect(body).not.toContain('arn:aws:');
            
            // Should contain user-friendly error message
            if (body) {
              const parsed = JSON.parse(body);
              expect(parsed.error || parsed.message).toBeDefined();
            }
          }

          return true;
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  });
});
