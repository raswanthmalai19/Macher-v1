"use strict";
/**
 * Slack Webhook Lambda Construct
 *
 * Creates a Lambda function that transforms SNS alarm notifications into Slack messages.
 *
 * Features:
 * - Subscribes to SNS topics (critical, warning, info)
 * - Formats CloudWatch Alarm messages for Slack
 * - Color-codes messages by severity
 * - Retrieves webhook URL from Secrets Manager
 * - Dead Letter Queue for failed invocations
 * - X-Ray tracing enabled
 *
 * Requirements: 16.5
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
exports.SlackWebhookLambdaConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const sqs = __importStar(require("aws-cdk-lib/aws-sqs"));
const subscriptions = __importStar(require("aws-cdk-lib/aws-sns-subscriptions"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const constructs_1 = require("constructs");
class SlackWebhookLambdaConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { config, criticalAlertsTopic, warningAlertsTopic, infoAlertsTopic } = props;
        // Create Dead Letter Queue for failed Lambda invocations (Task 9.2)
        this.deadLetterQueue = new sqs.Queue(this, 'SlackWebhookDLQ', {
            queueName: `VocalShield-SlackWebhook-DLQ-${config.tags.Environment}`,
            retentionPeriod: cdk.Duration.days(14), // Retain failed messages for 14 days
            encryption: sqs.QueueEncryption.SQS_MANAGED,
        });
        // Create Slack Webhook Lambda function (Task 9.1)
        this.slackWebhookFunction = new lambda.Function(this, 'SlackWebhookFunction', {
            functionName: `VocalShield-SlackWebhook-${config.tags.Environment}`,
            runtime: lambda.Runtime.NODEJS_20_X,
            architecture: lambda.Architecture.ARM_64,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('lambda/slack-webhook'),
            memorySize: 512,
            timeout: cdk.Duration.seconds(10),
            tracing: lambda.Tracing.ACTIVE,
            environment: {
                SLACK_WEBHOOK_SECRET_NAME: `vocalshield/slack-webhook-url`,
                ENVIRONMENT: config.tags.Environment,
            },
            logRetention: logs.RetentionDays.ONE_WEEK,
            description: 'Transforms SNS alarm notifications to Slack messages',
            deadLetterQueue: this.deadLetterQueue,
        });
        // Grant Secrets Manager permissions to retrieve Slack webhook URL
        this.slackWebhookFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['secretsmanager:GetSecretValue'],
            resources: [
                `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:vocalshield/slack-webhook-url-*`,
            ],
        }));
        // Subscribe Lambda to SNS topics (Task 9.2)
        // Critical alerts
        criticalAlertsTopic.addSubscription(new subscriptions.LambdaSubscription(this.slackWebhookFunction, {
            deadLetterQueue: this.deadLetterQueue,
        }));
        // Warning alerts
        warningAlertsTopic.addSubscription(new subscriptions.LambdaSubscription(this.slackWebhookFunction, {
            deadLetterQueue: this.deadLetterQueue,
        }));
        // Info alerts
        infoAlertsTopic.addSubscription(new subscriptions.LambdaSubscription(this.slackWebhookFunction, {
            deadLetterQueue: this.deadLetterQueue,
        }));
        // Add tags
        cdk.Tags.of(this.slackWebhookFunction).add('Component', 'SlackWebhook');
        cdk.Tags.of(this.deadLetterQueue).add('Component', 'SlackWebhook');
        // Outputs
        new cdk.CfnOutput(this, 'SlackWebhookFunctionArn', {
            value: this.slackWebhookFunction.functionArn,
            description: 'Slack Webhook Lambda Function ARN',
            exportName: `${config.tags.Environment}-VocalShield-SlackWebhookFunction`,
        });
        new cdk.CfnOutput(this, 'SlackWebhookDLQUrl', {
            value: this.deadLetterQueue.queueUrl,
            description: 'Slack Webhook Dead Letter Queue URL',
            exportName: `${config.tags.Environment}-VocalShield-SlackWebhookDLQ`,
        });
        new cdk.CfnOutput(this, 'SlackWebhookDLQArn', {
            value: this.deadLetterQueue.queueArn,
            description: 'Slack Webhook Dead Letter Queue ARN',
        });
    }
}
exports.SlackWebhookLambdaConstruct = SlackWebhookLambdaConstruct;
//# sourceMappingURL=slack-webhook-lambda.js.map