/**
 * ServiceMetricTracker - Track AWS service usage metrics
 * 
 * This class tracks performance and resource consumption metrics for AWS services:
 * - Amazon Transcribe: Processing time per audio duration
 * - Amazon Bedrock: Response time and token consumption
 * 
 * Features:
 * - Automatic metric publishing to CloudWatch
 * - Correlation of processing time with input size
 * - Token usage tracking for LLM services
 * - Free Tier compliance monitoring
 * 
 * Usage:
 * ```typescript
 * const tracker = new ServiceMetricTracker();
 * 
 * // Track Transcribe processing
 * await tracker.trackTranscribeProcessing(audioDurationMs, processingTimeMs);
 * 
 * // Track Bedrock invocation
 * await tracker.trackBedrockInvocation(responseTimeMs, inputTokens, outputTokens);
 * ```
 */

import { MetricPublisher } from './metric-publisher';
import { MetricUnit } from './types';
import { logger } from './structured-logger';

/**
 * Configuration for ServiceMetricTracker
 */
export interface ServiceMetricTrackerConfig {
  metricPublisher?: MetricPublisher;
  environment?: string;
}

/**
 * Transcribe processing metrics
 */
export interface TranscribeMetrics {
  audioDurationMs: number;
  processingTimeMs: number;
  timestamp: Date;
}

/**
 * Bedrock invocation metrics
 */
export interface BedrockMetrics {
  responseTimeMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  timestamp: Date;
}

/**
 * ServiceMetricTracker class for AWS service metrics
 */
export class ServiceMetricTracker {
  private readonly metricPublisher: MetricPublisher;
  private readonly environment: string;

  constructor(config: ServiceMetricTrackerConfig = {}) {
    this.metricPublisher = config.metricPublisher || new MetricPublisher();
    this.environment = config.environment || process.env.ENVIRONMENT || 'dev';
  }

  /**
   * Track Amazon Transcribe processing metrics
   * 
   * Publishes metrics for:
   * - Processing time (absolute)
   * - Processing time per second of audio (efficiency ratio)
   * - Audio duration processed
   * 
   * @param audioDurationMs Duration of audio processed in milliseconds
   * @param processingTimeMs Time taken to process the audio in milliseconds
   */
  public async trackTranscribeProcessing(
    audioDurationMs: number,
    processingTimeMs: number
  ): Promise<void> {
    try {
      const timestamp = new Date();
      const dimensions = {
        Service: 'Transcribe',
        Environment: this.environment,
      };

      // Validate inputs
      if (audioDurationMs <= 0 || processingTimeMs < 0) {
        logger.warn('Invalid Transcribe metrics', {
          component: 'ServiceMetricTracker',
          metadata: {
            audioDurationMs,
            processingTimeMs,
          },
        });
        return;
      }

      // Publish processing time
      await this.metricPublisher.publishMetric(
        'VocalShield/Services',
        'TranscribeProcessingTime',
        processingTimeMs,
        MetricUnit.Milliseconds,
        dimensions,
        timestamp
      );

      // Publish audio duration
      await this.metricPublisher.publishMetric(
        'VocalShield/Services',
        'TranscribeAudioDuration',
        audioDurationMs,
        MetricUnit.Milliseconds,
        dimensions,
        timestamp
      );

      // Calculate and publish efficiency ratio (processing time per second of audio)
      const audioDurationSeconds = audioDurationMs / 1000;
      const processingTimePerSecond = processingTimeMs / audioDurationSeconds;
      
      await this.metricPublisher.publishMetric(
        'VocalShield/Services',
        'TranscribeEfficiencyRatio',
        processingTimePerSecond,
        MetricUnit.Milliseconds,
        dimensions,
        timestamp
      );

      logger.info('Transcribe metrics tracked', {
        component: 'ServiceMetricTracker',
        operation: 'trackTranscribeProcessing',
        duration: processingTimeMs,
        metadata: {
          audioDurationMs,
          processingTimeMs,
          efficiencyRatio: processingTimePerSecond,
        },
      });
    } catch (error) {
      logger.error('Failed to track Transcribe metrics', error as Error, {
        component: 'ServiceMetricTracker',
        metadata: {
          audioDurationMs,
          processingTimeMs,
        },
      });
    }
  }

  /**
   * Track Amazon Bedrock invocation metrics
   * 
   * Publishes metrics for:
   * - Response time
   * - Input token count
   * - Output token count
   * - Total token count
   * 
   * @param responseTimeMs Time taken for Bedrock to respond in milliseconds
   * @param inputTokens Number of input tokens consumed
   * @param outputTokens Number of output tokens generated
   */
  public async trackBedrockInvocation(
    responseTimeMs: number,
    inputTokens: number,
    outputTokens: number
  ): Promise<void> {
    try {
      const timestamp = new Date();
      const dimensions = {
        Service: 'Bedrock',
        Environment: this.environment,
      };

      // Validate inputs
      if (responseTimeMs < 0 || inputTokens < 0 || outputTokens < 0) {
        logger.warn('Invalid Bedrock metrics', {
          component: 'ServiceMetricTracker',
          metadata: {
            responseTimeMs,
            inputTokens,
            outputTokens,
          },
        });
        return;
      }

      const totalTokens = inputTokens + outputTokens;

      // Publish response time
      await this.metricPublisher.publishMetric(
        'VocalShield/Services',
        'BedrockResponseTime',
        responseTimeMs,
        MetricUnit.Milliseconds,
        dimensions,
        timestamp
      );

      // Publish input tokens
      await this.metricPublisher.publishMetric(
        'VocalShield/Services',
        'BedrockInputTokens',
        inputTokens,
        MetricUnit.Count,
        dimensions,
        timestamp
      );

      // Publish output tokens
      await this.metricPublisher.publishMetric(
        'VocalShield/Services',
        'BedrockOutputTokens',
        outputTokens,
        MetricUnit.Count,
        dimensions,
        timestamp
      );

      // Publish total tokens
      await this.metricPublisher.publishMetric(
        'VocalShield/Services',
        'BedrockTotalTokens',
        totalTokens,
        MetricUnit.Count,
        dimensions,
        timestamp
      );

      logger.info('Bedrock metrics tracked', {
        component: 'ServiceMetricTracker',
        operation: 'trackBedrockInvocation',
        duration: responseTimeMs,
        metadata: {
          responseTimeMs,
          inputTokens,
          outputTokens,
          totalTokens,
        },
      });
    } catch (error) {
      logger.error('Failed to track Bedrock metrics', error as Error, {
        component: 'ServiceMetricTracker',
        metadata: {
          responseTimeMs,
          inputTokens,
          outputTokens,
        },
      });
    }
  }

  /**
   * Get Transcribe metrics summary
   * 
   * @param audioDurationMs Duration of audio in milliseconds
   * @param processingTimeMs Processing time in milliseconds
   * @returns Metrics object
   */
  public getTranscribeMetrics(
    audioDurationMs: number,
    processingTimeMs: number
  ): TranscribeMetrics {
    return {
      audioDurationMs,
      processingTimeMs,
      timestamp: new Date(),
    };
  }

  /**
   * Get Bedrock metrics summary
   * 
   * @param responseTimeMs Response time in milliseconds
   * @param inputTokens Input token count
   * @param outputTokens Output token count
   * @returns Metrics object
   */
  public getBedrockMetrics(
    responseTimeMs: number,
    inputTokens: number,
    outputTokens: number
  ): BedrockMetrics {
    return {
      responseTimeMs,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      timestamp: new Date(),
    };
  }

  /**
   * Cleanup and flush remaining metrics
   */
  public async close(): Promise<void> {
    await this.metricPublisher.close();
  }
}

/**
 * Create a singleton service metric tracker instance for convenience
 */
export const serviceMetricTracker = new ServiceMetricTracker();
