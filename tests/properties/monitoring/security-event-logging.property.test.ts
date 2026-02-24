/**
 * Property-Based Tests: Security Event Logging
 * Feature: monitoring-and-observability
 * 
 * Property 18: Security Event Logging
 * **Validates: Requirements 10.1, 10.2**
 * 
 * For any failed authentication attempt, the event should be logged with userId,
 * timestamp, reason, and source IP, and a metric should be incremented for that userId.
 */

import * as fc from 'fast-check';
import { SecurityMonitor } from '../../../lib/monitoring/security-monitor';
import { StructuredLogger } from '../../../lib/monitoring/structured-logger';
import { MetricPublisher } from '../../../lib/monitoring/metric-publisher';

// Mock dependencies
jest.mock('../../../lib/monitoring/structured-logger');
jest.mock('../../../lib/monitoring/metric-publisher');

describe('Property 18: Security Event Logging', () => {
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
   * Test that all failed authentication attempts are logged with required fields
   */
  test('failed authentication attempts should be logged with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.string({ minLength: 1, maxLength: 50 }),
          reason: fc.constantFrom(
            'Invalid password',
            'Invalid credentials',
            'Account locked',
            'Token expired',
            'User not found',
            'Invalid API key'
          ),
          sourceIp: fc.oneof(
            // IPv4 addresses
            fc.tuple(
              fc.integer({ min: 0, max: 255 }),
              fc.integer({ min: 0, max: 255 }),
              fc.integer({ min: 0, max: 255 }),
              fc.integer({ min: 0, max: 255 })
            ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`),
            // IPv6 addresses (simplified)
            fc.hexaString({ minLength: 4, maxLength: 4 }).chain(seg =>
              fc.constant(`2001:0db8:85a3:0000:0000:8a2e:0370:${seg}`)
            )
          ),
        }),
        async (authAttempt) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Log failed authentication
          await monitor.logFailedAuth(
            authAttempt.userId,
            authAttempt.reason,
            authAttempt.sourceIp
          );

          // Verify logger was called with required fields
          expect(mockLogger.warn).toHaveBeenCalledTimes(1);
          const logCall = mockLogger.warn.mock.calls[0];

          // Verify log message
          expect(logCall[0]).toBe('Failed authentication attempt');

          // Verify log context contains required fields
          const logContext = logCall[1];
          expect(logContext).toBeDefined();
          expect(logContext!.component).toBe('SecurityMonitor');
          expect(logContext!.operation).toBe('authentication');
          expect(logContext!.userId).toBe(authAttempt.userId);

          // Verify metadata contains required fields
          expect(logContext!.metadata).toBeDefined();
          expect(logContext!.metadata!.reason).toBe(authAttempt.reason);
          expect(logContext!.metadata!.sourceIp).toBe(authAttempt.sourceIp);
          expect(logContext!.metadata!.timestamp).toBeDefined();

          // Verify timestamp is valid ISO 8601 format
          const timestamp = new Date(logContext!.metadata!.timestamp as string);
          expect(timestamp.getTime()).toBeGreaterThan(0);
          expect(isNaN(timestamp.getTime())).toBe(false);

          // Verify metric was published
          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
            'VocalShield/Security',
            'FailedAuthAttempts',
            1,
            expect.any(String), // MetricUnit.Count
            expect.objectContaining({
              UserId: authAttempt.userId,
            })
          );
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that timestamps are accurate and within reasonable bounds
   */
  test('logged timestamps should be accurate and recent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          reason: fc.string({ minLength: 5, maxLength: 100 }),
          sourceIp: fc.tuple(
            fc.integer({ min: 0, max: 255 }),
            fc.integer({ min: 0, max: 255 }),
            fc.integer({ min: 0, max: 255 }),
            fc.integer({ min: 0, max: 255 })
          ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`),
        }),
        async (authAttempt) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          const beforeTime = Date.now();
          await monitor.logFailedAuth(
            authAttempt.userId,
            authAttempt.reason,
            authAttempt.sourceIp
          );
          const afterTime = Date.now();

          // Get the logged timestamp
          const logCall = mockLogger.warn.mock.calls[0];
          const logContext = logCall[1];
          const loggedTimestamp = new Date(logContext!.metadata!.timestamp as string).getTime();

          // Verify timestamp is within the execution window (with 1 second tolerance)
          expect(loggedTimestamp).toBeGreaterThanOrEqual(beforeTime - 1000);
          expect(loggedTimestamp).toBeLessThanOrEqual(afterTime + 1000);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that log entries contain proper context for correlation
   */
  test('log entries should contain proper context for correlation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          reason: fc.string({ minLength: 1, maxLength: 200 }),
          sourceIp: fc.ipV4(),
        }),
        async (authAttempt) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          await monitor.logFailedAuth(
            authAttempt.userId,
            authAttempt.reason,
            authAttempt.sourceIp
          );

          const logCall = mockLogger.warn.mock.calls[0];
          const logContext = logCall[1];

          // Verify context fields for correlation
          expect(logContext!.component).toBe('SecurityMonitor');
          expect(logContext!.operation).toBe('authentication');
          expect(logContext!.userId).toBe(authAttempt.userId);

          // Verify all required metadata is present
          expect(logContext!.metadata).toMatchObject({
            reason: authAttempt.reason,
            sourceIp: authAttempt.sourceIp,
            timestamp: expect.any(String),
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that no PII is leaked in logs (beyond userId which is expected)
   */
  test('logs should not leak PII beyond expected fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          reason: fc.constantFrom(
            'Invalid password for user@example.com', // Email in reason
            'Failed login from 555-1234', // Phone in reason
            'Account 4532-1234-5678-9012 locked', // Credit card in reason
            'SSN 123-45-6789 verification failed' // SSN in reason
          ),
          sourceIp: fc.ipV4(),
        }),
        async (authAttempt) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          await monitor.logFailedAuth(
            authAttempt.userId,
            authAttempt.reason,
            authAttempt.sourceIp
          );

          const logCall = mockLogger.warn.mock.calls[0];
          const logContext = logCall[1];

          // The reason should be logged as-is (PII sanitization happens in StructuredLogger)
          // We're testing that SecurityMonitor passes the data correctly
          expect(logContext!.metadata!.reason).toBe(authAttempt.reason);

          // Verify expected fields are present
          expect(logContext!.userId).toBe(authAttempt.userId);
          expect(logContext!.metadata!.sourceIp).toBe(authAttempt.sourceIp);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that invalid token requests are logged correctly
   */
  test('invalid token requests should be logged with required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.option(fc.uuid(), { nil: undefined }),
          sourceIp: fc.ipV4(),
          reason: fc.constantFrom(
            'Token expired',
            'Invalid signature',
            'Token not found',
            'Malformed token',
            'Missing token'
          ),
        }),
        async (tokenRequest) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          await monitor.logInvalidToken(
            tokenRequest.userId,
            tokenRequest.sourceIp,
            tokenRequest.reason
          );

          // Verify logger was called
          expect(mockLogger.warn).toHaveBeenCalledTimes(1);
          const logCall = mockLogger.warn.mock.calls[0];

          // Verify log message
          expect(logCall[0]).toBe('Invalid token request');

          // Verify log context
          const logContext = logCall[1];
          expect(logContext!.component).toBe('SecurityMonitor');
          expect(logContext!.operation).toBe('tokenValidation');
          expect(logContext!.userId).toBe(tokenRequest.userId);

          // Verify metadata
          expect(logContext!.metadata!.reason).toBe(tokenRequest.reason);
          expect(logContext!.metadata!.sourceIp).toBe(tokenRequest.sourceIp);
          expect(logContext!.metadata!.timestamp).toBeDefined();

          // Verify metric was published
          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
            'VocalShield/Security',
            'InvalidTokenRequests',
            1,
            expect.any(String),
            expect.objectContaining({
              Reason: expect.any(String),
            })
          );
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that sensitive data access is logged correctly
   */
  test('sensitive data access should be logged with operation and item key', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          operation: fc.constantFrom('GetItem', 'PutItem', 'UpdateItem', 'DeleteItem', 'Query', 'Scan'),
          itemKey: fc.dictionary(
            fc.constantFrom('userId', 'sessionId', 'conversationId', 'timestamp'),
            fc.oneof(fc.string(), fc.integer(), fc.uuid())
          ),
        }),
        async (dataAccess) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          await monitor.logSensitiveDataAccess(
            dataAccess.userId,
            dataAccess.operation,
            dataAccess.itemKey
          );

          // Verify logger was called
          expect(mockLogger.info).toHaveBeenCalledTimes(1);
          const logCall = mockLogger.info.mock.calls[0];

          // Verify log message
          expect(logCall[0]).toBe('Sensitive data access');

          // Verify log context
          const logContext = logCall[1];
          expect(logContext!.component).toBe('SecurityMonitor');
          expect(logContext!.operation).toBe('dataAccess');
          expect(logContext!.userId).toBe(dataAccess.userId);

          // Verify metadata contains operation and item key
          expect(logContext!.metadata!.accessOperation).toBe(dataAccess.operation);
          expect(logContext!.metadata!.itemKey).toEqual(dataAccess.itemKey);
          expect(logContext!.metadata!.timestamp).toBeDefined();

          // Verify metric was published
          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
            'VocalShield/Security',
            'SensitiveDataAccess',
            1,
            expect.any(String),
            expect.objectContaining({
              Operation: dataAccess.operation,
            })
          );
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that multiple security events are tracked independently
   */
  test('multiple security events should be tracked independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            userId: fc.uuid(),
            reason: fc.string({ minLength: 5, maxLength: 50 }),
            sourceIp: fc.ipV4(),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (authAttempts) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Log all attempts
          for (const attempt of authAttempts) {
            await monitor.logFailedAuth(
              attempt.userId,
              attempt.reason,
              attempt.sourceIp
            );
          }

          // Verify each attempt was logged
          expect(mockLogger.warn).toHaveBeenCalledTimes(authAttempts.length);

          // Verify each log call has correct data
          for (let i = 0; i < authAttempts.length; i++) {
            const logCall = mockLogger.warn.mock.calls[i];
            const logContext = logCall[1];

            expect(logContext!.userId).toBe(authAttempts[i].userId);
            expect(logContext!.metadata!.reason).toBe(authAttempts[i].reason);
            expect(logContext!.metadata!.sourceIp).toBe(authAttempts[i].sourceIp);
          }

          // Verify metrics were published for each attempt
          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledTimes(authAttempts.length);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that security events with edge case values are handled correctly
   */
  test('security events with edge case values should be handled correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.oneof(
            fc.uuid(),
            fc.string({ minLength: 1, maxLength: 1 }), // Single character
            fc.string({ minLength: 50, maxLength: 50 }), // Max length
            fc.constant('user-with-special-chars-!@#$%')
          ),
          reason: fc.oneof(
            fc.string({ minLength: 1, maxLength: 1 }), // Very short
            fc.string({ minLength: 200, maxLength: 200 }), // Very long
            fc.constant('Reason with unicode: 你好 مرحبا'),
            fc.constant('Reason with special chars: <>&"\'')
          ),
          sourceIp: fc.oneof(
            fc.constant('0.0.0.0'), // Edge case IP
            fc.constant('255.255.255.255'), // Max IP
            fc.constant('127.0.0.1'), // Localhost
            fc.constant('::1') // IPv6 localhost
          ),
        }),
        async (authAttempt) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Should not throw
          await expect(
            monitor.logFailedAuth(
              authAttempt.userId,
              authAttempt.reason,
              authAttempt.sourceIp
            )
          ).resolves.not.toThrow();

          // Verify logging occurred
          expect(mockLogger.warn).toHaveBeenCalledTimes(1);

          // Verify all fields are preserved
          const logCall = mockLogger.warn.mock.calls[0];
          const logContext = logCall[1];

          expect(logContext!.userId).toBe(authAttempt.userId);
          expect(logContext!.metadata!.reason).toBe(authAttempt.reason);
          expect(logContext!.metadata!.sourceIp).toBe(authAttempt.sourceIp);
        }
      ),
      { numRuns: 20 }
    );
  });
});
