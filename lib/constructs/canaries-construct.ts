/**
 * CDK Construct for CloudWatch Synthetics Canaries
 * 
 * This construct deploys canaries for automated endpoint health checks.
 */

import { Construct } from 'constructs';
import * as synthetics from '@aws-cdk/aws-synthetics-alpha';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as path from 'path';

/**
 * Props for CanariesConstruct
 */
export interface CanariesConstructProps {
  /**
   * API Gateway endpoint URL
   */
  readonly apiEndpoint: string;

  /**
   * WebSocket API endpoint URL
   */
  readonly wsEndpoint: string;

  /**
   * S3 bucket for canary artifacts
   */
  readonly artifactsBucket?: s3.IBucket;
}

/**
 * Construct for deploying CloudWatch Synthetics Canaries
 */
export class CanariesConstruct extends Construct {
  public readonly healthCheckCanary: synthetics.Canary;
  public readonly wsConnectionCanary: synthetics.Canary;
  public readonly artifactsBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: CanariesConstructProps) {
    super(scope, id);

    // Create or use existing artifacts bucket
    this.artifactsBucket = props.artifactsBucket || new s3.Bucket(this, 'CanaryArtifacts', {
      bucketName: 'vocalshield-canary-artifacts',
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          // Delete successful run artifacts after 7 days
          expiration: Duration.days(7),
          prefix: 'success/',
        },
        {
          // Keep failed run artifacts for 30 days
          expiration: Duration.days(30),
          prefix: 'failed/',
        },
      ],
    });

    // Health Check Canary (every 5 minutes)
    this.healthCheckCanary = new synthetics.Canary(this, 'HealthCheckCanary', {
      canaryName: 'vocalshield-health-check',
      runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_6_2,
      test: synthetics.Test.custom({
        code: synthetics.Code.fromAsset(path.join(__dirname, '../../canaries')),
        handler: 'health-check-canary.handler',
      }),
      schedule: synthetics.Schedule.rate(Duration.minutes(5)),
      environmentVariables: {
        API_ENDPOINT: props.apiEndpoint,
      },
      artifactsBucketLocation: {
        bucket: this.artifactsBucket,
        prefix: 'health-check/',
      },
      successRetentionPeriod: Duration.days(7),
      failureRetentionPeriod: Duration.days(30),
      timeToLive: Duration.minutes(5),
    });

    // WebSocket Connection Canary (every 15 minutes)
    this.wsConnectionCanary = new synthetics.Canary(this, 'WSConnectionCanary', {
      canaryName: 'vocalshield-ws-connection',
      runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_6_2,
      test: synthetics.Test.custom({
        code: synthetics.Code.fromAsset(path.join(__dirname, '../../canaries')),
        handler: 'websocket-health-check.handler',
      }),
      schedule: synthetics.Schedule.rate(Duration.minutes(15)),
      environmentVariables: {
        WS_ENDPOINT: props.wsEndpoint,
      },
      artifactsBucketLocation: {
        bucket: this.artifactsBucket,
        prefix: 'ws-connection/',
      },
      successRetentionPeriod: Duration.days(7),
      failureRetentionPeriod: Duration.days(30),
      timeToLive: Duration.minutes(10),
    });

    // Create CloudWatch alarms for canary failures
    this.createCanaryAlarms();
  }

  /**
   * Create CloudWatch alarms for canary failures
   */
  private createCanaryAlarms(): void {
    // Health check canary alarm
    new cloudwatch.Alarm(this, 'HealthCheckCanaryAlarm', {
      alarmName: 'VocalShield-HealthCheckCanary-Failed',
      alarmDescription: 'Health check canary failed',
      metric: this.healthCheckCanary.metricFailed({
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // WebSocket connection canary alarm
    new cloudwatch.Alarm(this, 'WSConnectionCanaryAlarm', {
      alarmName: 'VocalShield-WSConnectionCanary-Failed',
      alarmDescription: 'WebSocket connection canary failed',
      metric: this.wsConnectionCanary.metricFailed({
        period: Duration.minutes(15),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Success rate alarm (< 90% over 1 hour)
    new cloudwatch.Alarm(this, 'HealthCheckSuccessRateAlarm', {
      alarmName: 'VocalShield-HealthCheck-LowSuccessRate',
      alarmDescription: 'Health check success rate below 90%',
      metric: this.healthCheckCanary.metricSuccessPercent({
        period: Duration.hours(1),
        statistic: 'Average',
      }),
      threshold: 90,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
  }

  /**
   * Get canary success rate metric
   */
  public getSuccessRateMetric(canary: synthetics.Canary): cloudwatch.Metric {
    return canary.metricSuccessPercent({
      period: Duration.hours(1),
      statistic: 'Average',
    });
  }

  /**
   * Get canary duration metric
   */
  public getDurationMetric(canary: synthetics.Canary): cloudwatch.Metric {
    return canary.metricDuration({
      period: Duration.minutes(5),
      statistic: 'Average',
    });
  }
}
