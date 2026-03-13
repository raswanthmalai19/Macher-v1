/**
 * Test Executor for MACHER CI/CD Pipeline
 * 
 * This module handles execution of unit tests, property-based tests,
 * integration tests, and smoke tests with coverage reporting.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 15.1, 15.2, 15.3, 15.4
 */

import { TestResult, CoverageReport } from '../types';
import { logger } from '../logger';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * TestExecutor runs various types of tests and generates coverage reports.
 */
export class TestExecutor {
  private readonly projectRoot: string;
  private readonly coverageThreshold: number;

  /**
   * Creates a new TestExecutor instance.
   * 
   * @param projectRoot - Root directory of the project (defaults to current directory)
   * @param coverageThreshold - Minimum coverage percentage required (defaults to 70)
   */
  constructor(projectRoot: string = '.', coverageThreshold: number = 70) {
    this.projectRoot = projectRoot;
    this.coverageThreshold = coverageThreshold;
  }

  /**
   * Executes unit tests using Jest.
   * 
   * Requirements: 3.1
   * 
   * @param testPath - Path to test files or directory (optional)
   * @returns Promise resolving to test result
   */
  async runUnitTests(testPath?: string): Promise<TestResult> {
    const startTime = Date.now();

    try {
      logger.info('Starting unit tests', { testPath });

      const pathArg = testPath ? testPath : 'tests/unit tests/pipeline/unit';
      const command = `cd ${this.projectRoot} && npm test -- ${pathArg} --testPathIgnorePatterns=property --json --coverage`;

      const output = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const result = this.parseJestOutput(output, 'unit');
      const duration = Math.floor((Date.now() - startTime) / 1000);
      result.duration = duration;

      logger.info('Unit tests completed', {
        passed: result.passed,
        failed: result.failed,
        duration,
      });

      return result;
    } catch (error) {
      const duration = Math.floor((Date.now() - startTime) / 1000);

      logger.error(
        'Unit tests failed',
        error instanceof Error ? error : new Error(String(error)),
        { testPath }
      );

      // Parse error output if available
      if (error instanceof Error && 'stdout' in error) {
        const output = (error as any).stdout;
        const result = this.parseJestOutput(output, 'unit');
        result.duration = duration;
        return result;
      }

      return {
        testSuite: 'unit',
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration,
        coverage: {
          lines: 0,
          branches: 0,
          functions: 0,
          statements: 0,
        },
        failures: [],
      };
    }
  }

  /**
   * Executes property-based tests using fast-check.
   * 
   * Requirements: 3.2
   * 
   * @param testPath - Path to property test files or directory (optional)
   * @param iterations - Number of iterations per property (defaults to 100)
   * @returns Promise resolving to test result
   */
  async runPropertyTests(testPath?: string, iterations: number = 100): Promise<TestResult> {
    const startTime = Date.now();

    try {
      logger.info('Starting property tests', { testPath, iterations });

      const pathArg = testPath ? testPath : 'tests/property tests/pipeline/property tests/properties';
      const command = `cd ${this.projectRoot} && FAST_CHECK_NUM_RUNS=${iterations} npm test -- ${pathArg} --testMatch="**/*.property.test.ts" --json`;

      const output = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const result = this.parseJestOutput(output, 'property');
      const duration = Math.floor((Date.now() - startTime) / 1000);
      result.duration = duration;

      logger.info('Property tests completed', {
        passed: result.passed,
        failed: result.failed,
        duration,
      });

      return result;
    } catch (error) {
      const duration = Math.floor((Date.now() - startTime) / 1000);

      logger.error(
        'Property tests failed',
        error instanceof Error ? error : new Error(String(error)),
        { testPath, iterations }
      );

      // Parse error output if available
      if (error instanceof Error && 'stdout' in error) {
        const output = (error as any).stdout;
        const result = this.parseJestOutput(output, 'property');
        result.duration = duration;
        return result;
      }

      return {
        testSuite: 'property',
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration,
        coverage: {
          lines: 0,
          branches: 0,
          functions: 0,
          statements: 0,
        },
        failures: [],
      };
    }
  }

  /**
   * Executes integration tests with LocalStack.
   * 
   * Requirements: 3.3
   * 
   * @param environment - Environment to test against (defaults to 'test')
   * @returns Promise resolving to test result
   */
  async runIntegrationTests(environment: string = 'test'): Promise<TestResult> {
    const startTime = Date.now();

    try {
      logger.info('Starting integration tests', { environment });

      const command = `cd ${this.projectRoot} && TEST_ENV=${environment} npm test -- tests/integration --json`;

      const output = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const result = this.parseJestOutput(output, 'integration');
      const duration = Math.floor((Date.now() - startTime) / 1000);
      result.duration = duration;

      logger.info('Integration tests completed', {
        passed: result.passed,
        failed: result.failed,
        duration,
      });

      return result;
    } catch (error) {
      const duration = Math.floor((Date.now() - startTime) / 1000);

      logger.error(
        'Integration tests failed',
        error instanceof Error ? error : new Error(String(error)),
        { environment }
      );

      // Parse error output if available
      if (error instanceof Error && 'stdout' in error) {
        const output = (error as any).stdout;
        const result = this.parseJestOutput(output, 'integration');
        result.duration = duration;
        return result;
      }

      return {
        testSuite: 'integration',
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration,
        coverage: {
          lines: 0,
          branches: 0,
          functions: 0,
          statements: 0,
        },
        failures: [],
      };
    }
  }

  /**
   * Executes smoke tests against a deployed environment.
   * 
   * Requirements: 15.1, 15.2, 15.3, 15.4
   * 
   * @param endpoint - API endpoint to test
   * @returns Promise resolving to test result
   */
  async runSmokeTests(endpoint: string): Promise<TestResult> {
    const startTime = Date.now();

    try {
      logger.info('Starting smoke tests', { endpoint });

      const command = `cd ${this.projectRoot} && SMOKE_TEST_ENDPOINT=${endpoint} npm test -- tests/smoke --json --testTimeout=300000`;

      const output = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const result = this.parseJestOutput(output, 'smoke');
      const duration = Math.floor((Date.now() - startTime) / 1000);
      result.duration = duration;

      logger.info('Smoke tests completed', {
        passed: result.passed,
        failed: result.failed,
        duration,
      });

      return result;
    } catch (error) {
      const duration = Math.floor((Date.now() - startTime) / 1000);

      logger.error(
        'Smoke tests failed',
        error instanceof Error ? error : new Error(String(error)),
        { endpoint }
      );

      // Parse error output if available
      if (error instanceof Error && 'stdout' in error) {
        const output = (error as any).stdout;
        const result = this.parseJestOutput(output, 'smoke');
        result.duration = duration;
        return result;
      }

      return {
        testSuite: 'smoke',
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration,
        coverage: {
          lines: 0,
          branches: 0,
          functions: 0,
          statements: 0,
        },
        failures: [],
      };
    }
  }

  /**
   * Generates a coverage report from test results.
   * 
   * Requirements: 3.5
   * 
   * @param results - Array of test results
   * @returns Coverage report
   */
  generateCoverageReport(results: TestResult[]): CoverageReport {
    logger.info('Generating coverage report', { resultCount: results.length });

    // Aggregate coverage from all test results
    let totalLines = 0;
    let totalBranches = 0;
    let totalFunctions = 0;
    let totalStatements = 0;
    let count = 0;

    for (const result of results) {
      if (result.coverage) {
        totalLines += result.coverage.lines;
        totalBranches += result.coverage.branches;
        totalFunctions += result.coverage.functions;
        totalStatements += result.coverage.statements;
        count++;
      }
    }

    const coverage = count > 0
      ? {
          lines: totalLines / count,
          branches: totalBranches / count,
          functions: totalFunctions / count,
          statements: totalStatements / count,
        }
      : {
          lines: 0,
          branches: 0,
          functions: 0,
          statements: 0,
        };

    const meetsThreshold = coverage.lines >= this.coverageThreshold;

    const report: CoverageReport = {
      coverage,
      threshold: this.coverageThreshold,
      meetsThreshold,
      timestamp: new Date(),
    };

    logger.info('Coverage report generated', {
      lines: coverage.lines.toFixed(2),
      threshold: this.coverageThreshold,
      meetsThreshold,
    });

    return report;
  }

  /**
   * Parses Jest JSON output into TestResult.
   * 
   * @param output - Raw Jest JSON output
   * @param testSuite - Name of the test suite
   * @returns Parsed test result
   */
  private parseJestOutput(output: string, testSuite: string): TestResult {
    try {
      const data = JSON.parse(output);

      const totalTests = data.numTotalTests || 0;
      const passed = data.numPassedTests || 0;
      const failed = data.numFailedTests || 0;
      const skipped = data.numPendingTests || 0;

      const failures = [];
      if (data.testResults) {
        for (const testFile of data.testResults) {
          if (testFile.assertionResults) {
            for (const assertion of testFile.assertionResults) {
              if (assertion.status === 'failed') {
                failures.push({
                  testName: assertion.fullName || assertion.title,
                  errorMessage: assertion.failureMessages?.join('\n') || 'Unknown error',
                  stackTrace: assertion.failureMessages?.join('\n') || '',
                });
              }
            }
          }
        }
      }

      // Extract coverage if available
      let coverage = {
        lines: 0,
        branches: 0,
        functions: 0,
        statements: 0,
      };

      if (data.coverageMap) {
        const coverageData = data.coverageMap;
        const files = Object.keys(coverageData);
        
        if (files.length > 0) {
          let totalLines = 0;
          let totalBranches = 0;
          let totalFunctions = 0;
          let totalStatements = 0;

          for (const file of files) {
            const fileCoverage = coverageData[file];
            if (fileCoverage.lines) {
              totalLines += fileCoverage.lines.pct || 0;
            }
            if (fileCoverage.branches) {
              totalBranches += fileCoverage.branches.pct || 0;
            }
            if (fileCoverage.functions) {
              totalFunctions += fileCoverage.functions.pct || 0;
            }
            if (fileCoverage.statements) {
              totalStatements += fileCoverage.statements.pct || 0;
            }
          }

          coverage = {
            lines: totalLines / files.length,
            branches: totalBranches / files.length,
            functions: totalFunctions / files.length,
            statements: totalStatements / files.length,
          };
        }
      }

      return {
        testSuite,
        totalTests,
        passed,
        failed,
        skipped,
        duration: 0, // Will be set by caller
        coverage,
        failures,
      };
    } catch (error) {
      logger.error(
        'Failed to parse Jest output',
        error instanceof Error ? error : new Error(String(error)),
        { testSuite }
      );

      return {
        testSuite,
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        coverage: {
          lines: 0,
          branches: 0,
          functions: 0,
          statements: 0,
        },
        failures: [],
      };
    }
  }
}
