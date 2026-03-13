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
exports.SnsTopicConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const constructs_1 = require("constructs");
/**
 * Construct for VocalShield SNS Topic (Family Loop Notifications)
 *
 * Creates an SNS topic for delivering fraud detection notifications to family members.
 *
 * Features:
 * - Standard topic (not FIFO) for cost optimization
 * - Display name for clear identification in notifications
 * - IAM policy allowing Audio Processor Lambda to publish
 * - Subscriptions (email, SMS) configured post-deployment via console/CLI
 *
 * Requirements: 9.1, 9.2, 9.4
 */
class SnsTopicConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { config } = props;
        // Create SNS topic for Family Loop notifications (Task 10.1)
        this.familyLoopTopic = new sns.Topic(this, 'FamilyLoopTopic', {
            topicName: `VocalShield-FamilyLoop-${config.tags.Environment}`,
            displayName: 'VocalShield Fraud Alerts',
            fifo: false, // Standard topic for cost optimization
        });
        // Apply tags
        cdk.Tags.of(this.familyLoopTopic).add('Component', 'FamilyLoopNotifications');
        // Note: Email and SMS subscriptions are configured post-deployment via AWS Console or CLI
        // This is intentional as subscriptions require confirmation and are user-specific
    }
    /**
     * Grant publish permissions to a Lambda function
     *
     * @param lambdaFunction The Lambda function to grant permissions to
     */
    grantPublish(lambdaFunction) {
        this.familyLoopTopic.grantPublish(lambdaFunction);
    }
}
exports.SnsTopicConstruct = SnsTopicConstruct;
//# sourceMappingURL=sns-topic.js.map