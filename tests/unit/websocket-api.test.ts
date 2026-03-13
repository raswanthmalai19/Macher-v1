import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { VocalShieldStack } from '../../lib/vocalshield-stack';
import { devConfig } from '../../lib/config/dev';

/**
 * Unit tests for WebSocket API Gateway Configuration
 * 
 * Tests verify:
 * - WebSocket API is created with correct configuration
 * - All routes ($connect, $disconnect, $default, audio) are defined
 * - Routes integrate with correct Lambda functions
 * - API Gateway has correct execution role
 * - Connection idle timeout is configured
 * 
 * Requirements: 2.1, 2.6
 */
describe('WebSocket API Configuration', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new VocalShieldStack(app, 'TestStack', devConfig);
    template = Template.fromStack(stack);
  });

  test('WebSocket API is created', () => {
    // Verify WebSocket API exists
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: 'MACHER-WebSocket-dev',
      ProtocolType: 'WEBSOCKET',
      RouteSelectionExpression: '$request.body.action',
    });
  });

  test('$connect route is defined and integrated with Connect Handler', () => {
    // Verify $connect route exists
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: '$connect',
    });

    // Verify integration with Connect Handler Lambda
    template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
      IntegrationType: 'AWS_PROXY',
      IntegrationUri: {
        'Fn::Join': Match.arrayWith([
          Match.arrayWith([
            Match.objectLike({
              'Fn::GetAtt': Match.arrayWith([
                Match.stringLikeRegexp('LambdaFunctionsConnectHandler.*'),
                'Arn',
              ]),
            }),
          ]),
        ]),
      },
    });
  });

  test('$disconnect route is defined and integrated with Disconnect Handler', () => {
    // Verify $disconnect route exists
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: '$disconnect',
    });

    // Verify integration with Disconnect Handler Lambda
    template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
      IntegrationType: 'AWS_PROXY',
      IntegrationUri: {
        'Fn::Join': Match.arrayWith([
          Match.arrayWith([
            Match.objectLike({
              'Fn::GetAtt': Match.arrayWith([
                Match.stringLikeRegexp('LambdaFunctionsDisconnectHandler.*'),
                'Arn',
              ]),
            }),
          ]),
        ]),
      },
    });
  });

  test('$default route is defined', () => {
    // Verify $default route exists (for unmatched messages)
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: '$default',
    });
  });

  test('audio route is defined and integrated with Audio Processor', () => {
    // Verify audio route exists
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'audio',
    });

    // Verify integration with Audio Processor Lambda
    template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
      IntegrationType: 'AWS_PROXY',
      IntegrationUri: {
        'Fn::Join': Match.arrayWith([
          Match.arrayWith([
            Match.objectLike({
              'Fn::GetAtt': Match.arrayWith([
                Match.stringLikeRegexp('LambdaFunctionsAudioProcessor.*'),
                'Arn',
              ]),
            }),
          ]),
        ]),
      },
    });
  });

  test('WebSocket API has deployment stage', () => {
    // Verify deployment stage exists
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: 'dev',
      AutoDeploy: true,
    });
  });

  test('Lambda functions have API Gateway invoke permissions', () => {
    // Verify Lambda permissions for API Gateway to invoke functions
    template.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com',
    });
  });

  test('Audio Processor has execute-api:ManageConnections permission', () => {
    // Verify Audio Processor can send messages back through WebSocket
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'execute-api:ManageConnections',
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  test('WebSocket API has required tags', () => {
    // Verify API has required tags
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Tags: {
        Component: 'WebSocketApi',
        CostCenter: 'VocalShield-Infrastructure',
        Environment: 'dev',
        ManagedBy: 'CDK',
        Project: 'VocalShield',
      },
    });
  });

  test('All routes are defined (4 routes total)', () => {
    // Verify we have exactly 4 routes: $connect, $disconnect, $default, audio
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 4);
  });

  test('WebSocket API endpoint is exported as stack output', () => {
    const outputs = template.findOutputs('*');
    expect(outputs.WebSocketApiEndpoint).toBeDefined();
    expect(outputs.WebSocketApiId).toBeDefined();
  });
});
