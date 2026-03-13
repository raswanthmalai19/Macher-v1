import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/types';

/**
 * DynamoDB Tables Construct for VocalShield Competition MVP Backend
 * 
 * Creates two DynamoDB tables for the real-time fraud detection system:
 * 1. Connection Store: Tracks active WebSocket connections
 * 2. Metadata Store: Stores call session metadata and fraud analysis results
 * 
 * Both tables use On-Demand billing for Free Tier compliance and have TTL
 * enabled for automatic privacy-preserving data expiration (24 hours).
 * 
 * Privacy-first design: No audio data is stored, only metadata and redacted
 * transcription snippets (max 200 characters).
 * 
 * Requirements: 6.1, 6.4, 6.5, 7.3, 9.2
 */
export class DynamoDbTablesConstruct extends Construct {
  public readonly connectionsTable: dynamodb.Table;
  public readonly metadataTable: dynamodb.Table;
  public readonly guardianLinksTable: dynamodb.Table;

  constructor(scope: Construct, id: string, config: EnvironmentConfig) {
    super(scope, id);

    // Create Connection Store Table
    // Tracks active WebSocket connections with automatic cleanup via TTL
    // Requirement 1.2: Store Connection_ID with timestamp on connection establishment
    // Requirement 1.7: TTL enabled to automatically delete connection records after 24 hours
    this.connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      tableName: `${config.stackName}-Connections`,
      
      // Partition key: connectionId (unique WebSocket connection identifier)
      // Requirement 1.1: Connection_ID is the primary identifier
      partitionKey: {
        name: 'connectionId',
        type: dynamodb.AttributeType.STRING,
      },
      
      // Sort key: connectedAt (timestamp for ordering)
      sortKey: {
        name: 'connectedAt',
        type: dynamodb.AttributeType.NUMBER,
      },
      
      // On-demand billing mode for Free Tier compliance
      // Requirement 9.2: Use On-Demand billing to avoid idle capacity costs
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      
      // Enable TTL for automatic data expiration (24 hours)
      // Requirement 1.7: Automatically delete connection records after 24 hours
      timeToLiveAttribute: 'ttl',
      
      // Disable point-in-time recovery for cost optimization
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: false,
      },
      
      // Encryption at rest using AWS managed keys (free)
      // Requirement 6.7: Encrypt data at rest with AWS managed keys
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      
      // Removal policy: DESTROY for dev, RETAIN for production
      removalPolicy: config.environment === 'production' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      
      // Deletion protection for production to prevent accidental deletion
      deletionProtection: config.environment === 'production',
    });

    // Add tags to Connection Store Table
    // Requirement 7.3: Tag all resources with Project=VocalShield
    cdk.Tags.of(this.connectionsTable).add('Name', `${config.stackName}-Connections`);
    cdk.Tags.of(this.connectionsTable).add('DataType', 'ConnectionMetadata');
    cdk.Tags.of(this.connectionsTable).add('TTL', '24 hours');

    // Output Connections Table name
    new cdk.CfnOutput(this, 'ConnectionsTableName', {
      value: this.connectionsTable.tableName,
      description: 'DynamoDB Connections Table name',
      exportName: `${config.stackName}-ConnectionsTableName`,
    });

    // Output Connections Table ARN
    new cdk.CfnOutput(this, 'ConnectionsTableArn', {
      value: this.connectionsTable.tableArn,
      description: 'DynamoDB Connections Table ARN',
      exportName: `${config.stackName}-ConnectionsTableArn`,
    });

    // Create Metadata Store Table
    // Stores call session metadata and fraud detection results with 24-hour retention
    // Requirement 6.1: Store call metadata (callSessionId, timestamp, riskScore, threatLevel, fraudIndicators)
    // Requirement 6.2: SHALL NOT store raw audio data, audio recordings, or complete transcriptions
    // Requirement 6.4: TTL enabled to automatically delete records after 24 hours
    this.metadataTable = new dynamodb.Table(this, 'MetadataTable', {
      tableName: `${config.stackName}-Metadata`,
      
      // Partition key: callSessionId (unique call session identifier)
      // Requirement 6.1: callSessionId is the primary identifier for call sessions
      partitionKey: {
        name: 'callSessionId',
        type: dynamodb.AttributeType.STRING,
      },
      
      // Sort key: timestamp (for ordering events within a session)
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.NUMBER,
      },
      
      // On-Demand billing mode for Free Tier compliance
      // Requirement 6.5: Use On-Demand billing mode
      // Requirement 9.2: Avoid idle capacity costs
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      
      // Enable TTL for automatic data expiration (24 hours)
      // Requirement 6.4: Automatically delete records after 24 hours for privacy
      timeToLiveAttribute: 'ttl',
      
      // Disable point-in-time recovery for cost optimization
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: false,
      },
      
      // Encryption at rest using AWS managed keys (free)
      // Requirement 6.7: Encrypt data at rest with AWS managed keys
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      
      // Removal policy: DESTROY for dev, RETAIN for production
      removalPolicy: config.environment === 'production' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      
      // Deletion protection for production to prevent accidental deletion
      deletionProtection: config.environment === 'production',
    });

    // Create GSI: connectionId-timestamp-index
    // Allows querying by connectionId to get all sessions for a connection
    this.metadataTable.addGlobalSecondaryIndex({
      indexName: 'connectionId-timestamp-index',
      partitionKey: {
        name: 'connectionId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.NUMBER,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add tags to Metadata Store Table
    // Requirement 7.3: Tag all resources with Project=VocalShield
    cdk.Tags.of(this.metadataTable).add('Name', `${config.stackName}-Metadata`);
    cdk.Tags.of(this.metadataTable).add('DataType', 'CallMetadata');
    cdk.Tags.of(this.metadataTable).add('TTL', '24 hours');
    cdk.Tags.of(this.metadataTable).add('Privacy', 'NoAudioStorage');

    // Output Metadata Table name
    new cdk.CfnOutput(this, 'MetadataTableName', {
      value: this.metadataTable.tableName,
      description: 'DynamoDB Metadata Table name',
      exportName: `${config.stackName}-MetadataTableName`,
    });

    // Output Metadata Table ARN
    new cdk.CfnOutput(this, 'MetadataTableArn', {
      value: this.metadataTable.tableArn,
      description: 'DynamoDB Metadata Table ARN',
      exportName: `${config.stackName}-MetadataTableArn`,
    });

    // Guardian Links Table
    // Stores guardian-protected user pairing relationships for cross-device sync
    this.guardianLinksTable = new dynamodb.Table(this, 'GuardianLinksTable', {
      tableName: `${config.stackName}-GuardianLinks`,
      partitionKey: {
        name: 'linkId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: config.environment === 'production'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      deletionProtection: config.environment === 'production',
    });

    // GSI: lookup by linkCode for QR pairing
    this.guardianLinksTable.addGlobalSecondaryIndex({
      indexName: 'linkCode-index',
      partitionKey: {
        name: 'linkCode',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI: lookup by guardianId to list all protected users
    this.guardianLinksTable.addGlobalSecondaryIndex({
      indexName: 'guardianId-index',
      partitionKey: {
        name: 'guardianId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.NUMBER,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    cdk.Tags.of(this.guardianLinksTable).add('Name', `${config.stackName}-GuardianLinks`);
    cdk.Tags.of(this.guardianLinksTable).add('DataType', 'GuardianPairing');

    new cdk.CfnOutput(this, 'GuardianLinksTableName', {
      value: this.guardianLinksTable.tableName,
      description: 'DynamoDB Guardian Links Table name',
      exportName: `${config.stackName}-GuardianLinksTableName`,
    });

    new cdk.CfnOutput(this, 'GuardianLinksTableArn', {
      value: this.guardianLinksTable.tableArn,
      description: 'DynamoDB Guardian Links Table ARN',
      exportName: `${config.stackName}-GuardianLinksTableArn`,
    });
  }
}
