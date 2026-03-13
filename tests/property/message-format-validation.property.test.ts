/**
 * Feature: competition-mvp-backend, Property 37: Message Format Validation
 * 
 * For any message received via WebSocket, if it does not match the expected format
 * (missing required fields, invalid types, malformed JSON), the Audio_Processor
 * should reject it with a descriptive error message.
 * 
 * Validates: Requirements 12.6
 */

import * as fc from 'fast-check';

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('@aws-sdk/client-sns');
jest.mock('@aws-sdk/client-eventbridge');
jest.mock('@aws-sdk/client-secrets-manager');
jest.mock('@aws-sdk/client-ssm');
jest.mock('aws-xray-sdk-core', () => ({
  captureAWSv3Client: jest.fn((client) => client),
}));

describe('Property 37: Message Format Validation', () => {
  let handler: any;

  beforeAll(async () => {
    // Set up environment
    process.env.METADATA_TABLE_NAME = 'test-metadata-table';
    process.env.ENVIRONMENT = 'test';
    process.env.AWS_REGION = 'us-east-1';

    // Mock AWS SDK send method
    const mockSend = jest.fn((command) => {
      // Mock Secrets Manager
      if (command.constructor.name === 'GetSecretValueCommand') {
        return Promise.resolve({
          SecretString: JSON.stringify({
            websocketApiKey: 'test-api-key',
          }),
        });
      }
      
      // Mock Parameter Store
      if (command.constructor.name === 'GetParameterCommand') {
        if (command.input.Name.includes('fraud-threshold')) {
          return Promise.resolve({ Parameter: { Value: '70' } });
        }
        if (command.input.Name.includes('max-processing-time')) {
          return Promise.resolve({ Parameter: { Value: '3000' } });
        }
      }
      
      // Mock DynamoDB PutCommand
      if (command.constructor.name === 'PutCommand') {
        return Promise.resolve({});
      }
      
      // Mock SNS PublishCommand
      if (command.constructor.name === 'PublishCommand') {
        return Promise.resolve({});
      }
      
      // Mock EventBridge PutEventsCommand
      if (command.constructor.name === 'PutEventsCommand') {
        return Promise.resolve({});
      }

      return Promise.resolve({});
    });

    // Mock all AWS clients
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    (DynamoDBDocumentClient.from as jest.Mock) = jest.fn(() => ({
      send: mockSend,
    }));

    const { SNSClient } = require('@aws-sdk/client-sns');
    (SNSClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    const { EventBridgeClient } = require('@aws-sdk/client-eventbridge');
    (EventBridgeClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    const { SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
    (SecretsManagerClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    const { SSMClient } = require('@aws-sdk/client-ssm');
    (SSMClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    // Import the handler
    const audioProcessorModule = await import('../../lambda/audio-processor/index');
    handler = audioProcessorModule.handler;
  });

  /**
   * Helper to create a base WebSocket event
   */
  const createBaseEvent = (body: string | undefined): any => ({
    requestContext: {
      connectionId: 'test-connection-id',
      requestId: 'test-request-id',
      routeKey: 'audio',
      eventType: 'MESSAGE' as const,
      apiId: 'test-api-id',
      connectedAt: Date.now(),
      requestTimeEpoch: Date.now(),
      stage: 'test',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      requestTime: new Date().toISOString(),
      messageId: 'test-message-id',
      extendedRequestId: 'test-extended-request-id',
      messageDirection: 'IN' as const,
    },
    body,
    isBase64Encoded: false,
  });

  /**
   * Generator for valid audio messages
   */
  const validMessageGen = fc.record({
    action: fc.constant('audio'),
    callSessionId: fc.uuid(),
    timestamp: fc.integer({ min: Date.now() - 30000, max: Date.now() + 30000 }),
    audioData: fc.string({ minLength: 1 }).map(s => Buffer.from(s).toString('base64')),
    sequenceNumber: fc.nat(),
  });

  /**
   * Property: Valid messages should be accepted (or fail for other reasons, not format)
   */
  it('should accept any valid message format', async () => {
    await fc.assert(
      fc.asyncProperty(
        validMessageGen,
        async (message) => {
          const event = createBaseEvent(JSON.stringify(message));
          const response = await handler(event) as { statusCode: number; body: string };

          // Valid format should not return MALFORMED_MESSAGE error
          // It may fail for other reasons (e.g., INVALID_AUDIO_FORMAT), but not format
          const body = typeof response.body === 'string' 
            ? JSON.parse(response.body) 
            : response.body;
          
          if (body.type === 'error') {
            expect(body.code).not.toBe('MALFORMED_MESSAGE');
          }

          return true;
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  });

  /**
   * Property: Messages with missing required fields should be rejected
   */
  it('should reject messages with missing required fields', async () => {
    const requiredFields = ['action', 'callSessionId', 'timestamp', 'audioData', 'sequenceNumber'];
    
    await fc.assert(
      fc.asyncProperty(
        validMessageGen,
        fc.constantFrom(...requiredFields),
        async (message, fieldToRemove) => {
          // Create message with one required field removed
          const incompleteMessage = { ...message };
          delete (incompleteMessage as any)[fieldToRemove];

          const event = createBaseEvent(JSON.stringify(incompleteMessage));
          const response = await handler(event) as { statusCode: number; body: string };

          // Should return 400 Bad Request
          expect(response.statusCode).toBe(400);
          
          const body = typeof response.body === 'string' 
            ? JSON.parse(response.body) 
            : response.body;
          
          expect(body.type).toBe('error');
          expect(body.code).toBe('MALFORMED_MESSAGE');
          expect(body.message).toBeDefined();
          expect(typeof body.message).toBe('string');
          expect(body.message.toLowerCase()).toContain('missing');
          expect(body.message).toContain(fieldToRemove);

          return true;
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  });

  /**
   * Property: Messages with invalid field types should be rejected
   */
  it('should reject messages with invalid field types', async () => {
    const invalidTypeGenerators = [
      // Invalid action (not string)
      fc.record({
        action: fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)),
        callSessionId: fc.uuid(),
        timestamp: fc.integer({ min: Date.now() - 30000, max: Date.now() + 30000 }),
        audioData: fc.string().map(s => Buffer.from(s).toString('base64')),
        sequenceNumber: fc.nat(),
      }),
      // Invalid callSessionId (not string)
      fc.record({
        action: fc.constant('audio'),
        callSessionId: fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)),
        timestamp: fc.integer({ min: Date.now() - 30000, max: Date.now() + 30000 }),
        audioData: fc.string().map(s => Buffer.from(s).toString('base64')),
        sequenceNumber: fc.nat(),
      }),
      // Invalid timestamp (not number)
      fc.record({
        action: fc.constant('audio'),
        callSessionId: fc.uuid(),
        timestamp: fc.oneof(fc.string(), fc.boolean(), fc.constant(null)),
        audioData: fc.string().map(s => Buffer.from(s).toString('base64')),
        sequenceNumber: fc.nat(),
      }),
      // Invalid audioData (not string)
      fc.record({
        action: fc.constant('audio'),
        callSessionId: fc.uuid(),
        timestamp: fc.integer({ min: Date.now() - 30000, max: Date.now() + 30000 }),
        audioData: fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)),
        sequenceNumber: fc.nat(),
      }),
      // Invalid sequenceNumber (not number)
      fc.record({
        action: fc.constant('audio'),
        callSessionId: fc.uuid(),
        timestamp: fc.integer({ min: Date.now() - 30000, max: Date.now() + 30000 }),
        audioData: fc.string().map(s => Buffer.from(s).toString('base64')),
        sequenceNumber: fc.oneof(fc.string(), fc.boolean(), fc.constant(null)),
      }),
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(...invalidTypeGenerators),
        async (message) => {
          const event = createBaseEvent(JSON.stringify(message));
          const response = await handler(event) as { statusCode: number; body: string };

          // Should return 400 Bad Request
          expect(response.statusCode).toBe(400);
          
          const body = typeof response.body === 'string' 
            ? JSON.parse(response.body) 
            : response.body;
          
          expect(body.type).toBe('error');
          expect(body.code).toBe('MALFORMED_MESSAGE');
          expect(body.message).toBeDefined();
          expect(typeof body.message).toBe('string');
          expect(body.message.length).toBeGreaterThan(0);

          return true;
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  });

  /**
   * Property: Malformed JSON should be rejected
   */
  it('should reject malformed JSON with descriptive error', async () => {
    const malformedJSONGen = fc.oneof(
      // Invalid JSON syntax
      fc.constant('{invalid json}'),
      fc.constant('{"action": "audio", "callSessionId": }'),
      fc.constant('{"action": "audio"'),
      fc.constant('null'),
      fc.constant('undefined'),
      fc.constant(''),
      // Not JSON at all
      fc.string({ minLength: 1, maxLength: 100 }).filter(s => {
        try {
          JSON.parse(s);
          return false; // Valid JSON, skip
        } catch {
          return true; // Invalid JSON, use it
        }
      }),
    );

    await fc.assert(
      fc.asyncProperty(
        malformedJSONGen,
        async (malformedBody) => {
          const event = createBaseEvent(malformedBody);
          const response = await handler(event) as { statusCode: number; body: string };

          // Should return 400 Bad Request
          expect(response.statusCode).toBe(400);
          
          const body = typeof response.body === 'string' 
            ? JSON.parse(response.body) 
            : response.body;
          
          expect(body.type).toBe('error');
          expect(body.code).toBe('MALFORMED_MESSAGE');
          expect(body.message).toBeDefined();
          expect(typeof body.message).toBe('string');
          expect(body.message.length).toBeGreaterThan(0);

          return true;
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  });

  /**
   * Property: Messages with invalid action value should be rejected
   */
  it('should reject messages with invalid action value', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter(s => s !== 'audio'),
        fc.uuid(),
        fc.integer({ min: Date.now() - 30000, max: Date.now() + 30000 }),
        fc.string().map(s => Buffer.from(s).toString('base64')),
        fc.nat(),
        async (action, callSessionId, timestamp, audioData, sequenceNumber) => {
          const message = {
            action,
            callSessionId,
            timestamp,
            audioData,
            sequenceNumber,
          };

          const event = createBaseEvent(JSON.stringify(message));
          const response = await handler(event) as { statusCode: number; body: string };

          // Should return 400 Bad Request
          expect(response.statusCode).toBe(400);
          
          const body = typeof response.body === 'string' 
            ? JSON.parse(response.body) 
            : response.body;
          
          expect(body.type).toBe('error');
          expect(body.code).toBe('MALFORMED_MESSAGE');
          expect(body.message).toBeDefined();
          expect(body.message.toLowerCase()).toContain('action');

          return true;
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  });

  /**
   * Property: Messages with timestamp too far from current time should be rejected
   */
  it('should reject messages with timestamp too far from current time', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Too far in the past (more than 60 seconds)
          fc.integer({ min: 0, max: Date.now() - 61000 }),
          // Too far in the future (more than 60 seconds)
          fc.integer({ min: Date.now() + 61000, max: Date.now() + 1000000 }),
        ),
        fc.uuid(),
        fc.string().map(s => Buffer.from(s).toString('base64')),
        fc.nat(),
        async (timestamp, callSessionId, audioData, sequenceNumber) => {
          const message = {
            action: 'audio',
            callSessionId,
            timestamp,
            audioData,
            sequenceNumber,
          };

          const event = createBaseEvent(JSON.stringify(message));
          const response = await handler(event) as { statusCode: number; body: string };

          // Should return 400 Bad Request
          expect(response.statusCode).toBe(400);
          
          const body = typeof response.body === 'string' 
            ? JSON.parse(response.body) 
            : response.body;
          
          expect(body.type).toBe('error');
          expect(body.code).toBe('MALFORMED_MESSAGE');
          expect(body.message).toBeDefined();
          expect(body.message.toLowerCase()).toContain('timestamp');

          return true;
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  });

  /**
   * Property: Messages with negative sequence number should be rejected
   */
  it('should reject messages with negative sequence number', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: -1000, max: -1 }),
        fc.uuid(),
        fc.integer({ min: Date.now() - 30000, max: Date.now() + 30000 }),
        fc.string().map(s => Buffer.from(s).toString('base64')),
        async (sequenceNumber, callSessionId, timestamp, audioData) => {
          const message = {
            action: 'audio',
            callSessionId,
            timestamp,
            audioData,
            sequenceNumber,
          };

          const event = createBaseEvent(JSON.stringify(message));
          const response = await handler(event) as { statusCode: number; body: string };

          // Should return 400 Bad Request
          expect(response.statusCode).toBe(400);
          
          const body = typeof response.body === 'string' 
            ? JSON.parse(response.body) 
            : response.body;
          
          expect(body.type).toBe('error');
          expect(body.code).toBe('MALFORMED_MESSAGE');
          expect(body.message).toBeDefined();
          expect(body.message.toLowerCase()).toContain('sequence');

          return true;
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  });

  /**
   * Property: Missing body should be rejected
   */
  it('should reject messages with missing body', async () => {
    const event = createBaseEvent(undefined);
    const response = await handler(event) as { statusCode: number; body: string };

    // Should return 400 Bad Request
    expect(response.statusCode).toBe(400);
    
    const body = typeof response.body === 'string' 
      ? JSON.parse(response.body) 
      : response.body;
    
    expect(body.type).toBe('error');
    expect(body.code).toBe('MALFORMED_MESSAGE');
    expect(body.message).toBeDefined();
    expect(body.message.toLowerCase()).toContain('missing');
  });

  /**
   * Property: Error messages should be descriptive and include relevant context
   */
  it('should provide descriptive error messages for all malformed messages', async () => {
    const malformedMessageGen = fc.oneof(
      // Missing fields
      fc.record({
        action: fc.constant('audio'),
        // Missing other fields
      }),
      // Invalid types
      fc.record({
        action: fc.integer(),
        callSessionId: fc.uuid(),
        timestamp: fc.integer(),
        audioData: fc.string(),
        sequenceNumber: fc.nat(),
      }),
      // Malformed JSON
      fc.constant('{invalid}'),
    );

    await fc.assert(
      fc.asyncProperty(
        malformedMessageGen,
        async (messageOrString) => {
          const body = typeof messageOrString === 'string' 
            ? messageOrString 
            : JSON.stringify(messageOrString);
          
          const event = createBaseEvent(body);
          const response = await handler(event) as { statusCode: number; body: string };

          // Should return 400 Bad Request
          expect(response.statusCode).toBe(400);
          
          const responseBody = typeof response.body === 'string' 
            ? JSON.parse(response.body) 
            : response.body;
          
          expect(responseBody.type).toBe('error');
          expect(responseBody.code).toBe('MALFORMED_MESSAGE');
          
          // Error message should be descriptive (at least 10 characters)
          expect(responseBody.message).toBeDefined();
          expect(typeof responseBody.message).toBe('string');
          expect(responseBody.message.length).toBeGreaterThanOrEqual(10);
          
          // Error message should not expose internal details
          expect(responseBody.message).not.toContain('stack');
          expect(responseBody.message).not.toContain('Error:');

          return true;
        }
      ),
      { numRuns: 10, timeout: 30000 }
    );
  });
});
