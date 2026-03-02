/**
 * Property-Based Tests for Secrets Management
 * 
 * These tests verify universal properties of the secrets management system
 * using randomized test data to ensure correctness across all inputs.
 * 
 * Requirements: 8.3, 8.6
 */

import * as fc from 'fast-check';
import { SecretsManager } from '../../../pipeline/secrets/SecretsManager';

describe('Secrets Management Property Tests', () => {
  let secretsManager: SecretsManager;

  beforeEach(() => {
    secretsManager = new SecretsManager();
    // Clear environment variables
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('TEST_SECRET_')) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    secretsManager.clearCache();
  });

  /**
   * Feature: deployment-cicd-pipeline, Property 36: Secret masking
   * 
   * For any secret value used in the pipeline, all occurrences in logs
   * should be masked or redacted.
   * 
   * Validates: Requirements 8.3
   */
  describe('Property 36: Secret masking', () => {
    test('masked secrets should never contain the original secret value', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 8, maxLength: 100 }),
          (secretValue) => {
            const masked = secretsManager.maskSecretInLogs(secretValue);

            // The masked value should not contain the original secret
            expect(masked).not.toBe(secretValue);
            
            // If secret is long enough, masked value should not contain it
            if (secretValue.length > 4) {
              expect(masked).not.toContain(secretValue);
            }

            // Masked value should contain asterisks
            expect(masked).toContain('*');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('masking should be consistent for the same secret', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 8, maxLength: 100 }),
          (secretValue) => {
            const masked1 = secretsManager.maskSecretInLogs(secretValue);
            const masked2 = secretsManager.maskSecretInLogs(secretValue);

            // Same secret should produce same masked output
            expect(masked1).toBe(masked2);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('masking multiple secrets in text should remove all occurrences', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 10, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
          fc.string({ minLength: 20, maxLength: 100 }),
          (secrets, text) => {
            // Create text containing secrets
            const textWithSecrets = secrets.reduce((acc, secret, idx) => {
              return `${acc} secret${idx}=${secret} `;
            }, text);

            const maskedText = secretsManager.maskSecretsInText(textWithSecrets, secrets);

            // None of the original secrets should appear in masked text
            for (const secret of secrets) {
              if (secret.length > 0) {
                expect(maskedText).not.toContain(secret);
              }
            }

            // Masked text should contain asterisks
            if (secrets.some(s => s.length > 0)) {
              expect(maskedText).toContain('*');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('empty or very short secrets should be masked safely', () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 3 }),
          (secretValue) => {
            const masked = secretsManager.maskSecretInLogs(secretValue);

            // Should return a safe masked value
            expect(typeof masked).toBe('string');
            expect(masked.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('secrets with special characters should be masked correctly', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10, maxLength: 50 }),
          (secretValue) => {
            // Add special characters
            const secretWithSpecial = `${secretValue}!@#$%^&*()`;
            const masked = secretsManager.maskSecretInLogs(secretWithSpecial);

            // Original secret should not appear in masked value
            expect(masked).not.toContain(secretWithSpecial);
            expect(masked).toContain('*');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: deployment-cicd-pipeline, Property 39: Secret validation
   * 
   * For any missing or invalid secret, the pipeline should fail immediately
   * with an error message that does not reveal secret details.
   * 
   * Validates: Requirements 8.6
   */
  describe('Property 39: Secret validation', () => {
    test('validateSecretExists should return false for non-existent secrets', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 50 }).filter(s => !process.env[s]),
          (secretName) => {
            const exists = secretsManager.validateSecretExists(secretName);

            // Non-existent secret should return false
            expect(exists).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('validateSecretExists should return true for existing secrets', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 50 }),
          fc.string({ minLength: 10, maxLength: 100 }),
          (secretName, secretValue) => {
            // Set the secret in environment
            const envKey = `TEST_SECRET_${secretName}`;
            process.env[envKey] = secretValue;

            const exists = secretsManager.validateSecretExists(envKey);

            // Existing secret should return true
            expect(exists).toBe(true);

            // Clean up
            delete process.env[envKey];
          }
        ),
        { numRuns: 100 }
      );
    });

    test('getSecret should throw for missing secrets without revealing details', () => {
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 50 }).filter(s => !process.env[s]),
          async (secretName) => {
            // Attempting to get non-existent secret should throw
            await expect(secretsManager.getSecret(secretName)).rejects.toThrow();

            // Error message should not contain sensitive information
            try {
              await secretsManager.getSecret(secretName);
            } catch (error: any) {
              // Error should mention the secret name but not reveal other secrets
              expect(error.message).toContain(secretName);
              // Error should not contain actual secret values from environment
              const envSecrets = Object.values(process.env).filter(v => v && v.length > 10);
              for (const secret of envSecrets) {
                expect(error.message).not.toContain(secret as string);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('getSecret should reject secrets with placeholder values', () => {
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.constantFrom('TODO', 'PLACEHOLDER', 'CHANGEME', 'XXX', 'REPLACE_ME'),
          async (secretName, placeholder) => {
            const envKey = `TEST_SECRET_${secretName}`;
            process.env[envKey] = placeholder;

            // Should throw for placeholder values
            await expect(secretsManager.getSecret(envKey)).rejects.toThrow();

            // Clean up
            delete process.env[envKey];
          }
        ),
        { numRuns: 100 }
      );
    });

    test('getSecret should reject secrets that are too short', () => {
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 7 }),
          async (secretName, shortSecret) => {
            const envKey = `TEST_SECRET_${secretName}`;
            process.env[envKey] = shortSecret;

            // Should throw for short secrets
            await expect(secretsManager.getSecret(envKey)).rejects.toThrow();

            // Clean up
            delete process.env[envKey];
          }
        ),
        { numRuns: 100 }
      );
    });

    test('validateSecretsExist should correctly identify missing secrets', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 5, maxLength: 20 }), { minLength: 2, maxLength: 10 }),
          (secretNames) => {
            // Make unique secret names
            const uniqueNames = [...new Set(secretNames)].map(name => `TEST_SECRET_${name}`);
            
            // Set only half of them
            const halfIndex = Math.floor(uniqueNames.length / 2);
            for (let i = 0; i < halfIndex; i++) {
              process.env[uniqueNames[i]] = `value_${i}_${Math.random()}`;
            }

            const results = secretsManager.validateSecretsExist(uniqueNames);

            // First half should exist
            for (let i = 0; i < halfIndex; i++) {
              expect(results[uniqueNames[i]]).toBe(true);
            }

            // Second half should not exist
            for (let i = halfIndex; i < uniqueNames.length; i++) {
              expect(results[uniqueNames[i]]).toBe(false);
            }

            // Clean up
            uniqueNames.forEach(name => delete process.env[name]);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('validateEnvironmentSecrets should fail for missing required secrets', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('dev' as const, 'staging' as const, 'production' as const),
          (environment) => {
            // Don't set any secrets
            const requiredSecrets = secretsManager.getRequiredSecrets(environment);
            
            // Clear any that might exist
            requiredSecrets.forEach(name => delete process.env[name]);

            // Should throw because secrets are missing
            expect(() => secretsManager.validateEnvironmentSecrets(environment)).toThrow();
          }
        ),
        { numRuns: 30 } // Fewer runs since this tests 3 environments
      );
    });
  });
});
