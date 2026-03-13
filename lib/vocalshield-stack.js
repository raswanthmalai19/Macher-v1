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
exports.VocalShieldStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const vpc_1 = require("./constructs/vpc");
const dynamodb_tables_1 = require("./constructs/dynamodb-tables");
const secrets_manager_1 = require("./constructs/secrets-manager");
const lambda_functions_1 = require("./constructs/lambda-functions");
const sqs_queues_1 = require("./constructs/sqs-queues");
const websocket_api_1 = require("./constructs/websocket-api");
const sns_topic_1 = require("./constructs/sns-topic");
const monitoring_sns_topics_1 = require("./constructs/monitoring-sns-topics");
const cloudwatch_dashboard_1 = require("./constructs/cloudwatch-dashboard");
const cloudwatch_alarms_1 = require("./constructs/cloudwatch-alarms");
const fraud_detection_1 = require("./constructs/fraud-detection");
/**
 * VocalShield Infrastructure Stack
 *
 * This stack defines the AWS infrastructure for VocalShield, a real-time
 * conversation firewall that protects users from voice-based financial fraud.
 *
 * The infrastructure includes:
 * - WebSocket API for real-time audio streaming
 * - Lambda functions for connection handling and audio processing
 * - DynamoDB tables for metadata storage
 * - SNS topics for fraud notifications
 * - EventBridge for event-driven architecture
 * - CloudWatch for monitoring and observability
 * - VPC for future Wavelength Zone support
 */
class VocalShieldStack extends cdk.Stack {
    constructor(scope, id, config, props) {
        super(scope, id, props);
        // Apply tags to all resources in the stack
        cdk.Tags.of(this).add('Project', config.tags.Project);
        cdk.Tags.of(this).add('Environment', config.tags.Environment);
        cdk.Tags.of(this).add('ManagedBy', config.tags.ManagedBy);
        cdk.Tags.of(this).add('CostCenter', config.tags.CostCenter);
        // Create VPC and network foundation (Task 2.1)
        this.vpc = new vpc_1.VpcConstruct(this, 'VpcConstruct', config);
        // Create DynamoDB tables (Task 3.1, 3.2)
        this.dynamoDbTables = new dynamodb_tables_1.DynamoDbTablesConstruct(this, 'DynamoDbTables', config);
        // Create Secrets Manager (Task 4.1)
        this.secretsManager = new secrets_manager_1.SecretsManagerConstruct(this, 'SecretsManager', {
            environment: config.tags.Environment,
        });
        // Create Lambda functions (Task 5.1, 5.2, 5.3)
        this.lambdaFunctions = new lambda_functions_1.LambdaFunctionsConstruct(this, 'LambdaFunctions', {
            config,
            connectionsTableName: this.dynamoDbTables.connectionsTable.tableName,
            connectionsTableArn: this.dynamoDbTables.connectionsTable.tableArn,
            metadataTableName: this.dynamoDbTables.metadataTable.tableName,
            metadataTableArn: this.dynamoDbTables.metadataTable.tableArn,
        });
        // Create SQS queues (Task 9.2 - created early for WebSocket API integration)
        this.sqsQueues = new sqs_queues_1.SqsQueuesConstruct(this, 'SqsQueues', {
            config,
        });
        // Create SNS topic for Family Loop notifications (Task 10.1)
        this.snsTopic = new sns_topic_1.SnsTopicConstruct(this, 'SnsTopic', {
            config,
        });
        // Create Monitoring SNS Topics for alerts (Task 8.2, 9.2)
        this.monitoringSnsTopics = new monitoring_sns_topics_1.MonitoringSnsTopicsConstruct(this, 'MonitoringSnsTopics', {
            config,
            emailSubscriptions: {
                // Email subscriptions can be configured via environment variables or context
                critical: process.env.CRITICAL_ALERT_EMAILS?.split(','),
                warning: process.env.WARNING_ALERT_EMAILS?.split(','),
                info: process.env.INFO_ALERT_EMAILS?.split(','),
            },
            enableSlackNotifications: true, // Enable Slack webhook Lambda
        });
        // Grant Audio Processor permission to publish to SNS topic
        this.snsTopic.grantPublish(this.lambdaFunctions.audioProcessor);
        // Add SNS topic ARN to Audio Processor environment variables
        this.lambdaFunctions.audioProcessor.addEnvironment('SNS_TOPIC_ARN', this.snsTopic.familyLoopTopic.topicArn);
        // Create WebSocket API (Task 8.1)
        this.webSocketApi = new websocket_api_1.WebSocketApiConstruct(this, 'WebSocketApi', {
            config,
            connectHandler: this.lambdaFunctions.connectHandler,
            disconnectHandler: this.lambdaFunctions.disconnectHandler,
            audioProcessor: this.lambdaFunctions.audioProcessor,
        });
        // Grant Audio Processor permission to send messages back through WebSocket
        this.lambdaFunctions.audioProcessor.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['execute-api:ManageConnections'],
            resources: [
                `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.webSocketApi.apiId}/*`,
            ],
        }));
        // Create CloudWatch Dashboard (Task 12.1)
        this.cloudWatchDashboard = new cloudwatch_dashboard_1.CloudWatchDashboardConstruct(this, 'CloudWatchDashboard', {
            config,
            webSocketApi: this.webSocketApi.webSocketApi,
            connectHandler: this.lambdaFunctions.connectHandler,
            disconnectHandler: this.lambdaFunctions.disconnectHandler,
            audioProcessor: this.lambdaFunctions.audioProcessor,
            connectionsTable: this.dynamoDbTables.connectionsTable,
            metadataTable: this.dynamoDbTables.metadataTable,
            familyLoopTopic: this.snsTopic.familyLoopTopic,
            audioQueue: this.sqsQueues.audioQueue,
        });
        // Create CloudWatch Alarms (Task 12.2)
        this.cloudWatchAlarms = new cloudwatch_alarms_1.CloudWatchAlarmsConstruct(this, 'CloudWatchAlarms', {
            config,
            connectHandler: this.lambdaFunctions.connectHandler,
            disconnectHandler: this.lambdaFunctions.disconnectHandler,
            audioProcessor: this.lambdaFunctions.audioProcessor,
            audioQueueDlq: this.sqsQueues.audioQueueDLQ,
        });
        // Create Fraud Detection infrastructure (Task 18.1)
        // Note: Bedrock resources must be created manually via setup scripts before deployment
        const bedrockAgentId = process.env.BEDROCK_AGENT_ID;
        const bedrockAgentAliasId = process.env.BEDROCK_AGENT_ALIAS_ID;
        const guardrailId = process.env.GUARDRAIL_ID;
        const guardrailVersion = process.env.GUARDRAIL_VERSION;
        const knowledgeBaseId = process.env.KNOWLEDGE_BASE_ID;
        if (bedrockAgentId && bedrockAgentAliasId && guardrailId && guardrailVersion && knowledgeBaseId) {
            this.fraudDetection = new fraud_detection_1.FraudDetectionConstruct(this, 'FraudDetection', {
                config,
                bedrockAgentId,
                bedrockAgentAliasId,
                guardrailId,
                guardrailVersion,
                knowledgeBaseId,
                notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL,
            });
            // Add fraud detection API endpoint to audio processor environment
            this.lambdaFunctions.audioProcessor.addEnvironment('FRAUD_DETECTION_API_URL', `${this.fraudDetection.api.url}analyze`);
        }
        else {
            console.warn('⚠️  Fraud Detection not deployed: Bedrock resources not configured');
            console.warn('   Run setup scripts in lambda/fraud-detection/scripts/ to create Bedrock resources');
        }
        // TODO: Implement infrastructure components in subsequent tasks
        // - DynamoDB tables (Task 3)
        // - Secrets Manager and Parameter Store (Task 4)
        // - Lambda functions (Task 5)
        // - IAM roles and policies (Task 7)
        // - WebSocket API Gateway (Task 8)
        // - Event-driven architecture (Task 9)
        // - SNS notification system (Task 10)
        // - CloudWatch monitoring (Task 12)
        // - AWS X-Ray tracing (Task 13)
        // - CloudWatch Synthetics canary (Task 14)
        // - AWS WAF (Task 15)
        // - Cost management (Task 16)
        // - CloudWatch Evidently (Task 17)
        // - AWS Backup (Task 18)
        // - Stack outputs (Task 21)
        // Stack outputs (Task 21.1)
        new cdk.CfnOutput(this, 'WebSocketApiEndpoint', {
            value: this.webSocketApi.webSocketApi.apiEndpoint,
            description: 'WebSocket API endpoint URL (wss://)',
            exportName: `${config.tags.Environment}-VocalShield-WebSocketEndpoint`,
        });
        new cdk.CfnOutput(this, 'WebSocketApiId', {
            value: this.webSocketApi.webSocketApi.apiId,
            description: 'WebSocket API ID',
            exportName: `${config.tags.Environment}-VocalShield-WebSocketApiId`,
        });
        new cdk.CfnOutput(this, 'ConnectionsTableName', {
            value: this.dynamoDbTables.connectionsTable.tableName,
            description: 'DynamoDB Connections Table name',
            exportName: `${config.tags.Environment}-VocalShield-ConnectionsTable`,
        });
        new cdk.CfnOutput(this, 'MetadataTableName', {
            value: this.dynamoDbTables.metadataTable.tableName,
            description: 'DynamoDB Metadata Table name',
            exportName: `${config.tags.Environment}-VocalShield-MetadataTable`,
        });
        new cdk.CfnOutput(this, 'FamilyLoopTopicArn', {
            value: this.snsTopic.familyLoopTopic.topicArn,
            description: 'SNS Family Loop Topic ARN',
            exportName: `${config.tags.Environment}-VocalShield-FamilyLoopTopic`,
        });
        new cdk.CfnOutput(this, 'AudioQueueUrl', {
            value: this.sqsQueues.audioQueue.queueUrl,
            description: 'SQS Audio Queue URL',
            exportName: `${config.tags.Environment}-VocalShield-AudioQueue`,
        });
        new cdk.CfnOutput(this, 'ConnectHandlerArn', {
            value: this.lambdaFunctions.connectHandler.functionArn,
            description: 'Connect Handler Lambda ARN',
        });
        new cdk.CfnOutput(this, 'DisconnectHandlerArn', {
            value: this.lambdaFunctions.disconnectHandler.functionArn,
            description: 'Disconnect Handler Lambda ARN',
        });
        new cdk.CfnOutput(this, 'AudioProcessorArn', {
            value: this.lambdaFunctions.audioProcessor.functionArn,
            description: 'Audio Processor Lambda ARN',
        });
        new cdk.CfnOutput(this, 'DashboardUrl', {
            value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.cloudWatchDashboard.dashboard.dashboardName}`,
            description: 'CloudWatch Dashboard URL',
        });
    }
}
exports.VocalShieldStack = VocalShieldStack;
//# sourceMappingURL=vocalshield-stack.js.map