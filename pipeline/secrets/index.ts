/**
 * Secrets Management Module
 * 
 * Exports the SecretsManager class and related utilities for secure
 * secrets handling in the VocalShield CI/CD pipeline.
 */

export {
  SecretsManager,
  secretsManager,
  createSecretsManager,
  type SecretMetadata,
  type SecretValidationResult,
} from './SecretsManager';
