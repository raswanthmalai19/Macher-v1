/**
 * Unit Tests for ConfigurationManager
 * 
 * These tests verify specific examples, edge cases, and error conditions
 * for the configuration management system.
 * 
 * Requirements: 2.2, 7.1, 7.4, 7.5
 */

import { ConfigurationManager } from '../../../pipeline/config/ConfigurationManager';
import * as fs from 'fs';
import * as path from 'path';

describe('ConfigurationManager Unit Tests', () => {
  let configManager: ConfigurationManager;
  let testConfigDir: string;
  let schemaPath: string;

  beforeEach(() => {
    // Create temporary test directory
    testConfigDir = path.join(__dirname, '..', '..', '..', 'config-test-unit');
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }
    schemaPath = path.join(testConfigDir, 'schema.json');

    // Create schema file
    const schema = {
      type: 'object',
      required: ['environment', 'aws', 'lambda'],
      properties: {
        environment: { type: 'string' },
        aws: {
          type: 'object',
          required: ['region', 'account'],
          properties: {
            region: { type: 'string' },
            account: { type: 'string' },
          },
        },
        lambda: {
          type: 'object',
          required: ['memorySize', 'timeout'],
          properties: {
            memorySize: { type: 'number' },
            timeout: { type: 'number' },
          },
        },
      },
    };

    fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
    configManager = new ConfigurationManager(testConfigDir, schemaPath);
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  describe('loadConfig', () => {
    test('should load and merge common and environment-specific configs', () => {
      const commonConfig = {
        aws: {
          region: 'us-east-1',
          account: '123456789012',
        },
        lambda: {
          memorySize: 512,
          timeout: 30,
        },
      };

      const devConfig = {
        environment: 'dev',
        lambda: {
          memorySize: 256,
        },
      };

      fs.writeFileSync(
        path.join(testConfigDir, 'common.json'),
        JSON.stringify(commonConfig, null, 2)
      );
      fs.writeFileSync(
        path.join(testConfigDir, 'dev.json'),
        JSON.stringify(devConfig, null, 2)
      );

      const config = configManager.loadConfig('dev');

      expect(config.environment).toBe('dev');
      expect(config.aws.region).toBe('us-east-1');
      expect(config.lambda.memorySize).toBe(256); // Overridden
      expect(config.lambda.timeout).toBe(30); // From common
    });

    test('should throw error if common config file is missing', () => {
      fs.writeFileSync(
        path.join(testConfigDir, 'dev.json'),
        JSON.stringify({ environment: 'dev' }, null, 2)
      );

      expect(() => configManager.loadConfig('dev')).toThrow(
        /Common configuration file not found/
      );
    });

    test('should throw error if environment config file is missing', () => {
      fs.writeFileSync(
        path.join(testConfigDir, 'common.json'),
        JSON.stringify({}, null, 2)
      );

      expect(() => configManager.loadConfig('dev')).toThrow(
        /Environment configuration file not found/
      );
    });

    test('should throw error if merged config fails validation', () => {
      const commonConfig = {
        aws: {
          region: 'us-east-1',
        },
      };

      const devConfig = {
        environment: 'dev',
      };

      fs.writeFileSync(
        path.join(testConfigDir, 'common.json'),
        JSON.stringify(commonConfig, null, 2)
      );
      fs.writeFileSync(
        path.join(testConfigDir, 'dev.json'),
        JSON.stringify(devConfig, null, 2)
      );

      expect(() => configManager.loadConfig('dev')).toThrow(
        /Configuration validation failed/
      );
    });
  });

  describe('validateConfig', () => {
    test('should validate a correct configuration', () => {
      const config = {
        environment: 'dev',
        aws: {
          region: 'us-east-1',
          account: '123456789012',
        },
        lambda: {
          memorySize: 512,
          timeout: 30,
        },
      };

      const result = configManager.validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should fail validation for missing required fields', () => {
      const config = {
        environment: 'dev',
        aws: {
          region: 'us-east-1',
        },
      };

      const result = configManager.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should detect placeholder values', () => {
      const config = {
        environment: 'dev',
        aws: {
          region: 'us-east-1',
          account: 'PLACEHOLDER',
        },
        lambda: {
          memorySize: 512,
          timeout: 30,
        },
      };

      const result = configManager.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('placeholder'))).toBe(true);
    });

    test('should detect TODO placeholder values', () => {
      const config = {
        environment: 'dev',
        aws: {
          region: 'TODO',
          account: '123456789012',
        },
        lambda: {
          memorySize: 512,
          timeout: 30,
        },
      };

      const result = configManager.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('placeholder'))).toBe(true);
    });

    test('should detect CHANGEME placeholder values', () => {
      const config = {
        environment: 'dev',
        aws: {
          region: 'us-east-1',
          account: 'CHANGEME',
        },
        lambda: {
          memorySize: 512,
          timeout: 30,
        },
      };

      const result = configManager.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('placeholder'))).toBe(true);
    });

    test('should warn about placeholder account IDs', () => {
      const config = {
        environment: 'dev',
        aws: {
          region: 'us-east-1',
          account: '123456789012',
        },
        lambda: {
          memorySize: 512,
          timeout: 30,
        },
      };

      const result = configManager.validateConfig(config);

      expect(result.warnings.some(w => w.includes('placeholder'))).toBe(true);
    });

    test('should return error if schema file is missing', () => {
      fs.unlinkSync(schemaPath);
      const newManager = new ConfigurationManager(testConfigDir, schemaPath);

      const result = newManager.validateConfig({});

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Schema file not found'))).toBe(true);
    });
  });

  describe('mergeConfigs', () => {
    test('should merge two simple objects', () => {
      const common = { a: 1, b: 2 };
      const specific = { b: 3, c: 4 };

      const result = configManager.mergeConfigs(common, specific);

      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    test('should deep merge nested objects', () => {
      const common = {
        aws: {
          region: 'us-east-1',
          account: '123456789012',
        },
        lambda: {
          memorySize: 512,
          timeout: 30,
        },
      };

      const specific = {
        lambda: {
          memorySize: 256,
        },
      };

      const result = configManager.mergeConfigs(common, specific);

      expect(result.aws).toEqual(common.aws);
      expect(result.lambda).toEqual({
        memorySize: 256,
        timeout: 30,
      });
    });

    test('should override arrays instead of merging them', () => {
      const common = { tags: ['common', 'shared'] };
      const specific = { tags: ['specific'] };

      const result = configManager.mergeConfigs(common, specific);

      expect(result.tags).toEqual(['specific']);
    });

    test('should not mutate original objects', () => {
      const common = { a: { b: 1 } };
      const specific = { a: { c: 2 } };

      const result = configManager.mergeConfigs(common, specific);
      result.a = { b: 999, c: 999 };

      expect(common.a).toEqual({ b: 1 });
      expect(specific.a).toEqual({ c: 2 });
    });
  });

  describe('validateFreeTierCompliance', () => {
    test('should pass for compliant Lambda configuration', () => {
      const config = {
        environment: 'dev',
        aws: { region: 'us-east-1', account: '123456789012' },
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
          throttling: { rateLimit: 100, burstLimit: 200 },
        },
        monitoring: {
          logRetentionDays: 7,
          alarmEmail: 'test@example.com',
        },
        android: {
          versionCode: 1,
          versionName: '1.0.0',
          signingKeyAlias: 'test',
        },
      };

      const result = configManager.validateFreeTierCompliance(config as any);

      expect(result.compliant).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    test('should fail for Lambda memory exceeding Free Tier limit', () => {
      const config = {
        environment: 'dev',
        aws: { region: 'us-east-1', account: '123456789012' },
        lambda: {
          memorySize: 4096,
          timeout: 30,
          runtime: 'nodejs20.x',
          architecture: 'arm64',
        },
        dynamodb: {
          billingMode: 'PAY_PER_REQUEST',
          pointInTimeRecovery: false,
        },
        apiGateway: {
          throttling: { rateLimit: 100, burstLimit: 200 },
        },
        monitoring: {
          logRetentionDays: 7,
          alarmEmail: 'test@example.com',
        },
        android: {
          versionCode: 1,
          versionName: '1.0.0',
          signingKeyAlias: 'test',
        },
      };

      const result = configManager.validateFreeTierCompliance(config as any);

      expect(result.compliant).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].resource).toBe('Lambda.memorySize');
    });

    test('should fail for Lambda timeout exceeding Free Tier limit', () => {
      const config = {
        environment: 'dev',
        aws: { region: 'us-east-1', account: '123456789012' },
        lambda: {
          memorySize: 512,
          timeout: 400,
          runtime: 'nodejs20.x',
          architecture: 'arm64',
        },
        dynamodb: {
          billingMode: 'PAY_PER_REQUEST',
          pointInTimeRecovery: false,
        },
        apiGateway: {
          throttling: { rateLimit: 100, burstLimit: 200 },
        },
        monitoring: {
          logRetentionDays: 7,
          alarmEmail: 'test@example.com',
        },
        android: {
          versionCode: 1,
          versionName: '1.0.0',
          signingKeyAlias: 'test',
        },
      };

      const result = configManager.validateFreeTierCompliance(config as any);

      expect(result.compliant).toBe(false);
      expect(result.violations.some(v => v.resource === 'Lambda.timeout')).toBe(true);
    });

    test('should fail for DynamoDB PROVISIONED billing mode', () => {
      const config = {
        environment: 'dev',
        aws: { region: 'us-east-1', account: '123456789012' },
        lambda: {
          memorySize: 512,
          timeout: 30,
          runtime: 'nodejs20.x',
          architecture: 'arm64',
        },
        dynamodb: {
          billingMode: 'PROVISIONED',
          pointInTimeRecovery: false,
        },
        apiGateway: {
          throttling: { rateLimit: 100, burstLimit: 200 },
        },
        monitoring: {
          logRetentionDays: 7,
          alarmEmail: 'test@example.com',
        },
        android: {
          versionCode: 1,
          versionName: '1.0.0',
          signingKeyAlias: 'test',
        },
      };

      const result = configManager.validateFreeTierCompliance(config as any);

      expect(result.compliant).toBe(false);
      expect(result.violations.some(v => v.resource === 'DynamoDB.billingMode')).toBe(true);
    });

    test('should warn for non-ARM64 architecture', () => {
      const config = {
        environment: 'dev',
        aws: { region: 'us-east-1', account: '123456789012' },
        lambda: {
          memorySize: 512,
          timeout: 30,
          runtime: 'nodejs20.x',
          architecture: 'x86_64',
        },
        dynamodb: {
          billingMode: 'PAY_PER_REQUEST',
          pointInTimeRecovery: false,
        },
        apiGateway: {
          throttling: { rateLimit: 100, burstLimit: 200 },
        },
        monitoring: {
          logRetentionDays: 7,
          alarmEmail: 'test@example.com',
        },
        android: {
          versionCode: 1,
          versionName: '1.0.0',
          signingKeyAlias: 'test',
        },
      };

      const result = configManager.validateFreeTierCompliance(config as any);

      expect(result.warnings.some(w => w.resource === 'Lambda.architecture')).toBe(true);
    });

    test('should warn for point-in-time recovery enabled', () => {
      const config = {
        environment: 'dev',
        aws: { region: 'us-east-1', account: '123456789012' },
        lambda: {
          memorySize: 512,
          timeout: 30,
          runtime: 'nodejs20.x',
          architecture: 'arm64',
        },
        dynamodb: {
          billingMode: 'PAY_PER_REQUEST',
          pointInTimeRecovery: true,
        },
        apiGateway: {
          throttling: { rateLimit: 100, burstLimit: 200 },
        },
        monitoring: {
          logRetentionDays: 7,
          alarmEmail: 'test@example.com',
        },
        android: {
          versionCode: 1,
          versionName: '1.0.0',
          signingKeyAlias: 'test',
        },
      };

      const result = configManager.validateFreeTierCompliance(config as any);

      expect(result.warnings.some(w => w.resource === 'DynamoDB.pointInTimeRecovery')).toBe(true);
    });
  });
});
