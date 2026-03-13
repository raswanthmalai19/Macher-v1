/**
 * Configuration Management System for MACHER CI/CD Pipeline
 * 
 * This module provides configuration loading, validation, merging, and
 * Free Tier compliance checking for environment-specific deployments.
 * 
 * Requirements: 2.2, 7.1, 7.4, 7.5, 11.1, 11.2, 11.3, 11.4, 11.5
 */

import * as fs from 'fs';
import * as path from 'path';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import {
  Environment,
  EnvironmentConfig,
  ValidationResult,
  ComplianceResult,
  ComplianceWarning,
  ComplianceViolation,
} from '../types';

/**
 * Free Tier limits for AWS services
 */
const FREE_TIER_LIMITS = {
  lambda: {
    maxMemoryMB: 3008,
    maxTimeoutSeconds: 300,
  },
  dynamodb: {
    requiredBillingMode: 'PAY_PER_REQUEST' as const,
  },
} as const;

/**
 * ConfigurationManager handles loading, validation, merging, and compliance
 * checking of environment-specific configurations.
 */
export class ConfigurationManager {
  private ajv: Ajv;
  private validator: ValidateFunction | null = null;
  private configDir: string;
  private schemaPath: string;

  /**
   * Creates a new ConfigurationManager instance
   * 
   * @param configDir - Directory containing configuration files (default: 'config')
   * @param schemaPath - Path to JSON schema file (default: 'config/schema.json')
   */
  constructor(
    configDir: string = 'config',
    schemaPath: string = 'config/schema.json'
  ) {
    this.configDir = configDir;
    this.schemaPath = schemaPath;
    this.ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(this.ajv);
  }

  /**
   * Loads environment-specific configuration by merging common and
   * environment-specific configuration files.
   * 
   * Requirements: 2.2, 7.1
   * 
   * @param environment - Target environment (dev, staging, production)
   * @returns Merged and validated environment configuration
   * @throws Error if configuration files are missing or invalid
   */
  loadConfig(environment: Environment): EnvironmentConfig {
    // Load common configuration
    const commonPath = path.join(this.configDir, 'common.json');
    if (!fs.existsSync(commonPath)) {
      throw new Error(`Common configuration file not found: ${commonPath}`);
    }
    const commonConfig = JSON.parse(fs.readFileSync(commonPath, 'utf-8'));

    // Load environment-specific configuration
    const envPath = path.join(this.configDir, `${environment}.json`);
    if (!fs.existsSync(envPath)) {
      throw new Error(
        `Environment configuration file not found: ${envPath}`
      );
    }
    const envConfig = JSON.parse(fs.readFileSync(envPath, 'utf-8'));

    // Merge configurations
    const mergedConfig = this.mergeConfigs(commonConfig, envConfig);

    // Validate merged configuration
    const validation = this.validateConfig(mergedConfig);
    if (!validation.valid) {
      throw new Error(
        `Configuration validation failed:\n${validation.errors.join('\n')}`
      );
    }

    // Type assertion is safe here because validation passed
    return mergedConfig as unknown as EnvironmentConfig;
  }

  /**
   * Validates configuration against the JSON schema.
   * 
   * Requirements: 7.4, 7.5
   * 
   * @param config - Configuration object to validate
   * @returns Validation result with errors and warnings
   */
  validateConfig(config: unknown): ValidationResult {
    // Load and compile schema if not already done
    if (!this.validator) {
      if (!fs.existsSync(this.schemaPath)) {
        return {
          valid: false,
          errors: [`Schema file not found: ${this.schemaPath}`],
          warnings: [],
        };
      }

      const schema = JSON.parse(fs.readFileSync(this.schemaPath, 'utf-8'));
      this.validator = this.ajv.compile(schema);
    }

    // Validate configuration
    const valid = this.validator(config);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!valid && this.validator.errors) {
      for (const error of this.validator.errors) {
        const path = error.instancePath || 'root';
        const message = error.message || 'validation error';
        errors.push(`${path}: ${message}`);
      }
    }

    // Check for placeholder values
    const configStr = JSON.stringify(config);
    if (
      configStr.includes('PLACEHOLDER') ||
      configStr.includes('TODO') ||
      configStr.includes('CHANGEME')
    ) {
      errors.push(
        'Configuration contains placeholder values (PLACEHOLDER, TODO, or CHANGEME)'
      );
    }

    // Check for invalid account ID
    if (
      typeof config === 'object' &&
      config !== null &&
      'aws' in config &&
      typeof config.aws === 'object' &&
      config.aws !== null &&
      'account' in config.aws
    ) {
      const account = (config.aws as { account: string }).account;
      if (account === '123456789012' || account === '000000000000') {
        warnings.push(
          `AWS account ID appears to be a placeholder: ${account}`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Merges common and environment-specific configurations.
   * Environment-specific values override common values.
   * 
   * Requirements: 2.2, 7.1
   * 
   * @param common - Common configuration shared across environments
   * @param envSpecific - Environment-specific configuration overrides
   * @returns Merged configuration object
   */
  mergeConfigs(
    common: Record<string, unknown>,
    envSpecific: Record<string, unknown>
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = {};

    // Start with common config
    for (const key in common) {
      merged[key] = this.deepClone(common[key]);
    }

    // Override with environment-specific config
    for (const key in envSpecific) {
      if (
        key in merged &&
        this.isPlainObject(merged[key]) &&
        this.isPlainObject(envSpecific[key])
      ) {
        // Deep merge objects
        merged[key] = this.mergeConfigs(
          merged[key] as Record<string, unknown>,
          envSpecific[key] as Record<string, unknown>
        );
      } else {
        // Override primitive values and arrays
        merged[key] = this.deepClone(envSpecific[key]);
      }
    }

    return merged;
  }

  /**
   * Validates configuration against AWS Free Tier limits.
   * 
   * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
   * 
   * @param config - Environment configuration to validate
   * @returns Compliance result with warnings and violations
   */
  validateFreeTierCompliance(config: EnvironmentConfig): ComplianceResult {
    const warnings: ComplianceWarning[] = [];
    const violations: ComplianceViolation[] = [];

    // Validate Lambda memory size (Requirement 11.1)
    if (config.lambda.memorySize > FREE_TIER_LIMITS.lambda.maxMemoryMB) {
      violations.push({
        resource: 'Lambda.memorySize',
        message: `Lambda memory size exceeds Free Tier limit`,
        limit: FREE_TIER_LIMITS.lambda.maxMemoryMB,
        configuredValue: config.lambda.memorySize,
        recommendation: `Reduce memory size to ${FREE_TIER_LIMITS.lambda.maxMemoryMB} MB or less`,
      });
    } else if (
      config.lambda.memorySize >
      FREE_TIER_LIMITS.lambda.maxMemoryMB * 0.8
    ) {
      warnings.push({
        resource: 'Lambda.memorySize',
        message: `Lambda memory size is approaching Free Tier limit`,
        threshold: FREE_TIER_LIMITS.lambda.maxMemoryMB,
        currentValue: config.lambda.memorySize,
        severity: 'medium',
      });
    }

    // Validate Lambda timeout (Requirement 11.2)
    if (config.lambda.timeout > FREE_TIER_LIMITS.lambda.maxTimeoutSeconds) {
      violations.push({
        resource: 'Lambda.timeout',
        message: `Lambda timeout exceeds Free Tier limit`,
        limit: FREE_TIER_LIMITS.lambda.maxTimeoutSeconds,
        configuredValue: config.lambda.timeout,
        recommendation: `Reduce timeout to ${FREE_TIER_LIMITS.lambda.maxTimeoutSeconds} seconds or less`,
      });
    } else if (
      config.lambda.timeout >
      FREE_TIER_LIMITS.lambda.maxTimeoutSeconds * 0.8
    ) {
      warnings.push({
        resource: 'Lambda.timeout',
        message: `Lambda timeout is approaching Free Tier limit`,
        threshold: FREE_TIER_LIMITS.lambda.maxTimeoutSeconds,
        currentValue: config.lambda.timeout,
        severity: 'low',
      });
    }

    // Validate Lambda architecture (implicit Free Tier optimization)
    if (config.lambda.architecture !== 'arm64') {
      warnings.push({
        resource: 'Lambda.architecture',
        message: `Lambda architecture is not ARM64 (20% cost savings)`,
        threshold: 0,
        currentValue: 0,
        severity: 'low',
      });
    }

    // Validate DynamoDB billing mode (Requirement 11.4)
    if (
      config.dynamodb.billingMode !==
      FREE_TIER_LIMITS.dynamodb.requiredBillingMode
    ) {
      violations.push({
        resource: 'DynamoDB.billingMode',
        message: `DynamoDB billing mode must be PAY_PER_REQUEST for Free Tier`,
        limit: 0,
        configuredValue: 0,
        recommendation: `Set billingMode to "PAY_PER_REQUEST"`,
      });
    }

    // Validate DynamoDB point-in-time recovery (cost optimization)
    if (config.dynamodb.pointInTimeRecovery) {
      warnings.push({
        resource: 'DynamoDB.pointInTimeRecovery',
        message: `Point-in-time recovery is enabled (incurs additional costs)`,
        threshold: 0,
        currentValue: 1,
        severity: 'medium',
      });
    }

    // Validate CloudWatch log retention (cost optimization)
    if (config.monitoring.logRetentionDays > 7) {
      warnings.push({
        resource: 'Monitoring.logRetentionDays',
        message: `Log retention exceeds Free Tier recommendation (7 days)`,
        threshold: 7,
        currentValue: config.monitoring.logRetentionDays,
        severity: 'low',
      });
    }

    return {
      compliant: violations.length === 0,
      warnings,
      violations,
    };
  }

  /**
   * Deep clones an object to avoid reference sharing
   */
  private deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepClone(item)) as unknown as T;
    }

    const cloned: Record<string, unknown> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = this.deepClone((obj as Record<string, unknown>)[key]);
      }
    }

    return cloned as T;
  }

  /**
   * Checks if a value is a plain object (not an array or null)
   */
  private isPlainObject(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.prototype.toString.call(value) === '[object Object]'
    );
  }
}
