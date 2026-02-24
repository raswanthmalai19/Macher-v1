/**
 * Property-Based Tests: Invalid Token Tracking
 * Feature: monitoring-and-observability
 * 
 * Property 20: Invalid Token Tracking
 * **Validates: Requirements 10.4**
 * 
 * For any API Gateway request with an invalid or missing authentication token,
 * the request should be logged and a metric should be incremented.
 */

import * as fc from 'fast-check';
import { SecurityMonitor } from '../../../lib/monitoring/security-monitor';
import { StructuredLogger } from '../../../lib/monitoring/structured-logger';
import { MetricPublisher } from '../../../lib/monitoring/metric-publisher';

// Mock dependencies
jest.mock('../../../lib/monitoring/structured-logger');
jest.mock('../../../lib/monitoring/metric-publisher');

describe('Property 20: Invalid Token Tracking', () => {
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
   * Test that all invalid token requests are logged with required fields
   */
  test('invalid token requests should be logged with userId (if available), sourceIp, and reason', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.option(fc.uuid(), { nil: undefined }),
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
          reason: fc.constantFrom(
            'Token expired',
            'Invalid signature',
            'Token not found',
            'Malformed token',
            'Missing token',
            'Invalid token format',
            'Token revoked',
            'Insufficient permissions'
          ),
        }),
        async (tokenRequest) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Log invalid token request
          await monitor.logInvalidToken(
            tokenRequest.userId,
            tokenRequest.sourceIp,
            tokenRequest.reason
          );

          // Verify logger was called with required fields
          expect(mockLogger.warn).toHaveBeenCalledTimes(1);
          const logCall = mockLogger.warn.mock.calls[0];

          // Verify log message
          expect(logCall[0]).toBe('Invalid token request');

          // Verify log context contains required fields
          const logContext = logCall[1];
          expect(logContext).toBeDefined();
          expect(logContext!.component).toBe('SecurityMonitor');
          expect(logContext!.operation).toBe('tokenValidation');
          expect(logContext!.userId).toBe(tokenRequest.userId);

          // Verify metadata contains required fields
          expect(logContext!.metadata).toBeDefined();
          expect(logContext!.metadata!.reason).toBe(tokenRequest.reason);
          expect(logContext!.metadata!.sourceIp).toBe(tokenRequest.sourceIp);
          expect(logContext!.metadata!.timestamp).toBeDefined();

          // Verify timestamp is valid ISO 8601 format
          const timestamp = new Date(logContext!.metadata!.timestamp as string);
          expect(timestamp.getTime()).toBeGreaterThan(0);
          expect(isNaN(timestamp.getTime())).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that metrics are published for invalid token requests
   */
  test('metrics should be published for all invalid token requests', async () => {
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

          // Verify metric was published
          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledTimes(1);
          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledWith(
            'VocalShield/Security',
            'InvalidTokenRequests',
            1,
            expect.any(String), // MetricUnit.Count
            expect.objectContaining({
              Reason: expect.any(String),
            })
          );

          // Verify the reason dimension is sanitized
          const metricCall = mockMetricPublisher.publishMetric.mock.calls[0];
          const dimensions = metricCall[4] as Record<string, string>;
          expect(dimensions.Reason).toBeDefined();
          expect(dimensions.Reason.length).toBeGreaterThan(0);
          expect(dimensions.Reason.length).toBeLessThanOrEqual(255);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that different token error types are tracked correctly
   */
  test('different token error types should be tracked with distinct reasons', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            userId: fc.option(fc.uuid(), { nil: undefined }),
            sourceIp: fc.ipV4(),
            reason: fc.constantFrom(
              'Token expired',
              'Invalid signature',
              'Token not found',
              'Malformed token',
              'Missing token',
              'Token revoked',
              'Insufficient permissions'
            ),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (tokenRequests) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Log all invalid token requests
          for (const request of tokenRequests) {
            await monitor.logInvalidToken(
              request.userId,
              request.sourceIp,
              request.reason
            );
          }

          // Verify each request was logged
          expect(mockLogger.warn).toHaveBeenCalledTimes(tokenRequests.length);

          // Verify each log call has correct data
          for (let i = 0; i < tokenRequests.length; i++) {
            const logCall = mockLogger.warn.mock.calls[i];
            const logContext = logCall[1];

            expect(logContext!.userId).toBe(tokenRequests[i].userId);
            expect(logContext!.metadata!.reason).toBe(tokenRequests[i].reason);
            expect(logContext!.metadata!.sourceIp).toBe(tokenRequests[i].sourceIp);
          }

          // Verify metrics were published for each request
          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledTimes(tokenRequests.length);

          // Verify each metric has the correct reason dimension
          for (let i = 0; i < tokenRequests.length; i++) {
            const metricCall = mockMetricPublisher.publishMetric.mock.calls[i];
            const dimensions = metricCall[4] as Record<string, string>;
            
            // The reason should be sanitized but recognizable
            expect(dimensions.Reason).toBeDefined();
            expect(dimensions.Reason.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that logs contain proper context for security analysis
   */
  test('logs should contain proper context for security analysis', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.option(fc.uuid(), { nil: undefined }),
          sourceIp: fc.ipV4(),
          reason: fc.string({ minLength: 5, maxLength: 100 }),
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

          const logCall = mockLogger.warn.mock.calls[0];
          const logContext = logCall[1];

          // Verify context fields for security analysis
          expect(logContext!.component).toBe('SecurityMonitor');
          expect(logContext!.operation).toBe('tokenValidation');
          
          // userId may be undefined for requests without valid tokens
          if (tokenRequest.userId !== undefined) {
            expect(logContext!.userId).toBe(tokenRequest.userId);
          } else {
            expect(logContext!.userId).toBeUndefined();
          }

          // Verify all required metadata is present for security analysis
          expect(logContext!.metadata).toMatchObject({
            reason: tokenRequest.reason,
            sourceIp: tokenRequest.sourceIp,
            timestamp: expect.any(String),
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that invalid token requests without userId are handled correctly
   */
  test('invalid token requests without userId should be logged correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sourceIp: fc.ipV4(),
          reason: fc.constantFrom(
            'Missing token',
            'Malformed token',
            'Token not found'
          ),
        }),
        async (tokenRequest) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Log invalid token request without userId
          await monitor.logInvalidToken(
            undefined,
            tokenRequest.sourceIp,
            tokenRequest.reason
          );

          // Verify logger was called
          expect(mockLogger.warn).toHaveBeenCalledTimes(1);
          const logCall = mockLogger.warn.mock.calls[0];

          // Verify log context
          const logContext = logCall[1];
          expect(logContext!.component).toBe('SecurityMonitor');
          expect(logContext!.operation).toBe('tokenValidation');
          expect(logContext!.userId).toBeUndefined();

          // Verify metadata still contains required fields
          expect(logContext!.metadata!.reason).toBe(tokenRequest.reason);
          expect(logContext!.metadata!.sourceIp).toBe(tokenRequest.sourceIp);
          expect(logContext!.metadata!.timestamp).toBeDefined();

          // Verify metric was still published
          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledTimes(1);
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
          userId: fc.option(fc.uuid(), { nil: undefined }),
          sourceIp: fc.ipV4(),
          reason: fc.string({ minLength: 5, maxLength: 100 }),
        }),
        async (tokenRequest) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          const beforeTime = Date.now();
          await monitor.logInvalidToken(
            tokenRequest.userId,
            tokenRequest.sourceIp,
            tokenRequest.reason
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
   * Test that reason strings with special characters are handled correctly
   */
  test('reason strings with special characters should be sanitized for metrics', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.option(fc.uuid(), { nil: undefined }),
          sourceIp: fc.ipV4(),
          reason: fc.oneof(
            fc.constant('Token expired!@#$%^&*()'),
            fc.constant('Invalid signature <script>alert("xss")</script>'),
            fc.constant('Token not found | DROP TABLE tokens;'),
            fc.constant('Malformed token with unicode: 你好 مرحبا'),
            fc.string({ minLength: 300, maxLength: 300 }) // Very long reason
          ),
        }),
        async (tokenRequest) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Should not throw
          await expect(
            monitor.logInvalidToken(
              tokenRequest.userId,
              tokenRequest.sourceIp,
              tokenRequest.reason
            )
          ).resolves.not.toThrow();

          // Verify logging occurred
          expect(mockLogger.warn).toHaveBeenCalledTimes(1);

          // Verify the original reason is preserved in logs
          const logCall = mockLogger.warn.mock.calls[0];
          const logContext = logCall[1];
          expect(logContext!.metadata!.reason).toBe(tokenRequest.reason);

          // Verify metric was published with sanitized reason
          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledTimes(1);
          const metricCall = mockMetricPublisher.publishMetric.mock.calls[0];
          const dimensions = metricCall[4] as Record<string, string>;
          
          // Sanitized reason should be safe for CloudWatch dimensions
          expect(dimensions.Reason).toBeDefined();
          expect(dimensions.Reason.length).toBeLessThanOrEqual(255);
          expect(dimensions.Reason.length).toBeGreaterThan(0);
          
          // Should not contain dangerous characters
          expect(dimensions.Reason).not.toContain('<');
          expect(dimensions.Reason).not.toContain('>');
          expect(dimensions.Reason).not.toContain('|');
          expect(dimensions.Reason).not.toContain(';');
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that edge case IP addresses are handled correctly
   */
  test('edge case IP addresses should be handled correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.option(fc.uuid(), { nil: undefined }),
          sourceIp: fc.oneof(
            fc.constant('0.0.0.0'), // Edge case IP
            fc.constant('255.255.255.255'), // Max IP
            fc.constant('127.0.0.1'), // Localhost
            fc.constant('::1'), // IPv6 localhost
            fc.constant('2001:0db8:85a3:0000:0000:8a2e:0370:7334'), // Full IPv6
            fc.constant('fe80::1') // Link-local IPv6
          ),
          reason: fc.constantFrom(
            'Token expired',
            'Invalid signature',
            'Missing token'
          ),
        }),
        async (tokenRequest) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Should not throw
          await expect(
            monitor.logInvalidToken(
              tokenRequest.userId,
              tokenRequest.sourceIp,
              tokenRequest.reason
            )
          ).resolves.not.toThrow();

          // Verify logging occurred
          expect(mockLogger.warn).toHaveBeenCalledTimes(1);

          // Verify IP is preserved
          const logCall = mockLogger.warn.mock.calls[0];
          const logContext = logCall[1];
          expect(logContext!.metadata!.sourceIp).toBe(tokenRequest.sourceIp);

          // Verify metric was published
          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that concurrent invalid token requests are tracked independently
   */
  test('concurrent invalid token requests should be tracked independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
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
          { minLength: 5, maxLength: 20 }
        ),
        async (tokenRequests) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Log all requests concurrently
          await Promise.all(
            tokenRequests.map(request =>
              monitor.logInvalidToken(
                request.userId,
                request.sourceIp,
                request.reason
              )
            )
          );

          // Verify each request was logged
          expect(mockLogger.warn).toHaveBeenCalledTimes(tokenRequests.length);

          // Verify metrics were published for each request
          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledTimes(tokenRequests.length);

          // Verify all log entries are distinct
          const logCalls = mockLogger.warn.mock.calls;
          for (let i = 0; i < tokenRequests.length; i++) {
            const logContext = logCalls[i][1];
            
            // Find matching request (order may vary due to concurrency)
            const matchingRequest = tokenRequests.find(req =>
              req.userId === logContext!.userId &&
              req.sourceIp === logContext!.metadata!.sourceIp &&
              req.reason === logContext!.metadata!.reason
            );
            
            expect(matchingRequest).toBeDefined();
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that metric publishing failures don't prevent logging
   */
  test('metric publishing failures should not prevent logging', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.option(fc.uuid(), { nil: undefined }),
          sourceIp: fc.ipV4(),
          reason: fc.string({ minLength: 5, maxLength: 100 }),
        }),
        async (tokenRequest) => {
          // Clear mocks for this iteration
          jest.clearAllMocks();
          
          // Make metric publishing fail
          mockMetricPublisher.publishMetric.mockRejectedValueOnce(
            new Error('CloudWatch API throttled')
          );
          
          const monitor = new SecurityMonitor(mockLogger, mockMetricPublisher);

          // Should not throw even if metric publishing fails
          await expect(
            monitor.logInvalidToken(
              tokenRequest.userId,
              tokenRequest.sourceIp,
              tokenRequest.reason
            )
          ).resolves.not.toThrow();

          // Verify logging occurred (may be 2 calls: 1 for invalid token, 1 for metric failure warning)
          expect(mockLogger.warn).toHaveBeenCalled();
          
          // Verify the first call was for the invalid token
          const firstLogCall = mockLogger.warn.mock.calls[0];
          expect(firstLogCall[0]).toBe('Invalid token request');
          
          // Verify metric publishing was attempted
          expect(mockMetricPublisher.publishMetric).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 20 }
    );
  });
});
