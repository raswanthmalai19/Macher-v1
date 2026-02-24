import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CostManagementConstruct } from '../../lib/constructs/cost-management';
import { devConfig } from '../../lib/config';

describe('Cost Management', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
    new CostManagementConstruct(stack, 'TestCostManagement', {
      config: devConfig,
      notificationEmail: 'test@example.com',
    });
    template = Template.fromStack(stack);
  });

  describe('AWS Budget', () => {
    test('Budget is created', () => {
      template.resourceCountIs('AWS::Budgets::Budget', 1);
    });

    test('Budget has $10 monthly limit', () => {
      template.hasResourceProperties('AWS::Budgets::Budget', {
        Budget: {
          BudgetType: 'COST',
          TimeUnit: 'MONTHLY',
          BudgetLimit: {
            Amount: 10,
            Unit: 'USD',
          },
        },
      });
    });

    test('Budget has 80% threshold alert', () => {
      const budgets = template.findResources('AWS::Budgets::Budget');
      const budgetKeys = Object.keys(budgets);
      expect(budgetKeys.length).toBe(1);

      const budget = budgets[budgetKeys[0]];
      const notifications = budget.Properties.NotificationsWithSubscribers;

      const has80PercentAlert = notifications.some((notif: any) => 
        notif.Notification.Threshold === 80 &&
        notif.Notification.ThresholdType === 'PERCENTAGE'
      );
      expect(has80PercentAlert).toBe(true);
    });

    test('Budget has 100% threshold alert', () => {
      const budgets = template.findResources('AWS::Budgets::Budget');
      const budgetKeys = Object.keys(budgets);
      const budget = budgets[budgetKeys[0]];
      const notifications = budget.Properties.NotificationsWithSubscribers;

      const has100PercentAlert = notifications.some((notif: any) => 
        notif.Notification.Threshold === 100 &&
        notif.Notification.ThresholdType === 'PERCENTAGE'
      );
      expect(has100PercentAlert).toBe(true);
    });

    test('Budget has email subscriber', () => {
      const budgets = template.findResources('AWS::Budgets::Budget');
      const budgetKeys = Object.keys(budgets);
      const budget = budgets[budgetKeys[0]];
      const notifications = budget.Properties.NotificationsWithSubscribers;

      notifications.forEach((notif: any) => {
        expect(notif.Subscribers).toBeDefined();
        expect(notif.Subscribers.length).toBeGreaterThan(0);
        expect(notif.Subscribers[0].SubscriptionType).toBe('EMAIL');
        expect(notif.Subscribers[0].Address).toBe('test@example.com');
      });
    });

    test('Budget filters by Project tag', () => {
      template.hasResourceProperties('AWS::Budgets::Budget', {
        Budget: {
          CostFilters: {
            TagKeyValue: [`user:Project$${devConfig.tags.Project}`],
          },
        },
      });
    });
  });

  describe('Resource Group', () => {
    test('Resource Group is created', () => {
      template.resourceCountIs('AWS::ResourceGroups::Group', 1);
    });

    test('Resource Group uses tag-based query', () => {
      template.hasResourceProperties('AWS::ResourceGroups::Group', {
        ResourceQuery: {
          Type: 'TAG_FILTERS_1_0',
        },
      });
    });

    test('Resource Group filters by Project and Environment tags', () => {
      const resourceGroups = template.findResources('AWS::ResourceGroups::Group');
      const rgKeys = Object.keys(resourceGroups);
      expect(rgKeys.length).toBe(1);

      const rg = resourceGroups[rgKeys[0]];
      const query = JSON.parse(rg.Properties.ResourceQuery.Query);

      expect(query.TagFilters).toBeDefined();
      expect(query.TagFilters.length).toBeGreaterThanOrEqual(2);

      const hasProjectTag = query.TagFilters.some((filter: any) => 
        filter.Key === 'Project' && filter.Values.includes(devConfig.tags.Project)
      );
      expect(hasProjectTag).toBe(true);

      const hasEnvironmentTag = query.TagFilters.some((filter: any) => 
        filter.Key === 'Environment' && filter.Values.includes(devConfig.tags.Environment)
      );
      expect(hasEnvironmentTag).toBe(true);
    });

    test('Resource Group includes all supported resource types', () => {
      const resourceGroups = template.findResources('AWS::ResourceGroups::Group');
      const rgKeys = Object.keys(resourceGroups);
      const rg = resourceGroups[rgKeys[0]];
      const query = JSON.parse(rg.Properties.ResourceQuery.Query);

      expect(query.ResourceTypeFilters).toContain('AWS::AllSupported');
    });
  });
});
