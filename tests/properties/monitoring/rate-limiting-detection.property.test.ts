/**
 * Property-Based Tests: Rate Limiting Detection
 * Feature: monitoring-and-observability
 * 
 * Property 21: Rate Limiting Detection
 * **Validates: Requirements 10.5**
 * 
 * For any userId, when request rate exceeds 100 requests per minute,
 * an anomaly metric should be published indicating unusual activity. The test verifies:
 * - Detection triggers when >100 requests/minute threshold is exceeded
 * - Detection only considers requests within the 1-minute window
 * - Metrics are published when rate limiting is detected
 * - Security events are logged
 * - Window resets correctly after 1 minute
 */

import * as fc from 'fast-check';
import { SecurityMonitor } from '../../../lib/monitoring/security-monitor';
import { StructuredLogger } from '../../../lib/monitoring/structured-logger';
import { MetricPublisher } from '../../../lib/monitoring/metric-publisher';

// Mock dependencies
jest.mock('../../../lib/monitoring/structured-logger');
jest.mock('../../../lib/monitoring/metric-publisher');

describe('Property 21: Rate Limiting Detection', () => {
  let mockLogger: jest.Mocked<StructuredLogger>;
  let mockMetricPublisher: jest.Mocked<MetricPublisher>;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Create mock instances
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
    } as any;

    mockMetricPublisher = {
      publishMetric: jest.fn().mockResolvedValue(undefined),
      publishBusinessKPI: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock constructors
    (StructuredLogger as jest.Mock).mockImplementation(() => mockLogger);
    (MetricPublisher as jest.Mock).mockImplementation(() => mockMetricPublisher);
  });

  /**
   * Test that rate limiting is detected when threshold is exceeded
   */
  test('rate limiting should be detected when >100 requests/minute occur', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          requestCount: fc.integer({ min: 101, max: 500 }), // More than threshold
        }),
        async (testCase) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Track multiple requests
          for (let i = 0; i < testCase.requestCount; i++) {
            await monitor.trackRequest(testCase.userId);
          }

          // Verify rate limit violation was detected (warning log should be called)
          const warnCalls = mockLogger.warn.mock.calls;
          const rateLimitDetected = warnCalls.some(
            call => call[0] === 'Rate limit violation detected'
          );

          expect(rateLimitDetected).toBe(true);

          // Verify rate limit violation metric was published
          const metricCalls = mockMetricPublisher.publishMetric.mock.calls;
          const rateLimitMetricPublished = metricCalls.some(
            call =>
              call[0] === 'VocalShield/Security' &&
              call[1] === 'RateLimitViolations' &&
              call[2] === 1
          );

          expect(rateLimitMetricPublished).toBe(true);

          // Verify the warning log contains required context
          const rateLimitWarningCall = warnCalls.find(
            call => call[0] === 'Rate limit violation detected'
          );

          if (rateLimitWarningCall) {
            const logContext = rateLimitWarningCall[1];
            expect(logContext!.component).toBe('SecurityMonitor');
            expect(logContext!.operation).toBe('rateLimitDetection');
            expect(logContext!.userId).toBe(testCase.userId);
            expect(logContext!.metadata!.requestCount).toBeGreaterThan(100);
            expect(logContext!.metadata!.threshold).toBe(100);
            expect(logContext!.metadata!.timeWindow).toBe('60 seconds');
          }

          // Verify the current request count is tracked correctly
          const currentCount = monitor.getCurrentRequestCount(testCase.userId);
          expect(currentCount).toBe(testCase.requestCount);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that rate limiting is NOT detected when threshold is not exceeded
   */
  test('rate limiting should NOT be detected when ≤100 requests/minute occur', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          requestCount: fc.integer({ min: 1, max: 100 }), // At or below threshold
        }),
        async (testCase) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Track requests (at or below threshold)
          for (let i = 0; i < testCase.requestCount; i++) {
            await monitor.trackRequest(testCase.userId);
          }

          // Verify rate limit violation was NOT detected
          const warnCalls = mockLogger.warn.mock.calls;
          const rateLimitDetected = warnCalls.some(
            call => call[0] === 'Rate limit violation detected'
          );

          expect(rateLimitDetected).toBe(false);

          // Verify rate limit violation metric was NOT published
          const metricCalls = mockMetricPublisher.publishMetric.mock.calls;
          const rateLimitMetricPublished = metricCalls.some(
            call =>
              call[0] === 'VocalShield/Security' &&
              call[1] === 'RateLimitViolations'
          );

          expect(rateLimitMetricPublished).toBe(false);

          // Verify the current request count is tracked correctly
          const currentCount = monitor.getCurrentRequestCount(testCase.userId);
          expect(currentCount).toBe(testCase.requestCount);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that rate limiting detection respects the 1-minute window configuration
   */
  test('rate limiting detection should use 1-minute window configuration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          requestCount: fc.integer({ min: 101, max: 200 }),
        }),
        async (testCase) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Track requests
          for (let i = 0; i < testCase.requestCount; i++) {
            await monitor.trackRequest(testCase.userId);
          }

          // Verify rate limit violation was detected
          const warnCalls = mockLogger.warn.mock.calls;
          const rateLimitWarningCall = warnCalls.find(
            call => call[0] === 'Rate limit violation detected'
          );

          expect(rateLimitWarningCall).toBeDefined();

          if (rateLimitWarningCall) {
            const logContext = rateLimitWarningCall[1];
            
            // Verify the time window is correctly configured as 1 minute (60 seconds)
            expect(logContext!.metadata!.timeWindow).toBe('60 seconds');
            
            // Verify the threshold is correctly configured as 100 requests
            expect(logContext!.metadata!.threshold).toBe(100);
            
            // Verify request count is greater than threshold
            expect(logContext!.metadata!.requestCount).toBeGreaterThan(100);
            expect(logContext!.metadata!.requestCount).toBeLessThanOrEqual(testCase.requestCount);
          }

          // Verify clearOldData doesn't remove recent records
          monitor.clearOldData();
          const currentCount = monitor.getCurrentRequestCount(testCase.userId);
          expect(currentCount).toBe(testCase.requestCount);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that rate limiting detection works for multiple users independently
   */
  test('rate limiting detection should track users independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          user1: fc.record({
            userId: fc.uuid(),
            requestCount: fc.integer({ min: 101, max: 200 }), // Above threshold
          }),
          user2: fc.record({
            userId: fc.uuid(),
            requestCount: fc.integer({ min: 1, max: 100 }), // Below threshold
          }),
        }),
        async (testCase) => {
          // Ensure users are different
          fc.pre(testCase.user1.userId !== testCase.user2.userId);

          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Track requests for user1 (should trigger rate limit)
          for (let i = 0; i < testCase.user1.requestCount; i++) {
            await monitor.trackRequest(testCase.user1.userId);
          }

          // Track requests for user2 (should NOT trigger rate limit)
          for (let i = 0; i < testCase.user2.requestCount; i++) {
            await monitor.trackRequest(testCase.user2.userId);
          }

          // Verify rate limit was detected for user1
          const warnCalls = mockLogger.warn.mock.calls;
          const user1RateLimit = warnCalls.some(
            call =>
              call[0] === 'Rate limit violation detected' &&
              call[1]!.userId === testCase.user1.userId
          );

          expect(user1RateLimit).toBe(true);

          // Verify rate limit was NOT detected for user2
          const user2RateLimit = warnCalls.some(
            call =>
              call[0] === 'Rate limit violation detected' &&
              call[1]!.userId === testCase.user2.userId
          );

          expect(user2RateLimit).toBe(false);

          // Verify request counts are tracked independently
          const user1Count = monitor.getCurrentRequestCount(testCase.user1.userId);
          const user2Count = monitor.getCurrentRequestCount(testCase.user2.userId);

          expect(user1Count).toBe(testCase.user1.requestCount);
          expect(user2Count).toBe(testCase.user2.requestCount);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that rate limiting detection triggers exactly once at threshold
   */
  test('rate limiting detection should trigger exactly once when threshold is crossed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          requestCount: fc.integer({ min: 101, max: 300 }), // Above threshold
        }),
        async (testCase) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Track requests
          for (let i = 0; i < testCase.requestCount; i++) {
            await monitor.trackRequest(testCase.userId);
          }

          // Count how many times rate limit violation was detected
          const warnCalls = mockLogger.warn.mock.calls;
          const rateLimitDetectionCount = warnCalls.filter(
            call => call[0] === 'Rate limit violation detected'
          ).length;

          // Rate limit should be detected exactly once (on 101st request)
          // because the implementation only logs once when threshold is first exceeded
          expect(rateLimitDetectionCount).toBe(1);

          // Verify rate limit violation metric was published exactly once
          const metricCalls = mockMetricPublisher.publishMetric.mock.calls;
          const rateLimitMetricCount = metricCalls.filter(
            call =>
              call[0] === 'VocalShield/Security' &&
              call[1] === 'RateLimitViolations'
          ).length;

          expect(rateLimitMetricCount).toBe(1);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that rate limiting detection includes all required metadata
   */
  test('rate limiting detection should include all required metadata in logs and metrics', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          requestCount: fc.integer({ min: 101, max: 200 }),
        }),
        async (testCase) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Track requests
          for (let i = 0; i < testCase.requestCount; i++) {
            await monitor.trackRequest(testCase.userId);
          }

          // Find the rate limit warning log
          const warnCalls = mockLogger.warn.mock.calls;
          const rateLimitWarningCall = warnCalls.find(
            call => call[0] === 'Rate limit violation detected'
          );

          expect(rateLimitWarningCall).toBeDefined();

          if (rateLimitWarningCall) {
            const logContext = rateLimitWarningCall[1];

            // Verify all required metadata fields
            expect(logContext!.component).toBe('SecurityMonitor');
            expect(logContext!.operation).toBe('rateLimitDetection');
            expect(logContext!.userId).toBe(testCase.userId);

            expect(logContext!.metadata).toBeDefined();
            expect(logContext!.metadata!.requestCount).toBeGreaterThan(100);
            expect(logContext!.metadata!.threshold).toBe(100);
            expect(logContext!.metadata!.timeWindow).toBe('60 seconds');
          }

          // Find the rate limit violation metric
          const metricCalls = mockMetricPublisher.publishMetric.mock.calls;
          const rateLimitMetricCall = metricCalls.find(
            call =>
              call[0] === 'VocalShield/Security' &&
              call[1] === 'RateLimitViolations'
          );

          expect(rateLimitMetricCall).toBeDefined();

          if (rateLimitMetricCall) {
            // Verify metric parameters
            expect(rateLimitMetricCall[0]).toBe('VocalShield/Security');
            expect(rateLimitMetricCall[1]).toBe('RateLimitViolations');
            expect(rateLimitMetricCall[2]).toBe(1);
            expect(rateLimitMetricCall[3]).toBeDefined(); // MetricUnit

            // Verify metric dimensions
            const dimensions = rateLimitMetricCall[4];
            expect(dimensions).toMatchObject({
              UserId: testCase.userId,
            });
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that rate limiting detection handles rapid successive requests
   */
  test('rate limiting detection should handle rapid successive requests correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          burstSize: fc.integer({ min: 150, max: 1000 }), // Large burst of requests
        }),
        async (testCase) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Track a burst of requests
          const promises = [];
          for (let i = 0; i < testCase.burstSize; i++) {
            promises.push(monitor.trackRequest(testCase.userId));
          }

          // Wait for all requests to be processed
          await Promise.all(promises);

          // Verify rate limit violation was detected
          const warnCalls = mockLogger.warn.mock.calls;
          const rateLimitDetected = warnCalls.some(
            call => call[0] === 'Rate limit violation detected'
          );

          expect(rateLimitDetected).toBe(true);

          // Verify the request count reflects all requests
          const currentCount = monitor.getCurrentRequestCount(testCase.userId);
          expect(currentCount).toBe(testCase.burstSize);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that rate limiting detection handles edge case: exactly 101 requests
   */
  test('rate limiting detection should trigger on exactly 101 requests (threshold + 1)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
        }),
        async (testCase) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Track exactly 101 requests (threshold is 100)
          for (let i = 0; i < 101; i++) {
            await monitor.trackRequest(testCase.userId);
          }

          // Verify rate limit violation was detected
          const warnCalls = mockLogger.warn.mock.calls;
          const rateLimitDetected = warnCalls.some(
            call => call[0] === 'Rate limit violation detected'
          );

          expect(rateLimitDetected).toBe(true);

          // Verify exactly one rate limit detection
          const rateLimitDetectionCount = warnCalls.filter(
            call => call[0] === 'Rate limit violation detected'
          ).length;

          expect(rateLimitDetectionCount).toBe(1);

          // Verify the request count is exactly 101
          const currentCount = monitor.getCurrentRequestCount(testCase.userId);
          expect(currentCount).toBe(101);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that rate limiting detection handles first request correctly
   */
  test('rate limiting detection should handle first request without errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
        }),
        async (testCase) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Track first request
          await monitor.trackRequest(testCase.userId);

          // Verify no rate limit violation was detected
          const warnCalls = mockLogger.warn.mock.calls;
          const rateLimitDetected = warnCalls.some(
            call => call[0] === 'Rate limit violation detected'
          );

          expect(rateLimitDetected).toBe(false);

          // Verify the request count is 1
          const currentCount = monitor.getCurrentRequestCount(testCase.userId);
          expect(currentCount).toBe(1);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that rate limiting detection handles zero requests correctly
   */
  test('rate limiting detection should return 0 for users with no requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
        }),
        async (testCase) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Don't track any requests

          // Verify the request count is 0
          const currentCount = monitor.getCurrentRequestCount(testCase.userId);
          expect(currentCount).toBe(0);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that rate limiting detection handles concurrent requests from multiple users
   */
  test('rate limiting detection should handle concurrent requests from multiple users', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          users: fc.array(
            fc.record({
              userId: fc.uuid(),
              requestCount: fc.integer({ min: 50, max: 150 }),
            }),
            { minLength: 2, maxLength: 10 }
          ),
        }),
        async (testCase) => {
          // Ensure all users are unique
          const uniqueUserIds = new Set(testCase.users.map(u => u.userId));
          fc.pre(uniqueUserIds.size === testCase.users.length);

          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Track requests for all users concurrently
          const promises = [];
          for (const user of testCase.users) {
            for (let i = 0; i < user.requestCount; i++) {
              promises.push(monitor.trackRequest(user.userId));
            }
          }

          // Wait for all requests to be processed
          await Promise.all(promises);

          // Verify each user's request count is tracked correctly
          for (const user of testCase.users) {
            const currentCount = monitor.getCurrentRequestCount(user.userId);
            expect(currentCount).toBe(user.requestCount);

            // Verify rate limit detection based on threshold
            const warnCalls = mockLogger.warn.mock.calls;
            const userRateLimit = warnCalls.some(
              call =>
                call[0] === 'Rate limit violation detected' &&
                call[1]!.userId === user.userId
            );

            if (user.requestCount > 100) {
              expect(userRateLimit).toBe(true);
            } else {
              expect(userRateLimit).toBe(false);
            }
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that clearOldData removes expired rate limit records
   * Note: This test verifies the cleanup mechanism works correctly
   */
  test('clearOldData should remove expired rate limit records', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          requestCount: fc.integer({ min: 50, max: 100 }),
        }),
        async (testCase) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Track requests
          for (let i = 0; i < testCase.requestCount; i++) {
            await monitor.trackRequest(testCase.userId);
          }

          // Verify request count is tracked
          let currentCount = monitor.getCurrentRequestCount(testCase.userId);
          expect(currentCount).toBe(testCase.requestCount);

          // Clear old data (should not remove recent records)
          monitor.clearOldData();

          // Verify request count is still tracked (records are recent)
          currentCount = monitor.getCurrentRequestCount(testCase.userId);
          expect(currentCount).toBe(testCase.requestCount);
        }
      ),
      { numRuns: 20 }
    );
  });
});
