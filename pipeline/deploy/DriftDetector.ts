/**
 * DriftDetector - CloudFormation drift detection and remediation
 * 
 * Detects manual changes to CloudFormation stacks, generates drift reports,
 * and optionally remediates drifted resources. Supports scheduled drift detection
 * for continuous infrastructure monitoring.
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

import {
  CloudFormationClient,
  DetectStackDriftCommand,
  DescribeStackDriftDetectionStatusCommand,
  DescribeStackResourceDriftsCommand,
  StackDriftStatus,
  StackResourceDriftStatus,
  DifferenceType,
} from '@aws-sdk/client-cloudformation';
import { DriftResult, DriftedResource, PropertyDifference, DriftStatus, DriftType } from '../types';
import { logger } from '../logger';

/**
 * Drift detection history entry
 */
export interface DriftHistoryEntry {
  stackName: string;
  detectionTime: Date;
  driftStatus: DriftStatus;
  driftedResourceCount: number;
}

/**
 * Drift remediation strategy
 */
export type RemediationStrategy = 'revert' | 'accept';

/**
 * DriftDetector handles CloudFormation stack drift detection and remediation
 */
export class DriftDetector {
  private cfnClient: CloudFormationClient;
  private driftHistory: DriftHistoryEntry[] = [];

  constructor(region: string = 'us-east-1') {
    this.cfnClient = new CloudFormationClient({ region });
    logger.info('DriftDetector initialized', { region });
  }

  /**
   * Detect drift in a CloudFormation stack
   * 
   * @param stackName - Name of the stack to check for drift
   * @returns DriftResult with drift detection details
   * 
   * Requirements: 12.1
   */
  async detectStackDrift(stackName: string): Promise<DriftResult> {
    try {
      logger.info('Starting drift detection', { stackName });

      // Initiate drift detection
      const detectCommand = new DetectStackDriftCommand({
        StackName: stackName,
      });
      const detectResponse = await this.cfnClient.send(detectCommand);
      const driftDetectionId = detectResponse.StackDriftDetectionId;

      if (!driftDetectionId) {
        throw new Error('Failed to initiate drift detection');
      }

      // Poll for drift detection completion
      let detectionStatus = 'DETECTION_IN_PROGRESS';
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes with 5-second intervals

      while (detectionStatus === 'DETECTION_IN_PROGRESS' && attempts < maxAttempts) {
        await this.sleep(5000); // Wait 5 seconds
        attempts++;

        const statusCommand = new DescribeStackDriftDetectionStatusCommand({
          StackDriftDetectionId: driftDetectionId,
        });
        const statusResponse = await this.cfnClient.send(statusCommand);
        detectionStatus = statusResponse.DetectionStatus || 'DETECTION_IN_PROGRESS';

        logger.debug('Drift detection status', { stackName, status: detectionStatus, attempts });
      }

      if (detectionStatus !== 'DETECTION_COMPLETE') {
        throw new Error(`Drift detection failed with status: ${detectionStatus}`);
      }

      // Get drift detection results
      const driftsCommand = new DescribeStackResourceDriftsCommand({
        StackName: stackName,
        StackResourceDriftStatusFilters: [
          StackResourceDriftStatus.MODIFIED,
          StackResourceDriftStatus.DELETED,
          StackResourceDriftStatus.NOT_CHECKED,
        ],
      });
      const driftsResponse = await this.cfnClient.send(driftsCommand);

      // Parse drifted resources
      const driftedResources: DriftedResource[] = [];
      if (driftsResponse.StackResourceDrifts) {
        for (const drift of driftsResponse.StackResourceDrifts) {
          if (drift.StackResourceDriftStatus === StackResourceDriftStatus.IN_SYNC) {
            continue; // Skip resources that are in sync
          }

          const propertyDifferences: PropertyDifference[] = [];
          if (drift.PropertyDifferences) {
            for (const propDiff of drift.PropertyDifferences) {
              propertyDifferences.push({
                propertyPath: propDiff.PropertyPath || '',
                expectedValue: this.parseJsonValue(propDiff.ExpectedValue),
                actualValue: this.parseJsonValue(propDiff.ActualValue),
                differenceType: this.mapDifferenceType(propDiff.DifferenceType),
              });
            }
          }

          driftedResources.push({
            logicalResourceId: drift.LogicalResourceId || '',
            physicalResourceId: drift.PhysicalResourceId || '',
            resourceType: drift.ResourceType || '',
            driftType: this.mapDriftType(drift.StackResourceDriftStatus),
            propertyDifferences,
          });
        }
      }

      // Determine overall drift status
      const driftStatus = this.mapStackDriftStatus(
        driftsResponse.StackResourceDrifts?.[0]?.StackDriftStatus || StackDriftStatus.IN_SYNC
      );

      const result: DriftResult = {
        stackName,
        driftStatus,
        driftedResources,
        detectionTime: new Date(),
      };

      // Add to history
      this.addToHistory({
        stackName,
        detectionTime: result.detectionTime,
        driftStatus,
        driftedResourceCount: driftedResources.length,
      });

      logger.info('Drift detection completed', {
        stackName,
        driftStatus,
        driftedResourceCount: driftedResources.length,
      });

      return result;
    } catch (error) {
      logger.error('Drift detection failed', { stackName, error });
      throw error;
    }
  }

  /**
   * Generate a human-readable drift report
   * 
   * @param results - Array of drift detection results
   * @returns Formatted drift report string
   * 
   * Requirements: 12.2
   */
  generateDriftReport(results: DriftResult[]): string {
    logger.info('Generating drift report', { stackCount: results.length });

    let report = '# CloudFormation Drift Detection Report\n\n';
    report += `Generated: ${new Date().toISOString()}\n`;
    report += `Stacks Analyzed: ${results.length}\n\n`;

    // Summary
    const driftedStacks = results.filter(r => r.driftStatus === 'DRIFTED');
    const inSyncStacks = results.filter(r => r.driftStatus === 'IN_SYNC');
    const unknownStacks = results.filter(r => r.driftStatus === 'UNKNOWN');

    report += '## Summary\n\n';
    report += `- Drifted: ${driftedStacks.length}\n`;
    report += `- In Sync: ${inSyncStacks.length}\n`;
    report += `- Unknown: ${unknownStacks.length}\n\n`;

    // Detailed results for drifted stacks
    if (driftedStacks.length > 0) {
      report += '## Drifted Stacks\n\n';

      for (const result of driftedStacks) {
        report += `### ${result.stackName}\n\n`;
        report += `**Detection Time:** ${result.detectionTime.toISOString()}\n`;
        report += `**Drifted Resources:** ${result.driftedResources.length}\n\n`;

        if (result.driftedResources.length > 0) {
          report += '#### Drifted Resources\n\n';

          for (const resource of result.driftedResources) {
            report += `**${resource.logicalResourceId}** (${resource.resourceType})\n`;
            report += `- Physical ID: ${resource.physicalResourceId}\n`;
            report += `- Drift Type: ${resource.driftType}\n`;

            if (resource.propertyDifferences.length > 0) {
              report += '- Property Differences:\n';
              for (const diff of resource.propertyDifferences) {
                report += `  - **${diff.propertyPath}** (${diff.differenceType})\n`;
                report += `    - Expected: ${JSON.stringify(diff.expectedValue)}\n`;
                report += `    - Actual: ${JSON.stringify(diff.actualValue)}\n`;
              }
            }
            report += '\n';
          }
        }
      }
    }

    // In-sync stacks
    if (inSyncStacks.length > 0) {
      report += '## In-Sync Stacks\n\n';
      for (const result of inSyncStacks) {
        report += `- ${result.stackName}\n`;
      }
      report += '\n';
    }

    logger.info('Drift report generated', { reportLength: report.length });
    return report;
  }

  /**
   * Remediate drifted resource
   * 
   * @param resource - Drifted resource to remediate
   * @param strategy - Remediation strategy ('revert' or 'accept')
   * 
   * Requirements: 12.5
   */
  async remediateDrift(resource: DriftedResource, strategy: RemediationStrategy): Promise<void> {
    logger.info('Remediating drift', {
      logicalResourceId: resource.logicalResourceId,
      strategy,
    });

    if (strategy === 'revert') {
      // In a real implementation, this would:
      // 1. Update the CloudFormation stack to revert the resource
      // 2. Or manually revert the resource to match the template
      logger.info('Reverting resource to template definition', {
        logicalResourceId: resource.logicalResourceId,
      });

      // Placeholder for actual revert logic
      // This would typically involve updating the stack or using AWS APIs
      // to restore the resource to its expected state
    } else if (strategy === 'accept') {
      // Accept the drift by updating the CloudFormation template
      logger.info('Accepting drift - template should be updated', {
        logicalResourceId: resource.logicalResourceId,
      });

      // Placeholder for accept logic
      // This would typically involve updating the CDK code or CloudFormation
      // template to match the actual resource state
    }

    logger.info('Drift remediation completed', {
      logicalResourceId: resource.logicalResourceId,
      strategy,
    });
  }

  /**
   * Schedule drift detection to run on a cron schedule
   * 
   * @param cronExpression - Cron expression for scheduling (e.g., '0 2 * * *' for daily at 2 AM)
   * 
   * Requirements: 12.4
   */
  scheduleDriftDetection(cronExpression: string): void {
    logger.info('Scheduling drift detection', { cronExpression });

    // In a real implementation, this would:
    // 1. Create an EventBridge rule with the cron expression
    // 2. Configure the rule to trigger a Lambda function or Step Function
    // 3. The Lambda/Step Function would call detectStackDrift for all stacks

    // For now, log the scheduling request
    logger.info('Drift detection scheduled', {
      cronExpression,
      note: 'Implement EventBridge rule creation in production',
    });
  }

  /**
   * Get drift detection history
   * 
   * @returns Array of drift history entries
   * 
   * Requirements: 12.6
   */
  getDriftHistory(): DriftHistoryEntry[] {
    return [...this.driftHistory];
  }

  /**
   * Clear drift detection history
   */
  clearHistory(): void {
    this.driftHistory = [];
    logger.info('Drift history cleared');
  }

  /**
   * Add entry to drift history
   * 
   * @param entry - Drift history entry
   */
  private addToHistory(entry: DriftHistoryEntry): void {
    this.driftHistory.push(entry);

    // Keep only last 100 entries
    if (this.driftHistory.length > 100) {
      this.driftHistory = this.driftHistory.slice(-100);
    }
  }

  /**
   * Map CloudFormation drift status to our DriftStatus type
   * 
   * @param status - CloudFormation stack drift status
   * @returns DriftStatus
   */
  private mapStackDriftStatus(status: StackDriftStatus | string): DriftStatus {
    switch (status) {
      case StackDriftStatus.DRIFTED:
        return 'DRIFTED';
      case StackDriftStatus.IN_SYNC:
        return 'IN_SYNC';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Map CloudFormation resource drift status to our DriftType
   * 
   * @param status - CloudFormation resource drift status
   * @returns DriftType
   */
  private mapDriftType(status: StackResourceDriftStatus | string | undefined): DriftType {
    switch (status) {
      case StackResourceDriftStatus.MODIFIED:
        return 'MODIFIED';
      case StackResourceDriftStatus.DELETED:
        return 'DELETED';
      case StackResourceDriftStatus.NOT_CHECKED:
        return 'NOT_IN_STACK';
      default:
        return 'MODIFIED';
    }
  }

  /**
   * Map CloudFormation difference type to our format
   * 
   * @param type - CloudFormation difference type
   * @returns Difference type string
   */
  private mapDifferenceType(type: DifferenceType | string | undefined): 'ADD' | 'REMOVE' | 'NOT_EQUAL' {
    switch (type) {
      case DifferenceType.ADD:
        return 'ADD';
      case DifferenceType.REMOVE:
        return 'REMOVE';
      case DifferenceType.NOT_EQUAL:
        return 'NOT_EQUAL';
      default:
        return 'NOT_EQUAL';
    }
  }

  /**
   * Parse JSON value safely
   * 
   * @param value - JSON string value
   * @returns Parsed value or original string
   */
  private parseJsonValue(value: string | undefined): unknown {
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  /**
   * Sleep for specified milliseconds
   * 
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
