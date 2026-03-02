/**
 * Core type definitions for VocalShield CI/CD Pipeline
 * 
 * This module defines the foundational types and interfaces used throughout
 * the pipeline system, ensuring type safety and consistency across all components.
 */

/**
 * Supported deployment environments
 */
export type Environment = 'dev' | 'staging' | 'production';

/**
 * Pipeline execution stages
 */
export type PipelineStage = 'test' | 'build' | 'deploy' | 'verify';

/**
 * Pipeline execution status
 */
export type PipelineStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'rolled_back';

/**
 * Stage execution status
 */
export type StageStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

/**
 * Notification types
 */
export type NotificationType = 'success' | 'failure' | 'warning' | 'approval_required';

/**
 * Notification priority levels
 */
export type NotificationPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Drift detection status
 */
export type DriftStatus = 'IN_SYNC' | 'DRIFTED' | 'UNKNOWN';

/**
 * Drift type for resources
 */
export type DriftType = 'MODIFIED' | 'DELETED' | 'NOT_IN_STACK';

/**
 * Cost trend direction
 */
export type CostTrend = 'increasing' | 'stable' | 'decreasing';

/**
 * Compliance severity levels
 */
export type ComplianceSeverity = 'low' | 'medium' | 'high';

/**
 * Environment-specific configuration
 */
export interface EnvironmentConfig {
  environment: Environment;
  aws: {
    region: string;
    account: string;
  };
  lambda: {
    memorySize: number;      // MB, must be Free Tier compliant
    timeout: number;         // seconds, must be Free Tier compliant
    runtime: string;         // 'nodejs20.x' or 'python3.12'
    architecture: 'arm64';   // ARM64 for cost efficiency
  };
  dynamodb: {
    billingMode: 'PAY_PER_REQUEST';
    pointInTimeRecovery: boolean;
  };
  apiGateway: {
    throttling: {
      rateLimit: number;
      burstLimit: number;
    };
  };
  monitoring: {
    logRetentionDays: number;
    alarmEmail: string;
  };
  android: {
    versionCode: number;
    versionName: string;
    signingKeyAlias: string;
  };
}

/**
 * Configuration validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Free Tier compliance result
 */
export interface ComplianceResult {
  compliant: boolean;
  warnings: ComplianceWarning[];
  violations: ComplianceViolation[];
}

/**
 * Compliance warning
 */
export interface ComplianceWarning {
  resource: string;
  message: string;
  threshold: number;
  currentValue: number;
  severity: ComplianceSeverity;
}

/**
 * Compliance violation
 */
export interface ComplianceViolation {
  resource: string;
  message: string;
  limit: number;
  configuredValue: number;
  recommendation: string;
}

/**
 * Test execution result
 */
export interface TestResult {
  testSuite: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  coverage: {
    lines: number;
    branches: number;
    functions: number;
    statements: number;
  };
  failures: TestFailure[];
}

/**
 * Individual test failure details
 */
export interface TestFailure {
  testName: string;
  errorMessage: string;
  stackTrace: string;
  expectedValue?: unknown;
  actualValue?: unknown;
}

/**
 * CDK deployment result
 */
export interface DeploymentResult {
  success: boolean;
  stackName: string;
  stackOutputs: Record<string, string>;
  duration: number;
  error?: string;
}

/**
 * Rollback result
 */
export interface RollbackResult {
  success: boolean;
  previousVersion: string;
  duration: number;
  error?: string;
}

/**
 * Bootstrap result
 */
export interface BootstrapResult {
  success: boolean;
  version: number;
  error?: string;
}

/**
 * CloudFormation changeset
 */
export interface ChangeSet {
  stackName: string;
  changes: StackChange[];
  requiresApproval: boolean;
}

/**
 * Individual stack change
 */
export interface StackChange {
  action: 'Add' | 'Modify' | 'Remove';
  resourceType: string;
  logicalResourceId: string;
  physicalResourceId?: string;
  replacement?: boolean;
}

/**
 * Drift detection result
 */
export interface DriftResult {
  stackName: string;
  driftStatus: DriftStatus;
  driftedResources: DriftedResource[];
  detectionTime: Date;
}

/**
 * Drifted resource details
 */
export interface DriftedResource {
  logicalResourceId: string;
  physicalResourceId: string;
  resourceType: string;
  driftType: DriftType;
  propertyDifferences: PropertyDifference[];
}

/**
 * Property difference in drifted resource
 */
export interface PropertyDifference {
  propertyPath: string;
  expectedValue: unknown;
  actualValue: unknown;
  differenceType: 'ADD' | 'REMOVE' | 'NOT_EQUAL';
}

/**
 * Deployment metadata
 */
export interface DeploymentMetadata {
  deploymentId: string;
  environment: Environment;
  version: string;
  commitHash: string;
  commitMessage: string;
  author: string;
  timestamp: Date;
  status: PipelineStatus;
  duration: number;
  stackOutputs: Record<string, string>;
  artifacts: {
    lambdaPackages: string[];
    androidAPK: string;
  };
  testResults: {
    unit: TestResult;
    property: TestResult;
    integration: TestResult;
    smoke: TestResult;
  };
  costReport?: CostReport;
  driftStatus?: DriftResult;
}

/**
 * Pipeline execution state
 */
export interface PipelineState {
  runId: string;
  workflow: string;
  branch: string;
  triggeredBy: string;
  startTime: Date;
  currentStage: string;
  stages: StageStatusInfo[];
  environment: Environment;
  approvalRequired: boolean;
  approvedBy?: string;
  approvalTime?: Date;
}

/**
 * Stage status information
 */
export interface StageStatusInfo {
  name: string;
  status: StageStatus;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  logs: string;
  artifacts: string[];
}

/**
 * Notification payload
 */
export interface NotificationPayload {
  type: NotificationType;
  priority: NotificationPriority;
  environment: Environment;
  commitHash: string;
  timestamp: Date;
  message: string;
  details: Record<string, unknown>;
  logsUrl: string;
}

/**
 * Cost report
 */
export interface CostReport {
  environment: Environment;
  period: DateRange;
  totalCost: number;
  freeTierUsage: {
    lambda: {
      invocations: number;
      duration: number;
      percentOfLimit: number;
    };
    dynamodb: {
      readUnits: number;
      writeUnits: number;
      storage: number;
      percentOfLimit: number;
    };
    apiGateway: {
      requests: number;
      percentOfLimit: number;
    };
  };
  resourceBreakdown: Record<string, number>;
  trend: CostTrend;
}

/**
 * Date range
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Free Tier compliance status
 */
export interface FreeTierCompliance {
  compliant: boolean;
  warnings: ComplianceWarning[];
  violations: ComplianceViolation[];
  resourceChecks: ResourceCheck[];
  estimatedMonthlyCost: number;
  freeTierRemaining: {
    lambda: {
      invocations: number;
      gbSeconds: number;
    };
    dynamodb: {
      readUnits: number;
      writeUnits: number;
      storage: number;
    };
    apiGateway: {
      requests: number;
    };
  };
}

/**
 * Resource compliance check
 */
export interface ResourceCheck {
  resourceType: string;
  resourceName: string;
  compliant: boolean;
  message: string;
}

/**
 * Deployment history entry
 */
export interface DeploymentHistory {
  version: string;
  timestamp: Date;
  stackName: string;
  templateHash: string;
  lambdaVersions: Map<string, string>;
  configSnapshot: EnvironmentConfig;
}

/**
 * Smoke test definition
 */
export interface SmokeTest {
  name: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  expectedStatus: number;
  timeout: number;
  retries: number;
}

/**
 * Build artifact
 */
export interface BuildArtifact {
  name: string;
  path: string;
  version: string;
  hash: string;
  size: number;
}

/**
 * APK artifact
 */
export interface APKArtifact extends BuildArtifact {
  variant: 'debug' | 'release';
  signed: boolean;
  versionCode: number;
  versionName: string;
}

/**
 * Migration definition
 */
export interface Migration {
  id: string;
  version: number;
  description: string;
  upScript: string;
  downScript: string;
  checksum: string;
}

/**
 * Migration result
 */
export interface MigrationResult {
  success: boolean;
  migration: Migration;
  duration: number;
  error?: string;
}

/**
 * Blue-green deployment configuration
 */
export interface BlueGreenDeployment {
  blueStack: string;
  greenStack: string;
  trafficSplitPercent: number;
  monitoringPeriod: number;
  rollbackThreshold: {
    errorRate: number;
    latencyP99: number;
  };
}

/**
 * Metrics report
 */
export interface MetricsReport {
  stackName: string;
  period: DateRange;
  errorRate: number;
  latencyP50: number;
  latencyP99: number;
  requestCount: number;
  healthy: boolean;
}

/**
 * Upload result
 */
export interface UploadResult {
  success: boolean;
  url: string;
  error?: string;
}

/**
 * Stack information
 */
export interface StackInfo {
  stackName: string;
  stackId: string;
  status: string;
  outputs: Record<string, string>;
  creationTime: Date;
}

/**
 * CDK context
 */
export interface CDKContext {
  environment: Environment;
  [key: string]: unknown;
}

/**
 * Backup information
 */
export interface BackupInfo {
  backupId: string;
  tableName: string;
  timestamp: Date;
  size: number;
}

/**
 * Cost estimate
 */
export interface CostEstimate {
  estimatedMonthlyCost: number;
  breakdown: Record<string, number>;
  freeTierEligible: boolean;
}

/**
 * AWS usage metrics
 */
export interface AWSUsage {
  lambda: {
    invocations: number;
    gbSeconds: number;
  };
  dynamodb: {
    readUnits: number;
    writeUnits: number;
    storage: number;
  };
  apiGateway: {
    requests: number;
  };
}

/**
 * Trend report
 */
export interface TrendReport {
  environment: Environment;
  metric: string;
  dataPoints: DataPoint[];
  trend: CostTrend;
}

/**
 * Data point for trends
 */
export interface DataPoint {
  timestamp: Date;
  value: number;
}

/**
 * Compliance status
 */
export interface ComplianceStatus {
  compliant: boolean;
  message: string;
  details: Record<string, unknown>;
}

/**
 * Coverage report
 */
export interface CoverageReport {
  coverage: {
    lines: number;
    branches: number;
    functions: number;
    statements: number;
  };
  threshold: number;
  meetsThreshold: boolean;
  timestamp: Date;
}
