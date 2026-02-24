/**
 * Unit tests for SNSNotificationHandler
 * 
 * Tests notification formatting, message structure, remediation steps,
 * and dashboard link generation.
 * 
 * Requirements: 3.8, 16.6, 16.7
 */

import { SNSNotificationHandler } from '../../lib/monitoring/sns-notification-handler';
import { NotificationMessage } from '../../lib/monitoring/types';

describe('SNSNotificationHandler - Notification Formatting', () => {
  describe('createNotificationFromAlarm', () => {
    it('should include all required fields in notification message', () => {
      const alarmName = 'Lambda-High-Errors';
      const alarmDescription = 'Lambda function error rate exceeded threshold';
      const metricName = 'Errors';
      const currentValue = 15.5;
      const threshold = 5.0;
      const severity = 'critical';
      const dashboardName = 'VocalShield-System-Overview';
      const region = 'us-east-1';

      const message = SNSNotificationHandler.createNotificationFromAlarm(
        alarmName,
        alarmDescription,
        metricName,
        currentValue,
        threshold,
        severity,
        dashboardName,
        region
      );

      // Requirement 3.8: Notification SHALL include alarm severity level
      expect(message.severity).toBe(severity);
      
      // Requirement 3.8: Notification SHALL include affected component
      expect(message.alarmName).toBe(alarmName);
      expect(message.alarmDescription).toBe(alarmDescription);
      
      // Requirement 3.8: Notification SHALL include metric value
      expect(message.currentValue).toBe(currentValue);
      
      // Requirement 3.8: Notification SHALL include threshold
      expect(message.threshold).toBe(threshold);
      
      // Requirement 16.6: Notification SHALL include alarm name
      expect(message.alarmName).toBe(alarmName);
      
      // Requirement 16.6: Notification SHALL include metric value
      expect(message.metricName).toBe(metricName);
      
      // Requirement 16.6: Notification SHALL include timestamp
      expect(message.timestamp).toBeDefined();
      expect(new Date(message.timestamp).getTime()).not.toBeNaN();
      
      // Requirement 16.6: Notification SHALL include direct link to Dashboard
      expect(message.dashboardLink).toBeDefined();
      expect(message.dashboardLink).toContain('console.aws.amazon.com/cloudwatch');
      expect(message.dashboardLink).toContain(dashboardName);
      expect(message.dashboardLink).toContain(region);
      
      // Requirement 16.7: Notification SHALL include suggested remediation steps
      expect(message.remediationSteps).toBeDefined();
      expect(Array.isArray(message.remediationSteps)).toBe(true);
      expect(message.remediationSteps.length).toBeGreaterThan(0);
    });

    it('should generate valid dashboard links for different regions', () => {
      const regions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'];
      
      regions.forEach(region => {
        const message = SNSNotificationHandler.createNotificationFromAlarm(
          'Test-Alarm',
          'Test description',
          'TestMetric',
          10,
          5,
          'warning',
          'Test-Dashboard',
          region
        );

        expect(message.dashboardLink).toContain(region);
        expect(message.dashboardLink).toMatch(/^https:\/\/console\.aws\.amazon\.com\/cloudwatch\/home\?region=.+#dashboards:name=.+$/);
      });
    });

    it('should handle all severity levels correctly', () => {
      const severities: Array<'critical' | 'warning' | 'info'> = ['critical', 'warning', 'info'];
      
      severities.forEach(severity => {
        const message = SNSNotificationHandler.createNotificationFromAlarm(
          'Test-Alarm',
          'Test description',
          'TestMetric',
          10,
          5,
          severity,
          'Test-Dashboard',
          'us-east-1'
        );

        expect(message.severity).toBe(severity);
      });
    });

    it('should generate timestamp in ISO 8601 format', () => {
      const message = SNSNotificationHandler.createNotificationFromAlarm(
        'Test-Alarm',
        'Test description',
        'TestMetric',
        10,
        5,
        'info',
        'Test-Dashboard',
        'us-east-1'
      );

      // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(message.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      
      // Should be a valid date
      const date = new Date(message.timestamp);
      expect(date.getTime()).not.toBeNaN();
      
      // Should be recent (within last minute)
      const now = Date.now();
      const timeDiff = now - date.getTime();
      expect(timeDiff).toBeGreaterThanOrEqual(0);
      expect(timeDiff).toBeLessThan(60000); // Less than 1 minute
    });

    it('should handle numeric values with decimals correctly', () => {
      const testCases = [
        { currentValue: 15.5, threshold: 5.0 },
        { currentValue: 0.001, threshold: 0.0001 },
        { currentValue: 99.999, threshold: 100.0 },
        { currentValue: 1000000, threshold: 500000 },
      ];

      testCases.forEach(({ currentValue, threshold }) => {
        const message = SNSNotificationHandler.createNotificationFromAlarm(
          'Test-Alarm',
          'Test description',
          'TestMetric',
          currentValue,
          threshold,
          'warning',
          'Test-Dashboard',
          'us-east-1'
        );

        expect(message.currentValue).toBe(currentValue);
        expect(message.threshold).toBe(threshold);
      });
    });
  });

  describe('getRemediationSteps', () => {
    it('should return Lambda-specific remediation steps for Lambda error alarms', () => {
      const alarmName = 'Lambda-High-Errors';
      const steps = SNSNotificationHandler.getRemediationSteps(alarmName);

      expect(steps).toBeDefined();
      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBeGreaterThan(0);
      
      // Should contain Lambda-specific guidance
      const stepsText = steps.join(' ').toLowerCase();
      expect(stepsText).toContain('lambda');
      expect(stepsText).toContain('cloudwatch logs');
    });

    it('should return API Gateway-specific remediation steps for 5xx error alarms', () => {
      const alarmName = 'APIGateway-5xx-Errors';
      const steps = SNSNotificationHandler.getRemediationSteps(alarmName);

      expect(steps).toBeDefined();
      expect(steps.length).toBeGreaterThan(0);
      
      // Should contain API Gateway-specific guidance
      const stepsText = steps.join(' ').toLowerCase();
      expect(stepsText).toContain('api gateway');
    });

    it('should return DynamoDB-specific remediation steps for throttle alarms', () => {
      const alarmName = 'DynamoDB-Throttle-Events';
      const steps = SNSNotificationHandler.getRemediationSteps(alarmName);

      expect(steps).toBeDefined();
      expect(steps.length).toBeGreaterThan(0);
      
      // Should contain DynamoDB-specific guidance
      const stepsText = steps.join(' ').toLowerCase();
      expect(stepsText).toContain('dynamodb');
      // Should mention capacity or throttling-related concepts
      expect(stepsText.includes('capacity') || stepsText.includes('throttle')).toBe(true);
    });

    it('should return latency-specific remediation steps for high latency alarms', () => {
      const alarmName = 'API-HighLatency-P99';
      const steps = SNSNotificationHandler.getRemediationSteps(alarmName);

      expect(steps).toBeDefined();
      expect(steps.length).toBeGreaterThan(0);
      
      // Should contain latency-specific guidance
      const stepsText = steps.join(' ').toLowerCase();
      expect(stepsText.includes('latency') || stepsText.includes('x-ray')).toBe(true);
    });

    it('should return Free Tier-specific remediation steps for usage alarms', () => {
      const alarmName = 'FreeTier-Lambda-Usage-High';
      const steps = SNSNotificationHandler.getRemediationSteps(alarmName);

      expect(steps).toBeDefined();
      expect(steps.length).toBeGreaterThan(0);
      
      // Should contain Free Tier-specific guidance
      const stepsText = steps.join(' ').toLowerCase();
      expect(stepsText.includes('free tier') || stepsText.includes('usage')).toBe(true);
    });

    it('should return security-specific remediation steps for security alarms', () => {
      const securityAlarms = [
        'Security-Failed-Auth-High',
        'BruteForce-Attack-Detected',
      ];

      securityAlarms.forEach(alarmName => {
        const steps = SNSNotificationHandler.getRemediationSteps(alarmName);

        expect(steps).toBeDefined();
        expect(steps.length).toBeGreaterThan(0);
        
        // Should contain security-specific guidance
        const stepsText = steps.join(' ').toLowerCase();
        expect(
          stepsText.includes('security') || 
          stepsText.includes('authentication') ||
          stepsText.includes('attack')
        ).toBe(true);
      });
    });

    it('should return default remediation steps for unknown alarm types', () => {
      const alarmName = 'Unknown-Custom-Alarm';
      const steps = SNSNotificationHandler.getRemediationSteps(alarmName);

      expect(steps).toBeDefined();
      expect(steps.length).toBeGreaterThan(0);
      
      // Should contain general guidance
      const stepsText = steps.join(' ').toLowerCase();
      expect(stepsText).toContain('cloudwatch');
    });

    it('should return non-empty strings for all remediation steps', () => {
      const alarmNames = [
        'Lambda-High-Errors',
        'APIGateway-5xx-Errors',
        'DynamoDB-Throttle-Events',
        'API-HighLatency-P99',
        'FreeTier-Lambda-Usage-High',
        'Security-Failed-Auth-High',
        'Unknown-Alarm',
      ];

      alarmNames.forEach(alarmName => {
        const steps = SNSNotificationHandler.getRemediationSteps(alarmName);
        
        steps.forEach(step => {
          expect(typeof step).toBe('string');
          expect(step.length).toBeGreaterThan(0);
          expect(step.trim()).toBe(step); // No leading/trailing whitespace
        });
      });
    });

    it('should return at least 3 remediation steps for any alarm', () => {
      const alarmNames = [
        'Lambda-High-Errors',
        'APIGateway-5xx-Errors',
        'DynamoDB-Throttle-Events',
        'API-HighLatency-P99',
        'FreeTier-Lambda-Usage-High',
        'Security-Failed-Auth-High',
        'Unknown-Alarm',
      ];

      alarmNames.forEach(alarmName => {
        const steps = SNSNotificationHandler.getRemediationSteps(alarmName);
        expect(steps.length).toBeGreaterThanOrEqual(3);
      });
    });
  });

  describe('Dashboard Link Validation', () => {
    it('should generate valid HTTPS URLs', () => {
      const message = SNSNotificationHandler.createNotificationFromAlarm(
        'Test-Alarm',
        'Test description',
        'TestMetric',
        10,
        5,
        'warning',
        'Test-Dashboard',
        'us-east-1'
      );

      expect(message.dashboardLink).toMatch(/^https:\/\//);
    });

    it('should include dashboard name in URL', () => {
      const dashboardNames = [
        'VocalShield-System-Overview',
        'VocalShield-Performance',
        'VocalShield-Errors',
        'VocalShield-Security',
        'VocalShield-Costs',
      ];

      dashboardNames.forEach(dashboardName => {
        const message = SNSNotificationHandler.createNotificationFromAlarm(
          'Test-Alarm',
          'Test description',
          'TestMetric',
          10,
          5,
          'info',
          dashboardName,
          'us-east-1'
        );

        expect(message.dashboardLink).toContain(dashboardName);
      });
    });

    it('should handle dashboard names with special characters', () => {
      const dashboardNames = [
        'Dashboard-With-Dashes',
        'Dashboard_With_Underscores',
        'Dashboard123',
      ];

      dashboardNames.forEach(dashboardName => {
        const message = SNSNotificationHandler.createNotificationFromAlarm(
          'Test-Alarm',
          'Test description',
          'TestMetric',
          10,
          5,
          'info',
          dashboardName,
          'us-east-1'
        );

        expect(message.dashboardLink).toContain(dashboardName);
        expect(message.dashboardLink).toMatch(/^https:\/\/.+$/);
      });
    });

    it('should generate region-specific console URLs', () => {
      const region = 'eu-west-1';
      const message = SNSNotificationHandler.createNotificationFromAlarm(
        'Test-Alarm',
        'Test description',
        'TestMetric',
        10,
        5,
        'warning',
        'Test-Dashboard',
        region
      );

      expect(message.dashboardLink).toContain(`region=${region}`);
      expect(message.dashboardLink).toContain('console.aws.amazon.com');
    });
  });

  describe('Message Field Completeness', () => {
    it('should not have any undefined required fields', () => {
      const message = SNSNotificationHandler.createNotificationFromAlarm(
        'Test-Alarm',
        'Test description',
        'TestMetric',
        10,
        5,
        'critical',
        'Test-Dashboard',
        'us-east-1'
      );

      // All required fields should be defined
      expect(message.severity).toBeDefined();
      expect(message.alarmName).toBeDefined();
      expect(message.alarmDescription).toBeDefined();
      expect(message.metricName).toBeDefined();
      expect(message.currentValue).toBeDefined();
      expect(message.threshold).toBeDefined();
      expect(message.timestamp).toBeDefined();
      expect(message.dashboardLink).toBeDefined();
      expect(message.remediationSteps).toBeDefined();
    });

    it('should not have any null required fields', () => {
      const message = SNSNotificationHandler.createNotificationFromAlarm(
        'Test-Alarm',
        'Test description',
        'TestMetric',
        10,
        5,
        'warning',
        'Test-Dashboard',
        'us-east-1'
      );

      // All required fields should not be null
      expect(message.severity).not.toBeNull();
      expect(message.alarmName).not.toBeNull();
      expect(message.alarmDescription).not.toBeNull();
      expect(message.metricName).not.toBeNull();
      expect(message.currentValue).not.toBeNull();
      expect(message.threshold).not.toBeNull();
      expect(message.timestamp).not.toBeNull();
      expect(message.dashboardLink).not.toBeNull();
      expect(message.remediationSteps).not.toBeNull();
    });

    it('should have non-empty string fields', () => {
      const message = SNSNotificationHandler.createNotificationFromAlarm(
        'Test-Alarm',
        'Test description',
        'TestMetric',
        10,
        5,
        'info',
        'Test-Dashboard',
        'us-east-1'
      );

      // String fields should not be empty
      expect(message.severity.length).toBeGreaterThan(0);
      expect(message.alarmName.length).toBeGreaterThan(0);
      expect(message.alarmDescription.length).toBeGreaterThan(0);
      expect(message.metricName.length).toBeGreaterThan(0);
      expect(message.timestamp.length).toBeGreaterThan(0);
      expect(message.dashboardLink.length).toBeGreaterThan(0);
    });

    it('should have valid numeric fields', () => {
      const message = SNSNotificationHandler.createNotificationFromAlarm(
        'Test-Alarm',
        'Test description',
        'TestMetric',
        10.5,
        5.2,
        'warning',
        'Test-Dashboard',
        'us-east-1'
      );

      // Numeric fields should be valid numbers
      expect(typeof message.currentValue).toBe('number');
      expect(typeof message.threshold).toBe('number');
      expect(isNaN(message.currentValue)).toBe(false);
      expect(isNaN(message.threshold)).toBe(false);
    });

    it('should have remediation steps as non-empty array', () => {
      const message = SNSNotificationHandler.createNotificationFromAlarm(
        'Test-Alarm',
        'Test description',
        'TestMetric',
        10,
        5,
        'critical',
        'Test-Dashboard',
        'us-east-1'
      );

      expect(Array.isArray(message.remediationSteps)).toBe(true);
      expect(message.remediationSteps.length).toBeGreaterThan(0);
      
      // Each step should be a non-empty string
      message.remediationSteps.forEach(step => {
        expect(typeof step).toBe('string');
        expect(step.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero values for metrics', () => {
      const message = SNSNotificationHandler.createNotificationFromAlarm(
        'Test-Alarm',
        'Test description',
        'TestMetric',
        0,
        0,
        'info',
        'Test-Dashboard',
        'us-east-1'
      );

      expect(message.currentValue).toBe(0);
      expect(message.threshold).toBe(0);
    });

    it('should handle negative values for metrics', () => {
      const message = SNSNotificationHandler.createNotificationFromAlarm(
        'Test-Alarm',
        'Test description',
        'TestMetric',
        -5.5,
        -10.0,
        'warning',
        'Test-Dashboard',
        'us-east-1'
      );

      expect(message.currentValue).toBe(-5.5);
      expect(message.threshold).toBe(-10.0);
    });

    it('should handle very large numeric values', () => {
      const message = SNSNotificationHandler.createNotificationFromAlarm(
        'Test-Alarm',
        'Test description',
        'TestMetric',
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER - 1,
        'critical',
        'Test-Dashboard',
        'us-east-1'
      );

      expect(message.currentValue).toBe(Number.MAX_SAFE_INTEGER);
      expect(message.threshold).toBe(Number.MAX_SAFE_INTEGER - 1);
    });

    it('should handle empty alarm description', () => {
      const message = SNSNotificationHandler.createNotificationFromAlarm(
        'Test-Alarm',
        '',
        'TestMetric',
        10,
        5,
        'info',
        'Test-Dashboard',
        'us-east-1'
      );

      expect(message.alarmDescription).toBe('');
      // Other fields should still be valid
      expect(message.alarmName).toBe('Test-Alarm');
      expect(message.remediationSteps.length).toBeGreaterThan(0);
    });

    it('should handle alarm names with multiple keywords', () => {
      const alarmName = 'Lambda-APIGateway-DynamoDB-HighLatency-FreeTier-Security';
      const steps = SNSNotificationHandler.getRemediationSteps(alarmName);

      // Should match the first keyword pattern (Lambda in this case)
      expect(steps).toBeDefined();
      expect(steps.length).toBeGreaterThan(0);
    });
  });
});
