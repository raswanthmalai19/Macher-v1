#!/bin/bash

# Script to retrieve API keys from AWS Secrets Manager after deployment
# Usage: ./scripts/get-api-keys.sh [environment]
# Example: ./scripts/get-api-keys.sh dev

set -e

# Get environment (default: dev)
ENVIRONMENT=${1:-dev}

echo "🔑 Retrieving API keys for environment: $ENVIRONMENT"
echo ""

# Get the secret name from CloudFormation outputs
SECRET_NAME="macher/api-keys"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ Error: AWS CLI is not installed"
    echo "   Install it from: https://aws.amazon.com/cli/"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "❌ Error: jq is not installed"
    echo "   Install it with: brew install jq (macOS) or apt-get install jq (Linux)"
    exit 1
fi

# Retrieve the secret value
echo "📥 Fetching secret from AWS Secrets Manager..."
SECRET_VALUE=$(aws secretsmanager get-secret-value \
    --secret-id "$SECRET_NAME" \
    --query SecretString \
    --output text 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to retrieve secret"
    echo "   Make sure you have deployed the stack and have AWS credentials configured"
    exit 1
fi

# Parse and display the API keys
echo ""
echo "✅ API Keys retrieved successfully:"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Extract WebSocket API Key (auto-generated)
WEBSOCKET_KEY=$(echo "$SECRET_VALUE" | jq -r '.websocketApiKey')
echo "🔐 WebSocket API Key (for mobile app):"
echo "   $WEBSOCKET_KEY"
echo ""

# Extract other keys
ML_SERVICE_KEY=$(echo "$SECRET_VALUE" | jq -r '.mlServiceApiKey')
INTEGRATION_KEY=$(echo "$SECRET_VALUE" | jq -r '.thirdPartyIntegrationKey')

echo "🔐 ML Service API Key:"
echo "   $ML_SERVICE_KEY"
echo ""

echo "🔐 Third Party Integration Key:"
echo "   $INTEGRATION_KEY"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📱 Mobile App Configuration:"
echo "   Add the WebSocket API Key to your Android app configuration"
echo "   File: android/app/src/main/res/values/secrets.xml"
echo ""
echo "💡 Tip: You can also retrieve the WebSocket endpoint URL with:"
echo "   aws cloudformation describe-stacks --stack-name VocalShield-$ENVIRONMENT \\"
echo "     --query 'Stacks[0].Outputs[?OutputKey==\`WebSocketApiEndpoint\`].OutputValue' \\"
echo "     --output text"
echo ""
