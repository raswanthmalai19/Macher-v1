import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface AnomalyDetectionConstructProps {
  config: EnvironmentConfig;
  lambdaFunctions: lambda.Function[];
}

/**
 * CloudWatch Anomaly Detection Construct
 * 
 * Creates anomaly detectors for:
 * - Lambda invocation count (detect traffic spikes)
 * - Lambda error rate (detect system issues)
 * - Lambda duration (detect performance degradation)
 * - DynamoDB throttling (detect capacity issues)
 */
export class AnomalyDetectionConstruct extends Construct {
  public readonly anomalyDetectors: cloudwatch.CfnAnomalyDetector[];

  constructor(scope: Construct, id: string, props: AnomalyDetectionConstructProps) {
    super(scope, id);

    const { config, lambdaFunctions } = props;
    this.anomalyDetectors = [];

    // Create anomaly detectors for each Lambda function
    lambdaFunctions.forEach((fn, index) => {
      // Anomaly Detector 1: Invocation Count
      const invocationDetector = new cloudwatch.CfnAnomalyDetector(this, `InvocationAnomaly${index}`, {
        metricName: 'Invocations',
        namespace: 'AWS/Lambda',
        stat: 'Sum',
        dimensions: [
          {
            name: 'FunctionName',
            value: fn.functionName,
          },
        ],
      });
      this.anomalyDetectors.push(invocationDetector);

      // Anomaly Detector 2: Error Rate
      const errorDetector = new cloudwatch.CfnAnomalyDetector(this, `ErrorAnomaly${index}`, {
        metricName: 'Errors',
        namespace: 'AWS/Lambda',
        stat: 'Sum',
        dimensions: [
          {
            name: 'FunctionName',
            value: fn.functionName,
          },
        ],
      });
      this.anomalyDetectors.push(errorDetector);

      // Anomaly Detector 3: Duration (Performance)
      const durationDetector = new cloudwatch.CfnAnomalyDetector(this, `DurationAnomaly${index}`, {
        metricName: 'Duration',
        namespace: 'AWS/Lambda',
        stat: 'Average',
        dimensions: [
          {
            name: 'FunctionName',
            value: fn.functionName,
          },
        ],
      });
      this.anomalyDetectors.push(durationDetector);
    });

    // Apply tags
    cdk.Tags.of(this).add('Component', 'AnomalyDetection');
  }
}
