/**
 * CanarySuccessTracker - Track and publish canary success rates
 * 
 * This class calculates success rates and availability percentages from
 * canary execution results and publishes them as CloudWatch metrics.
 */

import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
  Statistic,
} from '@aws-sdk/client-cloudwatch';
import { MetricPublisher } from './metric-publisher';
import { MetricUnit } from './types';
import { logger } from './structured-logger';

/**
 * Configuration for CanarySuccessTracker
 */
export interface CanarySuccessTrackerConfig {
  region?: string;
  metricPublisher?: MetricPublisher;
}

/**
 * Canary execution result
 */
export interface CanaryExecutionResult {
  canaryName: string;
  timestamp: Date;
  success: boolean;
  duration: number;
  errorMessage?: string;
}

/**
 * Canary success rate statistics
 */
export interface CanarySuccessRate {
  canaryName: string;
  successCount: number;
  failureCount: number;
  totalExecutions: number;
  successRate: number;
  availabilityPercentage: number;
  period: {
    startTime: Date;
    endTime: Date;
  };
}

/**
 * CanarySuccessTracker class
 */
export class CanarySuccessTracker {
  private readonly client: CloudWatchClient;
  private readonly metricPublisher: MetricPublisher;

  constructor(config: CanarySuccessTrackerConfig = {}) {
    this.client = new CloudWatchClient({
      region: config.region || process.env.AWS_REGION || 'us-east-1',
    });
    this.metricPublisher = config.metricPublisher || new MetricPublisher();
  }

  /**
   * Calculate success rate from canary execution results
   */
  public calculateSuccessRate(
    canaryName: string,
    results: CanaryExecutionResult[]
  ): CanarySuccessRate {
    if (results.length === 0) {
      return {
        canaryName,
        successCount: 0,
        failureCount: 0,
        totalExecutions: 0,
        successRate: 0,
        availabilityPercentage: 0,
        period: {
          startTime: new Date(),
          endTime: new Date(),
        },
      };
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;
    const totalExecutions = results.length;
    const successRate = (successCount / totalExecutions) * 100;

    // Calculate availability percentage (uptime)
    // Availability = (total time - downtime) / total time * 100
    const sortedResults = [...results].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
    
    const startTime = sortedResults[0].timestamp;
    const endTime = sortedResults[sortedResults.length - 1].timestamp;
    const totalTime = endTime.getTime() - startTime.getTime();

    // Calculate downtime (time between failure and next success)
    let downtime = 0;
    for (let i = 0; i < sortedResults.length - 1; i++) {
      if (!sortedResults[i].success) {
        const nextSuccess = sortedResults
          .slice(i + 1)
          .find((r) => r.success);
        
        if (nextSuccess) {
          downtime += nextSuccess.timestamp.getTime() - sortedResults[i].timestamp.getTime();
        } else {
          // If no next success, count until end
          downtime += endTime.getTime() - sortedResults[i].timestamp.getTime();
        }
      }
    }

    const availabilityPercentage = totalTime > 0
      ? ((totalTime - downtime) / totalTime) * 100
      : 0;

    return {
      canaryName,
      successCount,
      failureCount,
      totalExecutions,
      successRate,
      availabilityPercentage,
      period: {
        startTime,
        endTime,
      },
    };
  }

  /**
   * Fetch canary metrics from CloudWatch and calculate success rate
   */
  public async fetchAndCalculateSuccessRate(
    canaryName: string,
    startTime: Date,
    endTime: Date
  ): Promise<CanarySuccessRate> {
    logger.info('Fetching canary metrics', {
      component: 'CanarySuccessTracker',
      metadata: {
        canaryName,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
    });

    // Fetch success count
    const successCommand = new GetMetricStatisticsCommand({
      Namespace: 'CloudWatchSynthetics',
      MetricName: 'SuccessPercent',
      Dimensions: [
        {
          Name: 'CanaryName',
          Value: canaryName,
        },
      ],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300, // 5 minutes
      Statistics: [Statistic.Average],
    });

    const successResponse = await this.client.send(successCommand);
    const datapoints = successResponse.Datapoints || [];

    // Calculate overall success rate
    const totalDatapoints = datapoints.length;
    const avgSuccessPercent = totalDatapoints > 0
      ? datapoints.reduce((sum, dp) => sum + (dp.Average || 0), 0) / totalDatapoints
      : 0;

    // Estimate success/failure counts
    const successCount = Math.round((avgSuccessPercent / 100) * totalDatapoints);
    const failureCount = totalDatapoints - successCount;

    return {
      canaryName,
      successCount,
      failureCount,
      totalExecutions: totalDatapoints,
      successRate: avgSuccessPercent,
      availabilityPercentage: avgSuccessPercent, // Approximation
      period: {
        startTime,
        endTime,
      },
    };
  }

  /**
   * Publish canary success rate metrics
   */
  public async publishSuccessRateMetrics(
    successRate: CanarySuccessRate
  ): Promise<void> {
    logger.info('Publishing canary success rate metrics', {
      component: 'CanarySuccessTracker',
      metadata: {
        canaryName: successRate.canaryName,
        successRate: successRate.successRate,
        availabilityPercentage: successRate.availabilityPercentage,
      },
    });

    // Publish success rate
    await this.metricPublisher.publishMetric(
      'MACHER/Canaries',
      'SuccessRate',
      successRate.successRate,
      MetricUnit.Percent,
      { CanaryName: successRate.canaryName }
    );

    // Publish availability percentage
    await this.metricPublisher.publishMetric(
      'MACHER/Canaries',
      'Availability',
      successRate.availabilityPercentage,
      MetricUnit.Percent,
      { CanaryName: successRate.canaryName }
    );

    // Publish execution counts
    await this.metricPublisher.publishMetric(
      'MACHER/Canaries',
      'TotalExecutions',
      successRate.totalExecutions,
      MetricUnit.Count,
      { CanaryName: successRate.canaryName }
    );

    await this.metricPublisher.publishMetric(
      'MACHER/Canaries',
      'FailureCount',
      successRate.failureCount,
      MetricUnit.Count,
      { CanaryName: successRate.canaryName }
    );

    // Flush metrics
    await this.metricPublisher.flush('MACHER/Canaries');
  }

  /**
   * Track canary execution result
   */
  public async trackExecution(result: CanaryExecutionResult): Promise<void> {
    logger.info('Tracking canary execution', {
      component: 'CanarySuccessTracker',
      metadata: {
        canaryName: result.canaryName,
        success: result.success,
        duration: result.duration,
      },
    });

    // Publish execution result
    await this.metricPublisher.publishMetric(
      'MACHER/Canaries',
      'ExecutionResult',
      result.success ? 1 : 0,
      MetricUnit.Count,
      { CanaryName: result.canaryName }
    );

    // Publish duration
    await this.metricPublisher.publishMetric(
      'MACHER/Canaries',
      'ExecutionDuration',
      result.duration,
      MetricUnit.Milliseconds,
      { CanaryName: result.canaryName }
    );

    // Log failure details
    if (!result.success && result.errorMessage) {
      logger.error('Canary execution failed', new Error(result.errorMessage), {
        component: 'CanarySuccessTracker',
        metadata: {
          canaryName: result.canaryName,
          duration: result.duration,
        },
      });
    }

    await this.metricPublisher.flush('MACHER/Canaries');
  }
}

/**
 * Create a singleton instance for convenience
 */
export const canarySuccessTracker = new CanarySuccessTracker();
