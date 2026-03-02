import * as cdk from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as resourcegroups from 'aws-cdk-lib/aws-resourcegroups';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface CostManagementConstructProps {
  config: EnvironmentConfig;
  notificationEmail: string;
}

/**
 * Cost Management Construct
 * 
 * Creates:
 * - AWS Budget with $10/month limit and 80%/100% alerts
 * - Resource Group for all MACHER resources (tag-based)
 */
export class CostManagementConstruct extends Construct {
  public readonly budget: budgets.CfnBudget;
  public readonly resourceGroup: resourcegroups.CfnGroup;

  constructor(scope: Construct, id: string, props: CostManagementConstructProps) {
    super(scope, id);

    const { config, notificationEmail } = props;

    // Create AWS Budget (Task 16.1)
    this.budget = new budgets.CfnBudget(this, 'MACHERBudget', {
      budget: {
        budgetName: `MACHER-Budget-${config.tags.Environment}`,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: 10,
          unit: 'USD',
        },
        costFilters: {
          TagKeyValue: [`user:Project$${config.tags.Project}`],
        },
      },
      notificationsWithSubscribers: [
        // Alert at 80% threshold
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'EMAIL',
              address: notificationEmail,
            },
          ],
        },
        // Alert at 100% threshold
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'EMAIL',
              address: notificationEmail,
            },
          ],
        },
      ],
    });

    // Create Resource Group (Task 16.2)
    this.resourceGroup = new resourcegroups.CfnGroup(this, 'MACHERResourceGroup', {
      name: `MACHER-Resources-${config.tags.Environment}`,
      description: 'All MACHER infrastructure resources',
      resourceQuery: {
        type: 'TAG_FILTERS_1_0',
        query: JSON.stringify({
          ResourceTypeFilters: ['AWS::AllSupported'],
          TagFilters: [
            {
              Key: 'Project',
              Values: [config.tags.Project],
            },
            {
              Key: 'Environment',
              Values: [config.tags.Environment],
            },
          ],
        }),
      },
      tags: [
        {
          key: 'Project',
          value: config.tags.Project,
        },
        {
          key: 'Environment',
          value: config.tags.Environment,
        },
        {
          key: 'ManagedBy',
          value: config.tags.ManagedBy,
        },
      ],
    });

    // Apply tags
    cdk.Tags.of(this).add('Component', 'CostManagement');
  }
}
