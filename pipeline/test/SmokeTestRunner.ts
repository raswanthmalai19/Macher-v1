/**
 * Smoke Test Runner for VocalShield CI/CD Pipeline
 * 
 * This module executes post-deployment smoke tests to verify
 * critical functionality of API Gateway, Lambda, and DynamoDB.
 * 
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6
 */

import { TestResult, TestFailure } from '../types';
import { logger } from '../logger';
import axios, { AxiosError } from 'axios';

/**
 * Smoke test definition
 */
export interface SmokeTest {
  name: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  expectedStatus: number;
  timeout: number;
  retries: number;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/**
 * SmokeTestRunner executes smoke tests against deployed environments.
 */
export class SmokeTestRunner {
  private readonly maxDuration: number;

  /**
   * Creates a new SmokeTestRunner instance.
   * 
   * @param maxDuration - Maximum duration for all smoke tests in seconds (defaults to 300)
   */
  constructor(maxDuration: number = 300) {
    this.maxDuration = maxDuration;
  }

  /**
   * Executes a single smoke test with retries.
   * 
   * Requirements: 15.2, 15.3, 15.4
   * 
   * @param test - Smoke test to execute
   * @returns Promise resolving to test result (true if passed, false if failed)
   */
  async executeTest(test: SmokeTest): Promise<{ passed: boolean; error?: string }> {
    logger.info('Executing smoke test', { name: test.name, endpoint: test.endpoint });

    let lastError: string | undefined;

    for (let attempt = 1; attempt <= test.retries; attempt++) {
      try {
        const response = await axios({
          method: test.method,
          url: test.endpoint,
          data: test.body,
          headers: test.headers,
          timeout: test.timeout,
          validateStatus: () => true, // Don't throw on any status
        });

        if (response.status === test.expectedStatus) {
          logger.info('Smoke test passed', {
            name: test.name,
            attempt,
            status: response.status,
          });
          return { passed: true };
        } else {
          lastError = `Expected status ${test.expectedStatus}, got ${response.status}`;
          logger.warn('Smoke test failed, retrying', {
            name: test.name,
            attempt,
            expectedStatus: test.expectedStatus,
            actualStatus: response.status,
          });
        }
      } catch (error) {
        const axiosError = error as AxiosError;
        lastError = axiosError.message || 'Unknown error';
        
        logger.warn('Smoke test error, retrying', {
          name: test.name,
          attempt,
          error: lastError,
        });
      }

      // Wait before retry (exponential backoff)
      if (attempt < test.retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    logger.error(
      'Smoke test failed after all retries',
      new Error(lastError || 'Unknown error'),
      { name: test.name, retries: test.retries }
    );

    return { passed: false, error: lastError };
  }

  /**
   * Executes a suite of smoke tests.
   * 
   * Requirements: 15.1, 15.6
   * 
   * @param tests - Array of smoke tests to execute
   * @returns Promise resolving to test results
   */
  async executeTestSuite(tests: SmokeTest[]): Promise<TestResult> {
    const startTime = Date.now();

    logger.info('Starting smoke test suite', { testCount: tests.length });

    const failures: TestFailure[] = [];
    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      // Check if we've exceeded max duration
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed >= this.maxDuration) {
        logger.warn('Smoke test suite exceeded max duration', {
          elapsed,
          maxDuration: this.maxDuration,
        });
        
        // Mark remaining tests as skipped
        const remaining = tests.length - (passed + failed);
        
        return {
          testSuite: 'smoke',
          totalTests: tests.length,
          passed,
          failed,
          skipped: remaining,
          duration: elapsed,
          coverage: {
            lines: 0,
            branches: 0,
            functions: 0,
            statements: 0,
          },
          failures,
        };
      }

      const result = await this.executeTest(test);

      if (result.passed) {
        passed++;
      } else {
        failed++;
        failures.push({
          testName: test.name,
          errorMessage: result.error || 'Test failed',
          stackTrace: `Endpoint: ${test.endpoint}\nMethod: ${test.method}\nExpected Status: ${test.expectedStatus}`,
        });
      }
    }

    const duration = Math.floor((Date.now() - startTime) / 1000);

    logger.info('Smoke test suite completed', {
      passed,
      failed,
      duration,
    });

    return {
      testSuite: 'smoke',
      totalTests: tests.length,
      passed,
      failed,
      skipped: 0,
      duration,
      coverage: {
        lines: 0,
        branches: 0,
        functions: 0,
        statements: 0,
      },
      failures,
    };
  }

  /**
   * Validates critical paths are functional.
   * 
   * Requirements: 15.2, 15.3, 15.4
   * 
   * @param endpoint - Base API endpoint
   * @returns Promise resolving to true if all critical paths pass
   */
  async validateCriticalPaths(endpoint: string): Promise<boolean> {
    logger.info('Validating critical paths', { endpoint });

    const criticalTests: SmokeTest[] = [
      // API Gateway health check
      {
        name: 'API Gateway Health Check',
        endpoint: `${endpoint}/health`,
        method: 'GET',
        expectedStatus: 200,
        timeout: 5000,
        retries: 3,
      },
      // Lambda function invocation
      {
        name: 'Lambda Function Invocation',
        endpoint: `${endpoint}/api/test`,
        method: 'GET',
        expectedStatus: 200,
        timeout: 10000,
        retries: 3,
      },
      // DynamoDB access
      {
        name: 'DynamoDB Read Access',
        endpoint: `${endpoint}/api/config`,
        method: 'GET',
        expectedStatus: 200,
        timeout: 5000,
        retries: 3,
      },
    ];

    const result = await this.executeTestSuite(criticalTests);

    return result.failed === 0;
  }

  /**
   * Creates a default smoke test suite for VocalShield.
   * 
   * @param baseEndpoint - Base API endpoint
   * @returns Array of smoke tests
   */
  static createDefaultSuite(baseEndpoint: string): SmokeTest[] {
    return [
      // Health check
      {
        name: 'Health Check',
        endpoint: `${baseEndpoint}/health`,
        method: 'GET',
        expectedStatus: 200,
        timeout: 5000,
        retries: 3,
      },
      // WebSocket connection
      {
        name: 'WebSocket Connection',
        endpoint: `${baseEndpoint}/ws`,
        method: 'GET',
        expectedStatus: 101,
        timeout: 10000,
        retries: 3,
      },
      // Transcription service
      {
        name: 'Transcription Service',
        endpoint: `${baseEndpoint}/api/transcribe/status`,
        method: 'GET',
        expectedStatus: 200,
        timeout: 5000,
        retries: 3,
      },
      // Fraud detection service
      {
        name: 'Fraud Detection Service',
        endpoint: `${baseEndpoint}/api/fraud/status`,
        method: 'GET',
        expectedStatus: 200,
        timeout: 5000,
        retries: 3,
      },
      // Configuration endpoint
      {
        name: 'Configuration Endpoint',
        endpoint: `${baseEndpoint}/api/config`,
        method: 'GET',
        expectedStatus: 200,
        timeout: 5000,
        retries: 3,
      },
    ];
  }
}
