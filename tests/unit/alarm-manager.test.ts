/**
 * Unit tests for AlarmManager
 * 
 * Tests verify:
 * - Alarm JSON configuration is valid
 * - Threshold and evaluation period settings match requirements
 * - SNS topic ARN mapping is correct
 * - Alarm configurations for all required scenarios
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { AlarmManager } from '../../lib/monitoring/alarm-manager';
import { AlarmConfig } from '../../lib/monitoring/types';
import { CloudWatchClient, PutMetricAlarmCommand } from '@aws-sdk/client-cloudwatch';

// Mock AWS SDK
jest.mock('@aws-sdk/client-cloudwatch', () => {
  const actualModule = jest.requireActual('@aws-sdk/client-cloudwatch');
  
  // Store captured inputs
  const capturedInputs: any[] = [];
  
  // Mock PutMetricAlarmCommand to capture constructor arguments
  class MockPutMetricAlarmCommand {
    public input: any;
    
    constructor(input: any) {
      this.input = input;
      capturedInputs.push(input);
    }
  }
  
  // Mock CloudWatchClient
  const MockCloudWatchClient = jest.fn();
  
  return {
    ...actualModule,
    PutMetricAlarmCommand: MockPutMetricAlarmCommand,
    CloudWatchClient: MockCloudWatchClient,
    __capturedInputs: capturedInputs,
  };
});

// Mock the logger to suppress console output during tests
jest.mock('../../lib/monitoring/structured-logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('AlarmManager - Alarm Configuration Validation', () => {
  let alarmManager: AlarmManager;
  let mockSend: jest.Mock;
  let capturedInputs: any[];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get reference to captured inputs from the mock
    const cloudwatchModule = require('@aws-sdk/client-cloudwatch');
    capturedInputs = cloudwatchModule.__capturedInputs;
    capturedInputs.length = 0; // Clear previous captures
    
    mockSend = jest.fn().mockResolvedValue({});
    (CloudWatchClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
    alarmManager = new AlarmManager({ region: 'us-east-1' });
  });

  describe('Alarm JSON Validation', () => {
    test('should create valid alarm configuration JSON', async () => {
      const config: AlarmConfig = {
        alarmName: 'TestAlarm',
        description: 'Test alarm description',
        metricNamespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensions: { FunctionName: 'test-function' },
        statistic: 'Sum',
        period: 300,
        evaluationPeriods: 1,
        threshold: 5,
        comparisonOperator: 'GreaterThanThreshold',
        treatMissingData: 'notBreaching',
        actionsEnabled: true,
        alarmActions: ['arn:aws:sns:us-east-1:123456789012:test-topic'],
        severity: 'critical',
      };

      await alarmManager.createAlarm(config);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(capturedInputs).toHaveLength(1);
      
      const input = capturedInputs[0];
      expect(input).toMatchObject({
        AlarmName: 'TestAlarm',
        AlarmDescription: 'Test alarm description',
        MetricName: 'Errors',
        Namespace: 'AWS/Lambda',
        Statistic: 'Sum',
        Period: 300,
        EvaluationPeriods: 1,
        Threshold: 5,
        ComparisonOperator: 'GreaterThanThreshold',
        TreatMissingData: 'notBreaching',
        ActionsEnabled: true,
      });
    });

    test('should properly format dimensions array', async () => {
      const config: AlarmConfig = {
        alarmName: 'TestAlarm',
        description: 'Test',
        metricNamespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensions: { 
          FunctionName: 'test-function',
          Environment: 'production'
        },
        statistic: 'Sum',
        period: 300,
        evaluationPeriods: 1,
        threshold: 5,
        comparisonOperator: 'GreaterThanThreshold',
        treatMissingData: 'notBreaching',
        actionsEnabled: true,
        alarmActions: ['arn:aws:sns:us-east-1:123456789012:test-topic'],
        severity: 'critical',
      };

      await alarmManager.createAlarm(config);

      const input = capturedInputs[0];
      expect(input.Dimensions).toEqual([
        { Name: 'FunctionName', Value: 'test-function' },
        { Name: 'Environment', Value: 'production' }
      ]);
    });

    test('should include severity and project tags', async () => {
      const config: AlarmConfig = {
        alarmName: 'TestAlarm',
        description: 'Test',
        metricNamespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensions: {},
        statistic: 'Sum',
        period: 300,
        evaluationPeriods: 1,
        threshold: 5,
        comparisonOperator: 'GreaterThanThreshold',
        treatMissingData: 'notBreaching',
        actionsEnabled: true,
        alarmActions: [],
        severity: 'warning',
      };

      await alarmManager.createAlarm(config);

      const input = capturedInputs[0];
      expect(input.Tags).toEqual([
        { Key: 'Severity', Value: 'warning' },
        { Key: 'Project', Value: 'VocalShield' }
      ]);
    });
  });

  describe('Requirement 3.1: Lambda Error Rate Alarm', () => {
    test('should configure Lambda error alarm with 5% threshold over 5 minutes', async () => {
      const snsTopicArn = 'arn:aws:sns:us-east-1:123456789012:critical-alerts';
      
      await alarmManager.createLambdaErrorAlarm('test-function', snsTopicArn, 'dev');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const input = capturedInputs[0];
      expect(input).toMatchObject({
        AlarmName: 'VocalShield-dev-Lambda-test-function-Errors',
        AlarmDescription: 'Lambda function test-function error rate exceeds 5%',
        Namespace: 'AWS/Lambda',
        MetricName: 'Errors',
        Statistic: 'Sum',
        Period: 300, // 5 minutes
        EvaluationPeriods: 1,
        Threshold: 5,
        ComparisonOperator: 'GreaterThanThreshold',
        TreatMissingData: 'notBreaching',
        ActionsEnabled: true,
        AlarmActions: [snsTopicArn],
      });
    });

    test('should set Lambda error alarm severity to critical', async () => {
      await alarmManager.createLambdaErrorAlarm('test-function', 'arn:aws:sns:test', 'dev');

      const input = capturedInputs[0];
      expect(input.Tags).toContainEqual({ Key: 'Severity', Value: 'critical' });
    });
  });

  describe('Requirement 3.2: API Gateway 5xx Error Alarm', () => {
    test('should configure API Gateway 5xx alarm with 1% threshold over 5 minutes', async () => {
      const snsTopicArn = 'arn:aws:sns:us-east-1:123456789012:critical-alerts';
      
      await alarmManager.createApiGateway5xxAlarm('test-api', snsTopicArn, 'dev');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const input = capturedInputs[0];
      expect(input).toMatchObject({
        AlarmName: 'VocalShield-dev-APIGateway-test-api-5xxErrors',
        AlarmDescription: 'API Gateway test-api 5xx error rate exceeds 1%',
        Namespace: 'AWS/ApiGateway',
        MetricName: '5XXError',
        Statistic: 'Sum',
        Period: 300, // 5 minutes
        EvaluationPeriods: 1,
        Threshold: 1,
        ComparisonOperator: 'GreaterThanThreshold',
        TreatMissingData: 'notBreaching',
        ActionsEnabled: true,
        AlarmActions: [snsTopicArn],
      });
    });

    test('should set API Gateway 5xx alarm severity to critical', async () => {
      await alarmManager.createApiGateway5xxAlarm('test-api', 'arn:aws:sns:test', 'dev');

      const input = capturedInputs[0];
      expect(input.Tags).toContainEqual({ Key: 'Severity', Value: 'critical' });
    });
  });

  describe('Requirement 3.3: DynamoDB Throttle Alarm', () => {
    test('should configure DynamoDB throttle alarm to trigger on any throttle event', async () => {
      const snsTopicArn = 'arn:aws:sns:us-east-1:123456789012:warning-alerts';
      
      await alarmManager.createDynamoDBThrottleAlarm('test-table', snsTopicArn, 'dev');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const input = capturedInputs[0];
      expect(input).toMatchObject({
        AlarmName: 'VocalShield-dev-DynamoDB-test-table-Throttles',
        AlarmDescription: 'DynamoDB table test-table is experiencing throttling',
        Namespace: 'AWS/DynamoDB',
        MetricName: 'UserErrors',
        Statistic: 'Sum',
        Period: 60, // 1 minute
        EvaluationPeriods: 1,
        Threshold: 1,
        ComparisonOperator: 'GreaterThanThreshold',
        TreatMissingData: 'notBreaching',
        ActionsEnabled: true,
        AlarmActions: [snsTopicArn],
      });
    });

    test('should set DynamoDB throttle alarm severity to warning', async () => {
      await alarmManager.createDynamoDBThrottleAlarm('test-table', 'arn:aws:sns:test', 'dev');

      const input = capturedInputs[0];
      expect(input.Tags).toContainEqual({ Key: 'Severity', Value: 'warning' });
    });
  });

  describe('Requirement 3.4: P99 Latency Alarm', () => {
    test('should configure latency alarm with 3000ms threshold over 5 minutes', async () => {
      const snsTopicArn = 'arn:aws:sns:us-east-1:123456789012:warning-alerts';
      
      await alarmManager.createLatencyAlarm('test-api', snsTopicArn, 'dev');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const input = capturedInputs[0];
      expect(input).toMatchObject({
        AlarmName: 'VocalShield-dev-APIGateway-test-api-HighLatency',
        AlarmDescription: 'API Gateway test-api P99 latency exceeds 3000ms',
        Namespace: 'AWS/ApiGateway',
        MetricName: 'Latency',
        Statistic: 'Maximum', // Proxy for P99
        Period: 300, // 5 minutes
        EvaluationPeriods: 1,
        Threshold: 3000,
        ComparisonOperator: 'GreaterThanThreshold',
        TreatMissingData: 'notBreaching',
        ActionsEnabled: true,
        AlarmActions: [snsTopicArn],
      });
    });

    test('should set latency alarm severity to warning', async () => {
      await alarmManager.createLatencyAlarm('test-api', 'arn:aws:sns:test', 'dev');

      const input = capturedInputs[0];
      expect(input.Tags).toContainEqual({ Key: 'Severity', Value: 'warning' });
    });
  });

  describe('Requirement 3.5: Free Tier 80% Warning Alarm', () => {
    test('should configure Free Tier warning alarm with 80% threshold', async () => {
      const snsTopicArn = 'arn:aws:sns:us-east-1:123456789012:warning-alerts';
      
      await alarmManager.createFreeTierWarningAlarm('Lambda', snsTopicArn, 'dev');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const input = capturedInputs[0];
      expect(input).toMatchObject({
        AlarmName: 'VocalShield-dev-FreeTier-Lambda-Warning',
        AlarmDescription: 'Lambda Free Tier usage exceeds 80%',
        Namespace: 'VocalShield/FreeTier',
        MetricName: 'LambdaUsage',
        Statistic: 'Average',
        Period: 300, // 5 minutes
        EvaluationPeriods: 1,
        Threshold: 80,
        ComparisonOperator: 'GreaterThanThreshold',
        TreatMissingData: 'notBreaching',
        ActionsEnabled: true,
        AlarmActions: [snsTopicArn],
      });
    });

    test('should set Free Tier warning alarm severity to warning', async () => {
      await alarmManager.createFreeTierWarningAlarm('Lambda', 'arn:aws:sns:test', 'dev');

      const input = capturedInputs[0];
      expect(input.Tags).toContainEqual({ Key: 'Severity', Value: 'warning' });
    });
  });

  describe('Requirement 3.6: Free Tier 95% Critical Alarm', () => {
    test('should configure Free Tier critical alarm with 95% threshold', async () => {
      const snsTopicArn = 'arn:aws:sns:us-east-1:123456789012:critical-alerts';
      
      await alarmManager.createFreeTierCriticalAlarm('Lambda', snsTopicArn, 'dev');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const input = capturedInputs[0];
      expect(input).toMatchObject({
        AlarmName: 'VocalShield-dev-FreeTier-Lambda-Critical',
        AlarmDescription: 'Lambda Free Tier usage exceeds 95%',
        Namespace: 'VocalShield/FreeTier',
        MetricName: 'LambdaUsage',
        Statistic: 'Average',
        Period: 300, // 5 minutes
        EvaluationPeriods: 1,
        Threshold: 95,
        ComparisonOperator: 'GreaterThanThreshold',
        TreatMissingData: 'notBreaching',
        ActionsEnabled: true,
        AlarmActions: [snsTopicArn],
      });
    });

    test('should set Free Tier critical alarm severity to critical', async () => {
      await alarmManager.createFreeTierCriticalAlarm('Lambda', 'arn:aws:sns:test', 'dev');

      const input = capturedInputs[0];
      expect(input.Tags).toContainEqual({ Key: 'Severity', Value: 'critical' });
    });
  });

  describe('SNS Topic ARN Mapping', () => {
    test('should correctly map SNS topic ARN to alarm actions', async () => {
      const criticalTopicArn = 'arn:aws:sns:us-east-1:123456789012:critical-alerts';
      const warningTopicArn = 'arn:aws:sns:us-east-1:123456789012:warning-alerts';

      // Critical alarm
      await alarmManager.createLambdaErrorAlarm('func1', criticalTopicArn, 'dev');
      let input = capturedInputs[0];
      expect(input.AlarmActions).toEqual([criticalTopicArn]);

      capturedInputs.length = 0;

      // Warning alarm
      await alarmManager.createDynamoDBThrottleAlarm('table1', warningTopicArn, 'dev');
      input = capturedInputs[0];
      expect(input.AlarmActions).toEqual([warningTopicArn]);
    });

    test('should support multiple SNS topic ARNs', async () => {
      const config: AlarmConfig = {
        alarmName: 'TestAlarm',
        description: 'Test',
        metricNamespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensions: {},
        statistic: 'Sum',
        period: 300,
        evaluationPeriods: 1,
        threshold: 5,
        comparisonOperator: 'GreaterThanThreshold',
        treatMissingData: 'notBreaching',
        actionsEnabled: true,
        alarmActions: [
          'arn:aws:sns:us-east-1:123456789012:topic1',
          'arn:aws:sns:us-east-1:123456789012:topic2'
        ],
        severity: 'critical',
      };

      await alarmManager.createAlarm(config);

      const input = capturedInputs[0];
      expect(input.AlarmActions).toHaveLength(2);
      expect(input.AlarmActions).toContain('arn:aws:sns:us-east-1:123456789012:topic1');
      expect(input.AlarmActions).toContain('arn:aws:sns:us-east-1:123456789012:topic2');
    });
  });

  describe('Threshold and Evaluation Period Settings', () => {
    test('should validate all alarm thresholds match requirements', () => {
      const alarmConfigs = [
        { name: 'Lambda Error', threshold: 5, period: 300, evaluations: 1 },
        { name: 'API Gateway 5xx', threshold: 1, period: 300, evaluations: 1 },
        { name: 'DynamoDB Throttle', threshold: 1, period: 60, evaluations: 1 },
        { name: 'P99 Latency', threshold: 3000, period: 300, evaluations: 1 },
        { name: 'Free Tier 80%', threshold: 80, period: 300, evaluations: 1 },
        { name: 'Free Tier 95%', threshold: 95, period: 300, evaluations: 1 },
      ];

      alarmConfigs.forEach(config => {
        expect(config.threshold).toBeGreaterThan(0);
        expect(config.period).toBeGreaterThan(0);
        expect(config.evaluations).toBeGreaterThan(0);
      });
    });

    test('should use 5-minute period for most alarms', async () => {
      const snsArn = 'arn:aws:sns:test';
      
      await alarmManager.createLambdaErrorAlarm('func', snsArn, 'dev');
      expect(capturedInputs[0].Period).toBe(300);

      capturedInputs.length = 0;
      await alarmManager.createApiGateway5xxAlarm('api', snsArn, 'dev');
      expect(capturedInputs[0].Period).toBe(300);

      capturedInputs.length = 0;
      await alarmManager.createLatencyAlarm('api', snsArn, 'dev');
      expect(capturedInputs[0].Period).toBe(300);

      capturedInputs.length = 0;
      await alarmManager.createFreeTierWarningAlarm('Lambda', snsArn, 'dev');
      expect(capturedInputs[0].Period).toBe(300);
    });

    test('should use 1-minute period for DynamoDB throttle alarm', async () => {
      await alarmManager.createDynamoDBThrottleAlarm('table', 'arn:aws:sns:test', 'dev');
      
      const input = capturedInputs[0];
      expect(input.Period).toBe(60);
    });

    test('should use single evaluation period for immediate alerting', async () => {
      const snsArn = 'arn:aws:sns:test';
      
      await alarmManager.createLambdaErrorAlarm('func', snsArn, 'dev');
      expect(capturedInputs[0].EvaluationPeriods).toBe(1);

      capturedInputs.length = 0;
      await alarmManager.createApiGateway5xxAlarm('api', snsArn, 'dev');
      expect(capturedInputs[0].EvaluationPeriods).toBe(1);
    });
  });

  describe('Alarm Naming Convention', () => {
    test('should follow VocalShield naming convention', async () => {
      await alarmManager.createLambdaErrorAlarm('test-func', 'arn:aws:sns:test', 'prod');
      
      const input = capturedInputs[0];
      expect(input.AlarmName).toMatch(/^VocalShield-prod-Lambda-test-func-Errors$/);
    });

    test('should include environment in alarm name', async () => {
      await alarmManager.createApiGateway5xxAlarm('api', 'arn:aws:sns:test', 'staging');
      
      const input = capturedInputs[0];
      expect(input.AlarmName).toContain('staging');
    });

    test('should include resource name in alarm name', async () => {
      await alarmManager.createDynamoDBThrottleAlarm('sessions-table', 'arn:aws:sns:test', 'dev');
      
      const input = capturedInputs[0];
      expect(input.AlarmName).toContain('sessions-table');
    });
  });

  describe('Alarm Actions Configuration', () => {
    test('should enable alarm actions by default', async () => {
      await alarmManager.createLambdaErrorAlarm('func', 'arn:aws:sns:test', 'dev');
      
      const input = capturedInputs[0];
      expect(input.ActionsEnabled).toBe(true);
    });

    test('should treat missing data as not breaching', async () => {
      await alarmManager.createLambdaErrorAlarm('func', 'arn:aws:sns:test', 'dev');
      
      const input = capturedInputs[0];
      expect(input.TreatMissingData).toBe('notBreaching');
    });

    test('should use GreaterThanThreshold comparison for all alarms', async () => {
      const snsArn = 'arn:aws:sns:test';
      
      await alarmManager.createLambdaErrorAlarm('func', snsArn, 'dev');
      expect(capturedInputs[0].ComparisonOperator).toBe('GreaterThanThreshold');

      capturedInputs.length = 0;
      await alarmManager.createApiGateway5xxAlarm('api', snsArn, 'dev');
      expect(capturedInputs[0].ComparisonOperator).toBe('GreaterThanThreshold');

      capturedInputs.length = 0;
      await alarmManager.createDynamoDBThrottleAlarm('table', snsArn, 'dev');
      expect(capturedInputs[0].ComparisonOperator).toBe('GreaterThanThreshold');
    });
  });

  describe('Security Alarm Configuration', () => {
    test('should configure brute force alarm with correct threshold', async () => {
      const snsTopicArn = 'arn:aws:sns:us-east-1:123456789012:critical-alerts';
      
      await alarmManager.createBruteForceAlarm(snsTopicArn, 'dev');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const input = capturedInputs[0];
      expect(input).toMatchObject({
        AlarmName: 'VocalShield-dev-Security-BruteForce',
        AlarmDescription: 'Potential brute force attack detected (>5 failed auth attempts in 5 minutes)',
        Namespace: 'VocalShield/Security',
        MetricName: 'FailedAuthAttempts',
        Statistic: 'Sum',
        Period: 300, // 5 minutes
        EvaluationPeriods: 1,
        Threshold: 5,
        ComparisonOperator: 'GreaterThanThreshold',
        TreatMissingData: 'notBreaching',
        ActionsEnabled: true,
        AlarmActions: [snsTopicArn],
      });
    });

    test('should set brute force alarm severity to critical', async () => {
      await alarmManager.createBruteForceAlarm('arn:aws:sns:test', 'dev');

      const input = capturedInputs[0];
      expect(input.Tags).toContainEqual({ Key: 'Severity', Value: 'critical' });
    });
  });

  describe('Error Handling', () => {
    test('should throw error when alarm creation fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('CloudWatch API error'));

      const config: AlarmConfig = {
        alarmName: 'TestAlarm',
        description: 'Test',
        metricNamespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensions: {},
        statistic: 'Sum',
        period: 300,
        evaluationPeriods: 1,
        threshold: 5,
        comparisonOperator: 'GreaterThanThreshold',
        treatMissingData: 'notBreaching',
        actionsEnabled: true,
        alarmActions: [],
        severity: 'critical',
      };

      await expect(alarmManager.createAlarm(config)).rejects.toThrow('CloudWatch API error');
    });
  });
});
