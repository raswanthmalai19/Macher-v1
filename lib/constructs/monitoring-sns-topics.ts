/**
 * Monitoring SNS Topics Construct
 * 
 * Creates SNS topics for different alarm severity levels:
 * - Critical alerts (immediate action required)
 * - Warning alerts (attention needed)
 * - Info alerts (informational)
 * 
 * Also creates Slack webhook Lambda for Slack notifications.
 */

import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';
import { SlackWebhookLambdaConstruct } from './slack-webhook-lambda';

export interface MonitoringSnsTopicsProps {
  config: EnvironmentConfig;
  emailSubscriptions?: {
    critical?: string[];
    warning?: string[];
    info?: string[];
  };
  enableSlackNotifications?: boolean;
}

export class MonitoringSnsTopicsConstruct extends Construct {
  public readonly criticalAlertsTopic: sns.Topic;
  public readonly warningAlertsTopic: sns.Topic;
  public readonly infoAlertsTopic: sns.Topic;
  public readonly slackWebhook?: SlackWebhookLambdaConstruct;

  constructor(scope: Construct, id: string, props: MonitoringSnsTopicsProps) {
    super(scope, id);

    const { config, emailSubscriptions, enableSlackNotifications = true } = props;

    // Critical alerts topic
    this.criticalAlertsTopic = new sns.Topic(this, 'CriticalAlertsTopic', {
      topicName: `MACHER-${config.tags.Environment}-Critical-Alerts`,
      displayName: 'MACHER Critical Alerts',
      fifo: false,
    });

    // Warning alerts topic
    this.warningAlertsTopic = new sns.Topic(this, 'WarningAlertsTopic', {
      topicName: `MACHER-${config.tags.Environment}-Warning-Alerts`,
      displayName: 'MACHER Warning Alerts',
      fifo: false,
    });

    // Info alerts topic
    this.infoAlertsTopic = new sns.Topic(this, 'InfoAlertsTopic', {
      topicName: `MACHER-${config.tags.Environment}-Info-Alerts`,
      displayName: 'MACHER Info Alerts',
      fifo: false,
    });

    // Add email subscriptions if provided
    if (emailSubscriptions?.critical) {
      emailSubscriptions.critical.forEach(email => {
        this.criticalAlertsTopic.addSubscription(
          new subscriptions.EmailSubscription(email)
        );
      });
    }

    if (emailSubscriptions?.warning) {
      emailSubscriptions.warning.forEach(email => {
        this.warningAlertsTopic.addSubscription(
          new subscriptions.EmailSubscription(email)
        );
      });
    }

    if (emailSubscriptions?.info) {
      emailSubscriptions.info.forEach(email => {
        this.infoAlertsTopic.addSubscription(
          new subscriptions.EmailSubscription(email)
        );
      });
    }

    // Create Slack webhook Lambda and subscribe to topics (Task 9.2)
    if (enableSlackNotifications) {
      this.slackWebhook = new SlackWebhookLambdaConstruct(this, 'SlackWebhook', {
        config,
        criticalAlertsTopic: this.criticalAlertsTopic,
        warningAlertsTopic: this.warningAlertsTopic,
        infoAlertsTopic: this.infoAlertsTopic,
      });
    }

    // Add tags
    cdk.Tags.of(this.criticalAlertsTopic).add('Severity', 'critical');
    cdk.Tags.of(this.warningAlertsTopic).add('Severity', 'warning');
    cdk.Tags.of(this.infoAlertsTopic).add('Severity', 'info');

    // Outputs
    new cdk.CfnOutput(this, 'CriticalAlertsTopicArn', {
      value: this.criticalAlertsTopic.topicArn,
      description: 'SNS Topic ARN for critical alerts',
      exportName: `${config.tags.Environment}-MACHER-CriticalAlertsTopic`,
    });

    new cdk.CfnOutput(this, 'WarningAlertsTopicArn', {
      value: this.warningAlertsTopic.topicArn,
      description: 'SNS Topic ARN for warning alerts',
      exportName: `${config.tags.Environment}-MACHER-WarningAlertsTopic`,
    });

    new cdk.CfnOutput(this, 'InfoAlertsTopicArn', {
      value: this.infoAlertsTopic.topicArn,
      description: 'SNS Topic ARN for info alerts',
      exportName: `${config.tags.Environment}-MACHER-InfoAlertsTopic`,
    });
  }
}
