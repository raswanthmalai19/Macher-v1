# Slack Webhook Lambda

Lambda function that transforms CloudWatch Alarm notifications from SNS into rich Slack messages.

## Overview

This Lambda function is triggered by SNS Topic subscriptions and formats CloudWatch Alarm notifications into Slack messages with:
- Color coding by severity (danger=red, warning=yellow, good=green)
- Structured attachments with alarm details
- Direct links to CloudWatch console
- Automatic retry logic with exponential backoff

## Features

- **SNS Integration**: Triggered by CloudWatch Alarm notifications via SNS
- **Slack Formatting**: Rich message formatting with attachments and fields
- **Color Coding**: Visual severity indicators (danger, warning, good, info)
- **Secrets Manager**: Secure webhook URL storage
- **Retry Logic**: Exponential backoff with 3 retry attempts
- **Error Handling**: Dead Letter Queue support for failed invocations
- **X-Ray Tracing**: Distributed tracing for debugging
- **Structured Logging**: JSON logs for CloudWatch Logs Insights

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SLACK_WEBHOOK_SECRET_NAME` | Name of secret in Secrets Manager containing webhook URL | No (defaults to `macher/slack-webhook-url`) |

## Secrets Manager Configuration

The Slack webhook URL should be stored in AWS Secrets Manager. The secret can be in one of these formats:

**Plain string:**
```
https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**JSON with `url` field:**
```json
{
  "url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
}
```

**JSON with `webhookUrl` field:**
```json
{
  "webhookUrl": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
}
```

## Alarm Severity Detection

The function automatically determines severity based on alarm name:

### Critical (Red)
- Contains: `critical`, `5xx`, `error`, `security`, `bruteforce`
- Color: `danger` (red)
- Examples: `Critical-Lambda-Errors`, `APIGateway-5xx-Errors`

### Warning (Yellow)
- Contains: `warning`, `throttle`, `latency`, `freetier`
- Color: `warning` (yellow)
- Examples: `Warning-DynamoDB-Throttle`, `HighLatency-Alert`

### Info (Blue)
- All other alarms or OK state
- Color: `#439FE0` (blue) or `good` (green for OK)
- Examples: Any alarm in OK state

## Slack Message Format

```
🚨 MACHER Alert: Critical-Lambda-Errors

Attachment:
  Title: 🚨 Critical-Lambda-Errors
  Text: Lambda error rate exceeded threshold
  Fields:
    - Severity: CRITICAL
    - State: ALARM
    - Metric: Errors
    - Namespace: AWS/Lambda
    - Threshold: GreaterThanThreshold 5
    - Region: us-east-1
    - Dimensions: FunctionName: MyFunction
  Footer: MACHER Monitoring | View in CloudWatch
  Timestamp: 2024-01-01T00:00:00.000Z
```

## Error Handling

### Retry Logic
- 3 retry attempts with exponential backoff
- Delays: 1s, 2s, 4s
- Retries on HTTP errors (5xx, network failures)

### Dead Letter Queue
- Failed invocations are sent to DLQ after all retries exhausted
- Allows manual inspection and reprocessing

### Logging
All operations are logged with structured JSON:
```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "level": "INFO",
  "message": "Successfully posted message to Slack",
  "component": "SlackWebhookLambda",
  "messageId": "abc-123",
  "duration": 150
}
```

## IAM Permissions Required

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:macher/slack-webhook-url-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords"
      ],
      "Resource": "*"
    }
  ]
}
```

## Development

### Install Dependencies
```bash
npm install
```

### Build
```bash
npm run build
```

### Run Tests
```bash
npm test
```

### Run Tests with Coverage
```bash
npm test -- --coverage
```

## Testing

The function includes comprehensive unit tests covering:
- CloudWatch Alarm message parsing
- Slack message formatting
- Color coding by severity
- Dimension handling
- Error handling and retries
- Secrets Manager integration

Run tests:
```bash
npm test
```

## Deployment

This Lambda function is deployed via AWS CDK as part of the MACHER monitoring infrastructure.

### CDK Configuration
```typescript
const slackWebhookLambda = new lambda.Function(this, 'SlackWebhookLambda', {
  runtime: lambda.Runtime.NODEJS_20_X,
  architecture: lambda.Architecture.ARM_64,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/slack-webhook'),
  timeout: Duration.seconds(10),
  memorySize: 512,
  environment: {
    SLACK_WEBHOOK_SECRET_NAME: 'macher/slack-webhook-url',
  },
  tracing: lambda.Tracing.ACTIVE,
  deadLetterQueue: dlq,
});

// Subscribe to SNS topics
criticalAlarmTopic.addSubscription(new subscriptions.LambdaSubscription(slackWebhookLambda));
warningAlarmTopic.addSubscription(new subscriptions.LambdaSubscription(slackWebhookLambda));
```

## Monitoring

### CloudWatch Metrics
- `Invocations`: Number of times function is invoked
- `Errors`: Number of failed invocations
- `Duration`: Execution time
- `Throttles`: Number of throttled invocations

### CloudWatch Logs
All logs are structured JSON and can be queried with CloudWatch Logs Insights:

```
fields @timestamp, level, message, duration, messageId
| filter component = "SlackWebhookLambda"
| sort @timestamp desc
```

### X-Ray Traces
View distributed traces in AWS X-Ray console to debug:
- Secrets Manager retrieval time
- Slack API response time
- Retry attempts

## Troubleshooting

### Slack messages not appearing
1. Check CloudWatch Logs for errors
2. Verify Slack webhook URL in Secrets Manager
3. Test webhook URL manually with curl
4. Check Lambda execution role has Secrets Manager permissions

### High error rate
1. Check X-Ray traces for bottlenecks
2. Verify Slack API is responding (check status.slack.com)
3. Review retry logic in logs
4. Check DLQ for failed messages

### Timeout errors
1. Increase Lambda timeout (currently 10s)
2. Check network connectivity to Slack
3. Review X-Ray traces for slow operations

## Requirements

Validates: Requirements 16.5

**Requirement 16.5**: THE Monitoring_System SHALL support Slack webhook subscriptions to SNS_Topic via Lambda_Function

## License

MIT
