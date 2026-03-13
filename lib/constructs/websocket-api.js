"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketApiConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const apigatewayv2 = __importStar(require("aws-cdk-lib/aws-apigatewayv2"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const aws_apigatewayv2_integrations_1 = require("aws-cdk-lib/aws-apigatewayv2-integrations");
const constructs_1 = require("constructs");
/**
 * Construct for VocalShield WebSocket API
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
class WebSocketApiConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { config, connectHandler, disconnectHandler, audioProcessor } = props;
        // Create WebSocket API with route selection expression
        this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
            apiName: `VocalShield-WebSocket-${config.tags.Environment}`,
            description: 'Real-time audio streaming API for VocalShield fraud detection',
            routeSelectionExpression: '$request.body.action',
        });
        // Create $connect route integrated with Connect Handler
        const connectIntegration = new aws_apigatewayv2_integrations_1.WebSocketLambdaIntegration('ConnectIntegration', connectHandler);
        this.webSocketApi.addRoute('$connect', {
            integration: connectIntegration,
        });
        // Create $disconnect route integrated with Disconnect Handler
        const disconnectIntegration = new aws_apigatewayv2_integrations_1.WebSocketLambdaIntegration('DisconnectIntegration', disconnectHandler);
        this.webSocketApi.addRoute('$disconnect', {
            integration: disconnectIntegration,
        });
        // Create $default route for unmatched messages
        // For now, use the connect handler as a placeholder
        // In production, this would have its own handler
        const defaultIntegration = new aws_apigatewayv2_integrations_1.WebSocketLambdaIntegration('DefaultIntegration', connectHandler);
        this.webSocketApi.addRoute('$default', {
            integration: defaultIntegration,
        });
        // Create audio route integrated with Audio Processor Lambda
        // The audio route receives audio data from clients and processes it
        const audioIntegration = new aws_apigatewayv2_integrations_1.WebSocketLambdaIntegration('AudioIntegration', audioProcessor);
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
        connectHandler.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com', {
            conditions: {
                ArnLike: {
                    'aws:SourceArn': `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.webSocketApi.apiId}/*`,
                },
            },
        }));
        disconnectHandler.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com', {
            conditions: {
                ArnLike: {
                    'aws:SourceArn': `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.webSocketApi.apiId}/*`,
                },
            },
        }));
        audioProcessor.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com', {
            conditions: {
                ArnLike: {
                    'aws:SourceArn': `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.webSocketApi.apiId}/*`,
                },
            },
        }));
        // Apply tags
        cdk.Tags.of(this.webSocketApi).add('Component', 'WebSocketApi');
        cdk.Tags.of(this.webSocketStage).add('Component', 'WebSocketStage');
        // Output the WebSocket API endpoint
        new cdk.CfnOutput(this, 'WebSocketApiEndpoint', {
            value: this.apiEndpoint,
            description: 'WebSocket API endpoint URL',
            exportName: `VocalShield-WebSocketApiEndpoint-${config.tags.Environment}`,
        });
        // Output the WebSocket API ID for reference
        new cdk.CfnOutput(this, 'WebSocketApiId', {
            value: this.webSocketApi.apiId,
            description: 'WebSocket API ID',
            exportName: `VocalShield-WebSocketApiId-${config.tags.Environment}`,
        });
    }
}
exports.WebSocketApiConstruct = WebSocketApiConstruct;
//# sourceMappingURL=websocket-api.js.map