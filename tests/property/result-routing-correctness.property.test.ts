import * as fc from 'fast-check';
import { WebSocketClient } from '../../lambda/audio-processor/websocket-client';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { mockClient } from 'aws-sdk-client-mock';

/**
 * Feature: competition-mvp-backend, Property 16: Result Routing Correctness
 * 
 * For any call session with multiple concurrent connections, fraud analysis results should be sent
 * only to the Connection_ID associated with that specific Call_Session, not to other connections.
 * 
 * This test validates that:
 * 1. Each call session's results go to its own connectionId
 * 2. No messages sent to wrong connections
 * 3. Multiple concurrent sessions don't interfere
 * 4. ConnectionId from call session state is used correctly
 * 5. No cross-session message delivery
 * 
 * Validates: Requirements 5.4
 */
describe('Property 16: Result Routing Correctness', () => {
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

  test('sends results only to the correct connectionId for each call session', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            callSessionId: fc.uuid(),
            connectionId: fc.uuid(),
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
          { minLength: 2, maxLength: 10 }
        ),
        async (callSessions) => {
          // Ensure all connectionIds are unique to test proper routing
          const uniqueConnectionIds = new Set(callSessions.map(s => s.connectionId));
          fc.pre(uniqueConnectionIds.size === callSessions.length);

          // Reset mock for this property test run
          apiGatewayMock.reset();

          // Track which connectionIds received messages
          const messagesReceived = new Map<string, any[]>();

          // Mock API Gateway to track messages sent to each connection
          apiGatewayMock.on(PostToConnectionCommand).callsFake((input: any) => {
            const connectionId = input.ConnectionId;
            const data = JSON.parse(Buffer.from(input.Data).toString('utf8'));
            
            if (!messagesReceived.has(connectionId)) {
              messagesReceived.set(connectionId, []);
            }
            messagesReceived.get(connectionId)!.push(data);
            
            return Promise.resolve({});
          });

          const wsClient = new WebSocketClient('https://test.execute-api.us-east-1.amazonaws.com/prod', 'test-table');

          // Send fraud alerts for each call session
          await Promise.all(
            callSessions.map(session =>
              wsClient.sendFraudAlert(session.connectionId, session.fraudAlert, session.callSessionId)
            )
          );

          // Property: Each connectionId should receive exactly one message
          expect(messagesReceived.size).toBe(callSessions.length);

          // Property: Each connectionId should receive only its own fraud alert
          callSessions.forEach(session => {
            const messages = messagesReceived.get(session.connectionId);
            expect(messages).toBeDefined();
            expect(messages!.length).toBe(1);
            expect(messages![0]).toEqual(session.fraudAlert);
          });

          // Property: No connectionId should receive messages for other sessions
          callSessions.forEach(session => {
            const otherSessions = callSessions.filter(s => s.connectionId !== session.connectionId);
            otherSessions.forEach(otherSession => {
              const messages = messagesReceived.get(session.connectionId);
              expect(messages).not.toContainEqual(otherSession.fraudAlert);
            });
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  test('no cross-session message delivery with concurrent sessions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sessions: fc.array(
            fc.record({
              callSessionId: fc.uuid(),
              connectionId: fc.uuid(),
            }),
            { minLength: 3, maxLength: 8 }
          ),
          fraudAlert: fc.record({
            type: fc.constant('fraud_analysis'),
            callSessionId: fc.uuid(),
            timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
            riskScore: fc.integer({ min: 0, max: 100 }),
            threatLevel: fc.constantFrom('SAFE', 'CAUTION', 'DANGER'),
            fraudIndicators: fc.array(
              fc.record({
                type: fc.constantFrom('URGENCY', 'PAYMENT_REQUEST', 'IMPERSONATION', 'THREAT'),
                description: fc.string({ minLength: 10, maxLength: 100 }),
              }),
              { minLength: 0, maxLength: 3 }
            ),
            reasoning: fc.string({ minLength: 20, maxLength: 200 }),
          }),
        }),
        async ({ sessions, fraudAlert }) => {
          // Ensure all connectionIds are unique
          const uniqueConnectionIds = new Set(sessions.map(s => s.connectionId));
          fc.pre(uniqueConnectionIds.size === sessions.length);

          // Reset mock for this property test run
          apiGatewayMock.reset();

          // Track which connectionIds were called
          const connectionsCalled = new Set<string>();

          // Mock API Gateway to track which connections received messages
          apiGatewayMock.on(PostToConnectionCommand).callsFake((input: any) => {
            connectionsCalled.add(input.ConnectionId);
            return Promise.resolve({});
          });

          const wsClient = new WebSocketClient('https://test.execute-api.us-east-1.amazonaws.com/prod', 'test-table');

          // Send the same fraud alert to each session's connection
          await Promise.all(
            sessions.map(session =>
              wsClient.sendFraudAlert(session.connectionId, fraudAlert, session.callSessionId)
            )
          );

          // Property: All and only the specified connectionIds should receive messages
          expect(connectionsCalled.size).toBe(sessions.length);
          sessions.forEach(session => {
            expect(connectionsCalled.has(session.connectionId)).toBe(true);
          });

          // Property: No other connectionIds should be called
          expect(apiGatewayMock.calls()).toHaveLength(sessions.length);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('routes different fraud alerts to different connections correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            callSessionId: fc.uuid(),
            connectionId: fc.uuid(),
            riskScore: fc.integer({ min: 0, max: 100 }),
            threatLevel: fc.constantFrom('SAFE', 'CAUTION', 'DANGER'),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (sessions) => {
          // Ensure all connectionIds are unique
          const uniqueConnectionIds = new Set(sessions.map(s => s.connectionId));
          fc.pre(uniqueConnectionIds.size === sessions.length);

          // Reset mock for this property test run
          apiGatewayMock.reset();

          // Track messages sent to each connection
          const messagesByConnection = new Map<string, any>();

          // Mock API Gateway to capture messages
          apiGatewayMock.on(PostToConnectionCommand).callsFake((input: any) => {
            const connectionId = input.ConnectionId;
            const data = JSON.parse(Buffer.from(input.Data).toString('utf8'));
            messagesByConnection.set(connectionId, data);
            return Promise.resolve({});
          });

          const wsClient = new WebSocketClient('https://test.execute-api.us-east-1.amazonaws.com/prod', 'test-table');

          // Send different fraud alerts to each session
          await Promise.all(
            sessions.map(session => {
              const fraudAlert = {
                type: 'fraud_analysis',
                callSessionId: session.callSessionId,
                timestamp: Date.now(),
                riskScore: session.riskScore,
                threatLevel: session.threatLevel,
                fraudIndicators: [],
                reasoning: `Analysis for session ${session.callSessionId}`,
              };
              return wsClient.sendFraudAlert(session.connectionId, fraudAlert, session.callSessionId);
            })
          );

          // Property: Each connection receives the correct fraud alert
          sessions.forEach(session => {
            const message = messagesByConnection.get(session.connectionId);
            expect(message).toBeDefined();
            expect(message.callSessionId).toBe(session.callSessionId);
            expect(message.riskScore).toBe(session.riskScore);
            expect(message.threatLevel).toBe(session.threatLevel);
          });

          // Property: No connection receives another session's alert
          sessions.forEach(session => {
            const message = messagesByConnection.get(session.connectionId);
            const otherSessions = sessions.filter(s => s.callSessionId !== session.callSessionId);
            otherSessions.forEach(otherSession => {
              expect(message.callSessionId).not.toBe(otherSession.callSessionId);
            });
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  test('maintains routing correctness when some connections fail', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sessions: fc.array(
            fc.record({
              callSessionId: fc.uuid(),
              connectionId: fc.uuid(),
              shouldFail: fc.boolean(),
            }),
            { minLength: 3, maxLength: 8 }
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
        async ({ sessions, fraudAlert }) => {
          // Ensure all connectionIds are unique
          const uniqueConnectionIds = new Set(sessions.map(s => s.connectionId));
          fc.pre(uniqueConnectionIds.size === sessions.length);

          // Reset mock for this property test run
          apiGatewayMock.reset();

          // Track successful deliveries
          const successfulDeliveries = new Set<string>();

          // Mock API Gateway to fail some connections
          apiGatewayMock.on(PostToConnectionCommand).callsFake((input: any) => {
            const session = sessions.find(s => s.connectionId === input.ConnectionId);
            if (session?.shouldFail) {
              throw new Error('Connection failed');
            }
            successfulDeliveries.add(input.ConnectionId);
            return Promise.resolve({});
          });

          const wsClient = new WebSocketClient('https://test.execute-api.us-east-1.amazonaws.com/prod', 'test-table');

          // Send fraud alerts to all sessions
          const results = await Promise.all(
            sessions.map(session =>
              wsClient.sendFraudAlert(session.connectionId, fraudAlert, session.callSessionId)
            )
          );

          // Property: Each session was attempted exactly once
          expect(apiGatewayMock.calls()).toHaveLength(sessions.length);

          // Property: Only non-failing connections received messages
          sessions.forEach((session, index) => {
            if (session.shouldFail) {
              expect(results[index]).toBe(false);
              expect(successfulDeliveries.has(session.connectionId)).toBe(false);
            } else {
              expect(results[index]).toBe(true);
              expect(successfulDeliveries.has(session.connectionId)).toBe(true);
            }
          });

          // Property: Failed connections don't affect other connections
          const successfulSessions = sessions.filter(s => !s.shouldFail);
          expect(successfulDeliveries.size).toBe(successfulSessions.length);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('correctly routes messages when connectionIds are similar', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          baseConnectionId: fc.uuid(),
          suffixes: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 3, maxLength: 6 }),
        }),
        async ({ baseConnectionId, suffixes }) => {
          // Create sessions with similar but distinct connectionIds
          const sessions = suffixes.map(suffix => ({
            callSessionId: fc.sample(fc.uuid(), 1)[0],
            connectionId: `${baseConnectionId}-${suffix}`,
            fraudAlert: {
              type: 'fraud_analysis',
              callSessionId: fc.sample(fc.uuid(), 1)[0],
              timestamp: Date.now(),
              riskScore: fc.sample(fc.integer({ min: 0, max: 100 }), 1)[0],
              threatLevel: fc.sample(fc.constantFrom('SAFE', 'CAUTION', 'DANGER'), 1)[0],
              fraudIndicators: [],
              reasoning: `Alert for connection ${suffix}`,
            },
          }));

          // Ensure suffixes are unique
          const uniqueSuffixes = new Set(suffixes);
          fc.pre(uniqueSuffixes.size === suffixes.length);

          // Reset mock for this property test run
          apiGatewayMock.reset();

          // Track which connectionIds received messages
          const messagesReceived = new Map<string, any>();

          // Mock API Gateway to track messages
          apiGatewayMock.on(PostToConnectionCommand).callsFake((input: any) => {
            const connectionId = input.ConnectionId;
            const data = JSON.parse(Buffer.from(input.Data).toString('utf8'));
            messagesReceived.set(connectionId, data);
            return Promise.resolve({});
          });

          const wsClient = new WebSocketClient('https://test.execute-api.us-east-1.amazonaws.com/prod', 'test-table');

          // Send fraud alerts to each session
          await Promise.all(
            sessions.map(session =>
              wsClient.sendFraudAlert(session.connectionId, session.fraudAlert, session.callSessionId)
            )
          );

          // Property: Each similar connectionId receives exactly its own message
          sessions.forEach(session => {
            const message = messagesReceived.get(session.connectionId);
            expect(message).toBeDefined();
            expect(message).toEqual(session.fraudAlert);
          });

          // Property: No connectionId receives another's message
          expect(messagesReceived.size).toBe(sessions.length);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('sequential message delivery maintains routing correctness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          callSessionId: fc.uuid(),
          connectionId: fc.uuid(),
          messageCount: fc.integer({ min: 2, max: 10 }),
        }),
        async ({ callSessionId, connectionId, messageCount }) => {
          // Reset mock for this property test run
          apiGatewayMock.reset();

          // Track all messages sent to the connection
          const messagesReceived: any[] = [];

          // Mock API Gateway to capture all messages
          apiGatewayMock.on(PostToConnectionCommand).callsFake((input: any) => {
            expect(input.ConnectionId).toBe(connectionId);
            const data = JSON.parse(Buffer.from(input.Data).toString('utf8'));
            messagesReceived.push(data);
            return Promise.resolve({});
          });

          const wsClient = new WebSocketClient('https://test.execute-api.us-east-1.amazonaws.com/prod', 'test-table');

          // Send multiple fraud alerts sequentially to the same session
          const sentAlerts: any[] = [];
          for (let i = 0; i < messageCount; i++) {
            const fraudAlert = {
              type: 'fraud_analysis',
              callSessionId,
              timestamp: Date.now() + i,
              riskScore: fc.sample(fc.integer({ min: 0, max: 100 }), 1)[0],
              threatLevel: fc.sample(fc.constantFrom('SAFE', 'CAUTION', 'DANGER'), 1)[0],
              fraudIndicators: [],
              reasoning: `Analysis ${i + 1}`,
            };
            sentAlerts.push(fraudAlert);
            await wsClient.sendFraudAlert(connectionId, fraudAlert, callSessionId);
          }

          // Property: All messages were sent to the correct connectionId
          expect(apiGatewayMock.calls()).toHaveLength(messageCount);
          expect(messagesReceived.length).toBe(messageCount);

          // Property: Messages were received in order
          messagesReceived.forEach((message, index) => {
            expect(message).toEqual(sentAlerts[index]);
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  test('routing correctness with empty fraud indicators', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            callSessionId: fc.uuid(),
            connectionId: fc.uuid(),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (sessions) => {
          // Ensure all connectionIds are unique
          const uniqueConnectionIds = new Set(sessions.map(s => s.connectionId));
          fc.pre(uniqueConnectionIds.size === sessions.length);

          // Reset mock for this property test run
          apiGatewayMock.reset();

          // Track messages by connection
          const messagesByConnection = new Map<string, any>();

          // Mock API Gateway
          apiGatewayMock.on(PostToConnectionCommand).callsFake((input: any) => {
            const connectionId = input.ConnectionId;
            const data = JSON.parse(Buffer.from(input.Data).toString('utf8'));
            messagesByConnection.set(connectionId, data);
            return Promise.resolve({});
          });

          const wsClient = new WebSocketClient('https://test.execute-api.us-east-1.amazonaws.com/prod', 'test-table');

          // Send fraud alerts with empty indicators
          await Promise.all(
            sessions.map(session => {
              const fraudAlert = {
                type: 'fraud_analysis',
                callSessionId: session.callSessionId,
                timestamp: Date.now(),
                riskScore: 0,
                threatLevel: 'SAFE',
                fraudIndicators: [], // Empty indicators
                reasoning: 'No fraud detected',
              };
              return wsClient.sendFraudAlert(session.connectionId, fraudAlert, session.callSessionId);
            })
          );

          // Property: Each connection receives its own message even with empty indicators
          sessions.forEach(session => {
            const message = messagesByConnection.get(session.connectionId);
            expect(message).toBeDefined();
            expect(message.callSessionId).toBe(session.callSessionId);
            expect(message.fraudIndicators).toEqual([]);
          });

          // Property: Correct number of messages sent
          expect(messagesByConnection.size).toBe(sessions.length);
        }
      ),
      { numRuns: 20 }
    );
  });
});
