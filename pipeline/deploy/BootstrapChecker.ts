/**
 * CDK Bootstrap Checker for MACHER CI/CD Pipeline
 * 
 * This module checks if an AWS account/region is bootstrapped for CDK deployments
 * and determines if bootstrap is required before deployment.
 * 
 * Requirements: 4.1
 */

import { BootstrapResult } from '../types';
import { logger } from '../logger';
import { execSync } from 'child_process';

/**
 * Minimum required CDK bootstrap version
 */
const REQUIRED_BOOTSTRAP_VERSION = 6;

/**
 * BootstrapChecker verifies CDK bootstrap status for AWS accounts/regions.
 */
export class BootstrapChecker {
  /**
   * Checks if an AWS account/region is bootstrapped for CDK.
   * 
   * Requirements: 4.1
   * 
   * @param account - AWS account ID
   * @param region - AWS region
   * @returns Promise resolving to true if bootstrapped, false otherwise
   */
  async isBootstrapped(account: string, region: string): Promise<boolean> {
    try {
      logger.info('Checking CDK bootstrap status', { account, region });

      // Check if the CDK bootstrap stack exists
      const command = `aws cloudformation describe-stacks --stack-name CDKToolkit --region ${region} --query "Stacks[0].StackStatus" --output text 2>/dev/null || echo "NOT_FOUND"`;
      
      const result = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      const bootstrapped = result !== 'NOT_FOUND' && result !== '';
      
      logger.info('Bootstrap check complete', { 
        account, 
        region, 
        bootstrapped,
        stackStatus: result 
      });

      return bootstrapped;
    } catch (error) {
      logger.error(
        'Failed to check bootstrap status',
        error instanceof Error ? error : new Error(String(error)),
        { account, region }
      );
      return false;
    }
  }

  /**
   * Retrieves the CDK bootstrap version for an account/region.
   * 
   * Requirements: 4.1
   * 
   * @param account - AWS account ID
   * @param region - AWS region
   * @returns Promise resolving to bootstrap version number, or 0 if not bootstrapped
   */
  async getBootstrapVersion(account: string, region: string): Promise<number> {
    try {
      logger.info('Retrieving CDK bootstrap version', { account, region });

      // Query the bootstrap version from SSM Parameter Store
      const command = `aws ssm get-parameter --name /cdk-bootstrap/hnb659fds/version --region ${region} --query "Parameter.Value" --output text 2>/dev/null || echo "0"`;
      
      const result = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      const version = parseInt(result, 10) || 0;
      
      logger.info('Bootstrap version retrieved', { 
        account, 
        region, 
        version 
      });

      return version;
    } catch (error) {
      logger.error(
        'Failed to retrieve bootstrap version',
        error instanceof Error ? error : new Error(String(error)),
        { account, region }
      );
      return 0;
    }
  }

  /**
   * Determines if bootstrap is required based on current version.
   * 
   * Requirements: 4.1
   * 
   * @param requiredVersion - Minimum required bootstrap version (defaults to 6)
   * @param currentVersion - Current bootstrap version (defaults to 0)
   * @returns True if bootstrap is required, false otherwise
   */
  requiresBootstrap(requiredVersion: number = REQUIRED_BOOTSTRAP_VERSION, currentVersion: number = 0): boolean {
    const required = currentVersion < requiredVersion;
    
    logger.info('Bootstrap requirement check', { 
      requiredVersion, 
      currentVersion, 
      required 
    });

    return required;
  }

  /**
   * Performs a complete bootstrap check for an account/region.
   * 
   * Requirements: 4.1
   * 
   * @param account - AWS account ID
   * @param region - AWS region
   * @returns Promise resolving to bootstrap result with status and version
   */
  async checkBootstrap(account: string, region: string): Promise<BootstrapResult> {
    try {
      const bootstrapped = await this.isBootstrapped(account, region);
      
      if (!bootstrapped) {
        return {
          success: false,
          version: 0,
          error: 'Account/region is not bootstrapped for CDK',
        };
      }

      const version = await this.getBootstrapVersion(account, region);
      const needsUpgrade = this.requiresBootstrap(REQUIRED_BOOTSTRAP_VERSION, version);

      if (needsUpgrade) {
        return {
          success: false,
          version,
          error: `Bootstrap version ${version} is below required version ${REQUIRED_BOOTSTRAP_VERSION}`,
        };
      }

      return {
        success: true,
        version,
      };
    } catch (error) {
      logger.error(
        'Bootstrap check failed',
        error instanceof Error ? error : new Error(String(error)),
        { account, region }
      );

      return {
        success: false,
        version: 0,
        error: error instanceof Error ? error.message : 'Unknown error during bootstrap check',
      };
    }
  }
}
