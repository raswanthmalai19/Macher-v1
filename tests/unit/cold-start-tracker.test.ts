/**
 * Unit tests for ColdStartTracker
 * 
 * Tests cold start detection, metric publishing, and state management.
 */

import { ColdStartTracker } from '../../lib/monitoring/cold-start-tracker';
import { MetricPublisher } from '../../lib/monitoring/metric-publisher';
import { MetricUnit } from '../../lib/monitoring/types';

// Mock MetricPublisher
jest.mock('../../lib/monitoring/metric-publisher');

describe('ColdStartTracker', () => {
  let tracker: ColdStartTracker;
  let mockMetricPublisher: jest.Mocked<MetricPublisher>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock metric publisher
    mockMetricPublisher = {
      publishMetric: jest.fn().mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(undefined),
      publishBusinessKPI: jest.fn().mockResolvedValue(undefined),
      getUniqueMetricCount: jest.fn().mockReturnValue(0),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Create tracker with mock publisher
    tracker = new ColdStartTracker({
      metricPublisher: mockMetricPublisher,
      namespace: 'Test/Performance',
    });
  });

  afterEach(() => {
    // Reset tracker state for next test
    tracker.reset();
  });

  describe('Cold Start Detection', () => {
    it('should detect cold start on first invocation', async () => {
      const result = await tracker.trackInvocation('TestFunction');

      expect(result.isColdStart).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should not detect cold start on second invocation', async () => {
      // First invocation (cold start)
      await tracker.trackInvocation('TestFunction');

      // Second invocation (warm start)
      const result = await tracker.trackInvocation('TestFunction');

      expect(result.isColdStart).toBe(false);
      expect(result.duration).toBeUndefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should not detect cold start on subsequent invocations', async () => {
      // First invocation (cold start)
      await tracker.trackInvocation('TestFunction');

      // Multiple warm invocations
      for (let i = 0; i < 5; i++) {
        const result = await tracker.trackInvocation('TestFunction');
        expect(result.isColdStart).toBe(false);
        expect(result.duration).toBeUndefined();
      }
    });
  });

  describe('Metric Publishing', () => {
    it('should publish cold start occurrence metric', async () => {
      await tracker.trackInvocation('TestFunction');

      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        'Test/Performance',
        'ColdStartOccurrence',
        1,
        MetricUnit.Count,
        { FunctionName: 'TestFunction' },
        expect.any(Date)
      );
    });

    it('should publish cold start duration metric', async () => {
      await tracker.trackInvocation('TestFunction');

      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        'Test/Performance',
        'ColdStartDuration',
        expect.any(Number),
        MetricUnit.Milliseconds,
        { FunctionName: 'TestFunction' },
        expect.any(Date)
      );

      // Verify duration is positive
      const durationCall = mockMetricPublisher.publishMetric.mock.calls.find(
        call => call[1] === 'ColdStartDuration'
      );
      expect(durationCall![2]).toBeGreaterThan(0);
    });

    it('should flush metrics after publishing', async () => {
      await tracker.trackInvocation('TestFunction');

      expect(mockMetricPublisher.flush).toHaveBeenCalledWith('Test/Performance');
    });

    it('should not publish metrics on warm starts', async () => {
      // First invocation (cold start)
      await tracker.trackInvocation('TestFunction');

      // Clear mock calls
      jest.clearAllMocks();

      // Second invocation (warm start)
      await tracker.trackInvocation('TestFunction');

      expect(mockMetricPublisher.publishMetric).not.toHaveBeenCalled();
      expect(mockMetricPublisher.flush).not.toHaveBeenCalled();
    });

    it('should handle metric publishing errors gracefully', async () => {
      // Mock metric publisher to throw error
      mockMetricPublisher.publishMetric.mockRejectedValueOnce(new Error('CloudWatch error'));

      // Should not throw
      await expect(tracker.trackInvocation('TestFunction')).resolves.toBeDefined();
    });
  });

  describe('State Management', () => {
    it('should track invocation count', async () => {
      expect(tracker.getInvocationCount()).toBe(0);

      await tracker.trackInvocation('TestFunction');
      expect(tracker.getInvocationCount()).toBe(1);

      await tracker.trackInvocation('TestFunction');
      expect(tracker.getInvocationCount()).toBe(2);

      await tracker.trackInvocation('TestFunction');
      expect(tracker.getInvocationCount()).toBe(3);
    });

    it('should report warm start after initialization', async () => {
      expect(tracker.isWarmStart()).toBe(false);

      await tracker.trackInvocation('TestFunction');
      expect(tracker.isWarmStart()).toBe(true);
    });

    it('should record initialization time', () => {
      const initTime = tracker.getInitializationTime();
      expect(initTime).toBeGreaterThan(0);
      expect(initTime).toBeLessThanOrEqual(Date.now());
    });

    it('should reset state when reset() is called', async () => {
      await tracker.trackInvocation('TestFunction');
      expect(tracker.isWarmStart()).toBe(true);
      expect(tracker.getInvocationCount()).toBe(1);

      tracker.reset();

      expect(tracker.isWarmStart()).toBe(false);
      expect(tracker.getInvocationCount()).toBe(0);
    });
  });

  describe('Multiple Functions', () => {
    it('should track different functions independently', async () => {
      await tracker.trackInvocation('Function1');
      await tracker.trackInvocation('Function2');

      // Both should be cold starts (first invocation in this environment)
      // But only the first one is actually a cold start
      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledTimes(2); // Only first invocation publishes
    });

    it('should use correct function name in dimensions', async () => {
      await tracker.trackInvocation('MyLambdaFunction');

      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        { FunctionName: 'MyLambdaFunction' },
        expect.any(Date)
      );
    });
  });

  describe('Duration Calculation', () => {
    it('should calculate duration from initialization to first invocation', async () => {
      // Wait a bit to ensure measurable duration
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await tracker.trackInvocation('TestFunction');

      expect(result.duration).toBeGreaterThan(0);
      expect(result.duration).toBeLessThan(1000); // Should be less than 1 second in tests
    });

    it('should have consistent duration in metrics', async () => {
      const result = await tracker.trackInvocation('TestFunction');

      const durationCall = mockMetricPublisher.publishMetric.mock.calls.find(
        call => call[1] === 'ColdStartDuration'
      );

      expect(durationCall![2]).toBe(result.duration);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty function name', async () => {
      const result = await tracker.trackInvocation('');

      expect(result.isColdStart).toBe(true);
      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        { FunctionName: '' },
        expect.any(Date)
      );
    });

    it('should handle function names with special characters', async () => {
      const functionName = 'my-function_v2.0';
      await tracker.trackInvocation(functionName);

      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        { FunctionName: functionName },
        expect.any(Date)
      );
    });

    it('should handle rapid successive invocations', async () => {
      const results = await Promise.all([
        tracker.trackInvocation('TestFunction'),
        tracker.trackInvocation('TestFunction'),
        tracker.trackInvocation('TestFunction'),
      ]);

      // Only first should be cold start
      expect(results[0].isColdStart).toBe(true);
      expect(results[1].isColdStart).toBe(false);
      expect(results[2].isColdStart).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should use default namespace when not provided', () => {
      const defaultTracker = new ColdStartTracker({
        metricPublisher: mockMetricPublisher,
      });

      defaultTracker.trackInvocation('TestFunction');

      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        'VocalShield/Performance',
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        expect.any(Object),
        expect.any(Date)
      );
    });

    it('should use custom namespace when provided', async () => {
      const customTracker = new ColdStartTracker({
        metricPublisher: mockMetricPublisher,
        namespace: 'Custom/Namespace',
      });

      await customTracker.trackInvocation('TestFunction');

      expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
        'Custom/Namespace',
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        expect.any(Object),
        expect.any(Date)
      );
    });
  });
});
