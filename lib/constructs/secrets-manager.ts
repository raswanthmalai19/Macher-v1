import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * Configuration for Secrets Manager construct
 */
export interface SecretsManagerConstructProps {
  /**
   * Environment name (dev, staging, production)
   */
  environment: string;
}

/**
 * Secrets Manager construct for MACHER
 * 
 * Creates and manages secrets for:
 * - API keys (macher/api-keys)
 * - Configuration (macher/config)
 * 
 * All secrets are encrypted using AWS managed KMS keys.
 * IAM policies are configured to allow Lambda functions to access secrets.
 */
export class SecretsManagerConstruct extends Construct {
  /**
   * Secret for API keys
   */
  public readonly apiKeysSecret: secretsmanager.Secret;

  /**
   * Secret for configuration
   */
  public readonly configSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: SecretsManagerConstructProps) {
    super(scope, id);

    // Create secret for API keys
    this.apiKeysSecret = new secretsmanager.Secret(this, 'ApiKeysSecret', {
      secretName: `macher/api-keys`,
      description: 'API keys for MACHER external service integrations',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          mlServiceApiKey: 'PLACEHOLDER_ML_API_KEY',
          thirdPartyIntegrationKey: 'PLACEHOLDER_INTEGRATION_KEY',
        }),
        generateStringKey: 'placeholder',
      },
    });

    // Create secret for configuration
    this.configSecret = new secretsmanager.Secret(this, 'ConfigSecret', {
      secretName: `macher/config`,
      description: 'Sensitive configuration for MACHER',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          fraudThreshold: 70,
          processingTimeout: 3000,
        }),
        generateStringKey: 'placeholder',
      },
    });

    // Apply tags
    cdk.Tags.of(this.apiKeysSecret).add('Project', 'MACHER');
    cdk.Tags.of(this.apiKeysSecret).add('Environment', props.environment);
    cdk.Tags.of(this.apiKeysSecret).add('ManagedBy', 'CDK');
    cdk.Tags.of(this.apiKeysSecret).add('CostCenter', 'MACHER-Infrastructure');

    cdk.Tags.of(this.configSecret).add('Project', 'MACHER');
    cdk.Tags.of(this.configSecret).add('Environment', props.environment);
    cdk.Tags.of(this.configSecret).add('ManagedBy', 'CDK');
    cdk.Tags.of(this.configSecret).add('CostCenter', 'MACHER-Infrastructure');
  }

  /**
   * Grant read access to a Lambda function for API keys secret
   */
  public grantApiKeysRead(grantee: iam.IGrantable): iam.Grant {
    return this.apiKeysSecret.grantRead(grantee);
  }

  /**
   * Grant read access to a Lambda function for config secret
   */
  public grantConfigRead(grantee: iam.IGrantable): iam.Grant {
    return this.configSecret.grantRead(grantee);
  }

  /**
   * Grant read access to both secrets
   */
  public grantAllSecretsRead(grantee: iam.IGrantable): iam.Grant[] {
    return [
      this.grantApiKeysRead(grantee),
      this.grantConfigRead(grantee),
    ];
  }
}
