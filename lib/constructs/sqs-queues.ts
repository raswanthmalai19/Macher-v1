import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface SqsQueuesConstructProps {
  config: EnvironmentConfig;
}

/**
 * Construct for VocalShield SQS Queues
 * 
 * Creates SQS queues for:
 * - Audio processing queue: Receives audio data from WebSocket API for async processing
 * - Dead-letter queue: Captures failed messages for investigation
 * 
 * Configuration:
 * - Visibility timeout: 30 seconds (matches Lambda timeout)
 * - Message retention: 4 days
 * - DLQ max receive count: 3 attempts
 * 
 * This enables decoupling of WebSocket API from Lambda processing,
 * providing buffering and rate limiting capabilities.
 */
export class SqsQueuesConstruct extends Construct {
  public readonly audioQueue: sqs.Queue;
  public readonly audioQueueDLQ: sqs.Queue;

  constructor(scope: Construct, id: string, props: SqsQueuesConstructProps) {
    super(scope, id);

    const { config } = props;

    // Create dead-letter queue for failed audio processing
    this.audioQueueDLQ = new sqs.Queue(this, 'AudioQueueDLQ', {
      queueName: `VocalShield-AudioQueue-DLQ-${config.tags.Environment}`,
      retentionPeriod: cdk.Duration.days(14), // Keep failed messages for 14 days
    });

    // Create audio processing queue
    this.audioQueue = new sqs.Queue(this, 'AudioQueue', {
      queueName: `VocalShield-AudioQueue-${config.tags.Environment}`,
      visibilityTimeout: cdk.Duration.seconds(30), // Match Lambda timeout
      retentionPeriod: cdk.Duration.days(4), // Keep messages for 4 days
      deadLetterQueue: {
        queue: this.audioQueueDLQ,
        maxReceiveCount: 3, // Move to DLQ after 3 failed attempts
      },
    });

    // Apply tags
    cdk.Tags.of(this.audioQueue).add('Component', 'AudioQueue');
    cdk.Tags.of(this.audioQueueDLQ).add('Component', 'AudioQueueDLQ');

    // Output queue URLs
    new cdk.CfnOutput(this, 'AudioQueueUrl', {
      value: this.audioQueue.queueUrl,
      description: 'Audio processing queue URL',
      exportName: `VocalShield-AudioQueueUrl-${config.tags.Environment}`,
    });

    new cdk.CfnOutput(this, 'AudioQueueArn', {
      value: this.audioQueue.queueArn,
      description: 'Audio processing queue ARN',
      exportName: `VocalShield-AudioQueueArn-${config.tags.Environment}`,
    });
  }
}
