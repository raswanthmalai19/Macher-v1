import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { WafConstruct } from '../../lib/constructs/waf';
import { devConfig } from '../../lib/config';

describe('AWS WAF', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
    new WafConstruct(stack, 'TestWAF', {
      config: devConfig,
      apiGatewayArn: 'arn:aws:apigateway:us-east-1::/apis/test123',
    });
    template = Template.fromStack(stack);
  });

  test('Web ACL is created', () => {
    template.resourceCountIs('AWS::WAFv2::WebACL', 1);
  });

  test('Web ACL has REGIONAL scope', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Scope: 'REGIONAL',
    });
  });

  test('Web ACL has rate limiting rule', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Rules: [
        {
          Name: 'RateLimitRule',
          Priority: 1,
          Statement: {
            RateBasedStatement: {
              Limit: 100,
              AggregateKeyType: 'IP',
            },
          },
          Action: { Block: {} },
        },
      ],
    });
  });

  test('Web ACL has AWS managed rule sets', () => {
    const webAcls = template.findResources('AWS::WAFv2::WebACL');
    const webAclKeys = Object.keys(webAcls);
    expect(webAclKeys.length).toBe(1);

    const webAcl = webAcls[webAclKeys[0]];
    const rules = webAcl.Properties.Rules;

    // Check for Core Rule Set
    const hasCoreRuleSet = rules.some((rule: any) => 
      rule.Name === 'AWSManagedRulesCommonRuleSet'
    );
    expect(hasCoreRuleSet).toBe(true);

    // Check for Known Bad Inputs Rule Set
    const hasBadInputsRuleSet = rules.some((rule: any) => 
      rule.Name === 'AWSManagedRulesKnownBadInputsRuleSet'
    );
    expect(hasBadInputsRuleSet).toBe(true);
  });

  test('Web ACL has CloudWatch metrics enabled', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      VisibilityConfig: {
        CloudWatchMetricsEnabled: true,
        SampledRequestsEnabled: true,
      },
    });
  });

  test('Web ACL is associated with API Gateway', () => {
    template.resourceCountIs('AWS::WAFv2::WebACLAssociation', 1);
    template.hasResourceProperties('AWS::WAFv2::WebACLAssociation', {
      ResourceArn: 'arn:aws:apigateway:us-east-1::/apis/test123',
    });
  });

  test('Web ACL default action is allow', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      DefaultAction: { Allow: {} },
    });
  });
});
