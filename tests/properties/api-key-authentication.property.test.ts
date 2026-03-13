import * as fc from 'fast-check';
import { handler } from '../../lambda/connect/index';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Mock AWS SDK clients
const ddbMock = mockClient(DynamoDBDocumentClient);
const secretsMock = mockClient(SecretsManagerClient);

/**
 * Property-Based Tests: API Key Authentication Enforcement
 * Feature: competition-mvp-backend
 * 
 * Property 35: API Key Authentication Enforcement
 * **Validates: Requirements 12.1**
 * 
 * For any WebSocket connection attempt, if the request does not include a valid API key
 * in the query parameters, the WebSocket_Gateway should reject the connection with a 
 * 401 Unauthorized error.
 * 
 * This property ensures that:
 * - Connections without API keys are rejected
 * - Connections with invalid API keys are rejected
 * - Connections with valid API keys are accepted
 * - Authentication is enforced consistently
 * 
 * Note: These tests work with the handler's 5-minute API key cache. The cache improves
 * performance in production by reducing Secrets Manager calls.
 */
describe('Property 35: API Key Authentication Enforcement', () => {
  const VALID_API_KEY = 'valid-test-api-key-12345678901234567890';
  const TABLE_NAME = 'test-connections-table';

  beforeAll(() => {
    // Set environment variables once for all tests
    process.env.CONNECTIONS_TABLE_NAME = TABLE_NAME;
    process.env.API_KEYS_SECRET_NAME = 'test/api-keys';

    // Mock Secrets Manager to always return the valid API key
    // Use .callsFake() to ensure it works for every call, not just once
    secretsMock.on(GetSecretValueCommand).callsFake(async () => ({
      SecretString: JSON.stringify({
        websocketApiKey: VALID_API_KEY,
      }),
    }));
  });

  beforeEach(() => {
    // Reset DynamoDB mock before each test
    ddbMock.reset();
    
    // Mock DynamoDB PutCommand to succeed for all calls
    ddbMock.on(PutCommand).resolves({
      $metadata: { httpStatusCode: 200 },
    });
  });

  afterAll(() => {
    // Clean up
    delete process.env.CONNECTIONS_TABLE_NAME;
    delete process.env.API_KEYS_SECRET_NAME;
    ddbMock.reset();
    secretsMock.reset();
  });

  /**
   * Test that connections without API keys are rejected with 401
   */
  test('connections without API key should be rejected with 401 Unauthorized', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          connectionId: fc.uuid(),
          callSessionId: fc.option(fc.uuid()),
          userId: fc.option(fc.uuid()),
        }),
        async ({ connectionId, callSessionId, userId }) => {
          // Create event without API key
          const event: any = {
            requestContext: {
              connectionId,
              routeKey: '$connect',
              eventType: 'CONNECT',
              requestId: fc.sample(fc.uuid(), 1)[0],
              apiId: 'test-api-id',
              stage: 'test',
            },
            queryStringParameters: {
              // No apiKey provided
              ...(callSessionId && { callSessionId }),
              ...(userId && { userId }),
            },
          };

          const response = await handler(event) as { statusCode: number; body?: string };

          // Should reject with 401
          expect(response.statusCode).toBe(401);
          expect(response.body).toBeDefined();
          
          if (response.body) {
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Unauthorized');
            expect(body.message).toContain('API key');
          }

          // Should NOT store connection in DynamoDB
          expect(ddbMock.calls()).toHaveLength(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Test that connections with invalid API keys are rejected with 401
   */
  test('connections with invalid API key should be rejected with 401 Unauthorized', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          connectionId: fc.uuid(),
          invalidApiKey: fc.string({ minLength: 10, maxLength: 64 }).filter(key => key !== VALID_API_KEY),
          callSessionId: fc.option(fc.uuid()),
          userId: fc.option(fc.uuid()),
        }),
        async ({ connectionId, invalidApiKey, callSessionId, userId }) => {
          // Create event with invalid API key
          const event: any = {
            requestContext: {
              connectionId,
              routeKey: '$connect',
              eventType: 'CONNECT',
              requestId: fc.sample(fc.uuid(), 1)[0],
              apiId: 'test-api-id',
              stage: 'test',
            },
            queryStringParameters: {
              apiKey: invalidApiKey,
              ...(callSessionId && { callSessionId }),
              ...(userId && { userId }),
            },
          };

          const response = await handler(event) as { statusCode: number; body?: string };

          // Should reject with 401
          expect(response.statusCode).toBe(401);
          expect(response.body).toBeDefined();
          
          if (response.body) {
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Unauthorized');
          }

          // Should NOT store connection in DynamoDB
          expect(ddbMock.calls()).toHaveLength(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Test that connections with valid API keys are accepted with 200
   */
  test('connections with valid API key should be accepted with 200 OK', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          connectionId: fc.uuid(),
          callSessionId: fc.option(fc.uuid()),
          userId: fc.option(fc.uuid()),
        }),
        async ({ connectionId, callSessionId, userId }) => {
          // Create event with valid API key
          const event: any = {
            requestContext: {
              connectionId,
              routeKey: '$connect',
              eventType: 'CONNECT',
              requestId: fc.sample(fc.uuid(), 1)[0],
              apiId: 'test-api-id',
              stage: 'test',
            },
            queryStringParameters: {
              apiKey: VALID_API_KEY,
              ...(callSessionId && { callSessionId }),
              ...(userId && { userId }),
            },
          };

          const response = await handler(event) as { statusCode: number; body?: string };

          // Should accept with 200
          expect(response.statusCode).toBe(200);

          // Should store connection in DynamoDB
          const putCalls = ddbMock.commandCalls(PutCommand);
          expect(putCalls.length).toBeGreaterThan(0);

          // Verify stored connection data
          const putCall = putCalls[0];
          expect(putCall.args[0].input.TableName).toBe(TABLE_NAME);
          expect(putCall.args[0].input.Item).toMatchObject({
            connectionId,
            status: 'active',
            ...(callSessionId && { callSessionId }),
            ...(userId && { userId }),
          });
          expect(putCall.args[0].input.Item?.ttl).toBeDefined();
          expect(putCall.args[0].input.Item?.connectedAt).toBeDefined();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Test that authentication is enforced consistently across multiple connection attempts
   */
  test('authentication should be enforced consistently for multiple connection attempts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            connectionId: fc.uuid(),
            hasValidKey: fc.boolean(),
            callSessionId: fc.option(fc.uuid()),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (connectionAttempts) => {
          // Process each connection attempt sequentially to avoid race conditions
          for (const { connectionId, hasValidKey, callSessionId } of connectionAttempts) {
            const event: any = {
              requestContext: {
                connectionId,
                routeKey: '$connect',
                eventType: 'CONNECT',
                requestId: fc.sample(fc.uuid(), 1)[0],
                apiId: 'test-api-id',
                stage: 'test',
              },
              queryStringParameters: {
                apiKey: hasValidKey ? VALID_API_KEY : 'invalid-key',
                ...(callSessionId && { callSessionId }),
              },
            };

            const response = await handler(event) as { statusCode: number; body?: string };

            // Verify the response matches expectations
            if (hasValidKey) {
              expect(response.statusCode).toBe(200);
            } else {
              expect(response.statusCode).toBe(401);
            }
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Test that empty or whitespace-only API keys are rejected
   */
  test('connections with empty or whitespace-only API keys should be rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          connectionId: fc.uuid(),
          emptyKey: fc.constantFrom('', '   ', '\t', '\n', '  \t\n  '),
        }),
        async ({ connectionId, emptyKey }) => {
          const event: any = {
            requestContext: {
              connectionId,
              routeKey: '$connect',
              eventType: 'CONNECT',
              requestId: fc.sample(fc.uuid(), 1)[0],
              apiId: 'test-api-id',
              stage: 'test',
            },
            queryStringParameters: {
              apiKey: emptyKey,
            },
          };

          const response = await handler(event) as { statusCode: number; body?: string };

          // Should reject with 401
          expect(response.statusCode).toBe(401);

          // Should NOT store connection in DynamoDB
          expect(ddbMock.calls()).toHaveLength(0);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that API key validation handles Secrets Manager failures gracefully
   */
  test('authentication should fail gracefully when Secrets Manager is unavailable', async () => {
    // Mock Secrets Manager to fail
    secretsMock.reset();
    secretsMock.on(GetSecretValueCommand).rejects(new Error('Service unavailable'));

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          connectionId: fc.uuid(),
          apiKey: fc.string({ minLength: 10, maxLength: 64 }),
        }),
        async ({ connectionId, apiKey }) => {
          const event: any = {
            requestContext: {
              connectionId,
              routeKey: '$connect',
              eventType: 'CONNECT',
              requestId: fc.sample(fc.uuid(), 1)[0],
              apiId: 'test-api-id',
              stage: 'test',
            },
            queryStringParameters: {
              apiKey,
            },
          };

          const response = await handler(event) as { statusCode: number; body?: string };

          // Should reject with 401 (fail closed for security)
          expect(response.statusCode).toBe(401);

          // Should NOT store connection in DynamoDB
          expect(ddbMock.calls()).toHaveLength(0);
        }
      ),
      { numRuns: 20 }
    );
  });
});
