#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MACHERStack } from '../lib/macher-stack';
import { getConfig } from '../lib/config';

const app = new cdk.App();

// Get environment from CDK context (default: dev)
const environment = app.node.tryGetContext('environment') || 'dev';
const config = getConfig(environment);

// Get account and region from CDK context or environment variables
const account = app.node.tryGetContext('accountId') || process.env.CDK_DEFAULT_ACCOUNT;
const region = config.region || process.env.CDK_DEFAULT_REGION;

// Create the MACHER stack
new MACHERStack(app, config.stackName, config, {
  env: {
    account,
    region
  },
  description: `MACHER Infrastructure Foundation - ${config.environment} environment`,
  
  // Stack termination protection for production
  terminationProtection: config.environment === 'production',
  
  // Stack tags
  tags: config.tags
});

app.synth();
