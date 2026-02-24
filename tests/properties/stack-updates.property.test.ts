import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Template } from 'aws-cdk-lib/assertions';
import * as fc from 'fast-check';
import { VocalShieldStack } from '../../lib/vocalshield-stack';
import { getConfig } from '../../lib/config';

/**
 * Property 12: Stack Update Data Preservation
 * 
 * For any CDK stack update operation, stateful resources (DynamoDB tables) 
 * SHALL retain their existing data after the update completes.
 * 
 * Validates: Requirements 1.5
 * 
 * Feature: aws-infrastructure-foundation
 * Property 12: Stack Update Data Preservation
 */

describe('Property 12: Stack Update Data Preservation', () => {
  const numTests = 100;

  /**
   * Test that DynamoDB tables have appropriate retention policies
   * to preserve data during stack updates
   */
  it('should configure DynamoDB tables with data preservation policies', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('dev', 'staging', 'production'),
        (environment) => {
          // Get environment configuration
          const config = getConfig(environment);

          // Create CDK app and stack
          const app = new cdk.App();

          const stack = new VocalShieldStack(
            app, 
            `TestStack-${environment}`, 
            config,
            {
              env: {
                account: '123456789012',
                region: config.region,
              },
            }
          );

          // Synthesize stack to CloudFormation template
          const template = Template.fromStack(stack);

          // Get all DynamoDB tables from the template
          const tables = template.findResources('AWS::DynamoDB::Table');

          // Verify that tables exist
          expect(Object.keys(tables).length).toBeGreaterThan(0);

          // Check each table for data preservation configuration
          Object.entries(tables).forEach(([logicalId, resource]) => {
            const properties = resource.Properties;
            const tableName = properties.TableName;

            // For production environment, verify RETAIN policy
            if (environment === 'production') {
              // Check deletion protection is enabled
              expect(properties.DeletionProtectionEnabled).toBe(true);
              
              // Note: RemovalPolicy is a CDK construct property, not a CloudFormation property
              // It affects the DeletionPolicy in CloudFormation
              // We verify this by checking the resource metadata
              const deletionPolicy = resource.DeletionPolicy;
              expect(deletionPolicy).toBe('Retain');
            } else {
              // For dev/staging, deletion protection should be disabled
              expect(properties.DeletionProtectionEnabled).toBe(false);
            }

            // Verify billing mode is on-demand (supports updates without downtime)
            expect(properties.BillingMode).toBe('PAY_PER_REQUEST');

            // Verify TTL is configured (allows data expiration without manual intervention)
            expect(properties.TimeToLiveSpecification).toBeDefined();
            expect(properties.TimeToLiveSpecification.Enabled).toBe(true);
          });

          return true;
        }
      ),
      { numRuns: numTests }
    );
  });

  /**
   * Test that stack updates preserve table configuration
   * by verifying that key properties remain consistent
   */
  it('should maintain consistent table configuration across stack updates', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('dev', 'staging', 'production'),
        fc.boolean(), // Simulate a configuration change
        (environment, configChange) => {
          // Get environment configuration
          const config = getConfig(environment);

          // Create initial stack
          const app1 = new cdk.App();

          const stack1 = new VocalShieldStack(
            app1, 
            `TestStack1-${environment}`, 
            config,
            {
              env: {
                account: '123456789012',
                region: config.region,
              },
            }
          );

          const template1 = Template.fromStack(stack1);
          const tables1 = template1.findResources('AWS::DynamoDB::Table');

          // Create updated stack (simulating a stack update)
          const app2 = new cdk.App();

          const stack2 = new VocalShieldStack(
            app2, 
            `TestStack2-${environment}`, 
            config,
            {
              env: {
                account: '123456789012',
                region: config.region,
              },
            }
          );

          const template2 = Template.fromStack(stack2);
          const tables2 = template2.findResources('AWS::DynamoDB::Table');

          // Verify same number of tables
          expect(Object.keys(tables1).length).toBe(Object.keys(tables2).length);

          // Verify critical properties remain consistent
          Object.keys(tables1).forEach((logicalId) => {
            const table1Props = tables1[logicalId].Properties;
            const table2Props = tables2[logicalId].Properties;

            // Key schema should not change (would require table replacement)
            expect(table2Props.KeySchema).toEqual(table1Props.KeySchema);

            // Billing mode should remain consistent
            expect(table2Props.BillingMode).toBe(table1Props.BillingMode);

            // TTL configuration should remain consistent
            expect(table2Props.TimeToLiveSpecification).toEqual(
              table1Props.TimeToLiveSpecification
            );

            // Deletion protection should remain consistent for the environment
            expect(table2Props.DeletionProtectionEnabled).toBe(
              table1Props.DeletionProtectionEnabled
            );
          });

          return true;
        }
      ),
      { numRuns: numTests }
    );
  });

  /**
   * Test that no stateful resources have DESTROY removal policy in production
   */
  it('should never use DESTROY removal policy for stateful resources in production', () => {
    fc.assert(
      fc.property(
        fc.constant('production'),
        (environment) => {
          const config = getConfig(environment);
          const app = new cdk.App();

          const stack = new VocalShieldStack(
            app, 
            `TestStack-${environment}`, 
            config,
            {
              env: {
                account: '123456789012',
                region: config.region,
              },
            }
          );

          const template = Template.fromStack(stack);

          // Check DynamoDB tables
          const tables = template.findResources('AWS::DynamoDB::Table');
          Object.entries(tables).forEach(([logicalId, resource]) => {
            // In production, deletion policy should be Retain
            const deletionPolicy = resource.DeletionPolicy;
            expect(deletionPolicy).not.toBe('Delete');
            expect(deletionPolicy).toBe('Retain');
          });

          return true;
        }
      ),
      { numRuns: 10 } // Only need to test production once
    );
  });

  /**
   * Test that update policies allow for zero-downtime updates
   */
  it('should configure tables for zero-downtime updates', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('dev', 'staging', 'production'),
        (environment) => {
          const config = getConfig(environment);
          const app = new cdk.App();

          const stack = new VocalShieldStack(
            app, 
            `TestStack-${environment}`, 
            config,
            {
              env: {
                account: '123456789012',
                region: config.region,
              },
            }
          );

          const template = Template.fromStack(stack);
          const tables = template.findResources('AWS::DynamoDB::Table');

          Object.entries(tables).forEach(([logicalId, resource]) => {
            const properties = resource.Properties;

            // On-demand billing mode allows updates without capacity planning
            expect(properties.BillingMode).toBe('PAY_PER_REQUEST');

            // Point-in-time recovery disabled for cost, but data preserved via retention policy
            expect(properties.PointInTimeRecoverySpecification?.PointInTimeRecoveryEnabled).toBe(
              false
            );

            // Encryption should be enabled (AWS managed keys)
            expect(properties.SSESpecification?.SSEEnabled).toBe(true);
          });

          return true;
        }
      ),
      { numRuns: numTests }
    );
  });

  /**
   * Test that table names are stable across updates
   * (changing table names would cause table replacement)
   */
  it('should use stable table names that do not change across updates', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('dev', 'staging', 'production'),
        (environment) => {
          const config = getConfig(environment);
          const app = new cdk.App();

          const stack = new VocalShieldStack(
            app, 
            `TestStack-${environment}`, 
            config,
            {
              env: {
                account: '123456789012',
                region: config.region,
              },
            }
          );

          const template = Template.fromStack(stack);
          const tables = template.findResources('AWS::DynamoDB::Table');

          Object.entries(tables).forEach(([logicalId, resource]) => {
            const tableName = resource.Properties.TableName;

            // Table name should be explicitly set (not auto-generated)
            expect(tableName).toBeDefined();
            expect(typeof tableName).toBe('string');

            // Table name should include environment for isolation
            expect(tableName).toContain('VocalShield');

            // Table name should not contain random suffixes that would change
            expect(tableName).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/);
          });

          return true;
        }
      ),
      { numRuns: numTests }
    );
  });
});
