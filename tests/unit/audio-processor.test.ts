/**
 * Unit tests for Audio Processor Lambda function
 * 
 * Task 5.1: Create audio message handler and validation
 * Requirements 2.2, 2.5, 10.1, 10.2, 12.6
 * 
 * Tests the Audio Processor Lambda to ensure it properly:
 * - Parses WebSocket audio message (action, callSessionId, timestamp, audioData, sequenceNumber)
 * - Validates message format (required fields, valid types)
 * - Decodes Base64 audioData to Buffer
 * - Validates audio format (PCM, 16kHz, 16-bit, mono)
 * - Returns error message for invalid format or malformed message
 * - Logs audio receipt with structured JSON (connectionId, callSessionId, sequenceNumber, audioSize)
 * - Stores metadata in DynamoDB (without audio data)
 * - Publishes fraud alerts to SNS
 * - Publishes events to EventBridge
 * - Retrieves secrets from Secrets Manager with caching
 * - Retrieves configuration from Parameter Store with caching
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

// Helper function to create valid audio message
function createValidAudioMessage(callSessionId: string = 'test-call-123', sequenceNumber: number = 1): any {
  // Create PCM audio buffer (16kHz, 16-bit, mono, 0.5 seconds = 16000 bytes)
  const audioBuffer = Buffer.alloc(16000);
  return {
    action: 'audio',
    callSessionId,
    timestamp: Date.now(),
    audioData: audioBuffer.toString('base64'),
    sequenceNumber,
  };
}

// Helper function to create audio processing event
function createAudioEvent(connectionId: string, messageBody?: any): APIGatewayProxyWebsocketEventV2 {
  const body = messageBody !== undefined 
    ? (typeof messageBody === 'string' ? messageBody : JSON.stringify(messageBody))
    : JSON.stringify(createValidAudioMessage());
    
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
    body,
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

  describe('Task 5.1: Audio Message Parsing and Validation', () => {
    describe('Message Format Validation (Requirement 12.6)', () => {
      it('should successfully parse valid audio message', async () => {
        const validMessage = createValidAudioMessage();
        const event = createAudioEvent('test-connection-123', validMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(200);
        expect(mockDynamoDBSend).toHaveBeenCalled();
      });

      it('should reject message with missing body', async () => {
        const event = createAudioEvent('test-connection-123', undefined);
        event.body = undefined;
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.code).toBe('MALFORMED_MESSAGE');
        expect(body.message).toContain('Missing message body');
      });

      it('should reject message with invalid JSON', async () => {
        const event = createAudioEvent('test-connection-123', 'invalid json {{{');
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.code).toBe('MALFORMED_MESSAGE');
        expect(body.message).toContain('Invalid JSON format');
      });

      it('should reject message missing required field: action', async () => {
        const invalidMessage = createValidAudioMessage();
        delete invalidMessage.action;
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.code).toBe('MALFORMED_MESSAGE');
        expect(body.message).toContain('Missing required fields');
        expect(body.message).toContain('action');
      });

      it('should reject message missing required field: callSessionId', async () => {
        const invalidMessage = createValidAudioMessage();
        delete invalidMessage.callSessionId;
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.message).toContain('callSessionId');
      });

      it('should reject message missing required field: timestamp', async () => {
        const invalidMessage = createValidAudioMessage();
        delete invalidMessage.timestamp;
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.message).toContain('timestamp');
      });

      it('should reject message missing required field: audioData', async () => {
        const invalidMessage = createValidAudioMessage();
        delete invalidMessage.audioData;
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.message).toContain('audioData');
      });

      it('should reject message missing required field: sequenceNumber', async () => {
        const invalidMessage = createValidAudioMessage();
        delete invalidMessage.sequenceNumber;
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.message).toContain('sequenceNumber');
      });

      it('should reject message with invalid action type (not string)', async () => {
        const invalidMessage = createValidAudioMessage();
        invalidMessage.action = 123;
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.message).toContain('action');
        expect(body.message).toContain('string');
      });

      it('should reject message with invalid callSessionId type (not string)', async () => {
        const invalidMessage = createValidAudioMessage();
        invalidMessage.callSessionId = 123;
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.message).toContain('callSessionId');
        expect(body.message).toContain('string');
      });

      it('should reject message with invalid timestamp type (not number)', async () => {
        const invalidMessage = createValidAudioMessage();
        invalidMessage.timestamp = 'not-a-number';
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.message).toContain('timestamp');
        expect(body.message).toContain('number');
      });

      it('should reject message with invalid audioData type (not string)', async () => {
        const invalidMessage = createValidAudioMessage();
        invalidMessage.audioData = 123;
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.message).toContain('audioData');
        expect(body.message).toContain('string');
      });

      it('should reject message with invalid sequenceNumber type (not number)', async () => {
        const invalidMessage = createValidAudioMessage();
        invalidMessage.sequenceNumber = 'not-a-number';
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.message).toContain('sequenceNumber');
        expect(body.message).toContain('number');
      });

      it('should reject message with invalid action value', async () => {
        const invalidMessage = createValidAudioMessage();
        invalidMessage.action = 'invalid-action';
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.message).toContain('Invalid action');
        expect(body.message).toContain('audio');
      });

      it('should reject message with timestamp too far in past', async () => {
        const invalidMessage = createValidAudioMessage();
        invalidMessage.timestamp = Date.now() - (120 * 1000); // 2 minutes ago
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.message).toContain('Timestamp is too far from current time');
      });

      it('should reject message with timestamp too far in future', async () => {
        const invalidMessage = createValidAudioMessage();
        invalidMessage.timestamp = Date.now() + (120 * 1000); // 2 minutes in future
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.message).toContain('Timestamp is too far from current time');
      });

      it('should reject message with negative sequence number', async () => {
        const invalidMessage = createValidAudioMessage();
        invalidMessage.sequenceNumber = -1;
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.message).toContain('Sequence number must be non-negative');
      });
    });

    describe('Base64 Audio Decoding (Requirements 2.2, 2.5)', () => {
      it('should successfully decode valid Base64 audio data', async () => {
        const validMessage = createValidAudioMessage();
        const event = createAudioEvent('test-connection-123', validMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(200);
        expect(mockDynamoDBSend).toHaveBeenCalled();
      });

      it('should reject invalid Base64 encoding', async () => {
        const invalidMessage = createValidAudioMessage();
        invalidMessage.audioData = 'invalid-base64!!!@@@';
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.code).toBe('INVALID_AUDIO_FORMAT');
        expect(body.message).toContain('Invalid Base64 encoding');
      });

      it('should reject empty audio data after decoding', async () => {
        const invalidMessage = createValidAudioMessage();
        invalidMessage.audioData = Buffer.alloc(0).toString('base64');
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.message).toContain('empty');
      });

      it('should reject audio data exceeding 128 KB limit', async () => {
        const invalidMessage = createValidAudioMessage();
        // Create buffer larger than 128 KB
        const largeBuffer = Buffer.alloc(129 * 1024);
        invalidMessage.audioData = largeBuffer.toString('base64');
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.message).toContain('exceeds maximum size');
        expect(body.message).toContain('128 KB');
      });
    });

    describe('Audio Format Validation (Requirements 2.2, 2.5)', () => {
      it('should accept valid PCM 16kHz 16-bit mono audio (0.5 seconds)', async () => {
        const validMessage = createValidAudioMessage();
        // 16kHz * 2 bytes * 1 channel * 0.5 seconds = 16000 bytes
        const audioBuffer = Buffer.alloc(16000);
        validMessage.audioData = audioBuffer.toString('base64');
        const event = createAudioEvent('test-connection-123', validMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(200);
      });

      it('should accept valid PCM 16kHz 16-bit mono audio (1 second)', async () => {
        const validMessage = createValidAudioMessage();
        // 16kHz * 2 bytes * 1 channel * 1 second = 32000 bytes
        const audioBuffer = Buffer.alloc(32000);
        validMessage.audioData = audioBuffer.toString('base64');
        const event = createAudioEvent('test-connection-123', validMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(200);
      });

      it('should reject audio buffer that is too small', async () => {
        const invalidMessage = createValidAudioMessage();
        // Less than 0.1 seconds (3200 bytes minimum)
        const tooSmallBuffer = Buffer.alloc(1000);
        invalidMessage.audioData = tooSmallBuffer.toString('base64');
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.code).toBe('INVALID_AUDIO_FORMAT');
        expect(body.message).toContain('too small');
      });

      it('should reject audio buffer that is too large', async () => {
        const invalidMessage = createValidAudioMessage();
        // More than 2 seconds (64000 bytes maximum)
        const tooLargeBuffer = Buffer.alloc(70000);
        invalidMessage.audioData = tooLargeBuffer.toString('base64');
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.code).toBe('INVALID_AUDIO_FORMAT');
        expect(body.message).toContain('too large');
      });

      it('should reject audio buffer with odd size (not 16-bit aligned)', async () => {
        const invalidMessage = createValidAudioMessage();
        // Odd number of bytes (not valid for 16-bit samples)
        const oddBuffer = Buffer.alloc(16001);
        invalidMessage.audioData = oddBuffer.toString('base64');
        const event = createAudioEvent('test-connection-123', invalidMessage);
        
        const response = await handler(event);

        expect((response as any).statusCode).toBe(400);
        const body = JSON.parse((response as any).body!);
        expect(body.code).toBe('INVALID_AUDIO_FORMAT');
        expect(body.message).toContain('must be even');
        expect(body.message).toContain('16-bit');
      });
    });

    describe('Structured Logging (Requirements 10.1, 10.2)', () => {
      it('should log audio receipt with all required fields', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        
        const validMessage = createValidAudioMessage('test-call-456', 42);
        const event = createAudioEvent('test-connection-789', validMessage);
        await handler(event);

        expect(consoleSpy).toHaveBeenCalled();
        
        // Find the log entry for audio receipt
        const audioReceiptLog = consoleSpy.mock.calls
          .map(call => JSON.parse(call[0]))
          .find(log => log.message === 'Audio chunk received and validated');

        expect(audioReceiptLog).toBeDefined();
        expect(audioReceiptLog).toHaveProperty('timestamp');
        expect(audioReceiptLog).toHaveProperty('level', 'INFO');
        expect(audioReceiptLog).toHaveProperty('component', 'AudioProcessor');
        expect(audioReceiptLog).toHaveProperty('connectionId', 'test-connection-789');
        expect(audioReceiptLog).toHaveProperty('callSessionId', 'test-call-456');
        expect(audioReceiptLog).toHaveProperty('sequenceNumber', 42);
        expect(audioReceiptLog).toHaveProperty('audioSize');
        expect(audioReceiptLog.audioSize).toBe(16000);

        consoleSpy.mockRestore();
      });
    });
  });

  describe('Audio Processing', () => {
    it('should process valid audio data and store metadata', async () => {
      const validMessage = createValidAudioMessage();
      const event = createAudioEvent('test-connection-123', validMessage);
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
  });

  describe('Metadata Storage', () => {
    it('should store metadata with callSessionId and sequenceNumber', async () => {
      const validMessage = createValidAudioMessage('test-call-999', 55);
      const event = createAudioEvent('test-connection-123', validMessage);
      await handler(event);

      expect(mockDynamoDBSend).toHaveBeenCalled();
      const putCommand = mockDynamoDBSend.mock.calls[0][0];
      expect(putCommand.input.Item).toHaveProperty('callSessionId', 'test-call-999');
      expect(putCommand.input.Item).toHaveProperty('sequenceNumber', 55);
    });

    it('should store metadata with TTL for 30 days', async () => {
      const validMessage = createValidAudioMessage();
      const event = createAudioEvent('test-connection-123', validMessage);
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
      const validMessage = createValidAudioMessage();
      const event = createAudioEvent('test-connection-123', validMessage);
      await handler(event);

      expect(mockDynamoDBSend).toHaveBeenCalled();
      const putCommand = mockDynamoDBSend.mock.calls[0][0];
      
      // Verify no audio data fields in DynamoDB item
      expect(putCommand.input.Item).not.toHaveProperty('audioData');
      expect(putCommand.input.Item).not.toHaveProperty('audioBuffer');
      expect(putCommand.input.Item).not.toHaveProperty('rawAudio');
      expect(putCommand.input.Item).not.toHaveProperty('body');
      
      // Only metadata should be stored
      expect(putCommand.input.Item).toHaveProperty('callSessionId');
      expect(putCommand.input.Item).toHaveProperty('fraudScore');
      expect(putCommand.input.Item).toHaveProperty('processingDuration');
      expect(putCommand.input.Item).toHaveProperty('audioChunkSize');
    });
  });

  describe('Logging', () => {
    it('should log structured JSON with all required fields', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const validMessage = createValidAudioMessage();
      const event = createAudioEvent('test-connection-123', validMessage);
      await handler(event);

      expect(consoleSpy).toHaveBeenCalled();
      const logCalls = consoleSpy.mock.calls;
      
      // Verify structured logging format
      logCalls.forEach((call) => {
        const logEntry = JSON.parse(call[0]);
        expect(logEntry).toHaveProperty('timestamp');
        expect(logEntry).toHaveProperty('level');
        expect(logEntry).toHaveProperty('message');
        expect(logEntry).toHaveProperty('component', 'AudioProcessor');
        expect(['INFO', 'WARN', 'ERROR']).toContain(logEntry.level);
      });

      // Verify at least one log has callSessionId and connectionId
      const logsWithContext = logCalls
        .map(call => JSON.parse(call[0]))
        .filter(log => log.callSessionId && log.connectionId);
      expect(logsWithContext.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle DynamoDB errors gracefully', async () => {
      mockDynamoDBSend.mockRejectedValue(new Error('DynamoDB error'));

      const validMessage = createValidAudioMessage();
      const event = createAudioEvent('test-connection-123', validMessage);
      const response = await handler(event);

      expect((response as any).statusCode).toBe(500);
      const body = JSON.parse((response as any).body!);
      expect(body.type).toBe('error');
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('should continue processing if SNS publish fails', async () => {
      mockSNSSend.mockRejectedValue(new Error('SNS error'));
      mockSSMSend.mockResolvedValue({
        Parameter: { Value: '0' }, // Low threshold to trigger fraud detection
      });

      const validMessage = createValidAudioMessage();
      const event = createAudioEvent('test-connection-123', validMessage);
      const response = await handler(event);

      // Should still return 200 even if SNS fails
      expect((response as any).statusCode).toBe(200);
      expect(mockDynamoDBSend).toHaveBeenCalled();
    });

    it('should continue processing if EventBridge publish fails', async () => {
      mockEventBridgeSend.mockRejectedValue(new Error('EventBridge error'));

      const validMessage = createValidAudioMessage();
      const event = createAudioEvent('test-connection-123', validMessage);
      const response = await handler(event);

      // Should still return 200 even if EventBridge fails
      expect((response as any).statusCode).toBe(200);
      expect(mockDynamoDBSend).toHaveBeenCalled();
    });

    it('should use default configuration if Parameter Store fails', async () => {
      mockSSMSend.mockRejectedValue(new Error('Parameter Store error'));

      const validMessage = createValidAudioMessage();
      const event = createAudioEvent('test-connection-123', validMessage);
      const response = await handler(event);

      // Should still process with default config
      expect((response as any).statusCode).toBe(200);
      expect(mockDynamoDBSend).toHaveBeenCalled();
    });

    it('should use default secrets if Secrets Manager fails', async () => {
      mockSecretsManagerSend.mockRejectedValue(new Error('Secrets Manager error'));

      const validMessage = createValidAudioMessage();
      const event = createAudioEvent('test-connection-123', validMessage);
      const response = await handler(event);

      // Should still process with default secrets
      expect((response as any).statusCode).toBe(200);
      expect(mockDynamoDBSend).toHaveBeenCalled();
    });
  });
});
