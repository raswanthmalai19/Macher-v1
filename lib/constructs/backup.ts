import * as cdk from 'aws-cdk-lib';
import * as backup from 'aws-cdk-lib/aws-backup';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface BackupConstructProps {
  config: EnvironmentConfig;
  connectionsTable: dynamodb.Table;
  metadataTable: dynamodb.Table;
}

/**
 * AWS Backup Construct
 * 
 * Creates:
 * - Backup vault for DynamoDB tables
 * - Backup plan with daily backups
 * - 7-day retention policy
 */
export class BackupConstruct extends Construct {
  public readonly backupVault: backup.BackupVault;
  public readonly backupPlan: backup.BackupPlan;

  constructor(scope: Construct, id: string, props: BackupConstructProps) {
    super(scope, id);

    const { config, connectionsTable, metadataTable } = props;

    // Create Backup Vault
    this.backupVault = new backup.BackupVault(this, 'MACHERBackupVault', {
      backupVaultName: `MACHER-Vault-${config.tags.Environment}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create Backup Plan
    this.backupPlan = new backup.BackupPlan(this, 'MACHERBackupPlan', {
      backupPlanName: `MACHER-DailyBackup-${config.tags.Environment}`,
      backupVault: this.backupVault,
      backupPlanRules: [
        new backup.BackupPlanRule({
          ruleName: 'DailyBackup',
          scheduleExpression: events.Schedule.cron({
            hour: '2',
            minute: '0',
          }),
          deleteAfter: cdk.Duration.days(7),
          startWindow: cdk.Duration.hours(1),
          completionWindow: cdk.Duration.hours(2),
        }),
      ],
    });

    // Add DynamoDB tables to backup plan
    this.backupPlan.addSelection('DynamoDBTablesSelection', {
      resources: [
        backup.BackupResource.fromDynamoDbTable(connectionsTable),
        backup.BackupResource.fromDynamoDbTable(metadataTable),
      ],
    });

    // Apply tags
    cdk.Tags.of(this.backupVault).add('Component', 'Backup');
    cdk.Tags.of(this.backupPlan).add('Component', 'Backup');
  }
}
