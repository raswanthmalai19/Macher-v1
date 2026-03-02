# VocalShield Infrastructure - Quick Start Guide

**Get your infrastructure deployed in 5 minutes!**

## Prerequisites

Ensure you have:
- ✅ AWS Account
- ✅ AWS CLI configured (`aws configure`)
- ✅ Node.js 20.x (`node -v`)
- ✅ AWS CDK installed (`npm install -g aws-cdk`)

## Quick Deploy

### 1. Install Dependencies

```bash
npm install
```

### 2. Bootstrap CDK (First Time Only)

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
cdk bootstrap aws://$ACCOUNT_ID/us-east-1
```

### 3. Deploy Infrastructure

```bash
./scripts/deploy.sh dev
```

This will:
- ✅ Validate prerequisites
- ✅ Run tests
- ✅ Build TypeScript
- ✅ Deploy to AWS
- ✅ Display stack outputs

### 4. Initialize Configuration

```bash
./scripts/setup-parameters.sh
./scripts/setup-secrets.sh
```

### 5. Update Secrets (Important!)

```bash
# Update API keys
aws secretsmanager put-secret-value \
  --secret-id vocalshield/dev/api-keys \
  --secret-string '{"mlServiceApiKey":"YOUR_REAL_KEY"}'
```

## Verify Deployment

```bash
# Run validation
./scripts/validate-infrastructure.sh dev

# Run integration tests
./scripts/run-integration-tests.sh dev
```

## Get Stack Outputs

```bash
aws cloudformation describe-stacks \
  --stack-name VocalShield-dev \
  --query 'Stacks[0].Outputs'
```

## Monitor Your Infrastructure

### CloudWatch Dashboard

```bash
# Get dashboard URL from outputs
aws cloudformation describe-stacks \
  --stack-name VocalShield-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' \
  --output text
```

### View Logs

```bash
# Audio Processor logs
aws logs tail /aws/lambda/VocalShield-AudioProcessor --follow

# Connect Handler logs
aws logs tail /aws/lambda/VocalShield-ConnectHandler --follow
```

### Check Alarms

```bash
aws cloudwatch describe-alarms --alarm-name-prefix VocalShield
```

## Test WebSocket Connection

```bash
# Install wscat if needed
npm install -g wscat

# Get WebSocket endpoint
WS_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name VocalShield-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`WebSocketApiEndpoint`].OutputValue' \
  --output text)

# Connect
wscat -c $WS_ENDPOINT
```

## Common Commands

### Deploy to Different Environments

```bash
./scripts/deploy.sh dev        # Development
./scripts/deploy.sh staging    # Staging
./scripts/deploy.sh production # Production
```

### View Costs

```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date -u +%Y-%m-01),End=$(date -u +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost
```

### Rollback Deployment

```bash
aws cloudformation rollback-stack --stack-name VocalShield-dev
```

### Destroy Infrastructure

```bash
cdk destroy -c environment=dev
```

⚠️ **Warning**: This deletes all resources including data!

## Troubleshooting

### Deployment Failed?

```bash
# Check CloudFormation events
aws cloudformation describe-stack-events \
  --stack-name VocalShield-dev \
  --max-items 20

# Check Lambda logs
aws logs tail /aws/lambda/VocalShield-AudioProcessor --since 1h
```

### WebSocket Connection Issues?

```bash
# Check API Gateway
aws apigatewayv2 get-apis --query 'Items[?Name==`VocalShield-WebSocket`]'

# Check Lambda permissions
aws lambda get-policy --function-name VocalShield-AudioProcessor
```

### High Costs?

```bash
# Check billing alarm
aws cloudwatch describe-alarms --alarm-names VocalShield-BillingAlarm

# View cost breakdown
aws ce get-cost-and-usage \
  --time-period Start=$(date -u +%Y-%m-01),End=$(date -u +%Y-%m-%d) \
  --granularity DAILY \
  --metrics BlendedCost \
  --group-by Type=SERVICE
```

## Next Steps

1. ✅ Deploy infrastructure
2. ✅ Update secrets with real values
3. ✅ Configure SNS email subscriptions
4. ✅ Run integration tests
5. ✅ Integrate with Android app
6. ✅ Monitor CloudWatch Dashboard

## Documentation

- **Full Guide**: `INFRASTRUCTURE_README.md`
- **Validation**: `VALIDATION_SUMMARY.md`
- **Completion**: `COMPLETION_REPORT.md`

## Support

- **Issues**: Check CloudWatch Logs
- **Costs**: Check AWS Cost Explorer
- **Security**: Review IAM policies

## Cost Estimate

**Within Free Tier**: ~$0.80/month  
**After Free Tier**: $5-10/month (10,000 sessions)

---

🛡️ **VocalShield - Your AI Bodyguard Against Scam Calls**

**Ready to deploy?** Run `./scripts/deploy.sh dev` now!
