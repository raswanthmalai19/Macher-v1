/**
 * Environment configuration interface for VocalShield infrastructure
 */
export interface EnvironmentConfig {
  // Environment identification
  environment: 'dev' | 'staging' | 'production';
  region: string;
  
  // Stack configuration
  stackName: string;
  
  // VPC configuration
  vpcCidr: string;
  publicSubnetCidr: string;
  privateSubnetCidr: string;
  wavelengthSubnetCidr: string;
  maxAzs: number;
  
  // Lambda configuration
  lambdaRuntime: string;
  lambdaArchitecture: string;
  connectHandlerMemory: number;
  connectHandlerTimeout: number;
  disconnectHandlerMemory: number;
  disconnectHandlerTimeout: number;
  audioProcessorMemory: number;
  audioProcessorTimeout: number;
  investigationHandlerMemory: number;
  investigationHandlerTimeout: number;
  
  // DynamoDB configuration
  connectionsTtlDays: number;
  metadataTtlDays: number;
  
  // WebSocket configuration
  websocketIdleTimeout: number;
  
  // CloudWatch configuration
  logRetentionDays: number;
  dashboardRefreshInterval: number;
  
  // Monitoring thresholds
  billingAlarmThreshold: number;
  errorRateThreshold: number;
  errorRatePeriod: number;
  connectionLimitThreshold: number;
  
  // SQS configuration
  sqsVisibilityTimeout: number;
  sqsMessageRetention: number;
  sqsMaxReceiveCount: number;
  
  // Feature flags
  enableXRayTracing: boolean;
  enableWaf: boolean;
  enableBackup: boolean;
  enableCanary: boolean;
  enableEvidently: boolean;
  
  // Cost optimization
  enableCostExplorer: boolean;
  budgetAmount: number;
  budgetAlertThresholds: number[];
  
  // Tags
  tags: {
    Project: string;
    Environment: string;
    ManagedBy: string;
    CostCenter: string;
  };
}
