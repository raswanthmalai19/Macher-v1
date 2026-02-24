import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface CloudWatchDashboardConstructProps {
  config: EnvironmentConfig;
  webSocketApi: apigatewayv2.WebSocketApi;
  connectHandler: lambda.Function;
  disconnectHandler: lambda.Function;
  audioProcessor: lambda.Function;
  connectionsTable: dynamodb.Table;
  metadataTable: dynamodb.Table;
  familyLoopTopic: sns.Topic;
  audioQueue: sqs.Queue;
}

/**
 * Construct for VocalShield CloudWatch Dashboard
 * 
 * Creates a comprehensive monitoring dashboard with widgets for:
 * - WebSocket connection metrics
 * - Lambda function performance (invocations, errors, duration)
 * - DynamoDB capacity metrics
 * - SNS message metrics
 * - SQS queue metrics
 * - Estimated costs
 * 
 * Requirements: 6.1, 6.4, 6.5, 6.6
 */
export class CloudWatchDashboardConstruct extends Construct {
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: CloudWatchDashboardConstructProps) {
    super(scope, id);

    const { config, webSocketApi, connectHandler, disconnectHandler, audioProcessor,
            connectionsTable, metadataTable, familyLoopTopic, audioQueue } = props;

    // Create CloudWatch Dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'VocalShieldDashboard', {
      dashboardName: `VocalShield-${config.tags.Environment}`,
      periodOverride: cloudwatch.PeriodOverride.AUTO,
    });

    // Row 1: WebSocket API Metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'WebSocket Connections',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'ConnectCount',
            dimensionsMap: {
              ApiId: webSocketApi.apiId,
            },
            statistic: 'Sum',
            period: cdk.Duration.minutes(1),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'WebSocket Messages',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'MessageCount',
            dimensionsMap: {
              ApiId: webSocketApi.apiId,
            },
            statistic: 'Sum',
            period: cdk.Duration.minutes(1),
          }),
        ],
        width: 12,
      })
    );

    // Row 2: Lambda Invocation Metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations',
        left: [
          connectHandler.metricInvocations({ statistic: 'Sum', label: 'Connect Handler' }),
          disconnectHandler.metricInvocations({ statistic: 'Sum', label: 'Disconnect Handler' }),
          audioProcessor.metricInvocations({ statistic: 'Sum', label: 'Audio Processor' }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors',
        left: [
          connectHandler.metricErrors({ statistic: 'Sum', label: 'Connect Handler' }),
          disconnectHandler.metricErrors({ statistic: 'Sum', label: 'Disconnect Handler' }),
          audioProcessor.metricErrors({ statistic: 'Sum', label: 'Audio Processor' }),
        ],
        width: 12,
      })
    );

    // Row 3: Lambda Duration Metrics (P50, P90, P99)
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration - Connect Handler',
        left: [
          connectHandler.metricDuration({ statistic: 'p50', label: 'P50' }),
          connectHandler.metricDuration({ statistic: 'p90', label: 'P90' }),
          connectHandler.metricDuration({ statistic: 'p99', label: 'P99' }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration - Disconnect Handler',
        left: [
          disconnectHandler.metricDuration({ statistic: 'p50', label: 'P50' }),
          disconnectHandler.metricDuration({ statistic: 'p90', label: 'P90' }),
          disconnectHandler.metricDuration({ statistic: 'p99', label: 'P99' }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration - Audio Processor',
        left: [
          audioProcessor.metricDuration({ statistic: 'p50', label: 'P50' }),
          audioProcessor.metricDuration({ statistic: 'p90', label: 'P90' }),
          audioProcessor.metricDuration({ statistic: 'p99', label: 'P99' }),
        ],
        width: 8,
      })
    );

    // Row 4: DynamoDB Metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Read Capacity',
        left: [
          connectionsTable.metricConsumedReadCapacityUnits({ label: 'Connections Table' }),
          metadataTable.metricConsumedReadCapacityUnits({ label: 'Metadata Table' }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Write Capacity',
        left: [
          connectionsTable.metricConsumedWriteCapacityUnits({ label: 'Connections Table' }),
          metadataTable.metricConsumedWriteCapacityUnits({ label: 'Metadata Table' }),
        ],
        width: 12,
      })
    );

    // Row 5: SNS and SQS Metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'SNS Messages Published',
        left: [
          familyLoopTopic.metricNumberOfMessagesPublished({ statistic: 'Sum' }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'SQS Queue Metrics',
        left: [
          audioQueue.metricApproximateNumberOfMessagesVisible({ label: 'Queue Depth' }),
          audioQueue.metricApproximateAgeOfOldestMessage({ label: 'Oldest Message Age (s)' }),
        ],
        width: 12,
      })
    );

    // Row 6: Estimated Costs (Custom Metric - will be populated by Lambda)
    this.dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Estimated Monthly Cost',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'VocalShield',
            metricName: 'EstimatedMonthlyCost',
            dimensionsMap: {
              Environment: config.tags.Environment,
            },
            statistic: 'Average',
            period: cdk.Duration.hours(1),
          }),
        ],
        width: 24,
      })
    );

    // Apply tags
    cdk.Tags.of(this.dashboard).add('Component', 'CloudWatchDashboard');
  }
}
