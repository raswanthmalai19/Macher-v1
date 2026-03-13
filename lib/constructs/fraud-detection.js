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
exports.FraudDetectionConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const constructs_1 = require("constructs");
/**
 * Construct for AI-Powered Fraud Detection
 *
 * Creates infrastructure for real-time fraud detection using Amazon Bedrock:
 * - DynamoDB table for conversation context storage
 * - Lambda function for fraud analysis
 * - REST API Gateway for analysis endpoint
 * - CloudWatch alarms for monitoring
 *
 * The fraud detection system analyzes phone call transcripts in real-time
 * to identify scam patterns, urgency tactics, and financial demands.
 */
class FraudDetectionConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { config, bedrockAgentId, bedrockAgentAliasId, guardrailId, guardrailVersion, knowledgeBaseId, notificationServiceUrl } = props;
        // Create DynamoDB table for conversation context storage
        this.contextTable = new dynamodb.Table(this, 'ContextTable', {
            tableName: `VocalShield-FraudContext-${config.tags.Environment}`,
            partitionKey: {
                name: 'call_id',
                type: dynamodb.AttributeType.STRING,
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            timeToLiveAttribute: 'ttl',
            pointInTimeRecovery: false, // Cost optimization
            removalPolicy: config.tags.Environment === 'prod'
                ? cdk.RemovalPolicy.RETAIN
                : cdk.RemovalPolicy.DESTROY,
            encryption: dynamodb.TableEncryption.AWS_MANAGED,
        });
        // Create Lambda function for fraud analysis
        this.analysisFunction = new lambda.Function(this, 'AnalysisFunction', {
            functionName: `VocalShield-FraudAnalysis-${config.tags.Environment}`,
            runtime: lambda.Runtime.PYTHON_3_12,
            architecture: lambda.Architecture.ARM_64,
            handler: 'lambda_handler.handler',
            code: lambda.Code.fromAsset('lambda/fraud-detection'),
            memorySize: 512, // As per task spec; may need tuning for AI workloads
            timeout: cdk.Duration.seconds(30),
            tracing: lambda.Tracing.ACTIVE,
            environment: {
                CONTEXT_TABLE_NAME: this.contextTable.tableName,
                BEDROCK_AGENT_ID: bedrockAgentId,
                BEDROCK_AGENT_ALIAS_ID: bedrockAgentAliasId,
                GUARDRAIL_ID: guardrailId,
                GUARDRAIL_VERSION: guardrailVersion,
                KNOWLEDGE_BASE_ID: knowledgeBaseId,
                NOTIFICATION_SERVICE_URL: notificationServiceUrl || '',
                ENVIRONMENT: config.tags.Environment,
                AWS_REGION: cdk.Stack.of(this).region,
            },
            logRetention: logs.RetentionDays.ONE_WEEK,
            description: 'Analyzes phone call transcripts for fraud indicators using Amazon Bedrock',
        });
        // Grant DynamoDB permissions
        this.contextTable.grantReadWriteData(this.analysisFunction);
        // Grant Bedrock permissions
        this.analysisFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'bedrock:InvokeAgent',
                'bedrock:Retrieve',
                'bedrock:ApplyGuardrail',
            ],
            resources: [
                `arn:aws:bedrock:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:agent/${bedrockAgentId}`,
                `arn:aws:bedrock:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:agent-alias/${bedrockAgentId}/${bedrockAgentAliasId}`,
                `arn:aws:bedrock:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:knowledge-base/${knowledgeBaseId}`,
                `arn:aws:bedrock:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:guardrail/${guardrailId}`,
            ],
        }));
        // Create REST API Gateway
        this.api = new apigateway.RestApi(this, 'FraudDetectionApi', {
            restApiName: `VocalShield-FraudDetection-${config.tags.Environment}`,
            description: 'API for real-time fraud detection analysis',
            deployOptions: {
                stageName: config.tags.Environment,
                tracingEnabled: true,
                loggingLevel: apigateway.MethodLoggingLevel.INFO,
                dataTraceEnabled: false, // Don't log request/response bodies (PII)
                metricsEnabled: true,
                throttlingRateLimit: 100, // 100 requests per second
                throttlingBurstLimit: 200,
            },
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: ['POST', 'OPTIONS'],
                allowHeaders: ['Content-Type', 'Authorization'],
            },
        });
        // Create /analyze endpoint
        const analyzeResource = this.api.root.addResource('analyze');
        analyzeResource.addMethod('POST', new apigateway.LambdaIntegration(this.analysisFunction, {
            proxy: true,
            integrationResponses: [
                {
                    statusCode: '200',
                },
                {
                    statusCode: '400',
                    selectionPattern: '.*"statusCode":400.*',
                },
                {
                    statusCode: '500',
                    selectionPattern: '.*"statusCode":500.*',
                },
            ],
        }), {
            methodResponses: [
                { statusCode: '200' },
                { statusCode: '400' },
                { statusCode: '500' },
            ],
        });
        // Create CloudWatch alarms for monitoring
        // Alarm for high error rate
        const errorAlarm = new cloudwatch.Alarm(this, 'AnalysisErrorAlarm', {
            alarmName: `VocalShield-FraudAnalysis-Errors-${config.tags.Environment}`,
            alarmDescription: 'Fraud analysis Lambda error rate exceeds 5%',
            metric: this.analysisFunction.metricErrors({
                statistic: 'Sum',
                period: cdk.Duration.minutes(5),
            }),
            threshold: 5,
            evaluationPeriods: 2,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // Alarm for high latency
        const latencyAlarm = new cloudwatch.Alarm(this, 'AnalysisLatencyAlarm', {
            alarmName: `VocalShield-FraudAnalysis-Latency-${config.tags.Environment}`,
            alarmDescription: 'Fraud analysis P99 latency exceeds 2 seconds',
            metric: this.analysisFunction.metricDuration({
                statistic: 'p99',
                period: cdk.Duration.minutes(5),
            }),
            threshold: 2000, // 2 seconds in milliseconds
            evaluationPeriods: 2,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // Alarm for API Gateway 5xx errors
        const apiErrorAlarm = new cloudwatch.Alarm(this, 'ApiErrorAlarm', {
            alarmName: `VocalShield-FraudApi-5xxErrors-${config.tags.Environment}`,
            alarmDescription: 'Fraud detection API 5xx error rate exceeds threshold',
            metric: this.api.metricServerError({
                statistic: 'Sum',
                period: cdk.Duration.minutes(5),
            }),
            threshold: 10,
            evaluationPeriods: 2,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // Alarm for high daily cost (estimated based on invocations)
        // Note: This is an approximation. For accurate cost tracking, use AWS Cost Explorer
        const costAlarm = new cloudwatch.Alarm(this, 'AnalysisCostAlarm', {
            alarmName: `VocalShield-FraudAnalysis-Cost-${config.tags.Environment}`,
            alarmDescription: 'Fraud analysis estimated daily cost exceeds $50',
            metric: this.analysisFunction.metricInvocations({
                statistic: 'Sum',
                period: cdk.Duration.hours(24),
            }),
            // Rough estimate: $50/day ÷ $0.003/analysis ≈ 16,667 invocations/day
            threshold: 16667,
            evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // Add tags
        cdk.Tags.of(this.contextTable).add('Component', 'FraudDetection');
        cdk.Tags.of(this.analysisFunction).add('Component', 'FraudDetection');
        cdk.Tags.of(this.api).add('Component', 'FraudDetection');
        // Stack outputs
        new cdk.CfnOutput(this, 'ContextTableName', {
            value: this.contextTable.tableName,
            description: 'DynamoDB table for fraud detection context',
            exportName: `${config.tags.Environment}-FraudDetection-ContextTable`,
        });
        new cdk.CfnOutput(this, 'AnalysisFunctionArn', {
            value: this.analysisFunction.functionArn,
            description: 'Fraud analysis Lambda function ARN',
            exportName: `${config.tags.Environment}-FraudDetection-FunctionArn`,
        });
        new cdk.CfnOutput(this, 'ApiEndpoint', {
            value: this.api.url,
            description: 'Fraud detection API endpoint',
            exportName: `${config.tags.Environment}-FraudDetection-ApiEndpoint`,
        });
        new cdk.CfnOutput(this, 'AnalyzeEndpoint', {
            value: `${this.api.url}analyze`,
            description: 'Fraud detection /analyze endpoint',
            exportName: `${config.tags.Environment}-FraudDetection-AnalyzeEndpoint`,
        });
    }
}
exports.FraudDetectionConstruct = FraudDetectionConstruct;
//# sourceMappingURL=fraud-detection.js.map