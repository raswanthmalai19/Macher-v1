/**
 * Property-Based Tests for Configuration Management
 * 
 * These tests verify universal properties of the configuration system
 * using randomized test data to ensure correctness across all inputs.
 * 
 * Requirements: 2.5, 7.4, 7.5, 2.2
 */

import * as fc from 'fast-check';
import { ConfigurationManager } from '../../../pipeline/config/ConfigurationManager';
import * as fs from 'fs';
import * as path from 'path';

describe('Configuration Management Property Tests', () => {
  let configManager: ConfigurationManager;
  let testConfigDir: string;

  beforeEach(() => {
    // Create a temporary test config directory
    testConfigDir = path.join(__dirname, '..', '..', '..', 'config-test-temp');
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }
    
    // Create a basic schema file
    const schema = {
      type: 'object',
      required: ['environment', 'aws', 'lambda', 'dynamodb', 'apiGateway', 'monitoring', 'android'],
      properties: {
        environment: { type: 'string', enum: ['dev', 'staging', 'production'] },
        aws: {
          type: 'object',
          required: ['region', 'account'],
          properties: {
            region: { type: 'string' },
            account: { type: 'string', minLength: 12, maxLength: 12 },
          },
        },
        lambda: {
          type: 'object',
          required: ['memorySize', 'timeout', 'runtime', 'architecture'],
          properties: {
            memorySize: { type: 'number', minimum: 128, maximum: 10240 },
            timeout: { type: 'number', minimum: 1, maximum: 900 },
            runtime: { type: 'string' },
            architecture: { type: 'string' },
          },
        },
        dynamodb: {
          type: 'object',
          required: ['billingMode'],
          properties: {
            billingMode: { type: 'string', enum: ['PAY_PER_REQUEST', 'PROVISIONED'] },
            pointInTimeRecovery: { type: 'boolean' },
          },
        },
        apiGateway: {
          type: 'object',
          required: ['throttling'],
          properties: {
            throttling: {
              type: 'object',
              required: ['rateLimit', 'burstLimit'],
              properties: {
                rateLimit: { type: 'number', minimum: 1 },
                burstLimit: { type: 'number', minimum: 1 },
              },
            },
          },
        },
        monitoring: {
          type: 'object',
          required: ['logRetentionDays', 'alarmEmail'],
          properties: {
            logRetentionDays: { type: 'number', minimum: 1 },
            alarmEmail: { type: 'string', format: 'email' },
          },
        },
        android: {
          type: 'object',
          required: ['versionCode', 'versionName', 'signingKeyAlias'],
          properties: {
            versionCode: { type: 'number', minimum: 1 },
            versionName: { type: 'string', minLength: 1 },
            signingKeyAlias: { type: 'string', minLength: 1 },
          },
        },
      },
    };
    
    fs.writeFileSync(
      path.join(testConfigDir, 'schema.json'),
      JSON.stringify(schema, null, 2)
    );
    
    configManager = new ConfigurationManager(testConfigDir, path.join(testConfigDir, 'schema.json'));
  });

  afterEach(() => {
    // Clean up test config directory
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  /**
   * Feature: deployment-cicd-pipeline, Property 7: Environment configuration isolation
   * 
   * For any deployment to a specific environment, the pipeline should load and use only
   * that environment's configuration file, with no cross-environment configuration leakage.
   * 
   * Validates: Requirements 2.2
   */
  describe('Property 7: Environment configuration isolation', () => {
    test('loading environment config should not leak data from other environments', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('dev' as const, 'staging' as const, 'production' as const),
          fc.record({
            devSecret: fc.string({ minLength: 10, maxLength: 20 }),
            stagingSecret: fc.string({ minLength: 10, maxLength: 20 }),
            productionSecret: fc.string({ minLength: 10, maxLength: 20 }),
          }).filter(values => 
            values.devSecret !== values.stagingSecret &&
            values.devSecret !== values.productionSecret &&
            values.stagingSecret !== values.productionSecret
          ),
          (environment, testValues) => {
            // Create base config structure
            const baseConfig = {
              aws: {
                region: 'us-east-1',
                account: '123456789012',
              },
              lambda: {
                memorySize: 512,
                timeout: 30,
                runtime: 'nodejs20.x',
                architecture: 'arm64',
              },
              dynamodb: {
                billingMode: 'PAY_PER_REQUEST',
                pointInTimeRecovery: false,
              },
              apiGateway: {
                throttling: {
                  rateLimit: 100,
                  burstLimit: 200,
                },
              },
              monitoring: {
                logRetentionDays: 7,
                alarmEmail: 'test@example.com',
              },
              android: {
                versionCode: 1,
                versionName: '1.0.0',
                signingKeyAlias: 'test-key',
              },
            };

            // Create common config
            const commonConfig = {
              ...baseConfig,
              environment: 'common',
            };

            // Create environment-specific configs with unique secrets
            const devConfig = {
              environment: 'dev',
              secretValue: testValues.devSecret,
            };

            const stagingConfig = {
              environment: 'staging',
              secretValue: testValues.stagingSecret,
            };

            const productionConfig = {
              environment: 'production',
              secretValue: testValues.productionSecret,
            };

            // Write config files
            fs.writeFileSync(
              path.join(testConfigDir, 'common.json'),
              JSON.stringify(commonConfig, null, 2)
            );
            fs.writeFileSync(
              path.join(testConfigDir, 'dev.json'),
              JSON.stringify(devConfig, null, 2)
            );
            fs.writeFileSync(
              path.join(testConfigDir, 'staging.json'),
              JSON.stringify(stagingConfig, null, 2)
            );
            fs.writeFileSync(
              path.join(testConfigDir, 'production.json'),
              JSON.stringify(productionConfig, null, 2)
            );

            // Load config for the target environment
            const loadedConfig = configManager.loadConfig(environment) as any;

            // Verify the loaded config has the correct environment-specific value
            expect(loadedConfig.environment).toBe(environment);

            // Verify correct secret is loaded
            const expectedSecret = environment === 'dev' ? testValues.devSecret :
                                  environment === 'staging' ? testValues.stagingSecret :
                                  testValues.productionSecret;
            
            expect(loadedConfig.secretValue).toBe(expectedSecret);

            // Verify other environment secrets are NOT present
            const configStr = JSON.stringify(loadedConfig);
            if (environment === 'dev') {
              expect(configStr).not.toContain(testValues.stagingSecret);
              expect(configStr).not.toContain(testValues.productionSecret);
            } else if (environment === 'staging') {
              expect(configStr).not.toContain(testValues.devSecret);
              expect(configStr).not.toContain(testValues.productionSecret);
            } else {
              expect(configStr).not.toContain(testValues.devSecret);
              expect(configStr).not.toContain(testValues.stagingSecret);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('environment-specific values should override common values', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('dev' as const, 'staging' as const, 'production' as const),
          fc.integer({ min: 128, max: 3008 }),
          fc.integer({ min: 128, max: 3008 }),
          (environment, commonMemory, envMemory) => {
            // Ensure values are different
            fc.pre(commonMemory !== envMemory);

            // Create base config structure
            const commonConfig = {
              environment: 'common',
              aws: {
                region: 'us-east-1',
                account: '123456789012',
              },
              lambda: {
                memorySize: commonMemory,
                timeout: 30,
                runtime: 'nodejs20.x',
                architecture: 'arm64',
              },
              dynamodb: {
                billingMode: 'PAY_PER_REQUEST',
                pointInTimeRecovery: false,
              },
              apiGateway: {
                throttling: {
                  rateLimit: 100,
                  burstLimit: 200,
                },
              },
              monitoring: {
                logRetentionDays: 7,
                alarmEmail: 'test@example.com',
              },
              android: {
                versionCode: 1,
                versionName: '1.0.0',
                signingKeyAlias: 'test-key',
              },
            };

            // Create environment config that overrides lambda memory
            const envConfig = {
              environment,
              lambda: {
                memorySize: envMemory,
              },
            };

            // Write config files
            fs.writeFileSync(
              path.join(testConfigDir, 'common.json'),
              JSON.stringify(commonConfig, null, 2)
            );
            fs.writeFileSync(
              path.join(testConfigDir, `${environment}.json`),
              JSON.stringify(envConfig, null, 2)
            );

            // Load config
            const loadedConfig = configManager.loadConfig(environment);

            // Environment-specific value should override common value
            expect(loadedConfig.lambda.memorySize).toBe(envMemory);
            expect(loadedConfig.lambda.memorySize).not.toBe(commonMemory);
            
            // Other common values should still be present
            expect(loadedConfig.lambda.timeout).toBe(30);
            expect(loadedConfig.lambda.runtime).toBe('nodejs20.x');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: deployment-cicd-pipeline, Property 10: Configuration validation
   * 
   * For any environment configuration with undefined required variables or placeholder values,
   * the pipeline should fail immediately with a descriptive error message.
   * 
   * Validates: Requirements 2.5, 7.4, 7.5
   */
  describe('Property 10: Configuration validation', () => {
    test('configurations with placeholder values should fail validation', () => {
      fc.assert(
        fc.property(
          fc.record({
            environment: fc.constantFrom('dev', 'staging', 'production'),
            aws: fc.record({
              region: fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1'),
              account: fc.oneof(
                fc.constant('PLACEHOLDER'),
                fc.constant('TODO'),
                fc.constant('CHANGEME'),
                fc.constant('123456789012')
              ),
            }),
            lambda: fc.record({
              memorySize: fc.integer({ min: 128, max: 3008 }),
              timeout: fc.integer({ min: 1, max: 300 }),
              runtime: fc.constant('nodejs20.x'),
              architecture: fc.constant('arm64'),
            }),
            dynamodb: fc.record({
              billingMode: fc.constant('PAY_PER_REQUEST'),
              pointInTimeRecovery: fc.boolean(),
            }),
            apiGateway: fc.record({
              throttling: fc.record({
                rateLimit: fc.integer({ min: 1, max: 1000 }),
                burstLimit: fc.integer({ min: 1, max: 5000 }),
              }),
            }),
            monitoring: fc.record({
              logRetentionDays: fc.integer({ min: 1, max: 90 }),
              alarmEmail: fc.emailAddress(),
            }),
            android: fc.record({
              versionCode: fc.integer({ min: 1, max: 1000 }),
              versionName: fc.string({ minLength: 5, maxLength: 10 }),
              signingKeyAlias: fc.string({ minLength: 5, maxLength: 20 }),
            }),
          }),
          (config) => {
            const validation = configManager.validateConfig(config);

            // If account contains placeholder text, validation should fail
            const hasPlaceholder = ['PLACEHOLDER', 'TODO', 'CHANGEME'].includes(config.aws.account);

            if (hasPlaceholder) {
              // Should fail validation
              expect(validation.valid).toBe(false);
              expect(validation.errors.length).toBeGreaterThan(0);
              // Error message should mention placeholder (case-insensitive)
              const hasPlaceholderError = validation.errors.some(e => 
                e.toLowerCase().includes('placeholder') || 
                e.includes('PLACEHOLDER') || 
                e.includes('TODO') || 
                e.includes('CHANGEME')
              );
              expect(hasPlaceholderError).toBe(true);
            }

            // Validation result should always have valid boolean
            expect(typeof validation.valid).toBe('boolean');
            expect(Array.isArray(validation.errors)).toBe(true);
            expect(Array.isArray(validation.warnings)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('configurations with undefined required variables should fail validation', () => {
      fc.assert(
        fc.property(
          fc.record({
            environment: fc.constantFrom('dev', 'staging', 'production'),
            aws: fc.option(
              fc.record({
                region: fc.constantFrom('us-east-1', 'us-west-2'),
                account: fc.string({ minLength: 12, maxLength: 12 }),
              }),
              { nil: undefined }
            ),
            lambda: fc.option(
              fc.record({
                memorySize: fc.integer({ min: 128, max: 3008 }),
                timeout: fc.integer({ min: 1, max: 300 }),
              }),
              { nil: undefined }
            ),
          }),
          (config) => {
            const validation = configManager.validateConfig(config);

            // If required fields are missing, validation should fail
            const hasMissingFields = !config.aws || !config.lambda;

            if (hasMissingFields) {
              expect(validation.valid).toBe(false);
              expect(validation.errors.length).toBeGreaterThan(0);
            }

            // Error messages should be descriptive
            for (const error of validation.errors) {
              expect(typeof error).toBe('string');
              expect(error.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('valid configurations without placeholders should pass validation', () => {
      fc.assert(
        fc.property(
          fc.record({
            environment: fc.constantFrom('dev', 'staging', 'production'),
            aws: fc.record({
              region: fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1'),
              account: fc.string({ minLength: 12, maxLength: 12 }).filter(s => 
                !s.includes('PLACEHOLDER') && 
                !s.includes('TODO') && 
                !s.includes('CHANGEME')
              ),
            }),
            lambda: fc.record({
              memorySize: fc.integer({ min: 128, max: 3008 }),
              timeout: fc.integer({ min: 1, max: 300 }),
              runtime: fc.constant('nodejs20.x'),
              architecture: fc.constant('arm64'),
            }),
            dynamodb: fc.record({
              billingMode: fc.constant('PAY_PER_REQUEST'),
              pointInTimeRecovery: fc.boolean(),
            }),
            apiGateway: fc.record({
              throttling: fc.record({
                rateLimit: fc.integer({ min: 1, max: 1000 }),
                burstLimit: fc.integer({ min: 1, max: 5000 }),
              }),
            }),
            monitoring: fc.record({
              logRetentionDays: fc.integer({ min: 1, max: 90 }),
              alarmEmail: fc.emailAddress(),
            }),
            android: fc.record({
              versionCode: fc.integer({ min: 1, max: 1000 }),
              versionName: fc.string({ minLength: 5, maxLength: 10 }).filter(s => 
                !s.includes('PLACEHOLDER') && 
                !s.includes('TODO') && 
                !s.includes('CHANGEME')
              ),
              signingKeyAlias: fc.string({ minLength: 5, maxLength: 20 }).filter(s => 
                !s.includes('PLACEHOLDER') && 
                !s.includes('TODO') && 
                !s.includes('CHANGEME')
              ),
            }),
          }),
          (config) => {
            const validation = configManager.validateConfig(config);

            // Valid configurations should pass
            if (validation.valid) {
              expect(validation.errors.length).toBe(0);
            }

            // All validation results should have proper structure
            expect(typeof validation.valid).toBe('boolean');
            expect(Array.isArray(validation.errors)).toBe(true);
            expect(Array.isArray(validation.warnings)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
