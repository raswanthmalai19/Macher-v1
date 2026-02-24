/**
 * Property-based tests for Cold Start Tracking
 * 
 * Feature: monitoring-and-observability
 * Property 12: Cold Start Tracking
 * 
 * Validates: Requirements 7.4
 * 
 * Property: For any Lambda function invocation that is a cold start,
 * a metric should be published indicating cold start occurrence and duration.
 */

import * as fc from 'fast-check';
import { ColdStartTracker } from '../../lib/monitoring/cold-start-tracker';
import { MetricPublisher } from '../../lib/monitoring/metric-publisher';
import { MetricUnit } from '../../lib/monitoring/types';

// Mock MetricPublisher
jest.mock('../../lib/monitoring/metric-publisher');

describe('Property 12: Cold Start Tracking', () => {
  let mockMetricPublisher: jest.Mocked<MetricPublisher>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMetricPublisher = {
      publishMetric: jest.fn().mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(undefined),
      publishBusinessKPI: jest.fn().mockResolvedValue(undefined),
      getUniqueMetricCount: jest.fn().mockReturnValue(0),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;
  });

  it('should publish cold start metrics for first invocation of any function', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }), // Function name
        async (functionName) => {
          // Clear mock before each iteration
          jest.clearAllMocks();
          
          // Create fresh tracker for each test case
          const tracker = new ColdStartTracker({
            metricPublisher: mockMetricPublisher,
            namespace: 'Test/Performance',
          });

          // Track first invocation (should be cold start)
          const result = await tracker.trackInvocation(functionName);

          // Property: First invocation is always a cold start
          expect(result.isColdStart).toBe(true);
          expect(result.duration).toBeGreaterThanOrEqual(0); // Duration can be 0 if invocation is immediate

          // Property: Cold start metrics are published
          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
            'Test/Performance',
            'ColdStartOccurrence',
            1,
            MetricUnit.Count,
            { FunctionName: functionName },
            expect.any(Date)
          );

          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
            'Test/Performance',
            'ColdStartDuration',
            expect.any(Number),
            MetricUnit.Milliseconds,
            { FunctionName: functionName },
            expect.any(Date)
          );

          // Property: Metrics are flushed
          expect(mockMetricPublisher.flush).toHaveBeenCalledWith('Test/Performance');

          // Verify duration is non-negative
          const durationCall = mockMetricPublisher.publishMetric.mock.calls.find(
            call => call[1] === 'ColdStartDuration'
          );
          expect(durationCall![2]).toBeGreaterThanOrEqual(0);
          // Duration should be close to result.duration (allow small timing differences)
          expect(Math.abs((durationCall![2] as number) - result.duration!)).toBeLessThanOrEqual(2);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should not publish metrics for warm starts (subsequent invocations)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }), // Function name
        fc.integer({ min: 1, max: 10 }), // Number of warm invocations
        async (functionName, warmInvocations) => {
          // Create fresh tracker
          const tracker = new ColdStartTracker({
            metricPublisher: mockMetricPublisher,
            namespace: 'Test/Performance',
          });

          // First invocation (cold start)
          const coldStart = await tracker.trackInvocation(functionName);
          expect(coldStart.isColdStart).toBe(true);

          // Clear mock calls
          jest.clearAllMocks();

          // Subsequent invocations (warm starts)
          for (let i = 0; i < warmInvocations; i++) {
            const warmStart = await tracker.trackInvocation(functionName);

            // Property: Subsequent invocations are warm starts
            expect(warmStart.isColdStart).toBe(false);
            expect(warmStart.duration).toBeUndefined();
          }

          // Property: No metrics published for warm starts
          expect(mockMetricPublisher.publishMetric).not.toHaveBeenCalled();
          expect(mockMetricPublisher.flush).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should track invocation count correctly across cold and warm starts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }), // Function name
        fc.integer({ min: 0, max: 20 }), // Number of invocations
        async (functionName, totalInvocations) => {
          // Clear mock before each iteration
          jest.clearAllMocks();
          
          // Create fresh tracker
          const tracker = new ColdStartTracker({
            metricPublisher: mockMetricPublisher,
            namespace: 'Test/Performance',
          });

          // Track invocations
          for (let i = 0; i < totalInvocations; i++) {
            await tracker.trackInvocation(functionName);
          }

          // Property: Invocation count matches total invocations
          expect(tracker.getInvocationCount()).toBe(totalInvocations);

          // Property: Only first invocation publishes metrics (if any invocations occurred)
          if (totalInvocations > 0) {
            // First invocation publishes 2 metrics (Occurrence + Duration)
            expect(mockMetricPublisher.publishMetric).toHaveBeenCalledTimes(2);
            expect(tracker.isWarmStart()).toBe(true);
          } else {
            // No invocations = no metrics published
            expect(mockMetricPublisher.publishMetric).not.toHaveBeenCalled();
            expect(tracker.isWarmStart()).toBe(false);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should calculate cold start duration as time from initialization to first invocation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }), // Function name
        fc.integer({ min: 0, max: 100 }), // Delay in milliseconds
        async (functionName, delayMs) => {
          // Clear mock before each iteration
          jest.clearAllMocks();
          
          // Create fresh tracker
          const tracker = new ColdStartTracker({
            metricPublisher: mockMetricPublisher,
            namespace: 'Test/Performance',
          });

          const initTime = tracker.getInitializationTime();

          // Wait for specified delay
          if (delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }

          // Track invocation
          const beforeInvocation = Date.now();
          const result = await tracker.trackInvocation(functionName);
          const afterInvocation = Date.now();

          // Property: Duration is time from initialization to invocation
          expect(result.duration).toBeGreaterThanOrEqual(beforeInvocation - initTime - 10); // Allow 10ms tolerance
          expect(result.duration).toBeLessThanOrEqual(afterInvocation - initTime + 10); // Allow 10ms tolerance

          // Property: Duration matches published metric (with tolerance for timing differences)
          const durationCall = mockMetricPublisher.publishMetric.mock.calls.find(
            call => call[1] === 'ColdStartDuration'
          );
          // Allow larger tolerance for timing differences (up to 20ms)
          expect(Math.abs((durationCall![2] as number) - result.duration!)).toBeLessThanOrEqual(20);
        }
      ),
      { numRuns: 20 } // Fewer runs due to delays
    );
  });

  it('should publish metrics with correct dimensions for any function name', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 128 }), // Function name (allow longer names)
        async (functionName) => {
          // Clear mock before each iteration
          jest.clearAllMocks();
          
          // Create fresh tracker
          const tracker = new ColdStartTracker({
            metricPublisher: mockMetricPublisher,
            namespace: 'Test/Performance',
          });

          await tracker.trackInvocation(functionName);

          // Property: Both metrics use the same dimensions
          const occurrenceCall = mockMetricPublisher.publishMetric.mock.calls.find(
            call => call[1] === 'ColdStartOccurrence'
          );
          const durationCall = mockMetricPublisher.publishMetric.mock.calls.find(
            call => call[1] === 'ColdStartDuration'
          );

          expect(occurrenceCall![4]).toEqual({ FunctionName: functionName });
          expect(durationCall![4]).toEqual({ FunctionName: functionName });

          // Property: Both metrics use the same timestamp
          expect(occurrenceCall![5]).toEqual(durationCall![5]);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should handle metric publishing failures gracefully without throwing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }), // Function name
        fc.constantFrom(
          'ThrottlingException',
          'ServiceUnavailable',
          'NetworkError',
          'TimeoutError'
        ), // Error types
        async (functionName, errorType) => {
          // Mock metric publisher to throw error
          mockMetricPublisher.publishMetric.mockRejectedValue(new Error(errorType));

          // Create fresh tracker
          const tracker = new ColdStartTracker({
            metricPublisher: mockMetricPublisher,
            namespace: 'Test/Performance',
          });

          // Property: Should not throw even if metric publishing fails
          await expect(tracker.trackInvocation(functionName)).resolves.toBeDefined();

          // Property: Should still return cold start info
          const result = await tracker.trackInvocation(functionName);
          expect(result.isColdStart).toBe(false); // Second invocation is warm
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should maintain state consistency across multiple invocations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }), // Function name
        fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }), // Sequence of invocations
        async (functionName, invocationSequence) => {
          // Clear mock before each iteration
          jest.clearAllMocks();
          
          // Create fresh tracker
          const tracker = new ColdStartTracker({
            metricPublisher: mockMetricPublisher,
            namespace: 'Test/Performance',
          });

          let coldStartCount = 0;
          let warmStartCount = 0;

          for (let i = 0; i < invocationSequence.length; i++) {
            const result = await tracker.trackInvocation(functionName);

            if (result.isColdStart) {
              coldStartCount++;
            } else {
              warmStartCount++;
            }

            // Property: Only first invocation is cold start
            if (i === 0) {
              expect(result.isColdStart).toBe(true);
              expect(result.duration).toBeGreaterThanOrEqual(0); // Can be 0 if immediate
            } else {
              expect(result.isColdStart).toBe(false);
              expect(result.duration).toBeUndefined();
            }

            // Property: Invocation count is accurate
            expect(tracker.getInvocationCount()).toBe(i + 1);

            // Property: Warm start status is correct (after first invocation)
            if (i === 0) {
              // After first invocation, it becomes warm
              expect(tracker.isWarmStart()).toBe(true);
            } else {
              expect(tracker.isWarmStart()).toBe(true);
            }
          }

          // Property: Exactly one cold start per execution environment
          expect(coldStartCount).toBe(1);
          expect(warmStartCount).toBe(invocationSequence.length - 1);
        }
      ),
      { numRuns: 20 }
    );
  });
});
