import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface KnowledgeBaseConstructProps {
  config: EnvironmentConfig;
}

/**
 * Construct for Amazon Bedrock Knowledge Base Infrastructure
 * 
 * Creates S3 bucket and uploads scam pattern documents for use with
 * Amazon Bedrock Knowledge Base. The Knowledge Base itself must be
 * created manually via AWS Console or CLI due to CDK limitations.
 * 
 * This construct:
 * - Creates S3 bucket with encryption and access controls
 * - Uploads scam pattern documents from knowledge-base/ directory
 * - Configures IAM permissions for Bedrock access
 * - Outputs bucket name for Knowledge Base configuration
 * 
 * Requirements: 4.1, 4.2, 4.3, 11.1, 11.2, 11.5
 */
export class KnowledgeBaseConstruct extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly bucketName: string;

  constructor(scope: Construct, id: string, props: KnowledgeBaseConstructProps) {
    super(scope, id);

    const { config } = props;
    const accountId = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;

    // Create S3 bucket for Knowledge Base documents
    // Requirements: 11.2, 11.6
    this.bucket = new s3.Bucket(this, 'KnowledgeBaseBucket', {
      bucketName: `vocalshield-knowledge-base-${accountId}`,
      encryption: s3.BucketEncryption.S3_MANAGED, // AWS managed encryption
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // Block all public access
      versioned: true, // Enable versioning for document updates
      lifecycleRules: [
        {
          // Keep non-current versions for 30 days (for rollback)
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
      removalPolicy: config.tags.Environment === 'production' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: config.tags.Environment !== 'production', // Auto-delete in non-prod
    });

    this.bucketName = this.bucket.bucketName;

    // Upload scam pattern documents to S3
    // Requirements: 11.1, 11.3, 11.5
    new s3deploy.BucketDeployment(this, 'DeployScamPatterns', {
      sources: [s3deploy.Source.asset('knowledge-base')],
      destinationBucket: this.bucket,
      destinationKeyPrefix: 'scam-patterns/',
      prune: false, // Don't delete files not in source
      retainOnDelete: config.tags.Environment === 'production', // Retain in prod
    });

    // Create IAM role for Bedrock Knowledge Base to access S3
    // This role will be used when creating the Knowledge Base manually
    const bedrockKbRole = new iam.Role(this, 'BedrockKnowledgeBaseRole', {
      roleName: `VocalShield-BedrockKB-${config.tags.Environment}`,
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      description: 'IAM role for Bedrock Knowledge Base to access S3 bucket',
    });

    // Grant Bedrock Knowledge Base read access to S3 bucket
    this.bucket.grantRead(bedrockKbRole);

    // Add permissions for Bedrock to use the Knowledge Base
    bedrockKbRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:Retrieve',
          'bedrock:RetrieveAndGenerate',
        ],
        resources: [
          `arn:aws:bedrock:${region}:${accountId}:knowledge-base/*`,
        ],
      })
    );

    // Create IAM role for Bedrock Agent
    const bedrockAgentRole = new iam.Role(this, 'BedrockAgentRole', {
      roleName: `VocalShield-BedrockAgent-${config.tags.Environment}`,
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      description: 'IAM role for Bedrock Agent to invoke models and access Knowledge Base',
    });

    // Grant Bedrock Agent permissions to invoke Claude models
    bedrockAgentRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: [
          `arn:aws:bedrock:${region}::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0`,
          `arn:aws:bedrock:${region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
        ],
      })
    );

    // Grant Bedrock Agent access to Knowledge Base
    bedrockAgentRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:Retrieve',
          'bedrock:RetrieveAndGenerate',
        ],
        resources: [
          `arn:aws:bedrock:${region}:${accountId}:knowledge-base/*`,
        ],
      })
    );

    // Grant Bedrock Agent access to Guardrails
    bedrockAgentRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:ApplyGuardrail',
        ],
        resources: [
          `arn:aws:bedrock:${region}:${accountId}:guardrail/*`,
        ],
      })
    );

    // Add tags
    cdk.Tags.of(this.bucket).add('Component', 'KnowledgeBase');
    cdk.Tags.of(bedrockKbRole).add('Component', 'KnowledgeBase');
    cdk.Tags.of(bedrockAgentRole).add('Component', 'KnowledgeBase');

    // Stack outputs
    new cdk.CfnOutput(this, 'KnowledgeBaseBucketName', {
      value: this.bucket.bucketName,
      description: 'S3 bucket name for Bedrock Knowledge Base documents',
      exportName: `${config.tags.Environment}-KnowledgeBase-BucketName`,
    });

    new cdk.CfnOutput(this, 'KnowledgeBaseBucketArn', {
      value: this.bucket.bucketArn,
      description: 'S3 bucket ARN for Bedrock Knowledge Base',
      exportName: `${config.tags.Environment}-KnowledgeBase-BucketArn`,
    });

    new cdk.CfnOutput(this, 'BedrockKnowledgeBaseRoleArn', {
      value: bedrockKbRole.roleArn,
      description: 'IAM role ARN for Bedrock Knowledge Base (use when creating KB)',
      exportName: `${config.tags.Environment}-BedrockKB-RoleArn`,
    });

    new cdk.CfnOutput(this, 'BedrockAgentRoleArn', {
      value: bedrockAgentRole.roleArn,
      description: 'IAM role ARN for Bedrock Agent (use when creating Agent)',
      exportName: `${config.tags.Environment}-BedrockAgent-RoleArn`,
    });

    // Output instructions for manual Bedrock resource creation
    new cdk.CfnOutput(this, 'NextSteps', {
      value: 'Run scripts in lambda/fraud-detection/scripts/ to create Bedrock Knowledge Base, Agent, and Guardrails',
      description: 'Manual steps required to complete Bedrock setup',
    });
  }
}
