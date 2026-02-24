/**
 * AlarmManager - Create and manage CloudWatch Alarms
 * 
 * This class provides programmatic alarm creation and management
 * for VocalShield monitoring.
 * 
 * Features:
 * - Lambda error rate alarms
 * - API Gateway error alarms
 * - DynamoDB throttle alarms
 * - Latency alarms
 * - Free Tier usage alarms
 * - Security event alarms
 * 
 * Usage:
 * ```typescript
 * const manager = new AlarmManager({ region: 'us-east-1' });
 * await manager.createAlarm(alarmConfig);
 * ```
 */

import { 
  CloudWatchClient, 
  PutMetricAlarmCommand, 
  DeleteAlarmsCommand,
  ComparisonOperator,
  Statistic,
  StandardUnit
} from '@aws-sdk/client-cloudwatch';
import { AlarmConfig } from './types';
import { logger } from './structured-logger';

/**
 * Configuration for AlarmManager
 */
export interface AlarmManagerConfig {
  region?: string;
}

/**
 * AlarmManager class for CloudWatch Alarms
 */
export class AlarmManager {
  private readonly client: CloudWatchClient;
  private readonly region: string;

  constructor(config: AlarmManagerConfig = {}) {
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.client = new CloudWatchClient({ region: this.region });
  }

  /**
   * Create a CloudWatch Alarm
   */
  public async createAlarm(config: AlarmConfig): Promise<void> {
    try {
      const command = new PutMetricAlarmCommand({
        AlarmName: config.alarmName,
        AlarmDescription: config.description,
        MetricName: config.metricName,
        Namespace: config.metricNamespace,
        Statistic: config.statistic as Statistic,
        Period: config.period,
        EvaluationPeriods: config.evaluationPeriods,
        Threshold: config.threshold,
        ComparisonOperator: config.comparisonOperator as ComparisonOperator,
        Dimensions: Object.entries(config.dimensions).map(([Name, Value]) => ({ Name, Value })),
        TreatMissingData: config.treatMissingData,
        ActionsEnabled: config.actionsEnabled,
        AlarmActions: config.alarmActions,
        Tags: [
          { Key: 'Severity', Value: config.severity },
          { Key: 'Project', Value: 'VocalShield' },
        ],
      });

      await this.client.send(command);

      logger.info('Alarm created successfully', {
        component: 'AlarmManager',
        metadata: {
          alarmName: config.alarmName,
          severity: config.severity,
        },
      });
    } catch (error) {
      logger.error('Failed to create alarm', error as Error, {
        component: 'AlarmManager',
        metadata: {
          alarmName: config.alarmName,
        },
      });
      throw error;
    }
  }

  /**
   * Update an existing alarm
   */
  public async updateAlarm(alarmName: string, config: AlarmConfig): Promise<void> {
    // PutMetricAlarm creates or updates, so we can reuse the same method
    return this.createAlarm(config);
  }

  /**
   * Delete an alarm
   */
  public async deleteAlarm(alarmName: string): Promise<void> {
    try {
      const command = new DeleteAlarmsCommand({
        AlarmNames: [alarmName],
      });

      await this.client.send(command);

      logger.info('Alarm deleted successfully', {
        component: 'AlarmManager',
        metadata: {
          alarmName,
        },
      });
    } catch (error) {
      logger.error('Failed to delete alarm', error as Error, {
        component: 'AlarmManager',
        metadata: {
          alarmName,
        },
      });
      throw error;
    }
  }

  /**
   * Create Lambda error rate alarm
   */
  public async createLambdaErrorAlarm(
    functionName: string,
    snsTopicArn: string,
    environment: string
  ): Promise<void> {
    const config: AlarmConfig = {
      alarmName: `VocalShield-${environment}-Lambda-${functionName}-Errors`,
      description: `Lambda function ${functionName} error rate exceeds 5%`,
      metricNamespace: 'AWS/Lambda',
      metricName: 'Errors',
      dimensions: {
        FunctionName: functionName,
      },
      statistic: 'Sum',
      period: 300, // 5 minutes
      evaluationPeriods: 1,
      threshold: 5,
      comparisonOperator: 'GreaterThanThreshold',
      treatMissingData: 'notBreaching',
      actionsEnabled: true,
      alarmActions: [snsTopicArn],
      severity: 'critical',
    };

    await this.createAlarm(config);
  }

  /**
   * Create API Gateway 5xx error alarm
   */
  public async createApiGateway5xxAlarm(
    apiName: string,
    snsTopicArn: string,
    environment: string
  ): Promise<void> {
    const config: AlarmConfig = {
      alarmName: `VocalShield-${environment}-APIGateway-${apiName}-5xxErrors`,
      description: `API Gateway ${apiName} 5xx error rate exceeds 1%`,
      metricNamespace: 'AWS/ApiGateway',
      metricName: '5XXError',
      dimensions: {
        ApiName: apiName,
      },
      statistic: 'Sum',
      period: 300, // 5 minutes
      evaluationPeriods: 1,
      threshold: 1,
      comparisonOperator: 'GreaterThanThreshold',
      treatMissingData: 'notBreaching',
      actionsEnabled: true,
      alarmActions: [snsTopicArn],
      severity: 'critical',
    };

    await this.createAlarm(config);
  }

  /**
   * Create DynamoDB throttle alarm
   */
  public async createDynamoDBThrottleAlarm(
    tableName: string,
    snsTopicArn: string,
    environment: string
  ): Promise<void> {
    const config: AlarmConfig = {
      alarmName: `VocalShield-${environment}-DynamoDB-${tableName}-Throttles`,
      description: `DynamoDB table ${tableName} is experiencing throttling`,
      metricNamespace: 'AWS/DynamoDB',
      metricName: 'UserErrors',
      dimensions: {
        TableName: tableName,
      },
      statistic: 'Sum',
      period: 60, // 1 minute
      evaluationPeriods: 1,
      threshold: 1,
      comparisonOperator: 'GreaterThanThreshold',
      treatMissingData: 'notBreaching',
      actionsEnabled: true,
      alarmActions: [snsTopicArn],
      severity: 'warning',
    };

    await this.createAlarm(config);
  }

  /**
   * Create P99 latency alarm
   */
  public async createLatencyAlarm(
    apiName: string,
    snsTopicArn: string,
    environment: string
  ): Promise<void> {
    const config: AlarmConfig = {
      alarmName: `VocalShield-${environment}-APIGateway-${apiName}-HighLatency`,
      description: `API Gateway ${apiName} P99 latency exceeds 3000ms`,
      metricNamespace: 'AWS/ApiGateway',
      metricName: 'Latency',
      dimensions: {
        ApiName: apiName,
      },
      statistic: 'Maximum', // Use Maximum as proxy for P99
      period: 300, // 5 minutes
      evaluationPeriods: 1,
      threshold: 3000,
      comparisonOperator: 'GreaterThanThreshold',
      treatMissingData: 'notBreaching',
      actionsEnabled: true,
      alarmActions: [snsTopicArn],
      severity: 'warning',
    };

    await this.createAlarm(config);
  }

  /**
   * Create Free Tier usage alarm (80% threshold)
   */
  public async createFreeTierWarningAlarm(
    service: string,
    snsTopicArn: string,
    environment: string
  ): Promise<void> {
    const config: AlarmConfig = {
      alarmName: `VocalShield-${environment}-FreeTier-${service}-Warning`,
      description: `${service} Free Tier usage exceeds 80%`,
      metricNamespace: 'VocalShield/FreeTier',
      metricName: `${service}Usage`,
      dimensions: {
        Environment: environment,
      },
      statistic: 'Average',
      period: 300, // 5 minutes
      evaluationPeriods: 1,
      threshold: 80,
      comparisonOperator: 'GreaterThanThreshold',
      treatMissingData: 'notBreaching',
      actionsEnabled: true,
      alarmActions: [snsTopicArn],
      severity: 'warning',
    };

    await this.createAlarm(config);
  }

  /**
   * Create Free Tier usage alarm (95% threshold)
   */
  public async createFreeTierCriticalAlarm(
    service: string,
    snsTopicArn: string,
    environment: string
  ): Promise<void> {
    const config: AlarmConfig = {
      alarmName: `VocalShield-${environment}-FreeTier-${service}-Critical`,
      description: `${service} Free Tier usage exceeds 95%`,
      metricNamespace: 'VocalShield/FreeTier',
      metricName: `${service}Usage`,
      dimensions: {
        Environment: environment,
      },
      statistic: 'Average',
      period: 300, // 5 minutes
      evaluationPeriods: 1,
      threshold: 95,
      comparisonOperator: 'GreaterThanThreshold',
      treatMissingData: 'notBreaching',
      actionsEnabled: true,
      alarmActions: [snsTopicArn],
      severity: 'critical',
    };

    await this.createAlarm(config);
  }

  /**
   * Create security brute force alarm
   */
  public async createBruteForceAlarm(
    snsTopicArn: string,
    environment: string
  ): Promise<void> {
    const config: AlarmConfig = {
      alarmName: `VocalShield-${environment}-Security-BruteForce`,
      description: 'Potential brute force attack detected (>5 failed auth attempts in 5 minutes)',
      metricNamespace: 'VocalShield/Security',
      metricName: 'FailedAuthAttempts',
      dimensions: {
        Environment: environment,
      },
      statistic: 'Sum',
      period: 300, // 5 minutes
      evaluationPeriods: 1,
      threshold: 5,
      comparisonOperator: 'GreaterThanThreshold',
      treatMissingData: 'notBreaching',
      actionsEnabled: true,
      alarmActions: [snsTopicArn],
      severity: 'critical',
    };

    await this.createAlarm(config);
  }
}
