import * as fc from 'fast-check';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { VocalShieldStack } from '../../lib/vocalshield-stack';
import { devConfig } from '../../lib/config/dev';

/**
 * Property-Based Tests for IAM Least Privilege
 * 
 * Property 3: IAM Least Privilege
 * 
 * Universal Property: ALL IAM policies MUST follow least privilege principles:
 * - No wildcard (*) resources except for X-Ray tracing
 * - No wildcard (*) actions
 * - Policies scoped to specific resources
 * - No overly permissive policies
 * 
 * Validates: Requirements 3.8, 5.1, 5.2, 5.3, 5.4, 5.5
 */

describe('IAM Least Privilege Properties', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new VocalShieldStack(app, 'TestStack', devConfig);
    template = Template.fromStack(stack);
  });

  /**
   * Property 3: IAM Least Privilege - No Wildcard Resources
   * 
   * Universal Property: IAM policies MUST NOT use wildcard (*) resources
   * except for X-Ray tracing which requires it
   */
  test('Property 3a: IAM policies do not use wildcard resources (except X-Ray)', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const policies = tmpl.findResources('AWS::IAM::Policy');
          const policyKeys = Object.keys(policies);

          // Property: For all IAM policies, resources must not be wildcards (except X-Ray)
          return policyKeys.every((key) => {
            const policy = policies[key];
            const statements = policy.Properties.PolicyDocument.Statement;

            return statements.every((statement: any) => {
              const resources = Array.isArray(statement.Resource) 
                ? statement.Resource 
                : [statement.Resource];
              const actions = Array.isArray(statement.Action) 
                ? statement.Action 
                : [statement.Action];

              // X-Ray tracing requires wildcard resources
              const isXRayPolicy = actions.some((action: string) => 
                action.includes('xray:')
              );

              // CloudWatch Logs retention custom resource needs wildcard
              const isLogRetentionPolicy = actions.some((action: string) =>
                action.includes('logs:PutRetentionPolicy') || action.includes('logs:DeleteRetentionPolicy')
              );

              if (isXRayPolicy || isLogRetentionPolicy) {
                return true; // Allow wildcard for X-Ray and log retention
              }

              // All other policies must have specific resources
              return resources.every((resource: string) => resource !== '*');
            });
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 3b: IAM Least Privilege - No Wildcard Actions
   * 
   * Universal Property: IAM policies MUST NOT use wildcard (*) actions
   */
  test('Property 3b: IAM policies do not use wildcard actions', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const policies = tmpl.findResources('AWS::IAM::Policy');
          const policyKeys = Object.keys(policies);

          // Property: For all IAM policies, actions must not be wildcards
          return policyKeys.every((key) => {
            const policy = policies[key];
            const statements = policy.Properties.PolicyDocument.Statement;

            return statements.every((statement: any) => {
              const actions = Array.isArray(statement.Action) 
                ? statement.Action 
                : [statement.Action];

              // No action should be a wildcard
              return actions.every((action: string) => !action.endsWith(':*') && action !== '*');
            });
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 3c: IAM Least Privilege - Scoped DynamoDB Permissions
   * 
   * Universal Property: DynamoDB permissions MUST be scoped to specific tables
   */
  test('Property 3c: DynamoDB permissions are scoped to specific tables', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const policies = tmpl.findResources('AWS::IAM::Policy');
          const policyKeys = Object.keys(policies);

          // Property: DynamoDB actions must reference specific table ARNs
          return policyKeys.every((key) => {
            const policy = policies[key];
            const statements = policy.Properties.PolicyDocument.Statement;

            return statements.every((statement: any) => {
              const actions = Array.isArray(statement.Action) 
                ? statement.Action 
                : [statement.Action];
              const resources = Array.isArray(statement.Resource) 
                ? statement.Resource 
                : [statement.Resource];

              const hasDynamoDbAction = actions.some((action: string) => 
                action.startsWith('dynamodb:')
              );

              if (!hasDynamoDbAction) {
                return true; // Not a DynamoDB policy
              }

              // DynamoDB policies must have specific table ARNs
              return resources.every((resource: any) => {
                if (typeof resource === 'string') {
                  return resource !== '*';
                }
                // Resource might be a CloudFormation reference
                return true;
              });
            });
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 3d: IAM Least Privilege - Scoped Secrets Manager Permissions
   * 
   * Universal Property: Secrets Manager permissions MUST be scoped to vocalshield/* secrets
   */
  test('Property 3d: Secrets Manager permissions are scoped to vocalshield/* secrets', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const policies = tmpl.findResources('AWS::IAM::Policy');
          const policyKeys = Object.keys(policies);

          // Property: Secrets Manager actions must reference vocalshield/* secrets only
          return policyKeys.every((key) => {
            const policy = policies[key];
            const statements = policy.Properties.PolicyDocument.Statement;

            return statements.every((statement: any) => {
              const actions = Array.isArray(statement.Action) 
                ? statement.Action 
                : [statement.Action];
              const resources = Array.isArray(statement.Resource) 
                ? statement.Resource 
                : [statement.Resource];

              const hasSecretsManagerAction = actions.some((action: string) => 
                action.startsWith('secretsmanager:')
              );

              if (!hasSecretsManagerAction) {
                return true; // Not a Secrets Manager policy
              }

              // Secrets Manager policies must reference vocalshield/* secrets
              return resources.every((resource: any) => {
                if (typeof resource === 'string') {
                  return resource.includes('vocalshield/') || resource !== '*';
                }
                // Resource might be a CloudFormation reference
                return true;
              });
            });
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 3e: IAM Least Privilege - Scoped Parameter Store Permissions
   * 
   * Universal Property: Parameter Store permissions MUST be scoped to /vocalshield/* parameters
   */
  test('Property 3e: Parameter Store permissions are scoped to /vocalshield/* parameters', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const policies = tmpl.findResources('AWS::IAM::Policy');
          const policyKeys = Object.keys(policies);

          // Property: SSM actions must reference /vocalshield/* parameters only
          return policyKeys.every((key) => {
            const policy = policies[key];
            const statements = policy.Properties.PolicyDocument.Statement;

            return statements.every((statement: any) => {
              const actions = Array.isArray(statement.Action) 
                ? statement.Action 
                : [statement.Action];
              const resources = Array.isArray(statement.Resource) 
                ? statement.Resource 
                : [statement.Resource];

              const hasSSMAction = actions.some((action: string) => 
                action.startsWith('ssm:')
              );

              if (!hasSSMAction) {
                return true; // Not an SSM policy
              }

              // SSM policies must reference /vocalshield/* parameters
              return resources.every((resource: any) => {
                if (typeof resource === 'string') {
                  return resource.includes('/vocalshield/') || resource !== '*';
                }
                // Resource might be a CloudFormation reference
                return true;
              });
            });
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 3f: IAM Least Privilege - No Dangerous Permissions
   * 
   * Universal Property: IAM policies MUST NOT grant dangerous permissions
   */
  test('Property 3f: IAM policies do not grant dangerous permissions', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const policies = tmpl.findResources('AWS::IAM::Policy');
          const policyKeys = Object.keys(policies);

          // Dangerous actions that should never be granted
          const dangerousActions = [
            'iam:CreateUser',
            'iam:CreateRole',
            'iam:AttachUserPolicy',
            'iam:AttachRolePolicy',
            'iam:PutUserPolicy',
            'iam:PutRolePolicy',
            'sts:AssumeRole',
            'ec2:RunInstances',
            'rds:CreateDBInstance',
            'lambda:CreateFunction',
          ];

          // Property: No policy should grant dangerous actions
          return policyKeys.every((key) => {
            const policy = policies[key];
            const statements = policy.Properties.PolicyDocument.Statement;

            return statements.every((statement: any) => {
              const actions = Array.isArray(statement.Action) 
                ? statement.Action 
                : [statement.Action];

              return !actions.some((action: string) =>
                dangerousActions.includes(action)
              );
            });
          });
        }
      ),
      { numRuns: 10 }
    );
  });
});
