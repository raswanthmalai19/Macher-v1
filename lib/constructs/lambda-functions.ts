import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface LambdaFunctionsConstructProps {
  config: EnvironmentConfig;
  connectionsTableName: string;
  connectionsTableArn: string;
  metadataTableName: string;
  metadataTableArn: string;
  guardianLinksTableName: string;
  guardianLinksTableArn: string;
}

/**
 * Construct for MACHER Lambda functions
 * 
 * Creates Lambda functions for:
 * - WebSocket connection handling ($connect)
 * - WebSocket disconnection handling ($disconnect)
 * - Audio processing
 * 
 * All functions use:
 * - Node.js 20.x runtime
 * - ARM64 architecture for cost optimization
 * - X-Ray active tracing for observability
 * - Structured JSON logging
 * - IAM roles with least privilege
 */
export class LambdaFunctionsConstruct extends Construct {
  public readonly connectHandler: lambda.Function;
  public readonly disconnectHandler: lambda.Function;
  public readonly audioProcessor: lambda.Function;
  public readonly investigationHandler: lambda.Function;
  public readonly guardianSyncHandler: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaFunctionsConstructProps) {
    super(scope, id);

    const { config, connectionsTableName, connectionsTableArn, metadataTableName, metadataTableArn, guardianLinksTableName, guardianLinksTableArn } = props;

    // Create Connect Handler Lambda (Task 5.1)
    this.connectHandler = new lambda.Function(this, 'ConnectHandler', {
      functionName: `MACHER-ConnectHandler-${config.tags.Environment}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/connect'),
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        CONNECTIONS_TABLE_NAME: connectionsTableName,
        ENVIRONMENT: config.tags.Environment,
        LOG_LEVEL: 'INFO',
        API_KEYS_SECRET_NAME: 'macher/api-keys',
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Handles WebSocket $connect route - validates and stores connection metadata',
    });

    // Grant DynamoDB PutItem permission on Connections Table only (Requirement 7.5)
    // Connection Manager needs PutItem to store connection records
    this.connectHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:PutItem'],
        resources: [connectionsTableArn],
      })
    );

    // Grant Secrets Manager permissions for Connect Handler (Requirement 12.1)
    // Connect Handler needs to retrieve API keys for authentication
    this.connectHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:macher/api-keys-*`,
        ],
      })
    );

    // CloudWatch Logs permissions are automatically granted by Lambda construct
    // X-Ray permissions are automatically granted when tracing is enabled

    // Create Disconnect Handler Lambda (Task 5.2)
    this.disconnectHandler = new lambda.Function(this, 'DisconnectHandler', {
      functionName: `MACHER-DisconnectHandler-${config.tags.Environment}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/disconnect'),
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        CONNECTIONS_TABLE_NAME: connectionsTableName,
        ENVIRONMENT: config.tags.Environment,
        LOG_LEVEL: 'INFO',
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Handles WebSocket $disconnect route - updates connection status to disconnected',
    });

    // Grant DynamoDB UpdateItem and DeleteItem permissions on Connections Table only (Requirement 7.5)
    // Disconnect Handler needs UpdateItem to mark connections as disconnected
    // and DeleteItem to remove connection records
    this.disconnectHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:UpdateItem', 'dynamodb:DeleteItem'],
        resources: [connectionsTableArn],
      })
    );

    // CloudWatch Logs permissions are automatically granted by Lambda construct
    // X-Ray permissions are automatically granted when tracing is enabled

    // Create Audio Processor Lambda (Task 5.3)
    this.audioProcessor = new lambda.Function(this, 'AudioProcessor', {
      functionName: `MACHER-AudioProcessor-${config.tags.Environment}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/audio-processor'),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        CONNECTIONS_TABLE_NAME: connectionsTableName,
        METADATA_TABLE_NAME: metadataTableName,
        ENVIRONMENT: config.tags.Environment,
        LOG_LEVEL: 'INFO',
        // SNS_TOPIC_ARN and EVENT_BUS_NAME will be added when those resources are created (Task 9, 10)
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Processes audio data, detects fraud, stores metadata, and publishes events',
    });

    // Grant DynamoDB permissions for Audio Processor (Requirement 7.5)
    // Audio Processor needs PutItem to store call metadata
    // Query permission for GSI access if needed
    this.audioProcessor.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:PutItem', 'dynamodb:Query'],
        resources: [
          metadataTableArn,
          `${metadataTableArn}/index/*`, // GSI access
        ],
      })
    );

    // Grant Amazon Transcribe Streaming permissions (Requirement 7.5)
    // Audio Processor needs to stream audio for real-time transcription
    this.audioProcessor.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'transcribe:StartStreamTranscription',
        ],
        resources: ['*'], // Transcribe streaming doesn't support resource-level permissions
      })
    );

    // Grant Amazon Bedrock permissions (Requirement 7.5)
    // Audio Processor needs to invoke Bedrock Agent for fraud detection
    // Restrict to specific agent and model if possible
    this.audioProcessor.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeAgent',
          'bedrock:InvokeModel',
        ],
        resources: [
          // Allow access to Bedrock agents in this account
          `arn:aws:bedrock:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:agent/*`,
          // Allow access to Claude 3.5 Sonnet model
          `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/anthropic.claude-3-5-sonnet-*`,
        ],
      })
    );

    // Grant Bedrock Knowledge Base permissions (Requirement 7.5)
    this.audioProcessor.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:Retrieve',
        ],
        resources: [
          `arn:aws:bedrock:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:knowledge-base/*`,
        ],
      })
    );

    // Grant Secrets Manager permissions for Audio Processor
    // Restrict access to macher/* secrets only
    this.audioProcessor.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:macher/*`,
        ],
      })
    );

    // Grant Parameter Store permissions for Audio Processor
    // Restrict access to /macher/* parameters only
    this.audioProcessor.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:parameter/macher/*`,
        ],
      })
    );

    // SNS and EventBridge permissions
    this.audioProcessor.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['events:PutEvents'],
        resources: [
          `arn:aws:events:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:event-bus/default`,
        ],
      })
    );

    // Create Investigation Handler Lambda (Task 9.4)
    this.investigationHandler = new lambda.Function(this, 'InvestigationHandler', {
      functionName: `MACHER-InvestigationHandler-${config.tags.Environment}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/investigation'),
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        ENVIRONMENT: config.tags.Environment,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Performs deep fraud investigation analysis for high-severity cases',
    });

    // Create Guardian Sync Handler Lambda
    this.guardianSyncHandler = new lambda.Function(this, 'GuardianSyncHandler', {
      functionName: `MACHER-GuardianSync-${config.tags.Environment}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/guardian-sync'),
      memorySize: 512,
      timeout: cdk.Duration.seconds(15),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        GUARDIAN_LINKS_TABLE_NAME: guardianLinksTableName,
        ENVIRONMENT: config.tags.Environment,
        LOG_LEVEL: 'INFO',
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Handles guardian-protected user link CRUD and sync operations',
    });

    // Grant DynamoDB permissions for Guardian Sync
    this.guardianSyncHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:PutItem',
          'dynamodb:GetItem',
          'dynamodb:UpdateItem',
          'dynamodb:Query',
        ],
        resources: [
          guardianLinksTableArn,
          `${guardianLinksTableArn}/index/*`,
        ],
      })
    );

    // Apply tags to all Lambda functions
    cdk.Tags.of(this.connectHandler).add('Component', 'ConnectHandler');
    cdk.Tags.of(this.disconnectHandler).add('Component', 'DisconnectHandler');
    cdk.Tags.of(this.audioProcessor).add('Component', 'AudioProcessor');
    cdk.Tags.of(this.investigationHandler).add('Component', 'InvestigationHandler');
    cdk.Tags.of(this.guardianSyncHandler).add('Component', 'GuardianSyncHandler');
  }
}
