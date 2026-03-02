# Deploy AWS Backend Infrastructure

## Prerequisites Check

Before deploying, make sure you have:

1. ✅ **AWS Account** - You need an active AWS account
2. ✅ **AWS CLI** - Install with: `brew install awscli`
3. ✅ **AWS Credentials** - Configure with: `aws configure`
4. ✅ **Node.js** - Already installed (you have npm)
5. ✅ **AWS CDK** - Install with: `npm install -g aws-cdk`

## Quick Deployment Steps

### Step 1: Install AWS CLI (if not installed)

```bash
# Install AWS CLI
brew install awscli

# Verify installation
aws --version
```

### Step 2: Configure AWS Credentials

```bash
aws configure
```

You'll be asked for:
- AWS Access Key ID: (get from AWS Console → IAM → Users → Security Credentials)
- AWS Secret Access Key: (get from AWS Console)
- Default region: `us-east-1` (recommended)
- Default output format: `json`

### Step 3: Install AWS CDK (if not installed)

```bash
npm install -g aws-cdk

# Verify installation
cdk --version
```

### Step 4: Bootstrap CDK (first time only)

```bash
cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1
```

Replace `YOUR_ACCOUNT_ID` with your AWS account ID (12-digit number).

### Step 5: Deploy the Infrastructure

```bash
# From the project root directory
./scripts/deploy.sh dev
```

This will:
- Deploy all AWS resources (API Gateway, Lambda, DynamoDB, etc.)
- Create WebSocket and REST APIs
- Set up monitoring and logging
- Output the API URLs you need

### Step 6: Get the API URLs

After deployment completes, you'll see output like:

```
✅ MACHER-dev

Outputs:
MACHER-dev.WebSocketApiEndpoint = wss://abc123xyz.execute-api.us-east-1.amazonaws.com/production
MACHER-dev.ConnectionsTableName = MACHER-dev-Connections
MACHER-dev.MetadataTableName = MACHER-dev-Metadata
...
```

**Copy the WebSocketApiEndpoint URL!**

## Alternative: Manual Deployment

If the script doesn't work, deploy manually:

```bash
# Install dependencies
npm install

# Synthesize CloudFormation template
cdk synth

# Deploy to AWS
cdk deploy MACHER-dev --require-approval never

# Get outputs
aws cloudformation describe-stacks \
  --stack-name MACHER-dev \
  --query 'Stacks[0].Outputs' \
  --output table
```

## What Gets Deployed

Your AWS infrastructure includes:

- ✅ **API Gateway** (WebSocket + REST)
- ✅ **Lambda Functions** (Connect, Disconnect, Audio Processor)
- ✅ **DynamoDB Tables** (Connections, Metadata)
- ✅ **SNS Topic** (Family Loop notifications)
- ✅ **EventBridge** (Event bus for fraud detection)
- ✅ **CloudWatch** (Monitoring and logging)
- ✅ **X-Ray** (Distributed tracing)
- ✅ **IAM Roles** (Least privilege security)

## Cost Estimate

Everything stays within **AWS Free Tier**:
- Lambda: 1M requests/month free
- DynamoDB: 25 GB storage free
- API Gateway: 1M requests/month free
- CloudWatch: 10 custom metrics free

**Estimated cost: $0/month** (within free tier limits)

## Troubleshooting

### Error: "AWS CLI not found"
```bash
brew install awscli
```

### Error: "Credentials not configured"
```bash
aws configure
```

### Error: "CDK not bootstrapped"
```bash
cdk bootstrap
```

### Error: "Permission denied"
- Check your AWS IAM user has AdministratorAccess or required permissions
- Verify credentials: `aws sts get-caller-identity`

## Next Steps

Once deployed:
1. Copy the WebSocket URL from the outputs
2. Provide it to me
3. I'll update Config.kt with the real URL
4. Set DEMO_MODE = false
5. Rebuild APK
6. Test with real AWS backend!

## Need Help?

If you encounter any issues:
1. Check AWS Console → CloudFormation for deployment status
2. Check AWS Console → CloudWatch Logs for error messages
3. Run: `./scripts/validate-infrastructure.sh` to verify deployment
