/**
 * NotificationManager - Handles multi-channel deployment notifications
 * 
 * Sends notifications via Slack and email for deployment events including
 * successes, failures, warnings, and approval requests. Formats messages
 * with deployment metrics and context.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

import { NotificationPayload, MetricsReport, CostReport } from '../types';
import { logger } from '../logger';

/**
 * Email configuration
 */
export interface EmailConfig {
  recipients: string[];
  from: string;
  smtpHost?: string;
  smtpPort?: number;
}

/**
 * Slack message attachment
 */
interface SlackAttachment {
  color: string;
  fields: Array<{
    title: string;
    value: string;
    short: boolean;
  }>;
  footer?: string;
  ts?: number;
}

/**
 * Slack webhook payload
 */
interface SlackWebhookPayload {
  text: string;
  attachments?: SlackAttachment[];
}

/**
 * NotificationManager handles sending deployment notifications via multiple channels
 */
export class NotificationManager {
  /**
   * Send notification via Slack webhook
   * 
   * @param webhook - Slack webhook URL
   * @param payload - Notification payload
   * @returns Promise that resolves when notification is sent
   * 
   * Requirements: 9.4
   */
  async sendSlackNotification(webhook: string, payload: NotificationPayload): Promise<void> {
    try {
      logger.info('Sending Slack notification', {
        type: payload.type,
        environment: payload.environment,
        commitHash: payload.commitHash
      });

      const slackPayload = this.formatSlackMessage(payload);

      const response = await fetch(webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(slackPayload),
      });

      if (!response.ok) {
        throw new Error(`Slack webhook returned ${response.status}: ${response.statusText}`);
      }

      logger.info('Slack notification sent successfully');
    } catch (error) {
      logger.error('Failed to send Slack notification', { error });
      throw error;
    }
  }

  /**
   * Send notification via email
   * 
   * @param config - Email configuration
   * @param payload - Notification payload
   * @returns Promise that resolves when email is sent
   * 
   * Requirements: 9.5
   */
  async sendEmailNotification(config: EmailConfig, payload: NotificationPayload): Promise<void> {
    try {
      logger.info('Sending email notification', {
        type: payload.type,
        environment: payload.environment,
        recipients: config.recipients
      });

      const subject = this.formatEmailSubject(payload);
      const body = this.formatEmailBody(payload);

      // In a real implementation, this would use nodemailer or AWS SES
      // For now, we'll log the email content
      logger.info('Email notification prepared', {
        subject,
        recipients: config.recipients,
        bodyLength: body.length
      });

      // Simulate email sending
      // In production, use nodemailer or AWS SES SDK
      await this.sendEmail(config, subject, body);

      logger.info('Email notification sent successfully');
    } catch (error) {
      logger.error('Failed to send email notification', { error });
      throw error;
    }
  }

  /**
   * Format notification message for display
   * 
   * @param payload - Notification payload
   * @returns Formatted message string
   * 
   * Requirements: 9.1, 9.2, 9.3, 9.6
   */
  formatNotificationMessage(payload: NotificationPayload): string {
    const emoji = this.getEmojiForType(payload.type);
    const timestamp = payload.timestamp.toISOString();
    
    let message = `${emoji} **${this.getTypeLabel(payload.type)}**\n\n`;
    message += `**Environment:** ${payload.environment}\n`;
    message += `**Commit:** ${payload.commitHash.substring(0, 8)}\n`;
    message += `**Time:** ${timestamp}\n`;
    message += `**Priority:** ${payload.priority}\n\n`;
    message += `**Message:** ${payload.message}\n\n`;

    // Add details
    if (Object.keys(payload.details).length > 0) {
      message += `**Details:**\n`;
      for (const [key, value] of Object.entries(payload.details)) {
        message += `  • ${key}: ${JSON.stringify(value)}\n`;
      }
      message += '\n';
    }

    // Add logs URL
    message += `**Logs:** ${payload.logsUrl}\n`;

    return message;
  }

  /**
   * Include deployment metrics in notification payload
   * 
   * @param payload - Base notification payload
   * @param metrics - Metrics report to include
   * @returns Enhanced notification payload with metrics
   * 
   * Requirements: 9.6, 10.6
   */
  includeDeploymentMetrics(
    payload: NotificationPayload,
    metrics: MetricsReport | CostReport
  ): NotificationPayload {
    const enhancedPayload = { ...payload };

    if ('errorRate' in metrics) {
      // MetricsReport
      enhancedPayload.details = {
        ...enhancedPayload.details,
        metrics: {
          errorRate: `${(metrics.errorRate * 100).toFixed(2)}%`,
          latencyP50: `${metrics.latencyP50}ms`,
          latencyP99: `${metrics.latencyP99}ms`,
          requestCount: metrics.requestCount,
          healthy: metrics.healthy
        }
      };
    } else {
      // CostReport
      enhancedPayload.details = {
        ...enhancedPayload.details,
        cost: {
          totalCost: `$${metrics.totalCost.toFixed(2)}`,
          trend: metrics.trend,
          lambdaUsage: `${metrics.freeTierUsage.lambda.percentOfLimit.toFixed(1)}% of Free Tier`,
          dynamoDBUsage: `${metrics.freeTierUsage.dynamodb.percentOfLimit.toFixed(1)}% of Free Tier`,
          apiGatewayUsage: `${metrics.freeTierUsage.apiGateway.percentOfLimit.toFixed(1)}% of Free Tier`
        }
      };
    }

    return enhancedPayload;
  }

  /**
   * Format Slack message from notification payload
   * 
   * @param payload - Notification payload
   * @returns Slack webhook payload
   */
  private formatSlackMessage(payload: NotificationPayload): SlackWebhookPayload {
    const color = this.getColorForType(payload.type);
    const emoji = this.getEmojiForType(payload.type);

    const fields: Array<{ title: string; value: string; short: boolean }> = [
      {
        title: 'Environment',
        value: payload.environment,
        short: true
      },
      {
        title: 'Commit',
        value: payload.commitHash.substring(0, 8),
        short: true
      },
      {
        title: 'Priority',
        value: payload.priority,
        short: true
      },
      {
        title: 'Time',
        value: payload.timestamp.toISOString(),
        short: true
      }
    ];

    // Add details as fields
    for (const [key, value] of Object.entries(payload.details)) {
      fields.push({
        title: key,
        value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value),
        short: false
      });
    }

    // Add logs link
    fields.push({
      title: 'Logs',
      value: `<${payload.logsUrl}|View Logs>`,
      short: false
    });

    return {
      text: `${emoji} *${this.getTypeLabel(payload.type)}*: ${payload.message}`,
      attachments: [
        {
          color,
          fields,
          footer: 'MACHER CI/CD Pipeline',
          ts: Math.floor(payload.timestamp.getTime() / 1000)
        }
      ]
    };
  }

  /**
   * Format email subject line
   * 
   * @param payload - Notification payload
   * @returns Email subject
   */
  private formatEmailSubject(payload: NotificationPayload): string {
    const prefix = this.getTypeLabel(payload.type);
    return `[MACHER ${payload.environment.toUpperCase()}] ${prefix}: ${payload.message}`;
  }

  /**
   * Format email body
   * 
   * @param payload - Notification payload
   * @returns Email body HTML
   */
  private formatEmailBody(payload: NotificationPayload): string {
    const color = this.getColorForType(payload.type);
    
    let html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .header { background-color: ${color}; color: white; padding: 20px; }
    .content { padding: 20px; }
    .details { background-color: #f4f4f4; padding: 15px; margin: 10px 0; border-radius: 5px; }
    .footer { padding: 20px; font-size: 12px; color: #666; border-top: 1px solid #ddd; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px; border-bottom: 1px solid #ddd; }
    td:first-child { font-weight: bold; width: 150px; }
    .button { display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${this.getTypeLabel(payload.type)}</h1>
    <p>${payload.message}</p>
  </div>
  
  <div class="content">
    <h2>Deployment Information</h2>
    <table>
      <tr><td>Environment</td><td>${payload.environment}</td></tr>
      <tr><td>Commit Hash</td><td>${payload.commitHash}</td></tr>
      <tr><td>Timestamp</td><td>${payload.timestamp.toISOString()}</td></tr>
      <tr><td>Priority</td><td>${payload.priority}</td></tr>
    </table>
    
    ${Object.keys(payload.details).length > 0 ? `
    <h2>Details</h2>
    <div class="details">
      <pre>${JSON.stringify(payload.details, null, 2)}</pre>
    </div>
    ` : ''}
    
    <a href="${payload.logsUrl}" class="button">View Logs</a>
  </div>
  
  <div class="footer">
    <p>MACHER CI/CD Pipeline - Automated Deployment Notification</p>
  </div>
</body>
</html>
    `;

    return html;
  }

  /**
   * Send email using configured transport
   * 
   * @param config - Email configuration
   * @param subject - Email subject
   * @param body - Email body HTML
   */
  private async sendEmail(config: EmailConfig, subject: string, body: string): Promise<void> {
    // In production, use nodemailer or AWS SES
    // For now, this is a placeholder that logs the email
    logger.info('Email would be sent', {
      from: config.from,
      to: config.recipients,
      subject,
      bodyLength: body.length
    });

    // Simulate async email sending
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Get color code for notification type
   * 
   * @param type - Notification type
   * @returns Color hex code
   */
  private getColorForType(type: string): string {
    switch (type) {
      case 'success':
        return '#28a745';
      case 'failure':
        return '#dc3545';
      case 'warning':
        return '#ffc107';
      case 'approval_required':
        return '#17a2b8';
      default:
        return '#6c757d';
    }
  }

  /**
   * Get emoji for notification type
   * 
   * @param type - Notification type
   * @returns Emoji character
   */
  private getEmojiForType(type: string): string {
    switch (type) {
      case 'success':
        return '✅';
      case 'failure':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'approval_required':
        return '🔔';
      default:
        return 'ℹ️';
    }
  }

  /**
   * Get human-readable label for notification type
   * 
   * @param type - Notification type
   * @returns Label string
   */
  private getTypeLabel(type: string): string {
    switch (type) {
      case 'success':
        return 'Deployment Successful';
      case 'failure':
        return 'Deployment Failed';
      case 'warning':
        return 'Deployment Warning';
      case 'approval_required':
        return 'Approval Required';
      default:
        return 'Deployment Notification';
    }
  }
}
