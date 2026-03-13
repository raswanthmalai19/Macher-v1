import * as fc from 'fast-check';
import { WebSocketClient } from '../../lambda/audio-processor/websocket-client';
import { ApiGatewayManagementApiClient, PostToConnectionCommand, GoneException } from '@aws-sdk/client-apigatewaymanagementapi';
import { mockClient } from 'aws-sdk-client-mock';

/**
 * Feature: competition-mvp-backend, Property 15: Disconnection Error Handling
 * 
 * For any fraud analysis result, if the WebSocket connection is disconnected, the Audio_Processor
 * should log the error and discard the results without crashing or retrying indefinitely.
 * 
 * This test validates that:
 * 1. GoneException is caught and logged (not thrown)
 * 2. sendFraudAlert returns false for disconnected clients
 * 3. System continues processing (no crash)
 * 4. Appropriate warning logs are generated
 * 5. No data loss for other active connections
 * 
 * Validates: Requirements 5.3
 */
describe('Property 15: Disconnection Error Handling', () => {
  let apiGatewayMock: any;

  beforeEach(() => {
    // Create a fresh mock for each test
    apiGatewayMock = mockClient(ApiGatewayManagementApiClient);
    // Suppress console.log during tests to avoid cluttering output
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    apiGatewayMock.reset();
    jest.restoreAllMocks();
  });

  test('returns false when client is disconnected (GoneException)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          connectionId: fc.uuid(),
          callSessionId: fc.uuid(),
          fraudAlert: fc.record({
            type: fc.constant('fraud_analysis'),
            callSessionId: fc.uuid(),
            timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
            riskScore: fc.integer({ min: 0, max: 100 }),
            threatLevel: fc.constantFrom('SAFE', 'CAUTION', 'DANGER'),
            fraudIndicators: fc.array(
              fc.record({
                type: fc.constantFrom('URGENCY', 'PAYMENT_REQUEST', 'IMPERSONATION', 'THREAT', 'PERSONAL_INFO_REQUEST'),
                description: fc.string({ minLength: 10, maxLength: 100 }),
              }),
              { minLength: 0, maxLength: 5 }
            ),
            reasoning: fc.string({ minLength: 20, maxLength: 200 }),
          }),
        }),
        async ({ connectionId, callSessionId, fraudAlert }) => {
          // Reset mock for this property test run
          apiGatewayMock.reset();
          
          // Mock API Gateway to throw GoneException (client disconnected)
          apiGatewayMock.on(PostToConnectionCommand).rejects(
            new GoneException({
              $metadata: {},
              message: 'Connection is gone',
            })
          );

          // Create WebSocket client
          const wsClient = new WebSocketClient('https://test.execute-api.us-east-1.amazonaws.com/prod', 'test-table');

          // Property: sendFraudAlert should return false for disconnected clients
          const result = await wsClient.sendFraudAlert(connectionId, fraudAlert, callSessionId);

          // Verify result is false (message not sent)
          expect(result).toBe(false);

          // Verify API Gateway was called (attempt was made)
          expect(apiGatewayMock.calls()).toHaveLength(1);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('does not throw exception when client is disconnected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          connectionId: fc.uuid(),
          callSessionId: fc.uuid(),
          fraudAlert: fc.record({
            type: fc.constant('fraud_analysis'),
            callSessionId: fc.uuid(),
            timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
            riskScore: fc.integer({ min: 0, max: 100 }),
            threatLevel: fc.constantFrom('SAFE', 'CAUTION', 'DANGER'),
            fraudIndicators: fc.array(
              fc.record({
                type: fc.string({ minLength: 5, maxLength: 30 }),
                description: fc.string({ minLength: 10, maxLength: 100 }),
              })
            ),
            reasoning: fc.string({ minLength: 20, maxLength: 200 }),
          }),
        }),
        async ({ connectionId, callSessionId, fraudAlert }) => {
          // Reset mock for this property test run
          apiGatewayMock.reset();
          
          // Mock API Gateway to throw GoneException
          apiGatewayMock.on(PostToConnectionCommand).rejects(
            new GoneException({
              $metadata: {},
              message: 'Connection is gone',
            })
          );

          const wsClient = new WebSocketClient('https://test.execute-api.us-east-1.amazonaws.com/prod', 'test-table');

          // Property: Should not throw exception (graceful handling)
          await expect(
            wsClient.sendFraudAlert(connectionId, fraudAlert, callSessionId)
          ).resolves.toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('logs warning message when client is disconnected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          connectionId: fc.uuid(),
          callSessionId: fc.uuid(),
          fraudAlert: fc.record({
            type: fc.constant('fraud_analysis'),
            callSessionId: fc.uuid(),
            timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
            riskScore: fc.integer({ min: 0, max: 100 }),
            threatLevel: fc.constantFrom('SAFE', 'CAUTION', 'DANGER'),
            fraudIndicators: fc.array(
              fc.record({
                type: fc.string({ minLength: 5, maxLength: 30 }),
                description: fc.string({ minLength: 10, maxLength: 100 }),
              })
            ),
            reasoning: fc.string({ minLength: 20, maxLength: 200 }),
          }),
        }),
        async ({ connectionId, callSessionId, fraudAlert }) => {
          // Reset mock for this property test run
          apiGatewayMock.reset();
          
          // Restore console.log to capture logs
          const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

          // Mock API Gateway to throw GoneException
          apiGatewayMock.on(PostToConnectionCommand).rejects(
            new GoneException({
              $metadata: {},
              message: 'Connection is gone',
            })
          );

          const wsClient = new WebSocketClient('https://test.execute-api.us-east-1.amazonaws.com/prod', 'test-table');

          await wsClient.sendFraudAlert(connectionId, fraudAlert, callSessionId);

          // Property: Should log warning about disconnected client
          const logCalls = logSpy.mock.calls;
          const warningLogs = logCalls.filter(call => {
            try {
              const logEntry = JSON.parse(call[0]);
              return logEntry.level === 'WARN' && 
                     logEntry.message.toLowerCase().includes('disconnect') &&
                     logEntry.callSessionId === callSessionId;
            } catch {
              return false;
            }
          });

          expect(warningLogs.length).toBeGreaterThan(0);

          // Verify log contains relevant context
          const warningLog = JSON.parse(warningLogs[0][0]);
          expect(warningLog.callSessionId).toBe(callSessionId);
          expect(warningLog.connectionId).toBe(connectionId);
          expect(warningLog.component).toBe('WebSocketClient');
        }
      ),
      { numRuns: 20 }
    );
  });

  test('handles multiple disconnections without crashing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            connectionId: fc.uuid(),
            callSessionId: fc.uuid(),
            fraudAlert: fc.record({
              type: fc.constant('fraud_analysis'),
              callSessionId: fc.uuid(),
              timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
              riskScore: fc.integer({ min: 0, max: 100 }),
              threatLevel: fc.constantFrom('SAFE', 'CAUTION', 'DANGER'),
              fraudIndicators: fc.array(
                fc.record({
                  type: fc.string({ minLength: 5, maxLength: 30 }),
                  description: fc.string({ minLength: 10, maxLength: 100 }),
                })
              ),
              reasoning: fc.string({ minLength: 20, maxLength: 200 }),
            }),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (disconnectionScenarios) => {
          // Reset mock for this property test run
          apiGatewayMock.reset();
          
          // Mock API Gateway to always throw GoneException
          apiGatewayMock.on(PostToConnectionCommand).rejects(
            new GoneException({
              $metadata: {},
              message: 'Connection is gone',
            })
          );

          const wsClient = new WebSocketClient('https://test.execute-api.us-east-1.amazonaws.com/prod', 'test-table');

          // Property: Should handle multiple disconnections without crashing
          const results = await Promise.all(
            disconnectionScenarios.map(scenario =>
              wsClient.sendFraudAlert(scenario.connectionId, scenario.fraudAlert, scenario.callSessionId)
            )
          );

          // All results should be false (all disconnected)
          expect(results.every(result => result === false)).toBe(true);

          // Verify all attempts were made
          expect(apiGatewayMock.calls()).toHaveLength(disconnectionScenarios.length);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('distinguishes between GoneException and other errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          connectionId: fc.uuid(),
          callSessionId: fc.uuid(),
          fraudAlert: fc.record({
            type: fc.constant('fraud_analysis'),
            callSessionId: fc.uuid(),
            timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
            riskScore: fc.integer({ min: 0, max: 100 }),
            threatLevel: fc.constantFrom('SAFE', 'CAUTION', 'DANGER'),
            fraudIndicators: fc.array(
              fc.record({
                type: fc.string({ minLength: 5, maxLength: 30 }),
                description: fc.string({ minLength: 10, maxLength: 100 }),
              })
            ),
            reasoning: fc.string({ minLength: 20, maxLength: 200 }),
          }),
          errorType: fc.constantFrom('ServiceUnavailable', 'ThrottlingException', 'InternalServerError'),
        }),
        async ({ connectionId, callSessionId, fraudAlert, errorType }) => {
          // Reset mock for this property test run
          apiGatewayMock.reset();
          
          // Restore console.log to capture logs
          const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

          // Mock API Gateway to throw non-GoneException error
          apiGatewayMock.on(PostToConnectionCommand).rejects(new Error(errorType));

          const wsClient = new WebSocketClient('https://test.execute-api.us-east-1.amazonaws.com/prod', 'test-table');

          const result = await wsClient.sendFraudAlert(connectionId, fraudAlert, callSessionId);

          // Property: Should return false for any error
          expect(result).toBe(false);

          // Property: Should log as ERROR (not WARN) for non-GoneException errors
          const logCalls = logSpy.mock.calls;
          const errorLogs = logCalls.filter(call => {
            try {
              const logEntry = JSON.parse(call[0]);
              return logEntry.level === 'ERROR';
            } catch {
              return false;
            }
          });

          expect(errorLogs.length).toBeGreaterThan(0);

          // Verify error log contains error details
          const errorLog = JSON.parse(errorLogs[0][0]);
          expect(errorLog.error).toBeDefined();
          expect(errorLog.error.name).toBe('Error');
          // The error message should be one of the error types we generated
          expect(['ServiceUnavailable', 'ThrottlingException', 'InternalServerError']).toContain(errorLog.error.message);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('does not retry when client is disconnected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          connectionId: fc.uuid(),
          callSessionId: fc.uuid(),
          fraudAlert: fc.record({
            type: fc.constant('fraud_analysis'),
            callSessionId: fc.uuid(),
            timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
            riskScore: fc.integer({ min: 0, max: 100 }),
            threatLevel: fc.constantFrom('SAFE', 'CAUTION', 'DANGER'),
            fraudIndicators: fc.array(
              fc.record({
                type: fc.string({ minLength: 5, maxLength: 30 }),
                description: fc.string({ minLength: 10, maxLength: 100 }),
              })
            ),
            reasoning: fc.string({ minLength: 20, maxLength: 200 }),
          }),
        }),
        async ({ connectionId, callSessionId, fraudAlert }) => {
          // Reset mock for this property test run
          apiGatewayMock.reset();
          
          // Mock API Gateway to throw GoneException
          apiGatewayMock.on(PostToConnectionCommand).rejects(
            new GoneException({
              $metadata: {},
              message: 'Connection is gone',
            })
          );

          const wsClient = new WebSocketClient('https://test.execute-api.us-east-1.amazonaws.com/prod', 'test-table');

          await wsClient.sendFraudAlert(connectionId, fraudAlert, callSessionId);

          // Property: Should attempt exactly once (no retries for disconnected clients)
          expect(apiGatewayMock.calls()).toHaveLength(1);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('successful send after previous disconnection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          disconnectedConnectionId: fc.uuid(),
          activeConnectionId: fc.uuid(),
          callSessionId: fc.uuid(),
          fraudAlert: fc.record({
            type: fc.constant('fraud_analysis'),
            callSessionId: fc.uuid(),
            timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
            riskScore: fc.integer({ min: 0, max: 100 }),
            threatLevel: fc.constantFrom('SAFE', 'CAUTION', 'DANGER'),
            fraudIndicators: fc.array(
              fc.record({
                type: fc.string({ minLength: 5, maxLength: 30 }),
                description: fc.string({ minLength: 10, maxLength: 100 }),
              })
            ),
            reasoning: fc.string({ minLength: 20, maxLength: 200 }),
          }),
        }),
        async ({ disconnectedConnectionId, activeConnectionId, callSessionId, fraudAlert }) => {
          // Ensure the two connection IDs are different
          fc.pre(disconnectedConnectionId !== activeConnectionId);
          
          // Reset mock for this property test run
          apiGatewayMock.reset();
          
          // Mock API Gateway to fail for first connection, succeed for second
          apiGatewayMock.on(PostToConnectionCommand).callsFake((input: any) => {
            if (input.ConnectionId === disconnectedConnectionId) {
              throw new GoneException({
                $metadata: {},
                message: 'Connection is gone',
              });
            }
            return Promise.resolve({});
          });

          const wsClient = new WebSocketClient('https://test.execute-api.us-east-1.amazonaws.com/prod', 'test-table');

          // First send fails (disconnected)
          const result1 = await wsClient.sendFraudAlert(disconnectedConnectionId, fraudAlert, callSessionId);
          expect(result1).toBe(false);

          // Property: Second send succeeds (system continues processing)
          const result2 = await wsClient.sendFraudAlert(activeConnectionId, fraudAlert, callSessionId);
          expect(result2).toBe(true);

          // Verify both attempts were made
          expect(apiGatewayMock.calls()).toHaveLength(2);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('discards results without data loss for other connections', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          connections: fc.array(
            fc.record({
              connectionId: fc.uuid(),
              callSessionId: fc.uuid(),
              shouldDisconnect: fc.boolean(),
            }),
            { minLength: 3, maxLength: 10 }
          ),
          fraudAlert: fc.record({
            type: fc.constant('fraud_analysis'),
            callSessionId: fc.uuid(),
            timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
            riskScore: fc.integer({ min: 0, max: 100 }),
            threatLevel: fc.constantFrom('SAFE', 'CAUTION', 'DANGER'),
            fraudIndicators: fc.array(
              fc.record({
                type: fc.string({ minLength: 5, maxLength: 30 }),
                description: fc.string({ minLength: 10, maxLength: 100 }),
              })
            ),
            reasoning: fc.string({ minLength: 20, maxLength: 200 }),
          }),
        }),
        async ({ connections, fraudAlert }) => {
          // Reset mock for this property test run
          apiGatewayMock.reset();
          
          // Mock API Gateway to disconnect some connections
          apiGatewayMock.on(PostToConnectionCommand).callsFake((input: any) => {
            const connection = connections.find(c => c.connectionId === input.ConnectionId);
            if (connection?.shouldDisconnect) {
              throw new GoneException({
                $metadata: {},
                message: 'Connection is gone',
              });
            }
            return Promise.resolve({});
          });

          const wsClient = new WebSocketClient('https://test.execute-api.us-east-1.amazonaws.com/prod', 'test-table');

          // Send to all connections
          const results = await Promise.all(
            connections.map(conn =>
              wsClient.sendFraudAlert(conn.connectionId, fraudAlert, conn.callSessionId)
            )
          );

          // Property: Disconnected connections return false, active connections return true
          results.forEach((result, index) => {
            if (connections[index].shouldDisconnect) {
              expect(result).toBe(false);
            } else {
              expect(result).toBe(true);
            }
          });

          // Property: All connections were attempted (no early termination)
          expect(apiGatewayMock.calls()).toHaveLength(connections.length);
        }
      ),
      { numRuns: 20 }
    );
  });
});
