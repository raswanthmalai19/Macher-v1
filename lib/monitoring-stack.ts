/**
 * VocalShield Monitoring Stack
 * 
 * Complete monitoring and observability infrastructure for VocalShield.
 * Integrates all monitoring components: dashboards, alarms, canaries, anomaly detection.
 */

import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { DashboardsConstruct } from './constructs/dashboards-construct';
import { AlarmsConstruct } from './constructs/alarms-construct';
import { CanariesConstruct } from './constructs/canaries-construct';
import { AnomalyDetectionConstruct } from './constructs/anomaly-detection-construct';
import { LogInsightsQueriesConstruct } from './constructs/log-insights-queries-construct';

/**
 * Props for MonitoringStack
 */
export interface MonitoringStackProps extends StackProps {
  /**
   * Lambda functions to monitor
   */
  readonly lambdaFunctions: lambda.IFunction[];

  /**
   * API Gateway endpoint URL
   */
  readonly apiEndpoint: string;

  /**
   * WebSocket API endpoint URL
   */
  readonly wsEndpoint: string;

  /**
   * Email addresses for alarm notifications
   */
  readonly alarmEmails: string[];

  /**
   * Slack webhook URL (optional)
   */
  readonly slackWebhookUrl?: string;
}

/**
 * Monitoring Stack for VocalShield
 */
export class MonitoringStack extends Stack {
  public readonly criticalAlarmTopic: sns.Topic;
  public readonly warningAlarmTopic: sns.Topic;
  public readonly infoAlarmTopic: sns.Topic;
  public readonly logGroup: logs.LogGroup;
  public readonly artifactsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // Create log group for all Lambda functions
    this.logGroup = new logs.LogGroup(this, 'VocalShieldLogs', {
      logGroupName: '/aws/lambda/vocalshield',
      retention: logs.RetentionDays.ONE_WEEK, // Free Tier compliant
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Create S3 bucket for artifacts (canary results, archived logs)
    this.artifactsBucket = new s3.Bucket(this, 'MonitoringArtifacts', {
      bucketName: 'vocalshield-monitoring-artifacts',
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          // Delete archived logs after 90 days
          expiration: Duration.days(90),
          prefix: 'logs/',
        },
        {
          // Delete canary artifacts after 30 days
          expiration: Duration.days(30),
          prefix: 'canaries/',
        },
      ],
    });

    // Create SNS topics for different alarm severities
    this.criticalAlarmTopic = new sns.Topic(this, 'CriticalAlarms', {
      topicName: 'VocalShield-Critical-Alerts',
      displayName: 'VocalShield Critical Alerts',
    });

    this.warningAlarmTopic = new sns.Topic(this, 'WarningAlarms', {
      topicName: 'VocalShield-Warning-Alerts',
      displayName: 'VocalShield Warning Alerts',
    });

    this.infoAlarmTopic = new sns.Topic(this, 'InfoAlarms', {
      topicName: 'VocalShield-Info-Alerts',
      displayName: 'VocalShield Info Alerts',
    });

    // Subscribe email addresses to alarm topics
    props.alarmEmails.forEach((email) => {
      this.criticalAlarmTopic.addSubscription(
        new subscriptions.EmailSubscription(email)
      );
      this.warningAlarmTopic.addSubscription(
        new subscriptions.EmailSubscription(email)
      );
    });

    // Deploy CloudWatch Dashboards
    const dashboards = new DashboardsConstruct(this, 'Dashboards', {
      lambdaFunctions: props.lambdaFunctions,
      apiEndpoint: props.apiEndpoint,
    });

    // Deploy CloudWatch Alarms
    const alarms = new AlarmsConstruct(this, 'Alarms', {
      lambdaFunctions: props.lambdaFunctions,
      criticalTopicArn: this.criticalAlarmTopic.topicArn,
      warningTopicArn: this.warningAlarmTopic.topicArn,
      infoTopicArn: this.infoAlarmTopic.topicArn,
    });

    // Deploy CloudWatch Synthetics Canaries
    const canaries = new CanariesConstruct(this, 'Canaries', {
      apiEndpoint: props.apiEndpoint,
      wsEndpoint: props.wsEndpoint,
      artifactsBucket: this.artifactsBucket,
    });

    // Deploy Anomaly Detection
    const anomalyDetection = new AnomalyDetectionConstruct(this, 'AnomalyDetection', {
      lambdaFunctionNames: props.lambdaFunctions.map((fn) => fn.functionName),
      apiGatewayName: 'VocalShield-API',
      standardDeviations: 3,
      alarmTopicArn: this.warningAlarmTopic.topicArn,
    });

    // Deploy Log Insights Saved Queries
    const logInsightsQueries = new LogInsightsQueriesConstruct(this, 'LogInsightsQueries', {
      logGroupNames: [this.logGroup.logGroupName],
    });

    // Output important ARNs and URLs
    this.exportValue(this.criticalAlarmTopic.topicArn, {
      name: 'CriticalAlarmTopicArn',
    });
    this.exportValue(this.warningAlarmTopic.topicArn, {
      name: 'WarningAlarmTopicArn',
    });
    this.exportValue(this.artifactsBucket.bucketName, {
      name: 'MonitoringArtifactsBucket',
    });
  }
}
