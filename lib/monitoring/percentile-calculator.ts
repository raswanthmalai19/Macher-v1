/**
 * PercentileCalculator - Calculate percentile latency metrics
 * 
 * This class efficiently calculates P50, P90, and P99 latency percentiles
 * for API Gateway endpoints and publishes them to CloudWatch every minute.
 * 
 * Features:
 * - Efficient percentile calculation using quickselect algorithm
 * - Support for P50, P90, P99 percentiles
 * - Automatic metric publishing to CloudWatch
 * - Dimension-based metric organization by endpoint
 * 
 * Usage:
 * ```typescript
 * const calculator = new PercentileCalculator();
 * const p99 = calculator.calculate([100, 200, 300, 400, 500], 99);
 * await calculator.publishPercentileMetrics('/analyze', [150, 200, 250, 300]);
 * ```
 */

import { MetricPublisher } from './metric-publisher';
import { MetricUnit } from './types';
import { logger } from './structured-logger';

/**
 * Configuration for PercentileCalculator
 */
export interface PercentileCalculatorConfig {
  metricPublisher?: MetricPublisher;
  namespace?: string;
  publishInterval?: number; // milliseconds
}

/**
 * PercentileCalculator class for latency metrics
 */
export class PercentileCalculator {
  private readonly metricPublisher: MetricPublisher;
  private readonly namespace: string;
  private readonly publishInterval: number;
  private latencyBuffers: Map<string, number[]> = new Map();
  private publishTimer?: NodeJS.Timeout;

  constructor(config: PercentileCalculatorConfig = {}) {
    this.metricPublisher = config.metricPublisher || new MetricPublisher();
    this.namespace = config.namespace || 'VocalShield/Performance';
    this.publishInterval = config.publishInterval || 60000; // 1 minute default
  }

  /**
   * Calculate percentile value from an array of latencies
   * 
   * Uses an efficient algorithm:
   * - For small arrays (<100): Sort and index
   * - For large arrays: Quickselect algorithm (O(n) average case)
   * 
   * @param latencies Array of latency values in milliseconds
   * @param percentile Percentile to calculate (50, 90, 99)
   * @returns Percentile value
   */
  public calculate(latencies: number[], percentile: number): number {
    if (latencies.length === 0) {
      throw new Error('Cannot calculate percentile of empty array');
    }

    if (percentile < 0 || percentile > 100) {
      throw new Error('Percentile must be between 0 and 100');
    }

    // For small arrays, sorting is efficient enough
    if (latencies.length < 100) {
      return this.calculateWithSort(latencies, percentile);
    }

    // For larger arrays, use quickselect for better performance
    return this.calculateWithQuickselect(latencies, percentile);
  }

  /**
   * Calculate percentile using sorting (simple, efficient for small arrays)
   */
  private calculateWithSort(latencies: number[], percentile: number): number {
    const sorted = [...latencies].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Calculate percentile using quickselect algorithm (efficient for large arrays)
   * 
   * Quickselect is an O(n) average case algorithm for finding the k-th smallest element.
   * This is more efficient than sorting (O(n log n)) for large datasets.
   */
  private calculateWithQuickselect(latencies: number[], percentile: number): number {
    const arr = [...latencies]; // Copy to avoid modifying original
    const index = Math.ceil((percentile / 100) * arr.length) - 1;
    const k = Math.max(0, index);
    
    return this.quickselect(arr, 0, arr.length - 1, k);
  }

  /**
   * Quickselect algorithm implementation
   * 
   * @param arr Array to search
   * @param left Left boundary
   * @param right Right boundary
   * @param k Index of element to find
   * @returns k-th smallest element
   */
  private quickselect(arr: number[], left: number, right: number, k: number): number {
    if (left === right) {
      return arr[left];
    }

    // Use median-of-three pivot selection for better performance
    const pivotIndex = this.medianOfThree(arr, left, right);
    const partitionIndex = this.partition(arr, left, right, pivotIndex);

    if (k === partitionIndex) {
      return arr[k];
    } else if (k < partitionIndex) {
      return this.quickselect(arr, left, partitionIndex - 1, k);
    } else {
      return this.quickselect(arr, partitionIndex + 1, right, k);
    }
  }

  /**
   * Partition array around pivot (used by quickselect)
   */
  private partition(arr: number[], left: number, right: number, pivotIndex: number): number {
    const pivotValue = arr[pivotIndex];
    
    // Move pivot to end
    [arr[pivotIndex], arr[right]] = [arr[right], arr[pivotIndex]];
    
    let storeIndex = left;
    for (let i = left; i < right; i++) {
      if (arr[i] < pivotValue) {
        [arr[i], arr[storeIndex]] = [arr[storeIndex], arr[i]];
        storeIndex++;
      }
    }
    
    // Move pivot to final position
    [arr[storeIndex], arr[right]] = [arr[right], arr[storeIndex]];
    
    return storeIndex;
  }

  /**
   * Select median of three values as pivot (improves quickselect performance)
   */
  private medianOfThree(arr: number[], left: number, right: number): number {
    const mid = Math.floor((left + right) / 2);
    
    if (arr[left] > arr[mid]) {
      [arr[left], arr[mid]] = [arr[mid], arr[left]];
    }
    if (arr[left] > arr[right]) {
      [arr[left], arr[right]] = [arr[right], arr[left]];
    }
    if (arr[mid] > arr[right]) {
      [arr[mid], arr[right]] = [arr[right], arr[mid]];
    }
    
    return mid;
  }

  /**
   * Record a latency measurement for an endpoint
   * 
   * @param endpoint API endpoint (e.g., '/analyze', '/connect')
   * @param latency Latency in milliseconds
   */
  public recordLatency(endpoint: string, latency: number): void {
    if (!this.latencyBuffers.has(endpoint)) {
      this.latencyBuffers.set(endpoint, []);
    }
    
    this.latencyBuffers.get(endpoint)!.push(latency);
  }

  /**
   * Publish percentile metrics for an endpoint
   * 
   * Calculates and publishes P50, P90, and P99 metrics to CloudWatch
   * 
   * @param endpoint API endpoint
   * @param latencies Array of latency measurements
   */
  public async publishPercentileMetrics(endpoint: string, latencies: number[]): Promise<void> {
    if (latencies.length === 0) {
      logger.warn('No latencies to publish', {
        component: 'PercentileCalculator',
        metadata: { endpoint },
      });
      return;
    }

    try {
      // Calculate percentiles
      const p50 = this.calculate(latencies, 50);
      const p90 = this.calculate(latencies, 90);
      const p99 = this.calculate(latencies, 99);

      const dimensions = { Endpoint: endpoint };
      const timestamp = new Date();

      // Publish P50
      await this.metricPublisher.publishMetric(
        this.namespace,
        'P50Latency',
        p50,
        MetricUnit.Milliseconds,
        dimensions,
        timestamp
      );

      // Publish P90
      await this.metricPublisher.publishMetric(
        this.namespace,
        'P90Latency',
        p90,
        MetricUnit.Milliseconds,
        dimensions,
        timestamp
      );

      // Publish P99
      await this.metricPublisher.publishMetric(
        this.namespace,
        'P99Latency',
        p99,
        MetricUnit.Milliseconds,
        dimensions,
        timestamp
      );

      // Flush metrics to CloudWatch
      await this.metricPublisher.flush(this.namespace);

      logger.info('Percentile metrics published', {
        component: 'PercentileCalculator',
        metadata: {
          endpoint,
          p50,
          p90,
          p99,
          sampleCount: latencies.length,
        },
      });
    } catch (error) {
      logger.error('Failed to publish percentile metrics', error as Error, {
        component: 'PercentileCalculator',
        metadata: {
          endpoint,
          sampleCount: latencies.length,
        },
      });
    }
  }

  /**
   * Start automatic publishing of percentile metrics every minute
   */
  public startAutoPublish(): void {
    if (this.publishTimer) {
      logger.warn('Auto-publish already started', {
        component: 'PercentileCalculator',
      });
      return;
    }

    this.publishTimer = setInterval(async () => {
      await this.publishAllMetrics();
    }, this.publishInterval);

    logger.info('Auto-publish started', {
      component: 'PercentileCalculator',
      metadata: {
        intervalMs: this.publishInterval,
      },
    });
  }

  /**
   * Stop automatic publishing
   */
  public stopAutoPublish(): void {
    if (this.publishTimer) {
      clearInterval(this.publishTimer);
      this.publishTimer = undefined;
      
      logger.info('Auto-publish stopped', {
        component: 'PercentileCalculator',
      });
    }
  }

  /**
   * Publish metrics for all endpoints and clear buffers
   */
  public async publishAllMetrics(): Promise<void> {
    const endpoints = Array.from(this.latencyBuffers.keys());
    
    for (const endpoint of endpoints) {
      const latencies = this.latencyBuffers.get(endpoint)!;
      
      if (latencies.length > 0) {
        await this.publishPercentileMetrics(endpoint, latencies);
      }
    }
    
    // Clear buffers after publishing
    this.latencyBuffers.clear();
  }

  /**
   * Get current buffer statistics (for testing/debugging)
   */
  public getBufferStats(): Map<string, number> {
    const stats = new Map<string, number>();
    
    for (const [endpoint, latencies] of this.latencyBuffers.entries()) {
      stats.set(endpoint, latencies.length);
    }
    
    return stats;
  }

  /**
   * Cleanup and publish remaining metrics
   */
  public async close(): Promise<void> {
    this.stopAutoPublish();
    await this.publishAllMetrics();
  }
}

/**
 * Create a singleton percentile calculator instance for convenience
 */
export const percentileCalculator = new PercentileCalculator();
