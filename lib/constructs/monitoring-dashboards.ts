/**
 * Monitoring Dashboards Construct
 * 
 * Creates CloudWatch Dashboards for MACHER monitoring:
 * - System Overview Dashboard
 * - Performance Dashboard
 * - Cost Monitoring Dashboard
 */

import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface MonitoringDashboardsProps {
  config: EnvironmentConfig;
  webSocketApi?: apigatewayv2.WebSocketApi;
  lambdaFunctions: {
    connectHandler?: lambda.Function;
    disconnectHandler?: lambda.Function;
    audioProcessor?: lambda.Function;
    transcriptionService?: lambda.Function;
    fraudDetection?: lambda.Function;
  };
  dynamoDbTables?: {
    connectionsTable?: dynamodb.Table;
    metadataTable?: dynamodb.Table;
  };
}

export class MonitoringDashboardsConstruct extends Construct {
  public readonly systemOverviewDashboard: cloudwatch.Dashboard;
  public readonly performanceDashboard: cloudwatch.Dashboard;
  public readonly costDashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: MonitoringDashboardsProps) {
    super(scope, id);

    const { config, lambdaFunctions } = props;
    const environment = config.tags.Environment;

    // System Overview Dashboard
    this.systemOverviewDashboard = new cloudwatch.Dashboard(this, 'SystemOverviewDashboard', {
      dashboardName: `MACHER-Overview-${environment}`,
    });

    // Add title widget
    this.systemOverviewDashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `# MACHER System Overview - ${environment}\n\nReal-time monitoring of all system components`,
        width: 24,
        height: 1,
      })
    );

    // Lambda metrics row
    const lambdaWidgets: cloudwatch.IWidget[] = [];

    if (lambdaFunctions.connectHandler || lambdaFunctions.disconnectHandler || lambdaFunctions.audioProcessor) {
      const functions = [
        lambdaFunctions.connectHandler,
        lambdaFunctions.disconnectHandler,
        lambdaFunctions.audioProcessor,
      ].filter(Boolean) as lambda.Function[];

      // Lambda invocations
      lambdaWidgets.push(
        new cloudwatch.GraphWidget({
          title: 'Lambda Invocations',
          width: 8,
          height: 6,
          left: functions.map(fn => fn.metricInvocations({ statistic: 'Sum', period: cdk.Duration.minutes(1) })),
        })
      );

      // Lambda errors
      lambdaWidgets.push(
        new cloudwatch.GraphWidget({
          title: 'Lambda Errors',
          width: 8,
          height: 6,
          left: functions.map(fn => fn.metricErrors({ statistic: 'Sum', period: cdk.Duration.minutes(1) })),
        })
      );

      // Lambda duration
      lambdaWidgets.push(
        new cloudwatch.GraphWidget({
          title: 'Lambda Duration (ms)',
          width: 8,
          height: 6,
          left: functions.map(fn => fn.metricDuration({ statistic: 'Average', period: cdk.Duration.minutes(1) })),
        })
      );

      this.systemOverviewDashboard.addWidgets(...lambdaWidgets);
    }

    // Performance Dashboard
    this.performanceDashboard = new cloudwatch.Dashboard(this, 'PerformanceDashboard', {
      dashboardName: `MACHER-Performance-${environment}`,
    });

    this.performanceDashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `# MACHER Performance Metrics - ${environment}\n\nLatency and throughput monitoring`,
        width: 24,
        height: 1,
      })
    );

    // Add Lambda duration percentiles
    if (lambdaFunctions.audioProcessor) {
      this.performanceDashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: 'Audio Processor Latency Percentiles',
          width: 12,
          height: 6,
          left: [
            lambdaFunctions.audioProcessor.metricDuration({ statistic: 'p50', period: cdk.Duration.minutes(1), label: 'P50' }),
            lambdaFunctions.audioProcessor.metricDuration({ statistic: 'p90', period: cdk.Duration.minutes(1), label: 'P90' }),
            lambdaFunctions.audioProcessor.metricDuration({ statistic: 'p99', period: cdk.Duration.minutes(1), label: 'P99' }),
          ],
          leftYAxis: {
            min: 0,
            max: 3000,
          },
        })
      );
    }

    // Add custom performance metrics
    this.performanceDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Cold Starts',
        width: 12,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace: 'MACHER/Performance',
            metricName: 'ColdStarts',
            statistic: 'Sum',
            period: cdk.Duration.minutes(1),
          }),
        ],
      })
    );

    // Cost Monitoring Dashboard
    this.costDashboard = new cloudwatch.Dashboard(this, 'CostDashboard', {
      dashboardName: `MACHER-Costs-${environment}`,
    });

    this.costDashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `# MACHER Cost Monitoring - ${environment}\n\nAWS Free Tier usage tracking`,
        width: 24,
        height: 1,
      })
    );

    // Free Tier usage widgets
    const freeTierServices = [
      'LambdaInvocations',
      'LambdaComputeTime',
      'DynamoDB',
      'CloudWatchLogs',
      'APIGateway',
    ];

    const freeTierWidgets = freeTierServices.map(service => 
      new cloudwatch.GraphWidget({
        title: `${service} (% of Free Tier)`,
        width: 8,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace: 'MACHER/FreeTier',
            metricName: `${service}Usage`,
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            dimensionsMap: {
              Environment: environment,
            },
          }),
        ],
        leftYAxis: {
          min: 0,
          max: 100,
        },
      })
    );

    // Add widgets in rows of 3
    for (let i = 0; i < freeTierWidgets.length; i += 3) {
      this.costDashboard.addWidgets(...freeTierWidgets.slice(i, i + 3));
    }

    // Outputs
    new cdk.CfnOutput(this, 'SystemOverviewDashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=${this.systemOverviewDashboard.dashboardName}`,
      description: 'System Overview Dashboard URL',
    });

    new cdk.CfnOutput(this, 'PerformanceDashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=${this.performanceDashboard.dashboardName}`,
      description: 'Performance Dashboard URL',
    });

    new cdk.CfnOutput(this, 'CostDashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=${this.costDashboard.dashboardName}`,
      description: 'Cost Dashboard URL',
    });
  }
}
