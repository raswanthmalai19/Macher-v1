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
exports.LambdaFunctionsConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const constructs_1 = require("constructs");
/**
 * Construct for VocalShield Lambda functions
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
class LambdaFunctionsConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { config, connectionsTableName, connectionsTableArn, metadataTableName, metadataTableArn } = props;
        // Create Connect Handler Lambda (Task 5.1)
        this.connectHandler = new lambda.Function(this, 'ConnectHandler', {
            functionName: `VocalShield-ConnectHandler-${config.tags.Environment}`,
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
            },
            logRetention: logs.RetentionDays.ONE_WEEK,
            description: 'Handles WebSocket $connect route - validates and stores connection metadata',
        });
        // Grant DynamoDB PutItem permission on Connections Table only
        this.connectHandler.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:PutItem'],
            resources: [connectionsTableArn],
        }));
        // Create Disconnect Handler Lambda (Task 5.2)
        this.disconnectHandler = new lambda.Function(this, 'DisconnectHandler', {
            functionName: `VocalShield-DisconnectHandler-${config.tags.Environment}`,
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
            },
            logRetention: logs.RetentionDays.ONE_WEEK,
            description: 'Handles WebSocket $disconnect route - updates connection status to disconnected',
        });
        // Grant DynamoDB UpdateItem permission on Connections Table only
        this.disconnectHandler.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:UpdateItem'],
            resources: [connectionsTableArn],
        }));
        // Create Audio Processor Lambda (Task 5.3)
        this.audioProcessor = new lambda.Function(this, 'AudioProcessor', {
            functionName: `VocalShield-AudioProcessor-${config.tags.Environment}`,
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
                // SNS_TOPIC_ARN and EVENT_BUS_NAME will be added when those resources are created (Task 9, 10)
            },
            logRetention: logs.RetentionDays.ONE_WEEK,
            description: 'Processes audio data, detects fraud, stores metadata, and publishes events',
        });
        // Grant DynamoDB permissions for Audio Processor
        this.audioProcessor.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:PutItem', 'dynamodb:Query'],
            resources: [
                metadataTableArn,
                `${metadataTableArn}/index/*`, // GSI access
            ],
        }));
        // Grant Secrets Manager permissions for Audio Processor
        // Restrict access to vocalshield/* secrets only
        this.audioProcessor.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['secretsmanager:GetSecretValue'],
            resources: [
                `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:vocalshield/*`,
            ],
        }));
        // Grant Parameter Store permissions for Audio Processor
        // Restrict access to /vocalshield/* parameters only
        this.audioProcessor.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ssm:GetParameter'],
            resources: [
                `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:parameter/vocalshield/*`,
            ],
        }));
        // SNS and EventBridge permissions will be added when those resources are created (Task 9, 10)
        // Create Investigation Handler Lambda (Task 9.4)
        this.investigationHandler = new lambda.Function(this, 'InvestigationHandler', {
            functionName: `VocalShield-InvestigationHandler-${config.tags.Environment}`,
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
        // Apply tags to all Lambda functions
        cdk.Tags.of(this.connectHandler).add('Component', 'ConnectHandler');
        cdk.Tags.of(this.disconnectHandler).add('Component', 'DisconnectHandler');
        cdk.Tags.of(this.audioProcessor).add('Component', 'AudioProcessor');
        cdk.Tags.of(this.investigationHandler).add('Component', 'InvestigationHandler');
    }
}
exports.LambdaFunctionsConstruct = LambdaFunctionsConstruct;
//# sourceMappingURL=lambda-functions.js.map