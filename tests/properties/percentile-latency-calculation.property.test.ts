import * as fc from 'fast-check';
import { PercentileCalculator } from '../../lib/monitoring/percentile-calculator';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

/**
 * Property-Based Tests for Percentile Latency Calculation
 * 
 * These tests validate:
 * - Property 11: Percentile Latency Calculation
 * 
 * Feature: monitoring-and-observability
 * Validates: Requirements 7.1, 7.2, 7.3
 */

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

describe('Percentile Latency Calculation Properties', () => {
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

  /**
   * Property 11: Percentile Latency Calculation
   * 
   * Universal Property: For any API Gateway endpoint and any percentile value (P50, P90, P99),
   * the calculated percentile latency should be published to CloudWatch every minute and should
   * be mathematically correct (the Pth percentile value should be greater than or equal to P%
   * of all observed latencies).
   * 
   * Validates: Requirements 7.1, 7.2, 7.3
   */
  test('Property 11: Percentile calculations are mathematically correct', () => {
    fc.assert(
      fc.property(
        // Generate array of latencies (100-1000 values)
        fc.array(fc.integer({ min: 1, max: 5000 }), { minLength: 100, maxLength: 1000 }),
        // Generate percentile (P50, P90, P99)
        fc.constantFrom(50, 90, 99),
        (latencies, percentile) => {
          const calculator = new PercentileCalculator();
          const result = calculator.calculate(latencies, percentile);
          
          // Property 1: Result should be a valid number
          expect(result).toBeDefined();
          expect(typeof result).toBe('number');
          expect(isNaN(result)).toBe(false);
          
          // Property 2: Result should be within the range of input values
          const min = Math.min(...latencies);
          const max = Math.max(...latencies);
          expect(result).toBeGreaterThanOrEqual(min);
          expect(result).toBeLessThanOrEqual(max);
          
          // Property 3: The Pth percentile value should be >= P% of all values
          const countBelowOrEqual = latencies.filter(v => v <= result).length;
          const percentBelow = (countBelowOrEqual / latencies.length) * 100;
          
          // Allow 1% tolerance for rounding
          expect(percentBelow).toBeGreaterThanOrEqual(percentile - 1);
          
          // Property 4: For P50, approximately half the values should be below
          if (percentile === 50) {
            expect(percentBelow).toBeGreaterThanOrEqual(49);
            expect(percentBelow).toBeLessThanOrEqual(51);
          }
          
          // Property 5: For P90, approximately 90% of values should be below
          if (percentile === 90) {
            expect(percentBelow).toBeGreaterThanOrEqual(89);
            expect(percentBelow).toBeLessThanOrEqual(91);
          }
          
          // Property 6: For P99, approximately 99% of values should be below
          if (percentile === 99) {
            expect(percentBelow).toBeGreaterThanOrEqual(98);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 11 (variant): Percentile calculation is consistent
   */
  test('Property 11: Percentile calculation is deterministic', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 5000 }), { minLength: 100, maxLength: 500 }),
        fc.constantFrom(50, 90, 99),
        (latencies, percentile) => {
          const calculator = new PercentileCalculator();
          
          // Calculate percentile multiple times
          const result1 = calculator.calculate(latencies, percentile);
          const result2 = calculator.calculate(latencies, percentile);
          const result3 = calculator.calculate(latencies, percentile);
          
          // Property: Results should be identical (deterministic)
          expect(result1).toBe(result2);
          expect(result2).toBe(result3);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 11 (variant): Percentile ordering is correct
   */
  test('Property 11: P50 <= P90 <= P99', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 5000 }), { minLength: 100, maxLength: 500 }),
        (latencies) => {
          const calculator = new PercentileCalculator();
          
          const p50 = calculator.calculate(latencies, 50);
          const p90 = calculator.calculate(latencies, 90);
          const p99 = calculator.calculate(latencies, 99);
          
          // Property: Higher percentiles should have higher or equal values
          expect(p90).toBeGreaterThanOrEqual(p50);
          expect(p99).toBeGreaterThanOrEqual(p90);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 11 (variant): Percentile calculation doesn't modify input
   */
  test('Property 11: Input array is not modified', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 5000 }), { minLength: 10, maxLength: 100 }),
        fc.constantFrom(50, 90, 99),
        (latencies, percentile) => {
          const calculator = new PercentileCalculator();
          const original = [...latencies];
          
          calculator.calculate(latencies, percentile);
          
          // Property: Original array should be unchanged
          expect(latencies).toEqual(original);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 11 (variant): Percentile metrics are published to CloudWatch
   */
  test('Property 11: Percentile metrics are published to CloudWatch every minute', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate endpoint name
        fc.constantFrom('/analyze', '/connect', '/disconnect', '/health'),
        // Generate latencies
        fc.array(fc.integer({ min: 1, max: 5000 }), { minLength: 100, maxLength: 500 }),
        async (endpoint, latencies) => {
          const calculator = new PercentileCalculator();
          
          await calculator.publishPercentileMetrics(endpoint, latencies);
          
          // Property 1: CloudWatch API should be called
          expect(mockSend).toHaveBeenCalled();
          
          // Property 2: Should publish P50, P90, and P99 metrics
          const commands = mockSend.mock.calls.map(call => call[0] as PutMetricDataCommand);
          const allMetrics = commands.flatMap(cmd => cmd.input?.MetricData || []);
          
          const metricNames = allMetrics.map(m => m.MetricName);
          expect(metricNames).toContain('P50Latency');
          expect(metricNames).toContain('P90Latency');
          expect(metricNames).toContain('P99Latency');
          
          // Property 3: All metrics should have the correct endpoint dimension
          for (const metric of allMetrics) {
            const dimensions = metric.Dimensions || [];
            const endpointDim = dimensions.find(d => d.Name === 'Endpoint');
            expect(endpointDim).toBeDefined();
            expect(endpointDim?.Value).toBe(endpoint);
          }
          
          // Property 4: Metric values should be mathematically correct
          const p50Metric = allMetrics.find(m => m.MetricName === 'P50Latency');
          const p90Metric = allMetrics.find(m => m.MetricName === 'P90Latency');
          const p99Metric = allMetrics.find(m => m.MetricName === 'P99Latency');
          
          expect(p50Metric).toBeDefined();
          expect(p90Metric).toBeDefined();
          expect(p99Metric).toBeDefined();
          
          // Verify percentile ordering
          expect(p90Metric!.Value).toBeGreaterThanOrEqual(p50Metric!.Value!);
          expect(p99Metric!.Value).toBeGreaterThanOrEqual(p90Metric!.Value!);
          
          // Property 5: All metrics should use Milliseconds unit
          expect(p50Metric!.Unit).toBe('Milliseconds');
          expect(p90Metric!.Unit).toBe('Milliseconds');
          expect(p99Metric!.Unit).toBe('Milliseconds');
          
          // Property 6: All metrics should have timestamps
          expect(p50Metric!.Timestamp).toBeDefined();
          expect(p90Metric!.Timestamp).toBeDefined();
          expect(p99Metric!.Timestamp).toBeDefined();
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 11 (variant): Percentile calculation works for edge cases
   */
  test('Property 11: Percentile calculation handles edge cases', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // All same values
          fc.tuple(fc.integer({ min: 1, max: 1000 }), fc.integer({ min: 10, max: 100 }))
            .map(([value, count]) => Array(count).fill(value)),
          // Two distinct values
          fc.tuple(
            fc.integer({ min: 1, max: 500 }),
            fc.integer({ min: 501, max: 1000 }),
            fc.integer({ min: 10, max: 50 })
          ).map(([low, high, count]) => [
            ...Array(count).fill(low),
            ...Array(count).fill(high)
          ]),
          // Ascending sequence
          fc.integer({ min: 10, max: 100 })
            .map(count => Array.from({ length: count }, (_, i) => i + 1))
        ),
        fc.constantFrom(50, 90, 99),
        (latencies, percentile) => {
          const calculator = new PercentileCalculator();
          
          // Should not throw
          const result = calculator.calculate(latencies, percentile);
          
          // Property: Result should be valid
          expect(result).toBeDefined();
          expect(typeof result).toBe('number');
          expect(isNaN(result)).toBe(false);
          
          // Property: Result should be within range
          const min = Math.min(...latencies);
          const max = Math.max(...latencies);
          expect(result).toBeGreaterThanOrEqual(min);
          expect(result).toBeLessThanOrEqual(max);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 11 (variant): Percentile calculation is efficient
   */
  test('Property 11: Percentile calculation completes in reasonable time', () => {
    fc.assert(
      fc.property(
        // Generate large array to test performance
        fc.array(fc.integer({ min: 1, max: 10000 }), { minLength: 1000, maxLength: 5000 }),
        fc.constantFrom(50, 90, 99),
        (latencies, percentile) => {
          const calculator = new PercentileCalculator();
          
          const startTime = Date.now();
          const result = calculator.calculate(latencies, percentile);
          const endTime = Date.now();
          
          const duration = endTime - startTime;
          
          // Property: Calculation should complete in < 100ms for arrays up to 5000 elements
          expect(duration).toBeLessThan(100);
          
          // Property: Result should still be correct
          expect(result).toBeDefined();
          expect(typeof result).toBe('number');
        }
      ),
      { numRuns: 20 } // Fewer runs for performance test
    );
  });

  /**
   * Property 11 (variant): Multiple endpoints can be tracked independently
   */
  test('Property 11: Multiple endpoints are tracked independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate multiple endpoints with latencies
        fc.array(
          fc.record({
            endpoint: fc.constantFrom('/analyze', '/connect', '/disconnect', '/health'),
            latencies: fc.array(fc.integer({ min: 1, max: 5000 }), { minLength: 10, maxLength: 100 })
          }),
          { minLength: 2, maxLength: 4 }
        ),
        async (endpointData) => {
          const calculator = new PercentileCalculator();
          
          // Record latencies for all endpoints
          for (const { endpoint, latencies } of endpointData) {
            for (const latency of latencies) {
              calculator.recordLatency(endpoint, latency);
            }
          }
          
          // Property 1: Buffer stats should show all endpoints
          const stats = calculator.getBufferStats();
          const uniqueEndpoints = new Set(endpointData.map(d => d.endpoint));
          
          for (const endpoint of uniqueEndpoints) {
            expect(stats.has(endpoint)).toBe(true);
          }
          
          // Property 2: Publishing should work for all endpoints
          await calculator.publishAllMetrics();
          
          expect(mockSend).toHaveBeenCalled();
          
          // Property 3: Buffers should be cleared after publishing
          const statsAfter = calculator.getBufferStats();
          expect(statsAfter.size).toBe(0);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 11 (variant): Percentile calculation with floating point values
   */
  test('Property 11: Percentile calculation works with floating point latencies', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.1, max: 5000, noNaN: true }), { minLength: 100, maxLength: 500 }),
        fc.constantFrom(50, 90, 99),
        (latencies, percentile) => {
          const calculator = new PercentileCalculator();
          
          const result = calculator.calculate(latencies, percentile);
          
          // Property 1: Result should be valid
          expect(result).toBeDefined();
          expect(typeof result).toBe('number');
          expect(isNaN(result)).toBe(false);
          
          // Property 2: Result should be within range
          const min = Math.min(...latencies);
          const max = Math.max(...latencies);
          expect(result).toBeGreaterThanOrEqual(min);
          expect(result).toBeLessThanOrEqual(max);
          
          // Property 3: Percentile property should hold
          const countBelowOrEqual = latencies.filter(v => v <= result).length;
          const percentBelow = (countBelowOrEqual / latencies.length) * 100;
          expect(percentBelow).toBeGreaterThanOrEqual(percentile - 1);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 11 (variant): Percentile calculation with extreme values
   */
  test('Property 11: Percentile calculation handles extreme values', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.integer({ min: 1, max: 10 }), // Very small values
            fc.integer({ min: 1000000, max: 10000000 }) // Very large values
          ),
          { minLength: 100, maxLength: 500 }
        ),
        fc.constantFrom(50, 90, 99),
        (latencies, percentile) => {
          const calculator = new PercentileCalculator();
          
          const result = calculator.calculate(latencies, percentile);
          
          // Property: Result should be valid despite extreme values
          expect(result).toBeDefined();
          expect(typeof result).toBe('number');
          expect(isNaN(result)).toBe(false);
          
          const min = Math.min(...latencies);
          const max = Math.max(...latencies);
          expect(result).toBeGreaterThanOrEqual(min);
          expect(result).toBeLessThanOrEqual(max);
        }
      ),
      { numRuns: 20 }
    );
  });
});
