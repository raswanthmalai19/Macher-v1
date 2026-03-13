#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VocalShieldStack } from '../lib/vocalshield-stack';
import { getConfig } from '../lib/config';

const app = new cdk.App();

// Get environment from CDK context (default: dev)
const environment = app.node.tryGetContext('environment') || 'dev';
const config = getConfig(environment);

// Get account and region from CDK context or environment variables
// Region is configured in config files (us-east-1 for all environments per Requirement 7.7)
const account = app.node.tryGetContext('accountId') || process.env.CDK_DEFAULT_ACCOUNT;
const region = config.region || process.env.CDK_DEFAULT_REGION;

// Validate deployment to us-east-1 (Requirement 7.7)
if (region !== 'us-east-1') {
  console.warn(`⚠️  Warning: Deploying to ${region} instead of us-east-1. Competition requirements specify us-east-1.`);
}

// Create the VocalShield stack
new VocalShieldStack(app, config.stackName, config, {
  env: {
    account,
    region
  },
  description: `VocalShield Infrastructure - ${config.environment} environment - Real-time fraud detection system`,
  
  // Stack termination protection for production
  terminationProtection: config.environment === 'production',
  
  // Stack tags (Requirement 7.3)
  tags: config.tags
});

app.synth();
