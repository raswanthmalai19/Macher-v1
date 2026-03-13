/**
 * CDK Deployment Engine for MACHER CI/CD Pipeline
 * 
 * This module handles CDK bootstrap, synthesis, deployment, rollback,
 * and drift detection operations.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 12.1
 */

import {
  BootstrapResult,
  DeploymentResult,
  ChangeSet,
  StackChange,
  RollbackResult,
  DriftResult,
  DriftedResource,
  PropertyDifference,
  CDKContext,
} from '../types';
import { logger } from '../logger';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * CloudFormation template structure
 */
interface CloudFormationTemplate {
  Resources: Record<string, unknown>;
  Outputs?: Record<string, unknown>;
  Parameters?: Record<string, unknown>;
}

/**
 * CDKDeployer orchestrates CDK deployment operations.
 */
export class CDKDeployer {
  private readonly cdkPath: string;

  /**
   * Creates a new CDKDeployer instance.
   * 
   * @param cdkPath - Path to CDK project directory (defaults to 'infrastructure')
   */
  constructor(cdkPath: string = 'infrastructure') {
    this.cdkPath = cdkPath;
  }

  /**
   * Executes CDK bootstrap for an account/region.
   * 
   * Requirements: 4.1
   * 
   * @param account - AWS account ID
   * @param region - AWS region
   * @returns Promise resolving to bootstrap result
   */
  async bootstrap(account: string, region: string): Promise<BootstrapResult> {
    try {
      logger.info('Starting CDK bootstrap', { account, region });

      const command = `cd ${this.cdkPath} && npx cdk bootstrap aws://${account}/${region}`;
      
      const output = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      logger.info('CDK bootstrap completed', { account, region, output });

      // Extract version from output (CDK bootstrap typically outputs version info)
      const versionMatch = output.match(/version[:\s]+(\d+)/i);
      const version = versionMatch ? parseInt(versionMatch[1], 10) : 6;

      return {
        success: true,
        version,
      };
    } catch (error) {
      logger.error(
        'CDK bootstrap failed',
        error instanceof Error ? error : new Error(String(error)),
        { account, region }
      );

      return {
        success: false,
        version: 0,
        error: error instanceof Error ? error.message : 'Unknown bootstrap error',
      };
    }
  }

  /**
   * Synthesizes CloudFormation templates from CDK code.
   * 
   * Requirements: 4.2
   * 
   * @param stackName - Name of the CDK stack to synthesize
   * @param context - CDK context values
   * @returns Promise resolving to synthesized CloudFormation template
   */
  async synthesize(stackName: string, context: CDKContext): Promise<CloudFormationTemplate> {
    try {
      logger.info('Starting CDK synthesis', { stackName, context });

      // Build context arguments
      const contextArgs = Object.entries(context)
        .map(([key, value]) => `--context ${key}=${JSON.stringify(value)}`)
        .join(' ');

      const command = `cd ${this.cdkPath} && npx cdk synth ${stackName} ${contextArgs} --json`;
      
      const output = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      logger.info('CDK synthesis completed', { stackName });

      // Parse the synthesized template
      const template = JSON.parse(output) as CloudFormationTemplate;

      return template;
    } catch (error) {
      logger.error(
        'CDK synthesis failed',
        error instanceof Error ? error : new Error(String(error)),
        { stackName, context }
      );

      throw new Error(
        `Failed to synthesize CDK stack: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Deploys a CDK stack to AWS.
   * 
   * Requirements: 4.3, 4.4, 4.5
   * 
   * @param stackName - Name of the CDK stack to deploy
   * @param context - CDK context values
   * @param requireApproval - Whether to require manual approval (default: false)
   * @returns Promise resolving to deployment result
   */
  async deploy(
    stackName: string,
    context: CDKContext,
    requireApproval: boolean = false
  ): Promise<DeploymentResult> {
    const startTime = Date.now();

    try {
      logger.info('Starting CDK deployment', { stackName, context, requireApproval });

      // Build context arguments
      const contextArgs = Object.entries(context)
        .map(([key, value]) => `--context ${key}=${JSON.stringify(value)}`)
        .join(' ');

      // Set approval requirement
      const approvalFlag = requireApproval ? '--require-approval any-change' : '--require-approval never';

      const command = `cd ${this.cdkPath} && npx cdk deploy ${stackName} ${contextArgs} ${approvalFlag} --outputs-file outputs.json`;
      
      const output = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      logger.info('CDK deployment completed', { stackName, output });

      // Read stack outputs
      const outputsPath = path.join(this.cdkPath, 'outputs.json');
      let stackOutputs: Record<string, string> = {};

      if (fs.existsSync(outputsPath)) {
        const outputsData = fs.readFileSync(outputsPath, 'utf-8');
        const outputs = JSON.parse(outputsData);
        stackOutputs = outputs[stackName] || {};
      }

      const duration = Math.floor((Date.now() - startTime) / 1000);

      return {
        success: true,
        stackName,
        stackOutputs,
        duration,
      };
    } catch (error) {
      const duration = Math.floor((Date.now() - startTime) / 1000);

      logger.error(
        'CDK deployment failed',
        error instanceof Error ? error : new Error(String(error)),
        { stackName, context }
      );

      return {
        success: false,
        stackName,
        stackOutputs: {},
        duration,
        error: error instanceof Error ? error.message : 'Unknown deployment error',
      };
    }
  }

  /**
   * Generates a changeset showing differences between current and new stack.
   * 
   * Requirements: 4.4
   * 
   * @param stackName - Name of the CDK stack
   * @param context - CDK context values
   * @returns Promise resolving to changeset
   */
  async diff(stackName: string, context: CDKContext): Promise<ChangeSet> {
    try {
      logger.info('Generating CDK diff', { stackName, context });

      // Build context arguments
      const contextArgs = Object.entries(context)
        .map(([key, value]) => `--context ${key}=${JSON.stringify(value)}`)
        .join(' ');

      const command = `cd ${this.cdkPath} && npx cdk diff ${stackName} ${contextArgs}`;
      
      const output = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      logger.info('CDK diff generated', { stackName });

      // Parse diff output to extract changes
      const changes = this.parseDiffOutput(output);

      return {
        stackName,
        changes,
        requiresApproval: changes.some(
          (change) => change.action === 'Remove' || change.replacement === true
        ),
      };
    } catch (error) {
      logger.error(
        'CDK diff failed',
        error instanceof Error ? error : new Error(String(error)),
        { stackName, context }
      );

      // Return empty changeset on error
      return {
        stackName,
        changes: [],
        requiresApproval: false,
      };
    }
  }

  /**
   * Rolls back a CDK stack to a previous version.
   * 
   * Requirements: 4.5
   * 
   * @param stackName - Name of the CDK stack to rollback
   * @param version - Version identifier to rollback to (not used in CDK, uses CloudFormation)
   * @returns Promise resolving to rollback result
   */
  async rollback(stackName: string, version: string): Promise<RollbackResult> {
    const startTime = Date.now();

    try {
      logger.info('Starting stack rollback', { stackName, version });

      // CloudFormation rollback using AWS CLI
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

      const duration = Math.floor((Date.now() - startTime) / 1000);

      logger.info('Stack rollback completed', { stackName, duration });

      return {
        success: true,
        previousVersion: version,
        duration,
      };
    } catch (error) {
      const duration = Math.floor((Date.now() - startTime) / 1000);

      logger.error(
        'Stack rollback failed',
        error instanceof Error ? error : new Error(String(error)),
        { stackName, version }
      );

      return {
        success: false,
        previousVersion: version,
        duration,
        error: error instanceof Error ? error.message : 'Unknown rollback error',
      };
    }
  }

  /**
   * Detects infrastructure drift for a CloudFormation stack.
   * 
   * Requirements: 12.1
   * 
   * @param stackName - Name of the CloudFormation stack
   * @returns Promise resolving to drift detection result
   */
  async detectDrift(stackName: string): Promise<DriftResult> {
    try {
      logger.info('Starting drift detection', { stackName });

      // Initiate drift detection
      const detectCommand = `aws cloudformation detect-stack-drift --stack-name ${stackName} --query "StackDriftDetectionId" --output text`;
      
      const detectionId = execSync(detectCommand, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      logger.info('Drift detection initiated', { stackName, detectionId });

      // Wait for drift detection to complete
      const waitCommand = `aws cloudformation wait stack-drift-detection-complete --stack-drift-detection-id ${detectionId}`;
      
      execSync(waitCommand, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Get drift detection results
      const resultsCommand = `aws cloudformation describe-stack-drift-detection-status --stack-drift-detection-id ${detectionId} --query "StackDriftStatus" --output text`;
      
      const driftStatus = execSync(resultsCommand, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim() as 'IN_SYNC' | 'DRIFTED' | 'UNKNOWN';

      logger.info('Drift detection completed', { stackName, driftStatus });

      // Get drifted resources if drift detected
      let driftedResources: DriftedResource[] = [];

      if (driftStatus === 'DRIFTED') {
        const resourcesCommand = `aws cloudformation describe-stack-resource-drifts --stack-name ${stackName} --query "StackResourceDrifts[?StackResourceDriftStatus=='MODIFIED' || StackResourceDriftStatus=='DELETED']" --output json`;
        
        const resourcesOutput = execSync(resourcesCommand, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        const resources = JSON.parse(resourcesOutput);
        driftedResources = resources.map((resource: any) => this.parseDriftedResource(resource));
      }

      return {
        stackName,
        driftStatus,
        driftedResources,
        detectionTime: new Date(),
      };
    } catch (error) {
      logger.error(
        'Drift detection failed',
        error instanceof Error ? error : new Error(String(error)),
        { stackName }
      );

      return {
        stackName,
        driftStatus: 'UNKNOWN',
        driftedResources: [],
        detectionTime: new Date(),
      };
    }
  }

  /**
   * Parses CDK diff output to extract stack changes.
   * 
   * @param diffOutput - Raw CDK diff output
   * @returns Array of stack changes
   */
  private parseDiffOutput(diffOutput: string): StackChange[] {
    const changes: StackChange[] = [];
    const lines = diffOutput.split('\n');

    for (const line of lines) {
      // Parse lines like: [+] AWS::Lambda::Function MyFunction
      const addMatch = line.match(/\[\+\]\s+(\S+)\s+(\S+)/);
      if (addMatch) {
        changes.push({
          action: 'Add',
          resourceType: addMatch[1],
          logicalResourceId: addMatch[2],
          replacement: false,
        });
        continue;
      }

      // Parse lines like: [-] AWS::Lambda::Function MyFunction
      const removeMatch = line.match(/\[-\]\s+(\S+)\s+(\S+)/);
      if (removeMatch) {
        changes.push({
          action: 'Remove',
          resourceType: removeMatch[1],
          logicalResourceId: removeMatch[2],
          replacement: false,
        });
        continue;
      }

      // Parse lines like: [~] AWS::Lambda::Function MyFunction (replacement)
      const modifyMatch = line.match(/\[~\]\s+(\S+)\s+(\S+)(\s+\(replacement\))?/);
      if (modifyMatch) {
        changes.push({
          action: 'Modify',
          resourceType: modifyMatch[1],
          logicalResourceId: modifyMatch[2],
          replacement: !!modifyMatch[3],
        });
      }
    }

    return changes;
  }

  /**
   * Parses CloudFormation drift resource data.
   * 
   * @param resource - Raw CloudFormation drift resource data
   * @returns Parsed drifted resource
   */
  private parseDriftedResource(resource: any): DriftedResource {
    const propertyDifferences: PropertyDifference[] = [];

    if (resource.PropertyDifferences) {
      for (const diff of resource.PropertyDifferences) {
        propertyDifferences.push({
          propertyPath: diff.PropertyPath,
          expectedValue: diff.ExpectedValue,
          actualValue: diff.ActualValue,
          differenceType: diff.DifferenceType,
        });
      }
    }

    return {
      logicalResourceId: resource.LogicalResourceId,
      physicalResourceId: resource.PhysicalResourceId,
      resourceType: resource.ResourceType,
      driftType: resource.StackResourceDriftStatus === 'DELETED' ? 'DELETED' : 'MODIFIED',
      propertyDifferences,
    };
  }
}
