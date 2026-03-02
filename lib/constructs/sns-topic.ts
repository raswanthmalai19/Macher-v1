import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface SnsTopicConstructProps {
  config: EnvironmentConfig;
}

/**
 * Construct for MACHER SNS Topic (Family Loop Notifications)
 * 
 * Creates an SNS topic for delivering fraud detection notifications to family members.
 * 
 * Features:
 * - Standard topic (not FIFO) for cost optimization
 * - Display name for clear identification in notifications
 * - IAM policy allowing Audio Processor Lambda to publish
 * - Subscriptions (email, SMS) configured post-deployment via console/CLI
 * 
 * Requirements: 9.1, 9.2, 9.4
 */
export class SnsTopicConstruct extends Construct {
  public readonly familyLoopTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: SnsTopicConstructProps) {
    super(scope, id);

    const { config } = props;

    // Create SNS topic for Family Loop notifications (Task 10.1)
    this.familyLoopTopic = new sns.Topic(this, 'FamilyLoopTopic', {
      topicName: `MACHER-FamilyLoop-${config.tags.Environment}`,
      displayName: 'MACHER Fraud Alerts',
      fifo: false, // Standard topic for cost optimization
    });

    // Apply tags
    cdk.Tags.of(this.familyLoopTopic).add('Component', 'FamilyLoopNotifications');

    // Note: Email and SMS subscriptions are configured post-deployment via AWS Console or CLI
    // This is intentional as subscriptions require confirmation and are user-specific
  }

  /**
   * Grant publish permissions to a Lambda function
   * 
   * @param lambdaFunction The Lambda function to grant permissions to
   */
  public grantPublish(lambdaFunction: cdk.aws_lambda.IFunction): void {
    this.familyLoopTopic.grantPublish(lambdaFunction);
  }
}
