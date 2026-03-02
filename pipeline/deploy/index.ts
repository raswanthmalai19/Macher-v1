/**
 * Deployment utilities for VocalShield CI/CD Pipeline
 * 
 * This module exports deployment-related classes and utilities.
 */

export { FreeTierValidator } from './FreeTierValidator';
export type {
  LambdaConfig,
  DynamoDBConfig,
  APIGatewayConfig,
  CloudFormationTemplate,
} from './FreeTierValidator';

export { BootstrapChecker } from './BootstrapChecker';
export { CDKDeployer } from './CDKDeployer';

export { AndroidBuilder } from './AndroidBuilder';
export type {
  Keystore,
  APKArtifact,
  SignedAPK,
  UploadResult,
} from './AndroidBuilder';

export { BlueGreenManager } from './BlueGreenManager';
export type {
  StackInfo,
  BuildArtifacts,
  MetricsReport,
  DeploymentConfig,
} from './BlueGreenManager';

export { RollbackManager } from './RollbackManager';
export type {
  DeploymentHistory,
  RollbackResult,
} from './RollbackManager';

export { MigrationManager } from './MigrationManager';
export type {
  Migration,
  MigrationResult,
  BackupInfo,
  ValidationResult,
} from './MigrationManager';

export { DriftDetector } from './DriftDetector';
export type {
  DriftHistoryEntry,
  RemediationStrategy,
} from './DriftDetector';
