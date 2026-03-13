/**
 * Secrets Management System for MACHER CI/CD Pipeline
 * 
 * This module provides secure secrets handling for the pipeline, including:
 * - Retrieval of secrets from GitHub Secrets and environment variables
 * - Masking of secrets in log output
 * - Validation of secret existence and format
 * - Automatic credential rotation tracking
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.6
 */

import { createLogger } from '../logger';
import { maskSecret } from '../utils';

const logger = createLogger('SecretsManager');

/**
 * Secret metadata for tracking and validation
 */
export interface SecretMetadata {
  name: string;
  exists: boolean;
  lastRotated?: Date;
  expiresAt?: Date;
}

/**
 * Secret validation result
 */
export interface SecretValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Secrets Manager class
 * 
 * Handles secure retrieval, masking, and validation of secrets used in the CI/CD pipeline.
 * Secrets are retrieved from environment variables (GitHub Secrets in CI environment).
 */
export class SecretsManager {
  private secretCache: Map<string, string> = new Map();
  private secretMetadata: Map<string, SecretMetadata> = new Map();

  /**
   * Retrieves a secret value from GitHub Secrets (environment variables)
   * 
   * @param secretName - Name of the secret to retrieve
   * @returns Secret value
   * @throws Error if secret is missing or invalid
   * 
   * Requirements: 8.1, 8.2
   */
  async getSecret(secretName: string): Promise<string> {
    logger.debug(`Retrieving secret: ${secretName}`);

    // Check cache first
    if (this.secretCache.has(secretName)) {
      logger.debug(`Secret found in cache: ${secretName}`);
      return this.secretCache.get(secretName)!;
    }

    // Retrieve from environment variables (GitHub Secrets)
    const secretValue = process.env[secretName];

    if (!secretValue) {
      const error = `Secret not found: ${secretName}`;
      logger.error(error);
      throw new Error(`Secret '${secretName}' is not configured. Please add it to GitHub Secrets.`);
    }

    // Validate secret format
    const validation = this.validateSecretFormat(secretValue);
    if (!validation.valid) {
      const error = `Invalid secret format for ${secretName}: ${validation.error}`;
      logger.error(error);
      throw new Error(`Secret '${secretName}' has invalid format. ${validation.error}`);
    }

    // Cache the secret
    this.secretCache.set(secretName, secretValue);

    // Update metadata
    this.secretMetadata.set(secretName, {
      name: secretName,
      exists: true,
      lastRotated: new Date(),
    });

    logger.info(`Secret retrieved successfully: ${secretName}`);
    return secretValue;
  }

  /**
   * Masks a secret value in log output
   * 
   * Replaces the secret with asterisks, showing only a few characters
   * at the start and end for identification purposes.
   * 
   * @param value - The secret value to mask
   * @returns Masked string safe for logging
   * 
   * Requirements: 8.3
   */
  maskSecretInLogs(value: string): string {
    if (!value) {
      return '***';
    }

    return maskSecret(value);
  }

  /**
   * Masks multiple secrets in a text string
   * 
   * Useful for masking secrets in log messages, error messages, or command output.
   * 
   * @param text - Text that may contain secrets
   * @param secrets - Array of secret values to mask
   * @returns Text with all secrets masked
   * 
   * Requirements: 8.3
   */
  maskSecretsInText(text: string, secrets: string[]): string {
    let maskedText = text;

    for (const secret of secrets) {
      if (secret && secret.length > 0) {
        // Replace all occurrences of the secret with masked version
        const masked = this.maskSecretInLogs(secret);
        maskedText = maskedText.split(secret).join(masked);
      }
    }

    return maskedText;
  }

  /**
   * Validates that a secret exists and is accessible
   * 
   * @param secretName - Name of the secret to validate
   * @returns True if secret exists, false otherwise
   * 
   * Requirements: 8.6
   */
  validateSecretExists(secretName: string): boolean {
    logger.debug(`Validating secret existence: ${secretName}`);

    // Check cache first
    if (this.secretCache.has(secretName)) {
      logger.debug(`Secret exists in cache: ${secretName}`);
      return true;
    }

    // Check environment variables
    const exists = !!process.env[secretName];

    // Update metadata
    this.secretMetadata.set(secretName, {
      name: secretName,
      exists,
    });

    if (exists) {
      logger.debug(`Secret exists: ${secretName}`);
    } else {
      logger.warn(`Secret does not exist: ${secretName}`);
    }

    return exists;
  }

  /**
   * Validates multiple secrets at once
   * 
   * @param secretNames - Array of secret names to validate
   * @returns Object with validation results for each secret
   * 
   * Requirements: 8.6
   */
  validateSecretsExist(secretNames: string[]): Record<string, boolean> {
    logger.info(`Validating ${secretNames.length} secrets`);

    const results: Record<string, boolean> = {};

    for (const secretName of secretNames) {
      results[secretName] = this.validateSecretExists(secretName);
    }

    const missingSecrets = Object.entries(results)
      .filter(([_, exists]) => !exists)
      .map(([name]) => name);

    if (missingSecrets.length > 0) {
      logger.warn(`Missing secrets: ${missingSecrets.join(', ')}`);
    } else {
      logger.info('All secrets validated successfully');
    }

    return results;
  }

  /**
   * Validates the format of a secret value
   * 
   * Checks for common issues like empty values, placeholder text, etc.
   * 
   * @param value - Secret value to validate
   * @returns Validation result
   */
  private validateSecretFormat(value: string): SecretValidationResult {
    // Check for empty or whitespace-only values
    if (!value || value.trim().length === 0) {
      return {
        valid: false,
        error: 'Secret value is empty or contains only whitespace',
      };
    }

    // Check for placeholder values
    const placeholders = [
      'TODO',
      'CHANGEME',
      'PLACEHOLDER',
      'XXX',
      'REPLACE_ME',
      'YOUR_',
      '<YOUR',
      'EXAMPLE',
    ];

    const upperValue = value.toUpperCase();
    for (const placeholder of placeholders) {
      if (upperValue.includes(placeholder)) {
        return {
          valid: false,
          error: `Secret contains placeholder text: ${placeholder}`,
        };
      }
    }

    // Check minimum length (secrets should be reasonably long)
    if (value.length < 8) {
      return {
        valid: false,
        error: 'Secret value is too short (minimum 8 characters)',
      };
    }

    return { valid: true };
  }

  /**
   * Gets metadata for a secret
   * 
   * @param secretName - Name of the secret
   * @returns Secret metadata or undefined if not found
   */
  getSecretMetadata(secretName: string): SecretMetadata | undefined {
    return this.secretMetadata.get(secretName);
  }

  /**
   * Clears the secret cache
   * 
   * Should be called after pipeline execution to ensure secrets are not kept in memory.
   */
  clearCache(): void {
    logger.info('Clearing secret cache');
    this.secretCache.clear();
  }

  /**
   * Gets all required secrets for a specific environment
   * 
   * @param environment - Target environment (dev, staging, production)
   * @returns Array of required secret names
   */
  getRequiredSecrets(environment: 'dev' | 'staging' | 'production'): string[] {
    const commonSecrets = [
      'SLACK_WEBHOOK_URL',
      'NOTIFICATION_EMAIL',
    ];

    const environmentSecrets = [
      `AWS_ACCESS_KEY_ID_${environment.toUpperCase()}`,
      `AWS_SECRET_ACCESS_KEY_${environment.toUpperCase()}`,
    ];

    const androidSecrets = environment === 'production'
      ? [
          'ANDROID_KEYSTORE_BASE64',
          'ANDROID_KEYSTORE_PASSWORD',
          'ANDROID_KEY_ALIAS',
          'ANDROID_KEY_PASSWORD',
        ]
      : [];

    return [...commonSecrets, ...environmentSecrets, ...androidSecrets];
  }

  /**
   * Validates all required secrets for an environment
   * 
   * @param environment - Target environment
   * @returns True if all required secrets exist, false otherwise
   * @throws Error with details of missing secrets
   * 
   * Requirements: 8.6
   */
  validateEnvironmentSecrets(environment: 'dev' | 'staging' | 'production'): boolean {
    logger.info(`Validating secrets for environment: ${environment}`);

    const requiredSecrets = this.getRequiredSecrets(environment);
    const validationResults = this.validateSecretsExist(requiredSecrets);

    const missingSecrets = Object.entries(validationResults)
      .filter(([_, exists]) => !exists)
      .map(([name]) => name);

    if (missingSecrets.length > 0) {
      const error = `Missing required secrets for ${environment}: ${missingSecrets.join(', ')}`;
      logger.error(error);
      throw new Error(error);
    }

    logger.info(`All required secrets validated for ${environment}`);
    return true;
  }

  /**
   * Retrieves AWS credentials for a specific environment
   * 
   * @param environment - Target environment
   * @returns Object with AWS access key ID and secret access key
   * 
   * Requirements: 8.1
   */
  async getAwsCredentials(environment: 'dev' | 'staging' | 'production'): Promise<{
    accessKeyId: string;
    secretAccessKey: string;
  }> {
    logger.info(`Retrieving AWS credentials for environment: ${environment}`);

    const envUpper = environment.toUpperCase();
    const accessKeyId = await this.getSecret(`AWS_ACCESS_KEY_ID_${envUpper}`);
    const secretAccessKey = await this.getSecret(`AWS_SECRET_ACCESS_KEY_${envUpper}`);

    return {
      accessKeyId,
      secretAccessKey,
    };
  }

  /**
   * Retrieves Android signing credentials
   * 
   * @returns Object with keystore and signing information
   * 
   * Requirements: 8.2
   */
  async getAndroidSigningCredentials(): Promise<{
    keystoreBase64: string;
    keystorePassword: string;
    keyAlias: string;
    keyPassword: string;
  }> {
    logger.info('Retrieving Android signing credentials');

    const keystoreBase64 = await this.getSecret('ANDROID_KEYSTORE_BASE64');
    const keystorePassword = await this.getSecret('ANDROID_KEYSTORE_PASSWORD');
    const keyAlias = await this.getSecret('ANDROID_KEY_ALIAS');
    const keyPassword = await this.getSecret('ANDROID_KEY_PASSWORD');

    return {
      keystoreBase64,
      keystorePassword,
      keyAlias,
      keyPassword,
    };
  }

  /**
   * Retrieves notification credentials
   * 
   * @returns Object with Slack webhook URL and notification email
   * 
   * Requirements: 8.1
   */
  async getNotificationCredentials(): Promise<{
    slackWebhookUrl: string;
    notificationEmail: string;
  }> {
    logger.info('Retrieving notification credentials');

    const slackWebhookUrl = await this.getSecret('SLACK_WEBHOOK_URL');
    const notificationEmail = await this.getSecret('NOTIFICATION_EMAIL');

    return {
      slackWebhookUrl,
      notificationEmail,
    };
  }

  /**
   * Checks if credentials need rotation based on age
   * 
   * @param secretName - Name of the secret to check
   * @param maxAgeDays - Maximum age in days before rotation is needed (default: 90)
   * @returns True if rotation is needed, false otherwise
   * 
   * Requirements: 8.5
   */
  needsRotation(secretName: string, maxAgeDays: number = 90): boolean {
    const metadata = this.secretMetadata.get(secretName);

    if (!metadata || !metadata.lastRotated) {
      // If we don't have rotation data, assume rotation is needed
      logger.warn(`No rotation data for secret: ${secretName}`);
      return true;
    }

    const ageInMs = Date.now() - metadata.lastRotated.getTime();
    const ageInDays = ageInMs / (1000 * 60 * 60 * 24);

    const needsRotation = ageInDays > maxAgeDays;

    if (needsRotation) {
      logger.warn(`Secret ${secretName} needs rotation (age: ${Math.floor(ageInDays)} days)`);
    }

    return needsRotation;
  }

  /**
   * Checks all secrets for rotation needs
   * 
   * @param maxAgeDays - Maximum age in days before rotation is needed (default: 90)
   * @returns Array of secret names that need rotation
   * 
   * Requirements: 8.5
   */
  getSecretsNeedingRotation(maxAgeDays: number = 90): string[] {
    const secretsNeedingRotation: string[] = [];

    for (const [secretName] of this.secretMetadata) {
      if (this.needsRotation(secretName, maxAgeDays)) {
        secretsNeedingRotation.push(secretName);
      }
    }

    if (secretsNeedingRotation.length > 0) {
      logger.warn(`Secrets needing rotation: ${secretsNeedingRotation.join(', ')}`);
    }

    return secretsNeedingRotation;
  }
}

/**
 * Default SecretsManager instance
 */
export const secretsManager = new SecretsManager();

/**
 * Creates a new SecretsManager instance
 * 
 * Useful for testing or when you need isolated secret management.
 */
export function createSecretsManager(): SecretsManager {
  return new SecretsManager();
}
