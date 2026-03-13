#!/bin/bash

# MACHER - Deployment Script
# Wrapper script for CDK deployment with validation and error handling

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="${1:-dev}"
REGION="${AWS_REGION:-us-east-1}"
SKIP_TESTS="${SKIP_TESTS:-false}"
AUTO_APPROVE="${AUTO_APPROVE:-false}"

# Display banner
echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║         MACHER Infrastructure Deployment             ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo ""

# Validate environment parameter
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|production)$ ]]; then
    echo -e "${RED}Error: Invalid environment '$ENVIRONMENT'${NC}"
    echo "Valid environments: dev, staging, production"
    echo ""
    echo "Usage: $0 [dev|staging|production]"
    exit 1
fi

# Function to check command exists
check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}Error: $1 is not installed${NC}"
        echo "Please install $1 and try again"
        exit 1
    fi
}

# Validate prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"
check_command "node"
check_command "npm"
check_command "aws"
check_command "cdk"

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}Error: Node.js 20.x or later is required${NC}"
    echo "Current version: $(node -v)"
    exit 1
fi

# Validate AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}Error: AWS credentials not configured${NC}"
    echo "Please configure AWS CLI: aws configure"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${GREEN}✓ AWS Account: $ACCOUNT_ID${NC}"
echo -e "${GREEN}✓ Prerequisites validated${NC}"
echo ""

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "Root dependencies already installed"
fi

# Install Lambda dependencies (required for CDK Code.fromAsset bundling)
echo -e "${YELLOW}Installing Lambda dependencies...${NC}"
(cd lambda/audio-processor && npm install --production)
echo -e "${GREEN}✓ Dependencies ready${NC}"
echo ""

# Run tests (unless skipped)
if [ "$SKIP_TESTS" != "true" ]; then
    echo -e "${YELLOW}Running tests...${NC}"
    
    # Run unit tests
    echo "  Running unit tests..."
    npm run test:unit -- --silent || {
        echo -e "${RED}✗ Unit tests failed${NC}"
        exit 1
    }
    
    # Run property tests
    echo "  Running property tests..."
    npm run test:properties -- --silent || {
        echo -e "${RED}✗ Property tests failed${NC}"
        exit 1
    }
    
    echo -e "${GREEN}✓ All tests passed${NC}"
    echo ""
else
    echo -e "${YELLOW}⚠️  Skipping tests (SKIP_TESTS=true)${NC}"
    echo ""
fi

# Build TypeScript
echo -e "${YELLOW}Building TypeScript...${NC}"
npm run build || {
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
}
echo -e "${GREEN}✓ Build successful${NC}"
echo ""

# Bootstrap CDK (if needed)
echo -e "${YELLOW}Checking CDK bootstrap...${NC}"
if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region "$REGION" &> /dev/null; then
    echo "  Bootstrapping CDK..."
    cdk bootstrap aws://$ACCOUNT_ID/$REGION
    echo -e "${GREEN}✓ CDK bootstrapped${NC}"
else
    echo "  CDK already bootstrapped"
fi
echo ""

# Synthesize CloudFormation template
echo -e "${YELLOW}Synthesizing CloudFormation template...${NC}"
cdk synth -c environment="$ENVIRONMENT" > /dev/null || {
    echo -e "${RED}✗ Synthesis failed${NC}"
    exit 1
}
echo -e "${GREEN}✓ Template synthesized${NC}"
echo ""

# Show diff
echo -e "${YELLOW}Checking for infrastructure changes...${NC}"
if cdk diff -c environment="$ENVIRONMENT" 2>&1 | grep -q "There were no differences"; then
    echo -e "${GREEN}No changes detected${NC}"
    echo ""
    read -p "Continue with deployment anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled"
        exit 0
    fi
else
    echo ""
    cdk diff -c environment="$ENVIRONMENT"
    echo ""
fi

# Confirm deployment for production
if [ "$ENVIRONMENT" = "production" ] && [ "$AUTO_APPROVE" != "true" ]; then
    echo -e "${RED}⚠️  WARNING: You are about to deploy to PRODUCTION${NC}"
    echo ""
    read -p "Are you sure you want to continue? (yes/no) " -r
    echo
    if [[ ! $REPLY = "yes" ]]; then
        echo "Deployment cancelled"
        exit 0
    fi
fi

# Deploy
echo -e "${YELLOW}Deploying infrastructure...${NC}"
echo ""

DEPLOY_ARGS="-c environment=$ENVIRONMENT"
if [ "$AUTO_APPROVE" = "true" ]; then
    DEPLOY_ARGS="$DEPLOY_ARGS --require-approval never"
fi

cdk deploy $DEPLOY_ARGS || {
    echo ""
    echo -e "${RED}✗ Deployment failed${NC}"
    echo ""
    echo "Troubleshooting tips:"
    echo "  • Check CloudFormation console for detailed error messages"
    echo "  • Verify IAM permissions are sufficient"
    echo "  • Check CloudWatch Logs for Lambda errors"
    echo "  • Run 'cdk diff' to see what changes were attempted"
    exit 1
}

echo ""
echo -e "${GREEN}✓ Deployment successful!${NC}"
echo ""

# Display stack outputs
echo -e "${YELLOW}Stack Outputs:${NC}"
aws cloudformation describe-stacks \
    --stack-name "MACHER-$ENVIRONMENT" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
    --output table

echo ""
echo -e "${GREEN}Deployment complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Update Secrets Manager with real API keys:"
echo "     ./scripts/setup-secrets.sh"
echo "  2. Configure Parameter Store values:"
echo "     ./scripts/setup-parameters.sh"
echo "  3. Test WebSocket connectivity:"
    echo "     wscat -c $(aws cloudformation describe-stacks --stack-name MACHER-$ENVIRONMENT --query 'Stacks[0].Outputs[?OutputKey==`WebSocketApiEndpoint`].OutputValue' --output text)"
echo "  4. Monitor the deployment:"
    echo "     aws cloudformation describe-stack-events --stack-name MACHER-$ENVIRONMENT"
echo ""
echo -e "${BLUE}Happy coding! 🚀${NC}"
