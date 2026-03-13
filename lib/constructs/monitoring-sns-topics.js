"use strict";
/**
 * Monitoring SNS Topics Construct
 *
 * Creates SNS topics for different alarm severity levels:
 * - Critical alerts (immediate action required)
 * - Warning alerts (attention needed)
 * - Info alerts (informational)
 *
 * Also creates Slack webhook Lambda for Slack notifications.
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
exports.MonitoringSnsTopicsConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const subscriptions = __importStar(require("aws-cdk-lib/aws-sns-subscriptions"));
const constructs_1 = require("constructs");
const slack_webhook_lambda_1 = require("./slack-webhook-lambda");
class MonitoringSnsTopicsConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { config, emailSubscriptions, enableSlackNotifications = true } = props;
        // Critical alerts topic
        this.criticalAlertsTopic = new sns.Topic(this, 'CriticalAlertsTopic', {
            topicName: `VocalShield-${config.tags.Environment}-Critical-Alerts`,
            displayName: 'VocalShield Critical Alerts',
            fifo: false,
        });
        // Warning alerts topic
        this.warningAlertsTopic = new sns.Topic(this, 'WarningAlertsTopic', {
            topicName: `VocalShield-${config.tags.Environment}-Warning-Alerts`,
            displayName: 'VocalShield Warning Alerts',
            fifo: false,
        });
        // Info alerts topic
        this.infoAlertsTopic = new sns.Topic(this, 'InfoAlertsTopic', {
            topicName: `VocalShield-${config.tags.Environment}-Info-Alerts`,
            displayName: 'VocalShield Info Alerts',
            fifo: false,
        });
        // Add email subscriptions if provided
        if (emailSubscriptions?.critical) {
            emailSubscriptions.critical.forEach(email => {
                this.criticalAlertsTopic.addSubscription(new subscriptions.EmailSubscription(email));
            });
        }
        if (emailSubscriptions?.warning) {
            emailSubscriptions.warning.forEach(email => {
                this.warningAlertsTopic.addSubscription(new subscriptions.EmailSubscription(email));
            });
        }
        if (emailSubscriptions?.info) {
            emailSubscriptions.info.forEach(email => {
                this.infoAlertsTopic.addSubscription(new subscriptions.EmailSubscription(email));
            });
        }
        // Create Slack webhook Lambda and subscribe to topics (Task 9.2)
        if (enableSlackNotifications) {
            this.slackWebhook = new slack_webhook_lambda_1.SlackWebhookLambdaConstruct(this, 'SlackWebhook', {
                config,
                criticalAlertsTopic: this.criticalAlertsTopic,
                warningAlertsTopic: this.warningAlertsTopic,
                infoAlertsTopic: this.infoAlertsTopic,
            });
        }
        // Add tags
        cdk.Tags.of(this.criticalAlertsTopic).add('Severity', 'critical');
        cdk.Tags.of(this.warningAlertsTopic).add('Severity', 'warning');
        cdk.Tags.of(this.infoAlertsTopic).add('Severity', 'info');
        // Outputs
        new cdk.CfnOutput(this, 'CriticalAlertsTopicArn', {
            value: this.criticalAlertsTopic.topicArn,
            description: 'SNS Topic ARN for critical alerts',
            exportName: `${config.tags.Environment}-VocalShield-CriticalAlertsTopic`,
        });
        new cdk.CfnOutput(this, 'WarningAlertsTopicArn', {
            value: this.warningAlertsTopic.topicArn,
            description: 'SNS Topic ARN for warning alerts',
            exportName: `${config.tags.Environment}-VocalShield-WarningAlertsTopic`,
        });
        new cdk.CfnOutput(this, 'InfoAlertsTopicArn', {
            value: this.infoAlertsTopic.topicArn,
            description: 'SNS Topic ARN for info alerts',
            exportName: `${config.tags.Environment}-VocalShield-InfoAlertsTopic`,
        });
    }
}
exports.MonitoringSnsTopicsConstruct = MonitoringSnsTopicsConstruct;
//# sourceMappingURL=monitoring-sns-topics.js.map