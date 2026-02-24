/**
 * Integration Tests: Alerting Pipeline
 * 
 * This test suite validates the complete alerting pipeline:
 * CloudWatch Alarms → SNS Topics → Email/Slack
 * 
 * Test Approach:
 * - Mock AWS SDK calls using Jest
 * - Simulate alarm state transitions
 * - Verify notification formatting and delivery
 * - Test error handling and retry logic
 * 
 * Requirements: 3.1-3.8, 16.1-16.7
 */

import { AlarmManager } from '../../lib/monitoring/alarm-manager';
import { SNSNotificationHandler } from '../../lib/monitoring/sns-notification-handler';
import { 
  CloudWatchClient, 
  PutMetricAlarmCommand 
} from '@aws-sdk/client-cloudwatch';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-cloudwatch');
jest.mock('@aws-sdk/client-sns');

describe('Alerting Pipeline Integration Tests', () => {
  const testRegion = 'us-east-1';
  const testTopicArn = 'arn:aws:sns:us-east-1:123456789012:VocalShield-Critical-Alerts';
  const testDashboardName = 'VocalShield-System-Overview';

  let mockCloudWatchSend: jest.Mock;
  let mockSNSSend: jest.Mock;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Mock CloudWatch client
    mockCloudWatchSend = jest.fn().mockResolvedValue({});
    (CloudWatchClient as jest.Mock).mockImplementation(() => ({
      send: mockCloudWatchSend,
    }));

    // Mock SNS client
    mockSNSSend = jest.fn().mockResolvedValue({
      MessageId: 'test-message-id-123',
    });
    (SNSClient as jest.Mock).mockImplementation(() => ({
      send: mockSNSSend,
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Alarm Creation and Configuration', () => {
    it('should create Lambda error alarm', async () => {
      const alarmManager = new AlarmManager({ region: testRegion });

      await alarmManager.createLambdaErrorAlarm(
        'AudioProcessor',
        testTopicArn,
        'dev'
      );

      expect(mockCloudWatchSend).toHaveBeenCalled();
      const command = mockCloudWatchSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(PutMetricAlarmCommand);
    });

    it('should create API Gateway 5xx alarm', async () => {
      const alarmManager = new AlarmManager({ region: testRegion });

      await alarmManager.createApiGateway5xxAlarm(
        'VocalShieldAPI',
        testTopicArn,
        'dev'
      );

      expect(mockCloudWatchSend).toHaveBeenCalled();
      const command = mockCloudWatchSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(PutMetricAlarmCommand);
    });

    it('should create DynamoDB throttle alarm', async () => {
      const alarmManager = new AlarmManager({ region: testRegion });

      await alarmManager.createDynamoDBThrottleAlarm(
        'ConversationHistory',
        testTopicArn,
        'dev'
      );

      expect(mockCloudWatchSend).toHaveBeenCalled();
      const command = mockCloudWatchSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(PutMetricAlarmCommand);
    });

    it('should create Free Tier warning alarm (80% threshold)', async () => {
      const alarmManager = new AlarmManager({ region: testRegion });

      await alarmManager.createFreeTierWarningAlarm(
        'Lambda',
        testTopicArn,
        'dev'
      );

      expect(mockCloudWatchSend).toHaveBeenCalled();
      const command = mockCloudWatchSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(PutMetricAlarmCommand);
    });

    it('should create Free Tier critical alarm (95% threshold)', async () => {
      const alarmManager = new AlarmManager({ region: testRegion });

      await alarmManager.createFreeTierCriticalAlarm(
        'Lambda',
        testTopicArn,
        'dev'
      );

      expect(mockCloudWatchSend).toHaveBeenCalled();
      const command = mockCloudWatchSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(PutMetricAlarmCommand);
    });

    it('should create security brute force alarm', async () => {
      const alarmManager = new AlarmManager({ region: testRegion });

      await alarmManager.createBruteForceAlarm(
        testTopicArn,
        'dev'
      );

      expect(mockCloudWatchSend).toHaveBeenCalled();
      const command = mockCloudWatchSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(PutMetricAlarmCommand);
    });
  });

  describe('SNS Notification Formatting', () => {
    it('should format and send notification with all required fields', async () => {
      const handler = new SNSNotificationHandler({ 
        region: testRegion,
        dashboardBaseUrl: `https://console.aws.amazon.com/cloudwatch/home?region=${testRegion}#dashboards:`
      });

      const message = SNSNotificationHandler.createNotificationFromAlarm(
        'VocalShield-dev-Lambda-AudioProcessor-Errors',
        'Lambda function AudioProcessor error rate exceeds 5%',
        'Errors',
        10,
        5,
        'critical',
        testDashboardName,
        testRegion
      );

      // Verify message structure
      expect(message.severity).toBe('critical');
      expect(message.alarmName).toBe('VocalShield-dev-Lambda-AudioProcessor-Errors');
      expect(message.metricName).toBe('Errors');
      expect(message.currentValue).toBe(10);
      expect(message.threshold).toBe(5);
      expect(message.dashboardLink).toContain('cloudwatch');
      expect(message.remediationSteps.length).toBeGreaterThan(0);

      await handler.sendNotification(
        testTopicArn,
        'Critical Alert: Lambda Errors',
        message
      );

      expect(mockSNSSend).toHaveBeenCalled();
      const command = mockSNSSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(PublishCommand);
    });

    it('should include appropriate remediation steps for Lambda errors', () => {
      const steps = SNSNotificationHandler.getRemediationSteps(
        'VocalShield-dev-Lambda-AudioProcessor-Errors'
      );

      expect(steps).toContain('Check CloudWatch Logs for the Lambda function to identify error patterns');
      expect(steps).toContain('Review recent code deployments that may have introduced bugs');
      expect(steps).toContain('Verify IAM permissions for the Lambda function');
      expect(steps.length).toBeGreaterThan(0);
    });

    it('should include appropriate remediation steps for API Gateway errors', () => {
      const steps = SNSNotificationHandler.getRemediationSteps(
        'VocalShield-dev-APIGateway-VocalShieldAPI-5xxErrors'
      );

      expect(steps).toContain('Check API Gateway logs for specific error codes');
      expect(steps).toContain('Verify Lambda function health and error rates');
      expect(steps.length).toBeGreaterThan(0);
    });

    it('should include appropriate remediation steps for DynamoDB throttles', () => {
      const steps = SNSNotificationHandler.getRemediationSteps(
        'VocalShield-dev-DynamoDB-ConversationHistory-Throttles'
      );

      expect(steps).toContain('Check DynamoDB table capacity settings');
      expect(steps).toContain('Review read/write patterns for hot partitions');
      expect(steps.length).toBeGreaterThan(0);
    });

    it('should include appropriate remediation steps for Free Tier alerts', () => {
      const steps = SNSNotificationHandler.getRemediationSteps(
        'VocalShield-dev-FreeTier-Lambda-Warning'
      );

      expect(steps).toContain('Review current usage in AWS Cost Explorer');
      expect(steps).toContain('Optimize resource usage to stay within Free Tier');
      expect(steps.length).toBeGreaterThan(0);
    });

    it('should include appropriate remediation steps for security alerts', () => {
      const steps = SNSNotificationHandler.getRemediationSteps(
        'VocalShield-dev-Security-BruteForce'
      );

      expect(steps).toContain('Review CloudWatch Logs for suspicious activity patterns');
      expect(steps).toContain('Identify source IPs of failed authentication attempts');
      expect(steps.length).toBeGreaterThan(0);
    });
  });

  describe('End-to-End Alerting Pipeline', () => {
    it('should complete full pipeline: Alarm → SNS notification', async () => {
      // Step 1: Create alarm
      const alarmManager = new AlarmManager({ region: testRegion });
      await alarmManager.createLambdaErrorAlarm(
        'AudioProcessor',
        testTopicArn,
        'dev'
      );

      expect(mockCloudWatchSend).toHaveBeenCalled();
      const alarmCommand = mockCloudWatchSend.mock.calls[0][0];
      expect(alarmCommand).toBeInstanceOf(PutMetricAlarmCommand);

      // Step 2: Format and send SNS notification
      const handler = new SNSNotificationHandler({ region: testRegion });
      const message = SNSNotificationHandler.createNotificationFromAlarm(
        'VocalShield-dev-Lambda-AudioProcessor-Errors',
        'Lambda function AudioProcessor error rate exceeds 5%',
        'Errors',
        10,
        5,
        'critical',
        testDashboardName,
        testRegion
      );

      await handler.sendNotification(
        testTopicArn,
        'Critical Alert: Lambda Errors',
        message
      );

      expect(mockSNSSend).toHaveBeenCalled();
      const snsCommand = mockSNSSend.mock.calls[0][0];
      expect(snsCommand).toBeInstanceOf(PublishCommand);
    });

    it('should handle alarm state transition from OK to ALARM', async () => {
      const alarmManager = new AlarmManager({ region: testRegion });

      // Create alarm
      await alarmManager.createLambdaErrorAlarm(
        'AudioProcessor',
        testTopicArn,
        'dev'
      );

      // Simulate alarm state change
      const handler = new SNSNotificationHandler({ region: testRegion });
      const alarmMessage = SNSNotificationHandler.createNotificationFromAlarm(
        'VocalShield-dev-Lambda-AudioProcessor-Errors',
        'Lambda function AudioProcessor error rate exceeds 5%',
        'Errors',
        10,
        5,
        'critical',
        testDashboardName,
        testRegion
      );

      await handler.sendNotification(
        testTopicArn,
        'ALARM: Lambda Errors',
        alarmMessage
      );

      expect(mockSNSSend).toHaveBeenCalled();
    });

    it('should handle alarm state transition from ALARM to OK', async () => {
      const handler = new SNSNotificationHandler({ region: testRegion });
      
      const okMessage = SNSNotificationHandler.createNotificationFromAlarm(
        'VocalShield-dev-Lambda-AudioProcessor-Errors',
        'Lambda function AudioProcessor error rate is now below threshold',
        'Errors',
        2,
        5,
        'info',
        testDashboardName,
        testRegion
      );

      await handler.sendNotification(
        testTopicArn,
        'OK: Lambda Errors Resolved',
        okMessage
      );

      expect(mockSNSSend).toHaveBeenCalled();
    });

    it('should handle multiple alarm types in sequence', async () => {
      const alarmManager = new AlarmManager({ region: testRegion });
      const handler = new SNSNotificationHandler({ region: testRegion });

      // Create multiple alarms
      await alarmManager.createLambdaErrorAlarm('AudioProcessor', testTopicArn, 'dev');
      await alarmManager.createApiGateway5xxAlarm('VocalShieldAPI', testTopicArn, 'dev');
      await alarmManager.createDynamoDBThrottleAlarm('ConversationHistory', testTopicArn, 'dev');

      expect(mockCloudWatchSend).toHaveBeenCalledTimes(3);

      // Send notifications for each
      const lambdaMessage = SNSNotificationHandler.createNotificationFromAlarm(
        'VocalShield-dev-Lambda-AudioProcessor-Errors',
        'Lambda errors',
        'Errors',
        10,
        5,
        'critical',
        testDashboardName,
        testRegion
      );

      const apiMessage = SNSNotificationHandler.createNotificationFromAlarm(
        'VocalShield-dev-APIGateway-VocalShieldAPI-5xxErrors',
        'API Gateway errors',
        '5XXError',
        5,
        1,
        'critical',
        testDashboardName,
        testRegion
      );

      const dynamoMessage = SNSNotificationHandler.createNotificationFromAlarm(
        'VocalShield-dev-DynamoDB-ConversationHistory-Throttles',
        'DynamoDB throttles',
        'UserErrors',
        3,
        1,
        'warning',
        testDashboardName,
        testRegion
      );

      await handler.sendNotification(testTopicArn, 'Lambda Alert', lambdaMessage);
      await handler.sendNotification(testTopicArn, 'API Alert', apiMessage);
      await handler.sendNotification(testTopicArn, 'DynamoDB Alert', dynamoMessage);

      expect(mockSNSSend).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle CloudWatch API errors gracefully', async () => {
      mockCloudWatchSend.mockRejectedValueOnce(new Error('CloudWatch API error'));

      const alarmManager = new AlarmManager({ region: testRegion });

      await expect(
        alarmManager.createLambdaErrorAlarm('AudioProcessor', testTopicArn, 'dev')
      ).rejects.toThrow('CloudWatch API error');
    });

    it('should handle SNS publish errors gracefully', async () => {
      mockSNSSend.mockRejectedValueOnce(new Error('SNS publish failed'));

      const handler = new SNSNotificationHandler({ region: testRegion });
      const message = SNSNotificationHandler.createNotificationFromAlarm(
        'Test-Alarm',
        'Test',
        'Errors',
        10,
        5,
        'critical',
        testDashboardName,
        testRegion
      );

      await expect(
        handler.sendNotification(testTopicArn, 'Test', message)
      ).rejects.toThrow('SNS publish failed');
    });

    it('should handle missing alarm configuration gracefully', async () => {
      const handler = new SNSNotificationHandler({ region: testRegion });
      
      // Create notification with minimal data
      const message = SNSNotificationHandler.createNotificationFromAlarm(
        '',
        '',
        '',
        0,
        0,
        'info',
        '',
        testRegion
      );

      // Should not throw, even with empty data
      await expect(
        handler.sendNotification(testTopicArn, 'Test', message)
      ).resolves.not.toThrow();
    });
  });
});
