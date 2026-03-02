import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/types';

/**
 * DynamoDB Tables Construct for MACHER
 * 
 * Creates DynamoDB tables for storing WebSocket connection metadata
 * and session processing metadata. Both tables use on-demand billing
 * mode for cost optimization and have TTL enabled for automatic data
 * expiration.
 * 
 * Requirements: 4.1, 4.2, 4.5, 7.6
 */
export class DynamoDbTablesConstruct extends Construct {
  public readonly connectionsTable: dynamodb.Table;
  public readonly metadataTable: dynamodb.Table;

  constructor(scope: Construct, id: string, config: EnvironmentConfig) {
    super(scope, id);

    // Create Connections Table
    // Tracks active WebSocket connections with automatic cleanup via TTL
    this.connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      tableName: `${config.stackName}-Connections`,
      
      // Partition key: connectionId (unique WebSocket connection identifier)
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
      // No provisioned capacity charges when idle
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      
      // Enable TTL for automatic data expiration (24 hours)
      timeToLiveAttribute: 'ttl',
      
      // Disable point-in-time recovery for cost optimization
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: false,
      },
      
      // Encryption at rest using AWS managed keys (free)
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      
      // Removal policy: DESTROY for dev, RETAIN for production
      removalPolicy: config.environment === 'production' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      
      // Deletion protection for production to prevent accidental deletion
      deletionProtection: config.environment === 'production',
    });

    // Add tags to Connections Table
    cdk.Tags.of(this.connectionsTable).add('Name', `${config.stackName}-Connections`);
    cdk.Tags.of(this.connectionsTable).add('DataType', 'ConnectionMetadata');
    cdk.Tags.of(this.connectionsTable).add('TTL', `${config.connectionsTtlDays} days`);

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

    // Create Metadata Table
    // Stores session and fraud detection metadata with 30-day retention
    this.metadataTable = new dynamodb.Table(this, 'MetadataTable', {
      tableName: `${config.stackName}-Metadata`,
      
      // Partition key: sessionId (unique session identifier)
      partitionKey: {
        name: 'sessionId',
        type: dynamodb.AttributeType.STRING,
      },
      
      // Sort key: timestamp (for ordering events within a session)
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.NUMBER,
      },
      
      // On-demand billing mode for Free Tier compliance
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      
      // Enable TTL for automatic data expiration (30 days)
      timeToLiveAttribute: 'ttl',
      
      // Disable point-in-time recovery for cost optimization
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: false,
      },
      
      // Encryption at rest using AWS managed keys (free)
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

    // Add tags to Metadata Table
    cdk.Tags.of(this.metadataTable).add('Name', `${config.stackName}-Metadata`);
    cdk.Tags.of(this.metadataTable).add('DataType', 'SessionMetadata');
    cdk.Tags.of(this.metadataTable).add('TTL', `${config.metadataTtlDays} days`);

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
  }
}
