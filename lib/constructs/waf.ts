import * as cdk from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface WafConstructProps {
  config: EnvironmentConfig;
  apiGatewayArn: string;
}

/**
 * AWS WAF Web ACL Construct
 * 
 * Creates a Web ACL with:
 * - Rate limiting: 100 requests per minute per IP (Requirement 12.4)
 * - AWS managed Core Rule Set
 * - AWS managed Known Bad Inputs Rule Set
 * 
 * Associates with API Gateway for protection
 * 
 * Note: WAF rate limiting is per IP address, not per API key. This provides
 * protection against abuse while being simpler to implement than per-key limiting.
 */
export class WafConstruct extends Construct {
  public readonly webAcl: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, props: WafConstructProps) {
    super(scope, id);

    const { config, apiGatewayArn } = props;

    // Create Web ACL
    this.webAcl = new wafv2.CfnWebACL(this, 'WebSocketWAF', {
      name: `MACHER-WebACL-${config.tags.Environment}`,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      description: 'WAF protection for MACHER WebSocket API',
      rules: [
        // Rule 1: Rate Limiting (Requirement 12.4)
        // Limit: 100 requests per minute per IP
        // WAF rate limiting is specified per 5-minute window
        // 100 requests/minute = 500 requests per 5 minutes
        {
          name: 'RateLimitRule',
          priority: 1,
          statement: {
            rateBasedStatement: {
              limit: 500, // 100 requests/min * 5 min = 500 requests per 5-minute window
              aggregateKeyType: 'IP',
            },
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule',
          },
        },
        // Rule 2: AWS Managed Core Rule Set
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 2,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesCommonRuleSet',
          },
        },
        // Rule 3: AWS Managed Known Bad Inputs Rule Set
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 3,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesKnownBadInputsRuleSet',
          },
        },
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `MACHER-WebACL-${config.tags.Environment}`,
      },
    });

    // Associate Web ACL with API Gateway
    new wafv2.CfnWebACLAssociation(this, 'WebACLAssociation', {
      resourceArn: apiGatewayArn,
      webAclArn: this.webAcl.attrArn,
    });

    // Apply tags
    cdk.Tags.of(this.webAcl).add('Component', 'WAF');
  }
}
