import * as fc from 'fast-check';
import { SNSNotificationHandler } from '../../lib/monitoring/sns-notification-handler';
import { NotificationMessage, AlarmSeverity } from '../../lib/monitoring/types';

/**
 * Property-Based Tests for Alarm Notification Content
 * 
 * These tests validate:
 * - Property 10: Alarm Notification Content
 * 
 * Feature: monitoring-and-observability
 * Validates: Requirements 3.8, 16.6, 16.7
 */

// Mock the logger to suppress console output during tests
jest.mock('../../lib/monitoring/structured-logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  },
  StructuredLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  })),
}));

// Mock AWS SDK SNS client
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  PublishCommand: jest.fn(),
}));

describe('Alarm Notification Content Properties', () => {
  /**
   * Property 10: Alarm Notification Content
   * 
   * Universal Property: For any alarm notification sent to SNS, the message
   * should contain severity level, alarm name, affected component, current
   * metric value, threshold, timestamp, dashboard link, and remediation steps.
   * 
   * Validates: Requirements 3.8, 16.6, 16.7
   */
  test('Property 10: Alarm notifications contain all required fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          severity: fc.constantFrom<AlarmSeverity>('critical', 'warning', 'info'),
          alarmName: fc.string({ minLength: 5, maxLength: 100 }).filter(s => s.trim().length > 0),
          alarmDescription: fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.trim().length > 0),
          metricName: fc.string({ minLength: 3, maxLength: 50 }).filter(s => s.trim().length > 0),
          currentValue: fc.double({ min: 0, max: 10000, noNaN: true }),
          threshold: fc.double({ min: 0, max: 10000, noNaN: true }),
          dashboardName: fc.string({ minLength: 3, maxLength: 50 }).filter(s => s.trim().length > 0),
          region: fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1'),
        }),
        (config) => {
          // Create notification message using the static factory method
          const message = SNSNotificationHandler.createNotificationFromAlarm(
            config.alarmName,
            config.alarmDescription,
            config.metricName,
            config.currentValue,
            config.threshold,
            config.severity,
            config.dashboardName,
            config.region
          );

          // Property 1: Message must contain severity level
          expect(message).toHaveProperty('severity');
          expect(message.severity).toBe(config.severity);
          expect(['critical', 'warning', 'info']).toContain(message.severity);

          // Property 2: Message must contain alarm name
          expect(message).toHaveProperty('alarmName');
          expect(message.alarmName).toBe(config.alarmName);
          expect(message.alarmName.length).toBeGreaterThan(0);

          // Property 3: Message must contain alarm description (affected component context)
          expect(message).toHaveProperty('alarmDescription');
          expect(message.alarmDescription).toBe(config.alarmDescription);
          expect(message.alarmDescription.length).toBeGreaterThan(0);

          // Property 4: Message must contain metric name
          expect(message).toHaveProperty('metricName');
          expect(message.metricName).toBe(config.metricName);
          expect(message.metricName.length).toBeGreaterThan(0);

          // Property 5: Message must contain current metric value
          expect(message).toHaveProperty('currentValue');
          expect(message.currentValue).toBe(config.currentValue);
          expect(typeof message.currentValue).toBe('number');
          expect(Number.isFinite(message.currentValue)).toBe(true);

          // Property 6: Message must contain threshold value
          expect(message).toHaveProperty('threshold');
          expect(message.threshold).toBe(config.threshold);
          expect(typeof message.threshold).toBe('number');
          expect(Number.isFinite(message.threshold)).toBe(true);

          // Property 7: Message must contain timestamp
          expect(message).toHaveProperty('timestamp');
          expect(message.timestamp).toBeTruthy();
          // Validate ISO 8601 format
          const timestamp = new Date(message.timestamp);
          expect(timestamp.toISOString()).toBe(message.timestamp);
          expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());

          // Property 8: Message must contain dashboard link
          expect(message).toHaveProperty('dashboardLink');
          expect(message.dashboardLink).toBeTruthy();
          expect(message.dashboardLink).toContain('https://');
          expect(message.dashboardLink).toContain('cloudwatch');
          expect(message.dashboardLink).toContain(config.region);
          expect(message.dashboardLink).toContain(config.dashboardName);

          // Property 9: Message must contain remediation steps
          expect(message).toHaveProperty('remediationSteps');
          expect(Array.isArray(message.remediationSteps)).toBe(true);
          expect(message.remediationSteps.length).toBeGreaterThan(0);
          
          // All remediation steps should be non-empty strings
          message.remediationSteps.forEach(step => {
            expect(typeof step).toBe('string');
            expect(step.length).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 10 (variant): Test notification message formatting
   */
  test('Property 10: Formatted notification messages contain all required information', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          severity: fc.constantFrom<AlarmSeverity>('critical', 'warning', 'info'),
          alarmName: fc.string({ minLength: 5, maxLength: 100 }).filter(s => s.trim().length > 0),
          alarmDescription: fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.trim().length > 0),
          metricName: fc.string({ minLength: 3, maxLength: 50 }).filter(s => s.trim().length > 0),
          currentValue: fc.double({ min: 0, max: 10000, noNaN: true }),
          threshold: fc.double({ min: 0, max: 10000, noNaN: true }),
          dashboardName: fc.string({ minLength: 3, maxLength: 50 }).filter(s => s.trim().length > 0),
          region: fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1'),
          topicArn: fc.constant('arn:aws:sns:us-east-1:123456789012:VocalShield-Alerts'),
        }),
        async (config) => {
          const handler = new SNSNotificationHandler({ region: config.region });
          
          const message = SNSNotificationHandler.createNotificationFromAlarm(
            config.alarmName,
            config.alarmDescription,
            config.metricName,
            config.currentValue,
            config.threshold,
            config.severity,
            config.dashboardName,
            config.region
          );

          // Send notification (mocked)
          await handler.sendNotification(
            config.topicArn,
            `VocalShield Alert: ${config.alarmName}`,
            message
          );

          // Property: All required fields should be present in the message object
          expect(message.severity).toBeDefined();
          expect(message.alarmName).toBeDefined();
          expect(message.alarmDescription).toBeDefined();
          expect(message.metricName).toBeDefined();
          expect(message.currentValue).toBeDefined();
          expect(message.threshold).toBeDefined();
          expect(message.timestamp).toBeDefined();
          expect(message.dashboardLink).toBeDefined();
          expect(message.remediationSteps).toBeDefined();

          // Property: No required field should be null or undefined
          expect(message.severity).not.toBeNull();
          expect(message.alarmName).not.toBeNull();
          expect(message.alarmDescription).not.toBeNull();
          expect(message.metricName).not.toBeNull();
          expect(message.currentValue).not.toBeNull();
          expect(message.threshold).not.toBeNull();
          expect(message.timestamp).not.toBeNull();
          expect(message.dashboardLink).not.toBeNull();
          expect(message.remediationSteps).not.toBeNull();
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 10 (variant): Test remediation steps are context-specific
   */
  test('Property 10: Remediation steps are tailored to alarm type', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          { alarmName: 'VocalShield-Lambda-Errors-High', expectedKeywords: ['lambda', 'function'] },
          { alarmName: 'VocalShield-APIGateway-5xx-Errors', expectedKeywords: ['api', 'gateway'] },
          { alarmName: 'VocalShield-DynamoDB-Throttle-Events', expectedKeywords: ['dynamodb', 'table'] },
          { alarmName: 'VocalShield-HighLatency-P99', expectedKeywords: ['latency', 'slow', 'performance'] },
          { alarmName: 'VocalShield-FreeTier-Usage-Warning', expectedKeywords: ['free tier', 'usage', 'tier'] },
          { alarmName: 'VocalShield-Security-BruteForce-Detected', expectedKeywords: ['security', 'authentication', 'auth'] },
        ),
        (config) => {
          const remediationSteps = SNSNotificationHandler.getRemediationSteps(config.alarmName);

          // Property 1: Remediation steps should be an array
          expect(Array.isArray(remediationSteps)).toBe(true);

          // Property 2: Should have at least one remediation step
          expect(remediationSteps.length).toBeGreaterThan(0);

          // Property 3: All steps should be non-empty strings
          remediationSteps.forEach(step => {
            expect(typeof step).toBe('string');
            expect(step.length).toBeGreaterThan(0);
            expect(step.trim().length).toBeGreaterThan(0);
          });

          // Property 4: Steps should be context-specific (contain at least one relevant keyword)
          const allStepsText = remediationSteps.join(' ').toLowerCase();
          const hasRelevantKeyword = config.expectedKeywords.some(keyword => 
            allStepsText.includes(keyword.toLowerCase())
          );
          expect(hasRelevantKeyword).toBe(true);

          // Property 5: Each step should be actionable (contain verbs)
          const actionVerbs = ['check', 'review', 'verify', 'consider', 'monitor', 'identify', 'alert', 'optimize', 'implement'];
          remediationSteps.forEach(step => {
            const stepLower = step.toLowerCase();
            const hasActionVerb = actionVerbs.some(verb => stepLower.includes(verb));
            expect(hasActionVerb).toBe(true);
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 10 (variant): Test dashboard link format
   */
  test('Property 10: Dashboard links are properly formatted and accessible', () => {
    fc.assert(
      fc.property(
        fc.record({
          dashboardName: fc.string({ minLength: 3, maxLength: 50 })
            .filter(s => s.trim().length > 0 && !s.includes(' ')), // Filter out names with spaces
          region: fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'),
        }),
        (config) => {
          const message = SNSNotificationHandler.createNotificationFromAlarm(
            'Test-Alarm',
            'Test alarm description',
            'TestMetric',
            100,
            50,
            'warning',
            config.dashboardName,
            config.region
          );

          // Property 1: Dashboard link should be a valid HTTPS URL
          expect(message.dashboardLink).toMatch(/^https:\/\//);

          // Property 2: Link should point to CloudWatch console
          expect(message.dashboardLink).toContain('console.aws.amazon.com/cloudwatch');

          // Property 3: Link should include the correct region
          expect(message.dashboardLink).toContain(`region=${config.region}`);

          // Property 4: Link should include the dashboard name
          expect(message.dashboardLink).toContain(config.dashboardName);

          // Property 5: Link should point to dashboards section
          expect(message.dashboardLink).toContain('dashboards');

          // Property 6: Link format should follow CloudWatch URL pattern
          expect(message.dashboardLink).toMatch(/https:\/\/console\.aws\.amazon\.com\/cloudwatch\/home\?region=[\w-]+#dashboards:/);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 10 (variant): Test severity levels are valid
   */
  test('Property 10: Notification severity levels are valid and consistent', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<AlarmSeverity>('critical', 'warning', 'info'),
        (severity) => {
          const message = SNSNotificationHandler.createNotificationFromAlarm(
            'Test-Alarm',
            'Test alarm description',
            'TestMetric',
            100,
            50,
            severity,
            'TestDashboard',
            'us-east-1'
          );

          // Property 1: Severity should be one of the valid values
          expect(['critical', 'warning', 'info']).toContain(message.severity);

          // Property 2: Severity should match the input
          expect(message.severity).toBe(severity);

          // Property 3: Severity should be lowercase
          expect(message.severity).toBe(message.severity.toLowerCase());

          // Property 4: Severity should not be empty
          expect(message.severity.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 10 (variant): Test metric values are properly represented
   */
  test('Property 10: Metric values and thresholds are accurately represented', () => {
    fc.assert(
      fc.property(
        fc.record({
          currentValue: fc.double({ min: 0, max: 100000, noNaN: true }),
          threshold: fc.double({ min: 0, max: 100000, noNaN: true }),
        }),
        (config) => {
          const message = SNSNotificationHandler.createNotificationFromAlarm(
            'Test-Alarm',
            'Test alarm description',
            'TestMetric',
            config.currentValue,
            config.threshold,
            'warning',
            'TestDashboard',
            'us-east-1'
          );

          // Property 1: Current value should be a finite number
          expect(Number.isFinite(message.currentValue)).toBe(true);
          expect(message.currentValue).toBe(config.currentValue);

          // Property 2: Threshold should be a finite number
          expect(Number.isFinite(message.threshold)).toBe(true);
          expect(message.threshold).toBe(config.threshold);

          // Property 3: Values should not be NaN
          expect(Number.isNaN(message.currentValue)).toBe(false);
          expect(Number.isNaN(message.threshold)).toBe(false);

          // Property 4: Values should be non-negative
          expect(message.currentValue).toBeGreaterThanOrEqual(0);
          expect(message.threshold).toBeGreaterThanOrEqual(0);

          // Property 5: Values should preserve precision
          expect(message.currentValue).toBeCloseTo(config.currentValue, 10);
          expect(message.threshold).toBeCloseTo(config.threshold, 10);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 10 (variant): Test timestamp validity
   */
  test('Property 10: Notification timestamps are valid and recent', () => {
    fc.assert(
      fc.property(
        fc.record({
          alarmName: fc.string({ minLength: 5, maxLength: 100 }).filter(s => s.trim().length > 0),
        }),
        (config) => {
          const beforeCreation = Date.now();
          
          const message = SNSNotificationHandler.createNotificationFromAlarm(
            config.alarmName,
            'Test alarm description',
            'TestMetric',
            100,
            50,
            'warning',
            'TestDashboard',
            'us-east-1'
          );

          const afterCreation = Date.now();

          // Property 1: Timestamp should be a valid ISO 8601 string
          const timestamp = new Date(message.timestamp);
          expect(timestamp.toISOString()).toBe(message.timestamp);

          // Property 2: Timestamp should be recent (within test execution time)
          const timestampMs = timestamp.getTime();
          expect(timestampMs).toBeGreaterThanOrEqual(beforeCreation - 1000); // 1 second tolerance
          expect(timestampMs).toBeLessThanOrEqual(afterCreation + 1000); // 1 second tolerance

          // Property 3: Timestamp should not be in the future
          expect(timestampMs).toBeLessThanOrEqual(Date.now() + 1000);

          // Property 4: Timestamp should be parseable
          expect(Number.isNaN(timestampMs)).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 10 (variant): Test complete notification structure
   */
  test('Property 10: Notification messages have complete and valid structure', () => {
    fc.assert(
      fc.property(
        fc.record({
          severity: fc.constantFrom<AlarmSeverity>('critical', 'warning', 'info'),
          alarmName: fc.string({ minLength: 5, maxLength: 100 }).filter(s => s.trim().length > 0),
          alarmDescription: fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.trim().length > 0),
          metricName: fc.string({ minLength: 3, maxLength: 50 }).filter(s => s.trim().length > 0),
          currentValue: fc.double({ min: 0, max: 10000, noNaN: true }),
          threshold: fc.double({ min: 0, max: 10000, noNaN: true }),
          dashboardName: fc.string({ minLength: 3, maxLength: 50 }).filter(s => s.trim().length > 0),
          region: fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1'),
        }),
        (config) => {
          const message = SNSNotificationHandler.createNotificationFromAlarm(
            config.alarmName,
            config.alarmDescription,
            config.metricName,
            config.currentValue,
            config.threshold,
            config.severity,
            config.dashboardName,
            config.region
          );

          // Property 1: Message should have exactly the expected properties
          const expectedProperties = [
            'severity',
            'alarmName',
            'alarmDescription',
            'metricName',
            'currentValue',
            'threshold',
            'timestamp',
            'dashboardLink',
            'remediationSteps'
          ];

          expectedProperties.forEach(prop => {
            expect(message).toHaveProperty(prop);
          });

          // Property 2: Message should be serializable to JSON
          const serialized = JSON.stringify(message);
          expect(serialized).toBeTruthy();
          expect(serialized.length).toBeGreaterThan(0);

          // Property 3: Deserialized message should match original
          const deserialized = JSON.parse(serialized);
          expect(deserialized.severity).toBe(message.severity);
          expect(deserialized.alarmName).toBe(message.alarmName);
          expect(deserialized.currentValue).toBe(message.currentValue);
          expect(deserialized.threshold).toBe(message.threshold);

          // Property 4: Message should not contain undefined values
          Object.values(message).forEach(value => {
            expect(value).not.toBeUndefined();
          });

          // Property 5: String fields should not be empty
          expect(message.severity.length).toBeGreaterThan(0);
          expect(message.alarmName.length).toBeGreaterThan(0);
          expect(message.alarmDescription.length).toBeGreaterThan(0);
          expect(message.metricName.length).toBeGreaterThan(0);
          expect(message.timestamp.length).toBeGreaterThan(0);
          expect(message.dashboardLink.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 10 (edge case): Test with extreme metric values
   */
  test('Property 10: Notifications handle extreme metric values correctly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          { currentValue: 0, threshold: 0 },
          { currentValue: Number.MAX_SAFE_INTEGER, threshold: Number.MAX_SAFE_INTEGER },
          { currentValue: 0.000001, threshold: 0.000001 },
          { currentValue: 999999.999999, threshold: 1000000 },
        ),
        (config) => {
          const message = SNSNotificationHandler.createNotificationFromAlarm(
            'Test-Alarm',
            'Test alarm description',
            'TestMetric',
            config.currentValue,
            config.threshold,
            'warning',
            'TestDashboard',
            'us-east-1'
          );

          // Property 1: Extreme values should be preserved
          expect(message.currentValue).toBe(config.currentValue);
          expect(message.threshold).toBe(config.threshold);

          // Property 2: Values should remain finite
          expect(Number.isFinite(message.currentValue)).toBe(true);
          expect(Number.isFinite(message.threshold)).toBe(true);

          // Property 3: Message should still be valid
          expect(message.severity).toBeDefined();
          expect(message.alarmName).toBeDefined();
          expect(message.remediationSteps.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 10 (edge case): Test default remediation steps
   */
  test('Property 10: Default remediation steps are provided for unknown alarm types', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 100 }).filter(s => {
          // Generate alarm names that don't match known patterns
          const s_lower = s.toLowerCase();
          return !s_lower.includes('lambda') &&
                 !s_lower.includes('api') &&
                 !s_lower.includes('dynamodb') &&
                 !s_lower.includes('latency') &&
                 !s_lower.includes('freetier') &&
                 !s_lower.includes('security') &&
                 !s_lower.includes('bruteforce') &&
                 s.trim().length > 0;
        }),
        (alarmName) => {
          const remediationSteps = SNSNotificationHandler.getRemediationSteps(alarmName);

          // Property 1: Should always return remediation steps
          expect(Array.isArray(remediationSteps)).toBe(true);
          expect(remediationSteps.length).toBeGreaterThan(0);

          // Property 2: Default steps should be generic but helpful
          remediationSteps.forEach(step => {
            expect(typeof step).toBe('string');
            expect(step.length).toBeGreaterThan(0);
          });

          // Property 3: Should include references to CloudWatch
          const allStepsText = remediationSteps.join(' ').toLowerCase();
          expect(allStepsText).toContain('cloudwatch');
        }
      ),
      { numRuns: 20 }
    );
  });
});
