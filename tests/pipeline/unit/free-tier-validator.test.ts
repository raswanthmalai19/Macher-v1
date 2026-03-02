/**
 * Unit Tests for FreeTierValidator
 * 
 * These tests verify specific examples, edge cases, and error conditions
 * for the Free Tier validation system.
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { FreeTierValidator } from '../../../pipeline/deploy/FreeTierValidator';

describe('FreeTierValidator Unit Tests', () => {
  let validator: FreeTierValidator;

  beforeEach(() => {
    validator = new FreeTierValidator();
  });

  describe('validateLambdaConfig', () => {
    test('should pass for compliant Lambda config', () => {
      const config = {
        memorySize: 512,
        timeout: 30,
        architecture: 'arm64',
        runtime: 'nodejs20.x',
      };

      const result = validator.validateLambdaConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should fail for memory below minimum', () => {
      const config = {
        memorySize: 64,
        timeout: 30,
        architecture: 'arm64',
        runtime: 'nodejs20.x',
      };

      const result = validator.validateLambdaConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('128 MB'))).toBe(true);
    });

    test('should fail for memory exceeding Free Tier limit', () => {
      const config = {
        memorySize: 4096,
        timeout: 30,
        architecture: 'arm64',
        runtime: 'nodejs20.x',
      };

      const result = validator.validateLambdaConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('3008 MB'))).toBe(true);
    });

    test('should warn for memory approaching Free Tier limit', () => {
      const config = {
        memorySize: 2500,
        timeout: 30,
        architecture: 'arm64',
        runtime: 'nodejs20.x',
      };

      const result = validator.validateLambdaConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('approaching'))).toBe(true);
    });

    test('should fail for timeout exceeding Free Tier limit', () => {
      const config = {
        memorySize: 512,
        timeout: 400,
        architecture: 'arm64',
        runtime: 'nodejs20.x',
      };

      const result = validator.validateLambdaConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('300'))).toBe(true);
    });

    test('should warn for non-ARM64 architecture', () => {
      const config = {
        memorySize: 512,
        timeout: 30,
        architecture: 'x86_64',
        runtime: 'nodejs20.x',
      };

      const result = validator.validateLambdaConfig(config);

      expect(result.warnings.some(w => w.includes('ARM64'))).toBe(true);
    });

    test('should warn for non-recommended runtime', () => {
      const config = {
        memorySize: 512,
        timeout: 30,
        architecture: 'arm64',
        runtime: 'nodejs18.x',
      };

      const result = validator.validateLambdaConfig(config);

      expect(result.warnings.some(w => w.includes('runtime'))).toBe(true);
    });
  });

  describe('validateDynamoDBConfig', () => {
    test('should pass for PAY_PER_REQUEST billing', () => {
      const config = {
        billingMode: 'PAY_PER_REQUEST' as const,
        pointInTimeRecovery: false,
      };

      const result = validator.validateDynamoDBConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should fail for PROVISIONED billing', () => {
      const config = {
        billingMode: 'PROVISIONED' as const,
        pointInTimeRecovery: false,
      };

      const result = validator.validateDynamoDBConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('PAY_PER_REQUEST'))).toBe(true);
    });

    test('should warn for point-in-time recovery enabled', () => {
      const config = {
        billingMode: 'PAY_PER_REQUEST' as const,
        pointInTimeRecovery: true,
      };

      const result = validator.validateDynamoDBConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('point-in-time'))).toBe(true);
    });
  });

  describe('validateAPIGatewayConfig', () => {
    test('should pass for valid throttling config', () => {
      const config = {
        throttling: {
          rateLimit: 100,
          burstLimit: 200,
        },
      };

      const result = validator.validateAPIGatewayConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should fail for zero rate limit', () => {
      const config = {
        throttling: {
          rateLimit: 0,
          burstLimit: 200,
        },
      };

      const result = validator.validateAPIGatewayConfig(config);

      expect(result.valid).toBe(false);
    });

    test('should warn for high rate limit', () => {
      const config = {
        throttling: {
          rateLimit: 200,
          burstLimit: 400,
        },
      };

      const result = validator.validateAPIGatewayConfig(config);

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('estimateMonthlyCost', () => {
    test('should estimate zero cost for minimal template', () => {
      const template = {
        Resources: {
          TestLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              MemorySize: 512,
              Timeout: 30,
            },
          },
        },
      };

      const estimate = validator.estimateMonthlyCost(template);

      expect(estimate.estimatedMonthlyCost).toBe(0);
      expect(estimate.freeTierEligible).toBe(true);
    });

    test('should count Lambda functions', () => {
      const template = {
        Resources: {
          Lambda1: {
            Type: 'AWS::Lambda::Function',
            Properties: {},
          },
          Lambda2: {
            Type: 'AWS::Lambda::Function',
            Properties: {},
          },
        },
      };

      const estimate = validator.estimateMonthlyCost(template);

      expect(estimate.breakdown.lambda).toBeDefined();
    });

    test('should count DynamoDB tables', () => {
      const template = {
        Resources: {
          Table1: {
            Type: 'AWS::DynamoDB::Table',
            Properties: {},
          },
        },
      };

      const estimate = validator.estimateMonthlyCost(template);

      expect(estimate.breakdown.dynamodb).toBeDefined();
    });
  });

  describe('checkComplianceThresholds', () => {
    test('should pass for low usage', () => {
      const usage = {
        lambda: {
          invocations: 10000,
          gbSeconds: 1000,
        },
        dynamodb: {
          readUnits: 5,
          writeUnits: 5,
          storage: 5,
        },
        apiGateway: {
          requests: 10000,
        },
      };

      const status = validator.checkComplianceThresholds(usage);

      expect(status.compliant).toBe(true);
    });

    test('should warn at 80% Lambda invocations', () => {
      const usage = {
        lambda: {
          invocations: 800000,
          gbSeconds: 1000,
        },
        dynamodb: {
          readUnits: 5,
          writeUnits: 5,
          storage: 5,
        },
        apiGateway: {
          requests: 10000,
        },
      };

      const status = validator.checkComplianceThresholds(usage);

      expect(status.details.warnings).toBeDefined();
      const warnings = status.details.warnings as string[];
      expect(warnings.some(w => w.includes('Lambda invocations'))).toBe(true);
    });

    test('should warn at 80% DynamoDB storage', () => {
      const usage = {
        lambda: {
          invocations: 10000,
          gbSeconds: 1000,
        },
        dynamodb: {
          readUnits: 5,
          writeUnits: 5,
          storage: 20,
        },
        apiGateway: {
          requests: 10000,
        },
      };

      const status = validator.checkComplianceThresholds(usage);

      const warnings = status.details.warnings as string[];
      expect(warnings.some(w => w.includes('DynamoDB storage'))).toBe(true);
    });

    test('should include usage percentages in details', () => {
      const usage = {
        lambda: {
          invocations: 500000,
          gbSeconds: 200000,
        },
        dynamodb: {
          readUnits: 10,
          writeUnits: 10,
          storage: 10,
        },
        apiGateway: {
          requests: 500000,
        },
      };

      const status = validator.checkComplianceThresholds(usage);

      expect(status.details.lambda).toBeDefined();
      expect(status.details.dynamodb).toBeDefined();
      expect(status.details.apiGateway).toBeDefined();
    });
  });

  describe('generateComplianceReport', () => {
    test('should generate compliant report for valid template', () => {
      const template = {
        Resources: {
          TestLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              MemorySize: 512,
              Timeout: 30,
              Runtime: 'nodejs20.x',
              Architectures: ['arm64'],
            },
          },
          TestTable: {
            Type: 'AWS::DynamoDB::Table',
            Properties: {
              BillingMode: 'PAY_PER_REQUEST',
            },
          },
        },
      };

      const usage = {
        lambda: { invocations: 0, gbSeconds: 0 },
        dynamodb: { readUnits: 0, writeUnits: 0, storage: 0 },
        apiGateway: { requests: 0 },
      };

      const report = validator.generateComplianceReport(template, usage);

      expect(report.compliant).toBe(true);
      expect(report.violations).toHaveLength(0);
    });

    test('should identify Lambda violations', () => {
      const template = {
        Resources: {
          TestLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              MemorySize: 4096,
              Timeout: 30,
            },
          },
        },
      };

      const usage = {
        lambda: { invocations: 0, gbSeconds: 0 },
        dynamodb: { readUnits: 0, writeUnits: 0, storage: 0 },
        apiGateway: { requests: 0 },
      };

      const report = validator.generateComplianceReport(template, usage);

      expect(report.compliant).toBe(false);
      expect(report.violations.length).toBeGreaterThan(0);
    });

    test('should identify DynamoDB violations', () => {
      const template = {
        Resources: {
          TestTable: {
            Type: 'AWS::DynamoDB::Table',
            Properties: {
              BillingMode: 'PROVISIONED',
            },
          },
        },
      };

      const usage = {
        lambda: { invocations: 0, gbSeconds: 0 },
        dynamodb: { readUnits: 0, writeUnits: 0, storage: 0 },
        apiGateway: { requests: 0 },
      };

      const report = validator.generateComplianceReport(template, usage);

      expect(report.compliant).toBe(false);
      expect(report.violations.some(v => v.resource === 'TestTable')).toBe(true);
    });

    test('should calculate remaining Free Tier capacity', () => {
      const template = {
        Resources: {},
      };

      const usage = {
        lambda: { invocations: 500000, gbSeconds: 200000 },
        dynamodb: { readUnits: 10, writeUnits: 10, storage: 10 },
        apiGateway: { requests: 500000 },
      };

      const report = validator.generateComplianceReport(template, usage);

      expect(report.freeTierRemaining.lambda.invocations).toBe(500000);
      expect(report.freeTierRemaining.dynamodb.readUnits).toBe(15);
    });

    test('should include resource checks', () => {
      const template = {
        Resources: {
          TestLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              MemorySize: 512,
              Timeout: 30,
            },
          },
        },
      };

      const usage = {
        lambda: { invocations: 0, gbSeconds: 0 },
        dynamodb: { readUnits: 0, writeUnits: 0, storage: 0 },
        apiGateway: { requests: 0 },
      };

      const report = validator.generateComplianceReport(template, usage);

      expect(report.resourceChecks.length).toBeGreaterThan(0);
      expect(report.resourceChecks[0].resourceType).toBe('AWS::Lambda::Function');
    });
  });
});
