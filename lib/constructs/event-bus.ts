import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface EventBusConstructProps {
  config: EnvironmentConfig;
  familyLoopTopic: sns.Topic;
}

/**
 * EventBridge Custom Event Bus Construct
 * 
 * Creates a custom event bus for VocalShield events with rules for:
 * - Fraud detection events (fraudScore >= 70)
 * - Processing completion events
 * - Connection lifecycle events
 * 
 * Targets:
 * - SNS topic for fraud alerts
 * - CloudWatch Logs for all events
 */
export class EventBusConstruct extends Construct {
  public readonly eventBus: events.EventBus;
  public readonly fraudDetectionRule: events.Rule;
  public readonly processingCompleteRule: events.Rule;
  public readonly connectionEventsRule: events.Rule;
  public readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: EventBusConstructProps) {
    super(scope, id);

    const { config, familyLoopTopic } = props;

    // Create custom event bus
    this.eventBus = new events.EventBus(this, 'VocalShieldEventBus', {
      eventBusName: `VocalShield-Events-${config.tags.Environment}`,
    });

    // Create CloudWatch Log Group for all events
    this.logGroup = new logs.LogGroup(this, 'EventBusLogGroup', {
      logGroupName: `/aws/events/vocalshield-${config.tags.Environment}`,
      retention: logs.RetentionDays.ONE_WEEK, // Free Tier: 5 GB storage
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Rule 1: Fraud Detection (fraudScore >= 70)
    this.fraudDetectionRule = new events.Rule(this, 'FraudDetectionRule', {
      eventBus: this.eventBus,
      ruleName: `VocalShield-FraudDetection-${config.tags.Environment}`,
      description: 'Trigger notifications when fraud is detected (score >= 70)',
      eventPattern: {
        source: ['vocalshield.audio-processor'],
        detailType: ['Fraud Detected'],
        detail: {
          fraudScore: [{ numeric: ['>=', 70] }],
        },
      },
    });

    // Add SNS topic as target for fraud detection
    this.fraudDetectionRule.addTarget(new targets.SnsTopic(familyLoopTopic, {
      message: events.RuleTargetInput.fromEventPath('$.detail'),
    }));

    // Add CloudWatch Logs as target for fraud detection
    this.fraudDetectionRule.addTarget(new targets.CloudWatchLogGroup(this.logGroup));

    // Rule 2: Processing Complete
    this.processingCompleteRule = new events.Rule(this, 'ProcessingCompleteRule', {
      eventBus: this.eventBus,
      ruleName: `VocalShield-ProcessingComplete-${config.tags.Environment}`,
      description: 'Log all audio processing completion events',
      eventPattern: {
        source: ['vocalshield.audio-processor'],
        detailType: ['Processing Complete'],
      },
    });

    // Add CloudWatch Logs as target
    this.processingCompleteRule.addTarget(new targets.CloudWatchLogGroup(this.logGroup));

    // Rule 3: Connection Events
    this.connectionEventsRule = new events.Rule(this, 'ConnectionEventsRule', {
      eventBus: this.eventBus,
      ruleName: `VocalShield-ConnectionEvents-${config.tags.Environment}`,
      description: 'Log all WebSocket connection lifecycle events',
      eventPattern: {
        source: ['vocalshield.websocket'],
        detailType: ['Connection Established', 'Connection Closed'],
      },
    });

    // Add CloudWatch Logs as target
    this.connectionEventsRule.addTarget(new targets.CloudWatchLogGroup(this.logGroup));

    // Apply tags
    cdk.Tags.of(this.eventBus).add('Component', 'EventBridge');
    cdk.Tags.of(this.logGroup).add('Component', 'EventBridge');
  }
}
