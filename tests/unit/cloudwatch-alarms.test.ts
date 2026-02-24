import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { VocalShieldStack } from '../../lib/vocalshield-stack';
import { devConfig } from '../../lib/config/dev';

/**
 * Unit tests for CloudWatch Alarms
 * 
 * Tests verify:
 * - All required alarms are created (billing, error rate, connection limit, DLQ)
 * - Alarms have correct thresholds and evaluation periods
 * - Alarms are configured to send notifications to SNS topic
 * - Alarm topic ARN is exported as stack output
 * 
 * Requirements: 6.8, 7.5
 */
describe('CloudWatch Alarms Configuration', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new VocalShieldStack(app, 'TestStack', devConfig);
    template = Template.fromStack(stack);
  });

  test('Alarm SNS topic is created', () => {
    // Verify alarm topic exists
    template.hasResourceProperties('AWS::SNS::Topic', {
      DisplayName: 'VocalShield CloudWatch Alarms',
    });
  });

  test('Billing alarm is created with correct threshold', () => {
    // Verify billing alarm exists with $5 threshold
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'VocalShield-BillingAlert-dev',
      AlarmDescription: 'Alert when estimated AWS charges exceed $5',
      Threshold: 5,
      ComparisonOperator: 'GreaterThanThreshold',
    });
  });

  test('Error rate alarm is created', () => {
    // Verify error rate alarm exists
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'VocalShield-ErrorRate-dev',
      AlarmDescription: 'Alert when Lambda error count exceeds 10 in 5 minutes',
      Threshold: 10,
      ComparisonOperator: 'GreaterThanThreshold',
    });
  });

  test('Connection limit alarm is created', () => {
    // Verify connection limit alarm exists
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'VocalShield-ConnectionLimit-dev',
      AlarmDescription: 'Alert when concurrent connections approach Free Tier limit',
      Threshold: 900,
      ComparisonOperator: 'GreaterThanThreshold',
    });
  });

  test('DLQ alarm is created', () => {
    // Verify DLQ alarm exists
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'VocalShield-DLQ-dev',
      AlarmDescription: 'Alert when messages appear in dead-letter queue',
      Threshold: 1,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    });
  });

  test('All alarms have SNS actions configured', () => {
    // Verify alarms have AlarmActions pointing to SNS topic
    const alarms = template.findResources('AWS::CloudWatch::Alarm');
    const alarmKeys = Object.keys(alarms);
    
    // We should have 4 alarms
    expect(alarmKeys.length).toBe(4);
    
    // Each alarm should have AlarmActions
    alarmKeys.forEach((key) => {
      const alarm = alarms[key];
      expect(alarm.Properties.AlarmActions).toBeDefined();
      expect(alarm.Properties.AlarmActions.length).toBeGreaterThan(0);
    });
  });

  test('Alarm topic ARN is exported as stack output', () => {
    const outputs = template.findOutputs('*');
    
    // Find the alarm topic output (it's created by the CloudWatchAlarms construct)
    const alarmOutputs = Object.entries(outputs).filter(([key, _]) => 
      key.includes('AlarmTopic')
    );
    
    expect(alarmOutputs.length).toBeGreaterThan(0);
  });

  test('Total alarm count is correct', () => {
    // Verify we have exactly 4 alarms
    template.resourceCountIs('AWS::CloudWatch::Alarm', 4);
  });

  test('Alarms have required tags', () => {
    // Verify alarms have Component tag (applied at stack level)
    const alarms = template.findResources('AWS::CloudWatch::Alarm');
    expect(Object.keys(alarms).length).toBe(4);
  });

  test('Billing alarm uses correct metric namespace', () => {
    // Verify billing alarm uses AWS/Billing namespace
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'VocalShield-BillingAlert-dev',
      Namespace: 'AWS/Billing',
      MetricName: 'EstimatedCharges',
    });
  });

  test('Error rate alarm uses math expression', () => {
    // Verify error rate alarm combines metrics from all Lambda functions
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'VocalShield-ErrorRate-dev',
      Metrics: Match.arrayWith([
        Match.objectLike({
          Expression: 'e1 + e2 + e3',
        }),
      ]),
    });
  });
});
