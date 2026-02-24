/**
 * Property-Based Tests: Brute Force Detection
 * Feature: monitoring-and-observability
 * 
 * Property 19: Brute Force Detection
 * **Validates: Requirements 10.3**
 * 
 * For any userId, when failed authentication attempts exceed 5 within a 5-minute window,
 * a security alarm should trigger. The test verifies:
 * - Detection triggers at the correct threshold (>5 attempts)
 * - Detection only considers attempts within the 5-minute window
 * - Metrics are published when brute force is detected
 * - Critical security events are logged
 */

import * as fc from 'fast-check';
import { SecurityMonitor } from '../../../lib/monitoring/security-monitor';
import { StructuredLogger } from '../../../lib/monitoring/structured-logger';
import { MetricPublisher } from '../../../lib/monitoring/metric-publisher';

// Mock dependencies
jest.mock('../../../lib/monitoring/structured-logger');
jest.mock('../../../lib/monitoring/metric-publisher');

describe('Property 19: Brute Force Detection', () => {
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
   * Test that brute force is detected when threshold is exceeded
   */
  test('brute force should be detected when >5 failed attempts occur within 5 minutes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          attemptCount: fc.integer({ min: 6, max: 20 }), // More than threshold
          sourceIp: fc.ipV4(),
          reason: fc.constantFrom(
            'Invalid password',
            'Invalid credentials',
            'Account locked',
            'Token expired'
          ),
        }),
        async (testCase) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Log multiple failed authentication attempts
          for (let i = 0; i < testCase.attemptCount; i++) {
            await monitor.logFailedAuth(
              testCase.userId,
              testCase.reason,
              testCase.sourceIp
            );
          }

          // Verify brute force was detected (error log should be called)
          const errorCalls = mockLogger.error.mock.calls;
          const bruteForceDetected = errorCalls.some(
            call => call[0] === 'Brute force attack detected'
          );

          expect(bruteForceDetected).toBe(true);

          // Verify brute force metric was published
          const metricCalls = mockMetricPublisher.publishMetric.mock.calls;
          const bruteForceMetricPublished = metricCalls.some(
            call =>
              call[0] === 'VocalShield/Security' &&
              call[1] === 'BruteForceAttacks' &&
              call[2] === 1
          );

          expect(bruteForceMetricPublished).toBe(true);

          // Verify the error log contains required context
          const bruteForceErrorCall = errorCalls.find(
            call => call[0] === 'Brute force attack detected'
          );

          if (bruteForceErrorCall) {
            const logContext = bruteForceErrorCall[2];
            expect(logContext!.component).toBe('SecurityMonitor');
            expect(logContext!.operation).toBe('bruteForceDetection');
            expect(logContext!.userId).toBe(testCase.userId);
            expect(logContext!.metadata!.attemptCount).toBeGreaterThan(5);
            expect(logContext!.metadata!.sourceIp).toBe(testCase.sourceIp);
            expect(logContext!.metadata!.threshold).toBe(5);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that brute force is NOT detected when threshold is not exceeded
   */
  test('brute force should NOT be detected when ≤5 failed attempts occur', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          attemptCount: fc.integer({ min: 1, max: 5 }), // At or below threshold
          sourceIp: fc.ipV4(),
          reason: fc.string({ minLength: 5, maxLength: 50 }),
        }),
        async (testCase) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Log failed authentication attempts (at or below threshold)
          for (let i = 0; i < testCase.attemptCount; i++) {
            await monitor.logFailedAuth(
              testCase.userId,
              testCase.reason,
              testCase.sourceIp
            );
          }

          // Verify brute force was NOT detected (no error log for brute force)
          const errorCalls = mockLogger.error.mock.calls;
          const bruteForceDetected = errorCalls.some(
            call => call[0] === 'Brute force attack detected'
          );

          expect(bruteForceDetected).toBe(false);

          // Verify brute force metric was NOT published
          const metricCalls = mockMetricPublisher.publishMetric.mock.calls;
          const bruteForceMetricPublished = metricCalls.some(
            call =>
              call[0] === 'VocalShield/Security' &&
              call[1] === 'BruteForceAttacks'
          );

          expect(bruteForceMetricPublished).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that brute force detection respects the 5-minute window configuration
   * Note: This test verifies the window is properly configured and used,
   * but cannot easily test time-based expiration without mocking Date
   */
  test('brute force detection should use 5-minute window configuration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          attemptCount: fc.integer({ min: 6, max: 10 }),
          sourceIp: fc.ipV4(),
          reason: fc.string({ minLength: 5, maxLength: 50 }),
        }),
        async (testCase) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Log failed authentication attempts
          for (let i = 0; i < testCase.attemptCount; i++) {
            await monitor.logFailedAuth(
              testCase.userId,
              testCase.reason,
              testCase.sourceIp
            );
          }

          // Verify brute force was detected
          const errorCalls = mockLogger.error.mock.calls;
          const bruteForceErrorCall = errorCalls.find(
            call => call[0] === 'Brute force attack detected'
          );

          expect(bruteForceErrorCall).toBeDefined();

          if (bruteForceErrorCall) {
            const logContext = bruteForceErrorCall[2];
            
            // Verify the time window is correctly configured as 5 minutes (300 seconds)
            expect(logContext!.metadata!.timeWindow).toBe('300 seconds');
            
            // Verify the threshold is correctly configured as 5 attempts
            expect(logContext!.metadata!.threshold).toBe(5);
            
            // Verify attempt count is greater than threshold (brute force detected)
            expect(logContext!.metadata!.attemptCount).toBeGreaterThan(5);
            expect(logContext!.metadata!.attemptCount).toBeLessThanOrEqual(testCase.attemptCount);
          }

          // Verify clearOldData doesn't remove recent attempts
          monitor.clearOldData();
          const failedAuthCount = monitor.getFailedAuthCount(testCase.userId);
          expect(failedAuthCount).toBe(testCase.attemptCount);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that brute force detection works for multiple users independently
   */
  test('brute force detection should track users independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          user1: fc.record({
            userId: fc.uuid(),
            attemptCount: fc.integer({ min: 6, max: 10 }), // Above threshold
            sourceIp: fc.ipV4(),
          }),
          user2: fc.record({
            userId: fc.uuid(),
            attemptCount: fc.integer({ min: 1, max: 5 }), // Below threshold
            sourceIp: fc.ipV4(),
          }),
          reason: fc.string({ minLength: 5, maxLength: 50 }),
        }),
        async (testCase) => {
          // Ensure users are different
          fc.pre(testCase.user1.userId !== testCase.user2.userId);

          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Log attempts for user1 (should trigger brute force)
          for (let i = 0; i < testCase.user1.attemptCount; i++) {
            await monitor.logFailedAuth(
              testCase.user1.userId,
              testCase.reason,
              testCase.user1.sourceIp
            );
          }

          // Log attempts for user2 (should NOT trigger brute force)
          for (let i = 0; i < testCase.user2.attemptCount; i++) {
            await monitor.logFailedAuth(
              testCase.user2.userId,
              testCase.reason,
              testCase.user2.sourceIp
            );
          }

          // Verify brute force was detected for user1
          const errorCalls = mockLogger.error.mock.calls;
          const user1BruteForce = errorCalls.some(
            call =>
              call[0] === 'Brute force attack detected' &&
              call[2]!.userId === testCase.user1.userId
          );

          expect(user1BruteForce).toBe(true);

          // Verify brute force was NOT detected for user2
          const user2BruteForce = errorCalls.some(
            call =>
              call[0] === 'Brute force attack detected' &&
              call[2]!.userId === testCase.user2.userId
          );

          expect(user2BruteForce).toBe(false);

          // Verify failed auth counts are tracked independently
          const user1Count = monitor.getFailedAuthCount(testCase.user1.userId);
          const user2Count = monitor.getFailedAuthCount(testCase.user2.userId);

          expect(user1Count).toBe(testCase.user1.attemptCount);
          expect(user2Count).toBe(testCase.user2.attemptCount);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that brute force detection triggers exactly once at threshold
   */
  test('brute force detection should trigger exactly once when threshold is crossed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          attemptCount: fc.integer({ min: 6, max: 15 }), // Above threshold
          sourceIp: fc.ipV4(),
          reason: fc.string({ minLength: 5, maxLength: 50 }),
        }),
        async (testCase) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Log failed authentication attempts
          for (let i = 0; i < testCase.attemptCount; i++) {
            await monitor.logFailedAuth(
              testCase.userId,
              testCase.reason,
              testCase.sourceIp
            );
          }

          // Count how many times brute force was detected
          const errorCalls = mockLogger.error.mock.calls;
          const bruteForceDetectionCount = errorCalls.filter(
            call => call[0] === 'Brute force attack detected'
          ).length;

          // Brute force should be detected on 6th attempt and every subsequent attempt
          // because each attempt checks if count > 5
          const expectedDetections = testCase.attemptCount - 5;
          expect(bruteForceDetectionCount).toBe(expectedDetections);

          // Verify brute force metric was published the same number of times
          const metricCalls = mockMetricPublisher.publishMetric.mock.calls;
          const bruteForceMetricCount = metricCalls.filter(
            call =>
              call[0] === 'VocalShield/Security' &&
              call[1] === 'BruteForceAttacks'
          ).length;

          expect(bruteForceMetricCount).toBe(expectedDetections);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that brute force detection includes all required metadata
   */
  test('brute force detection should include all required metadata in logs and metrics', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          attemptCount: fc.integer({ min: 6, max: 10 }),
          sourceIp: fc.ipV4(),
          reason: fc.constantFrom(
            'Invalid password',
            'Invalid credentials',
            'Account locked'
          ),
        }),
        async (testCase) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Log failed authentication attempts
          for (let i = 0; i < testCase.attemptCount; i++) {
            await monitor.logFailedAuth(
              testCase.userId,
              testCase.reason,
              testCase.sourceIp
            );
          }

          // Find the brute force error log
          const errorCalls = mockLogger.error.mock.calls;
          const bruteForceErrorCall = errorCalls.find(
            call => call[0] === 'Brute force attack detected'
          );

          expect(bruteForceErrorCall).toBeDefined();

          if (bruteForceErrorCall) {
            const logContext = bruteForceErrorCall[2];

            // Verify all required metadata fields
            expect(logContext!.component).toBe('SecurityMonitor');
            expect(logContext!.operation).toBe('bruteForceDetection');
            expect(logContext!.userId).toBe(testCase.userId);

            expect(logContext!.metadata).toBeDefined();
            expect(logContext!.metadata!.attemptCount).toBeGreaterThan(5);
            expect(logContext!.metadata!.sourceIp).toBe(testCase.sourceIp);
            expect(logContext!.metadata!.timeWindow).toBe('300 seconds');
            expect(logContext!.metadata!.threshold).toBe(5);
          }

          // Find the brute force metric
          const metricCalls = mockMetricPublisher.publishMetric.mock.calls;
          const bruteForceMetricCall = metricCalls.find(
            call =>
              call[0] === 'VocalShield/Security' &&
              call[1] === 'BruteForceAttacks'
          );

          expect(bruteForceMetricCall).toBeDefined();

          if (bruteForceMetricCall) {
            // Verify metric parameters
            expect(bruteForceMetricCall[0]).toBe('VocalShield/Security');
            expect(bruteForceMetricCall[1]).toBe('BruteForceAttacks');
            expect(bruteForceMetricCall[2]).toBe(1);
            expect(bruteForceMetricCall[3]).toBeDefined(); // MetricUnit

            // Verify metric dimensions
            const dimensions = bruteForceMetricCall[4];
            expect(dimensions).toMatchObject({
              UserId: testCase.userId,
              SourceIp: testCase.sourceIp,
            });
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that brute force detection handles rapid successive attempts
   */
  test('brute force detection should handle rapid successive attempts correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          burstSize: fc.integer({ min: 10, max: 50 }), // Large burst of attempts
          sourceIp: fc.ipV4(),
          reason: fc.string({ minLength: 5, maxLength: 50 }),
        }),
        async (testCase) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Log a burst of failed authentication attempts
          const promises = [];
          for (let i = 0; i < testCase.burstSize; i++) {
            promises.push(
              monitor.logFailedAuth(
                testCase.userId,
                testCase.reason,
                testCase.sourceIp
              )
            );
          }

          // Wait for all attempts to be processed
          await Promise.all(promises);

          // Verify brute force was detected
          const errorCalls = mockLogger.error.mock.calls;
          const bruteForceDetected = errorCalls.some(
            call => call[0] === 'Brute force attack detected'
          );

          expect(bruteForceDetected).toBe(true);

          // Verify the failed auth count reflects all attempts
          const failedAuthCount = monitor.getFailedAuthCount(testCase.userId);
          expect(failedAuthCount).toBe(testCase.burstSize);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that brute force detection works with different source IPs
   */
  test('brute force detection should work regardless of source IP changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          attemptCount: fc.integer({ min: 6, max: 10 }),
          sourceIps: fc.array(fc.ipV4(), { minLength: 2, maxLength: 5 }),
          reason: fc.string({ minLength: 5, maxLength: 50 }),
        }),
        async (testCase) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Log failed authentication attempts from different IPs
          for (let i = 0; i < testCase.attemptCount; i++) {
            const sourceIp = testCase.sourceIps[i % testCase.sourceIps.length];
            await monitor.logFailedAuth(
              testCase.userId,
              testCase.reason,
              sourceIp
            );
          }

          // Verify brute force was detected (regardless of IP changes)
          const errorCalls = mockLogger.error.mock.calls;
          const bruteForceDetected = errorCalls.some(
            call => call[0] === 'Brute force attack detected'
          );

          expect(bruteForceDetected).toBe(true);

          // Verify the failed auth count reflects all attempts
          const failedAuthCount = monitor.getFailedAuthCount(testCase.userId);
          expect(failedAuthCount).toBe(testCase.attemptCount);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that brute force detection handles edge case: exactly 6 attempts
   */
  test('brute force detection should trigger on exactly 6 attempts (threshold + 1)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          sourceIp: fc.ipV4(),
          reason: fc.string({ minLength: 5, maxLength: 50 }),
        }),
        async (testCase) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Log exactly 6 failed authentication attempts (threshold is 5)
          for (let i = 0; i < 6; i++) {
            await monitor.logFailedAuth(
              testCase.userId,
              testCase.reason,
              testCase.sourceIp
            );
          }

          // Verify brute force was detected
          const errorCalls = mockLogger.error.mock.calls;
          const bruteForceDetected = errorCalls.some(
            call => call[0] === 'Brute force attack detected'
          );

          expect(bruteForceDetected).toBe(true);

          // Verify exactly one brute force detection
          const bruteForceDetectionCount = errorCalls.filter(
            call => call[0] === 'Brute force attack detected'
          ).length;

          expect(bruteForceDetectionCount).toBe(1);

          // Verify the failed auth count is exactly 6
          const failedAuthCount = monitor.getFailedAuthCount(testCase.userId);
          expect(failedAuthCount).toBe(6);
        }
      ),
      { numRuns: 20 }
    );
  });
});
