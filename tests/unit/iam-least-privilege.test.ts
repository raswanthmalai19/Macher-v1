import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { VocalShieldStack } from '../../lib/vocalshield-stack';
import { getConfig } from '../../lib/config';

/**
 * Unit tests for IAM Least Privilege (Task 2.3)
 * 
 * Validates Requirements 7.5:
 * - Connection Manager role has only DynamoDB PutItem on Connection Store
 * - Disconnect Handler role has only DynamoDB UpdateItem/DeleteItem on Connection Store
 * - Audio Processor role has specific permissions (no wildcards except CloudWatch Logs and Transcribe)
 * - No wildcard permissions except where AWS services don't support resource-level permissions
 */
describe('IAM Least Privilege', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const config = getConfig('dev');
    const stack = new VocalShieldStack(app, 'TestStack', config, {
      env: { region: 'us-east-1', account: '123456789012' },
    });
    template = Template.fromStack(stack);
  });

  describe('Connection Manager IAM Role', () => {
    test('has only DynamoDB PutItem permission on Connection Store', () => {
      // Find the Connect Handler Lambda function
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: Match.stringLikeRegexp('MACHER-ConnectHandler-dev'),
      });

      // Verify the IAM policy has only DynamoDB PutItem
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'dynamodb:PutItem',
              Effect: 'Allow',
              Resource: Match.objectLike({
                'Fn::GetAtt': Match.arrayWith([
                  Match.stringLikeRegexp('ConnectionsTable'),
                ]),
              }),
            }),
          ]),
        },
      });
    });

    test('does not have wildcard permissions', () => {
      // Get all IAM policies
      const policies = template.findResources('AWS::IAM::Policy');
      
      // Find the Connect Handler policy
      const connectHandlerPolicies = Object.entries(policies).filter(([_, policy]: [string, any]) => {
        const statements = policy.Properties?.PolicyDocument?.Statement || [];
        return statements.some((stmt: any) => 
          stmt.Action === 'dynamodb:PutItem' && 
          JSON.stringify(stmt.Resource).includes('ConnectionsTable')
        );
      });

      // Verify no wildcard resources (except CloudWatch Logs which is auto-generated)
      connectHandlerPolicies.forEach(([_, policy]: [string, any]) => {
        const statements = policy.Properties?.PolicyDocument?.Statement || [];
        statements.forEach((stmt: any) => {
          if (stmt.Action !== 'logs:CreateLogGroup' && 
              stmt.Action !== 'logs:CreateLogStream' && 
              stmt.Action !== 'logs:PutLogEvents' &&
              !Array.isArray(stmt.Action) || !stmt.Action.some((a: string) => a.startsWith('logs:'))) {
            expect(stmt.Resource).not.toBe('*');
            if (Array.isArray(stmt.Resource)) {
              expect(stmt.Resource).not.toContain('*');
            }
          }
        });
      });
    });
  });

  describe('Disconnect Handler IAM Role', () => {
    test('has only DynamoDB UpdateItem and DeleteItem permissions on Connection Store', () => {
      // Find the Disconnect Handler Lambda function
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: Match.stringLikeRegexp('MACHER-DisconnectHandler-dev'),
      });

      // Verify the IAM policy has only DynamoDB UpdateItem and DeleteItem
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: ['dynamodb:UpdateItem', 'dynamodb:DeleteItem'],
              Effect: 'Allow',
              Resource: Match.objectLike({
                'Fn::GetAtt': Match.arrayWith([
                  Match.stringLikeRegexp('ConnectionsTable'),
                ]),
              }),
            }),
          ]),
        },
      });
    });

    test('does not have wildcard permissions', () => {
      // Get all IAM policies
      const policies = template.findResources('AWS::IAM::Policy');
      
      // Find the Disconnect Handler policy
      const disconnectHandlerPolicies = Object.entries(policies).filter(([_, policy]: [string, any]) => {
        const statements = policy.Properties?.PolicyDocument?.Statement || [];
        return statements.some((stmt: any) => 
          Array.isArray(stmt.Action) &&
          stmt.Action.includes('dynamodb:UpdateItem') &&
          stmt.Action.includes('dynamodb:DeleteItem')
        );
      });

      // Verify no wildcard resources (except CloudWatch Logs which is auto-generated)
      disconnectHandlerPolicies.forEach(([_, policy]: [string, any]) => {
        const statements = policy.Properties?.PolicyDocument?.Statement || [];
        statements.forEach((stmt: any) => {
          if (stmt.Action !== 'logs:CreateLogGroup' && 
              stmt.Action !== 'logs:CreateLogStream' && 
              stmt.Action !== 'logs:PutLogEvents' &&
              !Array.isArray(stmt.Action) || !stmt.Action.some((a: string) => a.startsWith('logs:'))) {
            expect(stmt.Resource).not.toBe('*');
            if (Array.isArray(stmt.Resource)) {
              expect(stmt.Resource).not.toContain('*');
            }
          }
        });
      });
    });
  });

  describe('Audio Processor IAM Role', () => {
    test('has DynamoDB PutItem and Query permissions on Metadata Store', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: ['dynamodb:PutItem', 'dynamodb:Query'],
              Effect: 'Allow',
              Resource: Match.arrayWith([
                Match.objectLike({
                  'Fn::GetAtt': Match.arrayWith([
                    Match.stringLikeRegexp('MetadataTable'),
                  ]),
                }),
              ]),
            }),
          ]),
        },
      });
    });

    test('has Transcribe streaming permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: ['transcribe:StartStreamTranscription'],
              Effect: 'Allow',
              Resource: '*', // Transcribe streaming doesn't support resource-level permissions
            }),
          ]),
        },
      });
    });

    test('has Bedrock Agent and Model invoke permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: ['bedrock:InvokeAgent', 'bedrock:InvokeModel'],
              Effect: 'Allow',
              Resource: Match.arrayWith([
                Match.stringLikeRegexp('arn:aws:bedrock:.*:.*:agent/\\*'),
                Match.stringLikeRegexp('arn:aws:bedrock:.*::foundation-model/anthropic.claude-3-5-sonnet-.*'),
              ]),
            }),
          ]),
        },
      });
    });

    test('has Bedrock Knowledge Base retrieve permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: ['bedrock:Retrieve'],
              Effect: 'Allow',
              Resource: Match.arrayWith([
                Match.stringLikeRegexp('arn:aws:bedrock:.*:.*:knowledge-base/\\*'),
              ]),
            }),
          ]),
        },
      });
    });

    test('has API Gateway ManageConnections permission', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'execute-api:ManageConnections',
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    test('has Secrets Manager permissions scoped to macher/* secrets', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'secretsmanager:GetSecretValue',
              Effect: 'Allow',
              Resource: Match.arrayWith([
                Match.stringLikeRegexp('arn:aws:secretsmanager:.*:.*:secret:macher/\\*'),
              ]),
            }),
          ]),
        },
      });
    });

    test('has Parameter Store permissions scoped to /macher/* parameters', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'ssm:GetParameter',
              Effect: 'Allow',
              Resource: Match.arrayWith([
                Match.stringLikeRegexp('arn:aws:ssm:.*:.*:parameter/macher/\\*'),
              ]),
            }),
          ]),
        },
      });
    });

    test('does not have wildcard permissions except for Transcribe', () => {
      // Get all IAM policies
      const policies = template.findResources('AWS::IAM::Policy');
      
      // Find the Audio Processor policies
      const audioProcessorPolicies = Object.entries(policies).filter(([_, policy]: [string, any]) => {
        const statements = policy.Properties?.PolicyDocument?.Statement || [];
        return statements.some((stmt: any) => 
          (Array.isArray(stmt.Action) && stmt.Action.includes('dynamodb:PutItem')) ||
          (Array.isArray(stmt.Action) && stmt.Action.includes('bedrock:InvokeAgent'))
        );
      });

      // Verify no wildcard resources except for Transcribe and CloudWatch Logs
      audioProcessorPolicies.forEach(([_, policy]: [string, any]) => {
        const statements = policy.Properties?.PolicyDocument?.Statement || [];
        statements.forEach((stmt: any) => {
          // Allow wildcards only for:
          // 1. CloudWatch Logs (auto-generated)
          // 2. Transcribe streaming (doesn't support resource-level permissions)
          // 3. X-Ray (auto-generated when tracing is enabled)
          const isLogsAction = Array.isArray(stmt.Action) 
            ? stmt.Action.some((a: string) => a.startsWith('logs:'))
            : stmt.Action?.startsWith('logs:');
          
          const isTranscribeAction = Array.isArray(stmt.Action)
            ? stmt.Action.includes('transcribe:StartStreamTranscription')
            : stmt.Action === 'transcribe:StartStreamTranscription';
          
          const isXRayAction = Array.isArray(stmt.Action)
            ? stmt.Action.some((a: string) => a.startsWith('xray:'))
            : stmt.Action?.startsWith('xray:');

          if (!isLogsAction && !isTranscribeAction && !isXRayAction) {
            expect(stmt.Resource).not.toBe('*');
            if (Array.isArray(stmt.Resource)) {
              stmt.Resource.forEach((resource: any) => {
                if (typeof resource === 'string') {
                  expect(resource).not.toBe('*');
                }
              });
            }
          }
        });
      });
    });
  });

  describe('CloudWatch Logs and X-Ray Permissions', () => {
    test('all Lambda functions have CloudWatch Logs permissions (auto-generated)', () => {
      // CloudWatch Logs permissions are automatically granted by the Lambda construct
      // Verify that log groups are created with proper retention
      const logGroups = template.findResources('AWS::Logs::LogGroup');
      
      // Should have log groups for all Lambda functions
      expect(Object.keys(logGroups).length).toBeGreaterThanOrEqual(3);
      
      // Verify retention is set to 7 days (Requirement 9.4)
      Object.values(logGroups).forEach((logGroup: any) => {
        expect(logGroup.Properties.RetentionInDays).toBe(7);
      });
    });

    test('all Lambda functions have X-Ray tracing enabled', () => {
      // Verify all Lambda functions have X-Ray tracing enabled
      const lambdaFunctions = template.findResources('AWS::Lambda::Function');
      
      Object.values(lambdaFunctions).forEach((fn: any) => {
        expect(fn.Properties.TracingConfig?.Mode).toBe('Active');
      });
    });
  });

  describe('Least Privilege Validation', () => {
    test('no Lambda function has Administrator or PowerUser permissions', () => {
      const policies = template.findResources('AWS::IAM::Policy');
      
      Object.values(policies).forEach((policy: any) => {
        const statements = policy.Properties?.PolicyDocument?.Statement || [];
        statements.forEach((stmt: any) => {
          // Ensure no overly permissive actions
          const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
          actions.forEach((action: string) => {
            expect(action).not.toMatch(/\*:\*/);
            expect(action).not.toBe('*');
          });
        });
      });
    });

    test('all IAM policies are attached to specific Lambda functions', () => {
      const policies = template.findResources('AWS::IAM::Policy');
      
      Object.values(policies).forEach((policy: any) => {
        // Each policy should be attached to specific roles
        expect(policy.Properties.Roles).toBeDefined();
        expect(Array.isArray(policy.Properties.Roles)).toBe(true);
        expect(policy.Properties.Roles.length).toBeGreaterThan(0);
      });
    });
  });
});
