/**
 * CloudWatch Metrics Integration
 * 
 * Sends performance and quality metrics to CloudWatch for monitoring and alerting
 * Requirement: 10.4
 */

import { CloudWatchClient, PutMetricDataCommand, MetricDatum } from '@aws-sdk/client-cloudwatch';

/**
 * Logger interface for structured logging
 */
interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Simple console logger implementation
 */
class ConsoleLogger implements Logger {
  info(message: string, context?: Record<string, unknown>): void {
    console.log(JSON.stringify({ level: 'INFO', message, timestamp: new Date().toISOString(), ...context }));
  }

  warn(message: string, context?: Record<string, unknown>): void {
    console.log(JSON.stringify({ level: 'WARN', message, timestamp: new Date().toISOString(), ...context }));
  }

  error(message: string, context?: Record<string, unknown>): void {
    console.log(JSON.stringify({ level: 'ERROR', message, timestamp: new Date().toISOString(), ...context }));
  }
}

/**
 * CloudWatch Metrics Publisher
 */
export class CloudWatchMetrics {
  private cloudWatchClient: CloudWatchClient;
  private logger: Logger;
  private readonly namespace = 'VocalShield/Transcription';

  constructor(cloudWatchClient?: CloudWatchClient, logger?: Logger) {
    this.cloudWatchClient = cloudWatchClient || new CloudWatchClient({});
    this.logger = logger || new ConsoleLogger();
  }

  /**
   * Publish latency metric
   * Requirement: 10.1, 10.6
   */
  async publishLatency(sessionId: string, latencyMs: number): Promise<void> {
    const metric: MetricDatum = {
      MetricName: 'TranscriptionLatency',
      Value: latencyMs,
      Unit: 'Milliseconds',
      Timestamp: new Date(),
      Dimensions: [
        {
          Name: 'SessionId',
          Value: sessionId,
        },
      ],
    };

    await this.publishMetric([metric]);
  }

  /**
   * Publish confidence score metric
   * Requirement: 10.2
   */
  async publishConfidence(sessionId: string, confidence: number): Promise<void> {
    const metric: MetricDatum = {
      MetricName: 'TranscriptionConfidence',
      Value: confidence,
      Unit: 'None',
      Timestamp: new Date(),
      Dimensions: [
        {
          Name: 'SessionId',
          Value: sessionId,
        },
      ],
    };

    await this.publishMetric([metric]);
  }

  /**
   * Publish throughput metric (audio chunks per second)
   */
  async publishThroughput(sessionId: string, chunksPerSecond: number): Promise<void> {
    const metric: MetricDatum = {
      MetricName: 'AudioThroughput',
      Value: chunksPerSecond,
      Unit: 'Count/Second',
      Timestamp: new Date(),
      Dimensions: [
        {
          Name: 'SessionId',
          Value: sessionId,
        },
      ],
    };

    await this.publishMetric([metric]);
  }

  /**
   * Publish error count metric
   */
  async publishError(sessionId: string, errorType: string): Promise<void> {
    const metric: MetricDatum = {
      MetricName: 'TranscriptionErrors',
      Value: 1,
      Unit: 'Count',
      Timestamp: new Date(),
      Dimensions: [
        {
          Name: 'SessionId',
          Value: sessionId,
        },
        {
          Name: 'ErrorType',
          Value: errorType,
        },
      ],
    };

    await this.publishMetric([metric]);
  }

  /**
   * Publish session metrics at session end
   * Requirement: 10.5
   */
  async publishSessionMetrics(
    sessionId: string,
    metrics: {
      totalAudioChunks: number;
      totalTranscriptSegments: number;
      averageLatencyMs: number;
      connectionRetries: number;
      lowConfidenceSegments: number;
      durationMinutes: number;
    }
  ): Promise<void> {
    const metricData: MetricDatum[] = [
      {
        MetricName: 'SessionAudioChunks',
        Value: metrics.totalAudioChunks,
        Unit: 'Count',
        Timestamp: new Date(),
        Dimensions: [{ Name: 'SessionId', Value: sessionId }],
      },
      {
        MetricName: 'SessionTranscriptSegments',
        Value: metrics.totalTranscriptSegments,
        Unit: 'Count',
        Timestamp: new Date(),
        Dimensions: [{ Name: 'SessionId', Value: sessionId }],
      },
      {
        MetricName: 'SessionAverageLatency',
        Value: metrics.averageLatencyMs,
        Unit: 'Milliseconds',
        Timestamp: new Date(),
        Dimensions: [{ Name: 'SessionId', Value: sessionId }],
      },
      {
        MetricName: 'SessionConnectionRetries',
        Value: metrics.connectionRetries,
        Unit: 'Count',
        Timestamp: new Date(),
        Dimensions: [{ Name: 'SessionId', Value: sessionId }],
      },
      {
        MetricName: 'SessionLowConfidenceSegments',
        Value: metrics.lowConfidenceSegments,
        Unit: 'Count',
        Timestamp: new Date(),
        Dimensions: [{ Name: 'SessionId', Value: sessionId }],
      },
      {
        MetricName: 'SessionDuration',
        Value: metrics.durationMinutes,
        Unit: 'None',
        Timestamp: new Date(),
        Dimensions: [{ Name: 'SessionId', Value: sessionId }],
      },
    ];

    await this.publishMetric(metricData);
  }

  /**
   * Publish metric data to CloudWatch
   */
  private async publishMetric(metricData: MetricDatum[]): Promise<void> {
    try {
      const command = new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: metricData,
      });

      await this.cloudWatchClient.send(command);

      this.logger.info('CloudWatch metrics published', {
        namespace: this.namespace,
        metricCount: metricData.length,
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error('Failed to publish CloudWatch metrics', {
        error: err.message,
        metricCount: metricData.length,
      });
      // Don't throw - metrics publishing should not break the main flow
    }
  }
}
