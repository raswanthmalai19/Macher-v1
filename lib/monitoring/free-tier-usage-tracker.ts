/**
 * FreeTierUsageTracker - Monitor AWS Free Tier usage and project overages
 * 
 * This class tracks usage across AWS services to ensure VocalShield stays
 * within Free Tier limits. It monitors Lambda, DynamoDB, CloudWatch Logs,
 * CloudWatch Metrics, and API Gateway usage.
 * 
 * Features:
 * - Track current usage against Free Tier limits
 * - Calculate usage percentage for each service
 * - Project end-of-month usage based on current trends
 * - Trigger alarms at 80% and 95% thresholds
 * - Publish usage metrics to CloudWatch
 * 
 * Usage:
 * ```typescript
 * const tracker = new FreeTierUsageTracker();
 * const usage = await tracker.trackLambdaUsage(50000, 100000);
 * const projection = tracker.projectUsage(usage, 15); // 15 days into month
 * ```
 */

import { CloudWatchClient, GetMetricStatisticsCommand, Dimension } from '@aws-sdk/client-cloudwatch';
import { FreeTierUsage, MetricUnit } from './types';
import { logger } from './structured-logger';
import { MetricPublisher } from './metric-publisher';

/**
 * Free Tier limits for AWS services (monthly)
 */
export const FREE_TIER_LIMITS = {
  LAMBDA_INVOCATIONS: 1_000_000, // 1M requests per month
  LAMBDA_COMPUTE_TIME: 400_000, // 400K GB-seconds per month
  DYNAMODB_STORAGE: 25, // 25 GB storage
  DYNAMODB_RCU: 25, // 25 Read Capacity Units
  DYNAMODB_WCU: 25, // 25 Write Capacity Units
  CLOUDWATCH_LOGS: 5, // 5 GB ingestion per month
  CLOUDWATCH_METRICS: 10, // 10 custom metrics
  API_GATEWAY_REQUESTS: 1_000_000, // 1M requests per month
} as const;

/**
 * Configuration for FreeTierUsageTracker
 */
export interface FreeTierUsageTrackerConfig {
  region?: string;
  metricPublisher?: MetricPublisher;
  alarmThresholds?: {
    warning: number; // Default: 80%
    critical: number; // Default: 95%
  };
}

/**
 * Usage data for a specific service
 */
export interface ServiceUsageData {
  service: string;
  metric: string;
  currentUsage: number;
  limit: number;
  timestamp: Date;
}

/**
 * FreeTierUsageTracker class
 */
export class FreeTierUsageTracker {
  private readonly client: CloudWatchClient;
  private readonly metricPublisher: MetricPublisher;
  private readonly warningThreshold: number;
  private readonly criticalThreshold: number;

  constructor(config: FreeTierUsageTrackerConfig = {}) {
    this.client = new CloudWatchClient({ 
      region: config.region || process.env.AWS_REGION || 'us-east-1' 
    });
    this.metricPublisher = config.metricPublisher || new MetricPublisher();
    this.warningThreshold = config.alarmThresholds?.warning || 80;
    this.criticalThreshold = config.alarmThresholds?.critical || 95;
  }

  /**
   * Track Lambda invocation usage
   */
  public async trackLambdaInvocations(
    currentInvocations: number,
    timestamp?: Date
  ): Promise<FreeTierUsage> {
    const usage = this.calculateUsage(
      'Lambda',
      'Invocations',
      currentInvocations,
      FREE_TIER_LIMITS.LAMBDA_INVOCATIONS,
      timestamp
    );

    await this.publishUsageMetric(usage);
    await this.checkThresholds(usage);

    return usage;
  }

  /**
   * Track Lambda compute time usage (GB-seconds)
   */
  public async trackLambdaComputeTime(
    currentGBSeconds: number,
    timestamp?: Date
  ): Promise<FreeTierUsage> {
    const usage = this.calculateUsage(
      'Lambda',
      'ComputeTime',
      currentGBSeconds,
      FREE_TIER_LIMITS.LAMBDA_COMPUTE_TIME,
      timestamp
    );

    await this.publishUsageMetric(usage);
    await this.checkThresholds(usage);

    return usage;
  }

  /**
   * Track DynamoDB storage usage
   */
  public async trackDynamoDBStorage(
    currentStorageGB: number,
    timestamp?: Date
  ): Promise<FreeTierUsage> {
    const usage = this.calculateUsage(
      'DynamoDB',
      'Storage',
      currentStorageGB,
      FREE_TIER_LIMITS.DYNAMODB_STORAGE,
      timestamp
    );

    await this.publishUsageMetric(usage);
    await this.checkThresholds(usage);

    return usage;
  }

  /**
   * Track DynamoDB read capacity usage
   */
  public async trackDynamoDBReadCapacity(
    currentRCU: number,
    timestamp?: Date
  ): Promise<FreeTierUsage> {
    const usage = this.calculateUsage(
      'DynamoDB',
      'ReadCapacity',
      currentRCU,
      FREE_TIER_LIMITS.DYNAMODB_RCU,
      timestamp
    );

    await this.publishUsageMetric(usage);
    await this.checkThresholds(usage);

    return usage;
  }

  /**
   * Track DynamoDB write capacity usage
   */
  public async trackDynamoDBWriteCapacity(
    currentWCU: number,
    timestamp?: Date
  ): Promise<FreeTierUsage> {
    const usage = this.calculateUsage(
      'DynamoDB',
      'WriteCapacity',
      currentWCU,
      FREE_TIER_LIMITS.DYNAMODB_WCU,
      timestamp
    );

    await this.publishUsageMetric(usage);
    await this.checkThresholds(usage);

    return usage;
  }

  /**
   * Track CloudWatch Logs ingestion usage
   */
  public async trackCloudWatchLogs(
    currentIngestionGB: number,
    timestamp?: Date
  ): Promise<FreeTierUsage> {
    const usage = this.calculateUsage(
      'CloudWatch',
      'LogsIngestion',
      currentIngestionGB,
      FREE_TIER_LIMITS.CLOUDWATCH_LOGS,
      timestamp
    );

    await this.publishUsageMetric(usage);
    await this.checkThresholds(usage);

    return usage;
  }

  /**
   * Track CloudWatch custom metrics count
   */
  public async trackCloudWatchMetrics(
    currentMetricCount: number,
    timestamp?: Date
  ): Promise<FreeTierUsage> {
    const usage = this.calculateUsage(
      'CloudWatch',
      'CustomMetrics',
      currentMetricCount,
      FREE_TIER_LIMITS.CLOUDWATCH_METRICS,
      timestamp
    );

    await this.publishUsageMetric(usage);
    await this.checkThresholds(usage);

    return usage;
  }

  /**
   * Track API Gateway request usage
   */
  public async trackAPIGatewayRequests(
    currentRequests: number,
    timestamp?: Date
  ): Promise<FreeTierUsage> {
    const usage = this.calculateUsage(
      'APIGateway',
      'Requests',
      currentRequests,
      FREE_TIER_LIMITS.API_GATEWAY_REQUESTS,
      timestamp
    );

    await this.publishUsageMetric(usage);
    await this.checkThresholds(usage);

    return usage;
  }

  /**
   * Calculate usage percentage for a service
   */
  public calculateUsagePercentage(
    service: string,
    currentUsage: number,
    limit: number
  ): number {
    if (limit <= 0) {
      logger.warn('Invalid limit for usage calculation', {
        component: 'FreeTierUsageTracker',
        metadata: { service, limit },
      });
      return 0;
    }

    const percentage = (currentUsage / limit) * 100;
    return Math.max(0, percentage); // Ensure non-negative
  }

  /**
   * Calculate usage data
   */
  private calculateUsage(
    service: string,
    metric: string,
    currentUsage: number,
    limit: number,
    timestamp?: Date
  ): FreeTierUsage {
    const usagePercentage = this.calculateUsagePercentage(service, currentUsage, limit);

    return {
      service,
      metric,
      limit,
      currentUsage,
      usagePercentage,
      period: 'monthly',
      lastUpdated: timestamp || new Date(),
    };
  }

  /**
   * Project usage at end of month based on current trends
   */
  public projectUsage(
    usage: FreeTierUsage,
    currentDayOfMonth: number
  ): FreeTierUsage {
    if (currentDayOfMonth <= 0 || currentDayOfMonth > 31) {
      logger.warn('Invalid day of month for projection', {
        component: 'FreeTierUsageTracker',
        metadata: { currentDayOfMonth },
      });
      return usage;
    }

    // Calculate daily usage rate
    const dailyUsageRate = usage.currentUsage / currentDayOfMonth;

    // Assume 30-day month for projection
    const daysInMonth = 30;
    const projectedUsage = dailyUsageRate * daysInMonth;

    // Calculate days until overage (if projected to exceed)
    let daysUntilOverage: number | undefined;
    if (projectedUsage > usage.limit) {
      const remainingCapacity = usage.limit - usage.currentUsage;
      if (remainingCapacity > 0 && dailyUsageRate > 0) {
        daysUntilOverage = Math.floor(remainingCapacity / dailyUsageRate);
      } else {
        daysUntilOverage = 0; // Already over or will be immediately
      }
    }

    return {
      ...usage,
      projectedUsage,
      daysUntilOverage,
    };
  }

  /**
   * Check if usage exceeds alarm thresholds
   */
  private async checkThresholds(usage: FreeTierUsage): Promise<void> {
    if (usage.usagePercentage >= this.criticalThreshold) {
      logger.error('Critical Free Tier usage threshold exceeded', new Error('Free Tier limit critical'), {
        component: 'FreeTierUsageTracker',
        metadata: {
          service: usage.service,
          metric: usage.metric,
          usagePercentage: usage.usagePercentage,
          threshold: this.criticalThreshold,
          currentUsage: usage.currentUsage,
          limit: usage.limit,
        },
      });
    } else if (usage.usagePercentage >= this.warningThreshold) {
      logger.warn('Warning Free Tier usage threshold exceeded', {
        component: 'FreeTierUsageTracker',
        metadata: {
          service: usage.service,
          metric: usage.metric,
          usagePercentage: usage.usagePercentage,
          threshold: this.warningThreshold,
          currentUsage: usage.currentUsage,
          limit: usage.limit,
        },
      });
    }
  }

  /**
   * Publish usage metric to CloudWatch
   */
  private async publishUsageMetric(usage: FreeTierUsage): Promise<void> {
    try {
      await this.metricPublisher.publishMetric(
        'VocalShield/FreeTier',
        'UsagePercentage',
        usage.usagePercentage,
        MetricUnit.Percent,
        {
          Service: usage.service,
          Metric: usage.metric,
        },
        usage.lastUpdated
      );

      logger.info('Free Tier usage metric published', {
        component: 'FreeTierUsageTracker',
        metadata: {
          service: usage.service,
          metric: usage.metric,
          usagePercentage: usage.usagePercentage,
        },
      });
    } catch (error) {
      logger.error('Failed to publish Free Tier usage metric', error as Error, {
        component: 'FreeTierUsageTracker',
        metadata: {
          service: usage.service,
          metric: usage.metric,
        },
      });
    }
  }

  /**
   * Get all Free Tier usage data
   */
  public async getAllUsage(): Promise<FreeTierUsage[]> {
    // This would typically query CloudWatch for current usage
    // For now, return empty array as placeholder
    logger.info('Getting all Free Tier usage data', {
      component: 'FreeTierUsageTracker',
    });

    return [];
  }

  /**
   * Check if any service is projected to exceed Free Tier within specified days
   */
  public async checkProjectedOverage(
    usage: FreeTierUsage,
    currentDayOfMonth: number,
    daysThreshold: number = 7
  ): Promise<boolean> {
    const projected = this.projectUsage(usage, currentDayOfMonth);

    if (projected.daysUntilOverage !== undefined && projected.daysUntilOverage <= daysThreshold) {
      logger.warn('Free Tier overage projected within threshold', {
        component: 'FreeTierUsageTracker',
        metadata: {
          service: usage.service,
          metric: usage.metric,
          daysUntilOverage: projected.daysUntilOverage,
          daysThreshold,
          projectedUsage: projected.projectedUsage,
          limit: usage.limit,
        },
      });

      return true;
    }

    return false;
  }
}

/**
 * Create a singleton instance for convenience
 */
export const freeTierUsageTracker = new FreeTierUsageTracker();
