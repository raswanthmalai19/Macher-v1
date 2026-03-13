# MACHER Monitoring and Observability

Complete monitoring and observability system for MACHER, built with AWS CloudWatch, X-Ray, and Synthetics.

## Overview

The monitoring system provides comprehensive visibility into:
- System health and performance
- Error tracking and analysis
- Security events
- Cost and Free Tier compliance
- Business KPIs

## Components

### Core Monitoring Classes

#### StructuredLogger
Emits consistent JSON-formatted logs to CloudWatch Logs.

```typescript
import { logger } from './lib/monitoring/structured-logger';

logger.info('User authenticated', {
  component: 'AuthHandler',
  userId: 'user-123',
  duration: 150
});
```

#### MetricPublisher
Publishes custom metrics to CloudWatch while enforcing Free Tier limits.

```typescript
import { metricPublisher, MetricUnit } from './lib/monitoring/metric-publisher';

await metricPublisher.publishMetric(
  'VocalShield/Performance',
  'Latency',
  150,
  MetricUnit.Milliseconds,
  { Endpoint: '/analyze' }
);
```

#### XRayTracer
Instruments code for distributed tracing.

```typescript
import { xrayTracer } from './lib/monitoring/xray-tracer';

await xrayTracer.captureFunc('ProcessAudio', async (subsegment) => {
  subsegment.addAnnotation('userId', userId);
  // Your code here
});
```

### CloudWatch Dashboards

Pre-configured dashboards for:
- System Overview (Lambda, API Gateway, DynamoDB metrics)
- Performance (P50/P90/P99 latency)
- Errors (error rates by component)
- Security (failed auth attempts, suspicious activity)
- Costs (Free Tier usage tracking)

### CloudWatch Alarms

Automatic alerts for:
- Lambda error rate > 5%
- API Gateway 5xx errors > 1%
- DynamoDB throttling
- P99 latency > 3000ms
- Free Tier usage > 80% (warning) and > 95% (critical)
- Security events (brute force attempts)

### CloudWatch Synthetics Canaries

Automated health checks:
- API Gateway health endpoint (every 5 minutes)
- WebSocket connection test (every 15 minutes)

### Anomaly Detection

Machine learning-based anomaly detection for:
- Lambda invocation counts
- API Gateway request rates
- Error rates across all components

### Log Insights Queries

Pre-defined queries for:
- Error analysis (errors by type and component)
- Latency analysis (P50/P90/P99 by endpoint)
- User activity (request counts by user)
- Security events (failed authentication attempts)

## Deployment

### Prerequisites

- AWS CDK installed
- AWS credentials configured
- Node.js 20.x

### Deploy Monitoring Stack

```bash
# Install dependencies
npm install

# Deploy monitoring infrastructure
cdk deploy MonitoringStack
```

### Configuration

Set environment variables:

```bash
export AWS_REGION=us-east-1
export API_ENDPOINT=https://your-api.execute-api.us-east-1.amazonaws.com
export WS_ENDPOINT=wss://your-ws.execute-api.us-east-1.amazonaws.com
export ALARM_EMAILS=admin@example.com,ops@example.com
```

## Usage

### Instrumenting Lambda Functions

```typescript
import { logger, metricPublisher, xrayTracer } from './lib/monitoring';

export const handler = async (event: any) => {
  const requestId = event.requestContext.requestId;
  
  logger.info('Processing request', {
    component: 'MyLambda',
    requestId,
  });

  await xrayTracer.captureFunc('ProcessRequest', async (subsegment) => {
    const startTime = Date.now();
    
    try {
      // Your business logic
      const result = await processRequest(event);
      
      const duration = Date.now() - startTime;
      
      // Publish metrics
      await metricPublisher.publishMetric(
        'VocalShield/Performance',
        'ProcessingDuration',
        duration,
        MetricUnit.Milliseconds,
        { Function: 'MyLambda' }
      );
      
      logger.info('Request processed successfully', {
        component: 'MyLambda',
        requestId,
        duration,
      });
      
      return result;
    } catch (error) {
      logger.error('Request processing failed', error as Error, {
        component: 'MyLambda',
        requestId,
      });
      
      throw error;
    }
  });
};
```

### Tracking Business KPIs

```typescript
import { metricPublisher } from './lib/monitoring';

// Track fraud detection rate
const fraudDetectionRate = (blockedCalls / totalCalls) * 100;
await metricPublisher.publishBusinessKPI(
  'FraudDetectionRate',
  fraudDetectionRate,
  { Environment: 'Production' }
);

// Track user engagement
await metricPublisher.publishBusinessKPI(
  'ActiveUsers',
  activeUserCount,
  { Period: 'Daily' }
);
```

### Querying Logs

```typescript
import { logInsightsQueryManager } from './lib/monitoring';

// Execute saved query
const results = await logInsightsQueryManager.executeSavedQuery(
  'error-analysis',
  {
    startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
    endTime: new Date(),
  }
);

console.log('Error counts by component:', results.results);
```

### Tracking Canary Success Rates

```typescript
import { canarySuccessTracker } from './lib/monitoring';

// Fetch and publish success rates
const successRate = await canarySuccessTracker.fetchAndCalculateSuccessRate(
  'vocalshield-health-check',
  new Date(Date.now() - 24 * 60 * 60 * 1000),
  new Date()
);

await canarySuccessTracker.publishSuccessRateMetrics(successRate);
```

## Free Tier Compliance

The monitoring system is designed to stay within AWS Free Tier limits:

- **CloudWatch Logs**: 5 GB ingestion/month (7-day retention)
- **CloudWatch Metrics**: 10 custom metrics (using dimensions for multiplexing)
- **CloudWatch Alarms**: 10 alarms
- **Lambda**: 1M requests/month for monitoring functions
- **X-Ray**: 100K traces/month (10% sampling)
- **Synthetics**: 100 canary runs/month

### Cost Monitoring

Free Tier usage is tracked automatically:

```typescript
import { freeTierUsageTracker } from './lib/monitoring';

const usage = await freeTierUsageTracker.getCurrentUsage();
console.log('Lambda usage:', usage.lambda.percentage + '%');
console.log('CloudWatch Logs usage:', usage.logs.percentage + '%');
```

Alarms trigger at 80% and 95% thresholds to prevent overages.

## Testing

### Run Property-Based Tests

```bash
npm test -- tests/monitoring/property
```

### Run Unit Tests

```bash
npm test -- tests/monitoring/unit
```

### Run Integration Tests

```bash
npm test -- tests/monitoring/integration
```

## Troubleshooting

### High CloudWatch Costs

1. Check log retention period (should be 7 days)
2. Verify custom metric count (should be ≤ 10)
3. Review canary execution frequency
4. Check for excessive log verbosity

### Missing Metrics

1. Verify MetricPublisher is flushing metrics
2. Check CloudWatch API throttling
3. Verify IAM permissions for PutMetricData
4. Check metric namespace and dimensions

### Canary Failures

1. Check canary artifacts in S3
2. Review canary logs in CloudWatch
3. Verify endpoint URLs are correct
4. Check network connectivity and security groups

### Alarm Not Triggering

1. Verify alarm threshold and evaluation periods
2. Check metric data is being published
3. Review alarm configuration in CloudWatch console
4. Verify SNS topic subscriptions are confirmed

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Data Sources                             │
│  Lambda │ API Gateway │ DynamoDB │ Transcribe │ Bedrock     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Collection & Aggregation                        │
│  CloudWatch Logs │ CloudWatch Metrics │ AWS X-Ray           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Analysis & Processing                           │
│  Logs Insights │ Anomaly Detection │ Contributor Insights   │
│  Synthetics Canaries                                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           Visualization & Alerting                           │
│  CloudWatch Dashboards │ CloudWatch Alarms │ SNS Topics     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Notification Channels                           │
│  Email │ Slack                                               │
└─────────────────────────────────────────────────────────────┘
```

## Best Practices

1. **Always use structured logging** - Consistent JSON format enables efficient querying
2. **Include correlation IDs** - Use requestId for tracing across services
3. **Sanitize PII** - Never log sensitive user data
4. **Batch metrics** - Reduce API calls by batching up to 20 metrics
5. **Use dimensions** - Multiplex metrics to stay within Free Tier limits
6. **Monitor Free Tier usage** - Set alarms at 80% and 95% thresholds
7. **Archive old logs** - Move logs to S3 after 7 days for cost savings
8. **Sample traces** - Use 10% sampling for successful requests, 100% for errors
9. **Test canaries regularly** - Ensure endpoints are healthy
10. **Review dashboards daily** - Proactive monitoring prevents issues

## Support

For issues or questions:
- Check CloudWatch Logs for error messages
- Review X-Ray traces for performance bottlenecks
- Consult saved Log Insights queries for common issues
- Check canary artifacts in S3 for detailed failure information

## License

MIT License - See LICENSE file for details
