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
exports.EventBusConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const events = __importStar(require("aws-cdk-lib/aws-events"));
const targets = __importStar(require("aws-cdk-lib/aws-events-targets"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const constructs_1 = require("constructs");
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
class EventBusConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
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
exports.EventBusConstruct = EventBusConstruct;
//# sourceMappingURL=event-bus.js.map