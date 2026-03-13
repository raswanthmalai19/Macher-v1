# VocalShield Deployment Outputs

This document describes the CloudFormation stack outputs generated after deploying VocalShield infrastructure.

## Overview

After deploying the VocalShield CDK stack, CloudFormation generates outputs that provide essential configuration values for:
- Mobile app integration
- API authentication
- Monitoring and debugging
- Infrastructure management

## Requirements Validation

This deployment configuration validates the following requirements:
- **Requirement 7.3**: All resources tagged with Project=VocalShield and Environment
- **Requirement 7.7**: Stack deployed to us-east-1 region
- **Requirement 7.8**: WebSocket endpoint URL output for mobile app configuration
- **Requirement 12.2**: API keys generated and stored in Secrets Manager

## Core Outputs

### WebSocket API Configuration

#### WebSocketApiEndpoint
- **Description**: WebSocket API endpoint URL for mobile app (wss://)
- **Usage**: Configure this in your Android app to connect to the backend
- **Format**: `wss://{api-id}.execute-api.us-east-1.amazonaws.com/{stage}`
- **Export Name**: `{Environment}-VocalShield-WebSocketEndpoint`

#### WebSocketApiId
- **Description**: WebSocket API ID
- **Usage**: Used for API Gateway management and monitoring
- **Export Name**: `{Environment}-VocalShield-WebSocketApiId`

### API Keys & Authentication

#### ApiKeysSecretArn
- **Description**: Secrets Manager ARN for API keys (includes auto-generated WebSocket API key)
- **Usage**: Reference this ARN to grant Lambda functions access to API keys
- **Export Name**: `{Environment}-VocalShield-ApiKeysSecret`

#### ApiKeysSecretName
- **Description**: Secrets Manager secret name for API keys
- **Usage**: Use with AWS CLI to retrieve API keys
- **Command**: `aws secretsmanager get-secret-value --secret-id macher/api-keys`

**Secret Structure**:
```json
{
  "websocketApiKey": "auto-generated-secure-key",
  "mlServiceApiKey": "PLACEHOLDER_ML_API_KEY",
  "thirdPartyIntegrationKey": "PLACEHOLDER_INTEGRATION_KEY"
}
```

### DynamoDB Tables

#### ConnectionsTableName
- **Description**: DynamoDB Connections Table name
- **Usage**: Stores active WebSocket connections
- **TTL**: 24 hours
- **Export Name**: `{Environment}-VocalShield-ConnectionsTable`

#### MetadataTableName
- **Description**: DynamoDB Metadata Table name
- **Usage**: Stores call session metadata (no audio, PII-redacted)
- **TTL**: 24 hours (dev), 30 days (production)
- **Export Name**: `{Environment}-VocalShield-MetadataTable`

### SNS & SQS

#### FamilyLoopTopicArn
- **Description**: SNS Family Loop Topic ARN
- **Usage**: Publishes fraud alerts to family members/guardians
- **Export Name**: `{Environment}-VocalShield-FamilyLoopTopic`

#### AudioQueueUrl
- **Description**: SQS Audio Queue URL
- **Usage**: Queues audio processing tasks
- **Export Name**: `{Environment}-VocalShield-AudioQueue`

### Lambda Functions

#### ConnectHandlerArn
- **Description**: Connect Handler Lambda ARN
- **Usage**: Handles WebSocket connection establishment

#### DisconnectHandlerArn
- **Description**: Disconnect Handler Lambda ARN
- **Usage**: Handles WebSocket disconnection

#### AudioProcessorArn
- **Description**: Audio Processor Lambda ARN
- **Usage**: Processes audio streams and performs fraud detection

### Monitoring

#### DashboardUrl
- **Description**: CloudWatch Dashboard URL
- **Usage**: Direct link to monitoring dashboard
- **Format**: `https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name={DashboardName}`

### Deployment Information

#### Region
- **Description**: AWS Region where stack is deployed
- **Value**: `us-east-1` (per Requirement 7.7)
- **Usage**: Confirms deployment region for mobile app configuration

#### Environment
- **Description**: Deployment environment
- **Values**: `dev`, `staging`, `production`
- **Usage**: Identifies which environment is deployed

#### StackName
- **Description**: CloudFormation stack name
- **Value**: `VocalShield-{environment}`
- **Usage**: Used for stack management and updates

## Retrieving Outputs

### Using AWS CLI

Retrieve all outputs:
```bash
aws cloudformation describe-stacks \
  --stack-name VocalShield-dev \
  --query 'Stacks[0].Outputs'
```

Retrieve specific output:
```bash
aws cloudformation describe-stacks \
  --stack-name VocalShield-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`WebSocketApiEndpoint`].OutputValue' \
  --output text
```

### Using Helper Scripts

We provide convenience scripts to retrieve deployment configuration:

#### Get All Configuration
```bash
./scripts/get-deployment-config.sh dev
```

This displays:
- WebSocket API endpoint and ID
- API keys secret ARN and name
- DynamoDB table names
- SNS/SQS resources
- Lambda function ARNs
- Monitoring dashboard URL
- Deployment information

#### Get API Keys
```bash
./scripts/get-api-keys.sh dev
```

This retrieves and displays:
- WebSocket API key (for mobile app)
- ML Service API key
- Third-party integration key

### Using CDK CLI

```bash
cdk deploy --outputs-file outputs.json
```

This creates `outputs.json` with all stack outputs.

## Mobile App Integration

### Step 1: Retrieve Configuration

```bash
# Get WebSocket endpoint
WEBSOCKET_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name VocalShield-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`WebSocketApiEndpoint`].OutputValue' \
  --output text)

# Get API key
API_KEY=$(aws secretsmanager get-secret-value \
  --secret-id macher/api-keys \
  --query SecretString \
  --output text | jq -r '.websocketApiKey')
```

### Step 2: Configure Android App

Add to `android/app/src/main/res/values/config.xml`:
```xml
<resources>
    <string name="websocket_endpoint">wss://abc123.execute-api.us-east-1.amazonaws.com/dev</string>
</resources>
```

Add to `android/app/src/main/res/values/secrets.xml` (create if doesn't exist):
```xml
<resources>
    <string name="websocket_api_key">your-api-key-here</string>
</resources>
```

**Important**: Add `secrets.xml` to `.gitignore` to prevent committing API keys.

### Step 3: Test Connection

```bash
# Install wscat if not already installed
npm install -g wscat

# Test WebSocket connection
wscat -c "$WEBSOCKET_ENDPOINT" -H "x-api-key: $API_KEY"
```

Expected response:
```
Connected (press CTRL+C to quit)
```

## Stack Tags

All resources are tagged with (Requirement 7.3):
- **Project**: VocalShield
- **Environment**: dev/staging/production
- **ManagedBy**: CDK
- **CostCenter**: VocalShield-Infrastructure

View tags:
```bash
aws cloudformation describe-stacks \
  --stack-name VocalShield-dev \
  --query 'Stacks[0].Tags'
```

## Export Names

Several outputs are exported for cross-stack references:

- `{Environment}-VocalShield-WebSocketEndpoint`
- `{Environment}-VocalShield-WebSocketApiId`
- `{Environment}-VocalShield-ApiKeysSecret`
- `{Environment}-VocalShield-ConnectionsTable`
- `{Environment}-VocalShield-MetadataTable`
- `{Environment}-VocalShield-FamilyLoopTopic`
- `{Environment}-VocalShield-AudioQueue`

Import in other stacks:
```typescript
const websocketEndpoint = cdk.Fn.importValue('dev-VocalShield-WebSocketEndpoint');
```

## Security Considerations

### API Keys
- **Never commit API keys to version control**
- Store in Secrets Manager (already configured)
- Rotate keys regularly (every 90 days recommended)
- Use different keys for each environment

### Secrets Access
- Lambda functions have IAM permissions to read secrets
- Mobile app receives keys through secure configuration
- Use AWS Secrets Manager rotation for automated key rotation

### Network Security
- WebSocket API uses WSS (TLS 1.2+) encryption
- API key authentication required for all connections
- Rate limiting: 100 requests/minute per API key

## Troubleshooting

### Output Not Found
If an output is missing:
1. Verify stack deployed successfully: `aws cloudformation describe-stacks --stack-name VocalShield-dev`
2. Check for deployment errors: `cdk deploy --verbose`
3. Verify CDK version: `cdk --version` (should be 2.x)

### API Key Not Generated
If API key is not auto-generated:
1. Check Secrets Manager: `aws secretsmanager get-secret-value --secret-id macher/api-keys`
2. Verify secret has `websocketApiKey` field
3. If missing, update secret manually or redeploy stack

### WebSocket Connection Fails
1. Verify endpoint URL is correct (starts with `wss://`)
2. Check API key is valid
3. Verify security group rules allow outbound HTTPS (443)
4. Check CloudWatch Logs for connection errors

## Next Steps

After retrieving outputs:
1. ✅ Configure Android app with WebSocket endpoint and API key
2. ✅ Test WebSocket connection with wscat
3. ✅ Verify CloudWatch Dashboard is accessible
4. ✅ Set up monitoring alerts (optional)
5. ✅ Configure Bedrock resources (see Knowledge Base outputs)

## Related Documentation

- [Deployment Guide](../scripts/deploy.sh)
- [API Authentication](../docs/API_AUTHENTICATION.md)
- [Mobile App Integration](../android/README.md)
- [Monitoring Guide](../docs/MONITORING.md)
