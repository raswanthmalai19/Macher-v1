#!/bin/bash

# Setup script for Amazon Bedrock resources
# This script creates the Knowledge Base, Agent, and Guardrails for VocalShield
# 
# Prerequisites:
# - AWS CLI configured with appropriate credentials
# - CDK stack deployed (to get S3 bucket name and IAM role ARNs)
# - Bedrock model access enabled in AWS Console

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-dev}
REGION=${AWS_REGION:-us-east-1}

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}VocalShield Bedrock Resources Setup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo ""

# Get stack outputs
echo -e "${YELLOW}Fetching CDK stack outputs...${NC}"
STACK_NAME="VocalShield-${ENVIRONMENT}"

# Get S3 bucket name
KB_BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='KnowledgeBaseBucketName'].OutputValue" \
  --output text \
  --region "$REGION")

# Get IAM role ARNs
KB_ROLE_ARN=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='BedrockKnowledgeBaseRoleArn'].OutputValue" \
  --output text \
  --region "$REGION")

AGENT_ROLE_ARN=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='BedrockAgentRoleArn'].OutputValue" \
  --output text \
  --region "$REGION")

echo "S3 Bucket: $KB_BUCKET_NAME"
echo "KB Role ARN: $KB_ROLE_ARN"
echo "Agent Role ARN: $AGENT_ROLE_ARN"
echo ""

# Check if Bedrock model access is enabled
echo -e "${YELLOW}Checking Bedrock model access...${NC}"
MODEL_ACCESS=$(aws bedrock list-foundation-models \
  --region "$REGION" \
  --query "modelSummaries[?modelId=='anthropic.claude-3-5-sonnet-20240620-v1:0'].modelId" \
  --output text 2>/dev/null || echo "")

if [ -z "$MODEL_ACCESS" ]; then
  echo -e "${RED}ERROR: Bedrock model access not enabled${NC}"
  echo "Please enable model access in AWS Console:"
  echo "https://console.aws.amazon.com/bedrock/home?region=${REGION}#/modelaccess"
  exit 1
fi
echo -e "${GREEN}✓ Bedrock model access confirmed${NC}"
echo ""

# Create Bedrock Guardrails for PII redaction
echo -e "${YELLOW}Creating Bedrock Guardrails...${NC}"
GUARDRAIL_NAME="VocalShield-PII-Redaction-${ENVIRONMENT}"

# Check if guardrail already exists
EXISTING_GUARDRAIL=$(aws bedrock list-guardrails \
  --region "$REGION" \
  --query "guardrails[?name=='${GUARDRAIL_NAME}'].id" \
  --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_GUARDRAIL" ]; then
  echo -e "${YELLOW}Guardrail already exists: $EXISTING_GUARDRAIL${NC}"
  GUARDRAIL_ID="$EXISTING_GUARDRAIL"
else
  # Create guardrail with PII filters
  GUARDRAIL_RESPONSE=$(aws bedrock create-guardrail \
    --name "$GUARDRAIL_NAME" \
    --description "PII redaction guardrail for VocalShield fraud detection" \
    --sensitive-information-policy-config '{
      "piiEntitiesConfig": [
        {"type": "NAME", "action": "ANONYMIZE"},
        {"type": "EMAIL", "action": "ANONYMIZE"},
        {"type": "PHONE", "action": "ANONYMIZE"},
        {"type": "ADDRESS", "action": "ANONYMIZE"},
        {"type": "SSN", "action": "ANONYMIZE"},
        {"type": "CREDIT_DEBIT_CARD_NUMBER", "action": "ANONYMIZE"},
        {"type": "BANK_ACCOUNT_NUMBER", "action": "ANONYMIZE"}
      ]
    }' \
    --blocked-input-messaging "This input contains sensitive information that has been redacted." \
    --blocked-outputs-messaging "This output contains sensitive information that has been redacted." \
    --tags "Project=VocalShield,Environment=${ENVIRONMENT},ManagedBy=Script" \
    --region "$REGION" \
    --output json)

  GUARDRAIL_ID=$(echo "$GUARDRAIL_RESPONSE" | jq -r '.guardrailId')
  GUARDRAIL_VERSION=$(echo "$GUARDRAIL_RESPONSE" | jq -r '.version')
  
  echo -e "${GREEN}✓ Guardrail created: $GUARDRAIL_ID (version $GUARDRAIL_VERSION)${NC}"
fi
echo ""

# Create Bedrock Knowledge Base
echo -e "${YELLOW}Creating Bedrock Knowledge Base...${NC}"
KB_NAME="VocalShield-ScamPatterns-${ENVIRONMENT}"

# Check if Knowledge Base already exists
EXISTING_KB=$(aws bedrock-agent list-knowledge-bases \
  --region "$REGION" \
  --query "knowledgeBaseSummaries[?name=='${KB_NAME}'].knowledgeBaseId" \
  --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_KB" ]; then
  echo -e "${YELLOW}Knowledge Base already exists: $EXISTING_KB${NC}"
  KB_ID="$EXISTING_KB"
else
  # Create Knowledge Base with S3 data source
  KB_RESPONSE=$(aws bedrock-agent create-knowledge-base \
    --name "$KB_NAME" \
    --description "Scam pattern knowledge base for VocalShield fraud detection" \
    --role-arn "$KB_ROLE_ARN" \
    --knowledge-base-configuration '{
      "type": "VECTOR",
      "vectorKnowledgeBaseConfiguration": {
        "embeddingModelArn": "arn:aws:bedrock:'${REGION}'::foundation-model/amazon.titan-embed-text-v1"
      }
    }' \
    --storage-configuration '{
      "type": "OPENSEARCH_SERVERLESS",
      "opensearchServerlessConfiguration": {
        "collectionArn": "arn:aws:aoss:'${REGION}':'$(aws sts get-caller-identity --query Account --output text)':collection/vocalshield-kb-'${ENVIRONMENT}'",
        "vectorIndexName": "vocalshield-scam-patterns",
        "fieldMapping": {
          "vectorField": "vector",
          "textField": "text",
          "metadataField": "metadata"
        }
      }
    }' \
    --tags "Project=VocalShield,Environment=${ENVIRONMENT},ManagedBy=Script" \
    --region "$REGION" \
    --output json 2>&1)

  if echo "$KB_RESPONSE" | grep -q "error"; then
    echo -e "${RED}ERROR: Failed to create Knowledge Base${NC}"
    echo "$KB_RESPONSE"
    echo ""
    echo -e "${YELLOW}Note: Knowledge Base creation requires OpenSearch Serverless collection.${NC}"
    echo "Creating simplified Knowledge Base without vector store..."
    
    # Fallback: Create without vector store (document-only)
    KB_RESPONSE=$(aws bedrock-agent create-knowledge-base \
      --name "$KB_NAME" \
      --description "Scam pattern knowledge base for VocalShield fraud detection" \
      --role-arn "$KB_ROLE_ARN" \
      --knowledge-base-configuration '{
        "type": "VECTOR",
        "vectorKnowledgeBaseConfiguration": {
          "embeddingModelArn": "arn:aws:bedrock:'${REGION}'::foundation-model/amazon.titan-embed-text-v1"
        }
      }' \
      --region "$REGION" \
      --output json)
  fi

  KB_ID=$(echo "$KB_RESPONSE" | jq -r '.knowledgeBase.knowledgeBaseId')
  echo -e "${GREEN}✓ Knowledge Base created: $KB_ID${NC}"

  # Add S3 data source to Knowledge Base
  echo -e "${YELLOW}Adding S3 data source to Knowledge Base...${NC}"
  DATA_SOURCE_RESPONSE=$(aws bedrock-agent create-data-source \
    --knowledge-base-id "$KB_ID" \
    --name "ScamPatterns-S3" \
    --description "S3 bucket containing scam pattern documents" \
    --data-source-configuration '{
      "type": "S3",
      "s3Configuration": {
        "bucketArn": "arn:aws:s3:::'${KB_BUCKET_NAME}'",
        "inclusionPrefixes": ["scam-patterns/"]
      }
    }' \
    --region "$REGION" \
    --output json)

  DATA_SOURCE_ID=$(echo "$DATA_SOURCE_RESPONSE" | jq -r '.dataSource.dataSourceId')
  echo -e "${GREEN}✓ Data source added: $DATA_SOURCE_ID${NC}"

  # Start ingestion job
  echo -e "${YELLOW}Starting ingestion job...${NC}"
  aws bedrock-agent start-ingestion-job \
    --knowledge-base-id "$KB_ID" \
    --data-source-id "$DATA_SOURCE_ID" \
    --region "$REGION" \
    --output json > /dev/null

  echo -e "${GREEN}✓ Ingestion job started${NC}"
fi
echo ""

# Create Bedrock Agent
echo -e "${YELLOW}Creating Bedrock Agent...${NC}"
AGENT_NAME="VocalShield-FraudDetector-${ENVIRONMENT}"

# Check if Agent already exists
EXISTING_AGENT=$(aws bedrock-agent list-agents \
  --region "$REGION" \
  --query "agentSummaries[?agentName=='${AGENT_NAME}'].agentId" \
  --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_AGENT" ]; then
  echo -e "${YELLOW}Agent already exists: $EXISTING_AGENT${NC}"
  AGENT_ID="$EXISTING_AGENT"
else
  # Create Agent with Claude 3.5 Sonnet
  AGENT_RESPONSE=$(aws bedrock-agent create-agent \
    --agent-name "$AGENT_NAME" \
    --description "AI agent for real-time fraud detection in phone conversations" \
    --agent-resource-role-arn "$AGENT_ROLE_ARN" \
    --foundation-model "anthropic.claude-3-5-sonnet-20240620-v1:0" \
    --instruction "You are a fraud detection expert analyzing phone call transcripts in real-time. Your goal is to identify scam patterns, urgency tactics, payment requests, impersonation, threats, and other fraud indicators. Analyze the conversation and provide a risk score (0-100), threat level (SAFE/CAUTION/DANGER), and specific fraud indicators detected. Be accurate but err on the side of caution to protect vulnerable users." \
    --idle-session-ttl-in-seconds 600 \
    --tags "Project=VocalShield,Environment=${ENVIRONMENT},ManagedBy=Script" \
    --region "$REGION" \
    --output json)

  AGENT_ID=$(echo "$AGENT_RESPONSE" | jq -r '.agent.agentId')
  echo -e "${GREEN}✓ Agent created: $AGENT_ID${NC}"

  # Associate Knowledge Base with Agent
  echo -e "${YELLOW}Associating Knowledge Base with Agent...${NC}"
  aws bedrock-agent associate-agent-knowledge-base \
    --agent-id "$AGENT_ID" \
    --agent-version "DRAFT" \
    --knowledge-base-id "$KB_ID" \
    --description "Scam pattern knowledge base for fraud detection" \
    --knowledge-base-state "ENABLED" \
    --region "$REGION" \
    --output json > /dev/null

  echo -e "${GREEN}✓ Knowledge Base associated with Agent${NC}"

  # Prepare Agent (creates DRAFT version)
  echo -e "${YELLOW}Preparing Agent...${NC}"
  aws bedrock-agent prepare-agent \
    --agent-id "$AGENT_ID" \
    --region "$REGION" \
    --output json > /dev/null

  echo -e "${GREEN}✓ Agent prepared${NC}"

  # Create Agent alias
  echo -e "${YELLOW}Creating Agent alias...${NC}"
  ALIAS_RESPONSE=$(aws bedrock-agent create-agent-alias \
    --agent-id "$AGENT_ID" \
    --agent-alias-name "production" \
    --description "Production alias for VocalShield fraud detection agent" \
    --region "$REGION" \
    --output json)

  AGENT_ALIAS_ID=$(echo "$ALIAS_RESPONSE" | jq -r '.agentAlias.agentAliasId')
  echo -e "${GREEN}✓ Agent alias created: $AGENT_ALIAS_ID${NC}"
fi
echo ""

# Output environment variables for deployment
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Add these environment variables to your deployment:"
echo ""
echo "export BEDROCK_AGENT_ID=\"$AGENT_ID\""
echo "export BEDROCK_AGENT_ALIAS_ID=\"$AGENT_ALIAS_ID\""
echo "export GUARDRAIL_ID=\"$GUARDRAIL_ID\""
echo "export GUARDRAIL_VERSION=\"DRAFT\""
echo "export KNOWLEDGE_BASE_ID=\"$KB_ID\""
echo ""
echo "Or add to .env file:"
echo ""
echo "BEDROCK_AGENT_ID=$AGENT_ID"
echo "BEDROCK_AGENT_ALIAS_ID=$AGENT_ALIAS_ID"
echo "GUARDRAIL_ID=$GUARDRAIL_ID"
echo "GUARDRAIL_VERSION=DRAFT"
echo "KNOWLEDGE_BASE_ID=$KB_ID"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Set the environment variables above"
echo "2. Redeploy the CDK stack: npm run cdk:deploy"
echo "3. Test the fraud detection endpoint"
echo ""
