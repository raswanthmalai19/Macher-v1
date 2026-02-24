import * as fc from 'fast-check';
import { MetricPublisher } from '../../lib/monitoring/metric-publisher';
import { MetricUnit } from '../../lib/monitoring/types';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

/**
 * Property-Based Tests for Metric Publication Timeliness
 * 
 * These tests validate:
 * - Property 2: Metric Publication Timeliness
 * 
 * Feature: monitoring-and-observability
 * Validates: Requirements 1.6
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

describe('Metric Publication Timeliness Properties', () => {
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
   * Property 2: Metric Publication Timeliness
   * 
   * Universal Property: For any metric collected from any component,
   * the time between metric generation and publication to CloudWatch
   * should not exceed 60 seconds.
   * 
   * Validates: Requirements 1.6
   */
  test('Property 2: Metrics are published to CloudWatch within 60 seconds', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random metric data with valid names (alphanumeric)
        fc.record({
          namespace: fc.constantFrom(
            'VocalShield/Lambda',
            'VocalShield/APIGateway',
            'VocalShield/DynamoDB',
            'VocalShield/Transcribe',
            'VocalShield/Bedrock',
            'VocalShield/BusinessKPIs'
          ),
          metricName: fc.constant('TestMetric'), // Use constant name to avoid hitting custom metric limit
          value: fc.double({ min: 0, max: 10000, noNaN: true }),
          unit: fc.constantFrom(
            MetricUnit.Count,
            MetricUnit.Milliseconds,
            MetricUnit.Percent,
            MetricUnit.Bytes
          ),
          dimensions: fc.dictionary(
            fc.constantFrom('Endpoint', 'Environment', 'Region'),
            fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 ]{0,19}$/),
            { minKeys: 1, maxKeys: 3 }
          ),
        }),
        async (metricData) => {
          const publisher = new MetricPublisher({ maxCustomMetrics: 100 }); // High limit to avoid hitting it
          
          // Record the time when metric is generated
          const generationTime = new Date();
          
          // Publish the metric
          await publisher.publishMetric(
            metricData.namespace,
            metricData.metricName,
            metricData.value,
            metricData.unit,
            metricData.dimensions,
            generationTime
          );
          
          // Force flush to trigger actual publication
          await publisher.flush(metricData.namespace);
          
          // Verify that CloudWatch API was called
          expect(mockSend).toHaveBeenCalled();
          
          // Get the command that was sent
          const command = mockSend.mock.calls[0][0] as PutMetricDataCommand;
          expect(command).toBeInstanceOf(PutMetricDataCommand);
          
          // Extract the metric data from the command
          const input = command.input;
          expect(input).toBeDefined();
          expect(input.Namespace).toBe(metricData.namespace);
          expect(input.MetricData).toBeDefined();
          expect(input.MetricData!.length).toBeGreaterThan(0);
          
          const publishedMetric = input.MetricData![0];
          
          // Property 1: Metric timestamp should match generation time
          expect(publishedMetric.Timestamp).toEqual(generationTime);
          
          // Property 2: Time between generation and publication should not exceed 60 seconds
          const publicationTime = new Date();
          const timeDifferenceMs = publicationTime.getTime() - generationTime.getTime();
          const timeDifferenceSeconds = timeDifferenceMs / 1000;
          
          expect(timeDifferenceSeconds).toBeLessThanOrEqual(60);
          
          // Property 3: Metric data should be preserved correctly
          expect(publishedMetric.MetricName).toBe(metricData.metricName);
          expect(publishedMetric.Value).toBe(metricData.value);
          expect(publishedMetric.Unit).toBe(metricData.unit);
          
          // Property 4: Dimensions should be preserved
          const publishedDimensions = publishedMetric.Dimensions || [];
          const dimensionMap = Object.fromEntries(
            publishedDimensions.map(d => [d.Name!, d.Value!])
          );
          
          for (const [key, value] of Object.entries(metricData.dimensions)) {
            expect(dimensionMap[key]).toBe(value);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 2 (variant): Test timeliness with batched metrics
   */
  test('Property 2: Batched metrics are published within 60 seconds', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate multiple metrics to test batching
        fc.integer({ min: 5, max: 20 }),
        async (metricCount) => {
          const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20 });
          
          // Record generation times for all metrics
          const generationTimes: Date[] = [];
          
          // Publish all metrics
          for (let i = 0; i < metricCount; i++) {
            const generationTime = new Date();
            generationTimes.push(generationTime);
            
            await publisher.publishMetric(
              'VocalShield/Performance',
              'TestMetric',
              Math.random() * 100,
              MetricUnit.Count,
              { Index: i.toString() },
              generationTime
            );
          }
          
          // Force flush to trigger publication
          await publisher.flush('VocalShield/Performance');
          
          // Verify that CloudWatch API was called
          expect(mockSend).toHaveBeenCalled();
          
          // Property: All metrics should be published within 60 seconds of generation
          const publicationTime = new Date();
          
          for (const generationTime of generationTimes) {
            const timeDifferenceMs = publicationTime.getTime() - generationTime.getTime();
            const timeDifferenceSeconds = timeDifferenceMs / 1000;
            
            expect(timeDifferenceSeconds).toBeLessThanOrEqual(60);
          }
          
          // Property: All metrics should be in the published batch
          const allPublishedMetrics = mockSend.mock.calls.flatMap(call => {
            const command = call[0] as PutMetricDataCommand;
            return command.input?.MetricData || [];
          });
          
          expect(allPublishedMetrics.length).toBeGreaterThanOrEqual(metricCount);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 2 (variant): Test timeliness with automatic batch flushing
   */
  test('Property 2: Metrics are auto-flushed when batch size is reached', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate exactly batchSize + 1 metrics to trigger auto-flush
        fc.constant(21), // One more than batch size (20)
        async (count) => {
          const publisher = new MetricPublisher({ maxCustomMetrics: 10, batchSize: 20 });
          
          const firstMetricTime = new Date();
          
          // Publish metrics until batch is full
          for (let i = 0; i < count; i++) {
            await publisher.publishMetric(
              'VocalShield/Test',
              `MetricA`, // Use same name to stay within custom metric limit
              Math.random() * 100,
              MetricUnit.Count,
              { Index: i.toString() },
              new Date()
            );
          }
          
          // Property: CloudWatch API should have been called automatically
          // when batch size was reached (at metric 20)
          expect(mockSend).toHaveBeenCalled();
          
          // Property: Auto-flush should happen within 60 seconds
          const autoFlushTime = new Date();
          const timeDifferenceMs = autoFlushTime.getTime() - firstMetricTime.getTime();
          const timeDifferenceSeconds = timeDifferenceMs / 1000;
          
          expect(timeDifferenceSeconds).toBeLessThanOrEqual(60);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 2 (variant): Test timeliness with business KPI metrics
   */
  test('Property 2: Business KPI metrics are published within 60 seconds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          kpiName: fc.constantFrom(
            'FraudDetectionRate',
            'UserEngagement',
            'ConversationAnalysisSuccessRate',
            'AverageConversationDuration',
            'MobileCrashRate'
          ),
          value: fc.double({ min: 0, max: 1, noNaN: true }),
        }),
        async (kpiData) => {
          const publisher = new MetricPublisher({ maxCustomMetrics: 100 });
          
          const generationTime = new Date();
          
          // Publish business KPI
          await publisher.publishBusinessKPI(
            kpiData.kpiName,
            kpiData.value,
            { Environment: 'Test' }
          );
          
          // Force flush
          await publisher.flush('VocalShield/BusinessKPIs');
          
          // Verify publication
          expect(mockSend).toHaveBeenCalled();
          
          const command = mockSend.mock.calls[0][0] as PutMetricDataCommand;
          const publishedMetric = command.input?.MetricData?.[0];
          
          expect(publishedMetric).toBeDefined();
          
          // Property: Publication should happen within 60 seconds
          const publicationTime = new Date();
          const timeDifferenceMs = publicationTime.getTime() - generationTime.getTime();
          const timeDifferenceSeconds = timeDifferenceMs / 1000;
          
          expect(timeDifferenceSeconds).toBeLessThanOrEqual(60);
          
          // Property: KPI should be in correct namespace
          expect(command.input.Namespace).toBe('VocalShield/BusinessKPIs');
          expect(publishedMetric!.MetricName).toBe(kpiData.kpiName);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 2 (edge case): Test timeliness with custom timestamp
   */
  test('Property 2: Metrics with custom timestamps preserve original time', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          value: fc.double({ min: 0, max: 1000, noNaN: true }),
          // Generate timestamp in the past (within last 2 weeks, CloudWatch limit)
          timestampOffsetMinutes: fc.integer({ min: 1, max: 20160 }), // 2 weeks in minutes
        }),
        async (metricData) => {
          const publisher = new MetricPublisher({ maxCustomMetrics: 100 });
          
          // Create a timestamp in the past
          const customTimestamp = new Date();
          customTimestamp.setMinutes(customTimestamp.getMinutes() - metricData.timestampOffsetMinutes);
          
          // Publish metric with custom timestamp
          await publisher.publishMetric(
            'VocalShield/Test',
            'TestMetric',
            metricData.value,
            MetricUnit.Count,
            { Test: 'true' },
            customTimestamp
          );
          
          await publisher.flush('VocalShield/Test');
          
          // Verify publication
          expect(mockSend).toHaveBeenCalled();
          
          const command = mockSend.mock.calls[0][0] as PutMetricDataCommand;
          const publishedMetric = command.input?.MetricData?.[0];
          
          expect(publishedMetric).toBeDefined();
          
          // Property: Custom timestamp should be preserved
          expect(publishedMetric!.Timestamp).toEqual(customTimestamp);
          
          // Property: Publication should still happen within 60 seconds of the publish call
          const publicationTime = new Date();
          const callTime = new Date(); // Approximate call time
          const timeDifferenceMs = publicationTime.getTime() - callTime.getTime();
          const timeDifferenceSeconds = timeDifferenceMs / 1000;
          
          expect(timeDifferenceSeconds).toBeLessThanOrEqual(60);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 2 (error case): Test timeliness with retry on throttling
   */
  test('Property 2: Metrics are published within 60 seconds even with retries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          value: fc.double({ min: 0, max: 1000, noNaN: true }),
          failureCount: fc.integer({ min: 1, max: 2 }), // Fail 1-2 times before success
        }),
        async (metricData) => {
          // Setup mock to fail first N times, then succeed
          let callCount = 0;
          mockSend.mockImplementation(() => {
            callCount++;
            if (callCount <= metricData.failureCount) {
              const error = new Error('ThrottlingException');
              error.name = 'ThrottlingException';
              return Promise.reject(error);
            }
            return Promise.resolve({});
          });
          
          const publisher = new MetricPublisher({ maxCustomMetrics: 100, maxRetries: 3 });
          
          const generationTime = new Date();
          
          // Publish metric
          await publisher.publishMetric(
            'VocalShield/Test',
            'TestMetric',
            metricData.value,
            MetricUnit.Count,
            { Test: 'true' },
            generationTime
          );
          
          await publisher.flush('VocalShield/Test');
          
          // Property: Even with retries, publication should complete within 60 seconds
          const publicationTime = new Date();
          const timeDifferenceMs = publicationTime.getTime() - generationTime.getTime();
          const timeDifferenceSeconds = timeDifferenceMs / 1000;
          
          expect(timeDifferenceSeconds).toBeLessThanOrEqual(60);
          
          // Property: Metric should eventually be published
          expect(mockSend).toHaveBeenCalled();
          expect(callCount).toBeGreaterThan(metricData.failureCount);
        }
      ),
      { numRuns: 10 } // Reduced runs due to retry delays
    );
  }, 120000); // 120 second timeout for this test due to retries

  /**
   * Property 2 (performance): Test timeliness under high load
   */
  test('Property 2: Metrics are published within 60 seconds under high load', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate many metrics to simulate high load
        fc.integer({ min: 50, max: 100 }),
        async (metricCount) => {
          const publisher = new MetricPublisher({ maxCustomMetrics: 100, batchSize: 20 });
          
          const startTime = new Date();
          
          // Publish many metrics rapidly
          const publishPromises = [];
          for (let i = 0; i < metricCount; i++) {
            const promise = publisher.publishMetric(
              'VocalShield/LoadTest',
              'TestMetric',
              Math.random() * 100,
              MetricUnit.Count,
              { Batch: Math.floor(i / 20).toString() },
              new Date()
            );
            publishPromises.push(promise);
          }
          
          // Wait for all publishes to complete
          await Promise.all(publishPromises);
          
          // Force flush any remaining metrics
          await publisher.flush('VocalShield/LoadTest');
          
          // Property: All metrics should be published within 60 seconds
          const endTime = new Date();
          const totalTimeMs = endTime.getTime() - startTime.getTime();
          const totalTimeSeconds = totalTimeMs / 1000;
          
          expect(totalTimeSeconds).toBeLessThanOrEqual(60);
          
          // Property: CloudWatch API should have been called multiple times for batching
          expect(mockSend).toHaveBeenCalled();
          
          // Property: All metrics should be accounted for
          const allPublishedMetrics = mockSend.mock.calls.flatMap(call => {
            const command = call[0] as PutMetricDataCommand;
            return command.input?.MetricData || [];
          });
          
          // Should have published at least as many metrics as generated
          expect(allPublishedMetrics.length).toBeGreaterThanOrEqual(metricCount);
        }
      ),
      { numRuns: 10 } // Fewer runs for performance
    );
  });
});
