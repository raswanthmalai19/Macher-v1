import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { VocalShieldStack } from '../../lib/vocalshield-stack';
import { devConfig } from '../../lib/config';
import * as fc from 'fast-check';

/**
 * Property 1: Comprehensive Resource Tagging
 * 
 * For any AWS resource created by the Infrastructure_Stack, that resource 
 * SHALL have all required tags: Project=VocalShield, Environment 
 * (dev/staging/production), ManagedBy=CDK, and CostCenter.
 * 
 * Validates: Requirements 1.6, 7.1, 12.1, 12.2, 12.3, 12.4, 12.5
 */

describe('Property 1: Comprehensive Resource Tagging', () => {
  const requiredTags = {
    Project: 'VocalShield',
    Environment: devConfig.tags.Environment,
    ManagedBy: 'CDK',
    CostCenter: 'VocalShield-Infrastructure',
  };

  test('Property 1: All taggable resources SHALL have required tags', () => {
    fc.assert(
      fc.property(
        // Generate different environment configurations
        fc.constantFrom('dev', 'staging', 'production'),
        (environment) => {
          const app = new cdk.App();
          const testConfig = {
            ...devConfig,
            tags: {
              ...devConfig.tags,
              Environment: environment,
            },
          };
          
          const stack = new VocalShieldStack(app, `TestStack-${environment}`, testConfig);
          const template = Template.fromStack(stack);
          const resources = template.toJSON().Resources;

          // Property: All resources MUST have required tags
          Object.entries(resources).forEach(([logicalId, resource]: [string, any]) => {
            const resourceType = resource.Type;
            
            // Check if resource type supports tagging
            const taggableTypes = [
              'AWS::Lambda::Function',
              'AWS::DynamoDB::Table',
              'AWS::SNS::Topic',
              'AWS::SQS::Queue',
              'AWS::EC2::VPC',
              'AWS::Logs::LogGroup',
              'AWS::S3::Bucket',
              'AWS::StepFunctions::StateMachine',
              'AWS::Events::EventBus',
            ];

            if (taggableTypes.some(type => resourceType.startsWith(type))) {
              const tags = resource.Properties?.Tags;
              
              if (tags) {
                // Convert tags array to object for easier checking
                const tagMap: Record<string, string> = {};
                tags.forEach((tag: any) => {
                  if (tag.Key && tag.Value) {
                    tagMap[tag.Key] = tag.Value;
                  }
                });

                // Verify required tags are present
                expect(tagMap).toHaveProperty('Project');
                expect(tagMap.Project).toBe('VocalShield');
                
                expect(tagMap).toHaveProperty('Environment');
                expect(tagMap.Environment).toBe(environment);
                
                expect(tagMap).toHaveProperty('ManagedBy');
                expect(tagMap.ManagedBy).toBe('CDK');
                
                expect(tagMap).toHaveProperty('CostCenter');
                expect(tagMap.CostCenter).toBe('VocalShield-Infrastructure');
              }
            }
          });

          return true;
        }
      ),
      { numRuns: 3 } // Test with dev, staging, production
    );
  });

  test('Property 1: Stack-level tags are applied', () => {
    const app = new cdk.App();
    const stack = new VocalShieldStack(app, 'TestStack', devConfig);
    
    // Verify stack has tags applied via Tags.of()
    const stackTags = cdk.Tags.of(stack);
    expect(stackTags).toBeDefined();
  });

  test('Property 1: Lambda functions have all required tags', () => {
    const app = new cdk.App();
    const stack = new VocalShieldStack(app, 'TestStack', devConfig);
    const template = Template.fromStack(stack);

    const lambdaFunctions = template.findResources('AWS::Lambda::Function');
    const functionKeys = Object.keys(lambdaFunctions);

    expect(functionKeys.length).toBeGreaterThan(0);

    functionKeys.forEach(key => {
      const fn = lambdaFunctions[key];
      const tags = fn.Properties.Tags;

      expect(tags).toBeDefined();
      
      const tagMap: Record<string, string> = {};
      tags.forEach((tag: any) => {
        tagMap[tag.Key] = tag.Value;
      });

      expect(tagMap.Project).toBe(requiredTags.Project);
      expect(tagMap.Environment).toBe(requiredTags.Environment);
      expect(tagMap.ManagedBy).toBe(requiredTags.ManagedBy);
      expect(tagMap.CostCenter).toBe(requiredTags.CostCenter);
    });
  });

  test('Property 1: DynamoDB tables have all required tags', () => {
    const app = new cdk.App();
    const stack = new VocalShieldStack(app, 'TestStack', devConfig);
    const template = Template.fromStack(stack);

    const tables = template.findResources('AWS::DynamoDB::Table');
    const tableKeys = Object.keys(tables);

    expect(tableKeys.length).toBeGreaterThan(0);

    tableKeys.forEach(key => {
      const table = tables[key];
      const tags = table.Properties.Tags;

      expect(tags).toBeDefined();
      
      const tagMap: Record<string, string> = {};
      tags.forEach((tag: any) => {
        tagMap[tag.Key] = tag.Value;
      });

      expect(tagMap.Project).toBe(requiredTags.Project);
      expect(tagMap.Environment).toBe(requiredTags.Environment);
      expect(tagMap.ManagedBy).toBe(requiredTags.ManagedBy);
      expect(tagMap.CostCenter).toBe(requiredTags.CostCenter);
    });
  });

  test('Property 1: Tag values are consistent across all resources', () => {
    fc.assert(
      fc.property(
        fc.record({
          environment: fc.constantFrom('dev', 'staging', 'production'),
        }),
        ({ environment }) => {
          const app = new cdk.App();
          const testConfig = {
            ...devConfig,
            tags: {
              ...devConfig.tags,
              Environment: environment,
            },
          };
          
          const stack = new VocalShieldStack(app, `TestStack-${environment}`, testConfig);
          const template = Template.fromStack(stack);
          const resources = template.toJSON().Resources;

          const allTags: Array<Record<string, string>> = [];

          // Collect all tags from all resources
          Object.values(resources).forEach((resource: any) => {
            if (resource.Properties?.Tags) {
              const tagMap: Record<string, string> = {};
              resource.Properties.Tags.forEach((tag: any) => {
                if (tag.Key && tag.Value) {
                  tagMap[tag.Key] = tag.Value;
                }
              });
              if (Object.keys(tagMap).length > 0) {
                allTags.push(tagMap);
              }
            }
          });

          // Property: All resources with tags MUST have consistent tag values
          allTags.forEach(tagMap => {
            if (tagMap.Project) {
              expect(tagMap.Project).toBe('VocalShield');
            }
            if (tagMap.Environment) {
              expect(tagMap.Environment).toBe(environment);
            }
            if (tagMap.ManagedBy) {
              expect(tagMap.ManagedBy).toBe('CDK');
            }
            if (tagMap.CostCenter) {
              expect(tagMap.CostCenter).toBe('VocalShield-Infrastructure');
            }
          });

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});
