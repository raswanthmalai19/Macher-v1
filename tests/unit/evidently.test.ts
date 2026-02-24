import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { EvidentlyConstruct } from '../../lib/constructs/evidently';
import { devConfig } from '../../lib/config';

describe('CloudWatch Evidently', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
    new EvidentlyConstruct(stack, 'TestEvidently', {
      config: devConfig,
    });
    template = Template.fromStack(stack);
  });

  test('Evidently project is created', () => {
    template.resourceCountIs('AWS::Evidently::Project', 1);
  });

  test('Feature flag is created', () => {
    template.resourceCountIs('AWS::Evidently::Feature', 1);
  });

  test('Feature flag has On/Off variations', () => {
    template.hasResourceProperties('AWS::Evidently::Feature', {
      Variations: [
        {
          VariationName: 'Off',
          BooleanValue: false,
        },
        {
          VariationName: 'On',
          BooleanValue: true,
        },
      ],
    });
  });

  test('Feature flag default variation is Off', () => {
    template.hasResourceProperties('AWS::Evidently::Feature', {
      DefaultVariation: 'Off',
    });
  });

  test('Feature flag has correct name', () => {
    template.hasResourceProperties('AWS::Evidently::Feature', {
      Name: 'new-fraud-algorithm',
    });
  });
});
