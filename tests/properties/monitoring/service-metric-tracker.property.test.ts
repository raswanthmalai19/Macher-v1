/**
 * Property-based tests for ServiceMetricTracker
 * 
 * Feature: monitoring-and-observability
 * Property 13: Service Metric Tracking
 * 
 * **Validates: Requirements 7.6, 7.7**
 * 
 * These tests verify that service metric tracking behaves correctly across
 * all valid inputs using property-based testing with fast-check.
 */

import * as fc from 'fast-check';
import { ServiceMetricTracker } from '../../../lib/monitoring/service-metric-tracker';
import { MetricPublisher } from '../../../lib/monitoring/metric-publisher';
import { MetricUnit } from '../../../lib/monitoring/types';

// Mock MetricPublisher
jest.mock('../../../lib/monitoring/metric-publisher');

describe('ServiceMetricTracker - Property Tests', () => {
  describe('Property 13: Service Metric Tracking', () => {
    /**
     * Property: For any service operation (Transcribe processing, Bedrock invocation),
     * timing and resource consumption metrics should be published to CloudWatch.
     * 
     * **Validates: Requirements 7.6, 7.7**
     */
    it('should publish Transcribe metrics for all valid audio durations and processing times', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 300000 }), // Audio duration: 1ms to 5 minutes
          fc.integer({ min: 0, max: 60000 }),  // Processing time: 0ms to 1 minute
          async (audioDurationMs, processingTimeMs) => {
            // Create mock metric publisher
            const mockPublisher = {
              publishMetric: jest.fn().mockResolvedValue(undefined),
              close: jest.fn().mockResolvedValue(undefined),
            } as any;

            const tracker = new ServiceMetricTracker({
              metricPublisher: mockPublisher,
              environment: 'test',
            });

            // Track Transcribe processing
            await tracker.trackTranscribeProcessing(audioDurationMs, processingTimeMs);

            // Verify metrics were published
            expect(mockPublisher.publishMetric).toHaveBeenCalled();
            
            // Should publish exactly 3 metrics
            expect(mockPublisher.publishMetric).toHaveBeenCalledTimes(3);

            // Verify processing time metric
            const processingTimeCall = mockPublisher.publishMetric.mock.calls.find(
              (call: any[]) => call[1] === 'TranscribeProcessingTime'
            );
            expect(processingTimeCall).toBeDefined();
            expect(processingTimeCall![2]).toBe(processingTimeMs);
            expect(processingTimeCall![3]).toBe(MetricUnit.Milliseconds);

            // Verify audio duration metric
            const audioDurationCall = mockPublisher.publishMetric.mock.calls.find(
              (call: any[]) => call[1] === 'TranscribeAudioDuration'
            );
            expect(audioDurationCall).toBeDefined();
            expect(audioDurationCall![2]).toBe(audioDurationMs);
            expect(audioDurationCall![3]).toBe(MetricUnit.Milliseconds);

            // Verify efficiency ratio metric
            const efficiencyCall = mockPublisher.publishMetric.mock.calls.find(
              (call: any[]) => call[1] === 'TranscribeEfficiencyRatio'
            );
            expect(efficiencyCall).toBeDefined();
            
            // Calculate expected efficiency ratio
            const expectedRatio = processingTimeMs / (audioDurationMs / 1000);
            expect(efficiencyCall![2]).toBeCloseTo(expectedRatio, 2);
            expect(efficiencyCall![3]).toBe(MetricUnit.Milliseconds);

            // Verify all metrics have correct dimensions
            for (const call of mockPublisher.publishMetric.mock.calls) {
              expect(call[4]).toEqual({
                Service: 'Transcribe',
                Environment: 'test',
              });
              expect(call[5]).toBeInstanceOf(Date);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should publish Bedrock metrics for all valid response times and token counts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 30000 }),    // Response time: 0ms to 30 seconds
          fc.integer({ min: 0, max: 10000 }),    // Input tokens: 0 to 10k
          fc.integer({ min: 0, max: 10000 }),    // Output tokens: 0 to 10k
          async (responseTimeMs, inputTokens, outputTokens) => {
            // Create mock metric publisher
            const mockPublisher = {
              publishMetric: jest.fn().mockResolvedValue(undefined),
              close: jest.fn().mockResolvedValue(undefined),
            } as any;

            const tracker = new ServiceMetricTracker({
              metricPublisher: mockPublisher,
              environment: 'test',
            });

            // Track Bedrock invocation
            await tracker.trackBedrockInvocation(responseTimeMs, inputTokens, outputTokens);

            // Verify metrics were published
            expect(mockPublisher.publishMetric).toHaveBeenCalled();
            
            // Should publish exactly 4 metrics
            expect(mockPublisher.publishMetric).toHaveBeenCalledTimes(4);

            // Verify response time metric
            const responseTimeCall = mockPublisher.publishMetric.mock.calls.find(
              (call: any[]) => call[1] === 'BedrockResponseTime'
            );
            expect(responseTimeCall).toBeDefined();
            expect(responseTimeCall![2]).toBe(responseTimeMs);
            expect(responseTimeCall![3]).toBe(MetricUnit.Milliseconds);

            // Verify input tokens metric
            const inputTokensCall = mockPublisher.publishMetric.mock.calls.find(
              (call: any[]) => call[1] === 'BedrockInputTokens'
            );
            expect(inputTokensCall).toBeDefined();
            expect(inputTokensCall![2]).toBe(inputTokens);
            expect(inputTokensCall![3]).toBe(MetricUnit.Count);

            // Verify output tokens metric
            const outputTokensCall = mockPublisher.publishMetric.mock.calls.find(
              (call: any[]) => call[1] === 'BedrockOutputTokens'
            );
            expect(outputTokensCall).toBeDefined();
            expect(outputTokensCall![2]).toBe(outputTokens);
            expect(outputTokensCall![3]).toBe(MetricUnit.Count);

            // Verify total tokens metric
            const totalTokensCall = mockPublisher.publishMetric.mock.calls.find(
              (call: any[]) => call[1] === 'BedrockTotalTokens'
            );
            expect(totalTokensCall).toBeDefined();
            expect(totalTokensCall![2]).toBe(inputTokens + outputTokens);
            expect(totalTokensCall![3]).toBe(MetricUnit.Count);

            // Verify all metrics have correct dimensions
            for (const call of mockPublisher.publishMetric.mock.calls) {
              expect(call[4]).toEqual({
                Service: 'Bedrock',
                Environment: 'test',
              });
              expect(call[5]).toBeInstanceOf(Date);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle invalid Transcribe inputs gracefully without publishing metrics', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant(0),                      // Zero audio duration
            fc.integer({ max: -1 })              // Negative audio duration
          ),
          fc.integer({ min: -1000, max: 60000 }), // Any processing time
          async (audioDurationMs, processingTimeMs) => {
            const mockPublisher = {
              publishMetric: jest.fn().mockResolvedValue(undefined),
              close: jest.fn().mockResolvedValue(undefined),
            } as any;

            const tracker = new ServiceMetricTracker({
              metricPublisher: mockPublisher,
              environment: 'test',
            });

            await tracker.trackTranscribeProcessing(audioDurationMs, processingTimeMs);

            // Should not publish any metrics for invalid input
            expect(mockPublisher.publishMetric).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle invalid Bedrock inputs gracefully without publishing metrics', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: -1000, max: 30000 }), // Any response time
          fc.integer({ min: -1000, max: 10000 }), // Any input tokens
          fc.integer({ min: -1000, max: 10000 }), // Any output tokens
          async (responseTimeMs, inputTokens, outputTokens) => {
            // Skip valid inputs
            if (responseTimeMs >= 0 && inputTokens >= 0 && outputTokens >= 0) {
              return;
            }

            const mockPublisher = {
              publishMetric: jest.fn().mockResolvedValue(undefined),
              close: jest.fn().mockResolvedValue(undefined),
            } as any;

            const tracker = new ServiceMetricTracker({
              metricPublisher: mockPublisher,
              environment: 'test',
            });

            await tracker.trackBedrockInvocation(responseTimeMs, inputTokens, outputTokens);

            // Should not publish any metrics for invalid input
            expect(mockPublisher.publishMetric).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should calculate Transcribe efficiency ratio correctly for all valid inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 300000 }),   // Audio duration
          fc.integer({ min: 0, max: 60000 }),    // Processing time
          async (audioDurationMs, processingTimeMs) => {
            const mockPublisher = {
              publishMetric: jest.fn().mockResolvedValue(undefined),
              close: jest.fn().mockResolvedValue(undefined),
            } as any;

            const tracker = new ServiceMetricTracker({
              metricPublisher: mockPublisher,
              environment: 'test',
            });

            await tracker.trackTranscribeProcessing(audioDurationMs, processingTimeMs);

            // Find efficiency ratio call
            const efficiencyCall = mockPublisher.publishMetric.mock.calls.find(
              (call: any[]) => call[1] === 'TranscribeEfficiencyRatio'
            );

            // Calculate expected ratio (processing time per second of audio)
            const audioDurationSeconds = audioDurationMs / 1000;
            const expectedRatio = processingTimeMs / audioDurationSeconds;

            expect(efficiencyCall![2]).toBeCloseTo(expectedRatio, 2);

            // Efficiency ratio should always be non-negative
            expect(efficiencyCall![2]).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should calculate Bedrock total tokens correctly for all valid inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 30000 }),    // Response time
          fc.integer({ min: 0, max: 10000 }),    // Input tokens
          fc.integer({ min: 0, max: 10000 }),    // Output tokens
          async (responseTimeMs, inputTokens, outputTokens) => {
            const mockPublisher = {
              publishMetric: jest.fn().mockResolvedValue(undefined),
              close: jest.fn().mockResolvedValue(undefined),
            } as any;

            const tracker = new ServiceMetricTracker({
              metricPublisher: mockPublisher,
              environment: 'test',
            });

            await tracker.trackBedrockInvocation(responseTimeMs, inputTokens, outputTokens);

            // Find total tokens call
            const totalTokensCall = mockPublisher.publishMetric.mock.calls.find(
              (call: any[]) => call[1] === 'BedrockTotalTokens'
            );

            // Total should equal sum of input and output
            expect(totalTokensCall![2]).toBe(inputTokens + outputTokens);

            // Total should always be non-negative
            expect(totalTokensCall![2]).toBeGreaterThanOrEqual(0);

            // Total should be at least as large as either component
            expect(totalTokensCall![2]).toBeGreaterThanOrEqual(inputTokens);
            expect(totalTokensCall![2]).toBeGreaterThanOrEqual(outputTokens);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should use consistent timestamps across all metrics in a single tracking call', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 300000 }),
          fc.integer({ min: 0, max: 60000 }),
          async (audioDurationMs, processingTimeMs) => {
            const mockPublisher = {
              publishMetric: jest.fn().mockResolvedValue(undefined),
              close: jest.fn().mockResolvedValue(undefined),
            } as any;

            const tracker = new ServiceMetricTracker({
              metricPublisher: mockPublisher,
              environment: 'test',
            });

            await tracker.trackTranscribeProcessing(audioDurationMs, processingTimeMs);

            // Extract all timestamps
            const timestamps = mockPublisher.publishMetric.mock.calls.map(
              (call: any[]) => call[5].getTime()
            );

            // All timestamps should be within 100ms of each other
            const minTimestamp = Math.min(...timestamps);
            const maxTimestamp = Math.max(...timestamps);
            expect(maxTimestamp - minTimestamp).toBeLessThan(100);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle metric publishing failures gracefully without throwing', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 300000 }),
          fc.integer({ min: 0, max: 60000 }),
          async (audioDurationMs, processingTimeMs) => {
            const mockPublisher = {
              publishMetric: jest.fn().mockRejectedValue(new Error('CloudWatch error')),
              close: jest.fn().mockResolvedValue(undefined),
            } as any;

            const tracker = new ServiceMetricTracker({
              metricPublisher: mockPublisher,
              environment: 'test',
            });

            // Should not throw even when publishing fails
            await expect(
              tracker.trackTranscribeProcessing(audioDurationMs, processingTimeMs)
            ).resolves.not.toThrow();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Metric Getter Methods', () => {
    it('should return correct Transcribe metrics structure for all inputs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 300000 }),
          fc.integer({ min: 0, max: 60000 }),
          (audioDurationMs, processingTimeMs) => {
            const tracker = new ServiceMetricTracker();
            const metrics = tracker.getTranscribeMetrics(audioDurationMs, processingTimeMs);

            expect(metrics.audioDurationMs).toBe(audioDurationMs);
            expect(metrics.processingTimeMs).toBe(processingTimeMs);
            expect(metrics.timestamp).toBeInstanceOf(Date);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should return correct Bedrock metrics structure for all inputs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 30000 }),
          fc.integer({ min: 0, max: 10000 }),
          fc.integer({ min: 0, max: 10000 }),
          (responseTimeMs, inputTokens, outputTokens) => {
            const tracker = new ServiceMetricTracker();
            const metrics = tracker.getBedrockMetrics(responseTimeMs, inputTokens, outputTokens);

            expect(metrics.responseTimeMs).toBe(responseTimeMs);
            expect(metrics.inputTokens).toBe(inputTokens);
            expect(metrics.outputTokens).toBe(outputTokens);
            expect(metrics.totalTokens).toBe(inputTokens + outputTokens);
            expect(metrics.timestamp).toBeInstanceOf(Date);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
