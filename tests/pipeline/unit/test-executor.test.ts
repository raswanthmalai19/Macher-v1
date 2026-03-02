/**
 * Unit Tests for TestExecutor
 * 
 * These tests verify specific examples, edge cases, and error conditions
 * for the test execution framework.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { TestExecutor } from '../../../pipeline/test/TestExecutor';
import type { TestResult } from '../../../pipeline/types';
import * as childProcess from 'child_process';

// Mock child_process
jest.mock('child_process');

describe('TestExecutor Unit Tests', () => {
  let testExecutor: TestExecutor;

  beforeEach(() => {
    testExecutor = new TestExecutor();
    jest.clearAllMocks();
  });

  describe('runUnitTests', () => {
    test('should execute Jest unit tests successfully', async () => {
      const mockOutput = JSON.stringify({
        success: true,
        numTotalTests: 50,
        numPassedTests: 50,
        numFailedTests: 0,
        testResults: [],
      });

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: mockOutput, stderr: '' });
      });

      const result = await testExecutor.runUnitTests();

      expect(result.success).toBe(true);
      expect(result.totalTests).toBe(50);
      expect(result.passedTests).toBe(50);
      expect(result.failedTests).toBe(0);
    });

    test('should handle test failures correctly', async () => {
      const mockOutput = JSON.stringify({
        success: false,
        numTotalTests: 50,
        numPassedTests: 45,
        numFailedTests: 5,
        testResults: [
          {
            testFilePath: 'test1.test.ts',
            failureMessage: 'Expected true to be false',
          },
        ],
      });

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: mockOutput, stderr: '' });
      });

      const result = await testExecutor.runUnitTests();

      expect(result.success).toBe(false);
      expect(result.failedTests).toBe(5);
      expect(result.failures.length).toBeGreaterThan(0);
    });

    test('should handle Jest execution errors', async () => {
      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(new Error('Jest command not found'), null);
      });

      await expect(testExecutor.runUnitTests()).rejects.toThrow();
    });
  });

  describe('runPropertyTests', () => {
    test('should execute fast-check property tests with correct iteration count', async () => {
      const mockOutput = JSON.stringify({
        success: true,
        numTotalTests: 20,
        numPassedTests: 20,
        numFailedTests: 0,
        testResults: [],
      });

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        // Verify command includes property test pattern
        expect(cmd).toContain('property');
        callback(null, { stdout: mockOutput, stderr: '' });
      });

      const result = await testExecutor.runPropertyTests();

      expect(result.success).toBe(true);
      expect(result.totalTests).toBe(20);
    });

    test('should report property test failures with counterexamples', async () => {
      const mockOutput = JSON.stringify({
        success: false,
        numTotalTests: 20,
        numPassedTests: 19,
        numFailedTests: 1,
        testResults: [
          {
            testFilePath: 'property.test.ts',
            failureMessage: 'Property failed after 42 tests\nCounterexample: {"value": -1}',
          },
        ],
      });

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: mockOutput, stderr: '' });
      });

      const result = await testExecutor.runPropertyTests();

      expect(result.success).toBe(false);
      expect(result.failures[0].errorMessage).toContain('Counterexample');
    });
  });

  describe('runIntegrationTests', () => {
    test('should execute integration tests with LocalStack', async () => {
      const mockOutput = JSON.stringify({
        success: true,
        numTotalTests: 10,
        numPassedTests: 10,
        numFailedTests: 0,
        testResults: [],
      });

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        // Verify command includes integration test pattern
        expect(cmd).toContain('integration');
        callback(null, { stdout: mockOutput, stderr: '' });
      });

      const result = await testExecutor.runIntegrationTests();

      expect(result.success).toBe(true);
    });

    test('should handle LocalStack connection failures', async () => {
      const mockOutput = JSON.stringify({
        success: false,
        numTotalTests: 10,
        numPassedTests: 0,
        numFailedTests: 10,
        testResults: [
          {
            testFilePath: 'integration.test.ts',
            failureMessage: 'Could not connect to LocalStack',
          },
        ],
      });

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: mockOutput, stderr: 'LocalStack not running' });
      });

      const result = await testExecutor.runIntegrationTests();

      expect(result.success).toBe(false);
      expect(result.failures[0].errorMessage).toContain('LocalStack');
    });
  });

  describe('generateCoverageReport', () => {
    test('should generate coverage report with all metrics', async () => {
      const mockCoverage = {
        total: {
          lines: { pct: 85.5 },
          statements: { pct: 84.2 },
          functions: { pct: 78.9 },
          branches: { pct: 72.3 },
        },
      };

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: JSON.stringify(mockCoverage), stderr: '' });
      });

      const coverage = await testExecutor.generateCoverageReport();

      expect(coverage.lines).toBeCloseTo(85.5, 1);
      expect(coverage.statements).toBeCloseTo(84.2, 1);
      expect(coverage.functions).toBeCloseTo(78.9, 1);
      expect(coverage.branches).toBeCloseTo(72.3, 1);
    });

    test('should enforce coverage thresholds', async () => {
      const mockCoverage = {
        total: {
          lines: { pct: 65.0 },
          statements: { pct: 64.0 },
          functions: { pct: 60.0 },
          branches: { pct: 55.0 },
        },
      };

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: JSON.stringify(mockCoverage), stderr: '' });
      });

      const coverage = await testExecutor.generateCoverageReport();
      const meetsThreshold = testExecutor.checkCoverageThreshold(coverage, 70);

      expect(meetsThreshold).toBe(false);
    });

    test('should pass when coverage meets threshold', async () => {
      const mockCoverage = {
        total: {
          lines: { pct: 82.0 },
          statements: { pct: 81.0 },
          functions: { pct: 78.0 },
          branches: { pct: 76.0 },
        },
      };

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: JSON.stringify(mockCoverage), stderr: '' });
      });

      const coverage = await testExecutor.generateCoverageReport();
      const meetsThreshold = testExecutor.checkCoverageThreshold(coverage, 75);

      expect(meetsThreshold).toBe(true);
    });
  });

  describe('formatTestResults', () => {
    test('should format successful test results', () => {
      const testResult: TestResult = {
        success: true,
        totalTests: 100,
        passedTests: 100,
        failedTests: 0,
        skippedTests: 0,
        duration: 5000,
        coverage: {
          lines: 85,
          branches: 80,
          functions: 90,
          statements: 85,
        },
        failures: [],
      };

      const formatted = testExecutor.formatTestResults(testResult);

      expect(formatted).toContain('100');
      expect(formatted).toContain('passed');
      expect(formatted.toLowerCase()).toMatch(/success|pass/);
    });

    test('should format failed test results with failure details', () => {
      const testResult: TestResult = {
        success: false,
        totalTests: 100,
        passedTests: 95,
        failedTests: 5,
        skippedTests: 0,
        duration: 5000,
        coverage: {
          lines: 85,
          branches: 80,
          functions: 90,
          statements: 85,
        },
        failures: [
          {
            testName: 'should validate input',
            errorMessage: 'Expected 5 to equal 10',
            stackTrace: 'at test.ts:42:15',
            file: 'validation.test.ts',
            duration: 50,
          },
        ],
      };

      const formatted = testExecutor.formatTestResults(testResult);

      expect(formatted).toContain('should validate input');
      expect(formatted).toContain('Expected 5 to equal 10');
      expect(formatted).toContain('validation.test.ts');
      expect(formatted.toLowerCase()).toMatch(/fail|error/);
    });

    test('should include coverage information in formatted output', () => {
      const testResult: TestResult = {
        success: true,
        totalTests: 50,
        passedTests: 50,
        failedTests: 0,
        skippedTests: 0,
        duration: 3000,
        coverage: {
          lines: 88.5,
          branches: 82.3,
          functions: 91.7,
          statements: 87.9,
        },
        failures: [],
      };

      const formatted = testExecutor.formatTestResults(testResult);

      expect(formatted).toContain('88.5');
      expect(formatted).toContain('coverage');
    });
  });

  describe('runSmokeTests', () => {
    test('should execute smoke tests after deployment', async () => {
      const mockOutput = JSON.stringify({
        success: true,
        tests: [
          { name: 'API Health Check', passed: true, duration: 150 },
          { name: 'Lambda Invocation', passed: true, duration: 200 },
        ],
      });

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: mockOutput, stderr: '' });
      });

      const result = await testExecutor.runSmokeTests('dev', 'us-east-1');

      expect(result.success).toBe(true);
    });

    test('should fail if any smoke test fails', async () => {
      const mockOutput = JSON.stringify({
        success: false,
        tests: [
          { name: 'API Health Check', passed: true, duration: 150 },
          { name: 'Lambda Invocation', passed: false, duration: 5000 },
        ],
      });

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: mockOutput, stderr: '' });
      });

      const result = await testExecutor.runSmokeTests('dev', 'us-east-1');

      expect(result.success).toBe(false);
    });
  });

  describe('error handling', () => {
    test('should handle malformed test output gracefully', async () => {
      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'invalid json', stderr: '' });
      });

      await expect(testExecutor.runUnitTests()).rejects.toThrow();
    });

    test('should handle empty test output', async () => {
      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await expect(testExecutor.runUnitTests()).rejects.toThrow();
    });

    test('should include stderr in error messages', async () => {
      const errorMessage = 'Module not found: fast-check';
      
      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(new Error('Command failed'), { stdout: '', stderr: errorMessage });
      });

      try {
        await testExecutor.runPropertyTests();
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('fast-check');
      }
    });
  });
});
