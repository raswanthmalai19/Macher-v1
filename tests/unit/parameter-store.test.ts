import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ParameterStoreConstruct } from '../../lib/constructs/parameter-store';

describe('ParameterStoreConstruct', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
    
    new ParameterStoreConstruct(stack, 'TestParameterStore', {
      environment: 'dev',
    });
    
    template = Template.fromStack(stack);
  });

  describe('Parameter Creation', () => {
    test('creates fraud threshold parameter with correct name and value', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/vocalshield/dev/audio-processor/fraud-threshold',
        Description: 'Fraud detection threshold score (0-100). Scores above this trigger alerts.',
        Value: '70',
        Type: 'String',
        Tier: 'Standard',
      });
    });

    test('creates max processing time parameter with correct name and value', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/vocalshield/dev/audio-processor/max-processing-time',
        Description: 'Maximum audio processing time in milliseconds',
        Value: '3000',
        Type: 'String',
        Tier: 'Standard',
      });
    });

    test('creates notifications enabled parameter with correct name and value', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/vocalshield/dev/notifications/enabled',
        Description: 'Whether Family Loop notifications are enabled',
        Value: 'true',
        Type: 'String',
        Tier: 'Standard',
      });
    });

    test('creates wavelength enabled parameter with correct name and value', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/vocalshield/dev/features/wavelength-enabled',
        Description: 'Whether AWS Wavelength Zone integration is enabled',
        Value: 'false',
        Type: 'String',
        Tier: 'Standard',
      });
    });

    test('creates exactly four parameters', () => {
      template.resourceCountIs('AWS::SSM::Parameter', 4);
    });
  });

  describe('Hierarchical Structure', () => {
    test('all parameters follow hierarchical naming pattern', () => {
      const parameters = template.findResources('AWS::SSM::Parameter');
      const parameterNames = Object.values(parameters).map((param: any) => param.Properties.Name);
      
      // All parameters should start with /vocalshield/dev/
      parameterNames.forEach(name => {
        expect(name).toMatch(/^\/vocalshield\/dev\//);
      });
    });

    test('parameters are organized by component', () => {
      const parameters = template.findResources('AWS::SSM::Parameter');
      const parameterNames = Object.values(parameters).map((param: any) => param.Properties.Name);
      
      // Check audio-processor component
      const audioProcessorParams = parameterNames.filter(name => 
        name.includes('/audio-processor/')
      );
      expect(audioProcessorParams.length).toBe(2);
      
      // Check notifications component
      const notificationParams = parameterNames.filter(name => 
        name.includes('/notifications/')
      );
      expect(notificationParams.length).toBe(1);
      
      // Check features component
      const featureParams = parameterNames.filter(name => 
        name.includes('/features/')
      );
      expect(featureParams.length).toBe(1);
    });
  });

  describe('Parameter Tier', () => {
    test('all parameters use Standard tier (free)', () => {
      const parameters = template.findResources('AWS::SSM::Parameter');
      
      Object.values(parameters).forEach((param: any) => {
        expect(param.Properties.Tier).toBe('Standard');
      });
    });
  });

  describe('Resource Tagging', () => {
    test('fraud threshold parameter has all required tags', () => {
      const parameters = template.findResources('AWS::SSM::Parameter', {
        Properties: {
          Name: '/vocalshield/dev/audio-processor/fraud-threshold',
        },
      });
      
      const paramKeys = Object.keys(parameters);
      expect(paramKeys.length).toBe(1);
      
      const parameter = parameters[paramKeys[0]];
      const tags = parameter.Properties.Tags;
      
      // CDK tags are stored as an object, not an array
      expect(tags.Project).toBe('VocalShield');
      expect(tags.Environment).toBe('dev');
      expect(tags.ManagedBy).toBe('CDK');
      expect(tags.CostCenter).toBe('VocalShield-Infrastructure');
    });

    test('all parameters have required tags', () => {
      const parameters = template.findResources('AWS::SSM::Parameter');
      
      Object.values(parameters).forEach((param: any) => {
        const tags = param.Properties.Tags;
        
        expect(tags.Project).toBe('VocalShield');
        expect(tags.Environment).toBe('dev');
        expect(tags.ManagedBy).toBe('CDK');
        expect(tags.CostCenter).toBe('VocalShield-Infrastructure');
      });
    });
  });

  describe('Environment-Specific Configuration', () => {
    test('parameters include environment in path for staging', () => {
      const stagingApp = new cdk.App();
      const stagingStack = new cdk.Stack(stagingApp, 'StagingStack');
      new ParameterStoreConstruct(stagingStack, 'StagingParameterStore', {
        environment: 'staging',
      });
      
      const stagingTemplate = Template.fromStack(stagingStack);
      const parameters = stagingTemplate.findResources('AWS::SSM::Parameter');
      const parameterNames = Object.values(parameters).map((param: any) => param.Properties.Name);
      
      parameterNames.forEach(name => {
        expect(name).toMatch(/^\/vocalshield\/staging\//);
      });
    });

    test('parameters include environment in path for production', () => {
      const prodApp = new cdk.App();
      const prodStack = new cdk.Stack(prodApp, 'ProductionStack');
      new ParameterStoreConstruct(prodStack, 'ProductionParameterStore', {
        environment: 'production',
      });
      
      const prodTemplate = Template.fromStack(prodStack);
      const parameters = prodTemplate.findResources('AWS::SSM::Parameter');
      const parameterNames = Object.values(parameters).map((param: any) => param.Properties.Name);
      
      parameterNames.forEach(name => {
        expect(name).toMatch(/^\/vocalshield\/production\//);
      });
    });
  });

  describe('Public Properties', () => {
    test('exposes fraudThresholdParameter property', () => {
      const construct = new ParameterStoreConstruct(stack, 'TestConstruct', {
        environment: 'dev',
      });
      
      expect(construct.fraudThresholdParameter).toBeDefined();
      // Parameter names are CDK tokens that resolve at synthesis time
      expect(construct.fraudThresholdParameter.parameterName).toContain('Token');
    });

    test('exposes maxProcessingTimeParameter property', () => {
      const construct = new ParameterStoreConstruct(stack, 'TestConstruct', {
        environment: 'dev',
      });
      
      expect(construct.maxProcessingTimeParameter).toBeDefined();
      expect(construct.maxProcessingTimeParameter.parameterName).toContain('Token');
    });

    test('exposes notificationsEnabledParameter property', () => {
      const construct = new ParameterStoreConstruct(stack, 'TestConstruct', {
        environment: 'dev',
      });
      
      expect(construct.notificationsEnabledParameter).toBeDefined();
      expect(construct.notificationsEnabledParameter.parameterName).toContain('Token');
    });

    test('exposes wavelengthEnabledParameter property', () => {
      const construct = new ParameterStoreConstruct(stack, 'TestConstruct', {
        environment: 'dev',
      });
      
      expect(construct.wavelengthEnabledParameter).toBeDefined();
      expect(construct.wavelengthEnabledParameter.parameterName).toContain('Token');
    });

    test('exposes parameters map with all parameters', () => {
      const construct = new ParameterStoreConstruct(stack, 'TestConstruct', {
        environment: 'dev',
      });
      
      expect(construct.parameters).toBeDefined();
      expect(construct.parameters.size).toBe(4);
      expect(construct.parameters.has('fraudThreshold')).toBe(true);
      expect(construct.parameters.has('maxProcessingTime')).toBe(true);
      expect(construct.parameters.has('notificationsEnabled')).toBe(true);
      expect(construct.parameters.has('wavelengthEnabled')).toBe(true);
    });
  });

  describe('IAM Access Methods', () => {
    test('grantRead method exists and is callable', () => {
      const construct = new ParameterStoreConstruct(stack, 'TestConstruct', {
        environment: 'dev',
      });
      
      expect(construct.grantRead).toBeDefined();
      expect(typeof construct.grantRead).toBe('function');
    });

    test('grantReadParameter method exists and is callable', () => {
      const construct = new ParameterStoreConstruct(stack, 'TestConstruct', {
        environment: 'dev',
      });
      
      expect(construct.grantReadParameter).toBeDefined();
      expect(typeof construct.grantReadParameter).toBe('function');
    });

    test('grantReadParameter throws error for non-existent parameter', () => {
      const construct = new ParameterStoreConstruct(stack, 'TestConstruct', {
        environment: 'dev',
      });
      
      const mockGrantee = { grantPrincipal: {} } as any;
      
      expect(() => {
        construct.grantReadParameter(mockGrantee, 'nonExistentParameter');
      }).toThrow('Parameter nonExistentParameter not found');
    });
  });

  describe('Helper Methods', () => {
    test('getParameterArn returns correct ARN', () => {
      const construct = new ParameterStoreConstruct(stack, 'TestConstruct', {
        environment: 'dev',
      });
      
      const arn = construct.getParameterArn('fraudThreshold');
      expect(arn).toBeDefined();
      expect(typeof arn).toBe('string');
    });

    test('getParameterArn throws error for non-existent parameter', () => {
      const construct = new ParameterStoreConstruct(stack, 'TestConstruct', {
        environment: 'dev',
      });
      
      expect(() => {
        construct.getParameterArn('nonExistentParameter');
      }).toThrow('Parameter nonExistentParameter not found');
    });

    test('getParameterName returns correct parameter name', () => {
      const construct = new ParameterStoreConstruct(stack, 'TestConstruct', {
        environment: 'dev',
      });
      
      const name = construct.getParameterName('fraudThreshold');
      expect(name).toBeDefined();
      // Parameter names are CDK tokens that resolve at synthesis time
      expect(name).toContain('Token');
    });

    test('getParameterName throws error for non-existent parameter', () => {
      const construct = new ParameterStoreConstruct(stack, 'TestConstruct', {
        environment: 'dev',
      });
      
      expect(() => {
        construct.getParameterName('nonExistentParameter');
      }).toThrow('Parameter nonExistentParameter not found');
    });
  });

  describe('Default Values', () => {
    test('fraud threshold defaults to 70', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/vocalshield/dev/audio-processor/fraud-threshold',
        Value: '70',
      });
    });

    test('max processing time defaults to 3000ms', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/vocalshield/dev/audio-processor/max-processing-time',
        Value: '3000',
      });
    });

    test('notifications enabled defaults to true', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/vocalshield/dev/notifications/enabled',
        Value: 'true',
      });
    });

    test('wavelength enabled defaults to false', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/vocalshield/dev/features/wavelength-enabled',
        Value: 'false',
      });
    });
  });
});
