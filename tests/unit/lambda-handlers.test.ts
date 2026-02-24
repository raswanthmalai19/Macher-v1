/**
 * Unit tests for Lambda handler functions
 * 
 * Tests the Connect Handler and Disconnect Handler Lambda functions
 * to ensure they properly handle WebSocket connection lifecycle events.
 */

import { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

// Helper function to create test event
function createDisconnectEvent(connectionId: string): APIGatewayProxyWebsocketEventV2 {
  return {
    requestContext: {
      routeKey: '$disconnect',
      connectionId,
      eventType: 'DISCONNECT',
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
    isBase64Encoded: false,
  };
}

// Helper function to create audio processing event
function createAudioEvent(connectionId: string, audioData?: string): APIGatewayProxyWebsocketEventV2 {
  return {
    requestContext: {
      routeKey: 'audio',
      connectionId,
      eventType: 'MESSAGE',
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
    body: audioData || Buffer.from('test audio data').toString('base64'),
    isBase64Encoded: false,
  };
}

describe('Lambda Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env.CONNECTIONS_TABLE_NAME = 'test-connections-table';
    process.env.AWS_REGION = 'us-east-1';
  });

  describe('Disconnect Handler', () => {
    let handler: any;
    let mockSend: jest.Mock;

    beforeEach(async () => {
      // Mock DynamoDB DocumentClient
      mockSend = jest.fn();
      
      jest.mock('@aws-sdk/client-dynamodb', () => ({
        DynamoDBClient: jest.fn().mockImplementation(() => ({})),
      }));
      
      jest.mock('@aws-sdk/lib-dynamodb', () => ({
        DynamoDBDocumentClient: {
          from: jest.fn(() => ({
            send: mockSend,
          })),
        },
        UpdateCommand: jest.fn((params) => ({ input: params })),
      }));
      
      jest.mock('aws-xray-sdk-core', () => ({
        captureAWSv3Client: jest.fn((client) => client),
      }));

      // Import handler after mocks are set up
      handler = (await import('../../lambda/disconnect/index')).handler;
    });

    it('should update connection status to disconnected', async () => {
      mockSend.mockResolvedValue({});

      const event = createDisconnectEvent('test-connection-123');
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(mockSend).toHaveBeenCalledTimes(1);
      
      // Verify UpdateCommand was called with correct parameters
      const updateCommand = mockSend.mock.calls[0][0];
      expect(updateCommand.input.TableName).toBe('test-connections-table');
      expect(updateCommand.input.Key.connectionId).toBe('test-connection-123');
      expect(updateCommand.input.UpdateExpression).toContain('status');
      expect(updateCommand.input.UpdateExpression).toContain('disconnectedAt');
      expect(updateCommand.input.ExpressionAttributeValues[':status']).toBe('disconnected');
    });

    it('should return 400 if connectionId is missing', async () => {
      const event: any = {
        requestContext: {
          routeKey: '$disconnect',
          eventType: 'DISCONNECT',
        },
      };

      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(response.body).toBe('Invalid disconnection request');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should return 200 for idempotent behavior when connection not found', async () => {
      const error = new Error('Connection not found');
      error.name = 'ResourceNotFoundException';
      mockSend.mockRejectedValue(error);

      const event = createDisconnectEvent('non-existent-connection');
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should return 500 on DynamoDB error', async () => {
      const error = new Error('DynamoDB error');
      error.name = 'InternalServerError';
      mockSend.mockRejectedValue(error);

      const event = createDisconnectEvent('test-connection-123');
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(response.body).toBe('Internal server error');
    });

    it('should log structured JSON with required fields', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockSend.mockResolvedValue({});

      const event = createDisconnectEvent('test-connection-123');
      await handler(event);

      // Verify structured logging
      expect(consoleSpy).toHaveBeenCalled();
      const logCalls = consoleSpy.mock.calls;
      
      logCalls.forEach((call) => {
        const logEntry = JSON.parse(call[0]);
        expect(logEntry).toHaveProperty('timestamp');
        expect(logEntry).toHaveProperty('level');
        expect(logEntry).toHaveProperty('message');
        expect(['INFO', 'WARN', 'ERROR']).toContain(logEntry.level);
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Audio Processor', () => {
    let handler: any;
    let mockDynamoDBSend: jest.Mock;
    let mockSNSSend: jest.Mock;
    let mockEventBridgeSend: jest.Mock;
    let mockSecretsManagerSend: jest.Mock;
    let mockSSMSend: jest.Mock;

    beforeEach(async () => {
      // Mock all AWS SDK clients
      mockDynamoDBSend = jest.fn();
      mockSNSSend = jest.fn();
      mockEventBridgeSend = jest.fn();
      mockSecretsManagerSend = jest.fn();
      mockSSMSend = jest.fn();
      
      jest.mock('@aws-sdk/client-dynamodb', () => ({
        DynamoDBClient: jest.fn().mockImplementation(() => ({})),
      }));
      
      jest.mock('@aws-sdk/lib-dynamodb', () => ({
        DynamoDBDocumentClient: {
          from: jest.fn(() => ({
            send: mockDynamoDBSend,
          })),
        },
        PutCommand: jest.fn((params) => ({ input: params })),
      }));

      jest.mock('@aws-sdk/client-sns', () => ({
        SNSClient: jest.fn().mockImplementation(() => ({})),
        PublishCommand: jest.fn((params) => ({ input: params })),
      }));

      jest.mock('@aws-sdk/client-eventbridge', () => ({
        EventBridgeClient: jest.fn().mockImplementation(() => ({})),
        PutEventsCommand: jest.fn((params) => ({ input: params })),
      }));

      jest.mock('@aws-sdk/client-secrets-manager', () => ({
        SecretsManagerClient: jest.fn().mockImplementation(() => ({})),
        GetSecretValueCommand: jest.fn((params) => ({ input: params })),
      }));

      jest.mock('@aws-sdk/client-ssm', () => ({
        SSMClient: jest.fn().mockImplementation(() => ({})),
        GetParameterCommand: jest.fn((params) => ({ input: params })),
      }));
      
      jest.mock('aws-xray-sdk-core', () => ({
        captureAWSv3Client: jest.fn((client) => client),
      }));

      // Set environment variables
      process.env.METADATA_TABLE_NAME = 'test-metadata-table';
      process.env.SNS_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:test-topic';
      process.env.EVENT_BUS_NAME = 'test-event-bus';
      process.env.ENVIRONMENT = 'dev';

      // Import handler after mocks are set up
      handler = (await import('../../lambda/audio-processor/index')).handler;
    });

    it('should process audio data and store metadata', async () => {
      mockDynamoDBSend.mockResolvedValue({});
      mockSNSSend.mockResolvedValue({});
      mockEventBridgeSend.mockResolvedValue({});
      mockSecretsManagerSend.mockResolvedValue({
        SecretString: JSON.stringify({ mlServiceApiKey: 'test-key' }),
      });
      mockSSMSend.mockResolvedValue({
        Parameter: { Value: '70' },
      });

      const event = createAudioEvent('test-connection-123');
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(mockDynamoDBSend).toHaveBeenCalled();
      
      const body = JSON.parse(response.body!);
      expect(body).toHaveProperty('sessionId');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('fraudScore');
      expect(body).toHaveProperty('fraudDetected');
    });

    it('should decode base64 audio data correctly', async () => {
      mockDynamoDBSend.mockResolvedValue({});
      mockEventBridgeSend.mockResolvedValue({});
      mockSSMSend.mockResolvedValue({
        Parameter: { Value: '70' },
      });

      const testAudio = 'test audio content';
      const base64Audio = Buffer.from(testAudio).toString('base64');
      const event = createAudioEvent('test-connection-123', base64Audio);
      
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(mockDynamoDBSend).toHaveBeenCalled();
    });

    it('should return 500 if audio data is missing', async () => {
      const event = createAudioEvent('test-connection-123', undefined);
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body!);
      expect(body.error).toBe(true);
      expect(body.code).toBe('ERROR_PROCESSING_FAILED');
    });

    it('should return 500 if audio data is invalid base64', async () => {
      const event = createAudioEvent('test-connection-123', 'invalid-base64!!!');
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body!);
      expect(body.error).toBe(true);
    });

    it('should store metadata with TTL for 30 days', async () => {
      mockDynamoDBSend.mockResolvedValue({});
      mockEventBridgeSend.mockResolvedValue({});
      mockSSMSend.mockResolvedValue({
        Parameter: { Value: '70' },
      });

      const event = createAudioEvent('test-connection-123');
      await handler(event);

      expect(mockDynamoDBSend).toHaveBeenCalled();
      const putCommand = mockDynamoDBSend.mock.calls[0][0];
      expect(putCommand.input.Item).toHaveProperty('ttl');
      
      // TTL should be approximately 30 days from now
      const now = Math.floor(Date.now() / 1000);
      const thirtyDays = 30 * 24 * 60 * 60;
      expect(putCommand.input.Item.ttl).toBeGreaterThan(now + thirtyDays - 10);
      expect(putCommand.input.Item.ttl).toBeLessThan(now + thirtyDays + 10);
    });

    it('should NOT store audio data in DynamoDB (privacy requirement)', async () => {
      mockDynamoDBSend.mockResolvedValue({});
      mockEventBridgeSend.mockResolvedValue({});
      mockSSMSend.mockResolvedValue({
        Parameter: { Value: '70' },
      });

      const event = createAudioEvent('test-connection-123');
      await handler(event);

      expect(mockDynamoDBSend).toHaveBeenCalled();
      const putCommand = mockDynamoDBSend.mock.calls[0][0];
      
      // Verify no audio data fields in DynamoDB item
      expect(putCommand.input.Item).not.toHaveProperty('audioData');
      expect(putCommand.input.Item).not.toHaveProperty('audioBuffer');
      expect(putCommand.input.Item).not.toHaveProperty('rawAudio');
      
      // Only metadata should be stored
      expect(putCommand.input.Item).toHaveProperty('sessionId');
      expect(putCommand.input.Item).toHaveProperty('fraudScore');
      expect(putCommand.input.Item).toHaveProperty('processingDuration');
      expect(putCommand.input.Item).toHaveProperty('audioChunkSize');
    });

    it('should log structured JSON with sessionId and connectionId', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockDynamoDBSend.mockResolvedValue({});
      mockEventBridgeSend.mockResolvedValue({});
      mockSSMSend.mockResolvedValue({
        Parameter: { Value: '70' },
      });

      const event = createAudioEvent('test-connection-123');
      await handler(event);

      expect(consoleSpy).toHaveBeenCalled();
      const logCalls = consoleSpy.mock.calls;
      
      // Verify structured logging format
      logCalls.forEach((call) => {
        const logEntry = JSON.parse(call[0]);
        expect(logEntry).toHaveProperty('timestamp');
        expect(logEntry).toHaveProperty('level');
        expect(logEntry).toHaveProperty('message');
        expect(['INFO', 'WARN', 'ERROR']).toContain(logEntry.level);
      });

      // Verify at least one log has sessionId and connectionId
      const logsWithContext = logCalls
        .map(call => JSON.parse(call[0]))
        .filter(log => log.sessionId && log.connectionId);
      expect(logsWithContext.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });

    it('should handle DynamoDB errors gracefully', async () => {
      mockDynamoDBSend.mockRejectedValue(new Error('DynamoDB error'));
      mockSSMSend.mockResolvedValue({
        Parameter: { Value: '70' },
      });

      const event = createAudioEvent('test-connection-123');
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body!);
      expect(body.error).toBe(true);
      expect(body.code).toBe('ERROR_PROCESSING_FAILED');
    });

    it('should continue processing if SNS publish fails', async () => {
      mockDynamoDBSend.mockResolvedValue({});
      mockSNSSend.mockRejectedValue(new Error('SNS error'));
      mockEventBridgeSend.mockResolvedValue({});
      mockSSMSend.mockResolvedValue({
        Parameter: { Value: '0' }, // Low threshold to trigger fraud detection
      });

      const event = createAudioEvent('test-connection-123');
      const response = await handler(event);

      // Should still return 200 even if SNS fails
      expect(response.statusCode).toBe(200);
      expect(mockDynamoDBSend).toHaveBeenCalled();
    });

    it('should continue processing if EventBridge publish fails', async () => {
      mockDynamoDBSend.mockResolvedValue({});
      mockEventBridgeSend.mockRejectedValue(new Error('EventBridge error'));
      mockSSMSend.mockResolvedValue({
        Parameter: { Value: '70' },
      });

      const event = createAudioEvent('test-connection-123');
      const response = await handler(event);

      // Should still return 200 even if EventBridge fails
      expect(response.statusCode).toBe(200);
      expect(mockDynamoDBSend).toHaveBeenCalled();
    });

    it('should use default configuration if Parameter Store fails', async () => {
      mockDynamoDBSend.mockResolvedValue({});
      mockEventBridgeSend.mockResolvedValue({});
      mockSSMSend.mockRejectedValue(new Error('Parameter Store error'));

      const event = createAudioEvent('test-connection-123');
      const response = await handler(event);

      // Should still process with default config
      expect(response.statusCode).toBe(200);
      expect(mockDynamoDBSend).toHaveBeenCalled();
    });

    it('should use default secrets if Secrets Manager fails', async () => {
      mockDynamoDBSend.mockResolvedValue({});
      mockEventBridgeSend.mockResolvedValue({});
      mockSecretsManagerSend.mockRejectedValue(new Error('Secrets Manager error'));
      mockSSMSend.mockResolvedValue({
        Parameter: { Value: '70' },
      });

      const event = createAudioEvent('test-connection-123');
      const response = await handler(event);

      // Should still process with default secrets
      expect(response.statusCode).toBe(200);
      expect(mockDynamoDBSend).toHaveBeenCalled();
    });
  });
});
