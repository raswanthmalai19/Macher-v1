import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DynamoDbTablesConstruct } from '../../lib/constructs/dynamodb-tables';
import { devConfig } from '../../lib/config';

/**
 * Unit tests for DynamoDB Tables configuration
 * 
 * Tests verify:
 * - Connections Table is created with correct schema
 * - Table uses on-demand billing mode (Free Tier compliance)
 * - TTL is enabled on ttl attribute
 * - Point-in-time recovery is disabled (cost optimization)
 * - Table has correct partition and sort keys
 * 
 * Requirements: 4.1, 4.2, 4.5, 7.6
 */
describe('DynamoDbTablesConstruct', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let tablesConstruct: DynamoDbTablesConstruct;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: devConfig.region,
      },
    });
    tablesConstruct = new DynamoDbTablesConstruct(stack, 'TestTables', devConfig);
    template = Template.fromStack(stack);
  });

  describe('Connections Table - Schema', () => {
    test('Connections Table is created', () => {
      // Verify table resource exists
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Connections`,
      });
    });

    test('Connections Table has correct partition key (connectionId)', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Connections`,
        KeySchema: Match.arrayWith([
          {
            AttributeName: 'connectionId',
            KeyType: 'HASH', // HASH = partition key
          },
        ]),
        AttributeDefinitions: Match.arrayWith([
          {
            AttributeName: 'connectionId',
            AttributeType: 'S', // S = String
          },
        ]),
      });
    });

    test('Connections Table has correct sort key (connectedAt)', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Connections`,
        KeySchema: Match.arrayWith([
          {
            AttributeName: 'connectedAt',
            KeyType: 'RANGE', // RANGE = sort key
          },
        ]),
        AttributeDefinitions: Match.arrayWith([
          {
            AttributeName: 'connectedAt',
            AttributeType: 'N', // N = Number
          },
        ]),
      });
    });

    test('Connections Table key schema has exactly 2 keys', () => {
      const resources = template.toJSON().Resources;
      const tableKey = Object.keys(resources).find(key => 
        resources[key].Type === 'AWS::DynamoDB::Table' &&
        resources[key].Properties?.TableName === `${devConfig.stackName}-Connections`
      );
      
      expect(tableKey).toBeDefined();
      const table = resources[tableKey!];
      expect(table.Properties.KeySchema).toHaveLength(2);
    });
  });

  describe('Connections Table - Billing Mode', () => {
    test('Connections Table uses on-demand billing mode', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Connections`,
        BillingMode: 'PAY_PER_REQUEST',
      });
    });

    test('Connections Table does not have provisioned throughput', () => {
      const resources = template.toJSON().Resources;
      const tableKey = Object.keys(resources).find(key => 
        resources[key].Type === 'AWS::DynamoDB::Table' &&
        resources[key].Properties?.TableName === `${devConfig.stackName}-Connections`
      );
      
      expect(tableKey).toBeDefined();
      const table = resources[tableKey!];
      
      // On-demand billing should not have ProvisionedThroughput
      expect(table.Properties.ProvisionedThroughput).toBeUndefined();
    });
  });

  describe('Connections Table - TTL Configuration', () => {
    test('Connections Table has TTL enabled', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Connections`,
        TimeToLiveSpecification: {
          AttributeName: 'ttl',
          Enabled: true,
        },
      });
    });

    test('TTL attribute name is "ttl"', () => {
      const resources = template.toJSON().Resources;
      const tableKey = Object.keys(resources).find(key => 
        resources[key].Type === 'AWS::DynamoDB::Table' &&
        resources[key].Properties?.TableName === `${devConfig.stackName}-Connections`
      );
      
      expect(tableKey).toBeDefined();
      const table = resources[tableKey!];
      expect(table.Properties.TimeToLiveSpecification.AttributeName).toBe('ttl');
    });
  });

  describe('Connections Table - Point-in-Time Recovery', () => {
    test('Point-in-time recovery is disabled for cost optimization', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Connections`,
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: false,
        },
      });
    });
  });

  describe('Connections Table - Encryption', () => {
    test('Connections Table uses AWS managed encryption', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Connections`,
        SSESpecification: {
          SSEEnabled: true,
        },
      });
    });

    test('Connections Table does not use customer managed KMS key', () => {
      const resources = template.toJSON().Resources;
      const tableKey = Object.keys(resources).find(key => 
        resources[key].Type === 'AWS::DynamoDB::Table' &&
        resources[key].Properties?.TableName === `${devConfig.stackName}-Connections`
      );
      
      expect(tableKey).toBeDefined();
      const table = resources[tableKey!];
      
      // AWS managed encryption should not have KMSMasterKeyId
      expect(table.Properties.SSESpecification?.KMSMasterKeyId).toBeUndefined();
    });
  });

  describe('Connections Table - Removal Policy', () => {
    test('Connections Table has DESTROY removal policy in dev environment', () => {
      // In dev environment, table should be destroyed when stack is deleted
      const resources = template.toJSON().Resources;
      const tableKey = Object.keys(resources).find(key => 
        resources[key].Type === 'AWS::DynamoDB::Table' &&
        resources[key].Properties?.TableName === `${devConfig.stackName}-Connections`
      );
      
      expect(tableKey).toBeDefined();
      const table = resources[tableKey!];
      
      // DeletionPolicy should be Delete (not Retain) for dev
      expect(table.DeletionPolicy).toBe('Delete');
    });
  });

  describe('Connections Table - Outputs', () => {
    test('Connections Table name output is created', () => {
      const outputs = template.toJSON().Outputs;
      const outputKeys = Object.keys(outputs || {});
      
      const tableNameOutput = outputKeys.find(key => 
        outputs[key].Description === 'DynamoDB Connections Table name'
      );
      
      expect(tableNameOutput).toBeDefined();
      expect(outputs[tableNameOutput!].Description).toBe('DynamoDB Connections Table name');
    });

    test('Connections Table ARN output is created', () => {
      const outputs = template.toJSON().Outputs;
      const outputKeys = Object.keys(outputs || {});
      
      const tableArnOutput = outputKeys.find(key => 
        outputs[key].Description === 'DynamoDB Connections Table ARN'
      );
      
      expect(tableArnOutput).toBeDefined();
      expect(outputs[tableArnOutput!].Description).toBe('DynamoDB Connections Table ARN');
    });
  });

  describe('Connections Table - Tags', () => {
    test('Connections Table has Name tag', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Connections`,
        Tags: Match.arrayWith([
          {
            Key: 'Name',
            Value: `${devConfig.stackName}-Connections`,
          },
        ]),
      });
    });

    test('Connections Table has DataType tag', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Connections`,
        Tags: Match.arrayWith([
          {
            Key: 'DataType',
            Value: 'ConnectionMetadata',
          },
        ]),
      });
    });

    test('Connections Table has TTL tag', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Connections`,
        Tags: Match.arrayWith([
          {
            Key: 'TTL',
            Value: `${devConfig.connectionsTtlDays} days`,
          },
        ]),
      });
    });
  });

  describe('Connections Table - Construct Properties', () => {
    test('Connections Table is accessible from construct', () => {
      const table = tablesConstruct.connectionsTable;
      expect(table).toBeDefined();
      expect(table.tableName).toBeDefined();
      expect(table.tableArn).toBeDefined();
    });

    test('Connections Table name matches configuration', () => {
      const table = tablesConstruct.connectionsTable;
      // Table name is a CDK token that resolves during deployment
      expect(table.tableName).toBeDefined();
    });
  });

  describe('Free Tier Compliance', () => {
    test('Connections Table uses only Free Tier eligible configurations', () => {
      const resources = template.toJSON().Resources;
      const tableKey = Object.keys(resources).find(key => 
        resources[key].Type === 'AWS::DynamoDB::Table' &&
        resources[key].Properties?.TableName === `${devConfig.stackName}-Connections`
      );
      
      expect(tableKey).toBeDefined();
      const table = resources[tableKey!];
      
      // Verify Free Tier compliance:
      // 1. On-demand billing (no provisioned capacity charges when idle)
      expect(table.Properties.BillingMode).toBe('PAY_PER_REQUEST');
      
      // 2. No point-in-time recovery (costs extra)
      expect(table.Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled).toBe(false);
      
      // 3. AWS managed encryption (free, vs customer managed KMS key)
      expect(table.Properties.SSESpecification.SSEEnabled).toBe(true);
      expect(table.Properties.SSESpecification.KMSMasterKeyId).toBeUndefined();
      
      // 4. TTL enabled for automatic data expiration (reduces storage costs)
      expect(table.Properties.TimeToLiveSpecification.Enabled).toBe(true);
    });

    test('No global tables configured (would incur replication costs)', () => {
      const resources = template.toJSON().Resources;
      const tableKey = Object.keys(resources).find(key => 
        resources[key].Type === 'AWS::DynamoDB::Table' &&
        resources[key].Properties?.TableName === `${devConfig.stackName}-Connections`
      );
      
      expect(tableKey).toBeDefined();
      const table = resources[tableKey!];
      
      // Global tables would have Replicas property
      expect(table.Properties.Replicas).toBeUndefined();
    });

    test('No streams enabled (would incur additional costs)', () => {
      const resources = template.toJSON().Resources;
      const tableKey = Object.keys(resources).find(key => 
        resources[key].Type === 'AWS::DynamoDB::Table' &&
        resources[key].Properties?.TableName === `${devConfig.stackName}-Connections`
      );
      
      expect(tableKey).toBeDefined();
      const table = resources[tableKey!];
      
      // DynamoDB Streams would have StreamSpecification property
      expect(table.Properties.StreamSpecification).toBeUndefined();
    });
  });

  describe('Configuration Validation', () => {
    test('TTL configuration matches expected retention period', () => {
      // Connections should be retained for 1 day (24 hours)
      expect(devConfig.connectionsTtlDays).toBe(1);
    });

    test('Table name follows naming convention', () => {
      const expectedName = `${devConfig.stackName}-Connections`;
      expect(expectedName).toBe('VocalShield-dev-Connections');
      
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: expectedName,
      });
    });
  });

  describe('Metadata Table - Schema', () => {
    test('Metadata Table is created', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Metadata`,
      });
    });

    test('Metadata Table has correct partition key (sessionId)', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Metadata`,
        KeySchema: Match.arrayWith([
          {
            AttributeName: 'sessionId',
            KeyType: 'HASH',
          },
        ]),
        AttributeDefinitions: Match.arrayWith([
          {
            AttributeName: 'sessionId',
            AttributeType: 'S',
          },
        ]),
      });
    });

    test('Metadata Table has correct sort key (timestamp)', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Metadata`,
        KeySchema: Match.arrayWith([
          {
            AttributeName: 'timestamp',
            KeyType: 'RANGE',
          },
        ]),
        AttributeDefinitions: Match.arrayWith([
          {
            AttributeName: 'timestamp',
            AttributeType: 'N',
          },
        ]),
      });
    });

    test('Metadata Table key schema has exactly 2 keys', () => {
      const resources = template.toJSON().Resources;
      const tableKey = Object.keys(resources).find(key => 
        resources[key].Type === 'AWS::DynamoDB::Table' &&
        resources[key].Properties?.TableName === `${devConfig.stackName}-Metadata`
      );
      
      expect(tableKey).toBeDefined();
      const table = resources[tableKey!];
      expect(table.Properties.KeySchema).toHaveLength(2);
    });
  });

  describe('Metadata Table - Billing Mode', () => {
    test('Metadata Table uses on-demand billing mode', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Metadata`,
        BillingMode: 'PAY_PER_REQUEST',
      });
    });

    test('Metadata Table does not have provisioned throughput', () => {
      const resources = template.toJSON().Resources;
      const tableKey = Object.keys(resources).find(key => 
        resources[key].Type === 'AWS::DynamoDB::Table' &&
        resources[key].Properties?.TableName === `${devConfig.stackName}-Metadata`
      );
      
      expect(tableKey).toBeDefined();
      const table = resources[tableKey!];
      expect(table.Properties.ProvisionedThroughput).toBeUndefined();
    });
  });

  describe('Metadata Table - TTL Configuration', () => {
    test('Metadata Table has TTL enabled', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Metadata`,
        TimeToLiveSpecification: {
          AttributeName: 'ttl',
          Enabled: true,
        },
      });
    });

    test('TTL attribute name is "ttl"', () => {
      const resources = template.toJSON().Resources;
      const tableKey = Object.keys(resources).find(key => 
        resources[key].Type === 'AWS::DynamoDB::Table' &&
        resources[key].Properties?.TableName === `${devConfig.stackName}-Metadata`
      );
      
      expect(tableKey).toBeDefined();
      const table = resources[tableKey!];
      expect(table.Properties.TimeToLiveSpecification.AttributeName).toBe('ttl');
    });
  });

  describe('Metadata Table - GSI Configuration', () => {
    test('Metadata Table has connectionId-timestamp-index GSI', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Metadata`,
        GlobalSecondaryIndexes: Match.arrayWith([
          {
            IndexName: 'connectionId-timestamp-index',
            KeySchema: [
              {
                AttributeName: 'connectionId',
                KeyType: 'HASH',
              },
              {
                AttributeName: 'timestamp',
                KeyType: 'RANGE',
              },
            ],
            Projection: {
              ProjectionType: 'ALL',
            },
          },
        ]),
      });
    });

    test('GSI partition key (connectionId) is defined in AttributeDefinitions', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Metadata`,
        AttributeDefinitions: Match.arrayWith([
          {
            AttributeName: 'connectionId',
            AttributeType: 'S',
          },
        ]),
      });
    });

    test('GSI has ALL projection type', () => {
      const resources = template.toJSON().Resources;
      const tableKey = Object.keys(resources).find(key => 
        resources[key].Type === 'AWS::DynamoDB::Table' &&
        resources[key].Properties?.TableName === `${devConfig.stackName}-Metadata`
      );
      
      expect(tableKey).toBeDefined();
      const table = resources[tableKey!];
      const gsi = table.Properties.GlobalSecondaryIndexes?.[0];
      
      expect(gsi).toBeDefined();
      expect(gsi.Projection.ProjectionType).toBe('ALL');
    });

    test('GSI does not have provisioned throughput (inherits on-demand from table)', () => {
      const resources = template.toJSON().Resources;
      const tableKey = Object.keys(resources).find(key => 
        resources[key].Type === 'AWS::DynamoDB::Table' &&
        resources[key].Properties?.TableName === `${devConfig.stackName}-Metadata`
      );
      
      expect(tableKey).toBeDefined();
      const table = resources[tableKey!];
      const gsi = table.Properties.GlobalSecondaryIndexes?.[0];
      
      expect(gsi).toBeDefined();
      expect(gsi.ProvisionedThroughput).toBeUndefined();
    });
  });

  describe('Metadata Table - Point-in-Time Recovery', () => {
    test('Point-in-time recovery is disabled for cost optimization', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Metadata`,
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: false,
        },
      });
    });
  });

  describe('Metadata Table - Encryption', () => {
    test('Metadata Table uses AWS managed encryption', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Metadata`,
        SSESpecification: {
          SSEEnabled: true,
        },
      });
    });

    test('Metadata Table does not use customer managed KMS key', () => {
      const resources = template.toJSON().Resources;
      const tableKey = Object.keys(resources).find(key => 
        resources[key].Type === 'AWS::DynamoDB::Table' &&
        resources[key].Properties?.TableName === `${devConfig.stackName}-Metadata`
      );
      
      expect(tableKey).toBeDefined();
      const table = resources[tableKey!];
      expect(table.Properties.SSESpecification?.KMSMasterKeyId).toBeUndefined();
    });
  });

  describe('Metadata Table - Removal Policy', () => {
    test('Metadata Table has DESTROY removal policy in dev environment', () => {
      const resources = template.toJSON().Resources;
      const tableKey = Object.keys(resources).find(key => 
        resources[key].Type === 'AWS::DynamoDB::Table' &&
        resources[key].Properties?.TableName === `${devConfig.stackName}-Metadata`
      );
      
      expect(tableKey).toBeDefined();
      const table = resources[tableKey!];
      expect(table.DeletionPolicy).toBe('Delete');
    });
  });

  describe('Metadata Table - Outputs', () => {
    test('Metadata Table name output is created', () => {
      const outputs = template.toJSON().Outputs;
      const outputKeys = Object.keys(outputs || {});
      
      const tableNameOutput = outputKeys.find(key => 
        outputs[key].Description === 'DynamoDB Metadata Table name'
      );
      
      expect(tableNameOutput).toBeDefined();
      expect(outputs[tableNameOutput!].Description).toBe('DynamoDB Metadata Table name');
    });

    test('Metadata Table ARN output is created', () => {
      const outputs = template.toJSON().Outputs;
      const outputKeys = Object.keys(outputs || {});
      
      const tableArnOutput = outputKeys.find(key => 
        outputs[key].Description === 'DynamoDB Metadata Table ARN'
      );
      
      expect(tableArnOutput).toBeDefined();
      expect(outputs[tableArnOutput!].Description).toBe('DynamoDB Metadata Table ARN');
    });
  });

  describe('Metadata Table - Tags', () => {
    test('Metadata Table has Name tag', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Metadata`,
        Tags: Match.arrayWith([
          {
            Key: 'Name',
            Value: `${devConfig.stackName}-Metadata`,
          },
        ]),
      });
    });

    test('Metadata Table has DataType tag', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Metadata`,
        Tags: Match.arrayWith([
          {
            Key: 'DataType',
            Value: 'SessionMetadata',
          },
        ]),
      });
    });

    test('Metadata Table has TTL tag', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${devConfig.stackName}-Metadata`,
        Tags: Match.arrayWith([
          {
            Key: 'TTL',
            Value: `${devConfig.metadataTtlDays} days`,
          },
        ]),
      });
    });
  });

  describe('Metadata Table - Construct Properties', () => {
    test('Metadata Table is accessible from construct', () => {
      const table = tablesConstruct.metadataTable;
      expect(table).toBeDefined();
      expect(table.tableName).toBeDefined();
      expect(table.tableArn).toBeDefined();
    });
  });

  describe('Metadata Table - Free Tier Compliance', () => {
    test('Metadata Table uses only Free Tier eligible configurations', () => {
      const resources = template.toJSON().Resources;
      const tableKey = Object.keys(resources).find(key => 
        resources[key].Type === 'AWS::DynamoDB::Table' &&
        resources[key].Properties?.TableName === `${devConfig.stackName}-Metadata`
      );
      
      expect(tableKey).toBeDefined();
      const table = resources[tableKey!];
      
      expect(table.Properties.BillingMode).toBe('PAY_PER_REQUEST');
      expect(table.Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled).toBe(false);
      expect(table.Properties.SSESpecification.SSEEnabled).toBe(true);
      expect(table.Properties.SSESpecification.KMSMasterKeyId).toBeUndefined();
      expect(table.Properties.TimeToLiveSpecification.Enabled).toBe(true);
    });

    test('No global tables configured', () => {
      const resources = template.toJSON().Resources;
      const tableKey = Object.keys(resources).find(key => 
        resources[key].Type === 'AWS::DynamoDB::Table' &&
        resources[key].Properties?.TableName === `${devConfig.stackName}-Metadata`
      );
      
      expect(tableKey).toBeDefined();
      const table = resources[tableKey!];
      expect(table.Properties.Replicas).toBeUndefined();
    });

    test('No streams enabled', () => {
      const resources = template.toJSON().Resources;
      const tableKey = Object.keys(resources).find(key => 
        resources[key].Type === 'AWS::DynamoDB::Table' &&
        resources[key].Properties?.TableName === `${devConfig.stackName}-Metadata`
      );
      
      expect(tableKey).toBeDefined();
      const table = resources[tableKey!];
      expect(table.Properties.StreamSpecification).toBeUndefined();
    });
  });

  describe('Metadata Table - Configuration Validation', () => {
    test('TTL configuration matches expected retention period', () => {
      expect(devConfig.metadataTtlDays).toBe(30);
    });

    test('Table name follows naming convention', () => {
      const expectedName = `${devConfig.stackName}-Metadata`;
      expect(expectedName).toBe('VocalShield-dev-Metadata');
      
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: expectedName,
      });
    });
  });
});
