/**
 * Feature: competition-mvp-backend, Property 1: Connection Lifecycle Round Trip
 * 
 * For any valid WebSocket connection request with API key, establishing a connection
 * should store the Connection_ID in Connection_Store, and disconnecting should remove it,
 * returning the store to its original state.
 * 
 * Validates: Requirements 1.1, 1.2, 1.3
 */

import * as fc from 'fast-check';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('aws-xray-sdk-core', () => ({
  captureAWSv3Client: jest.fn((client) => client),
}));

describe('Property 1: Connection Lifecycle Round Trip', () => {
  let mockSend: jest.Mock;
  let connectHandler: any;
  let disconnectHandler: any;
  const connectionStore = new Map<string, any>();

  beforeAll(async () => {
    // Set up environment
    process.env.CONNECTIONS_TABLE_NAME = 'test-connections-table';
    process.env.API_KEYS_SECRET_NAME = 'test/api-keys';
    process.env.AWS_REGION = 'us-east-1';

    // Mock DynamoDB operations
    mockSend = jest.fn((command) => {
      if (command.input?.TableName === 'test-connections-table') {
        if (command.constructor.name === 'PutCommand') {
          // Store connection
          const item = command.input.Item;
          connectionStore.set(item.connectionId, item);
          return Promise.resolve({});
        } else if (command.constructor.name === 'UpdateCommand') {
          // Update connection (disconnect)
          const connectionId = command.input.Key.connectionId;
          if (connectionStore.has(connectionId)) {
            const item = connectionStore.get(connectionId);
            item.status = 'disconnected';
            item.disconnectedAt = Date.now();
            connectionStore.set(connectionId, item);
          }
          return Promise.resolve({});
        } else if (command.constructor.name === 'GetItemCommand') {
          // Get connection
          const connectionId = command.input.Key.connectionId.S;
          return Promise.resolve({
            Item: connectionStore.has(connectionId) ? connectionStore.get(connectionId) : undefined,
          });
        }
      }
      
      // Mock Secrets Manager for API key validation
      if (command.constructor.name === 'GetSecretValueCommand') {
        return Promise.resolve({
          SecretString: JSON.stringify({
            websocketApiKey: 'valid-test-api-key-12345',
          }),
        });
      }

      return Promise.resolve({});
    });

    // Mock DynamoDB DocumentClient
    (DynamoDBDocumentClient.from as jest.Mock) = jest.fn(() => ({
      send: mockSend,
    }));

    // Import handlers after mocks are set up
    connectHandler = (await import('../../lambda/connect/index')).handler;
    disconnectHandler = (await import('../../lambda/disconnect/index')).handler;
  });

  beforeEach(() => {
    connectionStore.clear();
    mockSend.mockClear();
  });

  /**
   * Property: For any valid connection request, the connection lifecycle should be:
   * 1. Connect stores the connection in the store
   * 2. Disconnect removes/marks the connection as disconnected
   * 3. The store returns to a clean state (no active connections)
   */
  it('should maintain connection lifecycle invariant for any valid connection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          connectionId: fc.uuid(),
          callSessionId: fc.uuid(),
          userId: fc.option(fc.uuid()),
          apiKey: fc.constant('valid-test-api-key-12345'),
        }),
        async (connectionRequest) => {
          // Initial state: connection should not exist
          const initialExists = connectionStore.has(connectionRequest.connectionId);
          expect(initialExists).toBe(false);

          // Step 1: Connect
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
            queryStringParameters: {
              apiKey: connectionRequest.apiKey,
              callSessionId: connectionRequest.callSessionId,
              userId: connectionRequest.userId,
            },
            isBase64Encoded: false,
          };

          const connectResponse = await connectHandler(connectEvent);

          // Verify connection was successful
          expect(connectResponse.statusCode).toBe(200);

          // Verify connection was stored
          const storedAfterConnect = connectionStore.has(connectionRequest.connectionId);
          expect(storedAfterConnect).toBe(true);

          const storedConnection = connectionStore.get(connectionRequest.connectionId);
          expect(storedConnection).toBeDefined();
          expect(storedConnection.connectionId).toBe(connectionRequest.connectionId);
          expect(storedConnection.callSessionId).toBe(connectionRequest.callSessionId);
          expect(storedConnection.status).toBe('active');

          // Step 2: Disconnect
          const disconnectEvent: APIGatewayProxyWebsocketEventV2 = {
            requestContext: {
              routeKey: '$disconnect',
              connectionId: connectionRequest.connectionId,
              eventType: 'DISCONNECT',
              requestId: 'test-request-id-2',
              apiId: 'test-api-id',
              connectedAt: Date.now(),
              requestTimeEpoch: Date.now(),
              stage: 'dev',
              domainName: 'test.execute-api.us-east-1.amazonaws.com',
              requestTime: new Date().toISOString(),
              messageId: 'test-message-id-2',
              extendedRequestId: 'test-extended-request-id-2',
              messageDirection: 'IN',
            },
            isBase64Encoded: false,
          };

          const disconnectResponse = await disconnectHandler(disconnectEvent);

          // Verify disconnection was successful
          expect(disconnectResponse.statusCode).toBe(200);

          // Verify connection status was updated to disconnected
          const connectionAfterDisconnect = connectionStore.get(connectionRequest.connectionId);
          expect(connectionAfterDisconnect).toBeDefined();
          expect(connectionAfterDisconnect.status).toBe('disconnected');
          expect(connectionAfterDisconnect.disconnectedAt).toBeDefined();

          // Property invariant: Connection lifecycle completed successfully
          // The connection went from non-existent -> active -> disconnected
          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Multiple connections should not interfere with each other
   */
  it('should handle multiple concurrent connections independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            connectionId: fc.uuid(),
            callSessionId: fc.uuid(),
            apiKey: fc.constant('valid-test-api-key-12345'),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (connections) => {
          // Connect all
          for (const conn of connections) {
            const connectEvent: any = {
              requestContext: {
                routeKey: '$connect',
                connectionId: conn.connectionId,
                eventType: 'CONNECT',
                requestId: `request-${conn.connectionId}`,
                apiId: 'test-api-id',
                connectedAt: Date.now(),
                requestTimeEpoch: Date.now(),
                stage: 'dev',
                domainName: 'test.execute-api.us-east-1.amazonaws.com',
                requestTime: new Date().toISOString(),
                messageId: `message-${conn.connectionId}`,
                extendedRequestId: `extended-${conn.connectionId}`,
                messageDirection: 'IN',
              },
              queryStringParameters: {
                apiKey: conn.apiKey,
                callSessionId: conn.callSessionId,
              },
              isBase64Encoded: false,
            };

            await connectHandler(connectEvent);
          }

          // Verify all connections are stored
          for (const conn of connections) {
            expect(connectionStore.has(conn.connectionId)).toBe(true);
          }

          // Disconnect all
          for (const conn of connections) {
            const disconnectEvent: APIGatewayProxyWebsocketEventV2 = {
              requestContext: {
                routeKey: '$disconnect',
                connectionId: conn.connectionId,
                eventType: 'DISCONNECT',
                requestId: `disconnect-${conn.connectionId}`,
                apiId: 'test-api-id',
                connectedAt: Date.now(),
                requestTimeEpoch: Date.now(),
                stage: 'dev',
                domainName: 'test.execute-api.us-east-1.amazonaws.com',
                requestTime: new Date().toISOString(),
                messageId: `message-disconnect-${conn.connectionId}`,
                extendedRequestId: `extended-disconnect-${conn.connectionId}`,
                messageDirection: 'IN',
              },
              isBase64Encoded: false,
            };

            await disconnectHandler(disconnectEvent);
          }

          // Verify all connections are marked as disconnected
          for (const conn of connections) {
            const storedConn = connectionStore.get(conn.connectionId);
            expect(storedConn.status).toBe('disconnected');
          }

          return true;
        }
      ),
      { numRuns: 10, timeout: 30000 }
    );
  });
});
