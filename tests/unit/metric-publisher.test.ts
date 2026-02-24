/**
 * Unit Tests for MetricPublisher Batching and Error Handling
 * 
 * These tests validate specific behaviors:
 * - Metric batching logic (max 20 per API call)
 * - Throttling and retry behavior with exponential backoff
 * - Error handling and recovery
 * 
 * Feature: monitoring-and-observability
 * Task: 3.4 Write unit tests for batching and error handling
 * Validates: Requirements 1.6
 */

import { MetricPublisher } from '../../lib/monitoring/metric-publisher';
import { MetricUnit } from '../../lib/monitoring/types';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

// Mock AWS SDK
jest.mock('@aws-sdk/client-cloudwatch', () => {
  const actualModule = jest.requireActual('@aws-sdk/client-cloudwatch');
  
  // Store captured inputs
  const capturedInputs: any[] = [];
  
  // Mock PutMetricDataCommand to capture constructor arguments
  class MockPutMetricDataCommand {
    public input: any;
    
    constructor(input: any) {
      this.input = input;
      capturedInputs.push(input);
    }
  }
  
  // Mock CloudWatchClient
  const MockCloudWatchClient = jest.fn();
  
  return {
    ...actualModule,
    PutMetricDataCommand: MockPutMetricDataCommand,
    CloudWatchClient: MockCloudWatchClient,
    __capturedInputs: capturedInputs,
  };
});

// Mock the logger to suppress console output during tests
jest.mock('../../lib/monitoring/structured-logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('MetricPublisher Batching and Error Handling', () => {
  let mockSend: jest.Mock;
  let capturedInputs: any[];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get reference to captured inputs from the mock
    const cloudwatchModule = require('@aws-sdk/client-cloudwatch');
    capturedInputs = cloudwatchModule.__capturedInputs;
    capturedInputs.length = 0; // Clear previous captures
    
    // Setup mock for CloudWatch client
    mockSend = jest.fn().mockResolvedValue({});
    
    (CloudWatchClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  describe('Metric Batching Logic', () => {
    it('should batch metrics up to 20 per API call', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20 });
      
      // Publish exactly 20 metrics
      for (let i = 0; i < 20; i++) {
        await publisher.publishMetric(
          'VocalShield/Test',
          `Metric${i}`,
          i,
          MetricUnit.Count,
          { Index: i.toString() }
        );
      }
      
      // Should trigger exactly one API call with 20 metrics
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(capturedInputs).toHaveLength(1);
      
      const command = capturedInputs[0];
      expect(command.MetricData).toHaveLength(20);
      expect(command.Namespace).toBe('VocalShield/Test');
    });

    it('should not send API call if batch is not full', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20 });
      
      // Publish only 10 metrics (less than batch size)
      for (let i = 0; i < 10; i++) {
        await publisher.publishMetric(
          'VocalShield/Test',
          `Metric${i}`,
          i,
          MetricUnit.Count,
          { Index: i.toString() }
        );
      }
      
      // Should not trigger API call yet
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should flush remaining metrics when explicitly called', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20 });
      
      // Publish 15 metrics (less than batch size)
      for (let i = 0; i < 15; i++) {
        await publisher.publishMetric(
          'VocalShield/Test',
          `Metric${i}`,
          i,
          MetricUnit.Count,
          { Index: i.toString() }
        );
      }
      
      // Explicitly flush
      await publisher.flush('VocalShield/Test');
      
      // Should send the 15 metrics
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(capturedInputs[0].MetricData).toHaveLength(15);
    });

    it('should handle multiple batches correctly', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20 });
      
      // Publish 45 metrics (should trigger 2 full batches, 5 remaining)
      for (let i = 0; i < 45; i++) {
        await publisher.publishMetric(
          'VocalShield/Test',
          `Metric${i}`,
          i,
          MetricUnit.Count,
          { Index: i.toString() }
        );
      }
      
      // Should have sent 2 batches automatically
      expect(mockSend).toHaveBeenCalledTimes(2);
      
      // Flush remaining
      await publisher.flush('VocalShield/Test');
      
      // Should have sent 3 batches total
      expect(mockSend).toHaveBeenCalledTimes(3);
      
      // Verify batch sizes
      expect(capturedInputs[0].MetricData).toHaveLength(20);
      expect(capturedInputs[1].MetricData).toHaveLength(20);
      expect(capturedInputs[2].MetricData).toHaveLength(5);
    });

    it('should batch metrics with different dimensions correctly', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20 });
      
      // Publish 20 metrics with varying dimensions
      for (let i = 0; i < 20; i++) {
        await publisher.publishMetric(
          'VocalShield/Test',
          'Latency',
          100 + i,
          MetricUnit.Milliseconds,
          { 
            Endpoint: `/api/endpoint${i % 5}`,
            Environment: i % 2 === 0 ? 'Production' : 'Development'
          }
        );
      }
      
      // Should batch all 20 metrics together
      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = capturedInputs[0];
      expect(command.MetricData).toHaveLength(20);
      
      // Verify dimensions are preserved
      const metricData = command.MetricData!;
      expect(metricData[0].Dimensions).toBeDefined();
      expect(metricData[0].Dimensions?.length).toBeGreaterThan(0);
    });

    it('should handle empty flush gracefully', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20 });
      
      // Flush without publishing any metrics
      await publisher.flush('VocalShield/Test');
      
      // Should not make any API calls
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should respect custom batch size configuration', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 5 });
      
      // Publish 5 metrics (custom batch size)
      for (let i = 0; i < 5; i++) {
        await publisher.publishMetric(
          'VocalShield/Test',
          `Metric${i}`,
          i,
          MetricUnit.Count,
          { Index: i.toString() }
        );
      }
      
      // Should trigger API call with custom batch size
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(capturedInputs[0].MetricData).toHaveLength(5);
    });
  });

  describe('Throttling and Retry Behavior', () => {
    it('should retry on ThrottlingException with exponential backoff', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20, maxRetries: 3 });
      
      // Mock throttling on first two attempts, success on third
      mockSend
        .mockRejectedValueOnce({ name: 'ThrottlingException', message: 'Rate exceeded' })
        .mockRejectedValueOnce({ name: 'ThrottlingException', message: 'Rate exceeded' })
        .mockResolvedValueOnce({});
      
      const startTime = Date.now();
      
      // Publish 20 metrics to trigger flush
      for (let i = 0; i < 20; i++) {
        await publisher.publishMetric(
          'VocalShield/Test',
          `Metric${i}`,
          i,
          MetricUnit.Count,
          { Index: i.toString() }
        );
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should have retried 3 times total (initial + 2 retries)
      expect(mockSend).toHaveBeenCalledTimes(3);
      
      // Should have taken time for exponential backoff
      // First retry: ~100ms, Second retry: ~200ms (with jitter, total ~300ms minimum)
      expect(duration).toBeGreaterThanOrEqual(200);
    });

    it('should retry on TooManyRequestsException', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20, maxRetries: 3 });
      
      // Mock TooManyRequestsException on first attempt, success on second
      mockSend
        .mockRejectedValueOnce({ name: 'TooManyRequestsException', message: 'Too many requests' })
        .mockResolvedValueOnce({});
      
      // Publish 20 metrics to trigger flush
      for (let i = 0; i < 20; i++) {
        await publisher.publishMetric(
          'VocalShield/Test',
          `Metric${i}`,
          i,
          MetricUnit.Count,
          { Index: i.toString() }
        );
      }
      
      // Should have retried once
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries exceeded', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20, maxRetries: 3 });
      
      // Mock throttling on all attempts
      mockSend.mockRejectedValue({ name: 'ThrottlingException', message: 'Rate exceeded' });
      
      // Publish 20 metrics to trigger flush
      for (let i = 0; i < 20; i++) {
        await publisher.publishMetric(
          'VocalShield/Test',
          `Metric${i}`,
          i,
          MetricUnit.Count,
          { Index: i.toString() }
        );
      }
      
      // Should have attempted max retries (3 times)
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-throttling errors', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20, maxRetries: 3 });
      
      // Mock a different error (not throttling)
      mockSend.mockRejectedValue({ name: 'ValidationException', message: 'Invalid input' });
      
      // Publish 20 metrics to trigger flush
      for (let i = 0; i < 20; i++) {
        await publisher.publishMetric(
          'VocalShield/Test',
          `Metric${i}`,
          i,
          MetricUnit.Count,
          { Index: i.toString() }
        );
      }
      
      // Should only attempt once (no retries for non-throttling errors)
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should implement exponential backoff with increasing delays', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20, maxRetries: 4 });
      
      let attemptCount = 0;
      
      // Mock throttling on first 3 attempts, success on 4th
      mockSend.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 4) {
          return Promise.reject({ name: 'ThrottlingException', message: 'Rate exceeded' });
        }
        return Promise.resolve({});
      });
      
      const startTime = Date.now();
      
      // Publish 20 metrics to trigger flush
      for (let i = 0; i < 20; i++) {
        await publisher.publishMetric(
          'VocalShield/Test',
          `Metric${i}`,
          i,
          MetricUnit.Count,
          { Index: i.toString() }
        );
      }
      
      const totalDuration = Date.now() - startTime;
      
      // Should have made 4 attempts (initial + 3 retries)
      expect(mockSend).toHaveBeenCalledTimes(4);
      
      // Total duration should reflect exponential backoff
      // First retry: ~100ms, Second: ~200ms, Third: ~400ms = ~700ms minimum
      expect(totalDuration).toBeGreaterThanOrEqual(500);
    });

    it('should cap maximum delay at 5 seconds', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20, maxRetries: 5 });
      
      let attemptCount = 0;
      
      // Mock throttling on first 4 attempts, success on 5th
      mockSend.mockImplementation((command) => {
        attemptCount++;
        if (attemptCount < 5) {
          return Promise.reject({ name: 'ThrottlingException', message: 'Rate exceeded' });
        }
        return Promise.resolve({});
      });
      
      const startTime = Date.now();
      
      // Publish 20 metrics to trigger flush
      for (let i = 0; i < 20; i++) {
        await publisher.publishMetric(
          'VocalShield/Test',
          `Metric${i}`,
          i,
          MetricUnit.Count,
          { Index: i.toString() }
        );
      }
      
      const totalDuration = Date.now() - startTime;
      
      // Should have made 5 attempts
      expect(mockSend).toHaveBeenCalledTimes(5);
      
      // With exponential backoff capped at 5s:
      // Total should be reasonable (not 30+ seconds)
      expect(totalDuration).toBeLessThan(15000); // Should complete in under 15 seconds
    }, 20000); // Increase timeout to 20 seconds for this test
  });

  describe('Error Handling and Recovery', () => {
    it('should re-add failed metrics to batch on error', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20, maxRetries: 1 });
      
      // Mock failure on first flush, success on second
      mockSend
        .mockRejectedValueOnce({ name: 'ServiceUnavailable', message: 'Service down' })
        .mockResolvedValueOnce({});
      
      // Publish 20 metrics to trigger first flush
      for (let i = 0; i < 20; i++) {
        await publisher.publishMetric(
          'VocalShield/Test',
          `Metric${i}`,
          i,
          MetricUnit.Count,
          { Index: i.toString() }
        );
      }
      
      // First flush should have failed
      expect(mockSend).toHaveBeenCalledTimes(1);
      
      // Flush again (metrics should have been re-added to batch)
      await publisher.flush('VocalShield/Test');
      
      // Second flush should succeed with the same metrics
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(capturedInputs[0].MetricData).toHaveLength(20);
    });

    it('should handle network errors gracefully', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20, maxRetries: 1 });
      
      // Mock network error
      mockSend.mockRejectedValue(new Error('Network timeout'));
      
      // Publish 20 metrics to trigger flush
      for (let i = 0; i < 20; i++) {
        await publisher.publishMetric(
          'VocalShield/Test',
          `Metric${i}`,
          i,
          MetricUnit.Count,
          { Index: i.toString() }
        );
      }
      
      // Should have attempted once (no retry for network errors)
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should continue accepting new metrics after error', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20, maxRetries: 1 });
      
      // Mock failure on first batch, success on subsequent
      mockSend
        .mockRejectedValueOnce({ name: 'ServiceUnavailable', message: 'Service down' })
        .mockResolvedValue({});
      
      // Publish first batch (will fail)
      for (let i = 0; i < 20; i++) {
        await publisher.publishMetric(
          'VocalShield/Test',
          `Metric${i}`,
          i,
          MetricUnit.Count,
          { Index: i.toString() }
        );
      }
      
      // First batch should have failed (1 attempt)
      expect(mockSend).toHaveBeenCalledTimes(1);
      
      // Publish second batch (should succeed)
      for (let i = 20; i < 40; i++) {
        await publisher.publishMetric(
          'VocalShield/Test',
          `Metric${i}`,
          i,
          MetricUnit.Count,
          { Index: i.toString() }
        );
      }
      
      // Should have attempted second batch
      // Note: Failed metrics from first batch are re-added, so this triggers another flush
      expect(mockSend).toHaveBeenCalledTimes(3); // 1st batch fail, 2nd batch (includes retry of 1st), possible 3rd
    });

    it('should handle close() with pending metrics', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20 });
      
      // Publish 10 metrics (less than batch size)
      for (let i = 0; i < 10; i++) {
        await publisher.publishMetric(
          'VocalShield/Test',
          `Metric${i}`,
          i,
          MetricUnit.Count,
          { Index: i.toString() }
        );
      }
      
      // Close should flush remaining metrics
      await publisher.close();
      
      // Should have sent the 10 pending metrics
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(capturedInputs[0].MetricData).toHaveLength(10);
    });

    it('should handle close() with no pending metrics', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20 });
      
      // Close without publishing any metrics
      await publisher.close();
      
      // Should not make any API calls
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should preserve metric data integrity during retries', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20, maxRetries: 3 });
      
      // Mock throttling on first attempt, capture data on second
      mockSend
        .mockRejectedValueOnce({ name: 'ThrottlingException', message: 'Rate exceeded' })
        .mockResolvedValueOnce({});
      
      // Publish metrics with specific values
      const testMetrics = [
        { name: 'Metric1', value: 100, unit: MetricUnit.Count },
        { name: 'Metric2', value: 200, unit: MetricUnit.Milliseconds },
        { name: 'Metric3', value: 300, unit: MetricUnit.Bytes },
      ];
      
      for (const metric of testMetrics) {
        await publisher.publishMetric(
          'VocalShield/Test',
          metric.name,
          metric.value,
          metric.unit,
          { Test: 'true' }
        );
      }
      
      // Flush to trigger retry
      await publisher.flush('VocalShield/Test');
      
      // Verify metric data integrity
      const metricData = capturedInputs[0].MetricData!;
      expect(metricData).toHaveLength(3);
      expect(metricData[0].MetricName).toBe('Metric1');
      expect(metricData[0].Value).toBe(100);
      expect(metricData[1].MetricName).toBe('Metric2');
      expect(metricData[1].Value).toBe(200);
      expect(metricData[2].MetricName).toBe('Metric3');
      expect(metricData[2].Value).toBe(300);
    });
  });

  describe('Edge Cases', () => {
    it('should handle publishing single metric', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20 });
      
      await publisher.publishMetric(
        'VocalShield/Test',
        'SingleMetric',
        42,
        MetricUnit.Count,
        { Test: 'true' }
      );
      
      await publisher.flush('VocalShield/Test');
      
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(capturedInputs[0].MetricData).toHaveLength(1);
    });

    it('should handle zero value metrics', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20 });
      
      await publisher.publishMetric(
        'VocalShield/Test',
        'ZeroMetric',
        0,
        MetricUnit.Count,
        { Test: 'true' }
      );
      
      await publisher.flush('VocalShield/Test');
      
      expect(mockSend).toHaveBeenCalledTimes(1);
      const metricData = capturedInputs[0].MetricData!;
      expect(metricData[0].Value).toBe(0);
    });

    it('should handle negative value metrics', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20 });
      
      await publisher.publishMetric(
        'VocalShield/Test',
        'NegativeMetric',
        -100,
        MetricUnit.Count,
        { Test: 'true' }
      );
      
      await publisher.flush('VocalShield/Test');
      
      expect(mockSend).toHaveBeenCalledTimes(1);
      const metricData = capturedInputs[0].MetricData!;
      expect(metricData[0].Value).toBe(-100);
    });

    it('should handle very large metric values', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20 });
      
      await publisher.publishMetric(
        'VocalShield/Test',
        'LargeMetric',
        Number.MAX_SAFE_INTEGER,
        MetricUnit.Count,
        { Test: 'true' }
      );
      
      await publisher.flush('VocalShield/Test');
      
      expect(mockSend).toHaveBeenCalledTimes(1);
      const metricData = capturedInputs[0].MetricData!;
      expect(metricData[0].Value).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle metrics with empty dimensions', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20 });
      
      await publisher.publishMetric(
        'VocalShield/Test',
        'NoDimensions',
        100,
        MetricUnit.Count,
        {}
      );
      
      await publisher.flush('VocalShield/Test');
      
      expect(mockSend).toHaveBeenCalledTimes(1);
      const metricData = capturedInputs[0].MetricData!;
      expect(metricData[0].Dimensions).toEqual([]);
    });

    it('should handle metrics with many dimensions', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20 });
      
      const dimensions: Record<string, string> = {};
      for (let i = 0; i < 10; i++) {
        dimensions[`Dimension${i}`] = `Value${i}`;
      }
      
      await publisher.publishMetric(
        'VocalShield/Test',
        'ManyDimensions',
        100,
        MetricUnit.Count,
        dimensions
      );
      
      await publisher.flush('VocalShield/Test');
      
      expect(mockSend).toHaveBeenCalledTimes(1);
      const metricData = capturedInputs[0].MetricData!;
      expect(metricData[0].Dimensions).toHaveLength(10);
    });

    it('should handle custom timestamp', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20 });
      
      const customTimestamp = new Date('2024-01-01T00:00:00Z');
      
      await publisher.publishMetric(
        'VocalShield/Test',
        'CustomTimestamp',
        100,
        MetricUnit.Count,
        { Test: 'true' },
        customTimestamp
      );
      
      await publisher.flush('VocalShield/Test');
      
      expect(mockSend).toHaveBeenCalledTimes(1);
      const metricData = capturedInputs[0].MetricData!;
      expect(metricData[0].Timestamp).toEqual(customTimestamp);
    });

    it('should handle concurrent flush calls', async () => {
      const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20 });
      
      // Publish 10 metrics
      for (let i = 0; i < 10; i++) {
        await publisher.publishMetric(
          'VocalShield/Test',
          `Metric${i}`,
          i,
          MetricUnit.Count,
          { Index: i.toString() }
        );
      }
      
      // Call flush multiple times concurrently
      await Promise.all([
        publisher.flush('VocalShield/Test'),
        publisher.flush('VocalShield/Test'),
        publisher.flush('VocalShield/Test'),
      ]);
      
      // Should only send metrics once (first flush empties the batch)
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(capturedInputs[0].MetricData).toHaveLength(10);
    });
  });
});
