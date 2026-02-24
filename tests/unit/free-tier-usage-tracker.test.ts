import { FreeTierUsageTracker, FREE_TIER_LIMITS } from '../../lib/monitoring/free-tier-usage-tracker';
import { FreeTierUsage } from '../../lib/monitoring/types';
import { MetricPublisher } from '../../lib/monitoring/metric-publisher';

/**
 * Unit Tests for FreeTierUsageTracker Edge Cases
 * 
 * These tests validate edge cases and error handling for Free Tier usage tracking.
 * 
 * Feature: monitoring-and-observability
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

// Mock CloudWatch client
jest.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatchClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  PutMetricDataCommand: jest.fn(),
  GetMetricStatisticsCommand: jest.fn(),
}));

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

describe('FreeTierUsageTracker Edge Cases', () => {
  let tracker: FreeTierUsageTracker;

  beforeEach(() => {
    jest.clearAllMocks();
    const metricPublisher = new MetricPublisher({ maxCustomMetrics: 100 });
    tracker = new FreeTierUsageTracker({ metricPublisher });
  });

  describe('Zero Usage Edge Cases', () => {
    test('should handle zero Lambda invocations', async () => {
      const usage = await tracker.trackLambdaInvocations(0);

      expect(usage.currentUsage).toBe(0);
      expect(usage.usagePercentage).toBe(0);
      expect(usage.limit).toBe(FREE_TIER_LIMITS.LAMBDA_INVOCATIONS);
    });

    test('should handle zero Lambda compute time', async () => {
      const usage = await tracker.trackLambdaComputeTime(0);

      expect(usage.currentUsage).toBe(0);
      expect(usage.usagePercentage).toBe(0);
      expect(usage.limit).toBe(FREE_TIER_LIMITS.LAMBDA_COMPUTE_TIME);
    });

    test('should handle zero DynamoDB storage', async () => {
      const usage = await tracker.trackDynamoDBStorage(0);

      expect(usage.currentUsage).toBe(0);
      expect(usage.usagePercentage).toBe(0);
      expect(usage.limit).toBe(FREE_TIER_LIMITS.DYNAMODB_STORAGE);
    });

    test('should handle zero CloudWatch Logs ingestion', async () => {
      const usage = await tracker.trackCloudWatchLogs(0);

      expect(usage.currentUsage).toBe(0);
      expect(usage.usagePercentage).toBe(0);
      expect(usage.limit).toBe(FREE_TIER_LIMITS.CLOUDWATCH_LOGS);
    });

    test('should handle zero CloudWatch custom metrics', async () => {
      const usage = await tracker.trackCloudWatchMetrics(0);

      expect(usage.currentUsage).toBe(0);
      expect(usage.usagePercentage).toBe(0);
      expect(usage.limit).toBe(FREE_TIER_LIMITS.CLOUDWATCH_METRICS);
    });

    test('should handle zero API Gateway requests', async () => {
      const usage = await tracker.trackAPIGatewayRequests(0);

      expect(usage.currentUsage).toBe(0);
      expect(usage.usagePercentage).toBe(0);
      expect(usage.limit).toBe(FREE_TIER_LIMITS.API_GATEWAY_REQUESTS);
    });
  });

  describe('Exactly At Limit Edge Cases', () => {
    test('should handle Lambda invocations exactly at limit', async () => {
      const usage = await tracker.trackLambdaInvocations(FREE_TIER_LIMITS.LAMBDA_INVOCATIONS);

      expect(usage.currentUsage).toBe(FREE_TIER_LIMITS.LAMBDA_INVOCATIONS);
      expect(usage.usagePercentage).toBeCloseTo(100, 2);
      expect(usage.limit).toBe(FREE_TIER_LIMITS.LAMBDA_INVOCATIONS);
    });

    test('should handle Lambda compute time exactly at limit', async () => {
      const usage = await tracker.trackLambdaComputeTime(FREE_TIER_LIMITS.LAMBDA_COMPUTE_TIME);

      expect(usage.currentUsage).toBe(FREE_TIER_LIMITS.LAMBDA_COMPUTE_TIME);
      expect(usage.usagePercentage).toBeCloseTo(100, 2);
      expect(usage.limit).toBe(FREE_TIER_LIMITS.LAMBDA_COMPUTE_TIME);
    });

    test('should handle DynamoDB storage exactly at limit', async () => {
      const usage = await tracker.trackDynamoDBStorage(FREE_TIER_LIMITS.DYNAMODB_STORAGE);

      expect(usage.currentUsage).toBe(FREE_TIER_LIMITS.DYNAMODB_STORAGE);
      expect(usage.usagePercentage).toBeCloseTo(100, 2);
      expect(usage.limit).toBe(FREE_TIER_LIMITS.DYNAMODB_STORAGE);
    });

    test('should handle CloudWatch Logs exactly at limit', async () => {
      const usage = await tracker.trackCloudWatchLogs(FREE_TIER_LIMITS.CLOUDWATCH_LOGS);

      expect(usage.currentUsage).toBe(FREE_TIER_LIMITS.CLOUDWATCH_LOGS);
      expect(usage.usagePercentage).toBeCloseTo(100, 2);
      expect(usage.limit).toBe(FREE_TIER_LIMITS.CLOUDWATCH_LOGS);
    });

    test('should handle CloudWatch metrics exactly at limit', async () => {
      const usage = await tracker.trackCloudWatchMetrics(FREE_TIER_LIMITS.CLOUDWATCH_METRICS);

      expect(usage.currentUsage).toBe(FREE_TIER_LIMITS.CLOUDWATCH_METRICS);
      expect(usage.usagePercentage).toBeCloseTo(100, 2);
      expect(usage.limit).toBe(FREE_TIER_LIMITS.CLOUDWATCH_METRICS);
    });

    test('should handle API Gateway requests exactly at limit', async () => {
      const usage = await tracker.trackAPIGatewayRequests(FREE_TIER_LIMITS.API_GATEWAY_REQUESTS);

      expect(usage.currentUsage).toBe(FREE_TIER_LIMITS.API_GATEWAY_REQUESTS);
      expect(usage.usagePercentage).toBeCloseTo(100, 2);
      expect(usage.limit).toBe(FREE_TIER_LIMITS.API_GATEWAY_REQUESTS);
    });
  });

  describe('Over Limit Edge Cases', () => {
    test('should handle Lambda invocations over limit', async () => {
      const overLimit = FREE_TIER_LIMITS.LAMBDA_INVOCATIONS * 1.5;
      const usage = await tracker.trackLambdaInvocations(overLimit);

      expect(usage.currentUsage).toBe(overLimit);
      expect(usage.usagePercentage).toBeGreaterThan(100);
      expect(usage.usagePercentage).toBeCloseTo(150, 2);
    });

    test('should handle Lambda compute time over limit', async () => {
      const overLimit = FREE_TIER_LIMITS.LAMBDA_COMPUTE_TIME * 2;
      const usage = await tracker.trackLambdaComputeTime(overLimit);

      expect(usage.currentUsage).toBe(overLimit);
      expect(usage.usagePercentage).toBeGreaterThan(100);
      expect(usage.usagePercentage).toBeCloseTo(200, 2);
    });

    test('should handle DynamoDB storage over limit', async () => {
      const overLimit = FREE_TIER_LIMITS.DYNAMODB_STORAGE * 1.2;
      const usage = await tracker.trackDynamoDBStorage(overLimit);

      expect(usage.currentUsage).toBe(overLimit);
      expect(usage.usagePercentage).toBeGreaterThan(100);
      expect(usage.usagePercentage).toBeCloseTo(120, 2);
    });

    test('should handle CloudWatch Logs over limit', async () => {
      const overLimit = FREE_TIER_LIMITS.CLOUDWATCH_LOGS * 1.1;
      const usage = await tracker.trackCloudWatchLogs(overLimit);

      expect(usage.currentUsage).toBe(overLimit);
      expect(usage.usagePercentage).toBeGreaterThan(100);
      expect(usage.usagePercentage).toBeCloseTo(110, 2);
    });

    test('should handle CloudWatch metrics over limit', async () => {
      const overLimit = FREE_TIER_LIMITS.CLOUDWATCH_METRICS * 1.5;
      const usage = await tracker.trackCloudWatchMetrics(overLimit);

      expect(usage.currentUsage).toBe(overLimit);
      expect(usage.usagePercentage).toBeGreaterThan(100);
      expect(usage.usagePercentage).toBeCloseTo(150, 2);
    });

    test('should handle API Gateway requests over limit', async () => {
      const overLimit = FREE_TIER_LIMITS.API_GATEWAY_REQUESTS * 1.3;
      const usage = await tracker.trackAPIGatewayRequests(overLimit);

      expect(usage.currentUsage).toBe(overLimit);
      expect(usage.usagePercentage).toBeGreaterThan(100);
      expect(usage.usagePercentage).toBeCloseTo(130, 2);
    });
  });

  describe('Invalid Limit Edge Cases', () => {
    test('should handle zero limit gracefully', () => {
      const percentage = tracker.calculateUsagePercentage('TestService', 1000, 0);

      expect(percentage).toBe(0);
    });

    test('should handle negative limit gracefully', () => {
      const percentage = tracker.calculateUsagePercentage('TestService', 1000, -100);

      expect(percentage).toBe(0);
    });
  });

  describe('Projection Edge Cases', () => {
    test('should handle projection on day 1 of month', () => {
      const usage: FreeTierUsage = {
        service: 'Lambda',
        metric: 'Invocations',
        currentUsage: 10000,
        limit: FREE_TIER_LIMITS.LAMBDA_INVOCATIONS,
        usagePercentage: 1,
        period: 'monthly',
        lastUpdated: new Date(),
      };

      const projected = tracker.projectUsage(usage, 1);

      expect(projected.projectedUsage).toBe(10000 * 30); // Daily rate * 30 days
      expect(projected.projectedUsage).toBeGreaterThan(usage.currentUsage);
    });

    test('should handle projection on last day of month', () => {
      const usage: FreeTierUsage = {
        service: 'Lambda',
        metric: 'Invocations',
        currentUsage: 900000,
        limit: FREE_TIER_LIMITS.LAMBDA_INVOCATIONS,
        usagePercentage: 90,
        period: 'monthly',
        lastUpdated: new Date(),
      };

      const projected = tracker.projectUsage(usage, 30);

      expect(projected.projectedUsage).toBe(900000); // Same as current on day 30
    });

    test('should handle projection with zero usage', () => {
      const usage: FreeTierUsage = {
        service: 'Lambda',
        metric: 'Invocations',
        currentUsage: 0,
        limit: FREE_TIER_LIMITS.LAMBDA_INVOCATIONS,
        usagePercentage: 0,
        period: 'monthly',
        lastUpdated: new Date(),
      };

      const projected = tracker.projectUsage(usage, 15);

      expect(projected.projectedUsage).toBe(0);
      expect(projected.daysUntilOverage).toBeUndefined();
    });

    test('should handle projection with usage already over limit', () => {
      const usage: FreeTierUsage = {
        service: 'Lambda',
        metric: 'Invocations',
        currentUsage: FREE_TIER_LIMITS.LAMBDA_INVOCATIONS * 1.2,
        limit: FREE_TIER_LIMITS.LAMBDA_INVOCATIONS,
        usagePercentage: 120,
        period: 'monthly',
        lastUpdated: new Date(),
      };

      const projected = tracker.projectUsage(usage, 15);

      expect(projected.daysUntilOverage).toBe(0);
    });

    test('should handle projection with invalid day (negative)', () => {
      const usage: FreeTierUsage = {
        service: 'Lambda',
        metric: 'Invocations',
        currentUsage: 100000,
        limit: FREE_TIER_LIMITS.LAMBDA_INVOCATIONS,
        usagePercentage: 10,
        period: 'monthly',
        lastUpdated: new Date(),
      };

      const projected = tracker.projectUsage(usage, -5);

      expect(projected.projectedUsage).toBeUndefined();
      expect(projected.daysUntilOverage).toBeUndefined();
    });

    test('should handle projection with invalid day (over 31)', () => {
      const usage: FreeTierUsage = {
        service: 'Lambda',
        metric: 'Invocations',
        currentUsage: 100000,
        limit: FREE_TIER_LIMITS.LAMBDA_INVOCATIONS,
        usagePercentage: 10,
        period: 'monthly',
        lastUpdated: new Date(),
      };

      const projected = tracker.projectUsage(usage, 35);

      expect(projected.projectedUsage).toBeUndefined();
      expect(projected.daysUntilOverage).toBeUndefined();
    });

    test('should calculate days until overage correctly', () => {
      const usage: FreeTierUsage = {
        service: 'Lambda',
        metric: 'Invocations',
        currentUsage: 500000, // 50% used
        limit: FREE_TIER_LIMITS.LAMBDA_INVOCATIONS,
        usagePercentage: 50,
        period: 'monthly',
        lastUpdated: new Date(),
      };

      const projected = tracker.projectUsage(usage, 10); // Day 10

      // Daily rate: 500000 / 10 = 50000 per day
      // Remaining capacity: 1000000 - 500000 = 500000
      // Days until overage: 500000 / 50000 = 10 days
      expect(projected.daysUntilOverage).toBe(10);
    });

    test('should handle projection when usage will not exceed limit', () => {
      const usage: FreeTierUsage = {
        service: 'Lambda',
        metric: 'Invocations',
        currentUsage: 100000, // 10% used
        limit: FREE_TIER_LIMITS.LAMBDA_INVOCATIONS,
        usagePercentage: 10,
        period: 'monthly',
        lastUpdated: new Date(),
      };

      const projected = tracker.projectUsage(usage, 25); // Day 25

      // Daily rate: 100000 / 25 = 4000 per day
      // Projected: 4000 * 30 = 120000 (well under limit)
      expect(projected.projectedUsage).toBe(120000);
      expect(projected.daysUntilOverage).toBeUndefined();
    });
  });

  describe('Overage Detection Edge Cases', () => {
    test('should detect overage within 7 days', async () => {
      const usage: FreeTierUsage = {
        service: 'Lambda',
        metric: 'Invocations',
        currentUsage: 900000,
        limit: FREE_TIER_LIMITS.LAMBDA_INVOCATIONS,
        usagePercentage: 90,
        period: 'monthly',
        lastUpdated: new Date(),
      };

      const willExceed = await tracker.checkProjectedOverage(usage, 10, 7);

      // Daily rate: 900000 / 10 = 90000 per day
      // Remaining: 100000
      // Days until overage: 100000 / 90000 = 1.11 days
      expect(willExceed).toBe(true);
    });

    test('should not detect overage when more than 7 days away', async () => {
      const usage: FreeTierUsage = {
        service: 'Lambda',
        metric: 'Invocations',
        currentUsage: 100000,
        limit: FREE_TIER_LIMITS.LAMBDA_INVOCATIONS,
        usagePercentage: 10,
        period: 'monthly',
        lastUpdated: new Date(),
      };

      const willExceed = await tracker.checkProjectedOverage(usage, 5, 7);

      // Daily rate: 100000 / 5 = 20000 per day
      // Remaining: 900000
      // Days until overage: 900000 / 20000 = 45 days
      expect(willExceed).toBe(false);
    });

    test('should detect immediate overage when already over limit', async () => {
      const usage: FreeTierUsage = {
        service: 'Lambda',
        metric: 'Invocations',
        currentUsage: FREE_TIER_LIMITS.LAMBDA_INVOCATIONS * 1.1,
        limit: FREE_TIER_LIMITS.LAMBDA_INVOCATIONS,
        usagePercentage: 110,
        period: 'monthly',
        lastUpdated: new Date(),
      };

      const willExceed = await tracker.checkProjectedOverage(usage, 15, 7);

      expect(willExceed).toBe(true);
    });

    test('should handle custom threshold for overage detection', async () => {
      const usage: FreeTierUsage = {
        service: 'Lambda',
        metric: 'Invocations',
        currentUsage: 800000,
        limit: FREE_TIER_LIMITS.LAMBDA_INVOCATIONS,
        usagePercentage: 80,
        period: 'monthly',
        lastUpdated: new Date(),
      };

      // Daily rate: 800000 / 10 = 80000 per day
      // Remaining: 200000
      // Days until overage: 200000 / 80000 = 2.5 days

      const willExceedIn7Days = await tracker.checkProjectedOverage(usage, 10, 7);
      expect(willExceedIn7Days).toBe(true);

      const willExceedIn2Days = await tracker.checkProjectedOverage(usage, 10, 2);
      expect(willExceedIn2Days).toBe(true); // 2.5 days rounds down to 2, so it triggers
    });
  });

  describe('Timestamp Handling', () => {
    test('should use provided timestamp', async () => {
      const customTimestamp = new Date('2024-01-15T10:00:00Z');
      const usage = await tracker.trackLambdaInvocations(100000, customTimestamp);

      expect(usage.lastUpdated).toEqual(customTimestamp);
    });

    test('should use current timestamp when not provided', async () => {
      const beforeTime = new Date();
      const usage = await tracker.trackLambdaInvocations(100000);
      const afterTime = new Date();

      expect(usage.lastUpdated.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(usage.lastUpdated.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('DynamoDB Capacity Edge Cases', () => {
    test('should handle fractional RCU values', async () => {
      const usage = await tracker.trackDynamoDBReadCapacity(12.5);

      expect(usage.currentUsage).toBe(12.5);
      expect(usage.usagePercentage).toBeCloseTo(50, 2);
    });

    test('should handle fractional WCU values', async () => {
      const usage = await tracker.trackDynamoDBWriteCapacity(18.75);

      expect(usage.currentUsage).toBe(18.75);
      expect(usage.usagePercentage).toBeCloseTo(75, 2);
    });

    test('should handle very small capacity values', async () => {
      const usage = await tracker.trackDynamoDBReadCapacity(0.001);

      expect(usage.currentUsage).toBe(0.001);
      expect(usage.usagePercentage).toBeCloseTo(0.004, 3);
    });
  });

  describe('CloudWatch Logs Edge Cases', () => {
    test('should handle fractional GB values', async () => {
      const usage = await tracker.trackCloudWatchLogs(2.5);

      expect(usage.currentUsage).toBe(2.5);
      expect(usage.usagePercentage).toBeCloseTo(50, 2);
    });

    test('should handle very small ingestion values', async () => {
      const usage = await tracker.trackCloudWatchLogs(0.001);

      expect(usage.currentUsage).toBe(0.001);
      expect(usage.usagePercentage).toBeCloseTo(0.02, 2);
    });
  });

  describe('Period Validation', () => {
    test('should always set period to monthly', async () => {
      const usages = await Promise.all([
        tracker.trackLambdaInvocations(100000),
        tracker.trackLambdaComputeTime(50000),
        tracker.trackDynamoDBStorage(10),
        tracker.trackCloudWatchLogs(2),
        tracker.trackCloudWatchMetrics(5),
        tracker.trackAPIGatewayRequests(100000),
      ]);

      usages.forEach(usage => {
        expect(usage.period).toBe('monthly');
      });
    });
  });

  describe('Service and Metric Names', () => {
    test('should set correct service and metric names for all tracking methods', async () => {
      const lambdaInvocations = await tracker.trackLambdaInvocations(100000);
      expect(lambdaInvocations.service).toBe('Lambda');
      expect(lambdaInvocations.metric).toBe('Invocations');

      const lambdaComputeTime = await tracker.trackLambdaComputeTime(50000);
      expect(lambdaComputeTime.service).toBe('Lambda');
      expect(lambdaComputeTime.metric).toBe('ComputeTime');

      const dynamoDBStorage = await tracker.trackDynamoDBStorage(10);
      expect(dynamoDBStorage.service).toBe('DynamoDB');
      expect(dynamoDBStorage.metric).toBe('Storage');

      const dynamoDBReadCapacity = await tracker.trackDynamoDBReadCapacity(15);
      expect(dynamoDBReadCapacity.service).toBe('DynamoDB');
      expect(dynamoDBReadCapacity.metric).toBe('ReadCapacity');

      const dynamoDBWriteCapacity = await tracker.trackDynamoDBWriteCapacity(20);
      expect(dynamoDBWriteCapacity.service).toBe('DynamoDB');
      expect(dynamoDBWriteCapacity.metric).toBe('WriteCapacity');

      const cloudWatchLogs = await tracker.trackCloudWatchLogs(2);
      expect(cloudWatchLogs.service).toBe('CloudWatch');
      expect(cloudWatchLogs.metric).toBe('LogsIngestion');

      const cloudWatchMetrics = await tracker.trackCloudWatchMetrics(5);
      expect(cloudWatchMetrics.service).toBe('CloudWatch');
      expect(cloudWatchMetrics.metric).toBe('CustomMetrics');

      const apiGatewayRequests = await tracker.trackAPIGatewayRequests(100000);
      expect(apiGatewayRequests.service).toBe('APIGateway');
      expect(apiGatewayRequests.metric).toBe('Requests');
    });
  });
});
