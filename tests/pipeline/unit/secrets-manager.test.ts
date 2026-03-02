/**
 * Unit Tests for SecretsManager
 * 
 * These tests verify specific examples, edge cases, and error conditions
 * for the secrets management system.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.6
 */

import { SecretsManager } from '../../../pipeline/secrets/SecretsManager';

describe('SecretsManager Unit Tests', () => {
  let secretsManager: SecretsManager;

  beforeEach(() => {
    secretsManager = new SecretsManager();
    // Clear test environment variables
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('TEST_')) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    secretsManager.clearCache();
  });

  describe('getSecret', () => {
    test('should retrieve secret from environment variable', async () => {
      process.env.TEST_SECRET = 'my-secret-value-12345';

      const secret = await secretsManager.getSecret('TEST_SECRET');

      expect(secret).toBe('my-secret-value-12345');
    });

    test('should cache retrieved secrets', async () => {
      process.env.TEST_SECRET = 'cached-secret-value';

      const secret1 = await secretsManager.getSecret('TEST_SECRET');
      delete process.env.TEST_SECRET; // Remove from env
      const secret2 = await secretsManager.getSecret('TEST_SECRET');

      expect(secret1).toBe(secret2);
      expect(secret2).toBe('cached-secret-value');
    });

    test('should throw error for missing secret', async () => {
      await expect(secretsManager.getSecret('NONEXISTENT_SECRET')).rejects.toThrow(
        /not configured/
      );
    });

    test('should throw error for empty secret', async () => {
      process.env.TEST_EMPTY = '';

      await expect(secretsManager.getSecret('TEST_EMPTY')).rejects.toThrow(
        /not configured/
      );
    });

    test('should throw error for whitespace-only secret', async () => {
      process.env.TEST_WHITESPACE = '   ';

      await expect(secretsManager.getSecret('TEST_WHITESPACE')).rejects.toThrow(
        /empty/
      );
    });

    test('should throw error for secret with TODO placeholder', async () => {
      process.env.TEST_TODO = 'TODO-replace-this';

      await expect(secretsManager.getSecret('TEST_TODO')).rejects.toThrow(
        /placeholder/
      );
    });

    test('should throw error for secret with PLACEHOLDER text', async () => {
      process.env.TEST_PLACEHOLDER = 'PLACEHOLDER_VALUE';

      await expect(secretsManager.getSecret('TEST_PLACEHOLDER')).rejects.toThrow(
        /placeholder/
      );
    });

    test('should throw error for secret shorter than 8 characters', async () => {
      process.env.TEST_SHORT = 'short';

      await expect(secretsManager.getSecret('TEST_SHORT')).rejects.toThrow(
        /too short/
      );
    });

    test('should accept valid secret with minimum length', async () => {
      process.env.TEST_VALID = '12345678';

      const secret = await secretsManager.getSecret('TEST_VALID');

      expect(secret).toBe('12345678');
    });
  });

  describe('maskSecretInLogs', () => {
    test('should mask a simple secret', () => {
      const masked = secretsManager.maskSecretInLogs('my-secret-password');

      expect(masked).not.toBe('my-secret-password');
      expect(masked).toContain('*');
    });

    test('should mask empty string safely', () => {
      const masked = secretsManager.maskSecretInLogs('');

      expect(masked).toBe('***');
    });

    test('should mask very long secrets', () => {
      const longSecret = 'a'.repeat(1000);
      const masked = secretsManager.maskSecretInLogs(longSecret);

      expect(masked).not.toContain(longSecret);
      expect(masked).toContain('*');
    });

    test('should mask secrets with special characters', () => {
      const secret = 'p@ssw0rd!#$%^&*()';
      const masked = secretsManager.maskSecretInLogs(secret);

      expect(masked).not.toBe(secret);
      expect(masked).toContain('*');
    });
  });

  describe('maskSecretsInText', () => {
    test('should mask single secret in text', () => {
      const text = 'The password is my-secret-123 and should be hidden';
      const secrets = ['my-secret-123'];

      const masked = secretsManager.maskSecretsInText(text, secrets);

      expect(masked).not.toContain('my-secret-123');
      expect(masked).toContain('*');
    });

    test('should mask multiple secrets in text', () => {
      const text = 'User: admin, Password: secret123, Token: abc-def-ghi';
      const secrets = ['secret123', 'abc-def-ghi'];

      const masked = secretsManager.maskSecretsInText(text, secrets);

      expect(masked).not.toContain('secret123');
      expect(masked).not.toContain('abc-def-ghi');
      expect(masked).toContain('*');
    });

    test('should handle empty secrets array', () => {
      const text = 'No secrets here';
      const masked = secretsManager.maskSecretsInText(text, []);

      expect(masked).toBe(text);
    });

    test('should handle text without secrets', () => {
      const text = 'This text has no secrets';
      const secrets = ['not-in-text'];

      const masked = secretsManager.maskSecretsInText(text, secrets);

      expect(masked).toBe(text);
    });
  });

  describe('validateSecretExists', () => {
    test('should return true for existing secret', () => {
      process.env.TEST_EXISTS = 'some-value';

      const exists = secretsManager.validateSecretExists('TEST_EXISTS');

      expect(exists).toBe(true);
    });

    test('should return false for non-existent secret', () => {
      const exists = secretsManager.validateSecretExists('TEST_DOES_NOT_EXIST');

      expect(exists).toBe(false);
    });

    test('should return true for cached secret', async () => {
      process.env.TEST_CACHED = 'cached-value-12345';
      await secretsManager.getSecret('TEST_CACHED'); // Cache it via getSecret
      delete process.env.TEST_CACHED;

      const exists = secretsManager.validateSecretExists('TEST_CACHED');

      expect(exists).toBe(true);
    });
  });

  describe('validateSecretsExist', () => {
    test('should validate multiple secrets', () => {
      process.env.TEST_SECRET_1 = 'value1-12345';
      process.env.TEST_SECRET_2 = 'value2-12345';

      const results = secretsManager.validateSecretsExist([
        'TEST_SECRET_1',
        'TEST_SECRET_2',
        'TEST_SECRET_3',
      ]);

      expect(results.TEST_SECRET_1).toBe(true);
      expect(results.TEST_SECRET_2).toBe(true);
      expect(results.TEST_SECRET_3).toBe(false);
    });

    test('should return empty object for empty array', () => {
      const results = secretsManager.validateSecretsExist([]);

      expect(results).toEqual({});
    });
  });

  describe('getRequiredSecrets', () => {
    test('should return dev secrets', () => {
      const secrets = secretsManager.getRequiredSecrets('dev');

      expect(secrets).toContain('AWS_ACCESS_KEY_ID_DEV');
      expect(secrets).toContain('AWS_SECRET_ACCESS_KEY_DEV');
      expect(secrets).toContain('SLACK_WEBHOOK_URL');
      expect(secrets).toContain('NOTIFICATION_EMAIL');
      expect(secrets).not.toContain('ANDROID_KEYSTORE_BASE64');
    });

    test('should return staging secrets', () => {
      const secrets = secretsManager.getRequiredSecrets('staging');

      expect(secrets).toContain('AWS_ACCESS_KEY_ID_STAGING');
      expect(secrets).toContain('AWS_SECRET_ACCESS_KEY_STAGING');
      expect(secrets).not.toContain('ANDROID_KEYSTORE_BASE64');
    });

    test('should return production secrets including Android keys', () => {
      const secrets = secretsManager.getRequiredSecrets('production');

      expect(secrets).toContain('AWS_ACCESS_KEY_ID_PRODUCTION');
      expect(secrets).toContain('AWS_SECRET_ACCESS_KEY_PRODUCTION');
      expect(secrets).toContain('ANDROID_KEYSTORE_BASE64');
      expect(secrets).toContain('ANDROID_KEYSTORE_PASSWORD');
      expect(secrets).toContain('ANDROID_KEY_ALIAS');
      expect(secrets).toContain('ANDROID_KEY_PASSWORD');
    });
  });

  describe('validateEnvironmentSecrets', () => {
    test('should throw for missing dev secrets', () => {
      expect(() => secretsManager.validateEnvironmentSecrets('dev')).toThrow(
        /Missing required secrets/
      );
    });

    test('should pass when all dev secrets exist', () => {
      process.env.AWS_ACCESS_KEY_ID_DEV = 'AKIAIOSFODNN7EXAMPLE';
      process.env.AWS_SECRET_ACCESS_KEY_DEV = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX';
      process.env.NOTIFICATION_EMAIL = 'test@example.com';

      expect(() => secretsManager.validateEnvironmentSecrets('dev')).not.toThrow();
    });

    test('should throw for missing production Android secrets', () => {
      process.env.AWS_ACCESS_KEY_ID_PRODUCTION = 'AKIAIOSFODNN7EXAMPLE';
      process.env.AWS_SECRET_ACCESS_KEY_PRODUCTION = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX';
      process.env.NOTIFICATION_EMAIL = 'test@example.com';
      // Missing Android secrets

      expect(() => secretsManager.validateEnvironmentSecrets('production')).toThrow(
        /ANDROID_KEYSTORE_BASE64/
      );
    });
  });

  describe('getAwsCredentials', () => {
    test('should retrieve AWS credentials for dev', async () => {
      process.env.AWS_ACCESS_KEY_ID_DEV = 'AKIAIOSFODNN7DEVTEST';
      process.env.AWS_SECRET_ACCESS_KEY_DEV = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYDEVTEST';

      const creds = await secretsManager.getAwsCredentials('dev');

      expect(creds.accessKeyId).toBe('AKIAIOSFODNN7DEVTEST');
      expect(creds.secretAccessKey).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYDEVTEST');
    });

    test('should retrieve AWS credentials for production', async () => {
      process.env.AWS_ACCESS_KEY_ID_PRODUCTION = 'AKIAIOSFODNN7PRODTEST';
      process.env.AWS_SECRET_ACCESS_KEY_PRODUCTION = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYPRODTEST';

      const creds = await secretsManager.getAwsCredentials('production');

      expect(creds.accessKeyId).toBe('AKIAIOSFODNN7PRODTEST');
      expect(creds.secretAccessKey).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYPRODTEST');
    });
  });

  describe('getAndroidSigningCredentials', () => {
    test('should retrieve Android signing credentials', async () => {
      process.env.ANDROID_KEYSTORE_BASE64 = 'base64encodedkeystore';
      process.env.ANDROID_KEYSTORE_PASSWORD = 'keystore-password-123';
      process.env.ANDROID_KEY_ALIAS = 'my-key-alias';
      process.env.ANDROID_KEY_PASSWORD = 'key-password-456';

      const creds = await secretsManager.getAndroidSigningCredentials();

      expect(creds.keystoreBase64).toBe('base64encodedkeystore');
      expect(creds.keystorePassword).toBe('keystore-password-123');
      expect(creds.keyAlias).toBe('my-key-alias');
      expect(creds.keyPassword).toBe('key-password-456');
    });
  });

  describe('getNotificationCredentials', () => {
    test('should retrieve notification credentials', async () => {
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/TEST';
      process.env.NOTIFICATION_EMAIL = 'notifications@testdomain.com';

      const creds = await secretsManager.getNotificationCredentials();

      expect(creds.slackWebhookUrl).toBe('https://hooks.slack.com/services/TEST');
      expect(creds.notificationEmail).toBe('notifications@testdomain.com');
    });
  });

  describe('needsRotation', () => {
    test('should return true for secret without rotation data', () => {
      const needs = secretsManager.needsRotation('UNKNOWN_SECRET');

      expect(needs).toBe(true);
    });

    test('should return false for recently rotated secret', async () => {
      process.env.TEST_RECENT = 'recent-secret-value';
      await secretsManager.getSecret('TEST_RECENT'); // This sets metadata with lastRotated

      const needs = secretsManager.needsRotation('TEST_RECENT', 90);

      expect(needs).toBe(false);
    });
  });

  describe('getSecretsNeedingRotation', () => {
    test('should return empty array when no secrets tracked', () => {
      const secrets = secretsManager.getSecretsNeedingRotation();

      expect(secrets).toEqual([]);
    });

    test('should identify secrets needing rotation', () => {
      process.env.TEST_OLD = 'old-secret-value';
      secretsManager.validateSecretExists('TEST_OLD');

      // Mock old rotation date
      const metadata = secretsManager.getSecretMetadata('TEST_OLD');
      if (metadata) {
        metadata.lastRotated = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago
      }

      const secrets = secretsManager.getSecretsNeedingRotation(90);

      expect(secrets).toContain('TEST_OLD');
    });
  });

  describe('clearCache', () => {
    test('should clear cached secrets', async () => {
      process.env.TEST_CACHE = 'cached-value-12345';
      await secretsManager.getSecret('TEST_CACHE');
      
      secretsManager.clearCache();
      delete process.env.TEST_CACHE;

      await expect(secretsManager.getSecret('TEST_CACHE')).rejects.toThrow();
    });
  });

  describe('getSecretMetadata', () => {
    test('should return undefined for unknown secret', () => {
      const metadata = secretsManager.getSecretMetadata('UNKNOWN');

      expect(metadata).toBeUndefined();
    });

    test('should return metadata for validated secret', () => {
      process.env.TEST_META = 'metadata-test-value';
      secretsManager.validateSecretExists('TEST_META');

      const metadata = secretsManager.getSecretMetadata('TEST_META');

      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('TEST_META');
      expect(metadata?.exists).toBe(true);
    });
  });
});
