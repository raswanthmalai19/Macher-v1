import * as cdk from 'aws-cdk-lib';
import * as evidently from 'aws-cdk-lib/aws-evidently';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface EvidentlyConstructProps {
  config: EnvironmentConfig;
}

/**
 * CloudWatch Evidently Construct
 * 
 * Creates:
 * - Evidently project for experiments
 * - Feature flag: new-fraud-algorithm (On/Off)
 * - Default variation: Off
 */
export class EvidentlyConstruct extends Construct {
  public readonly project: evidently.CfnProject;
  public readonly newFraudAlgorithmFeature: evidently.CfnFeature;

  constructor(scope: Construct, id: string, props: EvidentlyConstructProps) {
    super(scope, id);

    const { config } = props;

    // Create Evidently Project
    this.project = new evidently.CfnProject(this, 'MACHERExperiments', {
      name: `macher-experiments-${config.tags.Environment}`,
      description: 'Feature flags and A/B testing for MACHER',
    });

    // Create Feature Flag: new-fraud-algorithm
    this.newFraudAlgorithmFeature = new evidently.CfnFeature(this, 'NewFraudAlgorithmFeature', {
      project: this.project.name,
      name: 'new-fraud-algorithm',
      description: 'Enable new fraud detection algorithm',
      variations: [
        {
          variationName: 'Off',
          booleanValue: false,
        },
        {
          variationName: 'On',
          booleanValue: true,
        },
      ],
      defaultVariation: 'Off',
    });

    // Apply tags
    cdk.Tags.of(this.project).add('Component', 'Evidently');
  }
}
