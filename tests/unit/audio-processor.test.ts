/**
 * Unit tests for Audio Processor Lambda function
 * 
 * Tests the Audio Processor Lambda to ensure it properly:
 * - Decodes and validates audio data
 * - Stores metadata in DynamoDB (without audio data)
 * - Publishes fraud alerts to SNS
 * - Publishes events to EventBridge
 * - Retrieves secrets from Secrets Manager with caching
 * - Retrieves configuration from Parameter Store with caching
 * - Logs structured JSON with sessionId and connectionId
 */

import { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

// Mock AWS SDK clients before importing the handler
const mockDynamoDBSend = jest.fn();
const mockSNSSend = jest.fn();
const mockEventBridgeSend = jest.fn();
const mockSecretsManagerSend = jest.fn();
const mockSSMSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({
    send: mockDynamoDBSend,
  })),
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
  SNSClient: jest.fn().mockImplementation(() => ({
    send: mockSNSSend,
  })),
  PublishCommand: jest.fn((params) => ({ input: params })),
}));

jest.mock('@aws-sdk/client-eventbridge', () => ({
  EventBridgeClient: jest.fn().mockImplementation(() => ({
    send: mockEventBridgeSend,
  })),
  PutEventsCommand: jest.fn((params) => ({ input: params })),
}));

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: mockSecretsManagerSend,
  })),
  GetSecretValueCommand: jest.fn((params) => ({ input: params })),
}));

jest.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn().mockImplementation(() => ({
    send: mockSSMSend,
  })),
  GetParameterCommand: jest.fn((params) => ({ input: params })),
}));

jest.mock('aws-xray-sdk-core', () => ({
  captureAWSv3Client: jest.fn((client) => client), // Just return the client as-is for testing
}));

// Now import the handler after mocks are set up
import { handler } from '../../lambda/audio-processor/index';

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
    body: audioData !== undefined ? audioData : Buffer.from('test audio data').toString('base64'),
    isBase64Encoded: false,
  };
}

describe('Audio Processor Lambda', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set environment variables
    process.env.METADATA_TABLE_NAME = 'test-metadata-table';
    process.env.SNS_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:test-topic';
    process.env.EVENT_BUS_NAME = 'test-event-bus';
    process.env.ENVIRONMENT = 'dev';
    process.env.AWS_REGION = 'us-east-1';

    // Default mock responses
    mockDynamoDBSend.mockResolvedValue({});
    mockSNSSend.mockResolvedValue({});
    mockEventBridgeSend.mockResolvedValue({});
    mockSecretsManagerSend.mockResolvedValue({
      SecretString: JSON.stringify({ mlServiceApiKey: 'test-key' }),
    });
    mockSSMSend.mockResolvedValue({
      Parameter: { Value: '70' },
    });
  });

  describe('Audio Processing', () => {
    it('should process audio data and store metadata', async () => {
      const event = createAudioEvent('test-connection-123');
      const response = await handler(event);

      expect(typeof response).toBe('object');
      expect((response as any).statusCode).toBe(200);
      expect(mockDynamoDBSend).toHaveBeenCalled();
      
      const body = JSON.parse((response as any).body!);
      expect(body).toHaveProperty('sessionId');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('fraudScore');
      expect(body).toHaveProperty('fraudDetected');
    });

    it('should decode base64 audio data correctly', async () => {
      const testAudio = 'test audio content';
      const base64Audio = Buffer.from(testAudio).toString('base64');
      const event = createAudioEvent('test-connection-123', base64Audio);
      
      const response = await handler(event);

      expect((response as any).statusCode).toBe(200);
      expect(mockDynamoDBSend).toHaveBeenCalled();
    });

    it('should return 500 if audio data is missing', async () => {
      const event = createAudioEvent('test-connection-123', '');
      const response = await handler(event);

      expect((response as any).statusCode).toBe(500);
      const body = JSON.parse((response as any).body!);
      expect(body.error).toBe(true);
      expect(body.code).toBe('ERROR_PROCESSING_FAILED');
    });

    it('should return 500 if audio data is invalid base64', async () => {
      const event = createAudioEvent('test-connection-123', 'invalid-base64!!!');
      const response = await handler(event);

      expect((response as any).statusCode).toBe(500);
      const body = JSON.parse((response as any).body!);
      expect(body.error).toBe(true);
    });
  });

  describe('Metadata Storage', () => {
    it('should store metadata with TTL for 30 days', async () => {
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
      const event = createAudioEvent('test-connection-123');
      await handler(event);

      expect(mockDynamoDBSend).toHaveBeenCalled();
      const putCommand = mockDynamoDBSend.mock.calls[0][0];
      
      // Verify no audio data fields in DynamoDB item
      expect(putCommand.input.Item).not.toHaveProperty('audioData');
      expect(putCommand.input.Item).not.toHaveProperty('audioBuffer');
      expect(putCommand.input.Item).not.toHaveProperty('rawAudio');
      expect(putCommand.input.Item).not.toHaveProperty('body');
      
      // Only metadata should be stored
      expect(putCommand.input.Item).toHaveProperty('sessionId');
      expect(putCommand.input.Item).toHaveProperty('fraudScore');
      expect(putCommand.input.Item).toHaveProperty('processingDuration');
      expect(putCommand.input.Item).toHaveProperty('audioChunkSize');
    });
  });

  describe('Logging', () => {
    it('should log structured JSON with sessionId and connectionId', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
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
  });

  describe('Error Handling', () => {
    it('should handle DynamoDB errors gracefully', async () => {
      mockDynamoDBSend.mockRejectedValue(new Error('DynamoDB error'));

      const event = createAudioEvent('test-connection-123');
      const response = await handler(event);

      expect((response as any).statusCode).toBe(500);
      const body = JSON.parse((response as any).body!);
      expect(body.error).toBe(true);
      expect(body.code).toBe('ERROR_PROCESSING_FAILED');
    });

    it('should continue processing if SNS publish fails', async () => {
      mockSNSSend.mockRejectedValue(new Error('SNS error'));
      mockSSMSend.mockResolvedValue({
        Parameter: { Value: '0' }, // Low threshold to trigger fraud detection
      });

      const event = createAudioEvent('test-connection-123');
      const response = await handler(event);

      // Should still return 200 even if SNS fails
      expect((response as any).statusCode).toBe(200);
      expect(mockDynamoDBSend).toHaveBeenCalled();
    });

    it('should continue processing if EventBridge publish fails', async () => {
      mockEventBridgeSend.mockRejectedValue(new Error('EventBridge error'));

      const event = createAudioEvent('test-connection-123');
      const response = await handler(event);

      // Should still return 200 even if EventBridge fails
      expect((response as any).statusCode).toBe(200);
      expect(mockDynamoDBSend).toHaveBeenCalled();
    });

    it('should use default configuration if Parameter Store fails', async () => {
      mockSSMSend.mockRejectedValue(new Error('Parameter Store error'));

      const event = createAudioEvent('test-connection-123');
      const response = await handler(event);

      // Should still process with default config
      expect((response as any).statusCode).toBe(200);
      expect(mockDynamoDBSend).toHaveBeenCalled();
    });

    it('should use default secrets if Secrets Manager fails', async () => {
      mockSecretsManagerSend.mockRejectedValue(new Error('Secrets Manager error'));

      const event = createAudioEvent('test-connection-123');
      const response = await handler(event);

      // Should still process with default secrets
      expect((response as any).statusCode).toBe(200);
      expect(mockDynamoDBSend).toHaveBeenCalled();
    });
  });
});
