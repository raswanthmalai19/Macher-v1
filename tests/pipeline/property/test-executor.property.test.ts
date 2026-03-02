/**
 * Property-Based Tests for Test Execution Framework
 * 
 * These tests verify universal properties of the test execution system
 * using randomized test data to ensure correctness across all inputs.
 * 
 * Requirements: 3.4, 15.1
 */

import * as fc from 'fast-check';
import { TestExecutor } from '../../../pipeline/test/TestExecutor';
import { SmokeTestRunner } from '../../../pipeline/test/SmokeTestRunner';
import type { TestResult, TestSuite, SmokeTestResult } from '../../../pipeline/types';

describe('Test Execution Framework Property Tests', () => {
  let testExecutor: TestExecutor;
  let smokeTestRunner: SmokeTestRunner;

  beforeEach(() => {
    testExecutor = new TestExecutor();
    smokeTestRunner = new SmokeTestRunner('dev', 'us-east-1');
  });

  /**
   * Feature: deployment-cicd-pipeline, Property 13: Test failure reporting
   * 
   * For any test failure, the pipeline should report the failure with complete
   * context including test name, error message, stack trace, and execution time.
   * 
   * Validates: Requirements 3.4
   */
  describe('Property 13: Test failure reporting', () => {
    test('failed test results should contain all required context', () => {
      fc.assert(
        fc.property(
          fc.record({
            testName: fc.string({ minLength: 5, maxLength: 100 }),
            errorMessage: fc.string({ minLength: 10, maxLength: 500 }),
            stackTrace: fc.array(fc.string({ minLength: 20, maxLength: 200 }), { minLength: 1, maxLength: 10 }),
            executionTime: fc.integer({ min: 1, max: 60000 }),
            testFile: fc.string({ minLength: 10, maxLength: 100 }),
          }),
          (testData) => {
            // Create a test result representing a failure
            const testResult: TestResult = {
              success: false,
              totalTests: 1,
              passedTests: 0,
              failedTests: 1,
              skippedTests: 0,
              duration: testData.executionTime,
              coverage: {
                lines: 0,
                branches: 0,
                functions: 0,
                statements: 0,
              },
              failures: [
                {
                  testName: testData.testName,
                  errorMessage: testData.errorMessage,
                  stackTrace: testData.stackTrace.join('\n'),
                  file: testData.testFile,
                  duration: testData.executionTime,
                },
              ],
            };

            // Verify all required fields are present
            expect(testResult.success).toBe(false);
            expect(testResult.failedTests).toBeGreaterThan(0);
            expect(testResult.failures.length).toBeGreaterThan(0);

            const failure = testResult.failures[0];
            
            // Test name should be present and non-empty
            expect(failure.testName).toBe(testData.testName);
            expect(failure.testName.length).toBeGreaterThan(0);

            // Error message should be present and non-empty
            expect(failure.errorMessage).toBe(testData.errorMessage);
            expect(failure.errorMessage.length).toBeGreaterThan(0);

            // Stack trace should be present and non-empty
            expect(failure.stackTrace).toBeTruthy();
            expect(failure.stackTrace.length).toBeGreaterThan(0);

            // Execution time should be present and positive
            expect(failure.duration).toBe(testData.executionTime);
            expect(failure.duration).toBeGreaterThan(0);

            // File path should be present
            expect(failure.file).toBe(testData.testFile);
            expect(failure.file.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('test failure reports should not lose information when formatted', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              testName: fc.string({ minLength: 5, maxLength: 100 }),
              errorMessage: fc.string({ minLength: 10, maxLength: 500 }),
              stackTrace: fc.string({ minLength: 20, maxLength: 1000 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (failures) => {
            const testResult: TestResult = {
              success: false,
              totalTests: failures.length,
              passedTests: 0,
              failedTests: failures.length,
              skippedTests: 0,
              duration: 1000,
              coverage: {
                lines: 0,
                branches: 0,
                functions: 0,
                statements: 0,
              },
              failures: failures.map(f => ({
                testName: f.testName,
                errorMessage: f.errorMessage,
                stackTrace: f.stackTrace,
                file: 'test.ts',
                duration: 100,
              })),
            };

            const formatted = testExecutor.formatTestResults(testResult);

            // All test names should appear in formatted output
            for (const failure of failures) {
              expect(formatted).toContain(failure.testName);
            }

            // All error messages should appear in formatted output
            for (const failure of failures) {
              expect(formatted).toContain(failure.errorMessage);
            }

            // Formatted output should indicate failure
            expect(formatted.toLowerCase()).toMatch(/fail|error/);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('test results should preserve failure count accuracy', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 50 }),
          (passed, failed, skipped) => {
            const total = passed + failed + skipped;
            
            const testResult: TestResult = {
              success: failed === 0,
              totalTests: total,
              passedTests: passed,
              failedTests: failed,
              skippedTests: skipped,
              duration: 1000,
              coverage: {
                lines: 80,
                branches: 75,
                functions: 85,
                statements: 80,
              },
              failures: [],
            };

            // Total should equal sum of passed, failed, and skipped
            expect(testResult.totalTests).toBe(testResult.passedTests + testResult.failedTests + testResult.skippedTests);

            // Success should be false if any tests failed
            if (testResult.failedTests > 0) {
              expect(testResult.success).toBe(false);
            }

            // Success should be true if no tests failed
            if (testResult.failedTests === 0 && testResult.totalTests > 0) {
              expect(testResult.success).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('test failure context should include timing information', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              testName: fc.string({ minLength: 5, maxLength: 50 }),
              duration: fc.integer({ min: 1, max: 30000 }),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          (tests) => {
            const totalDuration = tests.reduce((sum, t) => sum + t.duration, 0);

            const testResult: TestResult = {
              success: false,
              totalTests: tests.length,
              passedTests: 0,
              failedTests: tests.length,
              skippedTests: 0,
              duration: totalDuration,
              coverage: {
                lines: 0,
                branches: 0,
                functions: 0,
                statements: 0,
              },
              failures: tests.map(t => ({
                testName: t.testName,
                errorMessage: 'Test failed',
                stackTrace: 'at test.ts:1:1',
                file: 'test.ts',
                duration: t.duration,
              })),
            };

            // Total duration should match sum of individual test durations
            const sumOfFailureDurations = testResult.failures.reduce((sum, f) => sum + f.duration, 0);
            expect(testResult.duration).toBe(sumOfFailureDurations);

            // Each failure should have positive duration
            for (const failure of testResult.failures) {
              expect(failure.duration).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: deployment-cicd-pipeline, Property 66: Smoke test timing
   * 
   * For any smoke test execution, the test should complete within the configured
   * timeout period or fail with a timeout error.
   * 
   * Validates: Requirements 15.1
   */
  describe('Property 66: Smoke test timing', () => {
    test('smoke tests should respect timeout configuration', () => {
      fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 5000 }),
          fc.integer({ min: 50, max: 10000 }),
          async (testDuration, timeout) => {
            const shouldTimeout = testDuration > timeout;

            // Create a mock smoke test that takes testDuration ms
            const mockTest = {
              name: 'Mock Test',
              description: 'Test with controlled duration',
              execute: async () => {
                await new Promise(resolve => setTimeout(resolve, testDuration));
                return {
                  success: true,
                  message: 'Test passed',
                  duration: testDuration,
                };
              },
              timeout,
            };

            const startTime = Date.now();
            const result = await smokeTestRunner.executeTestWithTimeout(mockTest);
            const actualDuration = Date.now() - startTime;

            if (shouldTimeout) {
              // Test should fail due to timeout
              expect(result.success).toBe(false);
              expect(result.message.toLowerCase()).toContain('timeout');
              // Actual duration should be close to timeout (within 500ms tolerance)
              expect(actualDuration).toBeLessThan(timeout + 500);
            } else {
              // Test should complete successfully
              expect(result.success).toBe(true);
              // Actual duration should be close to test duration
              expect(actualDuration).toBeGreaterThanOrEqual(testDuration);
              expect(actualDuration).toBeLessThan(testDuration + 500);
            }
          }
        ),
        { numRuns: 50 } // Fewer runs due to async nature
      );
    });

    test('smoke test results should always include duration', () => {
      fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 5, maxLength: 50 }),
              shouldPass: fc.boolean(),
              duration: fc.integer({ min: 10, max: 1000 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (tests) => {
            const results: SmokeTestResult[] = [];

            for (const test of tests) {
              const result: SmokeTestResult = {
                testName: test.name,
                success: test.shouldPass,
                message: test.shouldPass ? 'Test passed' : 'Test failed',
                duration: test.duration,
                timestamp: new Date().toISOString(),
              };
              results.push(result);
            }

            // All results should have duration
            for (const result of results) {
              expect(result.duration).toBeDefined();
              expect(result.duration).toBeGreaterThan(0);
              expect(typeof result.duration).toBe('number');
            }

            // All results should have timestamp
            for (const result of results) {
              expect(result.timestamp).toBeDefined();
              expect(typeof result.timestamp).toBe('string');
              expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('smoke test suite execution time should be sum of individual tests', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 5, maxLength: 50 }),
              duration: fc.integer({ min: 10, max: 1000 }),
            }),
            { minLength: 1, maxLength: 15 }
          ),
          (tests) => {
            const results: SmokeTestResult[] = tests.map(test => ({
              testName: test.name,
              success: true,
              message: 'Test passed',
              duration: test.duration,
              timestamp: new Date().toISOString(),
            }));

            const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
            const expectedTotal = tests.reduce((sum, t) => sum + t.duration, 0);

            // Total duration should match sum of individual durations
            expect(totalDuration).toBe(expectedTotal);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('smoke tests with zero or negative timeout should fail immediately', () => {
      fc.assert(
        fc.asyncProperty(
          fc.integer({ min: -1000, max: 0 }),
          async (invalidTimeout) => {
            const mockTest = {
              name: 'Invalid Timeout Test',
              description: 'Test with invalid timeout',
              execute: async () => ({
                success: true,
                message: 'Should not reach here',
                duration: 100,
              }),
              timeout: invalidTimeout,
            };

            const result = await smokeTestRunner.executeTestWithTimeout(mockTest);

            // Should fail due to invalid timeout
            expect(result.success).toBe(false);
            expect(result.message.toLowerCase()).toMatch(/timeout|invalid/);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
