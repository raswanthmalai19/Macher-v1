#!/usr/bin/env python3
"""
CDK App Entry Point for VocalShield Fraud Detection

This CDK app creates the infrastructure for the AI-Powered Fraud Detection feature,
including:
- DynamoDB table for conversation context storage
- Lambda function for fraud analysis
- REST API Gateway for analysis endpoint
- CloudWatch alarms for monitoring

The fraud detection system uses Amazon Bedrock Agents with Claude 3.5 Sonnet
to analyze phone call transcripts in real-time and identify fraud indicators.
"""

import os
from aws_cdk import App, Environment, Tags
from fraud_detection_stack import FraudDetectionStack

# Create CDK app
app = App()

# Get environment from context or default to 'dev'
environment = app.node.try_get_context("environment") or os.environ.get("ENVIRONMENT", "dev")

# Get AWS account and region
account = app.node.try_get_context("accountId") or os.environ.get("CDK_DEFAULT_ACCOUNT")
region = "us-east-1"  # As per task requirement: Configure stack for us-east-1 region

# Get Bedrock resource IDs from environment variables
# These must be created via setup scripts before deploying
bedrock_agent_id = os.environ.get("BEDROCK_AGENT_ID")
bedrock_agent_alias_id = os.environ.get("BEDROCK_AGENT_ALIAS_ID")
guardrail_id = os.environ.get("GUARDRAIL_ID")
guardrail_version = os.environ.get("GUARDRAIL_VERSION")
knowledge_base_id = os.environ.get("KNOWLEDGE_BASE_ID")
notification_service_url = os.environ.get("NOTIFICATION_SERVICE_URL", "")

# Validate required environment variables
if not all([bedrock_agent_id, bedrock_agent_alias_id, guardrail_id, guardrail_version, knowledge_base_id]):
    print("⚠️  WARNING: Bedrock resources not configured!")
    print("   Required environment variables:")
    print("   - BEDROCK_AGENT_ID")
    print("   - BEDROCK_AGENT_ALIAS_ID")
    print("   - GUARDRAIL_ID")
    print("   - GUARDRAIL_VERSION")
    print("   - KNOWLEDGE_BASE_ID")
    print("   Run setup scripts in lambda/fraud-detection/scripts/ to create these resources.")
    exit(1)

# Create the Fraud Detection stack
stack = FraudDetectionStack(
    app,
    f"VocalShield-FraudDetection-{environment}",
    environment=environment,
    bedrock_agent_id=bedrock_agent_id,
    bedrock_agent_alias_id=bedrock_agent_alias_id,
    guardrail_id=guardrail_id,
    guardrail_version=guardrail_version,
    knowledge_base_id=knowledge_base_id,
    notification_service_url=notification_service_url,
    env=Environment(
        account=account,
        region=region
    ),
    description=f"VocalShield AI-Powered Fraud Detection - {environment} environment"
)

# Add stack tags for cost tracking (as per task requirement)
Tags.of(stack).add("Project", "VocalShield")
Tags.of(stack).add("Environment", environment)
Tags.of(stack).add("Feature", "FraudDetection")
Tags.of(stack).add("ManagedBy", "CDK")
Tags.of(stack).add("CostCenter", "VocalShield-AI")

# Synthesize the CloudFormation template
app.synth()
