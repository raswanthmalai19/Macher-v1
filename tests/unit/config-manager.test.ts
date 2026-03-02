/**
 * Unit tests for ConfigurationManager
 * 
 * Tests configuration loading, validation, merging, and Free Tier compliance
 * checking functionality.
 * 
 * Requirements: 2.2, 7.1, 7.4, 7.5, 11.1, 11.2, 11.3, 11.4, 11.5
 */

import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationManager } from '../../pipeline/config/ConfigurationManager';
import { EnvironmentConfig } from '../../pipeline/types';

describe('ConfigurationManager', () => {
  let configManager: ConfigurationManager;

  beforeEach(() => {
    configManager = new ConfigurationManager('config', 'config/schema.json');
  });

  describe('loadConfig', () => {
    it('should load and merge dev configuration successfully', () => {
      const config = configManager.loadConfig('dev');

      expect(config.environment).toBe('dev');
      expect(config.aws.region).toBe('us-east-1');
      expect(config.lambda.runtime).toBe('nodejs20.x');
      expect(config.lambda.architecture).toBe('arm64');
      expect(config.lambda.memorySize).toBe(512);
      expect(config.lambda.timeout).toBe(10);
      expect(config.dynamodb.billingMode).toBe('PAY_PER_REQUEST');
    });

    it('should load and merge staging configuration successfully', () => {
      const config = configManager.loadConfig('staging');

      expect(config.environment).toBe('staging');
      expect(config.aws.region).toBe('us-east-1');
      expect(config.lambda.memorySize).toBe(1024);
      expect(config.lambda.timeout).toBe(30);
    });

    it('should load and merge production configuration successfully', () => {
      const config = configManager.loadConfig('production');

      expect(config.environment).toBe('production');
      expect(config.aws.region).toBe('us-east-1');
      expect(config.lambda.memorySize).toBe(1024);
      expect(config.lambda.timeout).toBe(30);
    });

    it('should throw error if common config file is missing', () => {
      const manager = new ConfigurationManager('nonexistent', 'config/schema.json');

      expect(() => manager.loadConfig('dev')).toThrow(
        /Common configuration file not found/
      );
    });

    it('should throw error if environment config file is missing', () => {
      expect(() => configManager.loadConfig('invalid' as any)).toThrow(
        /Environment configuration file not found/
      );
    });

    it('should throw error if merged config is invalid', () => {
      // Create a temporary invalid config
      const tempDir = 'config-test-temp';
      const tempCommon = path.join(tempDir, 'common.json');
      const tempEnv = path.join(tempDir, 'dev.json');

      try {
        fs.mkdirSync(tempDir, { recursive: true });
        fs.writeFileSync(tempCommon, JSON.stringify({ lambda: {} }));
        fs.writeFileSync(tempEnv, JSON.stringify({ environment: 'dev' }));

        const manager = new ConfigurationManager(tempDir, 'config/schema.json');

        expect(() => manager.loadConfig('dev')).toThrow(
          /Configuration validation failed/
        );
      } finally {
        // Cleanup
        if (fs.existsSync(tempCommon)) fs.unlinkSync(tempCommon);
        if (fs.existsSync(tempEnv)) fs.unlinkSync(tempEnv);
        if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
      }
    });
  });

  describe('validateConfig', () => {
    it('should validate a correct configuration', () => {
      const config = configManager.loadConfig('dev');
      const result = configManager.validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const invalidConfig = {
        environment: 'dev',
        // Missing aws, lambda, dynamodb, etc.
      };

      const result = configManager.validateConfig(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('required'))).toBe(true);
    });

    it('should detect invalid environment value', () => {
      const config = configManager.loadConfig('dev');
      const invalidConfig = { ...config, environment: 'invalid' };

      const result = configManager.validateConfig(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('environment'))).toBe(true);
    });

    it('should detect invalid AWS region format', () => {
      const config = configManager.loadConfig('dev');
      const invalidConfig = {
        ...config,
        aws: { ...config.aws, region: 'invalid-region' },
      };

      const result = configManager.validateConfig(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('region'))).toBe(true);
    });

    it('should detect invalid AWS account ID format', () => {
      const config = configManager.loadConfig('dev');
      const invalidConfig = {
        ...config,
        aws: { ...config.aws, account: '12345' }, // Too short
      };

      const result = configManager.validateConfig(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('account'))).toBe(true);
    });

    it('should detect placeholder values', () => {
      const config = {
        ...configManager.loadConfig('dev'),
        aws: {
          region: 'PLACEHOLDER',
          account: '123456789012',
        },
      };

      const result = configManager.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('placeholder'))).toBe(true);
    });

    it('should warn about placeholder account IDs', () => {
      const config = configManager.loadConfig('dev');

      const result = configManager.validateConfig(config);

      expect(result.warnings.some(w => w.includes('placeholder'))).toBe(true);
    });

    it('should detect invalid Lambda memory size', () => {
      const config = configManager.loadConfig('dev');
      const invalidConfig = {
        ...config,
        lambda: { ...config.lambda, memorySize: 100 }, // Not multiple of 64
      };

      const result = configManager.validateConfig(invalidConfig);

      expect(result.valid).toBe(false);
    });

    it('should detect invalid Lambda timeout', () => {
      const config = configManager.loadConfig('dev');
      const invalidConfig = {
        ...config,
        lambda: { ...config.lambda, timeout: 0 }, // Below minimum
      };

      const result = configManager.validateConfig(invalidConfig);

      expect(result.valid).toBe(false);
    });

    it('should return error if schema file is missing', () => {
      const manager = new ConfigurationManager('config', 'nonexistent.json');
      const config = { environment: 'dev' };

      const result = manager.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Schema file not found'))).toBe(true);
    });
  });

  describe('mergeConfigs', () => {
    it('should merge simple objects', () => {
      const common = { a: 1, b: 2 };
      const envSpecific = { b: 3, c: 4 };

      const result = configManager.mergeConfigs(common, envSpecific);

      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should deep merge nested objects', () => {
      const common = {
        lambda: { runtime: 'nodejs20.x', architecture: 'arm64' },
        dynamodb: { billingMode: 'PAY_PER_REQUEST' },
      };
      const envSpecific = {
        lambda: { memorySize: 512, timeout: 10 },
        aws: { region: 'us-east-1' },
      };

      const result = configManager.mergeConfigs(common, envSpecific);

      expect(result).toEqual({
        lambda: {
          runtime: 'nodejs20.x',
          architecture: 'arm64',
          memorySize: 512,
          timeout: 10,
        },
        dynamodb: { billingMode: 'PAY_PER_REQUEST' },
        aws: { region: 'us-east-1' },
      });
    });

    it('should override arrays instead of merging', () => {
      const common = { tags: ['common', 'shared'] };
      const envSpecific = { tags: ['env', 'specific'] };

      const result = configManager.mergeConfigs(common, envSpecific);

      expect(result.tags).toEqual(['env', 'specific']);
    });

    it('should not share references between configs', () => {
      const common = { lambda: { runtime: 'nodejs20.x' } };
      const envSpecific = { lambda: { memorySize: 512 } };

      const result = configManager.mergeConfigs(common, envSpecific);

      // Modify result
      (result.lambda as any).runtime = 'python3.12';

      // Original should be unchanged
      expect(common.lambda.runtime).toBe('nodejs20.x');
    });

    it('should handle null and undefined values', () => {
      const common = { a: null, b: undefined };
      const envSpecific = { c: null };

      const result = configManager.mergeConfigs(common, envSpecific);

      expect(result).toEqual({ a: null, b: undefined, c: null });
    });

    it('should handle empty objects', () => {
      const result = configManager.mergeConfigs({}, {});

      expect(result).toEqual({});
    });
  });

  describe('validateFreeTierCompliance', () => {
    it('should pass for compliant dev configuration', () => {
      const config = configManager.loadConfig('dev');
      const result = configManager.validateFreeTierCompliance(config);

      expect(result.compliant).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass for compliant staging configuration', () => {
      const config = configManager.loadConfig('staging');
      const result = configManager.validateFreeTierCompliance(config);

      expect(result.compliant).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass for compliant production configuration', () => {
      const config = configManager.loadConfig('production');
      const result = configManager.validateFreeTierCompliance(config);

      expect(result.compliant).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect Lambda memory size violation', () => {
      const config = configManager.loadConfig('dev');
      config.lambda.memorySize = 4096; // Exceeds 3008 MB limit

      const result = configManager.validateFreeTierCompliance(config);

      expect(result.compliant).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(
        result.violations.some(v => v.resource === 'Lambda.memorySize')
      ).toBe(true);
    });

    it('should warn when Lambda memory size approaches limit', () => {
      const config = configManager.loadConfig('dev');
      config.lambda.memorySize = 2560; // 85% of 3008 MB limit

      const result = configManager.validateFreeTierCompliance(config);

      expect(result.compliant).toBe(true);
      expect(
        result.warnings.some(w => w.resource === 'Lambda.memorySize')
      ).toBe(true);
    });

    it('should detect Lambda timeout violation', () => {
      const config = configManager.loadConfig('dev');
      config.lambda.timeout = 400; // Exceeds 300 seconds limit

      const result = configManager.validateFreeTierCompliance(config);

      expect(result.compliant).toBe(false);
      expect(result.violations.some(v => v.resource === 'Lambda.timeout')).toBe(
        true
      );
    });

    it('should warn when Lambda timeout approaches limit', () => {
      const config = configManager.loadConfig('dev');
      config.lambda.timeout = 250; // 83% of 300 seconds limit

      const result = configManager.validateFreeTierCompliance(config);

      expect(result.compliant).toBe(true);
      expect(result.warnings.some(w => w.resource === 'Lambda.timeout')).toBe(
        true
      );
    });

    it('should detect DynamoDB billing mode violation', () => {
      const config = configManager.loadConfig('dev');
      config.dynamodb.billingMode = 'PROVISIONED' as any;

      const result = configManager.validateFreeTierCompliance(config);

      expect(result.compliant).toBe(false);
      expect(
        result.violations.some(v => v.resource === 'DynamoDB.billingMode')
      ).toBe(true);
    });

    it('should warn about point-in-time recovery cost', () => {
      const config = configManager.loadConfig('dev');
      config.dynamodb.pointInTimeRecovery = true;

      const result = configManager.validateFreeTierCompliance(config);

      expect(result.compliant).toBe(true);
      expect(
        result.warnings.some(
          w => w.resource === 'DynamoDB.pointInTimeRecovery'
        )
      ).toBe(true);
    });

    it('should warn about high log retention', () => {
      const config = configManager.loadConfig('dev');
      config.monitoring.logRetentionDays = 30;

      const result = configManager.validateFreeTierCompliance(config);

      expect(result.compliant).toBe(true);
      expect(
        result.warnings.some(w => w.resource === 'Monitoring.logRetentionDays')
      ).toBe(true);
    });

    it('should warn about non-ARM64 architecture', () => {
      const config = configManager.loadConfig('dev');
      config.lambda.architecture = 'x86_64' as any;

      const result = configManager.validateFreeTierCompliance(config);

      expect(result.compliant).toBe(true);
      expect(
        result.warnings.some(w => w.resource === 'Lambda.architecture')
      ).toBe(true);
    });

    it('should detect multiple violations', () => {
      const config = configManager.loadConfig('dev');
      config.lambda.memorySize = 4096;
      config.lambda.timeout = 400;
      config.dynamodb.billingMode = 'PROVISIONED' as any;

      const result = configManager.validateFreeTierCompliance(config);

      expect(result.compliant).toBe(false);
      expect(result.violations.length).toBe(3);
    });

    it('should provide recommendations for violations', () => {
      const config = configManager.loadConfig('dev');
      config.lambda.memorySize = 4096;

      const result = configManager.validateFreeTierCompliance(config);

      const violation = result.violations.find(
        v => v.resource === 'Lambda.memorySize'
      );
      expect(violation).toBeDefined();
      expect(violation!.recommendation).toContain('3008');
    });
  });
});
