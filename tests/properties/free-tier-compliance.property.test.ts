import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as fc from 'fast-check';
import { DynamoDbTablesConstruct } from '../../lib/constructs/dynamodb-tables';
import { EnvironmentConfig } from '../../lib/config/types';

/**
 * Property-Based Tests for Free Tier Configuration Compliance
 * 
 * Property 8: Free Tier Configuration Compliance
 * **Validates: Requirements 7.6**
 * 
 * For any AWS resource created by the Infrastructure_Stack, that resource SHALL use 
 * Free Tier eligible configurations: DynamoDB on-demand billing, Lambda ARM64 architecture, 
 * no EC2 instances, no RDS databases, no NAT Gateways, and CloudWatch log retention 
 * within Free Tier limits.
 * 
 * This test focuses on DynamoDB table configuration compliance with Free Tier requirements.
 */
describe('Property 8: Free Tier Configuration Compliance - DynamoDB', () => {
  /**
   * Generator for valid environment configurations
   * Tests across different environments to ensure Free Tier compliance is universal
   */
  const environmentConfigArbitrary = fc.record({
    stackName: fc.constantFrom('VocalShield-dev', 'VocalShield-staging', 'VocalShield-prod'),
    environment: fc.constantFrom('dev', 'staging', 'production'),
    region: fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1'),
    connectionsTtlDays: fc.integer({ min: 1, max: 7 }),
    metadataTtlDays: fc.integer({ min: 7, max: 90 }),
  }) as fc.Arbitrary<EnvironmentConfig>;

  /**
   * Property: DynamoDB tables MUST use on-demand billing mode
   * 
   * On-demand billing is Free Tier eligible and doesn't charge for idle capacity.
   * Provisioned capacity would incur charges even when not in use.
   */
  test('Property: All DynamoDB tables use on-demand billing mode (PAY_PER_REQUEST)', () => {
    fc.assert(
      fc.property(environmentConfigArbitrary, (config) => {
        // Arrange: Create stack with DynamoDB tables
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'TestStack', {
          env: { account: '123456789012', region: config.region },
        });
        new DynamoDbTablesConstruct(stack, 'TestTables', config);
        const template = Template.fromStack(stack);

        // Act: Get all DynamoDB tables from the template
        const resources = template.toJSON().Resources;
        const dynamoDbTables = Object.keys(resources).filter(
          key => resources[key].Type === 'AWS::DynamoDB::Table'
        );

        // Assert: All tables must use on-demand billing
        expect(dynamoDbTables.length).toBeGreaterThan(0);
        
        for (const tableKey of dynamoDbTables) {
          const table = resources[tableKey];
          
          // Verify billing mode is PAY_PER_REQUEST (on-demand)
          expect(table.Properties.BillingMode).toBe('PAY_PER_REQUEST');
          
          // Verify no provisioned throughput is configured
          expect(table.Properties.ProvisionedThroughput).toBeUndefined();
        }
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property: DynamoDB tables MUST NOT have point-in-time recovery enabled
   * 
   * Point-in-time recovery incurs additional costs and is not Free Tier eligible.
   * For cost optimization, it should be disabled.
   */
  test('Property: All DynamoDB tables have point-in-time recovery disabled', () => {
    fc.assert(
      fc.property(environmentConfigArbitrary, (config) => {
        // Arrange
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'TestStack', {
          env: { account: '123456789012', region: config.region },
        });
        new DynamoDbTablesConstruct(stack, 'TestTables', config);
        const template = Template.fromStack(stack);

        // Act
        const resources = template.toJSON().Resources;
        const dynamoDbTables = Object.keys(resources).filter(
          key => resources[key].Type === 'AWS::DynamoDB::Table'
        );

        // Assert
        expect(dynamoDbTables.length).toBeGreaterThan(0);
        
        for (const tableKey of dynamoDbTables) {
          const table = resources[tableKey];
          
          // Point-in-time recovery must be explicitly disabled
          expect(table.Properties.PointInTimeRecoverySpecification).toBeDefined();
          expect(table.Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled).toBe(false);
        }
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property: DynamoDB tables MUST use AWS managed encryption (not customer managed KMS)
   * 
   * AWS managed encryption is free, while customer managed KMS keys incur charges
   * ($1/month per key + API call charges).
   */
  test('Property: All DynamoDB tables use AWS managed encryption (no customer KMS keys)', () => {
    fc.assert(
      fc.property(environmentConfigArbitrary, (config) => {
        // Arrange
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'TestStack', {
          env: { account: '123456789012', region: config.region },
        });
        new DynamoDbTablesConstruct(stack, 'TestTables', config);
        const template = Template.fromStack(stack);

        // Act
        const resources = template.toJSON().Resources;
        const dynamoDbTables = Object.keys(resources).filter(
          key => resources[key].Type === 'AWS::DynamoDB::Table'
        );

        // Assert
        expect(dynamoDbTables.length).toBeGreaterThan(0);
        
        for (const tableKey of dynamoDbTables) {
          const table = resources[tableKey];
          
          // Encryption must be enabled
          expect(table.Properties.SSESpecification).toBeDefined();
          expect(table.Properties.SSESpecification.SSEEnabled).toBe(true);
          
          // Must NOT use customer managed KMS key (would incur costs)
          expect(table.Properties.SSESpecification.KMSMasterKeyId).toBeUndefined();
        }
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property: DynamoDB tables MUST have TTL enabled for automatic data expiration
   * 
   * TTL is free and helps reduce storage costs by automatically deleting expired data.
   * This keeps storage within Free Tier limits (25 GB).
   */
  test('Property: All DynamoDB tables have TTL enabled', () => {
    fc.assert(
      fc.property(environmentConfigArbitrary, (config) => {
        // Arrange
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'TestStack', {
          env: { account: '123456789012', region: config.region },
        });
        new DynamoDbTablesConstruct(stack, 'TestTables', config);
        const template = Template.fromStack(stack);

        // Act
        const resources = template.toJSON().Resources;
        const dynamoDbTables = Object.keys(resources).filter(
          key => resources[key].Type === 'AWS::DynamoDB::Table'
        );

        // Assert
        expect(dynamoDbTables.length).toBeGreaterThan(0);
        
        for (const tableKey of dynamoDbTables) {
          const table = resources[tableKey];
          
          // TTL must be enabled
          expect(table.Properties.TimeToLiveSpecification).toBeDefined();
          expect(table.Properties.TimeToLiveSpecification.Enabled).toBe(true);
          
          // TTL attribute must be specified
          expect(table.Properties.TimeToLiveSpecification.AttributeName).toBeDefined();
          expect(typeof table.Properties.TimeToLiveSpecification.AttributeName).toBe('string');
          expect(table.Properties.TimeToLiveSpecification.AttributeName.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property: DynamoDB tables MUST NOT have global tables configured
   * 
   * Global tables incur replication costs and are not Free Tier eligible.
   * Single-region deployment is required for cost optimization.
   */
  test('Property: No DynamoDB tables have global table replication configured', () => {
    fc.assert(
      fc.property(environmentConfigArbitrary, (config) => {
        // Arrange
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'TestStack', {
          env: { account: '123456789012', region: config.region },
        });
        new DynamoDbTablesConstruct(stack, 'TestTables', config);
        const template = Template.fromStack(stack);

        // Act
        const resources = template.toJSON().Resources;
        const dynamoDbTables = Object.keys(resources).filter(
          key => resources[key].Type === 'AWS::DynamoDB::Table'
        );

        // Assert
        expect(dynamoDbTables.length).toBeGreaterThan(0);
        
        for (const tableKey of dynamoDbTables) {
          const table = resources[tableKey];
          
          // Global tables would have Replicas property - must not be present
          expect(table.Properties.Replicas).toBeUndefined();
        }
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property: DynamoDB tables MUST NOT have streams enabled
   * 
   * DynamoDB Streams incur additional costs (not Free Tier eligible).
   * Streams should only be enabled if explicitly required.
   */
  test('Property: No DynamoDB tables have streams enabled', () => {
    fc.assert(
      fc.property(environmentConfigArbitrary, (config) => {
        // Arrange
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'TestStack', {
          env: { account: '123456789012', region: config.region },
        });
        new DynamoDbTablesConstruct(stack, 'TestTables', config);
        const template = Template.fromStack(stack);

        // Act
        const resources = template.toJSON().Resources;
        const dynamoDbTables = Object.keys(resources).filter(
          key => resources[key].Type === 'AWS::DynamoDB::Table'
        );

        // Assert
        expect(dynamoDbTables.length).toBeGreaterThan(0);
        
        for (const tableKey of dynamoDbTables) {
          const table = resources[tableKey];
          
          // DynamoDB Streams would have StreamSpecification property - must not be present
          expect(table.Properties.StreamSpecification).toBeUndefined();
        }
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property: DynamoDB GSI (Global Secondary Index) MUST use same billing mode as base table
   * 
   * GSIs inherit the billing mode from the base table. This test ensures consistency
   * and that GSIs don't accidentally use provisioned capacity.
   */
  test('Property: All DynamoDB GSIs use on-demand billing (inherited from base table)', () => {
    fc.assert(
      fc.property(environmentConfigArbitrary, (config) => {
        // Arrange
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'TestStack', {
          env: { account: '123456789012', region: config.region },
        });
        new DynamoDbTablesConstruct(stack, 'TestTables', config);
        const template = Template.fromStack(stack);

        // Act
        const resources = template.toJSON().Resources;
        const dynamoDbTables = Object.keys(resources).filter(
          key => resources[key].Type === 'AWS::DynamoDB::Table'
        );

        // Assert
        for (const tableKey of dynamoDbTables) {
          const table = resources[tableKey];
          
          // If table has GSIs, verify they don't have provisioned throughput
          if (table.Properties.GlobalSecondaryIndexes) {
            const gsis = table.Properties.GlobalSecondaryIndexes;
            
            for (const gsi of gsis) {
              // GSIs in on-demand mode should not have ProvisionedThroughput
              expect(gsi.ProvisionedThroughput).toBeUndefined();
            }
          }
        }
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property: DynamoDB tables MUST NOT have contributor insights enabled
   * 
   * Contributor Insights incurs additional costs and is not Free Tier eligible.
   * Should only be enabled if explicitly required for debugging.
   */
  test('Property: No DynamoDB tables have contributor insights enabled', () => {
    fc.assert(
      fc.property(environmentConfigArbitrary, (config) => {
        // Arrange
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'TestStack', {
          env: { account: '123456789012', region: config.region },
        });
        new DynamoDbTablesConstruct(stack, 'TestTables', config);
        const template = Template.fromStack(stack);

        // Act
        const resources = template.toJSON().Resources;
        const dynamoDbTables = Object.keys(resources).filter(
          key => resources[key].Type === 'AWS::DynamoDB::Table'
        );

        // Assert
        expect(dynamoDbTables.length).toBeGreaterThan(0);
        
        for (const tableKey of dynamoDbTables) {
          const table = resources[tableKey];
          
          // Contributor Insights would have ContributorInsightsSpecification property
          expect(table.Properties.ContributorInsightsSpecification).toBeUndefined();
        }
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property: DynamoDB tables MUST NOT have Kinesis streaming enabled
   * 
   * Kinesis Data Streams for DynamoDB incurs additional costs.
   * Not Free Tier eligible.
   */
  test('Property: No DynamoDB tables have Kinesis streaming enabled', () => {
    fc.assert(
      fc.property(environmentConfigArbitrary, (config) => {
        // Arrange
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'TestStack', {
          env: { account: '123456789012', region: config.region },
        });
        new DynamoDbTablesConstruct(stack, 'TestTables', config);
        const template = Template.fromStack(stack);

        // Act
        const resources = template.toJSON().Resources;
        const dynamoDbTables = Object.keys(resources).filter(
          key => resources[key].Type === 'AWS::DynamoDB::Table'
        );

        // Assert
        expect(dynamoDbTables.length).toBeGreaterThan(0);
        
        for (const tableKey of dynamoDbTables) {
          const table = resources[tableKey];
          
          // Kinesis streaming would have KinesisStreamSpecification property
          expect(table.Properties.KinesisStreamSpecification).toBeUndefined();
        }
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Comprehensive Free Tier Compliance Check
   * 
   * This test combines all Free Tier requirements into a single property test
   * to ensure complete compliance across all configurations.
   */
  test('Property: DynamoDB tables are fully Free Tier compliant (comprehensive check)', () => {
    fc.assert(
      fc.property(environmentConfigArbitrary, (config) => {
        // Arrange
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'TestStack', {
          env: { account: '123456789012', region: config.region },
        });
        new DynamoDbTablesConstruct(stack, 'TestTables', config);
        const template = Template.fromStack(stack);

        // Act
        const resources = template.toJSON().Resources;
        const dynamoDbTables = Object.keys(resources).filter(
          key => resources[key].Type === 'AWS::DynamoDB::Table'
        );

        // Assert: Comprehensive Free Tier compliance
        expect(dynamoDbTables.length).toBeGreaterThan(0);
        
        for (const tableKey of dynamoDbTables) {
          const table = resources[tableKey];
          
          // 1. On-demand billing (Free Tier eligible)
          expect(table.Properties.BillingMode).toBe('PAY_PER_REQUEST');
          expect(table.Properties.ProvisionedThroughput).toBeUndefined();
          
          // 2. No point-in-time recovery (cost optimization)
          expect(table.Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled).toBe(false);
          
          // 3. AWS managed encryption (free)
          expect(table.Properties.SSESpecification.SSEEnabled).toBe(true);
          expect(table.Properties.SSESpecification.KMSMasterKeyId).toBeUndefined();
          
          // 4. TTL enabled (automatic data expiration)
          expect(table.Properties.TimeToLiveSpecification.Enabled).toBe(true);
          
          // 5. No global tables (no replication costs)
          expect(table.Properties.Replicas).toBeUndefined();
          
          // 6. No streams (no additional costs)
          expect(table.Properties.StreamSpecification).toBeUndefined();
          
          // 7. No Kinesis streaming (no additional costs)
          expect(table.Properties.KinesisStreamSpecification).toBeUndefined();
          
          // 8. No contributor insights (no additional costs)
          expect(table.Properties.ContributorInsightsSpecification).toBeUndefined();
          
          // 9. GSIs (if present) don't have provisioned throughput
          if (table.Properties.GlobalSecondaryIndexes) {
            for (const gsi of table.Properties.GlobalSecondaryIndexes) {
              expect(gsi.ProvisionedThroughput).toBeUndefined();
            }
          }
        }
      }),
      { numRuns: 20 }
    );
  });
});
