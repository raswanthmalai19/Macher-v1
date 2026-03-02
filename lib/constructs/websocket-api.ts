import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface WebSocketApiConstructProps {
  config: EnvironmentConfig;
  connectHandler: lambda.Function;
  disconnectHandler: lambda.Function;
  audioProcessor: lambda.Function;
}

/**
 * Construct for MACHER WebSocket API
 * 
 * Creates API Gateway WebSocket API with:
 * - $connect route: Client connection establishment
 * - $disconnect route: Client disconnection cleanup
 * - $default route: Catch-all for unmatched routes
 * - audio route: Audio data streaming (integrated with Audio Processor Lambda)
 * 
 * Configuration:
 * - Route selection expression: $request.body.action
 * - Connection idle timeout: 10 minutes (API Gateway default)
 * - API Gateway execution role with Lambda invoke permissions
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.6
 */
export class WebSocketApiConstruct extends Construct {
  public readonly webSocketApi: apigatewayv2.WebSocketApi;
  public readonly webSocketStage: apigatewayv2.WebSocketStage;
  public readonly apiEndpoint: string;

  constructor(scope: Construct, id: string, props: WebSocketApiConstructProps) {
    super(scope, id);

    const { config, connectHandler, disconnectHandler, audioProcessor } = props;

    // Create WebSocket API with route selection expression
    this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      apiName: `MACHER-WebSocket-${config.tags.Environment}`,
      description: 'Real-time audio streaming API for MACHER fraud detection',
      routeSelectionExpression: '$request.body.action',
    });

    // Create $connect route integrated with Connect Handler
    const connectIntegration = new WebSocketLambdaIntegration(
      'ConnectIntegration',
      connectHandler
    );

    this.webSocketApi.addRoute('$connect', {
      integration: connectIntegration,
    });

    // Create $disconnect route integrated with Disconnect Handler
    const disconnectIntegration = new WebSocketLambdaIntegration(
      'DisconnectIntegration',
      disconnectHandler
    );

    this.webSocketApi.addRoute('$disconnect', {
      integration: disconnectIntegration,
    });

    // Create $default route for unmatched messages
    // For now, use the connect handler as a placeholder
    // In production, this would have its own handler
    const defaultIntegration = new WebSocketLambdaIntegration(
      'DefaultIntegration',
      connectHandler
    );

    this.webSocketApi.addRoute('$default', {
      integration: defaultIntegration,
    });

    // Create audio route integrated with Audio Processor Lambda
    // The audio route receives audio data from clients and processes it
    const audioIntegration = new WebSocketLambdaIntegration(
      'AudioIntegration',
      audioProcessor
    );

    this.webSocketApi.addRoute('audio', {
      integration: audioIntegration,
    });

    // Create WebSocket stage with 10-minute connection idle timeout
    this.webSocketStage = new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi: this.webSocketApi,
      stageName: config.tags.Environment,
      autoDeploy: true,
    });

    // Store the API endpoint for outputs
    this.apiEndpoint = this.webSocketStage.url;

    // Grant API Gateway permission to invoke Lambda functions
    // This is handled automatically by WebSocketLambdaIntegration
    // but we'll add explicit permissions for clarity and documentation

    connectHandler.grantInvoke(
      new iam.ServicePrincipal('apigateway.amazonaws.com', {
        conditions: {
          ArnLike: {
            'aws:SourceArn': `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.webSocketApi.apiId}/*`,
          },
        },
      })
    );

    disconnectHandler.grantInvoke(
      new iam.ServicePrincipal('apigateway.amazonaws.com', {
        conditions: {
          ArnLike: {
            'aws:SourceArn': `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.webSocketApi.apiId}/*`,
          },
        },
      })
    );

    audioProcessor.grantInvoke(
      new iam.ServicePrincipal('apigateway.amazonaws.com', {
        conditions: {
          ArnLike: {
            'aws:SourceArn': `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.webSocketApi.apiId}/*`,
          },
        },
      })
    );

    // Apply tags
    cdk.Tags.of(this.webSocketApi).add('Component', 'WebSocketApi');
    cdk.Tags.of(this.webSocketStage).add('Component', 'WebSocketStage');

    // Output the WebSocket API endpoint
    new cdk.CfnOutput(this, 'WebSocketApiEndpoint', {
      value: this.apiEndpoint,
      description: 'WebSocket API endpoint URL',
      exportName: `MACHER-WebSocketApiEndpoint-${config.tags.Environment}`,
    });

    // Output the WebSocket API ID for reference
    new cdk.CfnOutput(this, 'WebSocketApiId', {
      value: this.webSocketApi.apiId,
      description: 'WebSocket API ID',
      exportName: `MACHER-WebSocketApiId-${config.tags.Environment}`,
    });
  }
}
