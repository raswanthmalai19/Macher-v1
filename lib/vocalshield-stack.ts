import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './config';
import { VpcConstruct } from './constructs/vpc';
import { DynamoDbTablesConstruct } from './constructs/dynamodb-tables';
import { SecretsManagerConstruct } from './constructs/secrets-manager';
import { LambdaFunctionsConstruct } from './constructs/lambda-functions';
import { SqsQueuesConstruct } from './constructs/sqs-queues';
import { WebSocketApiConstruct } from './constructs/websocket-api';
import { SnsTopicConstruct } from './constructs/sns-topic';
import { MonitoringSnsTopicsConstruct } from './constructs/monitoring-sns-topics';
import { CloudWatchDashboardConstruct } from './constructs/cloudwatch-dashboard';
import { CloudWatchAlarmsConstruct } from './constructs/cloudwatch-alarms';
import { FraudDetectionConstruct } from './constructs/fraud-detection';

/**
 * MACHER Infrastructure Stack
 * 
 * This stack defines the AWS infrastructure for MACHER, a real-time
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
export class MACHERStack extends cdk.Stack {
  public readonly vpc: VpcConstruct;
  public readonly dynamoDbTables: DynamoDbTablesConstruct;
  public readonly secretsManager: SecretsManagerConstruct;
  public readonly lambdaFunctions: LambdaFunctionsConstruct;
  public readonly sqsQueues: SqsQueuesConstruct;
  public readonly webSocketApi: WebSocketApiConstruct;
  public readonly snsTopic: SnsTopicConstruct;
  public readonly monitoringSnsTopics: MonitoringSnsTopicsConstruct;
  public readonly cloudWatchDashboard: CloudWatchDashboardConstruct;
  public readonly cloudWatchAlarms: CloudWatchAlarmsConstruct;
  public readonly fraudDetection?: FraudDetectionConstruct;

  constructor(scope: Construct, id: string, config: EnvironmentConfig, props?: cdk.StackProps) {
    super(scope, id, props);

    // Apply tags to all resources in the stack
    cdk.Tags.of(this).add('Project', config.tags.Project);
    cdk.Tags.of(this).add('Environment', config.tags.Environment);
    cdk.Tags.of(this).add('ManagedBy', config.tags.ManagedBy);
    cdk.Tags.of(this).add('CostCenter', config.tags.CostCenter);

    // Create VPC and network foundation (Task 2.1)
    this.vpc = new VpcConstruct(this, 'VpcConstruct', config);

    // Create DynamoDB tables (Task 3.1, 3.2)
    this.dynamoDbTables = new DynamoDbTablesConstruct(this, 'DynamoDbTables', config);

    // Create Secrets Manager (Task 4.1)
    this.secretsManager = new SecretsManagerConstruct(this, 'SecretsManager', {
      environment: config.tags.Environment,
    });

    // Create Lambda functions (Task 5.1, 5.2, 5.3)
    this.lambdaFunctions = new LambdaFunctionsConstruct(this, 'LambdaFunctions', {
      config,
      connectionsTableName: this.dynamoDbTables.connectionsTable.tableName,
      connectionsTableArn: this.dynamoDbTables.connectionsTable.tableArn,
      metadataTableName: this.dynamoDbTables.metadataTable.tableName,
      metadataTableArn: this.dynamoDbTables.metadataTable.tableArn,
    });

    // Create SQS queues (Task 9.2 - created early for WebSocket API integration)
    this.sqsQueues = new SqsQueuesConstruct(this, 'SqsQueues', {
      config,
    });

    // Create SNS topic for Family Loop notifications (Task 10.1)
    this.snsTopic = new SnsTopicConstruct(this, 'SnsTopic', {
      config,
    });

    // Create Monitoring SNS Topics for alerts (Task 8.2, 9.2)
    this.monitoringSnsTopics = new MonitoringSnsTopicsConstruct(this, 'MonitoringSnsTopics', {
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
    this.lambdaFunctions.audioProcessor.addEnvironment(
      'SNS_TOPIC_ARN',
      this.snsTopic.familyLoopTopic.topicArn
    );

    // Create WebSocket API (Task 8.1)
    this.webSocketApi = new WebSocketApiConstruct(this, 'WebSocketApi', {
      config,
      connectHandler: this.lambdaFunctions.connectHandler,
      disconnectHandler: this.lambdaFunctions.disconnectHandler,
      audioProcessor: this.lambdaFunctions.audioProcessor,
    });

    // Grant Audio Processor permission to send messages back through WebSocket
    this.lambdaFunctions.audioProcessor.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['execute-api:ManageConnections'],
        resources: [
          `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.webSocketApi.apiId}/*`,
        ],
      })
    );

    // Create CloudWatch Dashboard (Task 12.1)
    this.cloudWatchDashboard = new CloudWatchDashboardConstruct(this, 'CloudWatchDashboard', {
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
    this.cloudWatchAlarms = new CloudWatchAlarmsConstruct(this, 'CloudWatchAlarms', {
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
      this.fraudDetection = new FraudDetectionConstruct(this, 'FraudDetection', {
        config,
        bedrockAgentId,
        bedrockAgentAliasId,
        guardrailId,
        guardrailVersion,
        knowledgeBaseId,
        notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL,
      });

      // Add fraud detection API endpoint to audio processor environment
      this.lambdaFunctions.audioProcessor.addEnvironment(
        'FRAUD_DETECTION_API_URL',
        `${this.fraudDetection.api.url}analyze`
      );
    } else {
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
      exportName: `${config.tags.Environment}-MACHER-WebSocketEndpoint`,
    });

    new cdk.CfnOutput(this, 'WebSocketApiId', {
      value: this.webSocketApi.webSocketApi.apiId,
      description: 'WebSocket API ID',
      exportName: `${config.tags.Environment}-MACHER-WebSocketApiId`,
    });

    new cdk.CfnOutput(this, 'ConnectionsTableName', {
      value: this.dynamoDbTables.connectionsTable.tableName,
      description: 'DynamoDB Connections Table name',
      exportName: `${config.tags.Environment}-MACHER-ConnectionsTable`,
    });

    new cdk.CfnOutput(this, 'MetadataTableName', {
      value: this.dynamoDbTables.metadataTable.tableName,
      description: 'DynamoDB Metadata Table name',
      exportName: `${config.tags.Environment}-MACHER-MetadataTable`,
    });

    new cdk.CfnOutput(this, 'FamilyLoopTopicArn', {
      value: this.snsTopic.familyLoopTopic.topicArn,
      description: 'SNS Family Loop Topic ARN',
      exportName: `${config.tags.Environment}-MACHER-FamilyLoopTopic`,
    });

    new cdk.CfnOutput(this, 'AudioQueueUrl', {
      value: this.sqsQueues.audioQueue.queueUrl,
      description: 'SQS Audio Queue URL',
      exportName: `${config.tags.Environment}-MACHER-AudioQueue`,
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
