import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface ContributorInsightsConstructProps {
  config: EnvironmentConfig;
  logGroups: logs.ILogGroup[];
}

/**
 * CloudWatch Contributor Insights Construct
 * 
 * Creates Contributor Insights rules for:
 * - Top IPs by connection count
 * - Top sessions by processing time
 * - Top error sources
 */
export class ContributorInsightsConstruct extends Construct {
  public readonly topIpsRule: logs.CfnLogGroup;
  public readonly topSessionsRule: logs.CfnLogGroup;
  public readonly topErrorsRule: logs.CfnLogGroup;

  constructor(scope: Construct, id: string, props: ContributorInsightsConstructProps) {
    super(scope, id);

    const { config, logGroups } = props;

    // Note: CloudWatch Contributor Insights rules are created via JSON configuration
    // These are typically created through the AWS Console or CLI
    // Here we document the rule configurations that should be applied

    // Rule 1: Top IPs by Connection Count
    const topIpsRuleConfig = {
      Schema: {
        Name: 'CloudWatchLogRule',
        Version: 1,
      },
      AggregateOn: 'Count',
      Contribution: {
        Filters: [
          {
            Match: '$.level',
            EqualTo: 'INFO',
          },
          {
            Match: '$.message',
            Contains: 'Connection established',
          },
        ],
        Keys: ['$.sourceIp'],
      },
      LogFormat: 'JSON',
      LogGroupNames: logGroups.map(lg => lg.logGroupName),
    };

    // Rule 2: Top Sessions by Processing Time
    const topSessionsRuleConfig = {
      Schema: {
        Name: 'CloudWatchLogRule',
        Version: 1,
      },
      AggregateOn: 'Sum',
      Contribution: {
        Filters: [
          {
            Match: '$.processingDuration',
            GreaterThan: 0,
          },
        ],
        Keys: ['$.sessionId'],
        ValueOf: '$.processingDuration',
      },
      LogFormat: 'JSON',
      LogGroupNames: logGroups.map(lg => lg.logGroupName),
    };

    // Rule 3: Top Error Sources
    const topErrorsRuleConfig = {
      Schema: {
        Name: 'CloudWatchLogRule',
        Version: 1,
      },
      AggregateOn: 'Count',
      Contribution: {
        Filters: [
          {
            Match: '$.level',
            EqualTo: 'ERROR',
          },
        ],
        Keys: ['$.error.name'],
      },
      LogFormat: 'JSON',
      LogGroupNames: logGroups.map(lg => lg.logGroupName),
    };

    // Store configurations as custom resource metadata
    // These will need to be applied via AWS CLI or Console
    new cdk.CfnOutput(this, 'TopIpsRuleConfig', {
      value: JSON.stringify(topIpsRuleConfig),
      description: 'Contributor Insights rule for top IPs by connection count',
    });

    new cdk.CfnOutput(this, 'TopSessionsRuleConfig', {
      value: JSON.stringify(topSessionsRuleConfig),
      description: 'Contributor Insights rule for top sessions by processing time',
    });

    new cdk.CfnOutput(this, 'TopErrorsRuleConfig', {
      value: JSON.stringify(topErrorsRuleConfig),
      description: 'Contributor Insights rule for top error sources',
    });

    // Apply tags
    cdk.Tags.of(this).add('Component', 'ContributorInsights');
  }
}
