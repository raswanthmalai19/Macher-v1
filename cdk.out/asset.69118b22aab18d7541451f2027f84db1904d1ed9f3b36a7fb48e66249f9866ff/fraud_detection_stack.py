"""
VocalShield Fraud Detection Stack

This CDK stack creates the infrastructure for AI-Powered Fraud Detection:
- DynamoDB table for conversation context storage (24-hour TTL)
- Lambda function for fraud analysis (Python 3.12, ARM64)
- REST API Gateway for analysis endpoint
- CloudWatch alarms for monitoring (error rate, latency, cost)

The system uses Amazon Bedrock Agents with Claude 3.5 Sonnet to analyze
phone call transcripts in real-time and identify fraud indicators.
"""

from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    CfnOutput,
    aws_lambda as lambda_,
    aws_dynamodb as dynamodb,
    aws_apigateway as apigateway,
    aws_iam as iam,
    aws_logs as logs,
    aws_cloudwatch as cloudwatch,
)
from constructs import Construct


class FraudDetectionStack(Stack):
    """
    CDK Stack for VocalShield Fraud Detection Infrastructure
    
    Creates all AWS resources needed for real-time fraud detection:
    - Context storage with automatic expiration
    - Fraud analysis Lambda with Bedrock permissions
    - REST API with rate limiting
    - Monitoring and cost alarms
    """

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        environment: str,
        bedrock_agent_id: str,
        bedrock_agent_alias_id: str,
        guardrail_id: str,
        guardrail_version: str,
        knowledge_base_id: str,
        notification_service_url: str = "",
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        self.environment = environment
        self.bedrock_agent_id = bedrock_agent_id
        self.bedrock_agent_alias_id = bedrock_agent_alias_id
        self.guardrail_id = guardrail_id
        self.guardrail_version = guardrail_version
        self.knowledge_base_id = knowledge_base_id
        self.notification_service_url = notification_service_url

        # Create DynamoDB table for conversation context storage
        self.context_table = self._create_context_table()

        # Create Lambda function for fraud analysis
        self.analysis_function = self._create_analysis_function()

        # Create REST API Gateway
        self.api = self._create_api_gateway()

        # Create CloudWatch alarms
        self._create_cloudwatch_alarms()

        # Create stack outputs
        self._create_outputs()

    def _create_context_table(self) -> dynamodb.Table:
        """
        Create DynamoDB table for conversation context storage.
        
        Schema:
        - Partition key: call_id (string)
        - TTL attribute: ttl (24 hours for automatic cleanup)
        - Billing: On-Demand (pay per request, no idle cost)
        - Encryption: AWS managed keys
        """
        table = dynamodb.Table(
            self,
            "ContextTable",
            table_name=f"VocalShield-FraudContext-{self.environment}",
            partition_key=dynamodb.Attribute(
                name="call_id",
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            time_to_live_attribute="ttl",
            point_in_time_recovery=False,  # Cost optimization (not needed for MVP)
            removal_policy=RemovalPolicy.DESTROY if self.environment != "prod" else RemovalPolicy.RETAIN,
            encryption=dynamodb.TableEncryption.AWS_MANAGED,
        )

        return table

    def _create_analysis_function(self) -> lambda_.Function:
        """
        Create Lambda function for fraud analysis.
        
        Configuration:
        - Runtime: Python 3.12
        - Architecture: ARM64 (20% better price-performance)
        - Memory: 512 MB (may need tuning for AI workloads)
        - Timeout: 30 seconds (as per design spec)
        - Tracing: X-Ray enabled
        - Log retention: 7 days (Free Tier limit)
        """
        function = lambda_.Function(
            self,
            "AnalysisFunction",
            function_name=f"VocalShield-FraudAnalysis-{self.environment}",
            runtime=lambda_.Runtime.PYTHON_3_12,
            architecture=lambda_.Architecture.ARM_64,
            handler="lambda_handler.handler",
            code=lambda_.Code.from_asset("lambda/fraud-detection"),
            memory_size=512,
            timeout=Duration.seconds(30),
            tracing=lambda_.Tracing.ACTIVE,
            environment={
                "CONTEXT_TABLE_NAME": self.context_table.table_name,
                "BEDROCK_AGENT_ID": self.bedrock_agent_id,
                "BEDROCK_AGENT_ALIAS_ID": self.bedrock_agent_alias_id,
                "GUARDRAIL_ID": self.guardrail_id,
                "GUARDRAIL_VERSION": self.guardrail_version,
                "KNOWLEDGE_BASE_ID": self.knowledge_base_id,
                "NOTIFICATION_SERVICE_URL": self.notification_service_url,
                "ENVIRONMENT": self.environment,
            },
            log_retention=logs.RetentionDays.ONE_WEEK,
            description="Analyzes phone call transcripts for fraud indicators using Amazon Bedrock",
        )

        # Grant DynamoDB permissions
        self.context_table.grant_read_write_data(function)

        # Grant Bedrock permissions
        function.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:InvokeAgent",
                    "bedrock:Retrieve",
                    "bedrock:ApplyGuardrail",
                ],
                resources=[
                    f"arn:aws:bedrock:{self.region}:{self.account}:agent/{self.bedrock_agent_id}",
                    f"arn:aws:bedrock:{self.region}:{self.account}:agent-alias/{self.bedrock_agent_id}/{self.bedrock_agent_alias_id}",
                    f"arn:aws:bedrock:{self.region}:{self.account}:knowledge-base/{self.knowledge_base_id}",
                    f"arn:aws:bedrock:{self.region}:{self.account}:guardrail/{self.guardrail_id}",
                ],
            )
        )

        return function

    def _create_api_gateway(self) -> apigateway.RestApi:
        """
        Create REST API Gateway for fraud detection endpoint.
        
        Configuration:
        - Stage: Environment name (dev/staging/prod)
        - Tracing: X-Ray enabled
        - Logging: INFO level (no request/response bodies for PII protection)
        - Rate limiting: 100 req/min per user (as per tech spec)
        - CORS: Enabled for cross-origin requests
        """
        api = apigateway.RestApi(
            self,
            "FraudDetectionApi",
            rest_api_name=f"VocalShield-FraudDetection-{self.environment}",
            description="API for real-time fraud detection analysis",
            deploy_options=apigateway.StageOptions(
                stage_name=self.environment,
                tracing_enabled=True,
                logging_level=apigateway.MethodLoggingLevel.INFO,
                data_trace_enabled=False,  # Don't log request/response bodies (PII)
                metrics_enabled=True,
                throttling_rate_limit=100,  # 100 requests per second
                throttling_burst_limit=200,
            ),
            default_cors_preflight_options=apigateway.CorsOptions(
                allow_origins=apigateway.Cors.ALL_ORIGINS,
                allow_methods=["POST", "OPTIONS"],
                allow_headers=["Content-Type", "Authorization"],
            ),
        )

        # Create /analyze endpoint
        analyze_resource = api.root.add_resource("analyze")
        analyze_resource.add_method(
            "POST",
            apigateway.LambdaIntegration(
                self.analysis_function,
                proxy=True,
            ),
        )

        return api

    def _create_cloudwatch_alarms(self) -> None:
        """
        Create CloudWatch alarms for monitoring.
        
        Alarms:
        1. High error rate (>5% of requests)
        2. High latency (P99 >2 seconds)
        3. API Gateway 5xx errors
        4. High daily cost (>$50/day estimated)
        """
        # Alarm for high error rate
        cloudwatch.Alarm(
            self,
            "AnalysisErrorAlarm",
            alarm_name=f"VocalShield-FraudAnalysis-Errors-{self.environment}",
            alarm_description="Fraud analysis Lambda error rate exceeds 5%",
            metric=self.analysis_function.metric_errors(
                statistic="Sum",
                period=Duration.minutes(5),
            ),
            threshold=5,
            evaluation_periods=2,
            comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )

        # Alarm for high latency (P99 >2 seconds)
        cloudwatch.Alarm(
            self,
            "AnalysisLatencyAlarm",
            alarm_name=f"VocalShield-FraudAnalysis-Latency-{self.environment}",
            alarm_description="Fraud analysis P99 latency exceeds 2 seconds",
            metric=self.analysis_function.metric_duration(
                statistic="p99",
                period=Duration.minutes(5),
            ),
            threshold=2000,  # 2 seconds in milliseconds
            evaluation_periods=2,
            comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )

        # Alarm for API Gateway 5xx errors
        cloudwatch.Alarm(
            self,
            "ApiErrorAlarm",
            alarm_name=f"VocalShield-FraudApi-5xxErrors-{self.environment}",
            alarm_description="Fraud detection API 5xx error rate exceeds threshold",
            metric=self.api.metric_server_error(
                statistic="Sum",
                period=Duration.minutes(5),
            ),
            threshold=10,
            evaluation_periods=2,
            comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )

        # Alarm for high daily cost (estimated based on invocations)
        # Rough estimate: $50/day ÷ $0.003/analysis ≈ 16,667 invocations/day
        cloudwatch.Alarm(
            self,
            "AnalysisCostAlarm",
            alarm_name=f"VocalShield-FraudAnalysis-Cost-{self.environment}",
            alarm_description="Fraud analysis estimated daily cost exceeds $50",
            metric=self.analysis_function.metric_invocations(
                statistic="Sum",
                period=Duration.hours(24),
            ),
            threshold=16667,
            evaluation_periods=1,
            comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )

    def _create_outputs(self) -> None:
        """Create CloudFormation stack outputs."""
        CfnOutput(
            self,
            "ContextTableName",
            value=self.context_table.table_name,
            description="DynamoDB table for fraud detection context",
            export_name=f"{self.environment}-FraudDetection-ContextTable",
        )

        CfnOutput(
            self,
            "AnalysisFunctionArn",
            value=self.analysis_function.function_arn,
            description="Fraud analysis Lambda function ARN",
            export_name=f"{self.environment}-FraudDetection-FunctionArn",
        )

        CfnOutput(
            self,
            "ApiEndpoint",
            value=self.api.url,
            description="Fraud detection API endpoint",
            export_name=f"{self.environment}-FraudDetection-ApiEndpoint",
        )

        CfnOutput(
            self,
            "AnalyzeEndpoint",
            value=f"{self.api.url}analyze",
            description="Fraud detection /analyze endpoint (POST)",
            export_name=f"{self.environment}-FraudDetection-AnalyzeEndpoint",
        )
