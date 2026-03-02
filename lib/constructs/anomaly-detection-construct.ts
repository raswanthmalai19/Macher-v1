/**
 * CDK Construct for CloudWatch Anomaly Detection
 * 
 * This construct enables anomaly detection for key metrics to automatically
 * identify unusual patterns without manual threshold configuration.
 */

import { Construct } from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Duration } from 'aws-cdk-lib';

/**
 * Props for AnomalyDetectionConstruct
 */
export interface AnomalyDetectionConstructProps {
  /**
   * Lambda function names to monitor
   */
  readonly lambdaFunctionNames: string[];

  /**
   * API Gateway name
   */
  readonly apiGatewayName?: string;

  /**
   * Standard deviation threshold (default: 3)
   */
  readonly standardDeviations?: number;

  /**
   * SNS topic ARN for alarm notifications
   */
  readonly alarmTopicArn?: string;
}

/**
 * Construct for deploying CloudWatch Anomaly Detection
 */
export class AnomalyDetectionConstruct extends Construct {
  public readonly alarms: cloudwatch.Alarm[];

  constructor(scope: Construct, id: string, props: AnomalyDetectionConstructProps) {
    super(scope, id);

    this.alarms = [];
    const standardDeviations = props.standardDeviations || 3;

    // Lambda invocation anomaly detection
    props.lambdaFunctionNames.forEach((functionName) => {
      const invocationMetric = new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Invocations',
        dimensionsMap: {
          FunctionName: functionName,
        },
        statistic: 'Sum',
        period: Duration.minutes(5),
      });

      const alarm = new cloudwatch.Alarm(this, `${functionName}-InvocationAnomaly`, {
        alarmName: `MACHER-${functionName}-InvocationAnomaly`,
        alarmDescription: `Anomalous invocation count detected for ${functionName}`,
        metric: invocationMetric,
        threshold: standardDeviations,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_LOWER_OR_GREATER_THAN_UPPER_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      if (props.alarmTopicArn) {
        alarm.addAlarmAction({
          bind: () => ({ alarmActionArn: props.alarmTopicArn! }),
        });
      }

      this.alarms.push(alarm);

      // Error rate anomaly detection
      const errorMetric = new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensionsMap: {
          FunctionName: functionName,
        },
        statistic: 'Sum',
        period: Duration.minutes(5),
      });

      const errorAlarm = new cloudwatch.Alarm(this, `${functionName}-ErrorAnomaly`, {
        alarmName: `MACHER-${functionName}-ErrorAnomaly`,
        alarmDescription: `Anomalous error rate detected for ${functionName}`,
        metric: errorMetric,
        threshold: standardDeviations,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_LOWER_OR_GREATER_THAN_UPPER_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      if (props.alarmTopicArn) {
        errorAlarm.addAlarmAction({
          bind: () => ({ alarmActionArn: props.alarmTopicArn! }),
        });
      }

      this.alarms.push(errorAlarm);
    });

    // API Gateway request rate anomaly detection
    if (props.apiGatewayName) {
      const apiMetric = new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'Count',
        dimensionsMap: {
          ApiName: props.apiGatewayName,
        },
        statistic: 'Sum',
        period: Duration.minutes(5),
      });

      const apiAlarm = new cloudwatch.Alarm(this, 'APIRequestAnomaly', {
        alarmName: 'MACHER-API-RequestAnomaly',
        alarmDescription: 'Anomalous API request rate detected',
        metric: apiMetric,
        threshold: standardDeviations,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_LOWER_OR_GREATER_THAN_UPPER_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      if (props.alarmTopicArn) {
        apiAlarm.addAlarmAction({
          bind: () => ({ alarmActionArn: props.alarmTopicArn! }),
        });
      }

      this.alarms.push(apiAlarm);
    }
  }
}
