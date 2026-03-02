/**
 * SNSNotificationHandler - Format and send notifications via SNS
 * 
 * This class handles formatting and sending alarm notifications through
 * Amazon SNS to various channels (email, Slack, etc.).
 * 
 * Features:
 * - Rich notification formatting
 * - Dashboard links
 * - Remediation steps
 * - Severity-based routing
 * 
 * Usage:
 * ```typescript
 * const handler = new SNSNotificationHandler({ region: 'us-east-1' });
 * await handler.sendNotification(topicArn, 'Critical Alert', message);
 * ```
 */

import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { NotificationMessage } from './types';
import { logger } from './structured-logger';

/**
 * Configuration for SNSNotificationHandler
 */
export interface SNSNotificationHandlerConfig {
  region?: string;
  dashboardBaseUrl?: string;
}

/**
 * SNSNotificationHandler class for alarm notifications
 */
export class SNSNotificationHandler {
  private readonly client: SNSClient;
  private readonly region: string;
  private readonly dashboardBaseUrl: string;

  constructor(config: SNSNotificationHandlerConfig = {}) {
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.client = new SNSClient({ region: this.region });
    this.dashboardBaseUrl = config.dashboardBaseUrl || 
      `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:`;
  }

  /**
   * Send a notification via SNS
   */
  public async sendNotification(
    topicArn: string,
    subject: string,
    message: NotificationMessage
  ): Promise<void> {
    try {
      const formattedMessage = this.formatMessage(message);

      const command = new PublishCommand({
        TopicArn: topicArn,
        Subject: subject,
        Message: formattedMessage,
        MessageAttributes: {
          severity: {
            DataType: 'String',
            StringValue: message.severity,
          },
          alarmName: {
            DataType: 'String',
            StringValue: message.alarmName,
          },
        },
      });

      await this.client.send(command);

      logger.info('Notification sent successfully', {
        component: 'SNSNotificationHandler',
        metadata: {
          topicArn,
          alarmName: message.alarmName,
          severity: message.severity,
        },
      });
    } catch (error) {
      logger.error('Failed to send notification', error as Error, {
        component: 'SNSNotificationHandler',
        metadata: {
          topicArn,
          alarmName: message.alarmName,
        },
      });
      throw error;
    }
  }

  /**
   * Format notification message for email
   */
  private formatMessage(message: NotificationMessage): string {
    const severityEmoji = this.getSeverityEmoji(message.severity);
    
    return `
${severityEmoji} MACHER Alert: ${message.alarmName}

Severity: ${message.severity.toUpperCase()}
Time: ${message.timestamp}

Description:
${message.alarmDescription}

Metric Details:
- Metric: ${message.metricName}
- Current Value: ${message.currentValue}
- Threshold: ${message.threshold}

Dashboard:
${message.dashboardLink}

Remediation Steps:
${message.remediationSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

---
This is an automated alert from MACHER Monitoring System.
`.trim();
  }

  /**
   * Get emoji for severity level
   */
  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical':
        return '🚨';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📊';
    }
  }

  /**
   * Get remediation steps based on alarm type
   */
  public static getRemediationSteps(alarmName: string): string[] {
    if (alarmName.includes('Lambda') && alarmName.includes('Errors')) {
      return [
        'Check CloudWatch Logs for the Lambda function to identify error patterns',
        'Review recent code deployments that may have introduced bugs',
        'Verify IAM permissions for the Lambda function',
        'Check if external dependencies (DynamoDB, Transcribe, Bedrock) are available',
        'Consider rolling back to previous version if errors persist',
      ];
    }

    if (alarmName.includes('APIGateway') && alarmName.includes('5xx')) {
      return [
        'Check API Gateway logs for specific error codes',
        'Verify Lambda function health and error rates',
        'Check if backend services are responding correctly',
        'Review API Gateway configuration and integration settings',
        'Monitor for potential DDoS or abuse patterns',
      ];
    }

    if (alarmName.includes('DynamoDB') && alarmName.includes('Throttle')) {
      return [
        'Check DynamoDB table capacity settings',
        'Review read/write patterns for hot partitions',
        'Consider enabling DynamoDB auto-scaling',
        'Optimize queries to reduce capacity consumption',
        'Check if Free Tier limits are being approached',
      ];
    }

    if (alarmName.includes('HighLatency')) {
      return [
        'Check X-Ray traces to identify slow components',
        'Review Lambda function cold start frequency',
        'Verify network connectivity and API Gateway configuration',
        'Check if external services (Transcribe, Bedrock) are slow',
        'Consider optimizing code or increasing Lambda memory',
      ];
    }

    if (alarmName.includes('FreeTier')) {
      return [
        'Review current usage in AWS Cost Explorer',
        'Identify top consumers of the service',
        'Optimize resource usage to stay within Free Tier',
        'Consider implementing rate limiting or throttling',
        'Monitor usage trends to project end-of-month usage',
      ];
    }

    if (alarmName.includes('Security') || alarmName.includes('BruteForce')) {
      return [
        'Review CloudWatch Logs for suspicious activity patterns',
        'Identify source IPs of failed authentication attempts',
        'Consider implementing IP-based rate limiting',
        'Review authentication mechanisms for vulnerabilities',
        'Alert security team if attack is ongoing',
      ];
    }

    // Default remediation steps
    return [
      'Check CloudWatch Dashboard for system overview',
      'Review CloudWatch Logs for error details',
      'Check X-Ray traces for performance bottlenecks',
      'Verify all AWS services are operational',
      'Contact support if issue persists',
    ];
  }

  /**
   * Create notification message from CloudWatch alarm
   */
  public static createNotificationFromAlarm(
    alarmName: string,
    alarmDescription: string,
    metricName: string,
    currentValue: number,
    threshold: number,
    severity: 'critical' | 'warning' | 'info',
    dashboardName: string,
    region: string
  ): NotificationMessage {
    const dashboardLink = `https://console.aws.amazon.com/cloudwatch/home?region=${region}#dashboards:name=${dashboardName}`;
    
    return {
      severity,
      alarmName,
      alarmDescription,
      metricName,
      currentValue,
      threshold,
      timestamp: new Date().toISOString(),
      dashboardLink,
      remediationSteps: SNSNotificationHandler.getRemediationSteps(alarmName),
    };
  }
}
