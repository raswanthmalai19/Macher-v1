import { WebSocketClient } from '../websocket-client';
import { ApiGatewayManagementApiClient, PostToConnectionCommand, GoneException } from '@aws-sdk/client-apigatewaymanagementapi';
import { mockClient } from 'aws-sdk-client-mock';

// Mock aws-xray-sdk-core to avoid X-Ray initialization in tests
jest.mock('aws-xray-sdk-core', () => ({
  captureAWSv3Client: jest.fn((client) => client),
}));

// Create mock for API Gateway Management API client
const apiGatewayMock = mockClient(ApiGatewayManagementApiClient);

describe('WebSocketClient', () => {
  let client: WebSocketClient;
  const mockEndpoint = 'https://test123.execute-api.us-east-1.amazonaws.com/prod';
  const mockConnectionTableName = 'test-connections-table';
  const mockConnectionId = 'test-connection-123';
  const mockCallSessionId = 'session-456';

  beforeEach(() => {
    // Reset all mocks before each test
    apiGatewayMock.reset();
    jest.clearAllMocks();

    // Suppress console.log during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});

    // Initialize client
    client = new WebSocketClient(mockEndpoint, mockConnectionTableName);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize WebSocket client with endpoint', () => {
      expect(client).toBeDefined();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('WebSocket client initialized')
      );
    });
  });

  describe('sendMessage', () => {
    describe('Successful message delivery', () => {
      it('should send message successfully and return true', async () => {
        // Mock successful API call
        apiGatewayMock.on(PostToConnectionCommand).resolves({});

        const message = { type: 'test', data: 'hello' };
        const result = await client.sendMessage(mockConnectionId, message, mockCallSessionId);

        expect(result).toBe(true);
        expect(apiGatewayMock.calls()).toHaveLength(1);
      });

      it('should serialize message to JSON', async () => {
        apiGatewayMock.on(PostToConnectionCommand).resolves({});

        const message = { type: 'fraud_alert', threatLevel: 'high' };
        await client.sendMessage(mockConnectionId, message, mockCallSessionId);

        const call = apiGatewayMock.call(0);
        const commandInput = call.args[0].input as any;

        expect(commandInput.ConnectionId).toBe(mockConnectionId);
        expect(commandInput.Data).toBeDefined();

        // Verify JSON serialization
        const sentData = Buffer.from(commandInput.Data as Uint8Array).toString('utf8');
        expect(JSON.parse(sentData)).toEqual(message);
      });

      it('should log message size in bytes', async () => {
        apiGatewayMock.on(PostToConnectionCommand).resolves({});

        const message = { type: 'test', data: 'x'.repeat(100) };
        await client.sendMessage(mockConnectionId, message, mockCallSessionId);

        const logCalls = (console.log as jest.Mock).mock.calls;
        const sendingLog = logCalls.find(call => 
          call[0].includes('Sending message to mobile client')
        );

        expect(sendingLog).toBeDefined();
        const logEntry = JSON.parse(sendingLog[0]);
        expect(logEntry.messageSize).toBeGreaterThan(0);
      });

      it('should log latency metrics on success', async () => {
        apiGatewayMock.on(PostToConnectionCommand).resolves({});

        await client.sendMessage(mockConnectionId, { type: 'test' }, mockCallSessionId);

        const logCalls = (console.log as jest.Mock).mock.calls;
        const successLog = logCalls.find(call => 
          call[0].includes('Message sent successfully')
        );

        expect(successLog).toBeDefined();
        const logEntry = JSON.parse(successLog[0]);
        expect(logEntry.duration).toBeDefined();
        expect(logEntry.duration).toBeGreaterThanOrEqual(0);
      });

      it('should include callSessionId and connectionId in logs', async () => {
        apiGatewayMock.on(PostToConnectionCommand).resolves({});

        await client.sendMessage(mockConnectionId, { type: 'test' }, mockCallSessionId);

        const logCalls = (console.log as jest.Mock).mock.calls;
        const sendingLog = logCalls.find(call => 
          call[0].includes('Sending message to mobile client')
        );

        const logEntry = JSON.parse(sendingLog[0]);
        expect(logEntry.callSessionId).toBe(mockCallSessionId);
        expect(logEntry.connectionId).toBe(mockConnectionId);
      });
    });

    describe('Disconnected client handling (GoneException)', () => {
      it('should handle GoneException gracefully and return false', async () => {
        // Mock GoneException (client disconnected)
        apiGatewayMock.on(PostToConnectionCommand).rejects(
          new GoneException({ message: 'Connection is gone', $metadata: {} })
        );

        const result = await client.sendMessage(mockConnectionId, { type: 'test' }, mockCallSessionId);

        expect(result).toBe(false);
      });

      it('should log warning for disconnected client', async () => {
        apiGatewayMock.on(PostToConnectionCommand).rejects(
          new GoneException({ message: 'Connection is gone', $metadata: {} })
        );

        await client.sendMessage(mockConnectionId, { type: 'test' }, mockCallSessionId);

        const logCalls = (console.log as jest.Mock).mock.calls;
        const warnLog = logCalls.find(call => 
          call[0].includes('Client disconnected')
        );

        expect(warnLog).toBeDefined();
        const logEntry = JSON.parse(warnLog[0]);
        expect(logEntry.level).toBe('WARN');
        expect(logEntry.message).toBe('Client disconnected, discarding message');
      });

      it('should not throw error on GoneException', async () => {
        apiGatewayMock.on(PostToConnectionCommand).rejects(
          new GoneException({ message: 'Connection is gone', $metadata: {} })
        );

        await expect(
          client.sendMessage(mockConnectionId, { type: 'test' }, mockCallSessionId)
        ).resolves.toBe(false);
      });

      it('should log latency even for disconnected clients', async () => {
        apiGatewayMock.on(PostToConnectionCommand).rejects(
          new GoneException({ message: 'Connection is gone', $metadata: {} })
        );

        await client.sendMessage(mockConnectionId, { type: 'test' }, mockCallSessionId);

        const logCalls = (console.log as jest.Mock).mock.calls;
        const warnLog = logCalls.find(call => 
          call[0].includes('Client disconnected')
        );

        const logEntry = JSON.parse(warnLog[0]);
        expect(logEntry.duration).toBeDefined();
        expect(logEntry.duration).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Other API Gateway errors', () => {
      it('should handle throttling errors and return false', async () => {
        const throttleError = new Error('TooManyRequestsException');
        throttleError.name = 'TooManyRequestsException';
        apiGatewayMock.on(PostToConnectionCommand).rejects(throttleError);

        const result = await client.sendMessage(mockConnectionId, { type: 'test' }, mockCallSessionId);

        expect(result).toBe(false);
      });

      it('should handle service unavailable errors and return false', async () => {
        const serviceError = new Error('ServiceUnavailableException');
        serviceError.name = 'ServiceUnavailableException';
        apiGatewayMock.on(PostToConnectionCommand).rejects(serviceError);

        const result = await client.sendMessage(mockConnectionId, { type: 'test' }, mockCallSessionId);

        expect(result).toBe(false);
      });

      it('should log error details for non-GoneException errors', async () => {
        const testError = new Error('Test error message');
        testError.name = 'TestError';
        apiGatewayMock.on(PostToConnectionCommand).rejects(testError);

        await client.sendMessage(mockConnectionId, { type: 'test' }, mockCallSessionId);

        const logCalls = (console.log as jest.Mock).mock.calls;
        const errorLog = logCalls.find(call => 
          call[0].includes('Failed to send message to client')
        );

        expect(errorLog).toBeDefined();
        const logEntry = JSON.parse(errorLog[0]);
        expect(logEntry.level).toBe('ERROR');
        expect(logEntry.error.name).toBe('TestError');
        expect(logEntry.error.message).toBe('Test error message');
      });

      it('should include error stack trace in logs', async () => {
        const testError = new Error('Test error');
        apiGatewayMock.on(PostToConnectionCommand).rejects(testError);

        await client.sendMessage(mockConnectionId, { type: 'test' }, mockCallSessionId);

        const logCalls = (console.log as jest.Mock).mock.calls;
        const errorLog = logCalls.find(call => 
          call[0].includes('Failed to send message to client')
        );

        const logEntry = JSON.parse(errorLog[0]);
        expect(logEntry.error.stack).toBeDefined();
      });

      it('should not throw error on API Gateway failures', async () => {
        apiGatewayMock.on(PostToConnectionCommand).rejects(new Error('API Gateway error'));

        await expect(
          client.sendMessage(mockConnectionId, { type: 'test' }, mockCallSessionId)
        ).resolves.toBe(false);
      });
    });

    describe('Message serialization', () => {
      it('should handle complex nested objects', async () => {
        apiGatewayMock.on(PostToConnectionCommand).resolves({});

        const complexMessage = {
          type: 'fraud_alert',
          data: {
            nested: {
              deeply: {
                value: 'test'
              }
            },
            array: [1, 2, 3]
          }
        };

        await client.sendMessage(mockConnectionId, complexMessage, mockCallSessionId);

        const call = apiGatewayMock.call(0);
        const sentData = Buffer.from((call.args[0].input as any).Data as Uint8Array).toString('utf8');
        expect(JSON.parse(sentData)).toEqual(complexMessage);
      });

      it('should handle messages with special characters', async () => {
        apiGatewayMock.on(PostToConnectionCommand).resolves({});

        const message = {
          type: 'test',
          text: 'Special chars: "quotes", \'apostrophes\', \n newlines, \t tabs'
        };

        await client.sendMessage(mockConnectionId, message, mockCallSessionId);

        const call = apiGatewayMock.call(0);
        const sentData = Buffer.from((call.args[0].input as any).Data as Uint8Array).toString('utf8');
        expect(JSON.parse(sentData)).toEqual(message);
      });

      it('should handle empty objects', async () => {
        apiGatewayMock.on(PostToConnectionCommand).resolves({});

        await client.sendMessage(mockConnectionId, {}, mockCallSessionId);

        const call = apiGatewayMock.call(0);
        const sentData = Buffer.from((call.args[0].input as any).Data as Uint8Array).toString('utf8');
        expect(JSON.parse(sentData)).toEqual({});
      });
    });

    describe('ConnectionId validation', () => {
      it('should send message with correct connectionId', async () => {
        apiGatewayMock.on(PostToConnectionCommand).resolves({});

        await client.sendMessage(mockConnectionId, { type: 'test' }, mockCallSessionId);

        const call = apiGatewayMock.call(0);
        expect(call.args[0].input.ConnectionId).toBe(mockConnectionId);
      });

      it('should handle different connectionId formats', async () => {
        apiGatewayMock.on(PostToConnectionCommand).resolves({});

        const connectionIds = [
          'abc123',
          'connection-with-dashes',
          'connection_with_underscores',
          'VeryLongConnectionIdWith64CharactersABCDEFGHIJKLMNOPQRSTUVWXYZ123'
        ];

        for (const connId of connectionIds) {
          await client.sendMessage(connId, { type: 'test' }, mockCallSessionId);
        }

        expect(apiGatewayMock.calls()).toHaveLength(connectionIds.length);
      });
    });
  });

  describe('sendFraudAlert', () => {
    it('should send fraud alert successfully', async () => {
      apiGatewayMock.on(PostToConnectionCommand).resolves({});

      const fraudAlert = {
        type: 'fraud_alert',
        threatLevel: 'high',
        confidence: 0.95,
        indicators: ['urgency', 'money_request']
      };

      const result = await client.sendFraudAlert(mockConnectionId, fraudAlert, mockCallSessionId);

      expect(result).toBe(true);
      expect(apiGatewayMock.calls()).toHaveLength(1);
    });

    it('should log fraud alert sending', async () => {
      apiGatewayMock.on(PostToConnectionCommand).resolves({});

      const fraudAlert = { type: 'fraud_alert', threatLevel: 'high' };
      await client.sendFraudAlert(mockConnectionId, fraudAlert, mockCallSessionId);

      const logCalls = (console.log as jest.Mock).mock.calls;
      const alertLog = logCalls.find(call => 
        call[0].includes('Sending fraud alert to mobile client')
      );

      expect(alertLog).toBeDefined();
    });

    it('should route message to correct connectionId', async () => {
      apiGatewayMock.on(PostToConnectionCommand).resolves({});

      const specificConnectionId = 'specific-connection-789';
      await client.sendFraudAlert(specificConnectionId, { type: 'fraud_alert' }, mockCallSessionId);

      const call = apiGatewayMock.call(0);
      expect(call.args[0].input.ConnectionId).toBe(specificConnectionId);
    });

    it('should handle disconnected client during fraud alert', async () => {
      apiGatewayMock.on(PostToConnectionCommand).rejects(
        new GoneException({ message: 'Connection is gone', $metadata: {} })
      );

      const result = await client.sendFraudAlert(mockConnectionId, { type: 'fraud_alert' }, mockCallSessionId);

      expect(result).toBe(false);
    });

    it('should preserve fraud alert structure', async () => {
      apiGatewayMock.on(PostToConnectionCommand).resolves({});

      const fraudAlert = {
        type: 'fraud_alert',
        threatLevel: 'critical',
        confidence: 0.98,
        indicators: ['urgency', 'money_request', 'impersonation'],
        timestamp: Date.now()
      };

      await client.sendFraudAlert(mockConnectionId, fraudAlert, mockCallSessionId);

      const call = apiGatewayMock.call(0);
      const sentData = Buffer.from((call.args[0].input as any).Data as Uint8Array).toString('utf8');
      expect(JSON.parse(sentData)).toEqual(fraudAlert);
    });
  });

  describe('sendErrorMessage', () => {
    it('should send error message successfully', async () => {
      apiGatewayMock.on(PostToConnectionCommand).resolves({});

      const errorMessage = {
        type: 'error',
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        timestamp: Date.now()
      };

      const result = await client.sendErrorMessage(mockConnectionId, errorMessage, mockCallSessionId);

      expect(result).toBe(true);
      expect(apiGatewayMock.calls()).toHaveLength(1);
    });

    it('should log error message sending', async () => {
      apiGatewayMock.on(PostToConnectionCommand).resolves({});

      const errorMessage = { type: 'error', code: 'SERVICE_ERROR' };
      await client.sendErrorMessage(mockConnectionId, errorMessage, mockCallSessionId);

      const logCalls = (console.log as jest.Mock).mock.calls;
      const errorLog = logCalls.find(call => 
        call[0].includes('Sending error message to mobile client')
      );

      expect(errorLog).toBeDefined();
    });

    it('should route error message to correct connectionId', async () => {
      apiGatewayMock.on(PostToConnectionCommand).resolves({});

      const specificConnectionId = 'error-connection-999';
      await client.sendErrorMessage(specificConnectionId, { type: 'error' }, mockCallSessionId);

      const call = apiGatewayMock.call(0);
      expect(call.args[0].input.ConnectionId).toBe(specificConnectionId);
    });

    it('should handle disconnected client during error message', async () => {
      apiGatewayMock.on(PostToConnectionCommand).rejects(
        new GoneException({ message: 'Connection is gone', $metadata: {} })
      );

      const result = await client.sendErrorMessage(mockConnectionId, { type: 'error' }, mockCallSessionId);

      expect(result).toBe(false);
    });

    it('should preserve sanitized error message structure', async () => {
      apiGatewayMock.on(PostToConnectionCommand).resolves({});

      const errorMessage = {
        type: 'error',
        code: 'INTERNAL_ERROR',
        message: 'service function failed',
        timestamp: 1234567890,
        requestId: 'req-123'
      };

      await client.sendErrorMessage(mockConnectionId, errorMessage, mockCallSessionId);

      const call = apiGatewayMock.call(0);
      const sentData = Buffer.from((call.args[0].input as any).Data as Uint8Array).toString('utf8');
      expect(JSON.parse(sentData)).toEqual(errorMessage);
    });

    it('should handle API Gateway errors when sending error messages', async () => {
      apiGatewayMock.on(PostToConnectionCommand).rejects(new Error('API Gateway error'));

      const result = await client.sendErrorMessage(mockConnectionId, { type: 'error' }, mockCallSessionId);

      expect(result).toBe(false);
    });
  });

  describe('Message routing', () => {
    it('should route different message types to same connection', async () => {
      apiGatewayMock.on(PostToConnectionCommand).resolves({});

      await client.sendFraudAlert(mockConnectionId, { type: 'fraud_alert' }, mockCallSessionId);
      await client.sendErrorMessage(mockConnectionId, { type: 'error' }, mockCallSessionId);

      expect(apiGatewayMock.calls()).toHaveLength(2);
      expect(apiGatewayMock.call(0).args[0].input.ConnectionId).toBe(mockConnectionId);
      expect(apiGatewayMock.call(1).args[0].input.ConnectionId).toBe(mockConnectionId);
    });

    it('should route messages to different connections independently', async () => {
      apiGatewayMock.on(PostToConnectionCommand).resolves({});

      const conn1 = 'connection-1';
      const conn2 = 'connection-2';

      await client.sendMessage(conn1, { type: 'test1' }, 'session-1');
      await client.sendMessage(conn2, { type: 'test2' }, 'session-2');

      expect(apiGatewayMock.calls()).toHaveLength(2);
      expect(apiGatewayMock.call(0).args[0].input.ConnectionId).toBe(conn1);
      expect(apiGatewayMock.call(1).args[0].input.ConnectionId).toBe(conn2);
    });

    it('should handle partial failures across multiple connections', async () => {
      // First connection succeeds, second fails
      apiGatewayMock
        .on(PostToConnectionCommand, { ConnectionId: 'conn-success' })
        .resolves({})
        .on(PostToConnectionCommand, { ConnectionId: 'conn-fail' })
        .rejects(new GoneException({ message: 'Gone', $metadata: {} }));

      const result1 = await client.sendMessage('conn-success', { type: 'test' }, 'session-1');
      const result2 = await client.sendMessage('conn-fail', { type: 'test' }, 'session-2');

      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });
  });

  describe('Performance and metrics', () => {
    it('should track message size for small messages', async () => {
      apiGatewayMock.on(PostToConnectionCommand).resolves({});

      const smallMessage = { type: 'test' };
      await client.sendMessage(mockConnectionId, smallMessage, mockCallSessionId);

      const logCalls = (console.log as jest.Mock).mock.calls;
      const sendingLog = logCalls.find(call => 
        call[0].includes('Sending message to mobile client')
      );

      const logEntry = JSON.parse(sendingLog[0]);
      expect(logEntry.messageSize).toBeLessThan(100);
    });

    it('should track message size for large messages', async () => {
      apiGatewayMock.on(PostToConnectionCommand).resolves({});

      const largeMessage = {
        type: 'fraud_alert',
        data: 'x'.repeat(10000)
      };
      await client.sendMessage(mockConnectionId, largeMessage, mockCallSessionId);

      const logCalls = (console.log as jest.Mock).mock.calls;
      const sendingLog = logCalls.find(call => 
        call[0].includes('Sending message to mobile client')
      );

      const logEntry = JSON.parse(sendingLog[0]);
      expect(logEntry.messageSize).toBeGreaterThan(10000);
    });

    it('should measure latency for successful sends', async () => {
      apiGatewayMock.on(PostToConnectionCommand).resolves({});

      await client.sendMessage(mockConnectionId, { type: 'test' }, mockCallSessionId);

      const logCalls = (console.log as jest.Mock).mock.calls;
      const successLog = logCalls.find(call => 
        call[0].includes('Message sent successfully')
      );

      const logEntry = JSON.parse(successLog[0]);
      expect(logEntry.duration).toBeGreaterThanOrEqual(0);
      expect(typeof logEntry.duration).toBe('number');
    });

    it('should measure latency for failed sends', async () => {
      apiGatewayMock.on(PostToConnectionCommand).rejects(new Error('Test error'));

      await client.sendMessage(mockConnectionId, { type: 'test' }, mockCallSessionId);

      const logCalls = (console.log as jest.Mock).mock.calls;
      const errorLog = logCalls.find(call => 
        call[0].includes('Failed to send message to client')
      );

      const logEntry = JSON.parse(errorLog[0]);
      expect(logEntry.duration).toBeGreaterThanOrEqual(0);
      expect(typeof logEntry.duration).toBe('number');
    });
  });
});
