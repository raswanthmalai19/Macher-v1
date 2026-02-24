import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { SyntheticsCanaryConstruct } from '../../lib/constructs/synthetics-canary';
import { devConfig } from '../../lib/config';

describe('CloudWatch Synthetics Canary', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
    new SyntheticsCanaryConstruct(stack, 'TestCanary', {
      config: devConfig,
      websocketApiEndpoint: 'wss://test.execute-api.us-east-1.amazonaws.com/dev',
    });
    template = Template.fromStack(stack);
  });

  test('Canary is created', () => {
    template.resourceCountIs('AWS::Synthetics::Canary', 1);
  });

  test('Canary has correct schedule (5 minutes)', () => {
    template.hasResourceProperties('AWS::Synthetics::Canary', {
      Schedule: {
        Expression: 'rate(5 minutes)',
      },
    });
  });

  test('Canary has WebSocket URL environment variable', () => {
    template.hasResourceProperties('AWS::Synthetics::Canary', {
      RunConfig: {
        EnvironmentVariables: {
          WEBSOCKET_URL: 'wss://test.execute-api.us-east-1.amazonaws.com/dev',
        },
      },
    });
  });

  test('S3 bucket for artifacts is created', () => {
    template.resourceCountIs('AWS::S3::Bucket', 1);
  });

  test('S3 bucket has lifecycle rule for 7-day expiration', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: [
          {
            ExpirationInDays: 7,
            Status: 'Enabled',
          },
        ],
      },
    });
  });

  test('CloudWatch alarm is created for canary failures', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      ComparisonOperator: 'LessThanThreshold',
      Threshold: 90,
      EvaluationPeriods: 2,
    });
  });

  test('Canary has IAM role with necessary permissions', () => {
    const roles = template.findResources('AWS::IAM::Role', {
      Properties: {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: {
                Service: 'lambda.amazonaws.com',
              },
            },
          ],
        },
      },
    });

    expect(Object.keys(roles).length).toBeGreaterThan(0);
  });
});
