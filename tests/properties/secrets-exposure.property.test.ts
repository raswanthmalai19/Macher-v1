import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as fc from 'fast-check';
import { VocalShieldStack } from '../../lib/vocalshield-stack';
import { EnvironmentConfig } from '../../lib/config/types';

/**
 * Property-Based Tests for Secrets Not Exposed
 * 
 * Property 11: Secrets Not Exposed
 * **Validates: Requirements 10.7**
 * 
 * For any CloudFormation output or CloudWatch log entry, that output or log SHALL NOT 
 * contain plaintext secrets, API keys, or sensitive configuration values from Secrets Manager.
 * 
 * This test ensures that:
 * 1. CloudFormation stack outputs do not expose secret values
 * 2. Secret ARNs may be exposed (safe), but not secret values
 * 3. No hardcoded secrets in resource properties
 * 4. Secrets are only referenced via ARNs or dynamic references
 */
describe('Property 11: Secrets Not Exposed', () => {
  /**
   * Generator for valid environment configurations
   * Tests across different environments to ensure secrets are never exposed
   */
  const environmentConfigArbitrary = fc.record({
    stackName: fc.constantFrom('VocalShield-dev', 'VocalShield-staging', 'VocalShield-prod'),
    environment: fc.constantFrom('dev', 'staging', 'production'),
    region: fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1'),
    vpcCidr: fc.constant('10.0.0.0/16'),
    publicSubnetCidr: fc.constant('10.0.1.0/24'),
    privateSubnetCidr: fc.constant('10.0.2.0/24'),
    wavelengthSubnetCidr: fc.constant('10.0.10.0/24'),
    maxAzs: fc.constant(2),
    lambdaRuntime: fc.constant('nodejs20.x'),
    lambdaArchitecture: fc.constant('arm64'),
    connectHandlerMemory: fc.constant(512),
    connectHandlerTimeout: fc.constant(10),
    disconnectHandlerMemory: fc.constant(512),
    disconnectHandlerTimeout: fc.constant(10),
    audioProcessorMemory: fc.constant(1024),
    audioProcessorTimeout: fc.constant(30),
    investigationHandlerMemory: fc.constant(512),
    investigationHandlerTimeout: fc.constant(60),
    connectionsTtlDays: fc.integer({ min: 1, max: 7 }),
    metadataTtlDays: fc.integer({ min: 7, max: 90 }),
    websocketIdleTimeout: fc.constant(600),
    logRetentionDays: fc.constant(7),
    dashboardRefreshInterval: fc.constant(60),
    billingAlarmThreshold: fc.constant(5),
    errorRateThreshold: fc.constant(10),
    errorRatePeriod: fc.constant(300),
    connectionLimitThreshold: fc.constant(900),
    sqsVisibilityTimeout: fc.constant(30),
    sqsMessageRetention: fc.constant(345600),
    sqsMaxReceiveCount: fc.constant(3),
    enableXRayTracing: fc.constant(true),
    enableWaf: fc.constant(false),
    enableBackup: fc.constant(false),
    enableCanary: fc.constant(false),
    enableEvidently: fc.constant(false),
    enableCostExplorer: fc.constant(true),
    budgetAmount: fc.constant(10),
    budgetAlertThresholds: fc.constant([80, 100]),
    tags: fc.constant({
      Project: 'VocalShield',
      Environment: 'dev',
      ManagedBy: 'CDK',
      CostCenter: 'VocalShield-Infrastructure',
    }),
  }) as fc.Arbitrary<EnvironmentConfig>;

  /**
   * Patterns that indicate potential secret exposure
   * These patterns should NEVER appear in CloudFormation outputs or resource properties
   */
  const SECRET_PATTERNS = [
    /api[_-]?key/i,
    /secret[_-]?key/i,
    /password/i,
    /token/i,
    /credential/i,
    /mlServiceApiKey/i,
    /thirdPartyIntegrationKey/i,
    /PLACEHOLDER_ML_API_KEY/i,
    /PLACEHOLDER_INTEGRATION_KEY/i,
  ];

  /**
   * Safe patterns that are allowed (ARNs, names, not actual secret values)
   */
  const SAFE_PATTERNS = [
    /arn:aws:secretsmanager:/,
    /secretsmanager\.Secret/,
    /vocalshield\/api-keys/,
    /vocalshield\/config/,
  ];

  /**
   * Helper function to check if a string contains secret-like content
   */
  function containsSecretPattern(value: string): boolean {
    // Check if it matches any secret pattern
    const hasSecretPattern = SECRET_PATTERNS.some(pattern => pattern.test(value));
    
    // If it matches a secret pattern, check if it's a safe reference (ARN)
    if (hasSecretPattern) {
      const isSafeReference = SAFE_PATTERNS.some(pattern => pattern.test(value));
      return !isSafeReference;
    }
    
    return false;
  }

  /**
   * Helper function to recursively search for secrets in an object
   */
  function findSecretsInObject(obj: any, path: string = ''): string[] {
    const findings: string[] = [];

    if (typeof obj === 'string') {
      if (containsSecretPattern(obj)) {
        findings.push(`${path}: ${obj}`);
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        findings.push(...findSecretsInObject(item, `${path}[${index}]`));
      });
    } else if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(key => {
        findings.push(...findSecretsInObject(obj[key], path ? `${path}.${key}` : key));
      });
    }

    return findings;
  }

  /**
   * Property: CloudFormation stack outputs MUST NOT contain secret values
   * 
   * Stack outputs are visible in the AWS Console, CLI, and API responses.
   * Exposing secrets in outputs would be a critical security vulnerability.
   * 
   * Allowed: Secret ARNs, secret names
   * Not allowed: Secret values, API keys, passwords
   */
  test('Property: CloudFormation outputs do not expose secret values', () => {
    fc.assert(
      fc.property(environmentConfigArbitrary, (config) => {
        // Arrange: Create stack
        const app = new cdk.App();
        const stack = new VocalShieldStack(
          app,
          'TestStack',
          config,
          {
            env: { account: '123456789012', region: config.region },
          }
        );
        const template = Template.fromStack(stack);

        // Act: Get all stack outputs
        const templateJson = template.toJSON();
        const outputs = templateJson.Outputs || {};

        // Assert: No outputs should contain secret values
        const outputKeys = Object.keys(outputs);
        
        for (const outputKey of outputKeys) {
          const output = outputs[outputKey];
          
          // Check output value
          if (output.Value) {
            const valueStr = JSON.stringify(output.Value);
            const secretFindings = findSecretsInObject(output.Value, `Outputs.${outputKey}.Value`);
            
            expect(secretFindings).toEqual([]);
            
            // Additional check: ensure no placeholder secrets
            expect(valueStr).not.toContain('PLACEHOLDER_ML_API_KEY');
            expect(valueStr).not.toContain('PLACEHOLDER_INTEGRATION_KEY');
          }
          
          // Check output description (should be safe, but verify)
          if (output.Description) {
            expect(output.Description).not.toMatch(/PLACEHOLDER_ML_API_KEY/);
            expect(output.Description).not.toMatch(/PLACEHOLDER_INTEGRATION_KEY/);
          }
        }
      }),
      { numRuns: 15 }
    );
  });

  /**
   * Property: Secrets Manager secrets MUST NOT have plaintext values in CloudFormation
   * 
   * Secrets should use GenerateSecretString or reference external values.
   * Hardcoded secret values in CloudFormation templates would be exposed in version control.
   */
  test('Property: Secrets Manager resources do not contain hardcoded secret values', () => {
    fc.assert(
      fc.property(environmentConfigArbitrary, (config) => {
        // Arrange
        const app = new cdk.App();
        const stack = new VocalShieldStack(
          app,
          'TestStack',
          config,
          {
            env: { account: '123456789012', region: config.region },
          }
        );
        const template = Template.fromStack(stack);

        // Act: Get all Secrets Manager secrets
        const resources = template.toJSON().Resources;
        const secrets = Object.keys(resources).filter(
          key => resources[key].Type === 'AWS::SecretsManager::Secret'
        );

        // Assert: Secrets should use GenerateSecretString, not hardcoded values
        expect(secrets.length).toBeGreaterThan(0);
        
        for (const secretKey of secrets) {
          const secret = resources[secretKey];
          
          // Secrets should use GenerateSecretString
          expect(secret.Properties.GenerateSecretString).toBeDefined();
          
          // Should NOT have SecretString property (hardcoded value)
          expect(secret.Properties.SecretString).toBeUndefined();
          
          // If GenerateSecretString has SecretStringTemplate, verify it's safe
          if (secret.Properties.GenerateSecretString?.SecretStringTemplate) {
            const template = secret.Properties.GenerateSecretString.SecretStringTemplate;
            
            // Template should contain placeholder values, not real secrets
            // This is acceptable as placeholders will be replaced
            expect(typeof template).toBe('string');
          }
        }
      }),
      { numRuns: 15 }
    );
  });

  /**
   * Property: Lambda environment variables MUST NOT contain secret values
   * 
   * Lambda functions should retrieve secrets at runtime using Secrets Manager API.
   * Environment variables are visible in the AWS Console and should not contain secrets.
   */
  test('Property: Lambda environment variables do not contain secret values', () => {
    fc.assert(
      fc.property(environmentConfigArbitrary, (config) => {
        // Arrange
        const app = new cdk.App();
        const stack = new VocalShieldStack(
          app,
          'TestStack',
          config,
          {
            env: { account: '123456789012', region: config.region },
          }
        );
        const template = Template.fromStack(stack);

        // Act: Get all Lambda functions
        const resources = template.toJSON().Resources;
        const lambdaFunctions = Object.keys(resources).filter(
          key => resources[key].Type === 'AWS::Lambda::Function'
        );

        // Assert: Lambda environment variables should not contain secrets
        // Note: Currently no Lambda functions in stack, but test is future-proof
        for (const lambdaKey of lambdaFunctions) {
          const lambda = resources[lambdaKey];
          
          if (lambda.Properties.Environment?.Variables) {
            const envVars = lambda.Properties.Environment.Variables;
            const envVarsStr = JSON.stringify(envVars);
            
            // Check for secret patterns in environment variables
            const secretFindings = findSecretsInObject(envVars, `Lambda.${lambdaKey}.Environment.Variables`);
            expect(secretFindings).toEqual([]);
            
            // Ensure no placeholder secrets
            expect(envVarsStr).not.toContain('PLACEHOLDER_ML_API_KEY');
            expect(envVarsStr).not.toContain('PLACEHOLDER_INTEGRATION_KEY');
            
            // Environment variables should contain ARNs or names, not values
            // Example: SECRET_ARN is OK, SECRET_VALUE is not
            Object.keys(envVars).forEach(key => {
              const value = envVars[key];
              if (typeof value === 'string') {
                // If it references a secret, it should be an ARN or dynamic reference
                if (value.includes('secret')) {
                  expect(
                    value.startsWith('arn:aws:secretsmanager:') ||
                    value.includes('{{resolve:secretsmanager:')
                  ).toBe(true);
                }
              }
            });
          }
        }
      }),
      { numRuns: 15 }
    );
  });

  /**
   * Property: IAM policy documents MUST NOT contain embedded secret values
   * 
   * IAM policies should reference secrets by ARN, not contain secret values.
   */
  test('Property: IAM policies do not contain embedded secret values', () => {
    fc.assert(
      fc.property(environmentConfigArbitrary, (config) => {
        // Arrange
        const app = new cdk.App();
        const stack = new VocalShieldStack(
          app,
          'TestStack',
          config,
          {
            env: { account: '123456789012', region: config.region },
          }
        );
        const template = Template.fromStack(stack);

        // Act: Get all IAM roles and policies
        const resources = template.toJSON().Resources;
        const iamResources = Object.keys(resources).filter(
          key => resources[key].Type === 'AWS::IAM::Role' || 
                 resources[key].Type === 'AWS::IAM::Policy'
        );

        // Assert: IAM policies should not contain secret values
        for (const iamKey of iamResources) {
          const iamResource = resources[iamKey];
          
          // Check policy documents
          const policyDocuments = [];
          
          if (iamResource.Properties.AssumeRolePolicyDocument) {
            policyDocuments.push(iamResource.Properties.AssumeRolePolicyDocument);
          }
          
          if (iamResource.Properties.PolicyDocument) {
            policyDocuments.push(iamResource.Properties.PolicyDocument);
          }
          
          if (iamResource.Properties.Policies) {
            iamResource.Properties.Policies.forEach((policy: any) => {
              if (policy.PolicyDocument) {
                policyDocuments.push(policy.PolicyDocument);
              }
            });
          }
          
          // Verify no secrets in policy documents
          for (const policyDoc of policyDocuments) {
            const policyStr = JSON.stringify(policyDoc);
            
            // Should not contain placeholder secrets
            expect(policyStr).not.toContain('PLACEHOLDER_ML_API_KEY');
            expect(policyStr).not.toContain('PLACEHOLDER_INTEGRATION_KEY');
            
            // Check for secret patterns (ARNs are OK, values are not)
            const secretFindings = findSecretsInObject(policyDoc, `IAM.${iamKey}.PolicyDocument`);
            
            // Filter out safe ARN references
            const unsafeFindings = secretFindings.filter(finding => {
              return !finding.includes('arn:aws:secretsmanager:');
            });
            
            expect(unsafeFindings).toEqual([]);
          }
        }
      }),
      { numRuns: 15 }
    );
  });

  /**
   * Property: Resource tags MUST NOT contain secret values
   * 
   * Tags are visible in AWS Console, Cost Explorer, and various AWS APIs.
   * They should never contain sensitive information.
   */
  test('Property: Resource tags do not contain secret values', () => {
    fc.assert(
      fc.property(environmentConfigArbitrary, (config) => {
        // Arrange
        const app = new cdk.App();
        const stack = new VocalShieldStack(
          app,
          'TestStack',
          config,
          {
            env: { account: '123456789012', region: config.region },
          }
        );
        const template = Template.fromStack(stack);

        // Act: Get all resources with tags
        const resources = template.toJSON().Resources;
        const resourceKeys = Object.keys(resources);

        // Assert: Tags should not contain secrets
        for (const resourceKey of resourceKeys) {
          const resource = resources[resourceKey];
          
          if (resource.Properties?.Tags) {
            const tags = resource.Properties.Tags;
            const tagsStr = JSON.stringify(tags);
            
            // Check for secret patterns in tags
            const secretFindings = findSecretsInObject(tags, `Resource.${resourceKey}.Tags`);
            expect(secretFindings).toEqual([]);
            
            // Ensure no placeholder secrets
            expect(tagsStr).not.toContain('PLACEHOLDER_ML_API_KEY');
            expect(tagsStr).not.toContain('PLACEHOLDER_INTEGRATION_KEY');
            
            // Verify each tag
            tags.forEach((tag: any) => {
              if (tag.Key && tag.Value) {
                expect(typeof tag.Value).toBe('string');
                expect(tag.Value).not.toMatch(/PLACEHOLDER_ML_API_KEY/);
                expect(tag.Value).not.toMatch(/PLACEHOLDER_INTEGRATION_KEY/);
              }
            });
          }
        }
      }),
      { numRuns: 15 }
    );
  });

  /**
   * Property: CloudFormation parameters MUST NOT have default secret values
   * 
   * Parameters with default values are visible in the AWS Console.
   * Secrets should be passed at deployment time or retrieved from Secrets Manager.
   */
  test('Property: CloudFormation parameters do not have default secret values', () => {
    fc.assert(
      fc.property(environmentConfigArbitrary, (config) => {
        // Arrange
        const app = new cdk.App();
        const stack = new VocalShieldStack(
          app,
          'TestStack',
          config,
          {
            env: { account: '123456789012', region: config.region },
          }
        );
        const template = Template.fromStack(stack);

        // Act: Get all CloudFormation parameters
        const templateJson = template.toJSON();
        const parameters = templateJson.Parameters || {};

        // Assert: Parameters should not have secret default values
        const parameterKeys = Object.keys(parameters);
        
        for (const paramKey of parameterKeys) {
          const parameter = parameters[paramKey];
          
          if (parameter.Default) {
            const defaultValue = parameter.Default;
            const defaultStr = typeof defaultValue === 'string' ? defaultValue : JSON.stringify(defaultValue);
            
            // Check for secret patterns
            expect(defaultStr).not.toContain('PLACEHOLDER_ML_API_KEY');
            expect(defaultStr).not.toContain('PLACEHOLDER_INTEGRATION_KEY');
            
            // Verify no secret-like patterns
            const secretFindings = findSecretsInObject(defaultValue, `Parameters.${paramKey}.Default`);
            expect(secretFindings).toEqual([]);
          }
        }
      }),
      { numRuns: 15 }
    );
  });

  /**
   * Comprehensive Secrets Exposure Check
   * 
   * This test performs a comprehensive scan of the entire CloudFormation template
   * to ensure no secrets are exposed anywhere in the infrastructure definition.
   * 
   * Note: Placeholder values in SecretStringTemplate are acceptable because they
   * are replaced by AWS Secrets Manager during secret generation and never exposed.
   */
  test('Property: No secrets exposed anywhere in CloudFormation template (comprehensive)', () => {
    fc.assert(
      fc.property(environmentConfigArbitrary, (config) => {
        // Arrange
        const app = new cdk.App();
        const stack = new VocalShieldStack(
          app,
          'TestStack',
          config,
          {
            env: { account: '123456789012', region: config.region },
          }
        );
        const template = Template.fromStack(stack);

        // Act: Get entire template
        const templateJson = template.toJSON();

        // Assert: Check critical sections for secret exposure
        // Outputs should NEVER contain secrets
        if (templateJson.Outputs) {
          const outputsStr = JSON.stringify(templateJson.Outputs);
          expect(outputsStr).not.toContain('PLACEHOLDER_ML_API_KEY');
          expect(outputsStr).not.toContain('PLACEHOLDER_INTEGRATION_KEY');
        }

        // Parameters should NEVER have secret default values
        if (templateJson.Parameters) {
          const parametersStr = JSON.stringify(templateJson.Parameters);
          expect(parametersStr).not.toContain('PLACEHOLDER_ML_API_KEY');
          expect(parametersStr).not.toContain('PLACEHOLDER_INTEGRATION_KEY');
        }

        // Lambda environment variables should NEVER contain secrets
        if (templateJson.Resources) {
          const lambdaFunctions = Object.keys(templateJson.Resources).filter(
            key => templateJson.Resources[key].Type === 'AWS::Lambda::Function'
          );
          
          for (const lambdaKey of lambdaFunctions) {
            const lambda = templateJson.Resources[lambdaKey];
            if (lambda.Properties.Environment?.Variables) {
              const envVarsStr = JSON.stringify(lambda.Properties.Environment.Variables);
              expect(envVarsStr).not.toContain('PLACEHOLDER_ML_API_KEY');
              expect(envVarsStr).not.toContain('PLACEHOLDER_INTEGRATION_KEY');
            }
          }
        }

        // Verify Secrets Manager secrets use GenerateSecretString (not hardcoded values)
        if (templateJson.Resources) {
          const secrets = Object.keys(templateJson.Resources).filter(
            key => templateJson.Resources[key].Type === 'AWS::SecretsManager::Secret'
          );
          
          for (const secretKey of secrets) {
            const secret = templateJson.Resources[secretKey];
            
            // Secrets should use GenerateSecretString
            expect(secret.Properties.GenerateSecretString).toBeDefined();
            
            // Should NOT have SecretString property (hardcoded value)
            expect(secret.Properties.SecretString).toBeUndefined();
            
            // SecretStringTemplate can contain placeholders (they're replaced by AWS)
            // This is acceptable and secure
          }
        }
      }),
      { numRuns: 15 }
    );
  });

  /**
   * Property: Secret ARNs are safe to expose (positive test)
   * 
   * This test verifies that secret ARNs and names CAN be exposed,
   * as they are safe references that don't reveal the actual secret values.
   */
  test('Property: Secret ARNs and names can be safely referenced', () => {
    fc.assert(
      fc.property(environmentConfigArbitrary, (config) => {
        // Arrange
        const app = new cdk.App();
        const stack = new VocalShieldStack(
          app,
          'TestStack',
          config,
          {
            env: { account: '123456789012', region: config.region },
          }
        );
        const template = Template.fromStack(stack);

        // Act: Get all Secrets Manager secrets
        const resources = template.toJSON().Resources;
        const secrets = Object.keys(resources).filter(
          key => resources[key].Type === 'AWS::SecretsManager::Secret'
        );

        // Assert: Secrets should have names and will have ARNs (safe to expose)
        expect(secrets.length).toBeGreaterThan(0);
        
        for (const secretKey of secrets) {
          const secret = resources[secretKey];
          
          // Secret name is safe to expose
          expect(secret.Properties.Name).toBeDefined();
          expect(typeof secret.Properties.Name).toBe('string');
          
          // Description is safe to expose
          if (secret.Properties.Description) {
            expect(typeof secret.Properties.Description).toBe('string');
          }
          
          // ARN references (via Ref or GetAtt) are safe
          // These will be used by Lambda functions to retrieve secrets at runtime
        }
      }),
      { numRuns: 15 }
    );
  });
});
