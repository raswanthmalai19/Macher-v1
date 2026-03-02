import { EnvironmentConfig } from './types';

export const devConfig: EnvironmentConfig = {
  environment: 'dev',
  region: 'us-east-1',
  
  // Stack configuration
  stackName: 'MACHER-dev',
  
  // VPC configuration
  vpcCidr: '10.0.0.0/16',
  publicSubnetCidr: '10.0.1.0/24',
  privateSubnetCidr: '10.0.2.0/24',
  wavelengthSubnetCidr: '10.0.10.0/24',
  maxAzs: 2,
  
  // Lambda configuration
  lambdaRuntime: 'nodejs20.x',
  lambdaArchitecture: 'arm64',
  connectHandlerMemory: 512,
  connectHandlerTimeout: 10,
  disconnectHandlerMemory: 512,
  disconnectHandlerTimeout: 10,
  audioProcessorMemory: 1024,
  audioProcessorTimeout: 30,
  investigationHandlerMemory: 512,
  investigationHandlerTimeout: 60,
  
  // DynamoDB configuration
  connectionsTtlDays: 1,
  metadataTtlDays: 30,
  
  // WebSocket configuration
  websocketIdleTimeout: 600, // 10 minutes in seconds
  
  // CloudWatch configuration
  logRetentionDays: 7,
  dashboardRefreshInterval: 60, // 1 minute in seconds
  
  // Monitoring thresholds
  billingAlarmThreshold: 5.0,
  errorRateThreshold: 10,
  errorRatePeriod: 300, // 5 minutes in seconds
  connectionLimitThreshold: 900,
  
  // SQS configuration
  sqsVisibilityTimeout: 30,
  sqsMessageRetention: 345600, // 4 days in seconds
  sqsMaxReceiveCount: 3,
  
  // Feature flags
  enableXRayTracing: true,
  enableWaf: false, // Disabled in dev to save costs
  enableBackup: false, // Disabled in dev to save costs
  enableCanary: false, // Disabled in dev to save costs
  enableEvidently: true,
  
  // Cost optimization
  enableCostExplorer: true,
  budgetAmount: 10.0,
  budgetAlertThresholds: [80, 100],
  
  // Tags
  tags: {
    Project: 'MACHER',
    Environment: 'dev',
    ManagedBy: 'CDK',
    CostCenter: 'MACHER-Infrastructure'
  }
};
