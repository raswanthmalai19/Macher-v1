# VocalShield Infrastructure

AWS Infrastructure Foundation for VocalShield - A real-time conversation firewall protecting users from voice-based financial fraud.

## Overview

This infrastructure provides:
- **Real-time WebSocket API** for audio streaming
- **Serverless compute** with AWS Lambda (Node.js 20.x ARM64)
- **NoSQL storage** with DynamoDB (on-demand billing)
- **Event-driven architecture** with EventBridge, SQS, and Step Functions
- **Comprehensive monitoring** with CloudWatch, X-Ray, and Synthetics
- **Security** with IAM least privilege, WAF, and Secrets Manager
- **Cost optimization** for AWS Free Tier compliance

## Architecture

```
Mobile App → WebSocket API → Lambda Functions → DynamoDB
                ↓                    ↓
            EventBridge          SNS Notifications
                ↓                    ↓
          Step Functions      Family Members
```

## Prerequisites

### Required Software

- **Node.js**: 20.x or later ([Download](https://nodejs.org/))
- **npm**: Comes with Node.js
- **AWS CLI**: 2.x or later ([Installation Guide](https://aws.amazon.com/cli/))
- **AWS CDK**: 2.133.0 or later
  ```bash
  npm install -g aws-cdk
  ```

### AWS Account Setup

1. **Create AWS Account** (if you don't have one)
   - Visit [aws.amazon.com](https://aws.amazon.com)
   - Sign up for a free account

2. **Configure AWS Credentials**
   ```bash
   aws configure
   ```
   Enter:
   - AWS Access Key ID
   - AWS Secret Access Key
   - Default region (e.g., `us-east-1`)
   - Default output format: `json`

3. **Verify Configuration**
   ```bash
   aws sts get-caller-identity
   ```

## Installation

### 1. Clone Repository

```bash
git clone <repository-url>
cd vocalshield-infrastructure
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build TypeScript

```bash
npm run build
```

### 4. Run Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit          # Unit tests only
npm run test:properties    # Property-based tests only
npm run test:integration   # Integration tests only
```

## Deployment

### Quick Start (Development)

```bash
# Deploy to development environment
./scripts/deploy.sh dev
```

### Step-by-Step Deployment

#### 1. Bootstrap CDK (First Time Only)

```bash
# Get your AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Bootstrap CDK in your region
cdk bootstrap aws://$ACCOUNT_ID/us-east-1
```

#### 2. Synthesize CloudFormation Template

```bash
# Generate CloudFormation template
cdk synth -c environment=dev

# View the generated template
cat cdk.out/VocalShield-dev.template.json
```

#### 3. Preview Changes

```bash
# See what will be deployed
cdk diff -c environment=dev
```

#### 4. Deploy Infrastructure

```bash
# Deploy with approval prompts
cdk deploy -c environment=dev

# Deploy without approval prompts (CI/CD)
cdk deploy -c environment=dev --require-approval never
```

#### 5. Initialize Configuration

```bash
# Set up Parameter Store
./scripts/setup-parameters.sh

# Set up Secrets Manager (update placeholders with real values)
./scripts/setup-secrets.sh
```

### Environment-Specific Deployment

#### Development
```bash
./scripts/deploy.sh dev
# or
npm run deploy:dev
```

#### Staging
```bash
./scripts/deploy.sh staging
# or
npm run deploy:staging
```

#### Production
```bash
./scripts/deploy.sh production
# or
npm run deploy:production
```

**Note**: Production deployments require manual confirmation.

## Stack Outputs

After deployment, the stack outputs critical resource identifiers:

```bash
# View all outputs
aws cloudformation describe-stacks \
  --stack-name VocalShield-dev \
  --query 'Stacks[0].Outputs'
```

### Key Outputs

- **WebSocketApiEndpoint**: WSS URL for client connections
- **ConnectionsTableName**: DynamoDB connections table
- **MetadataTableName**: DynamoDB metadata table
- **FamilyLoopTopicArn**: SNS topic for notifications
- **EventBusName**: EventBridge custom event bus
- **AudioQueueUrl**: SQS queue for audio processing
- **DashboardUrl**: CloudWatch dashboard

## Configuration

### Parameter Store

Configuration values stored in AWS Systems Manager Parameter Store:

```bash
# View all parameters
aws ssm get-parameters-by-path \
  --path /vocalshield/dev \
  --recursive

# Update a parameter
aws ssm put-parameter \
  --name /vocalshield/dev/audio-processor/fraud-threshold \
  --value 75 \
  --overwrite
```

### Secrets Manager

Sensitive values stored in AWS Secrets Manager:

```bash
# View secret (without value)
aws secretsmanager describe-secret \
  --secret-id vocalshield/dev/api-keys

# Retrieve secret value
aws secretsmanager get-secret-value \
  --secret-id vocalshield/dev/api-keys \
  --query SecretString \
  --output text | jq .

# Update secret
aws secretsmanager put-secret-value \
  --secret-id vocalshield/dev/api-keys \
  --secret-string '{"mlServiceApiKey":"YOUR_REAL_KEY"}'
```

## Testing

### Unit Tests

Test individual components and CDK constructs:

```bash
npm run test:unit
```

### Property-Based Tests

Validate universal correctness properties:

```bash
npm run test:properties
```

Property tests validate:
- Resource tagging completeness
- No audio data persistence
- IAM least privilege
- Connection cleanup
- Error response codes
- Processing latency
- Structured logging
- Free Tier compliance
- Fraud notifications
- Secrets not exposed

### Integration Tests

End-to-end testing in AWS environment:

```bash
npm run test:integration
```

**Note**: Integration tests deploy real AWS resources and may incur costs.

## Monitoring

### CloudWatch Dashboard

View real-time metrics:

```bash
# Get dashboard URL from stack outputs
aws cloudformation describe-stacks \
  --stack-name VocalShield-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' \
  --output text
```

### CloudWatch Logs

View Lambda function logs:

```bash
# Connect Handler logs
aws logs tail /aws/lambda/VocalShield-ConnectHandler --follow

# Audio Processor logs
aws logs tail /aws/lambda/VocalShield-AudioProcessor --follow
```

### X-Ray Traces

View distributed traces:

```bash
# Open X-Ray console
aws xray get-service-graph \
  --start-time $(date -u -d '1 hour ago' +%s) \
  --end-time $(date -u +%s)
```

### CloudWatch Alarms

Check alarm status:

```bash
# List all alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix VocalShield

# View alarm history
aws cloudwatch describe-alarm-history \
  --alarm-name VocalShield-BillingAlarm
```

## Cost Management

### Free Tier Limits

Monthly Free Tier allowances:
- **Lambda**: 1M requests, 400K GB-seconds
- **API Gateway**: 1M messages (first 12 months)
- **DynamoDB**: 25 GB storage, 25 WCU/RCU
- **CloudWatch**: 5 GB logs, 10 custom metrics
- **SNS**: 1,000 notifications
- **Transcribe/Bedrock**: $200 competition credits

### Cost Monitoring

```bash
# View current month costs
aws ce get-cost-and-usage \
  --time-period Start=$(date -u +%Y-%m-01),End=$(date -u +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=TAG,Key=Project

# Check billing alarm status
aws cloudwatch describe-alarms \
  --alarm-names VocalShield-BillingAlarm
```

### Cost Optimization Tips

1. **Use ARM64 Lambda** (20% cost savings) ✅ Already configured
2. **On-demand DynamoDB** (no idle costs) ✅ Already configured
3. **7-day log retention** (Free Tier compliant) ✅ Already configured
4. **Cache Secrets Manager** (reduce API calls) ✅ Already implemented
5. **No NAT Gateway** (use VPC endpoints) ✅ Already configured

## Troubleshooting

### Deployment Failures

**Issue**: CDK deployment fails with "Stack already exists"

```bash
# Check stack status
aws cloudformation describe-stacks --stack-name VocalShield-dev

# If in ROLLBACK_COMPLETE state, delete and redeploy
cdk destroy -c environment=dev
cdk deploy -c environment=dev
```

**Issue**: Lambda function errors

```bash
# Check function logs
aws logs tail /aws/lambda/VocalShield-AudioProcessor --follow

# Check function configuration
aws lambda get-function --function-name VocalShield-AudioProcessor
```

**Issue**: WebSocket connection failures

```bash
# Test WebSocket endpoint
wscat -c $(aws cloudformation describe-stacks \
  --stack-name VocalShield-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`WebSocketApiEndpoint`].OutputValue' \
  --output text)
```

### Common Errors

**Error**: "User is not authorized to perform: sts:AssumeRole"
- **Solution**: Ensure IAM user has sufficient permissions for CDK deployment

**Error**: "Rate exceeded" from AWS APIs
- **Solution**: Add exponential backoff or reduce concurrent requests

**Error**: "Resource limit exceeded"
- **Solution**: Request limit increase via AWS Support Console

## Rollback

### Rollback to Previous Version

```bash
# View stack events
aws cloudformation describe-stack-events \
  --stack-name VocalShield-dev \
  --max-items 20

# Rollback stack
aws cloudformation rollback-stack --stack-name VocalShield-dev
```

### Complete Stack Deletion

```bash
# Delete all resources
cdk destroy -c environment=dev

# Verify deletion
aws cloudformation describe-stacks --stack-name VocalShield-dev
```

**Warning**: This deletes all resources including DynamoDB tables. Data cannot be recovered unless backups exist.

## Security

### IAM Permissions

Minimum IAM permissions required for deployment:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "lambda:*",
        "apigateway:*",
        "dynamodb:*",
        "sns:*",
        "secretsmanager:*",
        "ssm:*",
        "iam:*",
        "logs:*",
        "events:*",
        "sqs:*",
        "states:*",
        "xray:*",
        "cloudwatch:*",
        "synthetics:*",
        "wafv2:*",
        "backup:*",
        "evidently:*",
        "budgets:*",
        "resource-groups:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### Security Best Practices

1. **Never commit secrets** to version control
2. **Rotate credentials** every 90 days
3. **Use IAM roles** for service-to-service communication
4. **Enable CloudTrail** for audit logging
5. **Review IAM policies** regularly
6. **Enable MFA** on AWS root account
7. **Use separate AWS accounts** for dev/staging/production

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy Infrastructure

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Deploy to dev
        run: |
          npm run build
          cdk deploy -c environment=dev --require-approval never
```

## Support

### Documentation

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [API Gateway WebSocket API](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)

### Getting Help

- **Issues**: Open an issue on GitHub
- **Discussions**: Join our community discussions
- **Email**: support@vocalshield.example.com

## License

MIT License - See LICENSE file for details

## Contributing

Contributions welcome! Please read CONTRIBUTING.md for guidelines.

---

**VocalShield** - Your AI Bodyguard Against Scam Calls 🛡️
