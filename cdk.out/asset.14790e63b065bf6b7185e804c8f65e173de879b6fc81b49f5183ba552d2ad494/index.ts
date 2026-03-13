/**
 * SlackWebhookLambda - Transform SNS alarm notifications to Slack messages
 * 
 * This Lambda function is triggered by SNS Topic subscriptions and formats
 * CloudWatch Alarm notifications into rich Slack messages with color coding
 * and structured attachments.
 * 
 * Features:
 * - Parses CloudWatch Alarm JSON from SNS
 * - Color-codes messages by severity (danger=red, warning=yellow, good=green)
 * - Posts to Slack webhook URL (retrieved from Secrets Manager)
 * - Implements retry logic with exponential backoff
 * - Handles errors with Dead Letter Queue
 * 
 * Environment Variables:
 * - SLACK_WEBHOOK_SECRET_NAME: Name of secret in Secrets Manager containing webhook URL
 * 
 * Requirements: 16.5
 */

import { SNSEvent, SNSEventRecord } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { captureAWSv3Client } from 'aws-xray-sdk-core';
import https from 'https';

// Initialize Secrets Manager client with X-Ray tracing
const secretsClient = captureAWSv3Client(new SecretsManagerClient({}));

const SLACK_WEBHOOK_SECRET_NAME = process.env.SLACK_WEBHOOK_SECRET_NAME || 'vocalshield/slack-webhook-url';

/**
 * Structured log entry interface
 */
interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  component: string;
  messageId?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Write structured JSON log to CloudWatch
 */
function log(entry: Omit<LogEntry, 'timestamp' | 'component'>): void {
  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    component: 'SlackWebhookLambda',
    ...entry,
  };
  console.log(JSON.stringify(logEntry));
}

/**
 * CloudWatch Alarm message structure from SNS
 */
interface CloudWatchAlarmMessage {
  AlarmName: string;
  AlarmDescription?: string;
  AWSAccountId: string;
  NewStateValue: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA';
  NewStateReason: string;
  StateChangeTime: string;
  Region: string;
  AlarmArn: string;
  OldStateValue: string;
  Trigger: {
    MetricName: string;
    Namespace: string;
    StatisticType: string;
    Statistic: string;
    Unit?: string;
    Dimensions: Array<{ name: string; value: string }>;
    Period: number;
    EvaluationPeriods: number;
    ComparisonOperator: string;
    Threshold: number;
    TreatMissingData: string;
  };
}

/**
 * Slack message structure
 */
interface SlackMessage {
  text: string;
  attachments: SlackAttachment[];
}

/**
 * Slack attachment structure
 */
interface SlackAttachment {
  color: 'danger' | 'warning' | 'good' | '#439FE0';
  title: string;
  text: string;
  fields: SlackField[];
  footer: string;
  ts: number;
}

/**
 * Slack field structure
 */
interface SlackField {
  title: string;
  value: string;
  short: boolean;
}

/**
 * Cache for Slack webhook URL (to avoid repeated Secrets Manager calls)
 */
let cachedWebhookUrl: string | null = null;

/**
 * Retrieve Slack webhook URL from Secrets Manager
 */
async function getSlackWebhookUrl(): Promise<string> {
  if (cachedWebhookUrl) {
    return cachedWebhookUrl;
  }

  try {
    const command = new GetSecretValueCommand({
      SecretId: SLACK_WEBHOOK_SECRET_NAME,
    });

    const response = await secretsClient.send(command);

    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }

    // Secret can be either plain string or JSON with 'url' field
    let webhookUrl: string;
    try {
      const parsed = JSON.parse(response.SecretString);
      webhookUrl = parsed.url || parsed.webhookUrl || response.SecretString;
    } catch {
      webhookUrl = response.SecretString;
    }

    cachedWebhookUrl = webhookUrl;
    return webhookUrl;
  } catch (error) {
    log({
      level: 'ERROR',
      message: 'Failed to retrieve Slack webhook URL from Secrets Manager',
      error: {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack,
      },
    });
    throw error;
  }
}

/**
 * Parse CloudWatch Alarm message from SNS
 */
function parseAlarmMessage(snsMessage: string): CloudWatchAlarmMessage {
  try {
    return JSON.parse(snsMessage) as CloudWatchAlarmMessage;
  } catch (error) {
    log({
      level: 'ERROR',
      message: 'Failed to parse CloudWatch Alarm message',
      error: {
        name: (error as Error).name,
        message: (error as Error).message,
      },
      metadata: { snsMessage },
    });
    throw new Error('Invalid CloudWatch Alarm message format');
  }
}

/**
 * Determine severity from alarm name and state
 */
function determineSeverity(alarmName: string, state: string): 'critical' | 'warning' | 'info' {
  if (state !== 'ALARM') {
    return 'info';
  }

  const lowerName = alarmName.toLowerCase();
  
  // Critical alarms
  if (
    lowerName.includes('critical') ||
    lowerName.includes('5xx') ||
    lowerName.includes('error') ||
    lowerName.includes('security') ||
    lowerName.includes('bruteforce')
  ) {
    return 'critical';
  }

  // Warning alarms
  if (
    lowerName.includes('warning') ||
    lowerName.includes('throttle') ||
    lowerName.includes('latency') ||
    lowerName.includes('freetier')
  ) {
    return 'warning';
  }

  return 'info';
}

/**
 * Get Slack color based on severity and alarm state
 */
function getSlackColor(severity: 'critical' | 'warning' | 'info', state: string): 'danger' | 'warning' | 'good' | '#439FE0' {
  if (state === 'OK') {
    return 'good';
  }

  if (state === 'INSUFFICIENT_DATA') {
    return '#439FE0'; // Blue for informational
  }

  switch (severity) {
    case 'critical':
      return 'danger';
    case 'warning':
      return 'warning';
    case 'info':
      return '#439FE0';
    default:
      return 'warning';
  }
}

/**
 * Format CloudWatch Alarm as Slack message
 */
function formatSlackMessage(alarm: CloudWatchAlarmMessage): SlackMessage {
  const severity = determineSeverity(alarm.AlarmName, alarm.NewStateValue);
  const color = getSlackColor(severity, alarm.NewStateValue);
  
  const stateEmoji = alarm.NewStateValue === 'ALARM' ? '🚨' : alarm.NewStateValue === 'OK' ? '✅' : 'ℹ️';
  const severityText = severity.toUpperCase();

  // Build dashboard link
  const dashboardLink = `https://console.aws.amazon.com/cloudwatch/home?region=${alarm.Region}#alarmsV2:alarm/${encodeURIComponent(alarm.AlarmName)}`;

  // Build fields
  const fields: SlackField[] = [
    {
      title: 'Severity',
      value: severityText,
      short: true,
    },
    {
      title: 'State',
      value: alarm.NewStateValue,
      short: true,
    },
    {
      title: 'Metric',
      value: alarm.Trigger.MetricName,
      short: true,
    },
    {
      title: 'Namespace',
      value: alarm.Trigger.Namespace,
      short: true,
    },
    {
      title: 'Threshold',
      value: `${alarm.Trigger.ComparisonOperator} ${alarm.Trigger.Threshold}`,
      short: true,
    },
    {
      title: 'Region',
      value: alarm.Region,
      short: true,
    },
  ];

  // Add dimensions if present
  if (alarm.Trigger.Dimensions && alarm.Trigger.Dimensions.length > 0) {
    const dimensionsText = alarm.Trigger.Dimensions
      .map(d => `${d.name}: ${d.value}`)
      .join(', ');
    fields.push({
      title: 'Dimensions',
      value: dimensionsText,
      short: false,
    });
  }

  const attachment: SlackAttachment = {
    color,
    title: `${stateEmoji} ${alarm.AlarmName}`,
    text: alarm.AlarmDescription || alarm.NewStateReason,
    fields,
    footer: `VocalShield Monitoring | <${dashboardLink}|View in CloudWatch>`,
    ts: Math.floor(new Date(alarm.StateChangeTime).getTime() / 1000),
  };

  return {
    text: `${stateEmoji} *VocalShield Alert*: ${alarm.AlarmName}`,
    attachments: [attachment],
  };
}

/**
 * Post message to Slack webhook with retry logic
 */
async function postToSlack(webhookUrl: string, message: SlackMessage, retries = 3): Promise<void> {
  const url = new URL(webhookUrl);
  const payload = JSON.stringify(message);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const options = {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        };

        const req = https.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve();
            } else {
              reject(new Error(`Slack API returned status ${res.statusCode}: ${data}`));
            }
          });
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.write(payload);
        req.end();
      });

      // Success - exit retry loop
      log({
        level: 'INFO',
        message: 'Successfully posted message to Slack',
        metadata: { attempt },
      });
      return;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      
      log({
        level: isLastAttempt ? 'ERROR' : 'WARN',
        message: `Failed to post to Slack (attempt ${attempt}/${retries})`,
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack,
        },
      });

      if (isLastAttempt) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Process a single SNS record
 */
async function processRecord(record: SNSEventRecord): Promise<void> {
  const startTime = Date.now();
  const messageId = record.Sns.MessageId;

  log({
    level: 'INFO',
    message: 'Processing SNS record',
    messageId,
    metadata: {
      subject: record.Sns.Subject,
      timestamp: record.Sns.Timestamp,
    },
  });

  try {
    // Parse CloudWatch Alarm message
    const alarm = parseAlarmMessage(record.Sns.Message);

    // Format as Slack message
    const slackMessage = formatSlackMessage(alarm);

    // Get Slack webhook URL
    const webhookUrl = await getSlackWebhookUrl();

    // Post to Slack with retry logic
    await postToSlack(webhookUrl, slackMessage);

    const duration = Date.now() - startTime;

    log({
      level: 'INFO',
      message: 'Successfully processed SNS record',
      messageId,
      duration,
      metadata: {
        alarmName: alarm.AlarmName,
        alarmState: alarm.NewStateValue,
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    log({
      level: 'ERROR',
      message: 'Failed to process SNS record',
      messageId,
      duration,
      error: {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack,
      },
    });

    throw error;
  }
}

/**
 * Lambda handler for SNS events
 */
export async function handler(event: SNSEvent): Promise<void> {
  const startTime = Date.now();

  log({
    level: 'INFO',
    message: 'SlackWebhookLambda invoked',
    metadata: {
      recordCount: event.Records.length,
    },
  });

  // Process all records (typically just one, but SNS can batch)
  const results = await Promise.allSettled(
    event.Records.map(record => processRecord(record))
  );

  // Check for failures
  const failures = results.filter(r => r.status === 'rejected');
  
  if (failures.length > 0) {
    log({
      level: 'ERROR',
      message: `Failed to process ${failures.length} out of ${results.length} records`,
      metadata: {
        failureCount: failures.length,
        totalCount: results.length,
      },
    });

    // Throw error to trigger DLQ for failed records
    throw new Error(`Failed to process ${failures.length} SNS records`);
  }

  const duration = Date.now() - startTime;

  log({
    level: 'INFO',
    message: 'SlackWebhookLambda completed successfully',
    duration,
    metadata: {
      recordCount: event.Records.length,
    },
  });
}
