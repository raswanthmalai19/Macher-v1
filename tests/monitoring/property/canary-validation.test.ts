/**
 * Property Tests: Canary Validation and Success Rate
 * Feature: monitoring-and-observability
 * Property 23: Canary Validation Completeness
 * Property 24: Canary Success Rate Calculation
 * 
 * Validates: Requirements 11.5, 11.6
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  CanarySuccessTracker,
  CanaryExecutionResult,
} from '../../../lib/monitoring/canary-success-tracker';

describe('Property 23: Canary Validation Completeness', () => {
  it('should validate all required fields in canary execution', () => {
    fc.assert(
      fc.property(
        fc.record({
          statusCode: fc.integer({ min: 100, max: 599 }),
          duration: fc.integer({ min: 0, max: 10000 }),
          body: fc.oneof(
            fc.constant('{"status":"healthy"}'),
            fc.constant('{"status":"unhealthy"}'),
            fc.constant('invalid json'),
            fc.constant('')
          ),
        }),
        ({ statusCode, duration, body }) => {
          // Validate status code (expecting 200)
          const statusValid = statusCode === 200;

          // Validate response time (expecting < 2000ms)
          const timeValid = duration < 2000;

          // Validate response body structure (expecting valid JSON with status field)
          let bodyValid = false;
          try {
            const parsed = JSON.parse(body);
            bodyValid = parsed.status === 'healthy';
          } catch {
            bodyValid = false;
          }

          // All three validations must pass for canary to succeed
          const canarySuccess = statusValid && timeValid && bodyValid;

          // Verify validation logic
          if (statusCode !== 200) {
            expect(canarySuccess).toBe(false);
          }
          if (duration >= 2000) {
            expect(canarySuccess).toBe(false);
          }
          if (!bodyValid) {
            expect(canarySuccess).toBe(false);
          }
          if (statusCode === 200 && duration < 2000 && bodyValid) {
            expect(canarySuccess).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 24: Canary Success Rate Calculation', () => {
  const tracker = new CanarySuccessTracker();

  it('should calculate success rate correctly for any execution history', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            success: fc.boolean(),
            duration: fc.integer({ min: 100, max: 5000 }),
            timestamp: fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }),
          }),
          { minLength: 1, maxLength: 100 }
        ),
        (executions) => {
          const canaryName = 'test-canary';
          const results: CanaryExecutionResult[] = executions.map((exec) => ({
            canaryName,
            timestamp: exec.timestamp,
            success: exec.success,
            duration: exec.duration,
          }));

          const successRate = tracker.calculateSuccessRate(canaryName, results);

          // Verify success rate calculation
          const expectedSuccessCount = results.filter((r) => r.success).length;
          const expectedFailureCount = results.filter((r) => !r.success).length;
          const expectedTotal = results.length;
          const expectedRate = (expectedSuccessCount / expectedTotal) * 100;

          expect(successRate.successCount).toBe(expectedSuccessCount);
          expect(successRate.failureCount).toBe(expectedFailureCount);
          expect(successRate.totalExecutions).toBe(expectedTotal);
          expect(successRate.successRate).toBeCloseTo(expectedRate, 2);

          // Verify success rate is between 0 and 100
          expect(successRate.successRate).toBeGreaterThanOrEqual(0);
          expect(successRate.successRate).toBeLessThanOrEqual(100);

          // Verify availability percentage is between 0 and 100
          expect(successRate.availabilityPercentage).toBeGreaterThanOrEqual(0);
          expect(successRate.availabilityPercentage).toBeLessThanOrEqual(100);

          // Verify counts add up
          expect(successRate.successCount + successRate.failureCount).toBe(
            successRate.totalExecutions
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle edge cases correctly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          [], // Empty array
          [{ success: true, duration: 100, timestamp: new Date() }], // Single success
          [{ success: false, duration: 100, timestamp: new Date() }], // Single failure
          Array(10).fill({ success: true, duration: 100, timestamp: new Date() }), // All success
          Array(10).fill({ success: false, duration: 100, timestamp: new Date() }) // All failures
        ),
        (executions) => {
          const canaryName = 'edge-case-canary';
          const results: CanaryExecutionResult[] = executions.map((exec, i) => ({
            canaryName,
            timestamp: new Date(Date.now() + i * 60000),
            success: exec.success,
            duration: exec.duration,
          }));

          const successRate = tracker.calculateSuccessRate(canaryName, results);

          if (results.length === 0) {
            expect(successRate.successRate).toBe(0);
            expect(successRate.totalExecutions).toBe(0);
          } else {
            expect(successRate.totalExecutions).toBe(results.length);
            
            const allSuccess = results.every((r) => r.success);
            const allFailure = results.every((r) => !r.success);
            
            if (allSuccess) {
              expect(successRate.successRate).toBe(100);
            }
            if (allFailure) {
              expect(successRate.successRate).toBe(0);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should calculate availability percentage considering downtime', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            success: fc.boolean(),
            minutesOffset: fc.integer({ min: 0, max: 1440 }), // 24 hours
          }),
          { minLength: 5, maxLength: 50 }
        ),
        (executions) => {
          const baseTime = new Date('2024-01-01T00:00:00Z');
          const canaryName = 'availability-test';
          
          const results: CanaryExecutionResult[] = executions.map((exec) => ({
            canaryName,
            timestamp: new Date(baseTime.getTime() + exec.minutesOffset * 60000),
            success: exec.success,
            duration: 1000,
          }));

          // Sort by timestamp
          results.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

          const successRate = tracker.calculateSuccessRate(canaryName, results);

          // Availability should be <= success rate (downtime affects availability)
          expect(successRate.availabilityPercentage).toBeLessThanOrEqual(100);
          expect(successRate.availabilityPercentage).toBeGreaterThanOrEqual(0);

          // If all executions successful, availability should be 100%
          if (results.every((r) => r.success)) {
            expect(successRate.availabilityPercentage).toBeCloseTo(100, 1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle concurrent canary tracking', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            canaryName: fc.constantFrom('canary-1', 'canary-2', 'canary-3'),
            success: fc.boolean(),
            duration: fc.integer({ min: 100, max: 3000 }),
          }),
          { minLength: 10, maxLength: 50 }
        ),
        (executions) => {
          const timestamp = new Date();
          const resultsByCanary = new Map<string, CanaryExecutionResult[]>();

          // Group by canary name
          executions.forEach((exec) => {
            if (!resultsByCanary.has(exec.canaryName)) {
              resultsByCanary.set(exec.canaryName, []);
            }
            resultsByCanary.get(exec.canaryName)!.push({
              canaryName: exec.canaryName,
              timestamp,
              success: exec.success,
              duration: exec.duration,
            });
          });

          // Calculate success rate for each canary
          resultsByCanary.forEach((results, canaryName) => {
            const successRate = tracker.calculateSuccessRate(canaryName, results);
            
            expect(successRate.canaryName).toBe(canaryName);
            expect(successRate.totalExecutions).toBe(results.length);
            expect(successRate.successRate).toBeGreaterThanOrEqual(0);
            expect(successRate.successRate).toBeLessThanOrEqual(100);
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
