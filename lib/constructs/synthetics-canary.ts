import * as cdk from 'aws-cdk-lib';
import * as synthetics from 'aws-cdk-lib/aws-synthetics';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface SyntheticsCanaryConstructProps {
  config: EnvironmentConfig;
  websocketApiEndpoint: string;
}

/**
 * CloudWatch Synthetics Canary Construct
 * 
 * Creates a canary that monitors WebSocket API availability by:
 * - Connecting to the WebSocket endpoint
 * - Sending test audio data
 * - Verifying response is received
 * 
 * Runs every 5 minutes with CloudWatch alarm on failures
 */
export class SyntheticsCanaryConstruct extends Construct {
  public readonly canary: synthetics.Canary;
  public readonly canaryAlarm: cloudwatch.Alarm;
  public readonly artifactsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: SyntheticsCanaryConstructProps) {
    super(scope, id);

    const { config, websocketApiEndpoint } = props;

    // Create S3 bucket for canary artifacts
    this.artifactsBucket = new s3.Bucket(this, 'CanaryArtifactsBucket', {
      bucketName: `macher-canary-artifacts-${config.tags.Environment}-${cdk.Aws.ACCOUNT_ID}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(7), // Keep artifacts for 7 days
        },
      ],
    });

    // Create canary
    this.canary = new synthetics.Canary(this, 'WebSocketHealthCheckCanary', {
      canaryName: `macher-websocket-health-${config.tags.Environment}`,
      runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_6_2,
      test: synthetics.Test.custom({
        code: synthetics.Code.fromAsset('canaries'),
        handler: 'websocket-health-check.handler',
      }),
      schedule: synthetics.Schedule.rate(cdk.Duration.minutes(5)),
      environmentVariables: {
        WEBSOCKET_URL: websocketApiEndpoint,
      },
      artifactsBucketLocation: {
        bucket: this.artifactsBucket,
      },
    });

    // Grant canary permissions to write to S3
    this.artifactsBucket.grantWrite(this.canary);

    // Create CloudWatch alarm for canary failures
    this.canaryAlarm = new cloudwatch.Alarm(this, 'CanaryFailureAlarm', {
      alarmName: `MACHER-CanaryFailure-${config.tags.Environment}`,
      alarmDescription: 'Alert when WebSocket health check canary fails',
      metric: this.canary.metricSuccessPercent(),
      threshold: 90, // Alert if success rate drops below 90%
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    // Apply tags
    cdk.Tags.of(this.canary).add('Component', 'Synthetics');
    cdk.Tags.of(this.artifactsBucket).add('Component', 'Synthetics');
  }
}
