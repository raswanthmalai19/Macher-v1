"use strict";
/**
 * Monitoring Alarms Construct
 *
 * Creates CloudWatch Alarms for VocalShield monitoring:
 * - Lambda error rate alarms
 * - API Gateway error alarms
 * - DynamoDB throttle alarms
 * - Latency alarms
 * - Free Tier usage alarms
 * - Security alarms
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringAlarmsConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const cloudwatch_actions = __importStar(require("aws-cdk-lib/aws-cloudwatch-actions"));
const constructs_1 = require("constructs");
class MonitoringAlarmsConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        this.alarms = [];
        const { config, criticalAlertsTopic, warningAlertsTopic, lambdaFunctions, dynamoDbTables } = props;
        const environment = config.tags.Environment;
        // Lambda error rate alarms (critical)
        Object.entries(lambdaFunctions).forEach(([name, fn]) => {
            if (fn) {
                const errorAlarm = new cloudwatch.Alarm(this, `${name}ErrorAlarm`, {
                    alarmName: `VocalShield-${environment}-Lambda-${name}-Errors`,
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
                    alarmName: `VocalShield-${environment}-Lambda-${name}-Throttles`,
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
                        alarmName: `VocalShield-${environment}-DynamoDB-${name}-Throttles`,
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
                alarmName: `VocalShield-${environment}-FreeTier-${service.name}-Warning`,
                alarmDescription: `${service.displayName} Free Tier usage exceeds 80%`,
                metric: new cloudwatch.Metric({
                    namespace: 'VocalShield/FreeTier',
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
                alarmName: `VocalShield-${environment}-FreeTier-${service.name}-Critical`,
                alarmDescription: `${service.displayName} Free Tier usage exceeds 95%`,
                metric: new cloudwatch.Metric({
                    namespace: 'VocalShield/FreeTier',
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
            alarmName: `VocalShield-${environment}-Security-BruteForce`,
            alarmDescription: 'Potential brute force attack detected (>5 failed auth attempts in 5 minutes)',
            metric: new cloudwatch.Metric({
                namespace: 'VocalShield/Security',
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
                alarmName: `VocalShield-${environment}-AudioProcessor-HighLatency`,
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
            cdk.Tags.of(alarm).add('Project', 'VocalShield');
            cdk.Tags.of(alarm).add('Environment', environment);
        });
        // Output alarm count
        new cdk.CfnOutput(this, 'AlarmCount', {
            value: this.alarms.length.toString(),
            description: 'Total number of CloudWatch Alarms created',
        });
    }
}
exports.MonitoringAlarmsConstruct = MonitoringAlarmsConstruct;
//# sourceMappingURL=monitoring-alarms.js.map