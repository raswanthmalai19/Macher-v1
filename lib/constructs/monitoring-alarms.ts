/**
 * Monitoring Alarms Construct
 * 
 * Creates CloudWatch Alarms for MACHER monitoring:
 * - Lambda error rate alarms
 * - API Gateway error alarms
 * - DynamoDB throttle alarms
 * - Latency alarms
 * - Free Tier usage alarms
 * - Security alarms
 */

import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface MonitoringAlarmsProps {
  config: EnvironmentConfig;
  criticalAlertsTopic: sns.Topic;
  warningAlertsTopic: sns.Topic;
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

export class MonitoringAlarmsConstruct extends Construct {
  public readonly alarms: cloudwatch.Alarm[] = [];

  constructor(scope: Construct, id: string, props: MonitoringAlarmsProps) {
    super(scope, id);

    const { config, criticalAlertsTopic, warningAlertsTopic, lambdaFunctions, dynamoDbTables } = props;
    const environment = config.tags.Environment;

    // Lambda error rate alarms (critical)
    Object.entries(lambdaFunctions).forEach(([name, fn]) => {
      if (fn) {
        const errorAlarm = new cloudwatch.Alarm(this, `${name}ErrorAlarm`, {
          alarmName: `MACHER-${environment}-Lambda-${name}-Errors`,
          alarmDescription: `Lambda function ${name} error rate exceeds 5%`,
          metric: fn.metricErrors({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          threshold: 5,
          evaluationPeriods: 1,
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });

        errorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(criticalAlertsTopic));
        this.alarms.push(errorAlarm);

        // Lambda throttle alarm (warning)
        const throttleAlarm = new cloudwatch.Alarm(this, `${name}ThrottleAlarm`, {
          alarmName: `MACHER-${environment}-Lambda-${name}-Throttles`,
          alarmDescription: `Lambda function ${name} is being throttled`,
          metric: fn.metricThrottles({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          threshold: 1,
          evaluationPeriods: 1,
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });

        throttleAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(warningAlertsTopic));
        this.alarms.push(throttleAlarm);
      }
    });

    // DynamoDB throttle alarms (warning)
    if (dynamoDbTables) {
      Object.entries(dynamoDbTables).forEach(([name, table]) => {
        if (table) {
          const throttleAlarm = new cloudwatch.Alarm(this, `${name}ThrottleAlarm`, {
            alarmName: `MACHER-${environment}-DynamoDB-${name}-Throttles`,
            alarmDescription: `DynamoDB table ${name} is experiencing throttling`,
            metric: table.metricUserErrors({
              statistic: 'Sum',
              period: cdk.Duration.minutes(1),
            }),
            threshold: 1,
            evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
          });

          throttleAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(warningAlertsTopic));
          this.alarms.push(throttleAlarm);
        }
      });
    }

    // Free Tier usage alarms
    const freeTierServices = [
      { name: 'LambdaInvocations', displayName: 'Lambda Invocations' },
      { name: 'LambdaComputeTime', displayName: 'Lambda Compute Time' },
      { name: 'DynamoDB', displayName: 'DynamoDB' },
      { name: 'CloudWatchLogs', displayName: 'CloudWatch Logs' },
      { name: 'APIGateway', displayName: 'API Gateway' },
    ];

    freeTierServices.forEach(service => {
      // 80% warning
      const warningAlarm = new cloudwatch.Alarm(this, `${service.name}FreeTierWarning`, {
        alarmName: `MACHER-${environment}-FreeTier-${service.name}-Warning`,
        alarmDescription: `${service.displayName} Free Tier usage exceeds 80%`,
        metric: new cloudwatch.Metric({
          namespace: 'MACHER/FreeTier',
          metricName: `${service.name}Usage`,
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
          dimensionsMap: {
            Environment: environment,
          },
        }),
        threshold: 80,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      warningAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(warningAlertsTopic));
      this.alarms.push(warningAlarm);

      // 95% critical
      const criticalAlarm = new cloudwatch.Alarm(this, `${service.name}FreeTierCritical`, {
        alarmName: `MACHER-${environment}-FreeTier-${service.name}-Critical`,
        alarmDescription: `${service.displayName} Free Tier usage exceeds 95%`,
        metric: new cloudwatch.Metric({
          namespace: 'MACHER/FreeTier',
          metricName: `${service.name}Usage`,
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
          dimensionsMap: {
            Environment: environment,
          },
        }),
        threshold: 95,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      criticalAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(criticalAlertsTopic));
      this.alarms.push(criticalAlarm);
    });

    // Security brute force alarm (critical)
    const bruteForceAlarm = new cloudwatch.Alarm(this, 'BruteForceAlarm', {
      alarmName: `MACHER-${environment}-Security-BruteForce`,
      alarmDescription: 'Potential brute force attack detected (>5 failed auth attempts in 5 minutes)',
      metric: new cloudwatch.Metric({
        namespace: 'MACHER/Security',
        metricName: 'FailedAuthAttempts',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
        dimensionsMap: {
          Environment: environment,
        },
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    bruteForceAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(criticalAlertsTopic));
    this.alarms.push(bruteForceAlarm);

    // High latency alarm for audio processor (warning)
    if (lambdaFunctions.audioProcessor) {
      const latencyAlarm = new cloudwatch.Alarm(this, 'AudioProcessorLatencyAlarm', {
        alarmName: `MACHER-${environment}-AudioProcessor-HighLatency`,
        alarmDescription: 'Audio processor P99 latency exceeds 3000ms',
        metric: lambdaFunctions.audioProcessor.metricDuration({
          statistic: 'p99',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 3000,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      latencyAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(warningAlertsTopic));
      this.alarms.push(latencyAlarm);
    }

    // Add tags to all alarms
    this.alarms.forEach(alarm => {
      cdk.Tags.of(alarm).add('Project', 'MACHER');
      cdk.Tags.of(alarm).add('Environment', environment);
    });

    // Output alarm count
    new cdk.CfnOutput(this, 'AlarmCount', {
      value: this.alarms.length.toString(),
      description: 'Total number of CloudWatch Alarms created',
    });
  }
}
