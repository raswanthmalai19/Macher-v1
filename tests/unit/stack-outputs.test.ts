import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { VocalShieldStack } from '../../lib/vocalshield-stack';
import { devConfig } from '../../lib/config';

describe('Stack Outputs', () => {
  let app: cdk.App;
  let stack: VocalShieldStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new VocalShieldStack(app, 'TestStack', devConfig);
    template = Template.fromStack(stack);
  });

  test('WebSocket API endpoint output is defined', () => {
    const outputs = template.toJSON().Outputs;
    expect(outputs).toHaveProperty('WebSocketApiEndpoint');
    expect(outputs.WebSocketApiEndpoint.Description).toContain('WebSocket');
  });

  test('WebSocket API ID output is defined', () => {
    const outputs = template.toJSON().Outputs;
    expect(outputs).toHaveProperty('WebSocketApiId');
  });

  test('Connections table name output is defined', () => {
    const outputs = template.toJSON().Outputs;
    expect(outputs).toHaveProperty('ConnectionsTableName');
    expect(outputs.ConnectionsTableName.Description).toContain('Connections');
  });

  test('Metadata table name output is defined', () => {
    const outputs = template.toJSON().Outputs;
    expect(outputs).toHaveProperty('MetadataTableName');
    expect(outputs.MetadataTableName.Description).toContain('Metadata');
  });

  test('Family Loop topic ARN output is defined', () => {
    const outputs = template.toJSON().Outputs;
    expect(outputs).toHaveProperty('FamilyLoopTopicArn');
    expect(outputs.FamilyLoopTopicArn.Description).toContain('SNS');
  });

  test('Audio queue URL output is defined', () => {
    const outputs = template.toJSON().Outputs;
    expect(outputs).toHaveProperty('AudioQueueUrl');
    expect(outputs.AudioQueueUrl.Description).toContain('SQS');
  });

  test('Lambda function ARN outputs are defined', () => {
    const outputs = template.toJSON().Outputs;
    expect(outputs).toHaveProperty('ConnectHandlerArn');
    expect(outputs).toHaveProperty('DisconnectHandlerArn');
    expect(outputs).toHaveProperty('AudioProcessorArn');
  });

  test('Dashboard URL output is defined', () => {
    const outputs = template.toJSON().Outputs;
    expect(outputs).toHaveProperty('DashboardUrl');
    expect(outputs.DashboardUrl.Description).toContain('Dashboard');
  });

  test('Outputs have export names for cross-stack references', () => {
    const outputs = template.toJSON().Outputs;
    
    // Check that key outputs have export names
    expect(outputs.WebSocketApiEndpoint.Export).toBeDefined();
    expect(outputs.WebSocketApiId.Export).toBeDefined();
    expect(outputs.ConnectionsTableName.Export).toBeDefined();
    expect(outputs.MetadataTableName.Export).toBeDefined();
  });

  test('No secrets are exposed in outputs', () => {
    const outputs = template.toJSON().Outputs;
    
    // Verify no output contains secret-related keywords
    Object.entries(outputs).forEach(([key, output]: [string, any]) => {
      expect(key.toLowerCase()).not.toContain('secret');
      expect(key.toLowerCase()).not.toContain('password');
      expect(key.toLowerCase()).not.toContain('apikey');
      
      if (output.Description) {
        expect(output.Description.toLowerCase()).not.toContain('secret');
        expect(output.Description.toLowerCase()).not.toContain('password');
      }
    });
  });

  test('All outputs have descriptions', () => {
    const outputs = template.toJSON().Outputs;
    
    Object.entries(outputs).forEach(([key, output]: [string, any]) => {
      expect(output.Description).toBeDefined();
      expect(output.Description.length).toBeGreaterThan(0);
    });
  });
});
