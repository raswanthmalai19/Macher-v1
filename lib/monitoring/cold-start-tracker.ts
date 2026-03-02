/**
 * ColdStartTracker - Track Lambda function cold starts
 * 
 * This class detects Lambda cold starts and publishes metrics about their
 * frequency and duration to CloudWatch. Cold starts occur when Lambda
 * initializes a new execution environment.
 * 
 * Features:
 * - Automatic cold start detection using initialization markers
 * - Duration tracking from initialization to first invocation
 * - CloudWatch metric publishing
 * - Per-function tracking with dimensions
 * 
 * Usage:
 * ```typescript
 * // At module level (outside handler)
 * const coldStartTracker = new ColdStartTracker();
 * 
 * // In Lambda handler
 * export const handler = async (event: any) => {
 *   await coldStartTracker.trackInvocation('MyFunction');
 *   // ... rest of handler logic
 * };
 * ```
 */

import { MetricPublisher } from './metric-publisher';
import { MetricUnit } from './types';
import { logger } from './structured-logger';

/**
 * Configuration for ColdStartTracker
 */
export interface ColdStartTrackerConfig {
  metricPublisher?: MetricPublisher;
  namespace?: string;
}

/**
 * Cold start information
 */
export interface ColdStartInfo {
  isColdStart: boolean;
  duration?: number; // milliseconds
  timestamp: Date;
}

/**
 * ColdStartTracker class for Lambda cold start monitoring
 */
export class ColdStartTracker {
  private readonly metricPublisher: MetricPublisher;
  private readonly namespace: string;
  private readonly initializationTime: number;
  private isInitialized: boolean = false;
  private invocationCount: number = 0;

  constructor(config: ColdStartTrackerConfig = {}) {
    this.metricPublisher = config.metricPublisher || new MetricPublisher();
    this.namespace = config.namespace || 'MACHER/Performance';
    
    // Record initialization time (module load time)
    this.initializationTime = Date.now();
    
    logger.info('ColdStartTracker initialized', {
      component: 'ColdStartTracker',
      metadata: {
        initializationTime: this.initializationTime,
      },
    });
  }

  /**
   * Track a Lambda function invocation and detect cold starts
   * 
   * This method should be called at the beginning of every Lambda handler.
   * It detects cold starts by checking if this is the first invocation
   * in the current execution environment.
   * 
   * @param functionName Name of the Lambda function
   * @returns Cold start information
   */
  public async trackInvocation(functionName: string): Promise<ColdStartInfo> {
    this.invocationCount++;
    
    // First invocation in this execution environment = cold start
    const isColdStart = !this.isInitialized;
    
    if (isColdStart) {
      // Calculate cold start duration (time from initialization to first invocation)
      const duration = Date.now() - this.initializationTime;
      
      // Mark as initialized
      this.isInitialized = true;
      
      // Publish cold start metrics
      await this.publishColdStartMetrics(functionName, duration);
      
      logger.info('Cold start detected', {
        component: 'ColdStartTracker',
        metadata: {
          functionName,
          duration,
          invocationCount: this.invocationCount,
        },
      });
      
      return {
        isColdStart: true,
        duration,
        timestamp: new Date(),
      };
    }
    
    // Warm start - no metrics to publish
    logger.info('Warm start', {
      component: 'ColdStartTracker',
      metadata: {
        functionName,
        invocationCount: this.invocationCount,
      },
    });
    
    return {
      isColdStart: false,
      timestamp: new Date(),
    };
  }

  /**
   * Publish cold start metrics to CloudWatch
   * 
   * Publishes two metrics:
   * 1. ColdStartOccurrence (Count) - Indicates a cold start happened
   * 2. ColdStartDuration (Milliseconds) - Duration of the cold start
   * 
   * @param functionName Name of the Lambda function
   * @param duration Cold start duration in milliseconds
   */
  private async publishColdStartMetrics(functionName: string, duration: number): Promise<void> {
    const dimensions = { FunctionName: functionName };
    const timestamp = new Date();

    try {
      // Publish cold start occurrence metric
      await this.metricPublisher.publishMetric(
        this.namespace,
        'ColdStartOccurrence',
        1,
        MetricUnit.Count,
        dimensions,
        timestamp
      );

      // Publish cold start duration metric
      await this.metricPublisher.publishMetric(
        this.namespace,
        'ColdStartDuration',
        duration,
        MetricUnit.Milliseconds,
        dimensions,
        timestamp
      );

      // Flush metrics to CloudWatch
      await this.metricPublisher.flush(this.namespace);

      logger.info('Cold start metrics published', {
        component: 'ColdStartTracker',
        metadata: {
          functionName,
          duration,
        },
      });
    } catch (error) {
      logger.error('Failed to publish cold start metrics', error as Error, {
        component: 'ColdStartTracker',
        metadata: {
          functionName,
          duration,
        },
      });
    }
  }

  /**
   * Check if the current execution environment has been initialized
   * 
   * @returns True if this is not the first invocation (warm start)
   */
  public isWarmStart(): boolean {
    return this.isInitialized;
  }

  /**
   * Get the total number of invocations in this execution environment
   * 
   * @returns Invocation count
   */
  public getInvocationCount(): number {
    return this.invocationCount;
  }

  /**
   * Get the initialization time of this execution environment
   * 
   * @returns Initialization timestamp in milliseconds
   */
  public getInitializationTime(): number {
    return this.initializationTime;
  }

  /**
   * Reset the tracker state (primarily for testing)
   * 
   * WARNING: This should only be used in tests. In production,
   * each execution environment maintains its own state.
   */
  public reset(): void {
    this.isInitialized = false;
    this.invocationCount = 0;
    
    logger.warn('ColdStartTracker reset (should only happen in tests)', {
      component: 'ColdStartTracker',
    });
  }
}

/**
 * Create a singleton cold start tracker instance
 * 
 * This should be instantiated at module level (outside the handler)
 * so it persists across warm invocations in the same execution environment.
 */
export const coldStartTracker = new ColdStartTracker();
