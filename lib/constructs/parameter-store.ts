import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * Configuration for Parameter Store construct
 */
export interface ParameterStoreConstructProps {
  /**
   * Environment name (dev, staging, production)
   */
  environment: string;
}

/**
 * Parameter Store construct for MACHER
 * 
 * Creates hierarchical parameters following the pattern:
 * /macher/{env}/{component}/{param}
 * 
 * Parameters are used for non-sensitive configuration that can be
 * changed without redeploying the infrastructure.
 * 
 * All parameters use Standard tier (free).
 */
export class ParameterStoreConstruct extends Construct {
  /**
   * Fraud detection threshold parameter (0-100)
   */
  public readonly fraudThresholdParameter: ssm.StringParameter;

  /**
   * Maximum processing time in milliseconds
   */
  public readonly maxProcessingTimeParameter: ssm.StringParameter;

  /**
   * Whether notifications are enabled
   */
  public readonly notificationsEnabledParameter: ssm.StringParameter;

  /**
   * Whether Wavelength Zone integration is enabled
   */
  public readonly wavelengthEnabledParameter: ssm.StringParameter;

  /**
   * Map of all parameters for easy access
   */
  public readonly parameters: Map<string, ssm.StringParameter>;

  constructor(scope: Construct, id: string, props: ParameterStoreConstructProps) {
    super(scope, id);

    const { environment } = props;

    // Create fraud threshold parameter
    this.fraudThresholdParameter = new ssm.StringParameter(this, 'FraudThresholdParameter', {
      parameterName: `/macher/${environment}/audio-processor/fraud-threshold`,
      description: 'Fraud detection threshold score (0-100). Scores above this trigger alerts.',
      stringValue: '70',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Create max processing time parameter
    this.maxProcessingTimeParameter = new ssm.StringParameter(this, 'MaxProcessingTimeParameter', {
      parameterName: `/macher/${environment}/audio-processor/max-processing-time`,
      description: 'Maximum audio processing time in milliseconds',
      stringValue: '3000',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Create notifications enabled parameter
    this.notificationsEnabledParameter = new ssm.StringParameter(this, 'NotificationsEnabledParameter', {
      parameterName: `/macher/${environment}/notifications/enabled`,
      description: 'Whether Family Loop notifications are enabled',
      stringValue: 'true',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Create wavelength enabled parameter
    this.wavelengthEnabledParameter = new ssm.StringParameter(this, 'WavelengthEnabledParameter', {
      parameterName: `/macher/${environment}/features/wavelength-enabled`,
      description: 'Whether AWS Wavelength Zone integration is enabled',
      stringValue: 'false',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Store all parameters in a map for easy access
    this.parameters = new Map([
      ['fraudThreshold', this.fraudThresholdParameter],
      ['maxProcessingTime', this.maxProcessingTimeParameter],
      ['notificationsEnabled', this.notificationsEnabledParameter],
      ['wavelengthEnabled', this.wavelengthEnabledParameter],
    ]);

    // Apply tags to all parameters
    this.applyTags(props.environment);
  }

  /**
   * Apply consistent tags to all parameters
   */
  private applyTags(environment: string): void {
    const parameters = [
      this.fraudThresholdParameter,
      this.maxProcessingTimeParameter,
      this.notificationsEnabledParameter,
      this.wavelengthEnabledParameter,
    ];

    parameters.forEach(parameter => {
      cdk.Tags.of(parameter).add('Project', 'MACHER');
      cdk.Tags.of(parameter).add('Environment', environment);
      cdk.Tags.of(parameter).add('ManagedBy', 'CDK');
      cdk.Tags.of(parameter).add('CostCenter', 'MACHER-Infrastructure');
    });
  }

  /**
   * Grant read access to all parameters for a Lambda function
   */
  public grantRead(grantee: iam.IGrantable): iam.Grant {
    // Grant read access to all parameters under /macher/{environment}/*
    return iam.Grant.addToPrincipal({
      grantee,
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resourceArns: Array.from(this.parameters.values()).map(param => param.parameterArn),
    });
  }

  /**
   * Grant read access to specific parameters
   */
  public grantReadParameter(grantee: iam.IGrantable, parameterName: string): iam.Grant {
    const parameter = this.parameters.get(parameterName);
    if (!parameter) {
      throw new Error(`Parameter ${parameterName} not found`);
    }
    return parameter.grantRead(grantee);
  }

  /**
   * Get parameter ARN by name
   */
  public getParameterArn(parameterName: string): string {
    const parameter = this.parameters.get(parameterName);
    if (!parameter) {
      throw new Error(`Parameter ${parameterName} not found`);
    }
    return parameter.parameterArn;
  }

  /**
   * Get parameter name (full path) by key
   */
  public getParameterName(parameterName: string): string {
    const parameter = this.parameters.get(parameterName);
    if (!parameter) {
      throw new Error(`Parameter ${parameterName} not found`);
    }
    return parameter.parameterName;
  }
}
