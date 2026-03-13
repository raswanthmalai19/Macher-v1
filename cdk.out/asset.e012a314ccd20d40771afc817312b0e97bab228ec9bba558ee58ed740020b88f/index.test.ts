/**
 * Unit tests for SlackWebhookLambda
 * 
 * Tests cover:
 * - CloudWatch Alarm message parsing
 * - Slack message formatting
 * - Color coding by severity
 * - Error handling
 * - Retry logic
 * 
 * NOTE: These tests have complex mocking requirements for the https module.
 * The core formatting logic is thoroughly tested in index.simple.test.ts.
 * These integration-style tests verify end-to-end behavior but may have
 * intermittent issues due to async event emitter mocking complexity.
 * 
 * For reliable unit testing of the core logic (color coding, message structure),
 * see index.simple.test.ts which tests the pure functions without mocking.
 */

import { SNSEvent } from 'aws-lambda';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-secrets-manager');
jest.mock('aws-xray-sdk-core', () => ({
  captureAWSv3Client: jest.fn((client) => client),
}));

// Mock https module
jest.mock('https');

import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import https from 'https';
import { handler } from './index';

describe('SlackWebhookLambda', () => {
  let mockSecretsManagerSend: jest.Mock;
  let mockHttpsRequest: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock Secrets Manager
    mockSecretsManagerSend = jest.fn().mockResolvedValue({
      SecretString: 'https://hooks.slack.com/services/TEST/WEBHOOK/URL',
    });

    (SecretsManagerClient as jest.Mock).mockImplementation(() => ({
      send: mockSecretsManagerSend,
    }));

    // Mock https.request with proper event emitter behavior
    mockHttpsRequest = jest.fn().mockImplementation((_options, callback) => {
      const mockRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };

      // Simulate successful response when end() is called
      mockRequest.end.mockImplementation(() => {
        // Create response object with event emitter behavior
        const dataHandlers: Function[] = [];
        const endHandlers: Function[] = [];
        
        const mockResponse: any = {
          statusCode: 200,
          on: jest.fn((event: string, handler: Function) => {
            if (event === 'data') {
              dataHandlers.push(handler);
            } else if (event === 'end') {
              endHandlers.push(handler);
            }
            return mockResponse;
          }),
        };

        // Call the callback synchronously (as https.request does)
        callback(mockResponse);

        // Emit events asynchronously (as the response stream does)
        setImmediate(() => {
          dataHandlers.forEach(h => h('ok'));
          endHandlers.forEach(h => h());
        });
      });

      return mockRequest;
    });

    (https.request as unknown as jest.Mock) = mockHttpsRequest;

    // Suppress console.log during tests
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Message Parsing', () => {
    it('should parse valid CloudWatch Alarm message', async () => {
      const event = createSNSEvent({
        AlarmName: 'TestAlarm',
        AlarmDescription: 'Test alarm description',
        NewStateValue: 'ALARM',
        NewStateReason: 'Threshold crossed',
        StateChangeTime: '2024-01-01T00:00:00.000Z',
        Region: 'us-east-1',
        Trigger: {
          MetricName: 'ErrorCount',
          Namespace: 'AWS/Lambda',
          Threshold: 5,
          ComparisonOperator: 'GreaterThanThreshold',
        },
      });

      await handler(event);

      expect(mockHttpsRequest).toHaveBeenCalled();
      const requestCall = mockHttpsRequest.mock.calls[0];
      const requestBody = requestCall[0];
      
      // Verify request was made to Slack
      expect(requestBody.hostname).toBe('hooks.slack.com');
      expect(requestBody.method).toBe('POST');
    });

    it('should handle alarm message without description', async () => {
      const event = createSNSEvent({
        AlarmName: 'TestAlarm',
        NewStateValue: 'ALARM',
        NewStateReason: 'Threshold crossed',
        StateChangeTime: '2024-01-01T00:00:00.000Z',
        Region: 'us-east-1',
        Trigger: {
          MetricName: 'ErrorCount',
          Namespace: 'AWS/Lambda',
          Threshold: 5,
          ComparisonOperator: 'GreaterThanThreshold',
        },
      });

      await handler(event);

      expect(mockHttpsRequest).toHaveBeenCalled();
    });

    it('should throw error for invalid JSON message', async () => {
      const event: SNSEvent = {
        Records: [
          {
            EventSource: 'aws:sns',
            EventVersion: '1.0',
            EventSubscriptionArn: 'arn:aws:sns:us-east-1:123456789012:test-topic',
            Sns: {
              Type: 'Notification',
              MessageId: 'test-message-id',
              TopicArn: 'arn:aws:sns:us-east-1:123456789012:test-topic',
              Subject: 'Test',
              Message: 'invalid json {',
              Timestamp: '2024-01-01T00:00:00.000Z',
              SignatureVersion: '1',
              Signature: 'test',
              SigningCertUrl: 'test',
              UnsubscribeUrl: 'test',
              MessageAttributes: {},
            },
          },
        ],
      };

      await expect(handler(event)).rejects.toThrow();
    });
  });

  describe('Slack Message Formatting', () => {
    it('should format critical alarm with danger color', async () => {
      const event = createSNSEvent({
        AlarmName: 'Critical-Lambda-Errors',
        AlarmDescription: 'Lambda error rate exceeded threshold',
        NewStateValue: 'ALARM',
        NewStateReason: 'Threshold crossed: 10 > 5',
        StateChangeTime: '2024-01-01T00:00:00.000Z',
        Region: 'us-east-1',
        Trigger: {
          MetricName: 'Errors',
          Namespace: 'AWS/Lambda',
          Threshold: 5,
          ComparisonOperator: 'GreaterThanThreshold',
        },
      });

      await handler(event);

      expect(mockHttpsRequest).toHaveBeenCalled();
      const writeCall = mockHttpsRequest.mock.results[0].value.write.mock.calls[0][0];
      const slackMessage = JSON.parse(writeCall);

      expect(slackMessage.attachments[0].color).toBe('danger');
      expect(slackMessage.text).toContain('🚨');
    });

    it('should format warning alarm with warning color', async () => {
      const event = createSNSEvent({
        AlarmName: 'Warning-DynamoDB-Throttle',
        AlarmDescription: 'DynamoDB throttle events detected',
        NewStateValue: 'ALARM',
        NewStateReason: 'Threshold crossed',
        StateChangeTime: '2024-01-01T00:00:00.000Z',
        Region: 'us-east-1',
        Trigger: {
          MetricName: 'ThrottledRequests',
          Namespace: 'AWS/DynamoDB',
          Threshold: 1,
          ComparisonOperator: 'GreaterThanThreshold',
        },
      });

      await handler(event);

      const writeCall = mockHttpsRequest.mock.results[0].value.write.mock.calls[0][0];
      const slackMessage = JSON.parse(writeCall);

      expect(slackMessage.attachments[0].color).toBe('warning');
    });

    it('should format OK state with good color', async () => {
      const event = createSNSEvent({
        AlarmName: 'TestAlarm',
        AlarmDescription: 'Test alarm',
        NewStateValue: 'OK',
        NewStateReason: 'Threshold no longer crossed',
        StateChangeTime: '2024-01-01T00:00:00.000Z',
        Region: 'us-east-1',
        Trigger: {
          MetricName: 'ErrorCount',
          Namespace: 'AWS/Lambda',
          Threshold: 5,
          ComparisonOperator: 'GreaterThanThreshold',
        },
      });

      await handler(event);

      const writeCall = mockHttpsRequest.mock.results[0].value.write.mock.calls[0][0];
      const slackMessage = JSON.parse(writeCall);

      expect(slackMessage.attachments[0].color).toBe('good');
      expect(slackMessage.text).toContain('✅');
    });

    it('should include all required fields in Slack message', async () => {
      const event = createSNSEvent({
        AlarmName: 'TestAlarm',
        AlarmDescription: 'Test description',
        NewStateValue: 'ALARM',
        NewStateReason: 'Test reason',
        StateChangeTime: '2024-01-01T00:00:00.000Z',
        Region: 'us-east-1',
        Trigger: {
          MetricName: 'TestMetric',
          Namespace: 'Test/Namespace',
          Threshold: 100,
          ComparisonOperator: 'GreaterThanThreshold',
        },
      });

      await handler(event);

      const writeCall = mockHttpsRequest.mock.results[0].value.write.mock.calls[0][0];
      const slackMessage = JSON.parse(writeCall);

      expect(slackMessage).toHaveProperty('text');
      expect(slackMessage).toHaveProperty('attachments');
      expect(slackMessage.attachments[0]).toHaveProperty('color');
      expect(slackMessage.attachments[0]).toHaveProperty('title');
      expect(slackMessage.attachments[0]).toHaveProperty('text');
      expect(slackMessage.attachments[0]).toHaveProperty('fields');
      expect(slackMessage.attachments[0]).toHaveProperty('footer');
      expect(slackMessage.attachments[0]).toHaveProperty('ts');
    });

    it('should include dimensions in Slack message when present', async () => {
      const event = createSNSEvent({
        AlarmName: 'TestAlarm',
        NewStateValue: 'ALARM',
        NewStateReason: 'Test reason',
        StateChangeTime: '2024-01-01T00:00:00.000Z',
        Region: 'us-east-1',
        Trigger: {
          MetricName: 'TestMetric',
          Namespace: 'Test/Namespace',
          Threshold: 100,
          ComparisonOperator: 'GreaterThanThreshold',
          Dimensions: [
            { name: 'FunctionName', value: 'TestFunction' },
            { name: 'Resource', value: 'TestResource' },
          ],
        },
      });

      await handler(event);

      const writeCall = mockHttpsRequest.mock.results[0].value.write.mock.calls[0][0];
      const slackMessage = JSON.parse(writeCall);

      const dimensionsField = slackMessage.attachments[0].fields.find(
        (f: any) => f.title === 'Dimensions'
      );

      expect(dimensionsField).toBeDefined();
      expect(dimensionsField.value).toContain('FunctionName: TestFunction');
      expect(dimensionsField.value).toContain('Resource: TestResource');
    });
  });

  describe('Error Handling', () => {
    it('should retry on Slack API failure', async () => {
      let attemptCount = 0;
      mockHttpsRequest.mockImplementation((_options, callback) => {
        attemptCount++;
        
        const mockRequest = {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(),
        };

        mockRequest.end.mockImplementation(() => {
          const statusCode = attemptCount < 3 ? 500 : 200;
          const dataHandlers: Function[] = [];
          const endHandlers: Function[] = [];
          
          const mockResponse: any = {
            statusCode,
            on: jest.fn((event: string, handler: Function) => {
              if (event === 'data') {
                dataHandlers.push(handler);
              } else if (event === 'end') {
                endHandlers.push(handler);
              }
              return mockResponse;
            }),
          };

          callback(mockResponse);

          setImmediate(() => {
            dataHandlers.forEach(h => h(attemptCount < 3 ? 'error' : 'ok'));
            endHandlers.forEach(h => h());
          });
        });

        return mockRequest;
      });

      const event = createSNSEvent({
        AlarmName: 'TestAlarm',
        NewStateValue: 'ALARM',
        NewStateReason: 'Test',
        StateChangeTime: '2024-01-01T00:00:00.000Z',
        Region: 'us-east-1',
        Trigger: {
          MetricName: 'Test',
          Namespace: 'Test',
          Threshold: 1,
          ComparisonOperator: 'GreaterThanThreshold',
        },
      });

      await handler(event);

      expect(attemptCount).toBe(3);
    });

    it('should throw error after max retries', async () => {
      mockHttpsRequest.mockImplementation((_options, callback) => {
        const mockRequest = {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(),
        };

        mockRequest.end.mockImplementation(() => {
          const dataHandlers: Function[] = [];
          const endHandlers: Function[] = [];
          
          const mockResponse: any = {
            statusCode: 500,
            on: jest.fn((event: string, handler: Function) => {
              if (event === 'data') {
                dataHandlers.push(handler);
              } else if (event === 'end') {
                endHandlers.push(handler);
              }
              return mockResponse;
            }),
          };

          callback(mockResponse);

          setImmediate(() => {
            dataHandlers.forEach(h => h('error'));
            endHandlers.forEach(h => h());
          });
        });

        return mockRequest;
      });

      const event = createSNSEvent({
        AlarmName: 'TestAlarm',
        NewStateValue: 'ALARM',
        NewStateReason: 'Test',
        StateChangeTime: '2024-01-01T00:00:00.000Z',
        Region: 'us-east-1',
        Trigger: {
          MetricName: 'Test',
          Namespace: 'Test',
          Threshold: 1,
          ComparisonOperator: 'GreaterThanThreshold',
        },
      });

      await expect(handler(event)).rejects.toThrow();
    });

    it('should handle Secrets Manager failure', async () => {
      mockSecretsManagerSend.mockRejectedValue(new Error('Secrets Manager error'));

      const event = createSNSEvent({
        AlarmName: 'TestAlarm',
        NewStateValue: 'ALARM',
        NewStateReason: 'Test',
        StateChangeTime: '2024-01-01T00:00:00.000Z',
        Region: 'us-east-1',
        Trigger: {
          MetricName: 'Test',
          Namespace: 'Test',
          Threshold: 1,
          ComparisonOperator: 'GreaterThanThreshold',
        },
      });

      await expect(handler(event)).rejects.toThrow();
    });
  });

  describe('Webhook URL Retrieval', () => {
    it('should parse JSON secret with url field', async () => {
      mockSecretsManagerSend.mockResolvedValue({
        SecretString: JSON.stringify({ url: 'https://hooks.slack.com/test' }),
      });

      const event = createSNSEvent({
        AlarmName: 'TestAlarm',
        NewStateValue: 'ALARM',
        NewStateReason: 'Test',
        StateChangeTime: '2024-01-01T00:00:00.000Z',
        Region: 'us-east-1',
        Trigger: {
          MetricName: 'Test',
          Namespace: 'Test',
          Threshold: 1,
          ComparisonOperator: 'GreaterThanThreshold',
        },
      });

      await handler(event);

      expect(mockHttpsRequest).toHaveBeenCalled();
      const requestCall = mockHttpsRequest.mock.calls[0];
      expect(requestCall[0].hostname).toBe('hooks.slack.com');
    });

    it('should parse JSON secret with webhookUrl field', async () => {
      mockSecretsManagerSend.mockResolvedValue({
        SecretString: JSON.stringify({ webhookUrl: 'https://hooks.slack.com/test' }),
      });

      const event = createSNSEvent({
        AlarmName: 'TestAlarm',
        NewStateValue: 'ALARM',
        NewStateReason: 'Test',
        StateChangeTime: '2024-01-01T00:00:00.000Z',
        Region: 'us-east-1',
        Trigger: {
          MetricName: 'Test',
          Namespace: 'Test',
          Threshold: 1,
          ComparisonOperator: 'GreaterThanThreshold',
        },
      });

      await handler(event);

      expect(mockHttpsRequest).toHaveBeenCalled();
    });

    it('should use plain string secret', async () => {
      mockSecretsManagerSend.mockResolvedValue({
        SecretString: 'https://hooks.slack.com/services/TEST/WEBHOOK',
      });

      const event = createSNSEvent({
        AlarmName: 'TestAlarm',
        NewStateValue: 'ALARM',
        NewStateReason: 'Test',
        StateChangeTime: '2024-01-01T00:00:00.000Z',
        Region: 'us-east-1',
        Trigger: {
          MetricName: 'Test',
          Namespace: 'Test',
          Threshold: 1,
          ComparisonOperator: 'GreaterThanThreshold',
        },
      });

      await handler(event);

      expect(mockHttpsRequest).toHaveBeenCalled();
    });
  });
});

/**
 * Helper function to create SNS event for testing
 */
function createSNSEvent(alarmData: any): SNSEvent {
  const alarm = {
    AlarmName: alarmData.AlarmName,
    AlarmDescription: alarmData.AlarmDescription,
    AWSAccountId: '123456789012',
    NewStateValue: alarmData.NewStateValue,
    NewStateReason: alarmData.NewStateReason,
    StateChangeTime: alarmData.StateChangeTime,
    Region: alarmData.Region,
    AlarmArn: `arn:aws:cloudwatch:${alarmData.Region}:123456789012:alarm:${alarmData.AlarmName}`,
    OldStateValue: 'OK',
    Trigger: {
      MetricName: alarmData.Trigger.MetricName,
      Namespace: alarmData.Trigger.Namespace,
      StatisticType: 'Statistic',
      Statistic: 'Average',
      Unit: alarmData.Trigger.Unit,
      Dimensions: alarmData.Trigger.Dimensions || [],
      Period: 300,
      EvaluationPeriods: 1,
      ComparisonOperator: alarmData.Trigger.ComparisonOperator,
      Threshold: alarmData.Trigger.Threshold,
      TreatMissingData: 'notBreaching',
    },
  };

  return {
    Records: [
      {
        EventSource: 'aws:sns',
        EventVersion: '1.0',
        EventSubscriptionArn: 'arn:aws:sns:us-east-1:123456789012:test-topic',
        Sns: {
          Type: 'Notification',
          MessageId: 'test-message-id',
          TopicArn: 'arn:aws:sns:us-east-1:123456789012:test-topic',
          Subject: `ALARM: "${alarm.AlarmName}" in ${alarm.Region}`,
          Message: JSON.stringify(alarm),
          Timestamp: alarm.StateChangeTime,
          SignatureVersion: '1',
          Signature: 'test-signature',
          SigningCertUrl: 'https://test.com',
          UnsubscribeUrl: 'https://test.com',
          MessageAttributes: {},
        },
      },
    ],
  };
}
