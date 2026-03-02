#!/bin/bash

# VocalShield - Integration Test Runner
# Runs integration tests against deployed infrastructure

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
ENVIRONMENT="${1:-dev}"
AWS_REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="VocalShield-$ENVIRONMENT"

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║         VocalShield Integration Test Runner              ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "Environment: $ENVIRONMENT"
echo "Region: $AWS_REGION"
echo "Stack: $STACK_NAME"
echo ""

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|production)$ ]]; then
    echo -e "${RED}Error: Invalid environment '$ENVIRONMENT'${NC}"
    echo "Valid environments: dev, staging, production"
    echo ""
    echo "Usage: $0 [dev|staging|production]"
    exit 1
fi

# Check if stack exists
echo -e "${YELLOW}Checking if stack is deployed...${NC}"
if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" &> /dev/null; then
    echo -e "${RED}Error: Stack '$STACK_NAME' not found${NC}"
    echo ""
    echo "Please deploy the stack first:"
    echo "  ./scripts/deploy.sh $ENVIRONMENT"
    exit 1
fi

echo -e "${GREEN}✓ Stack found${NC}"
echo ""

# Check stack status
STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].StackStatus' \
    --output text)

if [[ "$STACK_STATUS" != "CREATE_COMPLETE" && "$STACK_STATUS" != "UPDATE_COMPLETE" ]]; then
    echo -e "${RED}Error: Stack is in state '$STACK_STATUS'${NC}"
    echo "Stack must be in CREATE_COMPLETE or UPDATE_COMPLETE state"
    exit 1
fi

echo -e "${GREEN}✓ Stack status: $STACK_STATUS${NC}"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
    echo ""
fi

# Build TypeScript
echo -e "${YELLOW}Building TypeScript...${NC}"
npm run build
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

# Set environment variables for tests
export TEST_ENVIRONMENT="$ENVIRONMENT"
export AWS_REGION="$AWS_REGION"

# Run integration tests
echo -e "${YELLOW}Running integration tests...${NC}"
echo ""

# Run tests with detailed output
npm run test:integration -- --verbose --detectOpenHandles || {
    echo ""
    echo -e "${RED}✗ Integration tests failed${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  • Check CloudWatch Logs for Lambda errors"
    echo "  • Verify WebSocket endpoint is accessible"
    echo "  • Ensure DynamoDB tables are created"
    echo "  • Check IAM permissions"
    echo ""
    echo "View logs:"
    echo "  aws logs tail /aws/lambda/VocalShield-AudioProcessor --follow"
    echo ""
    exit 1
}

echo ""
echo -e "${GREEN}✓ All integration tests passed!${NC}"
echo ""

# Display test summary
echo -e "${BLUE}Test Summary:${NC}"
echo "  Environment: $ENVIRONMENT"
echo "  Region: $AWS_REGION"
echo "  Stack: $STACK_NAME"
echo ""

# Check for any CloudWatch alarms
echo -e "${YELLOW}Checking CloudWatch alarms...${NC}"
ALARM_COUNT=$(aws cloudwatch describe-alarms \
    --alarm-name-prefix "VocalShield" \
    --state-value ALARM \
    --region "$AWS_REGION" \
    --query 'length(MetricAlarms)' \
    --output text)

if [ "$ALARM_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Warning: $ALARM_COUNT alarm(s) in ALARM state${NC}"
    aws cloudwatch describe-alarms \
        --alarm-name-prefix "VocalShield" \
        --state-value ALARM \
        --region "$AWS_REGION" \
        --query 'MetricAlarms[*].[AlarmName,StateReason]' \
        --output table
else
    echo -e "${GREEN}✓ No alarms in ALARM state${NC}"
fi

echo ""
echo -e "${GREEN}Integration testing complete!${NC}"
echo ""
echo "Next steps:"
echo "  • Review CloudWatch Dashboard for metrics"
echo "  • Check CloudWatch Logs for any warnings"
echo "  • Monitor costs in AWS Cost Explorer"
echo ""
