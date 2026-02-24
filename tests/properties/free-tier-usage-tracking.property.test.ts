import * as fc from 'fast-check';
import { FreeTierUsageTracker, FREE_TIER_LIMITS } from '../../lib/monitoring/free-tier-usage-tracker';
import { MetricPublisher } from '../../lib/monitoring/metric-publisher';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

/**
 * Property-Based Tests for Free Tier Usage Tracking
 * 
 * These tests validate:
 * - Property 17: Free Tier Usage Tracking
 * 
 * Feature: monitoring-and-observability
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 18.4
 */

// Mock CloudWatch client
jest.mock('@aws-sdk/client-cloudwatch');

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

describe('Free Tier Usage Tracking Properties', () => {
  let mockSend: jest.Mock;
  let mockCloudWatchClient: jest.Mocked<CloudWatchClient>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup mock CloudWatch client
    mockSend = jest.fn().mockResolvedValue({});
    mockCloudWatchClient = {
      send: mockSend,
    } as unknown as jest.Mocked<CloudWatchClient>;
    
    // Mock the CloudWatchClient constructor
    (CloudWatchClient as jest.MockedClass<typeof CloudWatchClient>).mockImplementation(() => mockCloudWatchClient);
  });

  /**
   * Property 17: Free Tier Usage Tracking
   * 
   * Universal Property: For any AWS service with Free Tier limits,
   * current usage should be tracked and published as a percentage of the limit.
   * 
   * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 18.4
   */
  test('Property 17: Free Tier usage is correctly tracked and calculated as percentage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          service: fc.constantFrom('Lambda', 'DynamoDB', 'CloudWatch', 'APIGateway'),
          currentUsage: fc.integer({ min: 0, max: 2_000_000 }),
          limit: fc.integer({ min: 1000, max: 1_000_000 }),
        }),
        async (config) => {
          const metricPublisher = new MetricPublisher({ maxCustomMetrics: 100 });
          const tracker = new FreeTierUsageTracker({ metricPublisher });
          
          // Calculate expected percentage
          const expectedPercentage = (config.currentUsage / config.limit) * 100;
          
          // Calculate usage percentage using tracker
          const actualPercentage = tracker.calculateUsagePercentage(
            config.service,
            config.currentUsage,
            config.limit
          );
          
          // Property 1: Percentage should be mathematically correct
          expect(actualPercentage).toBeCloseTo(expectedPercentage, 2);
          
          // Property 2: Percentage should be non-negative
          expect(actualPercentage).toBeGreaterThanOrEqual(0);
          
          // Property 3: If usage is zero, percentage should be zero
          if (config.currentUsage === 0) {
            expect(actualPercentage).toBe(0);
          }
          
          // Property 4: If usage equals limit, percentage should be 100
          if (config.currentUsage === config.limit) {
            expect(actualPercentage).toBeCloseTo(100, 2);
          }
          
          // Property 5: If usage is less than limit, percentage should be less than 100
          if (config.currentUsage < config.limit) {
            expect(actualPercentage).toBeLessThan(100);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 17 (variant): Test Lambda invocation tracking
   */
  test('Property 17: Lambda invocations are tracked against Free Tier limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: FREE_TIER_LIMITS.LAMBDA_INVOCATIONS * 2 }),
        async (invocations) => {
          const metricPublisher = new MetricPublisher({ maxCustomMetrics: 100 });
          const tracker = new FreeTierUsageTracker({ metricPublisher });
          
          const usage = await tracker.trackLambdaInvocations(invocations);
          
          // Property 1: Service should be Lambda
          expect(usage.service).toBe('Lambda');
          expect(usage.metric).toBe('Invocations');
          
          // Property 2: Limit should match Free Tier limit
          expect(usage.limit).toBe(FREE_TIER_LIMITS.LAMBDA_INVOCATIONS);
          
          // Property 3: Current usage should match input
          expect(usage.currentUsage).toBe(invocations);
          
          // Property 4: Usage percentage should be correct
          const expectedPercentage = (invocations / FREE_TIER_LIMITS.LAMBDA_INVOCATIONS) * 100;
          expect(usage.usagePercentage).toBeCloseTo(expectedPercentage, 2);
          
          // Property 5: Period should be monthly
          expect(usage.period).toBe('monthly');
          
          // Property 6: Last updated should be recent
          const now = new Date();
          const timeDiff = now.getTime() - usage.lastUpdated.getTime();
          expect(timeDiff).toBeLessThan(5000); // Within 5 seconds
          
          // Property 7: Metric should be published to CloudWatch
          await metricPublisher.flush('VocalShield/FreeTier');
          expect(mockSend).toHaveBeenCalled();
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 17 (variant): Test Lambda compute time tracking
   */
  test('Property 17: Lambda compute time is tracked against Free Tier limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: FREE_TIER_LIMITS.LAMBDA_COMPUTE_TIME * 2 }),
        async (gbSeconds) => {
          const metricPublisher = new MetricPublisher({ maxCustomMetrics: 100 });
          const tracker = new FreeTierUsageTracker({ metricPublisher });
          
          const usage = await tracker.trackLambdaComputeTime(gbSeconds);
          
          // Property 1: Service and metric should be correct
          expect(usage.service).toBe('Lambda');
          expect(usage.metric).toBe('ComputeTime');
          
          // Property 2: Limit should match Free Tier limit
          expect(usage.limit).toBe(FREE_TIER_LIMITS.LAMBDA_COMPUTE_TIME);
          
          // Property 3: Current usage should match input
          expect(usage.currentUsage).toBe(gbSeconds);
          
          // Property 4: Usage percentage should be correct
          const expectedPercentage = (gbSeconds / FREE_TIER_LIMITS.LAMBDA_COMPUTE_TIME) * 100;
          expect(usage.usagePercentage).toBeCloseTo(expectedPercentage, 2);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 17 (variant): Test DynamoDB storage tracking
   */
  test('Property 17: DynamoDB storage is tracked against Free Tier limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0, max: FREE_TIER_LIMITS.DYNAMODB_STORAGE * 2, noNaN: true }),
        async (storageGB) => {
          const metricPublisher = new MetricPublisher({ maxCustomMetrics: 100 });
          const tracker = new FreeTierUsageTracker({ metricPublisher });
          
          const usage = await tracker.trackDynamoDBStorage(storageGB);
          
          // Property 1: Service and metric should be correct
          expect(usage.service).toBe('DynamoDB');
          expect(usage.metric).toBe('Storage');
          
          // Property 2: Limit should match Free Tier limit
          expect(usage.limit).toBe(FREE_TIER_LIMITS.DYNAMODB_STORAGE);
          
          // Property 3: Current usage should match input
          expect(usage.currentUsage).toBe(storageGB);
          
          // Property 4: Usage percentage should be correct
          const expectedPercentage = (storageGB / FREE_TIER_LIMITS.DYNAMODB_STORAGE) * 100;
          expect(usage.usagePercentage).toBeCloseTo(expectedPercentage, 2);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 17 (variant): Test DynamoDB capacity tracking
   */
  test('Property 17: DynamoDB read/write capacity is tracked against Free Tier limits', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          rcu: fc.double({ min: 0, max: FREE_TIER_LIMITS.DYNAMODB_RCU * 2, noNaN: true }),
          wcu: fc.double({ min: 0, max: FREE_TIER_LIMITS.DYNAMODB_WCU * 2, noNaN: true }),
        }),
        async (capacity) => {
          const metricPublisher = new MetricPublisher({ maxCustomMetrics: 100 });
          const tracker = new FreeTierUsageTracker({ metricPublisher });
          
          // Test read capacity
          const readUsage = await tracker.trackDynamoDBReadCapacity(capacity.rcu);
          expect(readUsage.service).toBe('DynamoDB');
          expect(readUsage.metric).toBe('ReadCapacity');
          expect(readUsage.limit).toBe(FREE_TIER_LIMITS.DYNAMODB_RCU);
          expect(readUsage.currentUsage).toBe(capacity.rcu);
          
          // Test write capacity
          const writeUsage = await tracker.trackDynamoDBWriteCapacity(capacity.wcu);
          expect(writeUsage.service).toBe('DynamoDB');
          expect(writeUsage.metric).toBe('WriteCapacity');
          expect(writeUsage.limit).toBe(FREE_TIER_LIMITS.DYNAMODB_WCU);
          expect(writeUsage.currentUsage).toBe(capacity.wcu);
          
          // Property: Both should have correct percentages
          const expectedRCUPercentage = (capacity.rcu / FREE_TIER_LIMITS.DYNAMODB_RCU) * 100;
          const expectedWCUPercentage = (capacity.wcu / FREE_TIER_LIMITS.DYNAMODB_WCU) * 100;
          expect(readUsage.usagePercentage).toBeCloseTo(expectedRCUPercentage, 2);
          expect(writeUsage.usagePercentage).toBeCloseTo(expectedWCUPercentage, 2);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 17 (variant): Test CloudWatch Logs tracking
   */
  test('Property 17: CloudWatch Logs ingestion is tracked against Free Tier limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0, max: FREE_TIER_LIMITS.CLOUDWATCH_LOGS * 2, noNaN: true }),
        async (ingestionGB) => {
          const metricPublisher = new MetricPublisher({ maxCustomMetrics: 100 });
          const tracker = new FreeTierUsageTracker({ metricPublisher });
          
          const usage = await tracker.trackCloudWatchLogs(ingestionGB);
          
          // Property 1: Service and metric should be correct
          expect(usage.service).toBe('CloudWatch');
          expect(usage.metric).toBe('LogsIngestion');
          
          // Property 2: Limit should match Free Tier limit
          expect(usage.limit).toBe(FREE_TIER_LIMITS.CLOUDWATCH_LOGS);
          
          // Property 3: Current usage should match input
          expect(usage.currentUsage).toBe(ingestionGB);
          
          // Property 4: Usage percentage should be correct
          const expectedPercentage = (ingestionGB / FREE_TIER_LIMITS.CLOUDWATCH_LOGS) * 100;
          expect(usage.usagePercentage).toBeCloseTo(expectedPercentage, 2);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 17 (variant): Test CloudWatch custom metrics tracking
   */
  test('Property 17: CloudWatch custom metrics count is tracked against Free Tier limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: FREE_TIER_LIMITS.CLOUDWATCH_METRICS * 2 }),
        async (metricCount) => {
          const metricPublisher = new MetricPublisher({ maxCustomMetrics: 100 });
          const tracker = new FreeTierUsageTracker({ metricPublisher });
          
          const usage = await tracker.trackCloudWatchMetrics(metricCount);
          
          // Property 1: Service and metric should be correct
          expect(usage.service).toBe('CloudWatch');
          expect(usage.metric).toBe('CustomMetrics');
          
          // Property 2: Limit should match Free Tier limit
          expect(usage.limit).toBe(FREE_TIER_LIMITS.CLOUDWATCH_METRICS);
          
          // Property 3: Current usage should match input
          expect(usage.currentUsage).toBe(metricCount);
          
          // Property 4: Usage percentage should be correct
          const expectedPercentage = (metricCount / FREE_TIER_LIMITS.CLOUDWATCH_METRICS) * 100;
          expect(usage.usagePercentage).toBeCloseTo(expectedPercentage, 2);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 17 (variant): Test API Gateway request tracking
   */
  test('Property 17: API Gateway requests are tracked against Free Tier limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: FREE_TIER_LIMITS.API_GATEWAY_REQUESTS * 2 }),
        async (requests) => {
          const metricPublisher = new MetricPublisher({ maxCustomMetrics: 100 });
          const tracker = new FreeTierUsageTracker({ metricPublisher });
          
          const usage = await tracker.trackAPIGatewayRequests(requests);
          
          // Property 1: Service and metric should be correct
          expect(usage.service).toBe('APIGateway');
          expect(usage.metric).toBe('Requests');
          
          // Property 2: Limit should match Free Tier limit
          expect(usage.limit).toBe(FREE_TIER_LIMITS.API_GATEWAY_REQUESTS);
          
          // Property 3: Current usage should match input
          expect(usage.currentUsage).toBe(requests);
          
          // Property 4: Usage percentage should be correct
          const expectedPercentage = (requests / FREE_TIER_LIMITS.API_GATEWAY_REQUESTS) * 100;
          expect(usage.usagePercentage).toBeCloseTo(expectedPercentage, 2);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 17 (edge case): Test zero usage
   */
  test('Property 17: Zero usage results in 0% usage percentage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('Lambda', 'DynamoDB', 'CloudWatch', 'APIGateway'),
        fc.integer({ min: 1, max: 1_000_000 }),
        async (service, limit) => {
          const tracker = new FreeTierUsageTracker();
          
          const percentage = tracker.calculateUsagePercentage(service, 0, limit);
          
          // Property: Zero usage should always result in 0%
          expect(percentage).toBe(0);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 17 (edge case): Test usage at exactly the limit
   */
  test('Property 17: Usage at limit results in 100% usage percentage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('Lambda', 'DynamoDB', 'CloudWatch', 'APIGateway'),
        fc.integer({ min: 1, max: 1_000_000 }),
        async (service, limit) => {
          const tracker = new FreeTierUsageTracker();
          
          const percentage = tracker.calculateUsagePercentage(service, limit, limit);
          
          // Property: Usage at limit should result in exactly 100%
          expect(percentage).toBeCloseTo(100, 2);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 17 (edge case): Test usage exceeding the limit
   */
  test('Property 17: Usage exceeding limit results in >100% usage percentage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          service: fc.constantFrom('Lambda', 'DynamoDB', 'CloudWatch', 'APIGateway'),
          limit: fc.integer({ min: 1000, max: 1_000_000 }),
          excessFactor: fc.double({ min: 1.01, max: 2.0, noNaN: true }),
        }),
        async (config) => {
          const tracker = new FreeTierUsageTracker();
          
          const usage = Math.floor(config.limit * config.excessFactor);
          const percentage = tracker.calculateUsagePercentage(config.service, usage, config.limit);
          
          // Property: Usage exceeding limit should result in >100%
          expect(percentage).toBeGreaterThan(100);
          
          // Property: Percentage should be proportional to excess
          const expectedPercentage = (usage / config.limit) * 100;
          expect(percentage).toBeCloseTo(expectedPercentage, 2);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 17 (edge case): Test invalid limit handling
   */
  test('Property 17: Invalid limit (zero or negative) returns 0% usage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          service: fc.constantFrom('Lambda', 'DynamoDB', 'CloudWatch', 'APIGateway'),
          usage: fc.integer({ min: 0, max: 1_000_000 }),
          invalidLimit: fc.integer({ min: -1000, max: 0 }),
        }),
        async (config) => {
          const tracker = new FreeTierUsageTracker();
          
          const percentage = tracker.calculateUsagePercentage(
            config.service,
            config.usage,
            config.invalidLimit
          );
          
          // Property: Invalid limit should result in 0% (safe fallback)
          expect(percentage).toBe(0);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 17 (integration): Test all services can be tracked simultaneously
   */
  test('Property 17: All AWS services can be tracked simultaneously', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          lambdaInvocations: fc.integer({ min: 0, max: FREE_TIER_LIMITS.LAMBDA_INVOCATIONS }),
          lambdaComputeTime: fc.integer({ min: 0, max: FREE_TIER_LIMITS.LAMBDA_COMPUTE_TIME }),
          dynamoDBStorage: fc.double({ min: 0, max: FREE_TIER_LIMITS.DYNAMODB_STORAGE, noNaN: true }),
          cloudWatchLogs: fc.double({ min: 0, max: FREE_TIER_LIMITS.CLOUDWATCH_LOGS, noNaN: true }),
          cloudWatchMetrics: fc.integer({ min: 0, max: FREE_TIER_LIMITS.CLOUDWATCH_METRICS }),
          apiGatewayRequests: fc.integer({ min: 0, max: FREE_TIER_LIMITS.API_GATEWAY_REQUESTS }),
        }),
        async (usage) => {
          const metricPublisher = new MetricPublisher({ maxCustomMetrics: 100 });
          const tracker = new FreeTierUsageTracker({ metricPublisher });
          
          // Track all services
          const lambdaInvocationsUsage = await tracker.trackLambdaInvocations(usage.lambdaInvocations);
          const lambdaComputeTimeUsage = await tracker.trackLambdaComputeTime(usage.lambdaComputeTime);
          const dynamoDBStorageUsage = await tracker.trackDynamoDBStorage(usage.dynamoDBStorage);
          const cloudWatchLogsUsage = await tracker.trackCloudWatchLogs(usage.cloudWatchLogs);
          const cloudWatchMetricsUsage = await tracker.trackCloudWatchMetrics(usage.cloudWatchMetrics);
          const apiGatewayRequestsUsage = await tracker.trackAPIGatewayRequests(usage.apiGatewayRequests);
          
          // Property: All services should be tracked correctly
          expect(lambdaInvocationsUsage.service).toBe('Lambda');
          expect(lambdaComputeTimeUsage.service).toBe('Lambda');
          expect(dynamoDBStorageUsage.service).toBe('DynamoDB');
          expect(cloudWatchLogsUsage.service).toBe('CloudWatch');
          expect(cloudWatchMetricsUsage.service).toBe('CloudWatch');
          expect(apiGatewayRequestsUsage.service).toBe('APIGateway');
          
          // Property: All usage percentages should be within valid range (0-100% for within limits)
          if (usage.lambdaInvocations <= FREE_TIER_LIMITS.LAMBDA_INVOCATIONS) {
            expect(lambdaInvocationsUsage.usagePercentage).toBeLessThanOrEqual(100);
          }
          if (usage.lambdaComputeTime <= FREE_TIER_LIMITS.LAMBDA_COMPUTE_TIME) {
            expect(lambdaComputeTimeUsage.usagePercentage).toBeLessThanOrEqual(100);
          }
          if (usage.dynamoDBStorage <= FREE_TIER_LIMITS.DYNAMODB_STORAGE) {
            expect(dynamoDBStorageUsage.usagePercentage).toBeLessThanOrEqual(100);
          }
          if (usage.cloudWatchLogs <= FREE_TIER_LIMITS.CLOUDWATCH_LOGS) {
            expect(cloudWatchLogsUsage.usagePercentage).toBeLessThanOrEqual(100);
          }
          if (usage.cloudWatchMetrics <= FREE_TIER_LIMITS.CLOUDWATCH_METRICS) {
            expect(cloudWatchMetricsUsage.usagePercentage).toBeLessThanOrEqual(100);
          }
          if (usage.apiGatewayRequests <= FREE_TIER_LIMITS.API_GATEWAY_REQUESTS) {
            expect(apiGatewayRequestsUsage.usagePercentage).toBeLessThanOrEqual(100);
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});
