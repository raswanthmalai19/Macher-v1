/**
 * Slack Webhook Lambda Construct
 * 
 * Creates a Lambda function that transforms SNS alarm notifications into Slack messages.
 * 
 * Features:
 * - Subscribes to SNS topics (critical, warning, info)
 * - Formats CloudWatch Alarm messages for Slack
 * - Color-codes messages by severity
 * - Retrieves webhook URL from Secrets Manager
 * - Dead Letter Queue for failed invocations
 * - X-Ray tracing enabled
 * 
 * Requirements: 16.5
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface SlackWebhookLambdaProps {
  config: EnvironmentConfig;
  criticalAlertsTopic: sns.Topic;
  warningAlertsTopic: sns.Topic;
  infoAlertsTopic: sns.Topic;
}

export class SlackWebhookLambdaConstruct extends Construct {
  public readonly slackWebhookFunction: lambda.Function;
  public readonly deadLetterQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: SlackWebhookLambdaProps) {
    super(scope, id);

    const { config, criticalAlertsTopic, warningAlertsTopic, infoAlertsTopic } = props;

    // Create Dead Letter Queue for failed Lambda invocations (Task 9.2)
    this.deadLetterQueue = new sqs.Queue(this, 'SlackWebhookDLQ', {
      queueName: `MACHER-SlackWebhook-DLQ-${config.tags.Environment}`,
      retentionPeriod: cdk.Duration.days(14), // Retain failed messages for 14 days
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // Create Slack Webhook Lambda function (Task 9.1)
    this.slackWebhookFunction = new lambda.Function(this, 'SlackWebhookFunction', {
      functionName: `MACHER-SlackWebhook-${config.tags.Environment}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/slack-webhook'),
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        SLACK_WEBHOOK_SECRET_NAME: `macher/slack-webhook-url`,
        ENVIRONMENT: config.tags.Environment,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Transforms SNS alarm notifications to Slack messages',
      deadLetterQueue: this.deadLetterQueue,
    });

    // Grant Secrets Manager permissions to retrieve Slack webhook URL
    this.slackWebhookFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:macher/slack-webhook-url-*`,
        ],
      })
    );

    // Subscribe Lambda to SNS topics (Task 9.2)
    // Critical alerts
    criticalAlertsTopic.addSubscription(
      new subscriptions.LambdaSubscription(this.slackWebhookFunction, {
        deadLetterQueue: this.deadLetterQueue,
      })
    );

    // Warning alerts
    warningAlertsTopic.addSubscription(
      new subscriptions.LambdaSubscription(this.slackWebhookFunction, {
        deadLetterQueue: this.deadLetterQueue,
      })
    );

    // Info alerts
    infoAlertsTopic.addSubscription(
      new subscriptions.LambdaSubscription(this.slackWebhookFunction, {
        deadLetterQueue: this.deadLetterQueue,
      })
    );

    // Add tags
    cdk.Tags.of(this.slackWebhookFunction).add('Component', 'SlackWebhook');
    cdk.Tags.of(this.deadLetterQueue).add('Component', 'SlackWebhook');

    // Outputs
    new cdk.CfnOutput(this, 'SlackWebhookFunctionArn', {
      value: this.slackWebhookFunction.functionArn,
      description: 'Slack Webhook Lambda Function ARN',
      exportName: `${config.tags.Environment}-MACHER-SlackWebhookFunction`,
    });

    new cdk.CfnOutput(this, 'SlackWebhookDLQUrl', {
      value: this.deadLetterQueue.queueUrl,
      description: 'Slack Webhook Dead Letter Queue URL',
      exportName: `${config.tags.Environment}-MACHER-SlackWebhookDLQ`,
    });

    new cdk.CfnOutput(this, 'SlackWebhookDLQArn', {
      value: this.deadLetterQueue.queueArn,
      description: 'Slack Webhook Dead Letter Queue ARN',
    });
  }
}
