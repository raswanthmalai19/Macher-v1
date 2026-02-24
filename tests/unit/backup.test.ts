import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { BackupConstruct } from '../../lib/constructs/backup';
import { devConfig } from '../../lib/config';

describe('AWS Backup', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');

    // Create mock DynamoDB tables
    const connectionsTable = new dynamodb.Table(stack, 'ConnectionsTable', {
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const metadataTable = new dynamodb.Table(stack, 'MetadataTable', {
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    new BackupConstruct(stack, 'TestBackup', {
      config: devConfig,
      connectionsTable,
      metadataTable,
    });

    template = Template.fromStack(stack);
  });

  test('Backup vault is created', () => {
    template.resourceCountIs('AWS::Backup::BackupVault', 1);
  });

  test('Backup plan is created', () => {
    template.resourceCountIs('AWS::Backup::BackupPlan', 1);
  });

  test('Backup plan has daily schedule', () => {
    const backupPlans = template.findResources('AWS::Backup::BackupPlan');
    const planKeys = Object.keys(backupPlans);
    expect(planKeys.length).toBe(1);

    const plan = backupPlans[planKeys[0]];
    const rules = plan.Properties.BackupPlan.BackupPlanRule;
    
    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0].ScheduleExpression).toMatch(/cron/);
  });

  test('Backup plan has 7-day retention', () => {
    const backupPlans = template.findResources('AWS::Backup::BackupPlan');
    const planKeys = Object.keys(backupPlans);
    const plan = backupPlans[planKeys[0]];
    const rules = plan.Properties.BackupPlan.BackupPlanRule;
    
    expect(rules[0].Lifecycle).toBeDefined();
    expect(rules[0].Lifecycle.DeleteAfterDays).toBe(7);
  });

  test('Backup selection includes DynamoDB tables', () => {
    template.resourceCountIs('AWS::Backup::BackupSelection', 1);
  });

  test('Backup selection has resources', () => {
    const selections = template.findResources('AWS::Backup::BackupSelection');
    const selectionKeys = Object.keys(selections);
    expect(selectionKeys.length).toBe(1);

    const selection = selections[selectionKeys[0]];
    expect(selection.Properties.BackupSelection.Resources).toBeDefined();
    expect(selection.Properties.BackupSelection.Resources.length).toBeGreaterThanOrEqual(2);
  });
});
