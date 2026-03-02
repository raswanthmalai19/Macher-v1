#!/bin/bash

# VocalShield - Secrets Manager Setup Script
# This script initializes AWS Secrets Manager with placeholder secrets

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="${ENVIRONMENT:-dev}"
REGION="${AWS_REGION:-us-east-1}"

echo -e "${GREEN}VocalShield Secrets Manager Setup${NC}"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo ""

# Validate AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    echo "Please install AWS CLI: https://aws.amazon.com/cli/"
    exit 1
fi

# Validate AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}Error: AWS credentials not configured${NC}"
    echo "Please configure AWS CLI: aws configure"
    exit 1
fi

echo -e "${YELLOW}Creating Secrets Manager secrets...${NC}"

# Function to create or update secret
create_secret() {
    local name=$1
    local value=$2
    local description=$3
    
    if aws secretsmanager describe-secret --secret-id "$name" --region "$REGION" &> /dev/null; then
        echo "  Updating secret: $name"
        aws secretsmanager put-secret-value \
            --secret-id "$name" \
            --secret-string "$value" \
            --region "$REGION" \
            > /dev/null
    else
        echo "  Creating secret: $name"
        aws secretsmanager create-secret \
            --name "$name" \
            --description "$description" \
            --secret-string "$value" \
            --region "$REGION" \
            --tags "Key=Project,Value=VocalShield" "Key=Environment,Value=$ENVIRONMENT" "Key=ManagedBy,Value=Script" \
            > /dev/null
    fi
}

# API Keys Secret
API_KEYS_JSON=$(cat <<EOF
{
  "mlServiceApiKey": "PLACEHOLDER_ML_API_KEY",
  "thirdPartyIntegrationKey": "PLACEHOLDER_INTEGRATION_KEY",
  "bedrockApiKey": "PLACEHOLDER_BEDROCK_KEY"
}
EOF
)

create_secret \
    "vocalshield/$ENVIRONMENT/api-keys" \
    "$API_KEYS_JSON" \
    "API keys for external services (ML, integrations, Bedrock)"

# Configuration Secret
CONFIG_JSON=$(cat <<EOF
{
  "fraudThreshold": 70,
  "processingTimeout": 3000,
  "notificationEmail": "alerts@vocalshield.example.com",
  "slackWebhookUrl": "PLACEHOLDER_SLACK_WEBHOOK"
}
EOF
)

create_secret \
    "vocalshield/$ENVIRONMENT/config" \
    "$CONFIG_JSON" \
    "Sensitive configuration values"

# Database Credentials (for future use)
DB_CREDENTIALS_JSON=$(cat <<EOF
{
  "username": "vocalshield_app",
  "password": "PLACEHOLDER_DB_PASSWORD",
  "engine": "dynamodb",
  "host": "dynamodb.$REGION.amazonaws.com"
}
EOF
)

create_secret \
    "vocalshield/$ENVIRONMENT/database" \
    "$DB_CREDENTIALS_JSON" \
    "Database connection credentials"

echo ""
echo -e "${GREEN}✓ Secrets Manager setup complete!${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Update placeholder values with real credentials${NC}"
echo ""
echo "To update a secret:"
echo "  aws secretsmanager put-secret-value \\"
echo "    --secret-id vocalshield/$ENVIRONMENT/api-keys \\"
echo "    --secret-string '{\"mlServiceApiKey\":\"YOUR_REAL_KEY\"}'"
echo ""
echo "To retrieve a secret:"
echo "  aws secretsmanager get-secret-value \\"
echo "    --secret-id vocalshield/$ENVIRONMENT/api-keys \\"
echo "    --query SecretString \\"
echo "    --output text | jq ."
echo ""
echo "Created secrets:"
aws secretsmanager list-secrets \
    --region "$REGION" \
    --filters "Key=name,Values=vocalshield/$ENVIRONMENT" \
    --query 'SecretList[*].[Name,Description]' \
    --output table

echo ""
echo -e "${RED}Security Reminder:${NC}"
echo "  • Never commit real secrets to version control"
echo "  • Rotate secrets regularly (every 90 days)"
echo "  • Use IAM policies to restrict secret access"
echo "  • Enable CloudTrail logging for secret access auditing"
