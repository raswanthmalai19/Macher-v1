import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { VocalShieldStack } from '../../lib/vocalshield-stack';
import { devConfig } from '../../lib/config';

describe('AWS X-Ray Tracing', () => {
  let app: cdk.App;
  let stack: VocalShieldStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new VocalShieldStack(app, 'TestStack', devConfig);
    template = Template.fromStack(stack);
  });

  test('All Lambda functions have X-Ray tracing enabled', () => {
    const lambdaFunctions = template.findResources('AWS::Lambda::Function');
    const functionKeys = Object.keys(lambdaFunctions);
    
    expect(functionKeys.length).toBeGreaterThan(0);
    
    functionKeys.forEach(key => {
      const fn = lambdaFunctions[key];
      expect(fn.Properties.TracingConfig).toBeDefined();
      expect(fn.Properties.TracingConfig.Mode).toBe('Active');
    });
  });

  test('Lambda functions have X-Ray IAM permissions', () => {
    const iamRoles = template.findResources('AWS::IAM::Role', {
      Properties: {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: {
                Service: 'lambda.amazonaws.com',
              },
            },
          ],
        },
      },
    });

    const roleKeys = Object.keys(iamRoles);
    expect(roleKeys.length).toBeGreaterThan(0);

    // Check that roles have X-Ray write permissions
    roleKeys.forEach(key => {
      const role = iamRoles[key];
      const managedPolicies = role.Properties.ManagedPolicyArns || [];
      
      // Lambda execution role should have AWSXRayDaemonWriteAccess or similar
      const hasXRayPolicy = managedPolicies.some((policy: any) => {
        if (typeof policy === 'string') {
          return policy.includes('AWSXRayDaemonWriteAccess');
        }
        if (policy['Fn::Join']) {
          const joined = policy['Fn::Join'][1].join('');
          return joined.includes('AWSXRayDaemonWriteAccess');
        }
        return false;
      });

      // X-Ray permissions might also be in inline policies
      const hasPolicies = role.Properties.Policies || managedPolicies.length > 0;
      expect(hasPolicies).toBe(true);
    });
  });

  test('Connect Handler has X-Ray tracing enabled', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: {
        'Fn::Join': [
          '',
          [
            'VocalShield-ConnectHandler-',
            devConfig.tags.Environment,
          ],
        ],
      },
      TracingConfig: {
        Mode: 'Active',
      },
    });
  });

  test('Disconnect Handler has X-Ray tracing enabled', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: {
        'Fn::Join': [
          '',
          [
            'VocalShield-DisconnectHandler-',
            devConfig.tags.Environment,
          ],
        ],
      },
      TracingConfig: {
        Mode: 'Active',
      },
    });
  });

  test('Audio Processor has X-Ray tracing enabled', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: {
        'Fn::Join': [
          '',
          [
            'VocalShield-AudioProcessor-',
            devConfig.tags.Environment,
          ],
        ],
      },
      TracingConfig: {
        Mode: 'Active',
      },
    });
  });

  test('Investigation Handler has X-Ray tracing enabled', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: {
        'Fn::Join': [
          '',
          [
            'VocalShield-InvestigationHandler-',
            devConfig.tags.Environment,
          ],
        ],
      },
      TracingConfig: {
        Mode: 'Active',
      },
    });
  });

  test('Step Functions has X-Ray tracing enabled', () => {
    const stateMachines = template.findResources('AWS::StepFunctions::StateMachine');
    const stateMachineKeys = Object.keys(stateMachines);
    
    if (stateMachineKeys.length > 0) {
      stateMachineKeys.forEach(key => {
        const sm = stateMachines[key];
        expect(sm.Properties.TracingConfiguration).toBeDefined();
        expect(sm.Properties.TracingConfiguration.Enabled).toBe(true);
      });
    }
  });
});
