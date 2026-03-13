#!/bin/bash

# VocalShield - Parameter Store Setup Script
# This script initializes AWS Systems Manager Parameter Store with configuration values

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="${ENVIRONMENT:-dev}"
REGION="${AWS_REGION:-us-east-1}"

echo -e "${GREEN}VocalShield Parameter Store Setup${NC}"
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

echo -e "${YELLOW}Creating Parameter Store parameters...${NC}"

# Function to create or update parameter
create_parameter() {
    local name=$1
    local value=$2
    local description=$3
    
    if aws ssm get-parameter --name "$name" --region "$REGION" &> /dev/null; then
        echo "  Updating parameter: $name"
        aws ssm put-parameter \
            --name "$name" \
            --value "$value" \
            --description "$description" \
            --type String \
            --overwrite \
            --region "$REGION" \
            --tags "Key=Project,Value=VocalShield" "Key=Environment,Value=$ENVIRONMENT" "Key=ManagedBy,Value=Script" \
            > /dev/null
    else
        echo "  Creating parameter: $name"
        aws ssm put-parameter \
            --name "$name" \
            --value "$value" \
            --description "$description" \
            --type String \
            --region "$REGION" \
            --tags "Key=Project,Value=VocalShield" "Key=Environment,Value=$ENVIRONMENT" "Key=ManagedBy,Value=Script" \
            > /dev/null
    fi
}

# Audio Processor Configuration
create_parameter \
    "/macher/$ENVIRONMENT/audio-processor/fraud-threshold" \
    "70" \
    "Fraud detection threshold score (0-100)"

create_parameter \
    "/macher/$ENVIRONMENT/audio-processor/max-processing-time" \
    "3000" \
    "Maximum audio processing time in milliseconds"

# Notification Configuration
create_parameter \
    "/macher/$ENVIRONMENT/notifications/enabled" \
    "true" \
    "Enable/disable fraud detection notifications"

# Feature Flags
create_parameter \
    "/macher/$ENVIRONMENT/features/wavelength-enabled" \
    "false" \
    "Enable/disable Wavelength Zone integration"

create_parameter \
    "/macher/$ENVIRONMENT/features/enhanced-logging" \
    "false" \
    "Enable/disable enhanced debug logging"

# Connection Configuration
create_parameter \
    "/macher/$ENVIRONMENT/websocket/idle-timeout" \
    "600" \
    "WebSocket connection idle timeout in seconds"

create_parameter \
    "/macher/$ENVIRONMENT/websocket/max-connections" \
    "900" \
    "Maximum concurrent WebSocket connections"

# DynamoDB Configuration
create_parameter \
    "/macher/$ENVIRONMENT/dynamodb/connection-ttl" \
    "86400" \
    "Connection record TTL in seconds (24 hours)"

create_parameter \
    "/macher/$ENVIRONMENT/dynamodb/metadata-ttl" \
    "2592000" \
    "Metadata record TTL in seconds (30 days)"

# Monitoring Configuration
create_parameter \
    "/macher/$ENVIRONMENT/monitoring/log-retention-days" \
    "7" \
    "CloudWatch Logs retention period in days"

create_parameter \
    "/macher/$ENVIRONMENT/monitoring/xray-sampling-rate" \
    "0.1" \
    "X-Ray trace sampling rate (0.0-1.0)"

echo ""
echo -e "${GREEN}✓ Parameter Store setup complete!${NC}"
echo ""
echo "Created parameters:"
aws ssm get-parameters-by-path \
    --path "/macher/$ENVIRONMENT" \
    --recursive \
    --region "$REGION" \
    --query 'Parameters[*].[Name,Value]' \
    --output table

echo ""
echo -e "${YELLOW}Note: You can update these parameters at any time using:${NC}"
echo "  aws ssm put-parameter --name <parameter-name> --value <new-value> --overwrite"
