import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { VocalShieldStack } from '../../lib/vocalshield-stack';
import { devConfig } from '../../lib/config/dev';

/**
 * Unit tests for SNS Topic (Family Loop Notifications)
 * 
 * Tests verify:
 * - SNS topic is created with correct name and display name
 * - Topic is standard (not FIFO) for cost optimization
 * - Audio Processor Lambda has permission to publish to the topic
 * - SNS topic ARN is passed to Audio Processor as environment variable
 * - Topic has required tags
 * 
 * Requirements: 9.1, 9.2, 9.4
 */
describe('SNS Topic Configuration', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new VocalShieldStack(app, 'TestStack', devConfig);
    template = Template.fromStack(stack);
  });

  test('SNS topic is created with correct name', () => {
    // Verify SNS topic exists with correct display name
    template.hasResourceProperties('AWS::SNS::Topic', {
      DisplayName: 'VocalShield Fraud Alerts',
      FifoTopic: false,
    });
  });

  test('SNS topic is standard (not FIFO) for cost optimization', () => {
    // Verify topic is not FIFO (standard topics are cheaper)
    template.hasResourceProperties('AWS::SNS::Topic', {
      FifoTopic: false,
    });
  });

  test('SNS topic has required tags', () => {
    // Verify topic has Component tag
    template.hasResourceProperties('AWS::SNS::Topic', {
      Tags: [
        {
          Key: 'Component',
          Value: 'FamilyLoopNotifications',
        },
        {
          Key: 'CostCenter',
          Value: 'VocalShield-Infrastructure',
        },
        {
          Key: 'Environment',
          Value: 'dev',
        },
        {
          Key: 'ManagedBy',
          Value: 'CDK',
        },
        {
          Key: 'Project',
          Value: 'VocalShield',
        },
      ],
    });
  });

  test('Audio Processor Lambda has permission to publish to SNS topic', () => {
    // Verify IAM policy allows sns:Publish action
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sns:Publish',
            Effect: 'Allow',
            Resource: {
              Ref: Match.stringLikeRegexp('SnsTopicFamilyLoopTopic.*'),
            },
          }),
        ]),
      },
    });
  });

  test('SNS topic ARN is passed to Audio Processor as environment variable', () => {
    // Verify Audio Processor Lambda has SNS_TOPIC_ARN environment variable
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'VocalShield-AudioProcessor-dev',
      Environment: {
        Variables: {
          SNS_TOPIC_ARN: {
            Ref: Match.stringLikeRegexp('SnsTopicFamilyLoopTopic.*'),
          },
        },
      },
    });
  });

  test('SNS topic count includes Family Loop and Alarms topics', () => {
    // Verify SNS topics are created (Family Loop + CloudWatch Alarms)
    template.resourceCountIs('AWS::SNS::Topic', 2);
  });
});
