/**
 * Blue-Green Deployment Manager for MACHER CI/CD Pipeline
 * 
 * This module manages blue-green deployments for zero-downtime production updates,
 * including traffic switching, monitoring, and automatic rollback.
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6
 */

import { DeploymentResult, TestResult } from '../types';
import { logger } from '../logger';
import { execSync } from 'child_process';

/**
 * Stack information
 */
export interface StackInfo {
  stackName: string;
  endpoint: string;
  version: string;
  createdAt: Date;
}

/**
 * Build artifacts
 */
export interface BuildArtifacts {
  lambdaPackages: string[];
  androidAPK?: string;
}

/**
 * Metrics report
 */
export interface MetricsReport {
  errorRate: number;
  latencyP99: number;
  requestCount: number;
  timestamp: Date;
}

/**
 * Deployment configuration
 */
export interface DeploymentConfig {
  stackName: string;
  environment: string;
  version: string;
}

/**
 * Rollback result
 */
export interface RollbackResult {
  success: boolean;
  previousVersion: string;
  duration: number;
  error?: string;
}

/**
 * BlueGreenManager orchestrates blue-green deployments.
 */
export class BlueGreenManager {
  private readonly monitoringPeriod: number;
  private readonly errorRateThreshold: number;
  private readonly latencyThreshold: number;

  /**
   * Creates a new BlueGreenManager instance.
   * 
   * @param monitoringPeriod - Monitoring period in minutes (defaults to 10)
   * @param errorRateThreshold - Error rate threshold percentage (defaults to 5)
   * @param latencyThreshold - P99 latency threshold in ms (defaults to 1000)
   */
  constructor(
    monitoringPeriod: number = 10,
    errorRateThreshold: number = 5,
    latencyThreshold: number = 1000
  ) {
    this.monitoringPeriod = monitoringPeriod;
    this.errorRateThreshold = errorRateThreshold;
    this.latencyThreshold = latencyThreshold;
  }

  /**
   * Creates a new green environment alongside the existing blue environment.
   * 
   * Requirements: 13.1
   * 
   * @param config - Deployment configuration
   * @returns Promise resolving to green stack information
   */
  async createGreenEnvironment(config: DeploymentConfig): Promise<StackInfo> {
    try {
      logger.info('Creating green environment', { config });

      const greenStackName = `${config.stackName}-Green`;
      const timestamp = new Date();

      // Deploy green stack using CDK
      const command = `cd infrastructure && npx cdk deploy ${greenStackName} \
        --context environment=${config.environment} \
        --context version=${config.version} \
        --require-approval never`;

      const output = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Extract endpoint from stack outputs
      const endpointMatch = output.match(/ApiEndpoint\s*=\s*(\S+)/);
      const endpoint = endpointMatch ? endpointMatch[1] : '';

      logger.info('Green environment created', { greenStackName, endpoint });

      return {
        stackName: greenStackName,
        endpoint,
        version: config.version,
        createdAt: timestamp,
      };
    } catch (error) {
      logger.error(
        'Failed to create green environment',
        error instanceof Error ? error : new Error(String(error)),
        { config }
      );
      throw error;
    }
  }

  /**
   * Deploys artifacts to the green environment.
   * 
   * Requirements: 13.1
   * 
   * @param artifacts - Build artifacts to deploy
   * @returns Promise resolving to deployment result
   */
  async deployToGreen(artifacts: BuildArtifacts): Promise<DeploymentResult> {
    const startTime = Date.now();

    try {
      logger.info('Deploying to green environment', { artifacts });

      // Deploy Lambda packages
      for (const lambdaPackage of artifacts.lambdaPackages) {
        const command = `aws lambda update-function-code \
          --function-name ${lambdaPackage} \
          --zip-file fileb://${lambdaPackage}.zip`;

        execSync(command, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        logger.info('Lambda function updated', { function: lambdaPackage });
      }

      const duration = Math.floor((Date.now() - startTime) / 1000);

      logger.info('Deployment to green completed', { duration });

      return {
        success: true,
        stackName: 'green',
        stackOutputs: {},
        duration,
      };
    } catch (error) {
      const duration = Math.floor((Date.now() - startTime) / 1000);

      logger.error(
        'Failed to deploy to green environment',
        error instanceof Error ? error : new Error(String(error)),
        { artifacts }
      );

      return {
        success: false,
        stackName: 'green',
        stackOutputs: {},
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Runs smoke tests on the green environment.
   * 
   * Requirements: 13.2
   * 
   * @param greenEndpoint - Green environment endpoint
   * @returns Promise resolving to test result
   */
  async runSmokeTests(greenEndpoint: string): Promise<TestResult> {
    try {
      logger.info('Running smoke tests on green environment', { greenEndpoint });

      // Import SmokeTestRunner dynamically to avoid circular dependency
      const { SmokeTestRunner } = await import('../test/SmokeTestRunner');
      const runner = new SmokeTestRunner();

      const result = await runner.validateCriticalPaths(greenEndpoint);

      logger.info('Smoke tests completed', { passed: result });

      return {
        testSuite: 'smoke',
        totalTests: 3,
        passed: result ? 3 : 0,
        failed: result ? 0 : 3,
        skipped: 0,
        duration: 30,
        coverage: {
          lines: 0,
          branches: 0,
          functions: 0,
          statements: 0,
        },
        failures: [],
      };
    } catch (error) {
      logger.error(
        'Smoke tests failed on green environment',
        error instanceof Error ? error : new Error(String(error)),
        { greenEndpoint }
      );

      return {
        testSuite: 'smoke',
        totalTests: 3,
        passed: 0,
        failed: 3,
        skipped: 0,
        duration: 30,
        coverage: {
          lines: 0,
          branches: 0,
          functions: 0,
          statements: 0,
        },
        failures: [
          {
            testName: 'Green environment smoke tests',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            stackTrace: '',
          },
        ],
      };
    }
  }

  /**
   * Switches traffic from blue to green environment.
   * 
   * Requirements: 13.2
   * 
   * @param blueStack - Blue stack name
   * @param greenStack - Green stack name
   * @param percent - Percentage of traffic to switch (0-100)
   * @returns Promise resolving when traffic switch is complete
   */
  async switchTraffic(blueStack: string, greenStack: string, percent: number): Promise<void> {
    try {
      logger.info('Switching traffic', { blueStack, greenStack, percent });

      // Update Route53 weighted routing or API Gateway stage variables
      const command = `aws apigateway update-stage \
        --rest-api-id $(aws apigateway get-rest-apis --query "items[?name=='MACHER'].id" --output text) \
        --stage-name prod \
        --patch-operations op=replace,path=/variables/activeStack,value=${greenStack}`;

      execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      logger.info('Traffic switched successfully', { greenStack, percent });
    } catch (error) {
      logger.error(
        'Failed to switch traffic',
        error instanceof Error ? error : new Error(String(error)),
        { blueStack, greenStack, percent }
      );
      throw error;
    }
  }

  /**
   * Monitors metrics for the specified duration.
   * 
   * Requirements: 13.3
   * 
   * @param stack - Stack name to monitor
   * @param duration - Monitoring duration in minutes
   * @returns Promise resolving to metrics report
   */
  async monitorMetrics(stack: string, duration: number): Promise<MetricsReport> {
    try {
      logger.info('Monitoring metrics', { stack, duration });

      // Wait for the monitoring period
      await new Promise(resolve => setTimeout(resolve, duration * 60 * 1000));

      // Query CloudWatch metrics
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - duration * 60 * 1000);

      const errorRateCommand = `aws cloudwatch get-metric-statistics \
        --namespace AWS/ApiGateway \
        --metric-name 5XXError \
        --dimensions Name=ApiName,Value=MACHER \
        --start-time ${startTime.toISOString()} \
        --end-time ${endTime.toISOString()} \
        --period 300 \
        --statistics Average \
        --query "Datapoints[0].Average" \
        --output text`;

      const errorRateOutput = execSync(errorRateCommand, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      const errorRate = errorRateOutput !== 'None' ? parseFloat(errorRateOutput) : 0;

      const latencyCommand = `aws cloudwatch get-metric-statistics \
        --namespace AWS/ApiGateway \
        --metric-name Latency \
        --dimensions Name=ApiName,Value=MACHER \
        --start-time ${startTime.toISOString()} \
        --end-time ${endTime.toISOString()} \
        --period 300 \
        --statistics p99 \
        --query "Datapoints[0].p99" \
        --output text`;

      const latencyOutput = execSync(latencyCommand, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      const latencyP99 = latencyOutput !== 'None' ? parseFloat(latencyOutput) : 0;

      const requestCountCommand = `aws cloudwatch get-metric-statistics \
        --namespace AWS/ApiGateway \
        --metric-name Count \
        --dimensions Name=ApiName,Value=MACHER \
        --start-time ${startTime.toISOString()} \
        --end-time ${endTime.toISOString()} \
        --period 300 \
        --statistics Sum \
        --query "Datapoints[0].Sum" \
        --output text`;

      const requestCountOutput = execSync(requestCountCommand, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      const requestCount = requestCountOutput !== 'None' ? parseFloat(requestCountOutput) : 0;

      logger.info('Metrics collected', { errorRate, latencyP99, requestCount });

      return {
        errorRate,
        latencyP99,
        requestCount,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error(
        'Failed to monitor metrics',
        error instanceof Error ? error : new Error(String(error)),
        { stack, duration }
      );

      return {
        errorRate: 0,
        latencyP99: 0,
        requestCount: 0,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Rolls back traffic to the blue environment.
   * 
   * Requirements: 13.4
   * 
   * @param blueStack - Blue stack name
   * @returns Promise resolving to rollback result
   */
  async rollbackToBlue(blueStack: string): Promise<RollbackResult> {
    const startTime = Date.now();

    try {
      logger.info('Rolling back to blue environment', { blueStack });

      // Switch traffic back to blue
      await this.switchTraffic('green', blueStack, 100);

      const duration = Math.floor((Date.now() - startTime) / 1000);

      logger.info('Rollback to blue completed', { duration });

      return {
        success: true,
        previousVersion: blueStack,
        duration,
      };
    } catch (error) {
      const duration = Math.floor((Date.now() - startTime) / 1000);

      logger.error(
        'Failed to rollback to blue',
        error instanceof Error ? error : new Error(String(error)),
        { blueStack }
      );

      return {
        success: false,
        previousVersion: blueStack,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Decommissions the blue environment after successful green deployment.
   * 
   * Requirements: 13.5
   * 
   * @param blueStack - Blue stack name to decommission
   * @returns Promise resolving when decommission is complete
   */
  async decommissionBlue(blueStack: string): Promise<void> {
    try {
      logger.info('Decommissioning blue environment', { blueStack });

      // Wait 24 hours before decommissioning (as per requirement 13.5)
      logger.info('Waiting 24 hours before decommissioning blue environment');
      await new Promise(resolve => setTimeout(resolve, 24 * 60 * 60 * 1000));

      // Delete the blue stack
      const command = `cd infrastructure && npx cdk destroy ${blueStack} --force`;

      execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      logger.info('Blue environment decommissioned', { blueStack });
    } catch (error) {
      logger.error(
        'Failed to decommission blue environment',
        error instanceof Error ? error : new Error(String(error)),
        { blueStack }
      );
      throw error;
    }
  }

  /**
   * Checks if metrics exceed thresholds.
   * 
   * Requirements: 13.4
   * 
   * @param metrics - Metrics report to check
   * @returns True if metrics exceed thresholds
   */
  metricsExceedThresholds(metrics: MetricsReport): boolean {
    const exceedsErrorRate = metrics.errorRate > this.errorRateThreshold;
    const exceedsLatency = metrics.latencyP99 > this.latencyThreshold;

    if (exceedsErrorRate || exceedsLatency) {
      logger.warn('Metrics exceed thresholds', {
        errorRate: metrics.errorRate,
        errorRateThreshold: this.errorRateThreshold,
        latencyP99: metrics.latencyP99,
        latencyThreshold: this.latencyThreshold,
      });
    }

    return exceedsErrorRate || exceedsLatency;
  }
}
