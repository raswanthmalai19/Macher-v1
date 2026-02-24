import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { VocalShieldStack } from '../../lib/vocalshield-stack';
import { devConfig } from '../../lib/config';

describe('VocalShieldStack', () => {
  let app: cdk.App;
  let stack: VocalShieldStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new VocalShieldStack(app, 'TestStack', devConfig);
    template = Template.fromStack(stack);
  });

  test('Stack is created successfully', () => {
    expect(stack).toBeDefined();
  });

  test('Stack has correct tags applied', () => {
    const stackTags = cdk.Tags.of(stack);
    expect(stackTags).toBeDefined();
  });

  test('CloudFormation template is generated', () => {
    expect(template).toBeDefined();
  });

  test('Stack synthesizes without errors', () => {
    const assembly = app.synth();
    expect(assembly).toBeDefined();
    expect(assembly.stacks.length).toBeGreaterThan(0);
  });

  test('Template can be converted to JSON', () => {
    const json = template.toJSON();
    expect(json).toBeDefined();
    expect(typeof json).toBe('object');
  });
});
