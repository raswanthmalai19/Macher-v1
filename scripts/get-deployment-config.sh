#!/bin/bash

# Script to retrieve all deployment configuration from CloudFormation outputs
# Usage: ./scripts/get-deployment-config.sh [environment]
# Example: ./scripts/get-deployment-config.sh dev

set -e

# Get environment (default: dev)
ENVIRONMENT=${1:-dev}
STACK_NAME="VocalShield-$ENVIRONMENT"

echo "📋 Retrieving deployment configuration for: $ENVIRONMENT"
echo "   Stack: $STACK_NAME"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ Error: AWS CLI is not installed"
    echo "   Install it from: https://aws.amazon.com/cli/"
    exit 1
fi

# Check if stack exists
aws cloudformation describe-stacks --stack-name "$STACK_NAME" &> /dev/null
if [ $? -ne 0 ]; then
    echo "❌ Error: Stack '$STACK_NAME' not found"
    echo "   Make sure you have deployed the stack first with: npm run deploy"
    exit 1
fi

# Function to get output value
get_output() {
    local output_key=$1
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --query "Stacks[0].Outputs[?OutputKey=='$output_key'].OutputValue" \
        --output text 2>/dev/null || echo "N/A"
}

echo "✅ Stack found. Retrieving outputs..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 WebSocket API Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
WEBSOCKET_ENDPOINT=$(get_output "WebSocketApiEndpoint")
WEBSOCKET_API_ID=$(get_output "WebSocketApiId")
echo "   Endpoint: $WEBSOCKET_ENDPOINT"
echo "   API ID:   $WEBSOCKET_API_ID"
echo ""

echo "🔐 API Keys & Secrets"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
API_KEYS_SECRET_ARN=$(get_output "ApiKeysSecretArn")
API_KEYS_SECRET_NAME=$(get_output "ApiKeysSecretName")
echo "   Secret ARN:  $API_KEYS_SECRET_ARN"
echo "   Secret Name: $API_KEYS_SECRET_NAME"
echo ""
echo "   💡 Retrieve API keys with: ./scripts/get-api-keys.sh $ENVIRONMENT"
echo ""

echo "🗄️  DynamoDB Tables"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
CONNECTIONS_TABLE=$(get_output "ConnectionsTableName")
METADATA_TABLE=$(get_output "MetadataTableName")
echo "   Connections: $CONNECTIONS_TABLE"
echo "   Metadata:    $METADATA_TABLE"
echo ""

echo "📢 SNS & SQS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
FAMILY_LOOP_TOPIC=$(get_output "FamilyLoopTopicArn")
AUDIO_QUEUE=$(get_output "AudioQueueUrl")
echo "   Family Loop Topic: $FAMILY_LOOP_TOPIC"
echo "   Audio Queue:       $AUDIO_QUEUE"
echo ""

echo "⚡ Lambda Functions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
CONNECT_HANDLER=$(get_output "ConnectHandlerArn")
DISCONNECT_HANDLER=$(get_output "DisconnectHandlerArn")
AUDIO_PROCESSOR=$(get_output "AudioProcessorArn")
echo "   Connect Handler:    $CONNECT_HANDLER"
echo "   Disconnect Handler: $DISCONNECT_HANDLER"
echo "   Audio Processor:    $AUDIO_PROCESSOR"
echo ""

echo "📊 Monitoring"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
DASHBOARD_URL=$(get_output "DashboardUrl")
echo "   Dashboard: $DASHBOARD_URL"
echo ""

echo "🌍 Deployment Information"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
REGION=$(get_output "Region")
ENV=$(get_output "Environment")
STACK=$(get_output "StackName")
echo "   Region:      $REGION"
echo "   Environment: $ENV"
echo "   Stack Name:  $STACK"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📱 Next Steps for Mobile App Integration:"
echo ""
echo "1. Retrieve API keys:"
echo "   ./scripts/get-api-keys.sh $ENVIRONMENT"
echo ""
echo "2. Update Android app configuration:"
echo "   File: android/app/src/main/res/values/config.xml"
echo "   Add:"
echo "   <string name=\"websocket_endpoint\">$WEBSOCKET_ENDPOINT</string>"
echo ""
echo "3. Add API key to secrets.xml (create if doesn't exist):"
echo "   File: android/app/src/main/res/values/secrets.xml"
echo "   Add:"
echo "   <string name=\"websocket_api_key\">YOUR_API_KEY_HERE</string>"
echo ""
echo "4. Test WebSocket connection:"
echo "   wscat -c \"$WEBSOCKET_ENDPOINT\" -H \"x-api-key: YOUR_API_KEY_HERE\""
echo ""
