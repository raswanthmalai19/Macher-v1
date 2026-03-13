"use strict";
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
exports.CloudWatchAlarmsConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const cloudwatch_actions = __importStar(require("aws-cdk-lib/aws-cloudwatch-actions"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const constructs_1 = require("constructs");
/**
 * Construct for VocalShield CloudWatch Alarms
 *
 * Creates alarms for:
 * - Billing: Alert when estimated charges exceed $5
 * - Lambda errors: Alert when error rate is high
 * - Connection limit: Alert when approaching Free Tier limits
 * - Dead-letter queue: Alert when messages appear in DLQ
 *
 * All alarms send notifications to SNS topic for email alerts.
 *
 * Requirements: 6.8, 7.5
 */
class CloudWatchAlarmsConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { config, connectHandler, disconnectHandler, audioProcessor, audioQueueDlq } = props;
        // Create SNS topic for alarm notifications
        this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
            topicName: `VocalShield-Alarms-${config.tags.Environment}`,
            displayName: 'VocalShield CloudWatch Alarms',
        });
        // Create billing alarm: threshold $5, period 6 hours
        this.billingAlarm = new cloudwatch.Alarm(this, 'BillingAlarm', {
            alarmName: `VocalShield-BillingAlert-${config.tags.Environment}`,
            alarmDescription: 'Alert when estimated AWS charges exceed $5',
            metric: new cloudwatch.Metric({
                namespace: 'AWS/Billing',
                metricName: 'EstimatedCharges',
                dimensionsMap: {
                    Currency: 'USD',
                },
                statistic: 'Maximum',
                period: cdk.Duration.hours(6),
            }),
            threshold: 5,
            evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        });
        this.billingAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));
        // Create error rate alarm: 10 errors in 5 minutes
        const errorMetric = new cloudwatch.MathExpression({
            expression: 'e1 + e2 + e3',
            usingMetrics: {
                e1: connectHandler.metricErrors({ statistic: 'Sum', period: cdk.Duration.minutes(5) }),
                e2: disconnectHandler.metricErrors({ statistic: 'Sum', period: cdk.Duration.minutes(5) }),
                e3: audioProcessor.metricErrors({ statistic: 'Sum', period: cdk.Duration.minutes(5) }),
            },
        });
        this.errorRateAlarm = new cloudwatch.Alarm(this, 'ErrorRateAlarm', {
            alarmName: `VocalShield-ErrorRate-${config.tags.Environment}`,
            alarmDescription: 'Alert when Lambda error count exceeds 10 in 5 minutes',
            metric: errorMetric,
            threshold: 10,
            evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        });
        this.errorRateAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));
        // Create connection limit alarm: 900 concurrent connections (approaching Free Tier limit of 1000)
        this.connectionLimitAlarm = new cloudwatch.Alarm(this, 'ConnectionLimitAlarm', {
            alarmName: `VocalShield-ConnectionLimit-${config.tags.Environment}`,
            alarmDescription: 'Alert when concurrent connections approach Free Tier limit',
            metric: connectHandler.metricInvocations({
                statistic: 'Sum',
                period: cdk.Duration.minutes(1),
            }),
            threshold: 900,
            evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        });
        this.connectionLimitAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));
        // Create DLQ alarm: messages in dead-letter queue
        this.dlqAlarm = new cloudwatch.Alarm(this, 'DlqAlarm', {
            alarmName: `VocalShield-DLQ-${config.tags.Environment}`,
            alarmDescription: 'Alert when messages appear in dead-letter queue',
            metric: audioQueueDlq.metricApproximateNumberOfMessagesVisible({
                statistic: 'Sum',
                period: cdk.Duration.minutes(5),
            }),
            threshold: 1,
            evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        });
        this.dlqAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));
        // Apply tags
        cdk.Tags.of(this.alarmTopic).add('Component', 'CloudWatchAlarms');
        cdk.Tags.of(this.billingAlarm).add('Component', 'CloudWatchAlarms');
        cdk.Tags.of(this.errorRateAlarm).add('Component', 'CloudWatchAlarms');
        cdk.Tags.of(this.connectionLimitAlarm).add('Component', 'CloudWatchAlarms');
        cdk.Tags.of(this.dlqAlarm).add('Component', 'CloudWatchAlarms');
        // Output alarm topic ARN for subscription configuration
        new cdk.CfnOutput(this, 'AlarmTopicArn', {
            value: this.alarmTopic.topicArn,
            description: 'SNS Topic ARN for CloudWatch alarm notifications',
            exportName: `${config.tags.Environment}-VocalShield-AlarmTopic`,
        });
    }
}
exports.CloudWatchAlarmsConstruct = CloudWatchAlarmsConstruct;
//# sourceMappingURL=cloudwatch-alarms.js.map