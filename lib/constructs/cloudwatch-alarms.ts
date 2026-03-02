import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface CloudWatchAlarmsConstructProps {
  config: EnvironmentConfig;
  connectHandler: lambda.Function;
  disconnectHandler: lambda.Function;
  audioProcessor: lambda.Function;
  audioQueueDlq: sqs.Queue;
}

/**
 * Construct for MACHER CloudWatch Alarms
 * 
 * Creates alarms for:
 * - Billing: Alert when estimated charges exceed $5
 * - Lambda errors: Alert when error rate is high
 * - Connection limit: Alert when approaching Free Tier limits
 * - Dead-letter queue: Alert when messages appear in DLQ
 * 
 * All alarms send notifications to SNS topic for email alerts.
 * 
 * Requirements: 6.8, 7.5
 */
export class CloudWatchAlarmsConstruct extends Construct {
  public readonly alarmTopic: sns.Topic;
  public readonly billingAlarm: cloudwatch.Alarm;
  public readonly errorRateAlarm: cloudwatch.Alarm;
  public readonly connectionLimitAlarm: cloudwatch.Alarm;
  public readonly dlqAlarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props: CloudWatchAlarmsConstructProps) {
    super(scope, id);

    const { config, connectHandler, disconnectHandler, audioProcessor, audioQueueDlq } = props;

    // Create SNS topic for alarm notifications
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `MACHER-Alarms-${config.tags.Environment}`,
      displayName: 'MACHER CloudWatch Alarms',
    });

    // Create billing alarm: threshold $5, period 6 hours
    this.billingAlarm = new cloudwatch.Alarm(this, 'BillingAlarm', {
      alarmName: `MACHER-BillingAlert-${config.tags.Environment}`,
      alarmDescription: 'Alert when estimated AWS charges exceed $5',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Billing',
        metricName: 'EstimatedCharges',
        dimensionsMap: {
          Currency: 'USD',
        },
        statistic: 'Maximum',
        period: cdk.Duration.hours(6),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    this.billingAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));

    // Create error rate alarm: 10 errors in 5 minutes
    const errorMetric = new cloudwatch.MathExpression({
      expression: 'e1 + e2 + e3',
      usingMetrics: {
        e1: connectHandler.metricErrors({ statistic: 'Sum', period: cdk.Duration.minutes(5) }),
        e2: disconnectHandler.metricErrors({ statistic: 'Sum', period: cdk.Duration.minutes(5) }),
        e3: audioProcessor.metricErrors({ statistic: 'Sum', period: cdk.Duration.minutes(5) }),
      },
    });

    this.errorRateAlarm = new cloudwatch.Alarm(this, 'ErrorRateAlarm', {
      alarmName: `MACHER-ErrorRate-${config.tags.Environment}`,
      alarmDescription: 'Alert when Lambda error count exceeds 10 in 5 minutes',
      metric: errorMetric,
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    this.errorRateAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));

    // Create connection limit alarm: 900 concurrent connections (approaching Free Tier limit of 1000)
    this.connectionLimitAlarm = new cloudwatch.Alarm(this, 'ConnectionLimitAlarm', {
      alarmName: `MACHER-ConnectionLimit-${config.tags.Environment}`,
      alarmDescription: 'Alert when concurrent connections approach Free Tier limit',
      metric: connectHandler.metricInvocations({
        statistic: 'Sum',
        period: cdk.Duration.minutes(1),
      }),
      threshold: 900,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    this.connectionLimitAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));

    // Create DLQ alarm: messages in dead-letter queue
    this.dlqAlarm = new cloudwatch.Alarm(this, 'DlqAlarm', {
      alarmName: `MACHER-DLQ-${config.tags.Environment}`,
      alarmDescription: 'Alert when messages appear in dead-letter queue',
      metric: audioQueueDlq.metricApproximateNumberOfMessagesVisible({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });

    this.dlqAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));

    // Apply tags
    cdk.Tags.of(this.alarmTopic).add('Component', 'CloudWatchAlarms');
    cdk.Tags.of(this.billingAlarm).add('Component', 'CloudWatchAlarms');
    cdk.Tags.of(this.errorRateAlarm).add('Component', 'CloudWatchAlarms');
    cdk.Tags.of(this.connectionLimitAlarm).add('Component', 'CloudWatchAlarms');
    cdk.Tags.of(this.dlqAlarm).add('Component', 'CloudWatchAlarms');

    // Output alarm topic ARN for subscription configuration
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      description: 'SNS Topic ARN for CloudWatch alarm notifications',
      exportName: `${config.tags.Environment}-MACHER-AlarmTopic`,
    });
  }
}
