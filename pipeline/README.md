# MACHER CI/CD Pipeline

## Overview

This directory contains the complete CI/CD pipeline implementation for MACHER, built using GitHub Actions, TypeScript, and Python. The pipeline automates testing, building, deployment, and monitoring across dev, staging, and production environments while maintaining AWS Free Tier compliance.

## Architecture

### Pipeline Components

1. **Configuration Management** (`config/`)
   - Environment-specific configuration loading
   - JSON schema validation
   - Free Tier compliance checking

2. **Secrets Management** (`secrets/`)
   - Secure secret retrieval from GitHub Secrets
   - Secret masking in logs
   - Secret validation

3. **Deployment Engine** (`deploy/`)
   - CDK deployment orchestration
   - Blue-green deployment for production
   - Rollback management
   - Database migration handling
   - Drift detection

4. **Testing Framework** (`test/`)
   - Unit test execution (Jest)
   - Property test execution (fast-check)
   - Integration test execution (LocalStack)
   - Smoke test execution

5. **Notification System** (`notify/`)
   - Slack notifications
   - Email notifications
   - Multi-channel delivery

6. **Cost Monitoring** (`cost/`)
   - AWS Cost Explorer integration
   - Free Tier usage tracking
   - Cost threshold alerting

7. **Documentation Generation** (`docs/`)
   - API documentation from OpenAPI specs
   - Architecture diagram generation
   - Changelog generation

## Workflows

### CI Workflow (`.github/workflows/ci.yml`)

Runs on every push and pull request.

**Jobs:**
- `test-typescript`: Unit and property tests for TypeScript code
- `test-python`: Unit and property tests for Python code
- `test-integration`: Integration tests with LocalStack
- `build-lambda`: Package Lambda functions
- `build-android`: Build Android APK
- `lint`: ESLint, Prettier, TypeScript type checking
- `security-scan`: npm audit and Snyk scanning

### CD Workflow (`.github/workflows/cd.yml`)

Runs on push to main branch or manual dispatch.

**Deployment Flow:**
1. **Dev Environment**
   - Automatic deployment
   - Smoke tests
   - Drift detection

2. **Staging Environment**
   - Requires dev success
   - Database migrations
   - Smoke tests

3. **Production Environment**
   - Requires staging success
   - Manual approval required
   - Blue-green deployment
   - Traffic switching
   - Metric monitoring
   - Automatic rollback on errors

### Drift Detection Workflow (`.github/workflows/drift-detection.yml`)

Runs daily at 2 AM UTC or on manual dispatch.

**Jobs:**
- Detect infrastructure drift across all environments
- Generate drift reports
- Send notifications for production drift

## Required GitHub Secrets

Configure these secrets in your GitHub repository settings:

### AWS Credentials
- `AWS_ACCESS_KEY_ID`: AWS access key
- `AWS_SECRET_ACCESS_KEY`: AWS secret key

### Android Signing
- `ANDROID_KEYSTORE_BASE64`: Base64-encoded release keystore
- `ANDROID_KEYSTORE_PASSWORD`: Keystore password
- `ANDROID_KEY_ALIAS`: Key alias
- `ANDROID_KEY_PASSWORD`: Key password

### Notifications
- `SLACK_WEBHOOK`: Slack webhook URL
- `ALERT_EMAIL`: Email address for alerts

### Optional
- `SNYK_TOKEN`: Snyk API token for security scanning

## Environment Configuration

Configuration files are located in `config/`:

- `common.json`: Shared configuration across all environments
- `dev.json`: Development environment overrides
- `staging.json`: Staging environment overrides
- `production.json`: Production environment overrides
- `schema.json`: JSON schema for validation

### Configuration Structure

```json
{
  "environment": "dev|staging|production",
  "aws": {
    "region": "us-east-1",
    "account": "123456789012"
  },
  "lambda": {
    "memorySize": 512,
    "timeout": 30,
    "runtime": "nodejs20.x",
    "architecture": "arm64"
  },
  "dynamodb": {
    "billingMode": "PAY_PER_REQUEST",
    "pointInTimeRecovery": false
  },
  "apiGateway": {
    "throttling": {
      "rateLimit": 100,
      "burstLimit": 200
    }
  },
  "monitoring": {
    "logRetentionDays": 7,
    "alarmEmail": "alerts@example.com"
  },
  "android": {
    "versionCode": 1,
    "versionName": "1.0.0",
    "signingKeyAlias": "release-key"
  }
}
```

## Manual Deployment

### Deploy to Dev
```bash
npm run deploy:dev
```

### Deploy to Staging
```bash
npm run deploy:staging
```

### Deploy to Production (Blue-Green)
```bash
npm run deploy:production
```

### Rollback Production
```bash
node pipeline/deploy/RollbackManager.js rollback production
```

## Testing

### Run All Tests
```bash
npm test
```

### Run Unit Tests
```bash
npm run test:unit
```

### Run Property Tests
```bash
npm run test:property
```

### Run Integration Tests
```bash
npm run test:integration
```

### Run Smoke Tests
```bash
node pipeline/test/SmokeTestRunner.js <environment>
```

## Monitoring

### Check Drift
```bash
node pipeline/deploy/DriftDetector.js <environment>
```

### Check Costs
```bash
python pipeline/cost/cost_monitor.py
```

### View Deployment History
```bash
node pipeline/deploy/RollbackManager.js history production
```

## Troubleshooting

### Deployment Failures

1. **Check CloudFormation Events**
   ```bash
   aws cloudformation describe-stack-events --stack-name MACHER-<env>
   ```

2. **View Lambda Logs**
   ```bash
   aws logs tail /aws/lambda/<function-name> --follow
   ```

3. **Rollback to Previous Version**
   ```bash
   node pipeline/deploy/RollbackManager.js rollback <environment>
   ```

### Test Failures

1. **Check Test Output**
   - Review GitHub Actions logs
   - Look for specific test failures
   - Check coverage reports

2. **Run Tests Locally**
   ```bash
   npm test -- --verbose
   ```

3. **Debug Integration Tests**
   ```bash
   # Start LocalStack
   docker run -d -p 4566:4566 localstack/localstack
   
   # Run integration tests
   npm run test:integration
   ```

### Cost Overruns

1. **Check Current Costs**
   ```bash
   python pipeline/cost/cost_monitor.py
   ```

2. **Review Free Tier Usage**
   - Check AWS Cost Explorer
   - Review CloudWatch metrics
   - Check Lambda invocation counts

3. **Optimize Resources**
   - Reduce Lambda memory if possible
   - Check DynamoDB read/write units
   - Review API Gateway throttling

## Free Tier Compliance

The pipeline enforces AWS Free Tier limits:

- **Lambda**: 1M requests/month, 400K GB-seconds
- **DynamoDB**: 25 GB storage, 25 RCU/WCU
- **API Gateway**: 1M requests/month
- **CloudWatch**: 10 custom metrics, 5 GB logs
- **Transcribe**: $200 competition credits
- **Bedrock**: $200 competition credits

Deployments will fail if configuration exceeds these limits.

## Blue-Green Deployment

Production deployments use blue-green strategy:

1. **Create Green Environment**: New stack with updated code
2. **Deploy to Green**: Deploy application to green stack
3. **Run Smoke Tests**: Validate green environment
4. **Switch Traffic**: Route traffic from blue to green
5. **Monitor Metrics**: Watch error rates and latency
6. **Automatic Rollback**: Revert to blue if errors exceed threshold
7. **Cleanup Blue**: Remove old blue environment after 24 hours

## Database Migrations

Migrations are executed before code deployment:

1. **Detect Pending Migrations**: Scan `migrations/` directory
2. **Validate Scripts**: Check syntax and dependencies
3. **Create Backup**: Backup production database
4. **Execute Migrations**: Run in version order
5. **Update History**: Track applied migrations
6. **Rollback on Failure**: Restore from backup if migration fails

## Contributing

When adding new pipeline components:

1. Add TypeScript types to `pipeline/types.ts`
2. Implement component with error handling
3. Write property tests (100+ iterations)
4. Write unit tests (80%+ coverage)
5. Update this README
6. Test locally before committing

## License

MIT License - See LICENSE file for details
