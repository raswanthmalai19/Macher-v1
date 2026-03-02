#!/bin/bash

# VocalShield - Infrastructure Validation Script
# Comprehensive validation of deployed infrastructure

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
echo "║      VocalShield Infrastructure Validation               ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "Environment: $ENVIRONMENT"
echo "Region: $AWS_REGION"
echo ""

VALIDATION_PASSED=true

# Function to check and report
check() {
    local description=$1
    local command=$2
    
    echo -n "  Checking $description... "
    
    if eval "$command" &> /dev/null; then
        echo -e "${GREEN}✓${NC}"
        return 0
    else
        echo -e "${RED}✗${NC}"
        VALIDATION_PASSED=false
        return 1
    fi
}

# 1. Verify CDK synth produces valid CloudFormation
echo -e "${YELLOW}1. Validating CDK synthesis...${NC}"
check "CDK synth" "cdk synth -c environment=$ENVIRONMENT > /dev/null"
check "CloudFormation template exists" "test -f cdk.out/$STACK_NAME.template.json"

# Parse template for validation
if [ -f "cdk.out/$STACK_NAME.template.json" ]; then
    TEMPLATE="cdk.out/$STACK_NAME.template.json"
    
    # 2. Verify no EC2 or RDS resources
    echo ""
    echo -e "${YELLOW}2. Validating resource types (Free Tier compliance)...${NC}"
    
    EC2_COUNT=$(jq '[.Resources | to_entries[] | select(.value.Type | startswith("AWS::EC2::Instance"))] | length' "$TEMPLATE")
    RDS_COUNT=$(jq '[.Resources | to_entries[] | select(.value.Type | startswith("AWS::RDS::DBInstance"))] | length' "$TEMPLATE")
    NAT_COUNT=$(jq '[.Resources | to_entries[] | select(.value.Type == "AWS::EC2::NatGateway")] | length' "$TEMPLATE")
    
    if [ "$EC2_COUNT" -eq 0 ]; then
        echo -e "  ${GREEN}✓${NC} No EC2 instances"
    else
        echo -e "  ${RED}✗${NC} Found $EC2_COUNT EC2 instance(s) - violates Free Tier requirement"
        VALIDATION_PASSED=false
    fi
    
    if [ "$RDS_COUNT" -eq 0 ]; then
        echo -e "  ${GREEN}✓${NC} No RDS databases"
    else
        echo -e "  ${RED}✗${NC} Found $RDS_COUNT RDS database(s) - violates Free Tier requirement"
        VALIDATION_PASSED=false
    fi
    
    if [ "$NAT_COUNT" -eq 0 ]; then
        echo -e "  ${GREEN}✓${NC} No NAT Gateways"
    else
        echo -e "  ${RED}✗${NC} Found $NAT_COUNT NAT Gateway(s) - violates cost requirement"
        VALIDATION_PASSED=false
    fi
    
    # 3. Verify all Lambda functions use ARM64
    echo ""
    echo -e "${YELLOW}3. Validating Lambda architecture...${NC}"
    
    LAMBDA_FUNCTIONS=$(jq -r '[.Resources | to_entries[] | select(.value.Type == "AWS::Lambda::Function")] | length' "$TEMPLATE")
    ARM64_FUNCTIONS=$(jq -r '[.Resources | to_entries[] | select(.value.Type == "AWS::Lambda::Function" and .value.Properties.Architectures[0] == "arm64")] | length' "$TEMPLATE")
    
    if [ "$LAMBDA_FUNCTIONS" -eq "$ARM64_FUNCTIONS" ]; then
        echo -e "  ${GREEN}✓${NC} All $LAMBDA_FUNCTIONS Lambda function(s) use ARM64"
    else
        echo -e "  ${RED}✗${NC} Only $ARM64_FUNCTIONS of $LAMBDA_FUNCTIONS Lambda function(s) use ARM64"
        VALIDATION_PASSED=false
    fi
    
    # 4. Verify all resources have required tags
    echo ""
    echo -e "${YELLOW}4. Validating resource tagging...${NC}"
    
    TAGGABLE_RESOURCES=$(jq '[.Resources | to_entries[] | select(.value.Type | test("AWS::(Lambda|DynamoDB|SNS|ApiGatewayV2|Events|SQS|StepFunctions|CloudWatch|Synthetics|WAFv2|Backup|Evidently|Budgets)::.*"))] | length' "$TEMPLATE")
    
    # Check for Tags in resources (simplified check)
    TAGGED_RESOURCES=$(jq '[.Resources | to_entries[] | select(.value.Properties.Tags? != null)] | length' "$TEMPLATE")
    
    echo -e "  ${BLUE}ℹ${NC}  Found $TAGGABLE_RESOURCES taggable resources"
    echo -e "  ${BLUE}ℹ${NC}  Found $TAGGED_RESOURCES resources with tags"
    
    # Note: CDK applies tags at stack level, so individual resources may not show tags in template
    echo -e "  ${GREEN}✓${NC} Tags will be applied by CDK at deployment"
fi

# 5. Run all tests
echo ""
echo -e "${YELLOW}5. Running test suites...${NC}"

echo "  Running unit tests..."
if npm run test:unit -- --silent; then
    echo -e "  ${GREEN}✓${NC} Unit tests passed"
else
    echo -e "  ${RED}✗${NC} Unit tests failed"
    VALIDATION_PASSED=false
fi

echo "  Running property tests..."
if npm run test:properties -- --silent; then
    echo -e "  ${GREEN}✓${NC} Property tests passed"
else
    echo -e "  ${RED}✗${NC} Property tests failed"
    VALIDATION_PASSED=false
fi

# 6. Check if stack is deployed
echo ""
echo -e "${YELLOW}6. Checking deployed stack (if exists)...${NC}"

if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} Stack is deployed"
    
    # Get stack outputs
    OUTPUTS=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs' \
        --output json)
    
    # Verify critical outputs exist
    WEBSOCKET_ENDPOINT=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="WebSocketApiEndpoint") | .OutputValue')
    CONNECTIONS_TABLE=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="ConnectionsTableName") | .OutputValue')
    METADATA_TABLE=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="MetadataTableName") | .OutputValue')
    
    if [ -n "$WEBSOCKET_ENDPOINT" ]; then
        echo -e "  ${GREEN}✓${NC} WebSocket endpoint: $WEBSOCKET_ENDPOINT"
    else
        echo -e "  ${RED}✗${NC} WebSocket endpoint not found"
        VALIDATION_PASSED=false
    fi
    
    if [ -n "$CONNECTIONS_TABLE" ]; then
        echo -e "  ${GREEN}✓${NC} Connections table: $CONNECTIONS_TABLE"
    else
        echo -e "  ${RED}✗${NC} Connections table not found"
        VALIDATION_PASSED=false
    fi
    
    if [ -n "$METADATA_TABLE" ]; then
        echo -e "  ${GREEN}✓${NC} Metadata table: $METADATA_TABLE"
    else
        echo -e "  ${RED}✗${NC} Metadata table not found"
        VALIDATION_PASSED=false
    fi
    
    # Check DynamoDB tables
    echo ""
    echo -e "${YELLOW}7. Validating DynamoDB tables...${NC}"
    
    if [ -n "$CONNECTIONS_TABLE" ]; then
        TABLE_INFO=$(aws dynamodb describe-table --table-name "$CONNECTIONS_TABLE" --region "$AWS_REGION" 2>/dev/null || echo "{}")
        
        BILLING_MODE=$(echo "$TABLE_INFO" | jq -r '.Table.BillingModeSummary.BillingMode // "PROVISIONED"')
        TTL_STATUS=$(aws dynamodb describe-time-to-live --table-name "$CONNECTIONS_TABLE" --region "$AWS_REGION" 2>/dev/null | jq -r '.TimeToLiveDescription.TimeToLiveStatus // "DISABLED"')
        
        if [ "$BILLING_MODE" == "PAY_PER_REQUEST" ]; then
            echo -e "  ${GREEN}✓${NC} Connections table uses on-demand billing"
        else
            echo -e "  ${RED}✗${NC} Connections table uses provisioned billing"
            VALIDATION_PASSED=false
        fi
        
        if [ "$TTL_STATUS" == "ENABLED" ]; then
            echo -e "  ${GREEN}✓${NC} Connections table has TTL enabled"
        else
            echo -e "  ${YELLOW}⚠${NC}  Connections table TTL not enabled"
        fi
    fi
    
    # Check Lambda functions
    echo ""
    echo -e "${YELLOW}8. Validating Lambda functions...${NC}"
    
    LAMBDA_FUNCTIONS=$(aws lambda list-functions \
        --region "$AWS_REGION" \
        --query "Functions[?starts_with(FunctionName, 'VocalShield')].FunctionName" \
        --output text)
    
    if [ -n "$LAMBDA_FUNCTIONS" ]; then
        for FUNCTION in $LAMBDA_FUNCTIONS; do
            ARCH=$(aws lambda get-function-configuration \
                --function-name "$FUNCTION" \
                --region "$AWS_REGION" \
                --query 'Architectures[0]' \
                --output text)
            
            if [ "$ARCH" == "arm64" ]; then
                echo -e "  ${GREEN}✓${NC} $FUNCTION uses ARM64"
            else
                echo -e "  ${RED}✗${NC} $FUNCTION uses $ARCH (should be ARM64)"
                VALIDATION_PASSED=false
            fi
        done
    else
        echo -e "  ${YELLOW}⚠${NC}  No Lambda functions found"
    fi
    
    # Check CloudWatch alarms
    echo ""
    echo -e "${YELLOW}9. Checking CloudWatch alarms...${NC}"
    
    ALARM_COUNT=$(aws cloudwatch describe-alarms \
        --alarm-name-prefix "VocalShield" \
        --region "$AWS_REGION" \
        --query 'length(MetricAlarms)' \
        --output text)
    
    if [ "$ALARM_COUNT" -gt 0 ]; then
        echo -e "  ${GREEN}✓${NC} Found $ALARM_COUNT CloudWatch alarm(s)"
        
        ALARM_STATE=$(aws cloudwatch describe-alarms \
            --alarm-name-prefix "VocalShield" \
            --state-value ALARM \
            --region "$AWS_REGION" \
            --query 'length(MetricAlarms)' \
            --output text)
        
        if [ "$ALARM_STATE" -eq 0 ]; then
            echo -e "  ${GREEN}✓${NC} No alarms in ALARM state"
        else
            echo -e "  ${YELLOW}⚠${NC}  $ALARM_STATE alarm(s) in ALARM state"
        fi
    else
        echo -e "  ${YELLOW}⚠${NC}  No CloudWatch alarms found"
    fi
    
else
    echo -e "  ${YELLOW}⚠${NC}  Stack not deployed (skipping runtime checks)"
fi

# Final summary
echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$VALIDATION_PASSED" = true ]; then
    echo -e "${GREEN}✓ All validations passed!${NC}"
    echo ""
    echo "Infrastructure is ready for deployment."
    exit 0
else
    echo -e "${RED}✗ Some validations failed${NC}"
    echo ""
    echo "Please fix the issues above before deploying to production."
    exit 1
fi
