import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { SecretsManagerConstruct } from '../../lib/constructs/secrets-manager';

describe('SecretsManagerConstruct', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
    
    new SecretsManagerConstruct(stack, 'TestSecretsManager', {
      environment: 'dev',
    });
    
    template = Template.fromStack(stack);
  });

  describe('Secret Creation', () => {
    test('creates API keys secret with correct name', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'vocalshield/api-keys',
        Description: 'API keys for VocalShield external service integrations',
      });
    });

    test('creates config secret with correct name', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'vocalshield/config',
        Description: 'Sensitive configuration for VocalShield',
      });
    });

    test('creates exactly two secrets', () => {
      template.resourceCountIs('AWS::SecretsManager::Secret', 2);
    });
  });

  describe('Secret Content', () => {
    test('API keys secret has correct structure', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'vocalshield/api-keys',
        GenerateSecretString: {
          SecretStringTemplate: JSON.stringify({
            mlServiceApiKey: 'PLACEHOLDER_ML_API_KEY',
            thirdPartyIntegrationKey: 'PLACEHOLDER_INTEGRATION_KEY',
          }),
          GenerateStringKey: 'placeholder',
        },
      });
    });

    test('config secret has correct structure', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'vocalshield/config',
        GenerateSecretString: {
          SecretStringTemplate: JSON.stringify({
            fraudThreshold: 70,
            processingTimeout: 3000,
          }),
          GenerateStringKey: 'placeholder',
        },
      });
    });
  });

  describe('Encryption', () => {
    test('secrets use AWS managed KMS encryption by default', () => {
      // AWS Secrets Manager uses AWS managed keys by default
      // If KmsKeyId is not specified, AWS managed key is used
      const secrets = template.findResources('AWS::SecretsManager::Secret');
      
      Object.values(secrets).forEach((secret: any) => {
        // Verify KmsKeyId is not set (meaning AWS managed key is used)
        expect(secret.Properties.KmsKeyId).toBeUndefined();
      });
    });
  });

  describe('Resource Tagging', () => {
    test('API keys secret has all required tags', () => {
      const secrets = template.findResources('AWS::SecretsManager::Secret', {
        Properties: {
          Name: 'vocalshield/api-keys',
        },
      });
      
      const secretKeys = Object.keys(secrets);
      expect(secretKeys.length).toBe(1);
      
      const secret = secrets[secretKeys[0]];
      const tags = secret.Properties.Tags;
      
      expect(tags).toContainEqual({ Key: 'Project', Value: 'VocalShield' });
      expect(tags).toContainEqual({ Key: 'Environment', Value: 'dev' });
      expect(tags).toContainEqual({ Key: 'ManagedBy', Value: 'CDK' });
      expect(tags).toContainEqual({ Key: 'CostCenter', Value: 'VocalShield-Infrastructure' });
    });

    test('config secret has all required tags', () => {
      const secrets = template.findResources('AWS::SecretsManager::Secret', {
        Properties: {
          Name: 'vocalshield/config',
        },
      });
      
      const secretKeys = Object.keys(secrets);
      expect(secretKeys.length).toBe(1);
      
      const secret = secrets[secretKeys[0]];
      const tags = secret.Properties.Tags;
      
      expect(tags).toContainEqual({ Key: 'Project', Value: 'VocalShield' });
      expect(tags).toContainEqual({ Key: 'Environment', Value: 'dev' });
      expect(tags).toContainEqual({ Key: 'ManagedBy', Value: 'CDK' });
      expect(tags).toContainEqual({ Key: 'CostCenter', Value: 'VocalShield-Infrastructure' });
    });
  });

  describe('IAM Access Methods', () => {
    test('grantApiKeysRead method exists and is callable', () => {
      const construct = new SecretsManagerConstruct(stack, 'TestConstruct', {
        environment: 'dev',
      });
      
      expect(construct.grantApiKeysRead).toBeDefined();
      expect(typeof construct.grantApiKeysRead).toBe('function');
    });

    test('grantConfigRead method exists and is callable', () => {
      const construct = new SecretsManagerConstruct(stack, 'TestConstruct', {
        environment: 'dev',
      });
      
      expect(construct.grantConfigRead).toBeDefined();
      expect(typeof construct.grantConfigRead).toBe('function');
    });

    test('grantAllSecretsRead method exists and is callable', () => {
      const construct = new SecretsManagerConstruct(stack, 'TestConstruct', {
        environment: 'dev',
      });
      
      expect(construct.grantAllSecretsRead).toBeDefined();
      expect(typeof construct.grantAllSecretsRead).toBe('function');
    });
  });

  describe('Public Properties', () => {
    test('exposes apiKeysSecret property', () => {
      const construct = new SecretsManagerConstruct(stack, 'TestConstruct', {
        environment: 'dev',
      });
      
      expect(construct.apiKeysSecret).toBeDefined();
    });

    test('exposes configSecret property', () => {
      const construct = new SecretsManagerConstruct(stack, 'TestConstruct', {
        environment: 'dev',
      });
      
      expect(construct.configSecret).toBeDefined();
    });
  });
});
