/**
 * Property-Based Tests for Free Tier Validation
 * 
 * These tests verify universal properties of the Free Tier validation system
 * using randomized test data to ensure correctness across all inputs.
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import * as fc from 'fast-check';
import { FreeTierValidator } from '../../../pipeline/deploy/FreeTierValidator';

describe('Free Tier Validation Property Tests', () => {
  let validator: FreeTierValidator;

  beforeEach(() => {
    validator = new FreeTierValidator();
  });

  /**
   * Feature: deployment-cicd-pipeline, Property 47: Comprehensive Free Tier validation
   * 
   * For any infrastructure synthesis, the pipeline should validate Lambda memory configurations,
   * Lambda timeout configurations, Lambda function count, DynamoDB billing mode, and reject any
   * resources explicitly configured outside Free Tier limits, generating a compliance report.
   * 
   * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
   */
  describe('Property 47: Comprehensive Free Tier validation', () => {
    test('Lambda configs exceeding memory limit should fail validation', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3009, max: 10240 }),
          fc.integer({ min: 1, max: 300 }),
          (memorySize, timeout) => {
            const config = {
              memorySize,
              timeout,
              architecture: 'arm64',
              runtime: 'nodejs20.x',
            };

            const result = validator.validateLambdaConfig(config);

            // Should fail because memory exceeds 3008 MB limit
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('memory'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Lambda configs exceeding timeout limit should fail validation', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 128, max: 3008 }),
          fc.integer({ min: 301, max: 900 }),
          (memorySize, timeout) => {
            const config = {
              memorySize,
              timeout,
              architecture: 'arm64',
              runtime: 'nodejs20.x',
            };

            const result = validator.validateLambdaConfig(config);

            // Should fail because timeout exceeds 300 seconds limit
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('timeout'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Lambda configs within Free Tier limits should pass validation', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 128, max: 3008 }),
          fc.integer({ min: 1, max: 300 }),
          (memorySize, timeout) => {
            const config = {
              memorySize,
              timeout,
              architecture: 'arm64',
              runtime: 'nodejs20.x',
            };

            const result = validator.validateLambdaConfig(config);

            // Should pass because both are within limits
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('DynamoDB with PROVISIONED billing should fail validation', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (pointInTimeRecovery) => {
            const config = {
              billingMode: 'PROVISIONED' as const,
              pointInTimeRecovery,
            };

            const result = validator.validateDynamoDBConfig(config);

            // Should fail because PROVISIONED is not Free Tier compliant
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('billing mode'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('DynamoDB with PAY_PER_REQUEST billing should pass validation', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (pointInTimeRecovery) => {
            const config = {
              billingMode: 'PAY_PER_REQUEST' as const,
              pointInTimeRecovery,
            };

            const result = validator.validateDynamoDBConfig(config);

            // Should pass because PAY_PER_REQUEST is Free Tier compliant
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('API Gateway configs with valid limits should pass validation', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 1, max: 5000 }),
          (rateLimit, burstLimit) => {
            const config = {
              throttling: {
                rateLimit,
                burstLimit,
              },
            };

            const result = validator.validateAPIGatewayConfig(config);

            // Should pass because limits are positive
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('compliance report should identify all violations', () => {
      fc.assert(
        fc.property(
          fc.record({
            lambdaMemory: fc.integer({ min: 128, max: 10240 }),
            lambdaTimeout: fc.integer({ min: 1, max: 900 }),
            dynamoDBBilling: fc.constantFrom('PAY_PER_REQUEST', 'PROVISIONED'),
          }),
          (config) => {
            const template = {
              Resources: {
                TestLambda: {
                  Type: 'AWS::Lambda::Function',
                  Properties: {
                    MemorySize: config.lambdaMemory,
                    Timeout: config.lambdaTimeout,
                    Runtime: 'nodejs20.x',
                    Architectures: ['arm64'],
                  },
                },
                TestTable: {
                  Type: 'AWS::DynamoDB::Table',
                  Properties: {
                    BillingMode: config.dynamoDBBilling,
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

            // Check if violations are correctly identified
            const hasLambdaViolation = config.lambdaMemory > 3008 || config.lambdaTimeout > 300;
            const hasDynamoViolation = config.dynamoDBBilling === 'PROVISIONED';
            const expectedViolations = (hasLambdaViolation ? 1 : 0) + (hasDynamoViolation ? 1 : 0);

            if (expectedViolations > 0) {
              expect(report.compliant).toBe(false);
              expect(report.violations.length).toBeGreaterThanOrEqual(expectedViolations);
            } else {
              expect(report.compliant).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('usage at 80%+ of Free Tier should trigger warnings', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.8), max: Math.fround(1.5) }),
          (usagePercent) => {
            const usage = {
              lambda: {
                invocations: Math.floor(1_000_000 * usagePercent),
                gbSeconds: Math.floor(400_000 * usagePercent),
              },
              dynamodb: {
                readUnits: Math.floor(25 * usagePercent),
                writeUnits: Math.floor(25 * usagePercent),
                storage: Math.floor(25 * usagePercent),
              },
              apiGateway: {
                requests: Math.floor(1_000_000 * usagePercent),
              },
            };

            const status = validator.checkComplianceThresholds(usage);

            if (usagePercent >= 0.8) {
              // Should have warnings when at or above 80%
              expect(status.details.warnings).toBeDefined();
              const warnings = status.details.warnings as string[];
              expect(warnings.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
