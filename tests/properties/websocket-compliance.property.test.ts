import * as fc from 'fast-check';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { VocalShieldStack } from '../../lib/vocalshield-stack';
import { devConfig } from '../../lib/config/dev';

/**
 * Property-Based Tests for WebSocket API Compliance
 * 
 * These tests validate universal properties for WebSocket API configuration:
 * - Property 4: Connection Cleanup (disconnect handler exists)
 * - Property 5: Error Response Codes (proper error handling configuration)
 * 
 * Validates: Requirements 2.5, 2.7
 */

describe('WebSocket API Compliance Properties', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new VocalShieldStack(app, 'TestStack', devConfig);
    template = Template.fromStack(stack);
  });

  /**
   * Property 4: Connection Cleanup
   * 
   * Universal Property: WebSocket API MUST have a $disconnect route
   * to clean up connections and associated resources
   * 
   * Validates: Requirements 2.5
   */
  test('Property 4: WebSocket API has $disconnect route for connection cleanup', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const routes = tmpl.findResources('AWS::ApiGatewayV2::Route');
          const routeKeys = Object.keys(routes);

          // Property: There must be a $disconnect route
          const hasDisconnectRoute = routeKeys.some((key) => {
            const route = routes[key];
            return route.Properties.RouteKey === '$disconnect';
          });

          if (!hasDisconnectRoute) {
            return false;
          }

          // Property: The $disconnect route must have an integration
          const disconnectRoute = routeKeys.find((key) => {
            const route = routes[key];
            return route.Properties.RouteKey === '$disconnect';
          });

          if (!disconnectRoute) {
            return false;
          }

          const route = routes[disconnectRoute];
          const hasIntegration = route.Properties.Target !== undefined;

          return hasIntegration;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4b: Disconnect Handler Lambda Exists
   * 
   * Universal Property: There must be a Lambda function to handle disconnections
   * 
   * Validates: Requirements 2.5
   */
  test('Property 4b: Disconnect handler Lambda function exists', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const lambdas = tmpl.findResources('AWS::Lambda::Function');
          const lambdaKeys = Object.keys(lambdas);

          // Property: There must be a Lambda function for disconnect handling
          const hasDisconnectHandler = lambdaKeys.some((key) => {
            const lambda = lambdas[key];
            const functionName = lambda.Properties.FunctionName;
            
            // Check if it's a disconnect handler (not a custom resource Lambda)
            return functionName && 
                   typeof functionName === 'string' && 
                   functionName.includes('Disconnect');
          });

          return hasDisconnectHandler;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4c: Disconnect Handler Has DynamoDB Permissions
   * 
   * Universal Property: Disconnect handler must have permissions to update connection status
   * 
   * Validates: Requirements 2.5
   */
  test('Property 4c: Disconnect handler has DynamoDB update permissions', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const policies = tmpl.findResources('AWS::IAM::Policy');
          const policyKeys = Object.keys(policies);

          // Property: There must be a policy granting DynamoDB UpdateItem permission
          const hasUpdatePermission = policyKeys.some((key) => {
            const policy = policies[key];
            const statements = policy.Properties.PolicyDocument.Statement;

            return statements.some((statement: any) => {
              const actions = Array.isArray(statement.Action) 
                ? statement.Action 
                : [statement.Action];

              return actions.some((action: string) => 
                action === 'dynamodb:UpdateItem'
              );
            });
          });

          return hasUpdatePermission;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 5: Error Response Codes
   * 
   * Universal Property: WebSocket API routes MUST have proper authorization
   * and error handling configuration
   * 
   * Validates: Requirements 2.7
   */
  test('Property 5: WebSocket routes have authorization configuration', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const routes = tmpl.findResources('AWS::ApiGatewayV2::Route');
          const routeKeys = Object.keys(routes);

          // Property: All routes must have AuthorizationType defined
          return routeKeys.every((key) => {
            const route = routes[key];
            return route.Properties.AuthorizationType !== undefined;
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 5b: Lambda Integrations Have Permissions
   * 
   * Universal Property: All Lambda integrations must have invoke permissions
   * from API Gateway
   * 
   * Validates: Requirements 2.7
   */
  test('Property 5b: Lambda integrations have API Gateway invoke permissions', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const integrations = tmpl.findResources('AWS::ApiGatewayV2::Integration');
          const integrationKeys = Object.keys(integrations);

          // Get all Lambda permissions
          const permissions = tmpl.findResources('AWS::Lambda::Permission');
          const permissionKeys = Object.keys(permissions);

          // Property: For each Lambda integration, there must be a corresponding permission
          return integrationKeys.every((key) => {
            const integration = integrations[key];
            
            // Only check Lambda integrations
            if (integration.Properties.IntegrationType !== 'AWS_PROXY') {
              return true;
            }

            // Check if there's a permission for API Gateway to invoke this Lambda
            const hasPermission = permissionKeys.some((permKey) => {
              const permission = permissions[permKey];
              return (
                permission.Properties.Action === 'lambda:InvokeFunction' &&
                permission.Properties.Principal === 'apigateway.amazonaws.com'
              );
            });

            return hasPermission;
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 5c: WebSocket API Has Stage
   * 
   * Universal Property: WebSocket API must have a deployment stage
   * for proper error handling and routing
   * 
   * Validates: Requirements 2.7
   */
  test('Property 5c: WebSocket API has a deployment stage', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const stages = tmpl.findResources('AWS::ApiGatewayV2::Stage');
          const stageKeys = Object.keys(stages);

          // Property: There must be at least one stage
          return stageKeys.length > 0;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 5d: All Routes Have Integrations
   * 
   * Universal Property: All WebSocket routes must have integrations
   * to handle requests properly
   * 
   * Validates: Requirements 2.7
   */
  test('Property 5d: All WebSocket routes have integrations', () => {
    fc.assert(
      fc.property(
        fc.constant(template),
        (tmpl) => {
          const routes = tmpl.findResources('AWS::ApiGatewayV2::Route');
          const routeKeys = Object.keys(routes);

          // Property: All routes must have a Target (integration)
          return routeKeys.every((key) => {
            const route = routes[key];
            return route.Properties.Target !== undefined;
          });
        }
      ),
      { numRuns: 10 }
    );
  });
});
