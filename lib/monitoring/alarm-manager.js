"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlarmManager = void 0;
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
const structured_logger_1 = require("./structured-logger");
/**
 * AlarmManager class for CloudWatch Alarms
 */
class AlarmManager {
    constructor(config = {}) {
        this.region = config.region || process.env.AWS_REGION || 'us-east-1';
        this.client = new client_cloudwatch_1.CloudWatchClient({ region: this.region });
    }
    /**
     * Create a CloudWatch Alarm
     */
    async createAlarm(config) {
        try {
            const command = new client_cloudwatch_1.PutMetricAlarmCommand({
                AlarmName: config.alarmName,
                AlarmDescription: config.description,
                MetricName: config.metricName,
                Namespace: config.metricNamespace,
                Statistic: config.statistic,
                Period: config.period,
                EvaluationPeriods: config.evaluationPeriods,
                Threshold: config.threshold,
                ComparisonOperator: config.comparisonOperator,
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
            structured_logger_1.logger.info('Alarm created successfully', {
                component: 'AlarmManager',
                metadata: {
                    alarmName: config.alarmName,
                    severity: config.severity,
                },
            });
        }
        catch (error) {
            structured_logger_1.logger.error('Failed to create alarm', error, {
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
    async updateAlarm(alarmName, config) {
        // PutMetricAlarm creates or updates, so we can reuse the same method
        return this.createAlarm(config);
    }
    /**
     * Delete an alarm
     */
    async deleteAlarm(alarmName) {
        try {
            const command = new client_cloudwatch_1.DeleteAlarmsCommand({
                AlarmNames: [alarmName],
            });
            await this.client.send(command);
            structured_logger_1.logger.info('Alarm deleted successfully', {
                component: 'AlarmManager',
                metadata: {
                    alarmName,
                },
            });
        }
        catch (error) {
            structured_logger_1.logger.error('Failed to delete alarm', error, {
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
    async createLambdaErrorAlarm(functionName, snsTopicArn, environment) {
        const config = {
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
    async createApiGateway5xxAlarm(apiName, snsTopicArn, environment) {
        const config = {
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
    async createDynamoDBThrottleAlarm(tableName, snsTopicArn, environment) {
        const config = {
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
    async createLatencyAlarm(apiName, snsTopicArn, environment) {
        const config = {
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
    async createFreeTierWarningAlarm(service, snsTopicArn, environment) {
        const config = {
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
    async createFreeTierCriticalAlarm(service, snsTopicArn, environment) {
        const config = {
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
    async createBruteForceAlarm(snsTopicArn, environment) {
        const config = {
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
exports.AlarmManager = AlarmManager;
//# sourceMappingURL=alarm-manager.js.map