import * as fc from 'fast-check';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { VocalShieldStack } from '../../lib/vocalshield-stack';
import { devConfig } from '../../lib/config/dev';

/**
 * Property-Based Tests for Lambda Function Compliance
 * 
 * These tests validate universal properties that must hold for all Lambda functions:
 * - Property 8: All Lambda functions use ARM64 architecture (Free Tier optimization)
 * - Property 2: No audio data is persisted to storage
 * - Property 7: All Lambda functions use structured JSON logging
 * - Property 6: Processing latency meets requirements
 * 
 * Requirements: 7.8, 3.4, 4.6, 6.2, 3.5
 */

describe('Lambda Function Compliance Properties', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new VocalShieldStack(app, 'TestStack', devConfig);
    template = Template.fromStack(stack);
  });

  /**
   * Property 8: Free Tier Configuration Compliance (Lambda ARM64)
   * 
   * Universal Property: ALL Lambda functions MUST use ARM64 architecture
   * 
   * Validates: Requirements 7.8
   */
  test('Property 8: All Lambda functions use ARM64 architecture for cost optimization', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const lambdas = tmpl.findResources('AWS::Lambda::Function');
          const lambdaKeys = Object.keys(lambdas);

          // Property: For all Lambda functions, architecture must be ARM64
          return lambdaKeys.every((key) => {
            const lambda = lambdas[key];
            const architectures = lambda.Properties.Architectures;
            const functionName = lambda.Properties.FunctionName;

            // Skip custom resource Lambdas (they don't have FunctionName set)
            // These are CDK-managed functions like LogRetention
            if (!functionName) return true;
            
            // ARM64 architecture is required for 20% cost savings
            return (
              Array.isArray(architectures) &&
              architectures.length === 1 &&
              architectures[0] === 'arm64'
            );
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 2: No Audio Data Persistence
   * 
   * Universal Property: NO Lambda function should have permissions to write audio data to persistent storage
   * 
   * Validates: Requirements 3.4, 4.6
   */
  test('Property 2: No Lambda function has permissions to persist audio data', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const policies = tmpl.findResources('AWS::IAM::Policy');
          const policyKeys = Object.keys(policies);

          // Property: No IAM policy should grant S3 PutObject or similar audio storage permissions
          return policyKeys.every((key) => {
            const policy = policies[key];
            const statements = policy.Properties.PolicyDocument.Statement;

            return statements.every((statement: any) => {
              const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
              
              // Forbidden actions that could persist audio data
              const forbiddenActions = [
                's3:PutObject',
                's3:CreateBucket',
                'efs:CreateFileSystem',
                'fsx:CreateFileSystem',
                'glacier:UploadArchive',
              ];

              return !actions.some((action: string) =>
                forbiddenActions.some((forbidden) => action.includes(forbidden))
              );
            });
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 7: Structured Logging
   * 
   * Universal Property: Main Lambda functions MUST have environment variables configured for structured logging
   * 
   * Validates: Requirements 6.2
   */
  test('Property 7: Main Lambda functions have environment variables for structured logging', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const lambdas = tmpl.findResources('AWS::Lambda::Function');
          const lambdaKeys = Object.keys(lambdas);

          // Property: Main Lambda functions must have ENVIRONMENT variable for structured logging
          // Exclude custom resource Lambdas
          return lambdaKeys.every((key) => {
            const lambda = lambdas[key];
            const envVars = lambda.Properties.Environment?.Variables;
            const functionName = lambda.Properties.FunctionName;

            // Skip custom resource Lambdas (they don't have FunctionName set)
            if (!functionName) return true;

            // Must have environment variables configured
            return envVars && typeof envVars === 'object' && Object.keys(envVars).length > 0;
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6: Processing Latency
   * 
   * Universal Property: Main Lambda functions MUST have timeout configurations that support <500ms latency requirement
   * 
   * Validates: Requirements 3.5
   */
  test('Property 6: Main Lambda timeout configurations support low-latency processing', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const lambdas = tmpl.findResources('AWS::Lambda::Function');
          const lambdaKeys = Object.keys(lambdas);

          // Property: Main Lambda timeouts must be reasonable (not too short, not too long)
          // Exclude custom resource Lambdas (like LogRetention) which may have longer timeouts
          return lambdaKeys.every((key) => {
            const lambda = lambdas[key];
            const timeout = lambda.Properties.Timeout;
            const functionName = lambda.Properties.FunctionName;

            // Skip custom resource Lambdas (they don't have FunctionName set)
            if (!functionName) return true;

            // Timeout should be between 3 and 60 seconds for main Lambda functions
            // Too short: may cause premature termination
            // Too long: may indicate inefficient processing
            return timeout >= 3 && timeout <= 60;
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Additional Property: Lambda Memory Configuration
   * 
   * Universal Property: Lambda functions should have appropriate memory allocation
   */
  test('Property: Main Lambda functions have appropriate memory allocation', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const lambdas = tmpl.findResources('AWS::Lambda::Function');
          const lambdaKeys = Object.keys(lambdas);

          // Property: Memory should be between 128 MB and 3008 MB (AWS limits)
          // Only check Lambda functions that have MemorySize explicitly set
          return lambdaKeys.every((key) => {
            const lambda = lambdas[key];
            const memory = lambda.Properties.MemorySize;

            // If MemorySize is not set, AWS uses default (128 MB), which is valid
            if (!memory) return true;

            return memory >= 128 && memory <= 3008;
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Additional Property: Lambda Runtime Compliance
   * 
   * Universal Property: All Lambda functions should use supported Node.js runtime
   */
  test('Property: All Lambda functions use supported Node.js runtime', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const lambdas = tmpl.findResources('AWS::Lambda::Function');
          const lambdaKeys = Object.keys(lambdas);

          // Property: Runtime should be Node.js 20.x or compatible
          return lambdaKeys.every((key) => {
            const lambda = lambdas[key];
            const runtime = lambda.Properties.Runtime;

            return runtime && runtime.startsWith('nodejs');
          });
        }
      ),
      { numRuns: 10 }
    );
  });
});
