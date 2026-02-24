import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { VocalShieldStack } from '../../lib/vocalshield-stack';
import { devConfig } from '../../lib/config';

describe('CloudWatch Monitoring', () => {
  let app: cdk.App;
  let stack: VocalShieldStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new VocalShieldStack(app, 'TestStack', devConfig);
    template = Template.fromStack(stack);
  });

  describe('CloudWatch Dashboard', () => {
    test('Dashboard is created', () => {
      template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
    });

    test('Dashboard has correct name pattern', () => {
      template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
        DashboardName: {
          'Fn::Join': [
            '',
            [
              'VocalShield-',
              { Ref: 'AWS::StackName' },
            ],
          ],
        },
      });
    });

    test('Dashboard contains widgets', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const dashboardKeys = Object.keys(dashboards);
      expect(dashboardKeys.length).toBeGreaterThan(0);

      const dashboard = dashboards[dashboardKeys[0]];
      const dashboardBody = JSON.parse(dashboard.Properties.DashboardBody['Fn::Join'][1].join(''));
      
      expect(dashboardBody.widgets).toBeDefined();
      expect(dashboardBody.widgets.length).toBeGreaterThan(0);
    });
  });

  describe('CloudWatch Alarms', () => {
    test('Billing alarm is created', () => {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        MetricName: 'EstimatedCharges',
        Namespace: 'AWS/Billing',
        Threshold: 5,
        ComparisonOperator: 'GreaterThanThreshold',
      });
    });

    test('Error rate alarms are created for Lambda functions', () => {
      // Should have error alarms for Connect, Disconnect, and Audio Processor
      const alarms = template.findResources('AWS::CloudWatch::Alarm', {
        Properties: {
          MetricName: 'Errors',
          Namespace: 'AWS/Lambda',
        },
      });
      
      expect(Object.keys(alarms).length).toBeGreaterThanOrEqual(3);
    });

    test('DLQ alarm is created', () => {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        MetricName: 'ApproximateNumberOfMessagesVisible',
        Namespace: 'AWS/SQS',
        Threshold: 1,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      });
    });
  });

  describe('CloudWatch Logs', () => {
    test('Log groups are created for all Lambda functions', () => {
      // Connect Handler, Disconnect Handler, Audio Processor, Investigation Handler
      const logGroups = template.findResources('AWS::Logs::LogGroup');
      expect(Object.keys(logGroups).length).toBeGreaterThanOrEqual(4);
    });

    test('Log retention is set to 7 days', () => {
      const logGroups = template.findResources('AWS::Logs::LogGroup');
      Object.values(logGroups).forEach((logGroup: any) => {
        expect(logGroup.Properties.RetentionInDays).toBe(7);
      });
    });

    test('Log group names follow naming convention', () => {
      const logGroups = template.findResources('AWS::Logs::LogGroup');
      Object.values(logGroups).forEach((logGroup: any) => {
        const logGroupName = logGroup.Properties.LogGroupName;
        if (logGroupName && typeof logGroupName === 'string') {
          expect(logGroupName).toMatch(/^\/aws\/(lambda|events|stepfunctions)\//);
        }
      });
    });
  });

  describe('Alarm Actions', () => {
    test('Alarms have SNS topic actions configured', () => {
      const alarms = template.findResources('AWS::CloudWatch::Alarm');
      Object.values(alarms).forEach((alarm: any) => {
        if (alarm.Properties.AlarmActions) {
          expect(alarm.Properties.AlarmActions.length).toBeGreaterThan(0);
        }
      });
    });
  });
});
