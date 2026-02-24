/**
 * Unit tests for ServiceMetricTracker
 * 
 * Tests cover:
 * - Transcribe processing metric tracking
 * - Bedrock invocation metric tracking
 * - Input validation
 * - Error handling
 * - Metric calculation accuracy
 */

import { ServiceMetricTracker } from '../../../lib/monitoring/service-metric-tracker';
import { MetricPublisher } from '../../../lib/monitoring/metric-publisher';
import { MetricUnit } from '../../../lib/monitoring/types';

// Mock MetricPublisher
jest.mock('../../../lib/monitoring/metric-publisher');

describe('ServiceMetricTracker', () => {
  let tracker: ServiceMetricTracker;
  let mockMetricPublisher: jest.Mocked<MetricPublisher>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock metric publisher
    mockMetricPublisher = {
      publishMetric: jest.fn().mockResolvedValue(undefined),
      publishBusinessKPI: jest.fn().mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      getUniqueMetricCount: jest.fn().mockReturnValue(0),
    } as any;

    // Create tracker with mock publisher
    tracker = new ServiceMetricTracker({
      metricPublisher: mockMetricPublisher,
      environment: 'test',
    });
  });

  describe('trackTranscribeProcessing', () => {
    it('should publish Transcribe processing metrics', async () => {
      const audioDurationMs = 5000; // 5 seconds
      const processingTimeMs = 1500; // 1.5 seconds

      await tracker.trackTranscribeProcessing(audioDurationMs, processingTimeMs);

      // Should publish 3 metrics: processing time, audio duration, efficiency ratio
      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledTimes(3);

      // Check processing time metric
      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        'VocalShield/Services',
        'TranscribeProcessingTime',
        processingTimeMs,
        MetricUnit.Milliseconds,
        { Service: 'Transcribe', Environment: 'test' },
        expect.any(Date)
      );

      // Check audio duration metric
      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        'VocalShield/Services',
        'TranscribeAudioDuration',
        audioDurationMs,
        MetricUnit.Milliseconds,
        { Service: 'Transcribe', Environment: 'test' },
        expect.any(Date)
      );

      // Check efficiency ratio metric (1500ms / 5s = 300ms per second)
      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        'VocalShield/Services',
        'TranscribeEfficiencyRatio',
        300,
        MetricUnit.Milliseconds,
        { Service: 'Transcribe', Environment: 'test' },
        expect.any(Date)
      );
    });

    it('should handle zero audio duration gracefully', async () => {
      const audioDurationMs = 0;
      const processingTimeMs = 1000;

      await tracker.trackTranscribeProcessing(audioDurationMs, processingTimeMs);

      // Should not publish metrics for invalid input
      expect(mockMetricPublisher.publishMetric).not.toHaveBeenCalled();
    });

    it('should handle negative processing time gracefully', async () => {
      const audioDurationMs = 5000;
      const processingTimeMs = -100;

      await tracker.trackTranscribeProcessing(audioDurationMs, processingTimeMs);

      // Should not publish metrics for invalid input
      expect(mockMetricPublisher.publishMetric).not.toHaveBeenCalled();
    });

    it('should calculate efficiency ratio correctly for various durations', async () => {
      const testCases = [
        { audioDurationMs: 1000, processingTimeMs: 500, expectedRatio: 500 },
        { audioDurationMs: 10000, processingTimeMs: 2000, expectedRatio: 200 },
        { audioDurationMs: 3000, processingTimeMs: 900, expectedRatio: 300 },
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();
        
        await tracker.trackTranscribeProcessing(
          testCase.audioDurationMs,
          testCase.processingTimeMs
        );

        // Find the efficiency ratio call
        const efficiencyCall = mockMetricPublisher.publishMetric.mock.calls.find(
          call => call[1] === 'TranscribeEfficiencyRatio'
        );

        expect(efficiencyCall).toBeDefined();
        expect(efficiencyCall![2]).toBeCloseTo(testCase.expectedRatio, 1);
      }
    });

    it('should handle metric publishing errors gracefully', async () => {
      mockMetricPublisher.publishMetric.mockRejectedValueOnce(new Error('CloudWatch error'));

      // Should not throw
      await expect(
        tracker.trackTranscribeProcessing(5000, 1500)
      ).resolves.not.toThrow();
    });
  });

  describe('trackBedrockInvocation', () => {
    it('should publish Bedrock invocation metrics', async () => {
      const responseTimeMs = 2000;
      const inputTokens = 150;
      const outputTokens = 75;

      await tracker.trackBedrockInvocation(responseTimeMs, inputTokens, outputTokens);

      // Should publish 4 metrics: response time, input tokens, output tokens, total tokens
      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledTimes(4);

      // Check response time metric
      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        'VocalShield/Services',
        'BedrockResponseTime',
        responseTimeMs,
        MetricUnit.Milliseconds,
        { Service: 'Bedrock', Environment: 'test' },
        expect.any(Date)
      );

      // Check input tokens metric
      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        'VocalShield/Services',
        'BedrockInputTokens',
        inputTokens,
        MetricUnit.Count,
        { Service: 'Bedrock', Environment: 'test' },
        expect.any(Date)
      );

      // Check output tokens metric
      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        'VocalShield/Services',
        'BedrockOutputTokens',
        outputTokens,
        MetricUnit.Count,
        { Service: 'Bedrock', Environment: 'test' },
        expect.any(Date)
      );

      // Check total tokens metric
      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        'VocalShield/Services',
        'BedrockTotalTokens',
        225, // 150 + 75
        MetricUnit.Count,
        { Service: 'Bedrock', Environment: 'test' },
        expect.any(Date)
      );
    });

    it('should handle negative response time gracefully', async () => {
      const responseTimeMs = -100;
      const inputTokens = 150;
      const outputTokens = 75;

      await tracker.trackBedrockInvocation(responseTimeMs, inputTokens, outputTokens);

      // Should not publish metrics for invalid input
      expect(mockMetricPublisher.publishMetric).not.toHaveBeenCalled();
    });

    it('should handle negative token counts gracefully', async () => {
      const responseTimeMs = 2000;
      const inputTokens = -10;
      const outputTokens = 75;

      await tracker.trackBedrockInvocation(responseTimeMs, inputTokens, outputTokens);

      // Should not publish metrics for invalid input
      expect(mockMetricPublisher.publishMetric).not.toHaveBeenCalled();
    });

    it('should handle zero token counts', async () => {
      const responseTimeMs = 2000;
      const inputTokens = 0;
      const outputTokens = 0;

      await tracker.trackBedrockInvocation(responseTimeMs, inputTokens, outputTokens);

      // Should publish metrics even with zero tokens
      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledTimes(4);

      // Check total tokens is 0
      const totalTokensCall = mockMetricPublisher.publishMetric.mock.calls.find(
        call => call[1] === 'BedrockTotalTokens'
      );
      expect(totalTokensCall![2]).toBe(0);
    });

    it('should calculate total tokens correctly', async () => {
      const testCases = [
        { inputTokens: 100, outputTokens: 50, expectedTotal: 150 },
        { inputTokens: 500, outputTokens: 200, expectedTotal: 700 },
        { inputTokens: 1, outputTokens: 1, expectedTotal: 2 },
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();
        
        await tracker.trackBedrockInvocation(
          2000,
          testCase.inputTokens,
          testCase.outputTokens
        );

        // Find the total tokens call
        const totalTokensCall = mockMetricPublisher.publishMetric.mock.calls.find(
          call => call[1] === 'BedrockTotalTokens'
        );

        expect(totalTokensCall).toBeDefined();
        expect(totalTokensCall![2]).toBe(testCase.expectedTotal);
      }
    });

    it('should handle metric publishing errors gracefully', async () => {
      mockMetricPublisher.publishMetric.mockRejectedValueOnce(new Error('CloudWatch error'));

      // Should not throw
      await expect(
        tracker.trackBedrockInvocation(2000, 150, 75)
      ).resolves.not.toThrow();
    });
  });

  describe('getTranscribeMetrics', () => {
    it('should return Transcribe metrics object', () => {
      const audioDurationMs = 5000;
      const processingTimeMs = 1500;

      const metrics = tracker.getTranscribeMetrics(audioDurationMs, processingTimeMs);

      expect(metrics).toEqual({
        audioDurationMs,
        processingTimeMs,
        timestamp: expect.any(Date),
      });
    });
  });

  describe('getBedrockMetrics', () => {
    it('should return Bedrock metrics object with calculated total', () => {
      const responseTimeMs = 2000;
      const inputTokens = 150;
      const outputTokens = 75;

      const metrics = tracker.getBedrockMetrics(responseTimeMs, inputTokens, outputTokens);

      expect(metrics).toEqual({
        responseTimeMs,
        inputTokens,
        outputTokens,
        totalTokens: 225,
        timestamp: expect.any(Date),
      });
    });
  });

  describe('close', () => {
    it('should close the metric publisher', async () => {
      await tracker.close();

      expect(mockMetricPublisher.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('environment configuration', () => {
    it('should use provided environment', async () => {
      const customTracker = new ServiceMetricTracker({
        metricPublisher: mockMetricPublisher,
        environment: 'production',
      });

      await customTracker.trackTranscribeProcessing(5000, 1500);

      // Check that environment dimension is set correctly
      const call = mockMetricPublisher.publishMetric.mock.calls[0];
      expect(call[4]).toEqual({ Service: 'Transcribe', Environment: 'production' });
    });

    it('should default to dev environment if not provided', async () => {
      const defaultTracker = new ServiceMetricTracker({
        metricPublisher: mockMetricPublisher,
      });

      await defaultTracker.trackTranscribeProcessing(5000, 1500);

      // Check that environment dimension defaults to dev
      const call = mockMetricPublisher.publishMetric.mock.calls[0];
      expect(call[4]).toEqual({ Service: 'Transcribe', Environment: 'dev' });
    });
  });
});
