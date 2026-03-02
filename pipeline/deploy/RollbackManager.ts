/**
 * Rollback Manager for VocalShield CI/CD Pipeline
 * 
 * This module manages deployment rollbacks, including snapshot creation,
 * history management, and restoration of previous versions.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import { DeploymentResult } from '../types';
import { logger } from '../logger';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Deployment history entry
 */
export interface DeploymentHistory {
  version: string;
  timestamp: Date;
  stackName: string;
  templateHash: string;
  lambdaVersions: Map<string, string>;
  configSnapshot: Record<string, unknown>;
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
 * RollbackManager handles deployment rollbacks and history management.
 */
export class RollbackManager {
  private readonly historyPath: string;
  private readonly maxHistorySize: number;

  /**
   * Creates a new RollbackManager instance.
   * 
   * @param historyPath - Path to store deployment history (defaults to '.deployment-history')
   * @param maxHistorySize - Maximum number of deployments to keep in history (defaults to 10)
   */
  constructor(historyPath: string = '.deployment-history', maxHistorySize: number = 10) {
    this.historyPath = historyPath;
    this.maxHistorySize = maxHistorySize;

    // Ensure history directory exists
    if (!fs.existsSync(this.historyPath)) {
      fs.mkdirSync(this.historyPath, { recursive: true });
    }
  }

  /**
   * Saves a deployment snapshot for rollback purposes.
   * 
   * Requirements: 6.4
   * 
   * @param deployment - Deployment result to snapshot
   * @returns Promise resolving when snapshot is saved
   */
  async saveDeploymentSnapshot(deployment: DeploymentResult): Promise<void> {
    try {
      logger.info('Saving deployment snapshot', {
        stackName: deployment.stackName,
      });

      // Get Lambda function versions
      const lambdaVersions = await this.getLambdaVersions(deployment.stackName);

      // Get CloudFormation template hash
      const templateHash = await this.getTemplateHash(deployment.stackName);

      // Create deployment history entry
      const historyEntry: DeploymentHistory = {
        version: deployment.stackOutputs.Version || new Date().toISOString(),
        timestamp: new Date(),
        stackName: deployment.stackName,
        templateHash,
        lambdaVersions,
        configSnapshot: deployment.stackOutputs,
      };

      // Load existing history
      const history = await this.getDeploymentHistory(deployment.stackName, this.maxHistorySize);

      // Add new entry at the beginning
      history.unshift(historyEntry);

      // Trim to max size
      const trimmedHistory = history.slice(0, this.maxHistorySize);

      // Save history
      const historyFile = path.join(
        this.historyPath,
        `${deployment.stackName}-history.json`
      );

      fs.writeFileSync(
        historyFile,
        JSON.stringify(
          trimmedHistory.map(entry => ({
            ...entry,
            lambdaVersions: Array.from(entry.lambdaVersions.entries()),
          })),
          null,
          2
        )
      );

      logger.info('Deployment snapshot saved', {
        stackName: deployment.stackName,
        version: historyEntry.version,
      });
    } catch (error) {
      logger.error(
        'Failed to save deployment snapshot',
        error instanceof Error ? error : new Error(String(error)),
        { stackName: deployment.stackName }
      );
      throw error;
    }
  }

  /**
   * Retrieves deployment history for an environment.
   * 
   * Requirements: 6.4, 6.5
   * 
   * @param environment - Environment name
   * @param limit - Maximum number of entries to return
   * @returns Promise resolving to deployment history
   */
  async getDeploymentHistory(environment: string, limit: number = 10): Promise<DeploymentHistory[]> {
    try {
      logger.info('Retrieving deployment history', { environment, limit });

      const historyFile = path.join(this.historyPath, `${environment}-history.json`);

      if (!fs.existsSync(historyFile)) {
        logger.info('No deployment history found', { environment });
        return [];
      }

      const data = fs.readFileSync(historyFile, 'utf-8');
      const rawHistory = JSON.parse(data);

      // Convert back to DeploymentHistory format
      const history: DeploymentHistory[] = rawHistory.map((entry: any) => ({
        ...entry,
        timestamp: new Date(entry.timestamp),
        lambdaVersions: new Map(entry.lambdaVersions),
      }));

      logger.info('Deployment history retrieved', {
        environment,
        count: history.length,
      });

      return history.slice(0, limit);
    } catch (error) {
      logger.error(
        'Failed to retrieve deployment history',
        error instanceof Error ? error : new Error(String(error)),
        { environment }
      );
      return [];
    }
  }

  /**
   * Rolls back to a specific version.
   * 
   * Requirements: 6.1, 6.2, 6.3, 6.5
   * 
   * @param environment - Environment name
   * @param version - Version to rollback to
   * @returns Promise resolving to rollback result
   */
  async rollbackToVersion(environment: string, version: string): Promise<RollbackResult> {
    const startTime = Date.now();

    try {
      logger.info('Starting rollback', { environment, version });

      // Get deployment history
      const history = await this.getDeploymentHistory(environment, this.maxHistorySize);

      // Find the target version
      const targetDeployment = history.find(entry => entry.version === version);

      if (!targetDeployment) {
        throw new Error(`Version ${version} not found in deployment history`);
      }

      // Rollback CloudFormation stack
      await this.rollbackCloudFormationStack(
        targetDeployment.stackName,
        targetDeployment.templateHash
      );

      // Rollback Lambda functions
      await this.rollbackLambdaFunctions(targetDeployment.lambdaVersions);

      const duration = Math.floor((Date.now() - startTime) / 1000);

      logger.info('Rollback completed', { environment, version, duration });

      return {
        success: true,
        previousVersion: version,
        duration,
      };
    } catch (error) {
      const duration = Math.floor((Date.now() - startTime) / 1000);

      logger.error(
        'Rollback failed',
        error instanceof Error ? error : new Error(String(error)),
        { environment, version }
      );

      return {
        success: false,
        previousVersion: version,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Rolls back Lambda functions to specific versions.
   * 
   * Requirements: 6.3
   * 
   * @param versions - Map of function names to version ARNs
   * @returns Promise resolving when rollback is complete
   */
  async rollbackLambdaFunctions(versions: Map<string, string>): Promise<void> {
    try {
      logger.info('Rolling back Lambda functions', {
        functionCount: versions.size,
      });

      for (const [functionName, versionArn] of Array.from(versions.entries())) {
        // Update function alias to point to previous version
        const command = `aws lambda update-alias \
          --function-name ${functionName} \
          --name prod \
          --function-version ${versionArn}`;

        execSync(command, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        logger.info('Lambda function rolled back', { functionName, versionArn });
      }

      logger.info('All Lambda functions rolled back');
    } catch (error) {
      logger.error(
        'Failed to rollback Lambda functions',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Rolls back a CloudFormation stack to a previous template.
   * 
   * Requirements: 6.2
   * 
   * @param stackName - Stack name
   * @param templateHash - Template hash to rollback to
   * @returns Promise resolving when rollback is complete
   */
  async rollbackCloudFormationStack(stackName: string, templateHash: string): Promise<void> {
    try {
      logger.info('Rolling back CloudFormation stack', { stackName, templateHash });

      // Initiate stack rollback
      const command = `aws cloudformation rollback-stack --stack-name ${stackName}`;

      execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Wait for rollback to complete
      const waitCommand = `aws cloudformation wait stack-rollback-complete --stack-name ${stackName}`;

      execSync(waitCommand, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      logger.info('CloudFormation stack rolled back', { stackName });
    } catch (error) {
      logger.error(
        'Failed to rollback CloudFormation stack',
        error instanceof Error ? error : new Error(String(error)),
        { stackName, templateHash }
      );
      throw error;
    }
  }

  /**
   * Validates that a rollback was successful.
   * 
   * Requirements: 6.6
   * 
   * @param environment - Environment name
   * @returns Promise resolving to true if rollback is valid
   */
  async validateRollback(environment: string): Promise<boolean> {
    try {
      logger.info('Validating rollback', { environment });

      // Import SmokeTestRunner dynamically to avoid circular dependency
      const { SmokeTestRunner } = await import('../test/SmokeTestRunner');
      const runner = new SmokeTestRunner();

      // Get stack endpoint
      const endpoint = await this.getStackEndpoint(environment);

      // Run smoke tests
      const result = await runner.validateCriticalPaths(endpoint);

      logger.info('Rollback validation complete', { environment, valid: result });

      return result;
    } catch (error) {
      logger.error(
        'Rollback validation failed',
        error instanceof Error ? error : new Error(String(error)),
        { environment }
      );
      return false;
    }
  }

  /**
   * Gets Lambda function versions for a stack.
   * 
   * @param stackName - Stack name
   * @returns Promise resolving to map of function names to version ARNs
   */
  private async getLambdaVersions(stackName: string): Promise<Map<string, string>> {
    try {
      const command = `aws cloudformation describe-stack-resources \
        --stack-name ${stackName} \
        --query "StackResources[?ResourceType=='AWS::Lambda::Function'].PhysicalResourceId" \
        --output json`;

      const output = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const functionNames = JSON.parse(output);
      const versions = new Map<string, string>();

      for (const functionName of functionNames) {
        const versionCommand = `aws lambda get-function \
          --function-name ${functionName} \
          --query "Configuration.Version" \
          --output text`;

        const version = execSync(versionCommand, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();

        versions.set(functionName, version);
      }

      return versions;
    } catch (error) {
      logger.warn('Failed to get Lambda versions', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return new Map();
    }
  }

  /**
   * Gets the template hash for a stack.
   * 
   * @param stackName - Stack name
   * @returns Promise resolving to template hash
   */
  private async getTemplateHash(stackName: string): Promise<string> {
    try {
      const command = `aws cloudformation get-template \
        --stack-name ${stackName} \
        --query "TemplateBody" \
        --output json`;

      const template = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Create hash of template
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(template).digest('hex');

      return hash;
    } catch (error) {
      logger.warn('Failed to get template hash', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return '';
    }
  }

  /**
   * Gets the endpoint for a stack.
   * 
   * @param stackName - Stack name
   * @returns Promise resolving to endpoint URL
   */
  private async getStackEndpoint(stackName: string): Promise<string> {
    try {
      const command = `aws cloudformation describe-stacks \
        --stack-name ${stackName} \
        --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" \
        --output text`;

      const endpoint = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      return endpoint;
    } catch (error) {
      logger.warn('Failed to get stack endpoint', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return '';
    }
  }
}
