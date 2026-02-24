/**
 * MetricPublisher - Emit custom metrics to CloudWatch
 * 
 * This class handles publishing custom metrics to CloudWatch while staying
 * within AWS Free Tier limits (10 custom metrics).
 * 
 * Features:
 * - Batching (max 20 metrics per API call)
 * - Exponential backoff for throttling
 * - Custom metric limit enforcement
 * - Dimension-based metric multiplexing
 * 
 * Usage:
 * ```typescript
 * const publisher = new MetricPublisher({ region: 'us-east-1' });
 * await publisher.publishMetric('VocalShield/Performance', 'Latency', 150, MetricUnit.Milliseconds, { Endpoint: '/analyze' });
 * await publisher.publishBusinessKPI('FraudDetectionRate', 0.85, { Environment: 'Production' });
 * ```
 */

import { CloudWatchClient, PutMetricDataCommand, MetricDatum } from '@aws-sdk/client-cloudwatch';
import { MetricUnit } from './types';
import { logger } from './structured-logger';

/**
 * Configuration for MetricPublisher
 */
export interface MetricPublisherConfig {
  region?: string;
  maxCustomMetrics?: number;
  batchSize?: number;
  maxRetries?: number;
}

/**
 * MetricPublisher class for CloudWatch metrics
 */
export class MetricPublisher {
  private readonly client: CloudWatchClient;
  private readonly maxCustomMetrics: number;
  private readonly batchSize: number;
  private readonly maxRetries: number;
  private readonly metricBatch: MetricDatum[] = [];
  private readonly uniqueMetrics: Set<string> = new Set();

  constructor(config: MetricPublisherConfig = {}) {
    this.client = new CloudWatchClient({ region: config.region || process.env.AWS_REGION || 'us-east-1' });
    this.maxCustomMetrics = config.maxCustomMetrics || 10; // Free Tier limit
    this.batchSize = config.batchSize || 20; // CloudWatch API limit
    this.maxRetries = config.maxRetries || 3;
  }

  /**
   * Publish a custom metric to CloudWatch
   */
  public async publishMetric(
    namespace: string,
    metricName: string,
    value: number,
    unit: MetricUnit,
    dimensions: Record<string, string>,
    timestamp?: Date
  ): Promise<void> {
    // Track unique metrics for Free Tier compliance
    const metricKey = this.getMetricKey(namespace, metricName);
    
    if (!this.uniqueMetrics.has(metricKey)) {
      if (this.uniqueMetrics.size >= this.maxCustomMetrics) {
        logger.warn('Custom metric limit reached, metric not published', {
          component: 'MetricPublisher',
          metadata: {
            namespace,
            metricName,
            limit: this.maxCustomMetrics,
          },
        });
        return;
      }
      this.uniqueMetrics.add(metricKey);
    }

    // Create metric datum
    const metricDatum: MetricDatum = {
      MetricName: metricName,
      Value: value,
      Unit: unit,
      Timestamp: timestamp || new Date(),
      Dimensions: Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value })),
    };

    // Add to batch
    this.metricBatch.push(metricDatum);

    // Flush if batch is full
    if (this.metricBatch.length >= this.batchSize) {
      await this.flush(namespace);
    }
  }

  /**
   * Publish a business KPI metric
   */
  public async publishBusinessKPI(
    kpiName: string,
    value: number,
    dimensions: Record<string, string>
  ): Promise<void> {
    await this.publishMetric(
      'VocalShield/BusinessKPIs',
      kpiName,
      value,
      MetricUnit.Count,
      dimensions
    );
  }

  /**
   * Flush pending metrics to CloudWatch
   */
  public async flush(namespace: string): Promise<void> {
    if (this.metricBatch.length === 0) {
      return;
    }

    const metricsToSend = this.metricBatch.splice(0, this.batchSize);
    
    try {
      await this.sendMetricsWithRetry(namespace, metricsToSend);
      
      logger.info('Metrics published successfully', {
        component: 'MetricPublisher',
        metadata: {
          namespace,
          count: metricsToSend.length,
        },
      });
    } catch (error) {
      logger.error('Failed to publish metrics', error as Error, {
        component: 'MetricPublisher',
        metadata: {
          namespace,
          count: metricsToSend.length,
        },
      });
      
      // Re-add failed metrics to batch for potential retry
      this.metricBatch.unshift(...metricsToSend);
    }
  }

  /**
   * Send metrics with exponential backoff retry
   */
  private async sendMetricsWithRetry(
    namespace: string,
    metrics: MetricDatum[],
    attempt: number = 1
  ): Promise<void> {
    try {
      const command = new PutMetricDataCommand({
        Namespace: namespace,
        MetricData: metrics,
      });

      await this.client.send(command);
    } catch (error) {
      if (attempt >= this.maxRetries) {
        throw error;
      }

      // Check if error is throttling
      const errorName = (error as Error).name;
      if (errorName === 'ThrottlingException' || errorName === 'TooManyRequestsException') {
        // Exponential backoff with jitter
        const delay = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 1000, 5000);
        
        logger.warn('CloudWatch API throttled, retrying', {
          component: 'MetricPublisher',
          metadata: {
            attempt,
            delay,
          },
        });

        await this.sleep(delay);
        return this.sendMetricsWithRetry(namespace, metrics, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Get unique metric key for tracking
   */
  private getMetricKey(namespace: string, metricName: string): string {
    return `${namespace}/${metricName}`;
  }

  /**
   * Get count of unique custom metrics
   */
  public getUniqueMetricCount(): number {
    return this.uniqueMetrics.size;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup and flush remaining metrics
   */
  public async close(): Promise<void> {
    // Flush any remaining metrics
    if (this.metricBatch.length > 0) {
      // Group by namespace (assume all are same namespace for simplicity)
      await this.flush('VocalShield');
    }
  }
}

/**
 * Create a singleton metric publisher instance for convenience
 */
export const metricPublisher = new MetricPublisher();
