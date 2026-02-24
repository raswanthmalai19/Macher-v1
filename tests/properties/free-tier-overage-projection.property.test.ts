import * as fc from 'fast-check';
import { FreeTierUsageTracker, FREE_TIER_LIMITS } from '../../lib/monitoring/free-tier-usage-tracker';
import { FreeTierUsage } from '../../lib/monitoring/types';

/**
 * Property-Based Tests for Free Tier Overage Projection
 * 
 * These tests validate:
 * - Property 31: Free Tier Overage Projection
 * 
 * Feature: monitoring-and-observability
 * Validates: Requirement 18.5
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

// Mock CloudWatch client
jest.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatchClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  PutMetricDataCommand: jest.fn(),
  GetMetricStatisticsCommand: jest.fn(),
}));

describe('Free Tier Overage Projection Properties', () => {
  /**
   * Property 31: Free Tier Overage Projection
   * 
   * Universal Property: For any AWS service, when current usage trends
   * project that Free Tier limits will be exceeded within 7 days,
   * a compliance alarm should trigger.
   * 
   * Validates: Requirement 18.5
   */
  test('Property 31: Usage projection correctly calculates end-of-month usage', () => {
    fc.assert(
      fc.property(
        fc.record({
          service: fc.constantFrom('Lambda', 'DynamoDB', 'CloudWatch', 'APIGateway'),
          metric: fc.constantFrom('Invocations', 'Storage', 'Requests'),
          currentUsage: fc.integer({ min: 1, max: 500_000 }),
          limit: fc.integer({ min: 100_000, max: 1_000_000 }),
          currentDayOfMonth: fc.integer({ min: 1, max: 30 }),
        }),
        (config) => {
          const tracker = new FreeTierUsageTracker();
          
          // Create usage data
          const usage: FreeTierUsage = {
            service: config.service,
            metric: config.metric,
            currentUsage: config.currentUsage,
            limit: config.limit,
            usagePercentage: (config.currentUsage / config.limit) * 100,
            period: 'monthly',
            lastUpdated: new Date(),
          };
          
          // Project usage
          const projected = tracker.projectUsage(usage, config.currentDayOfMonth);
          
          // Property 1: Projected usage should be defined
          expect(projected.projectedUsage).toBeDefined();
          
          // Property 2: Projected usage should be based on daily rate
          const dailyRate = config.currentUsage / config.currentDayOfMonth;
          const expectedProjection = dailyRate * 30; // 30-day month
          expect(projected.projectedUsage).toBeCloseTo(expectedProjection, 0);
          
          // Property 3: If projected usage exceeds limit, daysUntilOverage should be defined
          if (projected.projectedUsage! > config.limit) {
            expect(projected.daysUntilOverage).toBeDefined();
            
            // Property 4: Days until overage should be non-negative
            expect(projected.daysUntilOverage).toBeGreaterThanOrEqual(0);
            
            // Property 5: Days until overage should be calculated correctly
            const remainingCapacity = config.limit - config.currentUsage;
            if (remainingCapacity > 0 && dailyRate > 0) {
              const expectedDays = Math.floor(remainingCapacity / dailyRate);
              expect(projected.daysUntilOverage).toBe(expectedDays);
            }
          }
          
          // Property 6: If projected usage is within limit, daysUntilOverage should be undefined
          if (projected.projectedUsage! <= config.limit) {
            expect(projected.daysUntilOverage).toBeUndefined();
          }
          
          // Property 7: Original usage data should be preserved
          expect(projected.service).toBe(config.service);
          expect(projected.metric).toBe(config.metric);
          expect(projected.currentUsage).toBe(config.currentUsage);
          expect(projected.limit).toBe(config.limit);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 31 (variant): Test projection with early month usage
   */
  test('Property 31: Early month usage projects higher end-of-month usage', () => {
    fc.assert(
      fc.property(
        fc.record({
          currentUsage: fc.integer({ min: 10_000, max: 100_000 }),
          limit: fc.integer({ min: 100_000, max: 1_000_000 }),
          earlyDay: fc.integer({ min: 1, max: 5 }), // Early in month
        }),
        (config) => {
          const tracker = new FreeTierUsageTracker();
          
          const usage: FreeTierUsage = {
            service: 'Lambda',
            metric: 'Invocations',
            currentUsage: config.currentUsage,
            limit: config.limit,
            usagePercentage: (config.currentUsage / config.limit) * 100,
            period: 'monthly',
            lastUpdated: new Date(),
          };
          
          const projected = tracker.projectUsage(usage, config.earlyDay);
          
          // Property: Early month usage should project to much higher end-of-month usage
          // (because daily rate is calculated from few days)
          const dailyRate = config.currentUsage / config.earlyDay;
          const expectedProjection = dailyRate * 30;
          
          expect(projected.projectedUsage).toBeCloseTo(expectedProjection, 0);
          
          // Property: Projection should be significantly higher than current usage
          expect(projected.projectedUsage!).toBeGreaterThan(config.currentUsage);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 31 (variant): Test projection with late month usage
   */
  test('Property 31: Late month usage projects closer to current usage', () => {
    fc.assert(
      fc.property(
        fc.record({
          currentUsage: fc.integer({ min: 10_000, max: 100_000 }),
          limit: fc.integer({ min: 100_000, max: 1_000_000 }),
          lateDay: fc.integer({ min: 25, max: 30 }), // Late in month
        }),
        (config) => {
          const tracker = new FreeTierUsageTracker();
          
          const usage: FreeTierUsage = {
            service: 'Lambda',
            metric: 'Invocations',
            currentUsage: config.currentUsage,
            limit: config.limit,
            usagePercentage: (config.currentUsage / config.limit) * 100,
            period: 'monthly',
            lastUpdated: new Date(),
          };
          
          const projected = tracker.projectUsage(usage, config.lateDay);
          
          // Property: Late month projection should be close to current usage
          const dailyRate = config.currentUsage / config.lateDay;
          const expectedProjection = dailyRate * 30;
          
          expect(projected.projectedUsage).toBeCloseTo(expectedProjection, 0);
          
          // Property: Projection should be close to current usage (within 20%)
          const difference = Math.abs(projected.projectedUsage! - config.currentUsage);
          const percentDifference = (difference / config.currentUsage) * 100;
          expect(percentDifference).toBeLessThanOrEqual(20.1); // Small tolerance for floating point
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 31 (variant): Test overage detection within 7 days
   */
  test('Property 31: Overage within 7 days is correctly detected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Setup usage that will exceed limit within 7 days
          currentDayOfMonth: fc.integer({ min: 1, max: 23 }),
          limit: fc.constant(100_000),
          // Usage that will cause overage in 1-7 days
          usagePercentage: fc.double({ min: 85, max: 99, noNaN: true }),
        }),
        async (config) => {
          const tracker = new FreeTierUsageTracker();
          
          // Calculate current usage based on percentage
          const currentUsage = Math.floor((config.usagePercentage / 100) * config.limit);
          
          const usage: FreeTierUsage = {
            service: 'Lambda',
            metric: 'Invocations',
            currentUsage,
            limit: config.limit,
            usagePercentage: config.usagePercentage,
            period: 'monthly',
            lastUpdated: new Date(),
          };
          
          // Project usage
          const projected = tracker.projectUsage(usage, config.currentDayOfMonth);
          
          // Check if overage is within 7 days
          const willExceed = await tracker.checkProjectedOverage(usage, config.currentDayOfMonth, 7);
          
          // Property: If daysUntilOverage is defined and <= 7, should return true
          if (projected.daysUntilOverage !== undefined && projected.daysUntilOverage <= 7) {
            expect(willExceed).toBe(true);
          }
          
          // Property: If daysUntilOverage is > 7 or undefined, should return false
          if (projected.daysUntilOverage === undefined || projected.daysUntilOverage > 7) {
            expect(willExceed).toBe(false);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 31 (variant): Test projection with zero usage
   */
  test('Property 31: Zero usage projects to zero end-of-month usage', () => {
    fc.assert(
      fc.property(
        fc.record({
          limit: fc.integer({ min: 100_000, max: 1_000_000 }),
          currentDayOfMonth: fc.integer({ min: 1, max: 30 }),
        }),
        (config) => {
          const tracker = new FreeTierUsageTracker();
          
          const usage: FreeTierUsage = {
            service: 'Lambda',
            metric: 'Invocations',
            currentUsage: 0,
            limit: config.limit,
            usagePercentage: 0,
            period: 'monthly',
            lastUpdated: new Date(),
          };
          
          const projected = tracker.projectUsage(usage, config.currentDayOfMonth);
          
          // Property: Zero usage should project to zero
          expect(projected.projectedUsage).toBe(0);
          
          // Property: No overage should be projected
          expect(projected.daysUntilOverage).toBeUndefined();
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 31 (variant): Test projection with usage already exceeding limit
   */
  test('Property 31: Usage already exceeding limit shows immediate overage', () => {
    fc.assert(
      fc.property(
        fc.record({
          limit: fc.integer({ min: 100_000, max: 1_000_000 }),
          excessFactor: fc.double({ min: 1.01, max: 1.5, noNaN: true }),
          currentDayOfMonth: fc.integer({ min: 1, max: 30 }),
        }),
        (config) => {
          const tracker = new FreeTierUsageTracker();
          
          const currentUsage = Math.floor(config.limit * config.excessFactor);
          
          const usage: FreeTierUsage = {
            service: 'Lambda',
            metric: 'Invocations',
            currentUsage,
            limit: config.limit,
            usagePercentage: (currentUsage / config.limit) * 100,
            period: 'monthly',
            lastUpdated: new Date(),
          };
          
          const projected = tracker.projectUsage(usage, config.currentDayOfMonth);
          
          // Property: Already exceeded limit should show daysUntilOverage = 0
          expect(projected.daysUntilOverage).toBe(0);
          
          // Property: Projected usage should be greater than or equal to current
          // (on day 30, it will be equal; before day 30, it will be greater)
          expect(projected.projectedUsage).toBeGreaterThanOrEqual(currentUsage);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 31 (variant): Test projection with usage at exactly the limit
   */
  test('Property 31: Usage at limit shows immediate overage if any growth', () => {
    fc.assert(
      fc.property(
        fc.record({
          limit: fc.integer({ min: 100_000, max: 1_000_000 }),
          currentDayOfMonth: fc.integer({ min: 1, max: 29 }), // Not last day
        }),
        (config) => {
          const tracker = new FreeTierUsageTracker();
          
          const usage: FreeTierUsage = {
            service: 'Lambda',
            metric: 'Invocations',
            currentUsage: config.limit,
            limit: config.limit,
            usagePercentage: 100,
            period: 'monthly',
            lastUpdated: new Date(),
          };
          
          const projected = tracker.projectUsage(usage, config.currentDayOfMonth);
          
          // Property: At limit with days remaining should show daysUntilOverage = 0
          expect(projected.daysUntilOverage).toBe(0);
          
          // Property: Projected usage should exceed limit
          expect(projected.projectedUsage).toBeGreaterThan(config.limit);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 31 (edge case): Test projection with invalid day of month
   */
  test('Property 31: Invalid day of month returns original usage without projection', () => {
    fc.assert(
      fc.property(
        fc.record({
          limit: fc.integer({ min: 100_000, max: 1_000_000 }),
          currentUsage: fc.integer({ min: 1000, max: 50_000 }),
          invalidDay: fc.oneof(
            fc.integer({ min: -10, max: 0 }),
            fc.integer({ min: 32, max: 100 })
          ),
        }),
        (config) => {
          const tracker = new FreeTierUsageTracker();
          
          const usage: FreeTierUsage = {
            service: 'Lambda',
            metric: 'Invocations',
            currentUsage: config.currentUsage,
            limit: config.limit,
            usagePercentage: (config.currentUsage / config.limit) * 100,
            period: 'monthly',
            lastUpdated: new Date(),
          };
          
          const projected = tracker.projectUsage(usage, config.invalidDay);
          
          // Property: Invalid day should return original usage
          expect(projected.currentUsage).toBe(config.currentUsage);
          expect(projected.limit).toBe(config.limit);
          
          // Property: No projection should be made
          expect(projected.projectedUsage).toBeUndefined();
          expect(projected.daysUntilOverage).toBeUndefined();
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 31 (integration): Test projection for all services
   */
  test('Property 31: Projection works correctly for all AWS services', () => {
    fc.assert(
      fc.property(
        fc.record({
          lambdaInvocations: fc.integer({ min: 50_000, max: 800_000 }),
          lambdaComputeTime: fc.integer({ min: 20_000, max: 350_000 }),
          dynamoDBStorage: fc.double({ min: 1, max: 20, noNaN: true }),
          cloudWatchLogs: fc.double({ min: 0.5, max: 4, noNaN: true }),
          cloudWatchMetrics: fc.integer({ min: 1, max: 9 }),
          apiGatewayRequests: fc.integer({ min: 50_000, max: 800_000 }),
          currentDayOfMonth: fc.integer({ min: 10, max: 20 }),
        }),
        (config) => {
          const tracker = new FreeTierUsageTracker();
          
          // Create usage data for all services
          const usages: FreeTierUsage[] = [
            {
              service: 'Lambda',
              metric: 'Invocations',
              currentUsage: config.lambdaInvocations,
              limit: FREE_TIER_LIMITS.LAMBDA_INVOCATIONS,
              usagePercentage: (config.lambdaInvocations / FREE_TIER_LIMITS.LAMBDA_INVOCATIONS) * 100,
              period: 'monthly',
              lastUpdated: new Date(),
            },
            {
              service: 'Lambda',
              metric: 'ComputeTime',
              currentUsage: config.lambdaComputeTime,
              limit: FREE_TIER_LIMITS.LAMBDA_COMPUTE_TIME,
              usagePercentage: (config.lambdaComputeTime / FREE_TIER_LIMITS.LAMBDA_COMPUTE_TIME) * 100,
              period: 'monthly',
              lastUpdated: new Date(),
            },
            {
              service: 'DynamoDB',
              metric: 'Storage',
              currentUsage: config.dynamoDBStorage,
              limit: FREE_TIER_LIMITS.DYNAMODB_STORAGE,
              usagePercentage: (config.dynamoDBStorage / FREE_TIER_LIMITS.DYNAMODB_STORAGE) * 100,
              period: 'monthly',
              lastUpdated: new Date(),
            },
            {
              service: 'CloudWatch',
              metric: 'LogsIngestion',
              currentUsage: config.cloudWatchLogs,
              limit: FREE_TIER_LIMITS.CLOUDWATCH_LOGS,
              usagePercentage: (config.cloudWatchLogs / FREE_TIER_LIMITS.CLOUDWATCH_LOGS) * 100,
              period: 'monthly',
              lastUpdated: new Date(),
            },
            {
              service: 'CloudWatch',
              metric: 'CustomMetrics',
              currentUsage: config.cloudWatchMetrics,
              limit: FREE_TIER_LIMITS.CLOUDWATCH_METRICS,
              usagePercentage: (config.cloudWatchMetrics / FREE_TIER_LIMITS.CLOUDWATCH_METRICS) * 100,
              period: 'monthly',
              lastUpdated: new Date(),
            },
            {
              service: 'APIGateway',
              metric: 'Requests',
              currentUsage: config.apiGatewayRequests,
              limit: FREE_TIER_LIMITS.API_GATEWAY_REQUESTS,
              usagePercentage: (config.apiGatewayRequests / FREE_TIER_LIMITS.API_GATEWAY_REQUESTS) * 100,
              period: 'monthly',
              lastUpdated: new Date(),
            },
          ];
          
          // Project usage for all services
          const projections = usages.map(usage => tracker.projectUsage(usage, config.currentDayOfMonth));
          
          // Property: All projections should have valid projected usage
          projections.forEach(projection => {
            expect(projection.projectedUsage).toBeDefined();
            expect(projection.projectedUsage).toBeGreaterThanOrEqual(0);
          });
          
          // Property: Projections should be proportional to current usage
          projections.forEach((projection, index) => {
            const dailyRate = usages[index].currentUsage / config.currentDayOfMonth;
            const expectedProjection = dailyRate * 30;
            expect(projection.projectedUsage).toBeCloseTo(expectedProjection, 0);
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 31 (mathematical): Test projection linearity
   */
  test('Property 31: Projection scales linearly with usage', () => {
    fc.assert(
      fc.property(
        fc.record({
          baseUsage: fc.integer({ min: 1000, max: 50_000 }),
          scaleFactor: fc.double({ min: 1.5, max: 3.0, noNaN: true }),
          limit: fc.integer({ min: 100_000, max: 1_000_000 }),
          currentDayOfMonth: fc.integer({ min: 5, max: 25 }),
        }),
        (config) => {
          const tracker = new FreeTierUsageTracker();
          
          // Create two usage scenarios with scaled usage
          const usage1: FreeTierUsage = {
            service: 'Lambda',
            metric: 'Invocations',
            currentUsage: config.baseUsage,
            limit: config.limit,
            usagePercentage: (config.baseUsage / config.limit) * 100,
            period: 'monthly',
            lastUpdated: new Date(),
          };
          
          const usage2: FreeTierUsage = {
            service: 'Lambda',
            metric: 'Invocations',
            currentUsage: Math.floor(config.baseUsage * config.scaleFactor),
            limit: config.limit,
            usagePercentage: (Math.floor(config.baseUsage * config.scaleFactor) / config.limit) * 100,
            period: 'monthly',
            lastUpdated: new Date(),
          };
          
          const projection1 = tracker.projectUsage(usage1, config.currentDayOfMonth);
          const projection2 = tracker.projectUsage(usage2, config.currentDayOfMonth);
          
          // Property: Projection should scale linearly with usage
          const projectionRatio = projection2.projectedUsage! / projection1.projectedUsage!;
          expect(projectionRatio).toBeCloseTo(config.scaleFactor, 1);
        }
      ),
      { numRuns: 20 }
    );
  });
});
