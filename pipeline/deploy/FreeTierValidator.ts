/**
 * Free Tier Compliance Validator for VocalShield CI/CD Pipeline
 * 
 * This module validates AWS resource configurations against Free Tier limits
 * and estimates monthly costs to ensure deployments stay within budget constraints.
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import {
  ValidationResult,
  ComplianceResult,
  ComplianceWarning,
  ComplianceViolation,
  ResourceCheck,
  CostEstimate,
  ComplianceStatus,
  AWSUsage,
  FreeTierCompliance,
} from '../types';

/**
 * Lambda configuration for validation
 */
export interface LambdaConfig {
  memorySize: number;      // MB
  timeout: number;         // seconds
  architecture: string;
  runtime: string;
}

/**
 * DynamoDB configuration for validation
 */
export interface DynamoDBConfig {
  billingMode: 'PAY_PER_REQUEST' | 'PROVISIONED';
  pointInTimeRecovery?: boolean;
}

/**
 * API Gateway configuration for validation
 */
export interface APIGatewayConfig {
  throttling: {
    rateLimit: number;      // requests per second
    burstLimit: number;     // max concurrent requests
  };
}

/**
 * CloudFormation template structure (simplified)
 */
export interface CloudFormationTemplate {
  Resources: Record<string, {
    Type: string;
    Properties: Record<string, unknown>;
  }>;
}

/**
 * AWS Free Tier limits
 */
const FREE_TIER_LIMITS = {
  lambda: {
    maxMemoryMB: 3008,
    maxTimeoutSeconds: 300,
    monthlyInvocations: 1_000_000,
    monthlyGBSeconds: 400_000,
  },
  dynamodb: {
    requiredBillingMode: 'PAY_PER_REQUEST' as const,
    monthlyReadUnits: 25,
    monthlyWriteUnits: 25,
    storageGB: 25,
  },
  apiGateway: {
    monthlyRequests: 1_000_000,
    recommendedRateLimit: 100,  // per minute per user
  },
  cloudWatch: {
    customMetrics: 10,
    logRetentionDays: 7,
    storageGB: 5,
  },
} as const;

/**
 * Cost per unit for AWS services (after Free Tier)
 */
const COST_PER_UNIT = {
  lambda: {
    perInvocation: 0.0000002,
    perGBSecond: 0.0000166667,
  },
  dynamodb: {
    perReadUnit: 0.00025,
    perWriteUnit: 0.00125,
    perGBStorage: 0.25,
  },
  apiGateway: {
    perRequest: 0.000001,
  },
} as const;

/**
 * FreeTierValidator validates AWS resource configurations against Free Tier
 * limits and provides cost estimates.
 */
export class FreeTierValidator {
  /**
   * Validates Lambda function configuration against Free Tier limits.
   * 
   * Requirements: 11.1, 11.2
   * 
   * @param config - Lambda configuration to validate
   * @returns Validation result with errors and warnings
   */
  validateLambdaConfig(config: LambdaConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate memory size (Requirement 11.1)
    if (config.memorySize < 128) {
      errors.push('Lambda memory size must be at least 128 MB');
    } else if (config.memorySize > FREE_TIER_LIMITS.lambda.maxMemoryMB) {
      errors.push(
        `Lambda memory size ${config.memorySize} MB exceeds Free Tier limit of ${FREE_TIER_LIMITS.lambda.maxMemoryMB} MB`
      );
    } else if (config.memorySize > FREE_TIER_LIMITS.lambda.maxMemoryMB * 0.8) {
      warnings.push(
        `Lambda memory size ${config.memorySize} MB is approaching Free Tier limit (${FREE_TIER_LIMITS.lambda.maxMemoryMB} MB)`
      );
    }

    // Validate timeout (Requirement 11.2)
    if (config.timeout < 1) {
      errors.push('Lambda timeout must be at least 1 second');
    } else if (config.timeout > FREE_TIER_LIMITS.lambda.maxTimeoutSeconds) {
      errors.push(
        `Lambda timeout ${config.timeout}s exceeds Free Tier limit of ${FREE_TIER_LIMITS.lambda.maxTimeoutSeconds}s`
      );
    } else if (config.timeout > FREE_TIER_LIMITS.lambda.maxTimeoutSeconds * 0.8) {
      warnings.push(
        `Lambda timeout ${config.timeout}s is approaching Free Tier limit (${FREE_TIER_LIMITS.lambda.maxTimeoutSeconds}s)`
      );
    }

    // Validate architecture (cost optimization)
    if (config.architecture !== 'arm64') {
      warnings.push(
        `Lambda architecture "${config.architecture}" is not ARM64. ARM64 provides 20% better price-performance`
      );
    }

    // Validate runtime
    const validRuntimes = ['nodejs20.x', 'python3.12'];
    if (!validRuntimes.includes(config.runtime)) {
      warnings.push(
        `Lambda runtime "${config.runtime}" is not in recommended list: ${validRuntimes.join(', ')}`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validates DynamoDB table configuration against Free Tier limits.
   * 
   * Requirements: 11.4
   * 
   * @param config - DynamoDB configuration to validate
   * @returns Validation result with errors and warnings
   */
  validateDynamoDBConfig(config: DynamoDBConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate billing mode (Requirement 11.4)
    if (config.billingMode !== FREE_TIER_LIMITS.dynamodb.requiredBillingMode) {
      errors.push(
        `DynamoDB billing mode must be "${FREE_TIER_LIMITS.dynamodb.requiredBillingMode}" for Free Tier compliance. Current: "${config.billingMode}"`
      );
    }

    // Validate point-in-time recovery (cost optimization)
    if (config.pointInTimeRecovery === true) {
      warnings.push(
        'DynamoDB point-in-time recovery is enabled, which incurs additional costs beyond Free Tier'
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validates API Gateway configuration against Free Tier limits.
   * 
   * Requirements: 11.3
   * 
   * @param config - API Gateway configuration to validate
   * @returns Validation result with errors and warnings
   */
  validateAPIGatewayConfig(config: APIGatewayConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate rate limit
    if (config.throttling.rateLimit < 1) {
      errors.push('API Gateway rate limit must be at least 1 request per second');
    }

    // Validate burst limit
    if (config.throttling.burstLimit < 1) {
      errors.push('API Gateway burst limit must be at least 1 request');
    }

    // Check if limits are reasonable for Free Tier
    const requestsPerMinute = config.throttling.rateLimit * 60;
    if (requestsPerMinute > FREE_TIER_LIMITS.apiGateway.recommendedRateLimit) {
      warnings.push(
        `API Gateway rate limit (${requestsPerMinute} req/min) exceeds recommended limit for Free Tier (${FREE_TIER_LIMITS.apiGateway.recommendedRateLimit} req/min)`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Estimates monthly cost based on CloudFormation template.
   * 
   * Requirements: 11.6
   * 
   * @param template - CloudFormation template to analyze
   * @returns Cost estimate with breakdown by service
   */
  estimateMonthlyCost(template: CloudFormationTemplate): CostEstimate {
    const breakdown: Record<string, number> = {
      lambda: 0,
      dynamodb: 0,
      apiGateway: 0,
      cloudWatch: 0,
      other: 0,
    };

    let lambdaFunctionCount = 0;
    let dynamoDBTableCount = 0;
    let apiGatewayCount = 0;

    // Analyze resources in template
    for (const [resourceName, resource] of Object.entries(template.Resources)) {
      const resourceType = resource.Type;

      if (resourceType === 'AWS::Lambda::Function') {
        lambdaFunctionCount++;
        
        // Estimate Lambda costs (assuming moderate usage within Free Tier)
        const memoryMB = (resource.Properties.MemorySize as number) || 512;
        const estimatedInvocations = 10_000; // Conservative estimate per function
        const estimatedDurationSeconds = 1; // Conservative estimate
        const gbSeconds = (memoryMB / 1024) * estimatedDurationSeconds * estimatedInvocations;
        
        // Only charge if exceeding Free Tier
        if (estimatedInvocations > FREE_TIER_LIMITS.lambda.monthlyInvocations) {
          const excessInvocations = estimatedInvocations - FREE_TIER_LIMITS.lambda.monthlyInvocations;
          breakdown.lambda += excessInvocations * COST_PER_UNIT.lambda.perInvocation;
        }
        
        if (gbSeconds > FREE_TIER_LIMITS.lambda.monthlyGBSeconds) {
          const excessGBSeconds = gbSeconds - FREE_TIER_LIMITS.lambda.monthlyGBSeconds;
          breakdown.lambda += excessGBSeconds * COST_PER_UNIT.lambda.perGBSecond;
        }
      } else if (resourceType === 'AWS::DynamoDB::Table') {
        dynamoDBTableCount++;
        
        // DynamoDB with PAY_PER_REQUEST is mostly free within limits
        // Estimate minimal cost for moderate usage
        breakdown.dynamodb += 0; // Within Free Tier for MVP
      } else if (
        resourceType === 'AWS::ApiGateway::RestApi' ||
        resourceType === 'AWS::ApiGatewayV2::Api'
      ) {
        apiGatewayCount++;
        
        // API Gateway costs (assuming moderate usage within Free Tier)
        breakdown.apiGateway += 0; // Within Free Tier for MVP
      } else if (resourceType === 'AWS::Logs::LogGroup') {
        // CloudWatch Logs (within Free Tier for 7-day retention)
        breakdown.cloudWatch += 0;
      }
    }

    // Add warnings for resource counts
    if (lambdaFunctionCount > 10) {
      breakdown.other += 1; // Symbolic cost for monitoring many functions
    }

    const estimatedMonthlyCost = Object.values(breakdown).reduce((sum, cost) => sum + cost, 0);

    return {
      estimatedMonthlyCost: Number(estimatedMonthlyCost.toFixed(2)),
      breakdown,
      freeTierEligible: estimatedMonthlyCost === 0,
    };
  }

  /**
   * Checks current AWS usage against Free Tier compliance thresholds.
   * 
   * Requirements: 11.5, 11.6
   * 
   * @param usage - Current AWS usage metrics
   * @returns Compliance status with warnings for threshold breaches
   */
  checkComplianceThresholds(usage: AWSUsage): ComplianceStatus {
    const warnings: string[] = [];
    const details: Record<string, unknown> = {};

    // Check Lambda usage (Requirement 11.5)
    const lambdaInvocationPercent = 
      (usage.lambda.invocations / FREE_TIER_LIMITS.lambda.monthlyInvocations) * 100;
    const lambdaGBSecondsPercent = 
      (usage.lambda.gbSeconds / FREE_TIER_LIMITS.lambda.monthlyGBSeconds) * 100;

    details.lambda = {
      invocations: {
        current: usage.lambda.invocations,
        limit: FREE_TIER_LIMITS.lambda.monthlyInvocations,
        percentUsed: Number(lambdaInvocationPercent.toFixed(2)),
      },
      gbSeconds: {
        current: usage.lambda.gbSeconds,
        limit: FREE_TIER_LIMITS.lambda.monthlyGBSeconds,
        percentUsed: Number(lambdaGBSecondsPercent.toFixed(2)),
      },
    };

    if (lambdaInvocationPercent >= 80) {
      warnings.push(
        `Lambda invocations at ${lambdaInvocationPercent.toFixed(1)}% of Free Tier limit`
      );
    }

    if (lambdaGBSecondsPercent >= 80) {
      warnings.push(
        `Lambda GB-seconds at ${lambdaGBSecondsPercent.toFixed(1)}% of Free Tier limit`
      );
    }

    // Check DynamoDB usage
    const dynamoDBReadPercent = 
      (usage.dynamodb.readUnits / FREE_TIER_LIMITS.dynamodb.monthlyReadUnits) * 100;
    const dynamoDBWritePercent = 
      (usage.dynamodb.writeUnits / FREE_TIER_LIMITS.dynamodb.monthlyWriteUnits) * 100;
    const dynamoDBStoragePercent = 
      (usage.dynamodb.storage / FREE_TIER_LIMITS.dynamodb.storageGB) * 100;

    details.dynamodb = {
      readUnits: {
        current: usage.dynamodb.readUnits,
        limit: FREE_TIER_LIMITS.dynamodb.monthlyReadUnits,
        percentUsed: Number(dynamoDBReadPercent.toFixed(2)),
      },
      writeUnits: {
        current: usage.dynamodb.writeUnits,
        limit: FREE_TIER_LIMITS.dynamodb.monthlyWriteUnits,
        percentUsed: Number(dynamoDBWritePercent.toFixed(2)),
      },
      storage: {
        current: usage.dynamodb.storage,
        limit: FREE_TIER_LIMITS.dynamodb.storageGB,
        percentUsed: Number(dynamoDBStoragePercent.toFixed(2)),
      },
    };

    if (dynamoDBReadPercent >= 80) {
      warnings.push(
        `DynamoDB read units at ${dynamoDBReadPercent.toFixed(1)}% of Free Tier limit`
      );
    }

    if (dynamoDBWritePercent >= 80) {
      warnings.push(
        `DynamoDB write units at ${dynamoDBWritePercent.toFixed(1)}% of Free Tier limit`
      );
    }

    if (dynamoDBStoragePercent >= 80) {
      warnings.push(
        `DynamoDB storage at ${dynamoDBStoragePercent.toFixed(1)}% of Free Tier limit`
      );
    }

    // Check API Gateway usage
    const apiGatewayPercent = 
      (usage.apiGateway.requests / FREE_TIER_LIMITS.apiGateway.monthlyRequests) * 100;

    details.apiGateway = {
      requests: {
        current: usage.apiGateway.requests,
        limit: FREE_TIER_LIMITS.apiGateway.monthlyRequests,
        percentUsed: Number(apiGatewayPercent.toFixed(2)),
      },
    };

    if (apiGatewayPercent >= 80) {
      warnings.push(
        `API Gateway requests at ${apiGatewayPercent.toFixed(1)}% of Free Tier limit`
      );
    }

    // Determine compliance status
    const compliant = warnings.length === 0;
    const message = compliant
      ? 'All services are within Free Tier limits'
      : `${warnings.length} service(s) approaching or exceeding Free Tier limits`;

    return {
      compliant,
      message,
      details: {
        warnings,
        ...details,
      },
    };
  }

  /**
   * Generates a comprehensive Free Tier compliance report.
   * 
   * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
   * 
   * @param template - CloudFormation template to analyze
   * @param usage - Current AWS usage metrics
   * @returns Complete Free Tier compliance status
   */
  generateComplianceReport(
    template: CloudFormationTemplate,
    usage: AWSUsage
  ): FreeTierCompliance {
    const warnings: ComplianceWarning[] = [];
    const violations: ComplianceViolation[] = [];
    const resourceChecks: ResourceCheck[] = [];

    // Analyze template resources
    for (const [resourceName, resource] of Object.entries(template.Resources)) {
      const resourceType = resource.Type;

      if (resourceType === 'AWS::Lambda::Function') {
        const lambdaConfig: LambdaConfig = {
          memorySize: (resource.Properties.MemorySize as number) || 512,
          timeout: (resource.Properties.Timeout as number) || 30,
          architecture: (resource.Properties.Architectures as string[])?.[0] || 'x86_64',
          runtime: (resource.Properties.Runtime as string) || 'nodejs20.x',
        };

        const validation = this.validateLambdaConfig(lambdaConfig);
        
        resourceChecks.push({
          resourceType: 'AWS::Lambda::Function',
          resourceName,
          compliant: validation.valid,
          message: validation.valid 
            ? 'Lambda configuration is Free Tier compliant'
            : validation.errors.join('; '),
        });

        // Convert validation errors to violations
        for (const error of validation.errors) {
          violations.push({
            resource: resourceName,
            message: error,
            limit: FREE_TIER_LIMITS.lambda.maxMemoryMB,
            configuredValue: lambdaConfig.memorySize,
            recommendation: 'Reduce Lambda memory or timeout to stay within Free Tier limits',
          });
        }

        // Convert validation warnings to compliance warnings
        for (const warning of validation.warnings) {
          warnings.push({
            resource: resourceName,
            message: warning,
            threshold: FREE_TIER_LIMITS.lambda.maxMemoryMB,
            currentValue: lambdaConfig.memorySize,
            severity: 'medium',
          });
        }
      } else if (resourceType === 'AWS::DynamoDB::Table') {
        const dynamoConfig: DynamoDBConfig = {
          billingMode: (resource.Properties.BillingMode as 'PAY_PER_REQUEST' | 'PROVISIONED') || 'PAY_PER_REQUEST',
          pointInTimeRecovery: (resource.Properties.PointInTimeRecoverySpecification as { PointInTimeRecoveryEnabled?: boolean })?.PointInTimeRecoveryEnabled,
        };

        const validation = this.validateDynamoDBConfig(dynamoConfig);
        
        resourceChecks.push({
          resourceType: 'AWS::DynamoDB::Table',
          resourceName,
          compliant: validation.valid,
          message: validation.valid
            ? 'DynamoDB configuration is Free Tier compliant'
            : validation.errors.join('; '),
        });

        for (const error of validation.errors) {
          violations.push({
            resource: resourceName,
            message: error,
            limit: 0,
            configuredValue: 0,
            recommendation: 'Set billing mode to PAY_PER_REQUEST',
          });
        }

        for (const warning of validation.warnings) {
          warnings.push({
            resource: resourceName,
            message: warning,
            threshold: 0,
            currentValue: 0,
            severity: 'low',
          });
        }
      }
    }

    // Check usage thresholds
    const thresholdStatus = this.checkComplianceThresholds(usage);
    if (!thresholdStatus.compliant && thresholdStatus.details.warnings) {
      for (const warning of thresholdStatus.details.warnings as string[]) {
        warnings.push({
          resource: 'AWS Usage',
          message: warning,
          threshold: 80,
          currentValue: 80,
          severity: 'high',
        });
      }
    }

    // Estimate costs
    const costEstimate = this.estimateMonthlyCost(template);

    // Calculate remaining Free Tier capacity
    const freeTierRemaining = {
      lambda: {
        invocations: Math.max(0, FREE_TIER_LIMITS.lambda.monthlyInvocations - usage.lambda.invocations),
        gbSeconds: Math.max(0, FREE_TIER_LIMITS.lambda.monthlyGBSeconds - usage.lambda.gbSeconds),
      },
      dynamodb: {
        readUnits: Math.max(0, FREE_TIER_LIMITS.dynamodb.monthlyReadUnits - usage.dynamodb.readUnits),
        writeUnits: Math.max(0, FREE_TIER_LIMITS.dynamodb.monthlyWriteUnits - usage.dynamodb.writeUnits),
        storage: Math.max(0, FREE_TIER_LIMITS.dynamodb.storageGB - usage.dynamodb.storage),
      },
      apiGateway: {
        requests: Math.max(0, FREE_TIER_LIMITS.apiGateway.monthlyRequests - usage.apiGateway.requests),
      },
    };

    return {
      compliant: violations.length === 0,
      warnings,
      violations,
      resourceChecks,
      estimatedMonthlyCost: costEstimate.estimatedMonthlyCost,
      freeTierRemaining,
    };
  }
}
