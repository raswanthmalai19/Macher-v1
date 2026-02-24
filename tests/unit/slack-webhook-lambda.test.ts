/**
 * Unit tests for Slack Webhook Lambda Construct
 * 
 * Tests verify:
 * - Lambda function is created with correct configuration
 * - Dead Letter Queue is configured
 * - SNS subscriptions are set up for all three topics
 * - Secrets Manager permissions are granted
 * - X-Ray tracing is enabled
 */

import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { SlackWebhookLambdaConstruct } from '../../lib/constructs/slack-webhook-lambda';
import { getConfig } from '../../lib/config';

describe('SlackWebhookLambdaConstruct', () => {
  let stack: cdk.Stack;
  let config: ReturnType<typeof getConfig>;
  let criticalTopic: sns.Topic;
  let warningTopic: sns.Topic;
  let infoTopic: sns.Topic;

  beforeEach(() => {
    const app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
    config = getConfig('dev'); // Use 'dev' since 'test' doesn't exist in config

    // Create test SNS topics
    criticalTopic = new sns.Topic(stack, 'CriticalTopic', {
      topicName: 'test-critical',
    });

    warningTopic = new sns.Topic(stack, 'WarningTopic', {
      topicName: 'test-warning',
    });

    infoTopic = new sns.Topic(stack, 'InfoTopic', {
      topicName: 'test-info',
    });
  });

  describe('Lambda Function Configuration', () => {
    it('should create Lambda function with correct runtime and architecture', () => {
      new SlackWebhookLambdaConstruct(stack, 'SlackWebhook', {
        config,
        criticalAlertsTopic: criticalTopic,
        warningAlertsTopic: warningTopic,
        infoAlertsTopic: infoTopic,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs20.x',
        Architectures: ['arm64'],
        Handler: 'index.handler',
        MemorySize: 512,
        Timeout: 10,
        TracingConfig: {
          Mode: 'Active',
        },
      });
    });

    it('should set correct environment variables', () => {
      new SlackWebhookLambdaConstruct(stack, 'SlackWebhook', {
        config,
        criticalAlertsTopic: criticalTopic,
        warningAlertsTopic: warningTopic,
        infoAlertsTopic: infoTopic,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            SLACK_WEBHOOK_SECRET_NAME: 'vocalshield/slack-webhook-url',
            ENVIRONMENT: 'dev',
          },
        },
      });
    });

    it('should configure Dead Letter Queue', () => {
      new SlackWebhookLambdaConstruct(stack, 'SlackWebhook', {
        config,
        criticalAlertsTopic: criticalTopic,
        warningAlertsTopic: warningTopic,
        infoAlertsTopic: infoTopic,
      });

      const template = Template.fromStack(stack);

      // Verify DLQ exists
      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: 'VocalShield-SlackWebhook-DLQ-dev',
        MessageRetentionPeriod: 1209600, // 14 days in seconds
      });

      // Verify Lambda has DLQ configured
      template.hasResourceProperties('AWS::Lambda::Function', {
        DeadLetterConfig: {
          TargetArn: {
            'Fn::GetAtt': [
              Match.stringLikeRegexp('SlackWebhookDLQ'),
              'Arn',
            ],
          },
        },
      });
    });
  });

  describe('SNS Subscriptions', () => {
    it('should subscribe Lambda to all three SNS topics', () => {
      new SlackWebhookLambdaConstruct(stack, 'SlackWebhook', {
        config,
        criticalAlertsTopic: criticalTopic,
        warningAlertsTopic: warningTopic,
        infoAlertsTopic: infoTopic,
      });

      const template = Template.fromStack(stack);

      // Should have 3 SNS subscriptions (one for each topic)
      const subscriptions = template.findResources('AWS::SNS::Subscription', {
        Properties: {
          Protocol: 'lambda',
        },
      });

      expect(Object.keys(subscriptions).length).toBe(3);
    });

    it('should configure DLQ for SNS subscriptions', () => {
      new SlackWebhookLambdaConstruct(stack, 'SlackWebhook', {
        config,
        criticalAlertsTopic: criticalTopic,
        warningAlertsTopic: warningTopic,
        infoAlertsTopic: infoTopic,
      });

      const template = Template.fromStack(stack);

      // Each subscription should have RedrivePolicy configured
      template.hasResourceProperties('AWS::SNS::Subscription', {
        Protocol: 'lambda',
        RedrivePolicy: {
          deadLetterTargetArn: {
            'Fn::GetAtt': [
              Match.stringLikeRegexp('SlackWebhookDLQ'),
              'Arn',
            ],
          },
        },
      });
    });
  });

  describe('IAM Permissions', () => {
    it('should grant Secrets Manager permissions', () => {
      new SlackWebhookLambdaConstruct(stack, 'SlackWebhook', {
        config,
        criticalAlertsTopic: criticalTopic,
        warningAlertsTopic: warningTopic,
        infoAlertsTopic: infoTopic,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'secretsmanager:GetSecretValue',
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  '',
                  Match.arrayWith([
                    Match.stringLikeRegexp('arn:aws:secretsmanager:'),
                    Match.stringLikeRegexp(':secret:vocalshield/slack-webhook-url-'),
                  ]),
                ],
              },
            }),
          ]),
        },
      });
    });
  });

  describe('CloudFormation Outputs', () => {
    it('should create outputs for Lambda ARN and DLQ', () => {
      new SlackWebhookLambdaConstruct(stack, 'SlackWebhook', {
        config,
        criticalAlertsTopic: criticalTopic,
        warningAlertsTopic: warningTopic,
        infoAlertsTopic: infoTopic,
      });

      const template = Template.fromStack(stack);

      // Check for Lambda function ARN output (CDK adds hash suffix)
      const outputs = template.findOutputs('*');
      const outputKeys = Object.keys(outputs);

      // Check that outputs exist with expected prefixes
      expect(outputKeys.some(key => key.startsWith('SlackWebhookSlackWebhookFunctionArn'))).toBe(true);
      expect(outputKeys.some(key => key.startsWith('SlackWebhookSlackWebhookDLQUrl'))).toBe(true);
      expect(outputKeys.some(key => key.startsWith('SlackWebhookSlackWebhookDLQArn'))).toBe(true);
    });
  });

  describe('Resource Tagging', () => {
    it('should apply correct tags to Lambda and DLQ', () => {
      new SlackWebhookLambdaConstruct(stack, 'SlackWebhook', {
        config,
        criticalAlertsTopic: criticalTopic,
        warningAlertsTopic: warningTopic,
        infoAlertsTopic: infoTopic,
      });

      const template = Template.fromStack(stack);

      // Lambda should have Component tag
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          {
            Key: 'Component',
            Value: 'SlackWebhook',
          },
        ]),
      });

      // DLQ should have Component tag
      template.hasResourceProperties('AWS::SQS::Queue', {
        Tags: Match.arrayWith([
          {
            Key: 'Component',
            Value: 'SlackWebhook',
          },
        ]),
      });
    });
  });
});
