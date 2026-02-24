/**
 * Unit Tests for PercentileCalculator
 * 
 * These tests validate:
 * - Percentile calculation correctness
 * - Edge cases (empty arrays, single values, duplicates)
 * - Algorithm selection (sort vs quickselect)
 * - Metric publishing
 * - Auto-publish functionality
 */

import { PercentileCalculator } from '../../lib/monitoring/percentile-calculator';
import { MetricPublisher } from '../../lib/monitoring/metric-publisher';
import { MetricUnit } from '../../lib/monitoring/types';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

// Mock CloudWatch client
jest.mock('@aws-sdk/client-cloudwatch');

// Mock the logger
jest.mock('../../lib/monitoring/structured-logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  },
}));

describe('PercentileCalculator', () => {
  let mockSend: jest.Mock;
  let mockCloudWatchClient: jest.Mocked<CloudWatchClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSend = jest.fn().mockResolvedValue({});
    mockCloudWatchClient = {
      send: mockSend,
    } as unknown as jest.Mocked<CloudWatchClient>;
    
    (CloudWatchClient as jest.MockedClass<typeof CloudWatchClient>).mockImplementation(() => mockCloudWatchClient);
  });

  describe('calculate()', () => {
    test('should calculate P50 correctly for small array', () => {
      const calculator = new PercentileCalculator();
      const latencies = [100, 200, 300, 400, 500];
      
      const p50 = calculator.calculate(latencies, 50);
      
      // P50 of [100, 200, 300, 400, 500] should be 300 (median)
      expect(p50).toBe(300);
    });

    test('should calculate P90 correctly for small array', () => {
      const calculator = new PercentileCalculator();
      const latencies = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      
      const p90 = calculator.calculate(latencies, 90);
      
      // P90 should be 900 (90th percentile)
      expect(p90).toBe(900);
    });

    test('should calculate P99 correctly for small array', () => {
      const calculator = new PercentileCalculator();
      const latencies = Array.from({ length: 100 }, (_, i) => (i + 1) * 10);
      
      const p99 = calculator.calculate(latencies, 99);
      
      // P99 of 100 values should be 990
      expect(p99).toBe(990);
    });

    test('should handle single value array', () => {
      const calculator = new PercentileCalculator();
      const latencies = [500];
      
      const p50 = calculator.calculate(latencies, 50);
      const p90 = calculator.calculate(latencies, 90);
      const p99 = calculator.calculate(latencies, 99);
      
      expect(p50).toBe(500);
      expect(p90).toBe(500);
      expect(p99).toBe(500);
    });

    test('should handle array with duplicate values', () => {
      const calculator = new PercentileCalculator();
      const latencies = [100, 100, 100, 200, 200, 300, 300, 300, 300];
      
      const p50 = calculator.calculate(latencies, 50);
      
      // P50 should be around 200-300
      expect(p50).toBeGreaterThanOrEqual(200);
      expect(p50).toBeLessThanOrEqual(300);
    });

    test('should handle unsorted array', () => {
      const calculator = new PercentileCalculator();
      const latencies = [500, 100, 300, 200, 400];
      
      const p50 = calculator.calculate(latencies, 50);
      
      // P50 of [100, 200, 300, 400, 500] should be 300
      expect(p50).toBe(300);
    });

    test('should throw error for empty array', () => {
      const calculator = new PercentileCalculator();
      
      expect(() => calculator.calculate([], 50)).toThrow('Cannot calculate percentile of empty array');
    });

    test('should throw error for invalid percentile', () => {
      const calculator = new PercentileCalculator();
      const latencies = [100, 200, 300];
      
      expect(() => calculator.calculate(latencies, -1)).toThrow('Percentile must be between 0 and 100');
      expect(() => calculator.calculate(latencies, 101)).toThrow('Percentile must be between 0 and 100');
    });

    test('should use quickselect for large arrays', () => {
      const calculator = new PercentileCalculator();
      // Create array with 200 elements (> 100 threshold)
      const latencies = Array.from({ length: 200 }, (_, i) => Math.random() * 1000);
      
      const p50 = calculator.calculate(latencies, 50);
      const p90 = calculator.calculate(latencies, 90);
      const p99 = calculator.calculate(latencies, 99);
      
      // Verify results are reasonable
      expect(p50).toBeGreaterThan(0);
      expect(p90).toBeGreaterThan(p50);
      expect(p99).toBeGreaterThan(p90);
    });

    test('should calculate P0 (minimum)', () => {
      const calculator = new PercentileCalculator();
      const latencies = [100, 200, 300, 400, 500];
      
      const p0 = calculator.calculate(latencies, 0);
      
      expect(p0).toBe(100);
    });

    test('should calculate P100 (maximum)', () => {
      const calculator = new PercentileCalculator();
      const latencies = [100, 200, 300, 400, 500];
      
      const p100 = calculator.calculate(latencies, 100);
      
      expect(p100).toBe(500);
    });

    test('should not modify original array', () => {
      const calculator = new PercentileCalculator();
      const latencies = [500, 100, 300, 200, 400];
      const original = [...latencies];
      
      calculator.calculate(latencies, 50);
      
      expect(latencies).toEqual(original);
    });
  });

  describe('recordLatency()', () => {
    test('should record latency for endpoint', () => {
      const calculator = new PercentileCalculator();
      
      calculator.recordLatency('/analyze', 150);
      calculator.recordLatency('/analyze', 200);
      calculator.recordLatency('/analyze', 250);
      
      const stats = calculator.getBufferStats();
      expect(stats.get('/analyze')).toBe(3);
    });

    test('should record latencies for multiple endpoints', () => {
      const calculator = new PercentileCalculator();
      
      calculator.recordLatency('/analyze', 150);
      calculator.recordLatency('/connect', 50);
      calculator.recordLatency('/analyze', 200);
      calculator.recordLatency('/disconnect', 30);
      
      const stats = calculator.getBufferStats();
      expect(stats.get('/analyze')).toBe(2);
      expect(stats.get('/connect')).toBe(1);
      expect(stats.get('/disconnect')).toBe(1);
    });
  });

  describe('publishPercentileMetrics()', () => {
    test('should publish P50, P90, P99 metrics', async () => {
      const metricPublisher = new MetricPublisher();
      const calculator = new PercentileCalculator({ metricPublisher });
      const latencies = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      
      await calculator.publishPercentileMetrics('/analyze', latencies);
      
      // Should call CloudWatch API (flush is called internally)
      expect(mockSend).toHaveBeenCalled();
      
      // Get all published metrics
      const commands = mockSend.mock.calls.map(call => call[0] as PutMetricDataCommand);
      const allMetrics = commands.flatMap(cmd => cmd.input?.MetricData || []);
      
      // Should have published 3 metrics (P50, P90, P99)
      expect(allMetrics.length).toBe(3);
      
      // Verify metric names
      const metricNames = allMetrics.map(m => m.MetricName);
      expect(metricNames).toContain('P50Latency');
      expect(metricNames).toContain('P90Latency');
      expect(metricNames).toContain('P99Latency');
    });

    test('should include endpoint dimension', async () => {
      const metricPublisher = new MetricPublisher();
      const calculator = new PercentileCalculator({ metricPublisher });
      const latencies = [100, 200, 300];
      
      await calculator.publishPercentileMetrics('/test-endpoint', latencies);
      
      const commands = mockSend.mock.calls.map(call => call[0] as PutMetricDataCommand);
      const allMetrics = commands.flatMap(cmd => cmd.input?.MetricData || []);
      
      // All metrics should have endpoint dimension
      for (const metric of allMetrics) {
        const dimensions = metric.Dimensions || [];
        const endpointDim = dimensions.find(d => d.Name === 'Endpoint');
        expect(endpointDim).toBeDefined();
        expect(endpointDim?.Value).toBe('/test-endpoint');
      }
    });

    test('should use Milliseconds unit', async () => {
      const metricPublisher = new MetricPublisher();
      const calculator = new PercentileCalculator({ metricPublisher });
      const latencies = [100, 200, 300];
      
      await calculator.publishPercentileMetrics('/analyze', latencies);
      
      const commands = mockSend.mock.calls.map(call => call[0] as PutMetricDataCommand);
      const allMetrics = commands.flatMap(cmd => cmd.input?.MetricData || []);
      
      // All metrics should use Milliseconds unit
      for (const metric of allMetrics) {
        expect(metric.Unit).toBe(MetricUnit.Milliseconds);
      }
    });

    test('should not publish for empty latencies', async () => {
      const metricPublisher = new MetricPublisher();
      const calculator = new PercentileCalculator({ metricPublisher });
      
      await calculator.publishPercentileMetrics('/analyze', []);
      
      // Should not call CloudWatch API
      expect(mockSend).not.toHaveBeenCalled();
    });

    test('should use correct namespace', async () => {
      const metricPublisher = new MetricPublisher();
      const calculator = new PercentileCalculator({ metricPublisher, namespace: 'CustomNamespace' });
      const latencies = [100, 200, 300];
      
      await calculator.publishPercentileMetrics('/analyze', latencies);
      
      // Should have called CloudWatch API
      expect(mockSend).toHaveBeenCalled();
      
      const commands = mockSend.mock.calls.map(call => call[0] as PutMetricDataCommand);
      
      // All commands should use custom namespace
      for (const command of commands) {
        expect(command.input?.Namespace).toBe('CustomNamespace');
      }
    });

    test('should handle publishing errors gracefully', async () => {
      mockSend.mockRejectedValueOnce(new Error('CloudWatch error'));
      
      const metricPublisher = new MetricPublisher();
      const calculator = new PercentileCalculator({ metricPublisher });
      const latencies = [100, 200, 300];
      
      // Should not throw
      await expect(calculator.publishPercentileMetrics('/analyze', latencies)).resolves.not.toThrow();
    });
  });

  describe('publishAllMetrics()', () => {
    test('should publish metrics for all recorded endpoints', async () => {
      const metricPublisher = new MetricPublisher();
      const calculator = new PercentileCalculator({ metricPublisher });
      
      calculator.recordLatency('/analyze', 100);
      calculator.recordLatency('/analyze', 200);
      calculator.recordLatency('/connect', 50);
      calculator.recordLatency('/connect', 60);
      
      await calculator.publishAllMetrics();
      
      // Should publish metrics for both endpoints
      expect(mockSend).toHaveBeenCalled();
      
      const commands = mockSend.mock.calls.map(call => call[0] as PutMetricDataCommand);
      const allMetrics = commands.flatMap(cmd => cmd.input?.MetricData || []);
      
      // Should have metrics for both endpoints (3 metrics per endpoint = 6 total)
      expect(allMetrics.length).toBe(6);
      
      // Get unique endpoints from dimensions
      const endpoints = new Set(
        allMetrics.flatMap(m => m.Dimensions || [])
          .filter(d => d.Name === 'Endpoint')
          .map(d => d.Value)
      );
      
      expect(endpoints.size).toBe(2);
      expect(endpoints.has('/analyze')).toBe(true);
      expect(endpoints.has('/connect')).toBe(true);
    });

    test('should clear buffers after publishing', async () => {
      const metricPublisher = new MetricPublisher();
      const calculator = new PercentileCalculator({ metricPublisher });
      
      calculator.recordLatency('/analyze', 100);
      calculator.recordLatency('/analyze', 200);
      
      await calculator.publishAllMetrics();
      
      const stats = calculator.getBufferStats();
      expect(stats.size).toBe(0);
    });

    test('should not publish if no latencies recorded', async () => {
      const metricPublisher = new MetricPublisher();
      const calculator = new PercentileCalculator({ metricPublisher });
      
      await calculator.publishAllMetrics();
      
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('Auto-publish functionality', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should start auto-publish', () => {
      const calculator = new PercentileCalculator({ publishInterval: 1000 });
      
      calculator.startAutoPublish();
      
      // Should not throw
      expect(() => calculator.stopAutoPublish()).not.toThrow();
    });

    test('should publish metrics at interval', async () => {
      const metricPublisher = new MetricPublisher();
      const calculator = new PercentileCalculator({ metricPublisher, publishInterval: 100 });
      
      calculator.recordLatency('/analyze', 100);
      calculator.startAutoPublish();
      
      // Fast-forward time by 100ms
      jest.advanceTimersByTime(100);
      
      // Wait for async operations to complete
      await new Promise(resolve => setImmediate(resolve));
      
      // Should have published metrics
      expect(mockSend).toHaveBeenCalled();
      
      calculator.stopAutoPublish();
    });

    test('should not start auto-publish twice', () => {
      const calculator = new PercentileCalculator({ publishInterval: 1000 });
      
      calculator.startAutoPublish();
      calculator.startAutoPublish(); // Second call should be ignored
      
      calculator.stopAutoPublish();
    });

    test('should stop auto-publish', () => {
      const calculator = new PercentileCalculator({ publishInterval: 1000 });
      
      calculator.startAutoPublish();
      calculator.stopAutoPublish();
      
      // Should not throw when stopping again
      expect(() => calculator.stopAutoPublish()).not.toThrow();
    });
  });

  describe('getBufferStats()', () => {
    test('should return empty map initially', () => {
      const calculator = new PercentileCalculator();
      
      const stats = calculator.getBufferStats();
      
      expect(stats.size).toBe(0);
    });

    test('should return correct buffer sizes', () => {
      const calculator = new PercentileCalculator();
      
      calculator.recordLatency('/analyze', 100);
      calculator.recordLatency('/analyze', 200);
      calculator.recordLatency('/connect', 50);
      
      const stats = calculator.getBufferStats();
      
      expect(stats.get('/analyze')).toBe(2);
      expect(stats.get('/connect')).toBe(1);
    });
  });

  describe('close()', () => {
    test('should stop auto-publish and flush metrics', async () => {
      const metricPublisher = new MetricPublisher();
      const calculator = new PercentileCalculator({ metricPublisher });
      
      calculator.recordLatency('/analyze', 100);
      calculator.startAutoPublish();
      
      await calculator.close();
      
      // Should have published metrics
      expect(mockSend).toHaveBeenCalled();
      
      // Buffers should be cleared
      const stats = calculator.getBufferStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('Edge cases', () => {
    test('should handle very large latency values', () => {
      const calculator = new PercentileCalculator();
      const latencies = [1000000, 2000000, 3000000];
      
      const p50 = calculator.calculate(latencies, 50);
      
      expect(p50).toBe(2000000);
    });

    test('should handle very small latency values', () => {
      const calculator = new PercentileCalculator();
      const latencies = [0.1, 0.2, 0.3];
      
      const p50 = calculator.calculate(latencies, 50);
      
      expect(p50).toBeCloseTo(0.2, 1);
    });

    test('should handle negative latency values', () => {
      const calculator = new PercentileCalculator();
      const latencies = [-100, 0, 100];
      
      const p50 = calculator.calculate(latencies, 50);
      
      expect(p50).toBe(0);
    });

    test('should handle floating point latencies', () => {
      const calculator = new PercentileCalculator();
      const latencies = [100.5, 200.7, 300.3];
      
      const p50 = calculator.calculate(latencies, 50);
      
      expect(p50).toBeCloseTo(200.7, 1);
    });
  });
});
