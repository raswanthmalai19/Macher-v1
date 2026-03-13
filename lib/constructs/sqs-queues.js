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
exports.SqsQueuesConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const sqs = __importStar(require("aws-cdk-lib/aws-sqs"));
const constructs_1 = require("constructs");
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
class SqsQueuesConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
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
exports.SqsQueuesConstruct = SqsQueuesConstruct;
//# sourceMappingURL=sqs-queues.js.map