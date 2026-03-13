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
exports.SyntheticsCanaryConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const synthetics = __importStar(require("aws-cdk-lib/aws-synthetics"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const constructs_1 = require("constructs");
/**
 * CloudWatch Synthetics Canary Construct
 *
 * Creates a canary that monitors WebSocket API availability by:
 * - Connecting to the WebSocket endpoint
 * - Sending test audio data
 * - Verifying response is received
 *
 * Runs every 5 minutes with CloudWatch alarm on failures
 */
class SyntheticsCanaryConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { config, websocketApiEndpoint } = props;
        // Create S3 bucket for canary artifacts
        this.artifactsBucket = new s3.Bucket(this, 'CanaryArtifactsBucket', {
            bucketName: `vocalshield-canary-artifacts-${config.tags.Environment}-${cdk.Aws.ACCOUNT_ID}`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            lifecycleRules: [
                {
                    expiration: cdk.Duration.days(7), // Keep artifacts for 7 days
                },
            ],
        });
        // Create canary
        this.canary = new synthetics.Canary(this, 'WebSocketHealthCheckCanary', {
            canaryName: `vocalshield-websocket-health-${config.tags.Environment}`,
            runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_6_2,
            test: synthetics.Test.custom({
                code: synthetics.Code.fromAsset('canaries'),
                handler: 'websocket-health-check.handler',
            }),
            schedule: synthetics.Schedule.rate(cdk.Duration.minutes(5)),
            environmentVariables: {
                WEBSOCKET_URL: websocketApiEndpoint,
            },
            artifactsBucketLocation: {
                bucket: this.artifactsBucket,
            },
        });
        // Grant canary permissions to write to S3
        this.artifactsBucket.grantWrite(this.canary);
        // Create CloudWatch alarm for canary failures
        this.canaryAlarm = new cloudwatch.Alarm(this, 'CanaryFailureAlarm', {
            alarmName: `VocalShield-CanaryFailure-${config.tags.Environment}`,
            alarmDescription: 'Alert when WebSocket health check canary fails',
            metric: this.canary.metricSuccessPercent(),
            threshold: 90, // Alert if success rate drops below 90%
            evaluationPeriods: 2,
            comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.BREACHING,
        });
        // Apply tags
        cdk.Tags.of(this.canary).add('Component', 'Synthetics');
        cdk.Tags.of(this.artifactsBucket).add('Component', 'Synthetics');
    }
}
exports.SyntheticsCanaryConstruct = SyntheticsCanaryConstruct;
//# sourceMappingURL=synthetics-canary.js.map