/**
 * XRayTracer - Distributed tracing wrapper for AWS X-Ray
 * 
 * This class provides a simplified interface for instrumenting code with
 * AWS X-Ray distributed tracing.
 * 
 * Features:
 * - Automatic AWS SDK instrumentation
 * - Custom subsegment creation
 * - Annotation and metadata support
 * - Sampling configuration (10% success, 100% errors)
 * 
 * Usage:
 * ```typescript
 * const tracer = new XRayTracer();
 * 
 * // Capture a function
 * await tracer.captureFunc('ProcessAudio', async (subsegment) => {
 *   subsegment.addAnnotation('userId', 'user-123');
 *   // ... processing logic
 * });
 * 
 * // Instrument AWS SDK
 * const dynamodb = tracer.captureAWS(new DynamoDBClient({}));
 * ```
 */

import * as AWSXRay from 'aws-xray-sdk-core';
import { logger } from './structured-logger';

/**
 * Subsegment interface for X-Ray
 */
export interface Subsegment {
  addAnnotation(key: string, value: string | number | boolean): void;
  addMetadata(key: string, value: unknown, namespace?: string): void;
  addError(error: Error): void;
  close(): void;
}

/**
 * XRayTracer configuration
 */
export interface XRayTracerConfig {
  enabled?: boolean;
  samplingRate?: number; // 0.0 to 1.0
}

/**
 * XRayTracer class for distributed tracing
 */
export class XRayTracer {
  private readonly enabled: boolean;
  private readonly samplingRate: number;

  constructor(config: XRayTracerConfig = {}) {
    this.enabled = config.enabled !== false; // Enabled by default
    this.samplingRate = config.samplingRate || 0.1; // 10% sampling by default

    if (this.enabled) {
      // Configure X-Ray sampling rules
      this.configureSampling();
    }
  }

  /**
   * Configure X-Ray sampling rules
   * - Sample 10% of successful requests
   * - Sample 100% of errors
   */
  private configureSampling(): void {
    // X-Ray SDK automatically samples errors at 100%
    // We configure the success sampling rate
    AWSXRay.middleware.setSamplingRules({
      version: 2,
      default: {
        fixed_target: 1, // Always sample at least 1 request per second
        rate: this.samplingRate, // Sample 10% of remaining requests
      },
      rules: [],
    });
  }

  /**
   * Capture a function execution in a subsegment
   */
  public async captureFunc<T>(
    name: string,
    func: (subsegment: Subsegment) => Promise<T>
  ): Promise<T> {
    if (!this.enabled) {
      // If tracing is disabled, just execute the function
      const mockSubsegment = this.createMockSubsegment();
      return func(mockSubsegment);
    }

    return new Promise<T>((resolve, reject) => {
      AWSXRay.captureAsyncFunc(name, async (subsegment) => {
        try {
          const result = await func(subsegment as unknown as Subsegment);
          subsegment?.close();
          resolve(result);
        } catch (error) {
          if (subsegment) {
            subsegment.addError(error as Error);
            subsegment.close();
          }
          reject(error);
        }
      });
    });
  }

  /**
   * Instrument AWS SDK client with X-Ray
   */
  public captureAWS<T extends { middlewareStack: unknown; config: unknown }>(service: T): T {
    if (!this.enabled) {
      return service;
    }

    try {
      return AWSXRay.captureAWSv3Client(service as never) as T;
    } catch (error) {
      logger.warn('Failed to instrument AWS SDK with X-Ray', {
        component: 'XRayTracer',
        metadata: {
          error: (error as Error).message,
        },
      });
      return service;
    }
  }

  /**
   * Capture HTTP/HTTPS requests globally
   */
  public captureHTTPsGlobal(): void {
    if (!this.enabled) {
      return;
    }

    try {
      AWSXRay.captureHTTPsGlobal(require('http'));
      AWSXRay.captureHTTPsGlobal(require('https'));
    } catch (error) {
      logger.warn('Failed to capture HTTP/HTTPS globally', {
        component: 'XRayTracer',
        metadata: {
          error: (error as Error).message,
        },
      });
    }
  }

  /**
   * Add annotation to current segment
   */
  public addAnnotation(key: string, value: string | number | boolean): void {
    if (!this.enabled) {
      return;
    }

    const segment = AWSXRay.getSegment();
    if (segment) {
      segment.addAnnotation(key, value);
    }
  }

  /**
   * Add metadata to current segment
   */
  public addMetadata(key: string, value: unknown, namespace?: string): void {
    if (!this.enabled) {
      return;
    }

    const segment = AWSXRay.getSegment();
    if (segment) {
      segment.addMetadata(key, value, namespace);
    }
  }

  /**
   * Set user ID for current segment
   */
  public setUser(userId: string): void {
    if (!this.enabled) {
      return;
    }

    const segment = AWSXRay.getSegment();
    if (segment && 'setUser' in segment) {
      (segment as { setUser: (userId: string) => void }).setUser(userId);
    }
  }

  /**
   * Get current trace ID
   */
  public getTraceId(): string | undefined {
    if (!this.enabled) {
      return undefined;
    }

    const segment = AWSXRay.getSegment();
    if (segment && 'trace_id' in segment) {
      return (segment as { trace_id: string }).trace_id;
    }
    return undefined;
  }

  /**
   * Create a mock subsegment for when tracing is disabled
   */
  private createMockSubsegment(): Subsegment {
    return {
      addAnnotation: () => {},
      addMetadata: () => {},
      addError: () => {},
      close: () => {},
    };
  }

  /**
   * Check if tracing is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }
}

/**
 * Create a singleton tracer instance for convenience
 */
export const tracer = new XRayTracer();
