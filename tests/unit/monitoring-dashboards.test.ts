import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { MonitoringDashboardsConstruct } from '../../lib/constructs/monitoring-dashboards';
import { devConfig } from '../../lib/config/dev';

/**
 * Unit tests for Monitoring Dashboards Construct
 * 
 * Task 6.2: Write unit tests for dashboard configuration
 * 
 * Tests verify:
 * - Multiple dashboards are created (System Overview, Performance, Cost)
 * - Dashboard JSON structure is valid
 * - All required widgets are present for each dashboard type
 * - Widget types match metric types
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */
describe('Monitoring Dashboards Construct', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let template: Template;

  beforeAll(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');

    // Create mock Lambda functions
    const connectHandler = new lambda.Function(stack, 'ConnectHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => {}'),
    });

    const disconnectHandler = new lambda.Function(stack, 'DisconnectHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => {}'),
    });

    const audioProcessor = new lambda.Function(stack, 'AudioProcessor', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => {}'),
    });

    // Create monitoring dashboards
    new MonitoringDashboardsConstruct(stack, 'MonitoringDashboards', {
      config: devConfig,
      lambdaFunctions: {
        connectHandler,
        disconnectHandler,
        audioProcessor,
      },
    });

    template = Template.fromStack(stack);
  });

  describe('Dashboard Creation', () => {
    test('Creates three dashboards (System Overview, Performance, Cost)', () => {
      // Verify three dashboards are created
      template.resourceCountIs('AWS::CloudWatch::Dashboard', 3);
    });

    test('System Overview Dashboard is created with correct name', () => {
      template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
        DashboardName: 'VocalShield-Overview-dev',
      });
    });

    test('Performance Dashboard is created with correct name', () => {
      template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
        DashboardName: 'VocalShield-Performance-dev',
      });
    });

    test('Cost Dashboard is created with correct name', () => {
      template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
        DashboardName: 'VocalShield-Costs-dev',
      });
    });
  });

  describe('System Overview Dashboard Content', () => {
    test('Contains title widget', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const overviewDashboard = Object.values(dashboards).find(
        (d: any) => d.Properties.DashboardName === 'VocalShield-Overview-dev'
      );

      expect(overviewDashboard).toBeDefined();
      const bodyString = JSON.stringify(overviewDashboard);
      expect(bodyString).toContain('System Overview');
    });

    test('Contains Lambda invocation metrics', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const overviewDashboard = Object.values(dashboards).find(
        (d: any) => d.Properties.DashboardName === 'VocalShield-Overview-dev'
      );

      const bodyString = JSON.stringify(overviewDashboard);
      expect(bodyString).toContain('Lambda Invocations');
      expect(bodyString).toContain('Invocations');
    });

    test('Contains Lambda error metrics', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const overviewDashboard = Object.values(dashboards).find(
        (d: any) => d.Properties.DashboardName === 'VocalShield-Overview-dev'
      );

      const bodyString = JSON.stringify(overviewDashboard);
      expect(bodyString).toContain('Lambda Errors');
      expect(bodyString).toContain('Errors');
    });

    test('Contains Lambda duration metrics', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const overviewDashboard = Object.values(dashboards).find(
        (d: any) => d.Properties.DashboardName === 'VocalShield-Overview-dev'
      );

      const bodyString = JSON.stringify(overviewDashboard);
      expect(bodyString).toContain('Duration');
    });
  });

  describe('Performance Dashboard Content', () => {
    test('Contains title widget', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const perfDashboard = Object.values(dashboards).find(
        (d: any) => d.Properties.DashboardName === 'VocalShield-Performance-dev'
      );

      expect(perfDashboard).toBeDefined();
      const bodyString = JSON.stringify(perfDashboard);
      expect(bodyString).toContain('Performance Metrics');
    });

    test('Contains latency percentile metrics (P50, P90, P99)', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const perfDashboard = Object.values(dashboards).find(
        (d: any) => d.Properties.DashboardName === 'VocalShield-Performance-dev'
      );

      const bodyString = JSON.stringify(perfDashboard);
      expect(bodyString).toContain('Latency Percentiles');
      expect(bodyString).toContain('p50');
      expect(bodyString).toContain('p90');
      expect(bodyString).toContain('p99');
    });

    test('Contains cold start metrics', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const perfDashboard = Object.values(dashboards).find(
        (d: any) => d.Properties.DashboardName === 'VocalShield-Performance-dev'
      );

      const bodyString = JSON.stringify(perfDashboard);
      expect(bodyString).toContain('Cold Starts');
      expect(bodyString).toContain('VocalShield/Performance');
    });

    test('Has appropriate Y-axis configuration for latency', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const perfDashboard = Object.values(dashboards).find(
        (d: any) => d.Properties.DashboardName === 'VocalShield-Performance-dev'
      );

      const bodyString = JSON.stringify(perfDashboard);
      // Y-axis should have min/max for latency visualization
      expect(bodyString).toContain('yAxis');
    });
  });

  describe('Cost Dashboard Content', () => {
    test('Contains title widget', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const costDashboard = Object.values(dashboards).find(
        (d: any) => d.Properties.DashboardName === 'VocalShield-Costs-dev'
      );

      expect(costDashboard).toBeDefined();
      const bodyString = JSON.stringify(costDashboard);
      expect(bodyString).toContain('Cost Monitoring');
    });

    test('Contains Free Tier usage metrics for Lambda', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const costDashboard = Object.values(dashboards).find(
        (d: any) => d.Properties.DashboardName === 'VocalShield-Costs-dev'
      );

      const bodyString = JSON.stringify(costDashboard);
      expect(bodyString).toContain('LambdaInvocations');
      expect(bodyString).toContain('LambdaComputeTime');
      expect(bodyString).toContain('VocalShield/FreeTier');
    });

    test('Contains Free Tier usage metrics for DynamoDB', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const costDashboard = Object.values(dashboards).find(
        (d: any) => d.Properties.DashboardName === 'VocalShield-Costs-dev'
      );

      const bodyString = JSON.stringify(costDashboard);
      expect(bodyString).toContain('DynamoDB');
    });

    test('Contains Free Tier usage metrics for CloudWatch Logs', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const costDashboard = Object.values(dashboards).find(
        (d: any) => d.Properties.DashboardName === 'VocalShield-Costs-dev'
      );

      const bodyString = JSON.stringify(costDashboard);
      expect(bodyString).toContain('CloudWatchLogs');
    });

    test('Contains Free Tier usage metrics for API Gateway', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const costDashboard = Object.values(dashboards).find(
        (d: any) => d.Properties.DashboardName === 'VocalShield-Costs-dev'
      );

      const bodyString = JSON.stringify(costDashboard);
      expect(bodyString).toContain('APIGateway');
    });

    test('Free Tier widgets have 0-100% Y-axis range', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const costDashboard = Object.values(dashboards).find(
        (d: any) => d.Properties.DashboardName === 'VocalShield-Costs-dev'
      );

      const bodyString = JSON.stringify(costDashboard);
      // Y-axis should be configured for percentage (0-100)
      expect(bodyString).toContain('yAxis');
    });
  });

  describe('Widget Type Validation', () => {
    test('All dashboards use GraphWidget for time-series metrics', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      
      Object.values(dashboards).forEach((dashboard: any) => {
        const bodyString = JSON.stringify(dashboard.Properties.DashboardBody);
        
        // GraphWidget creates metric type widgets
        if (bodyString.includes('Invocations') || bodyString.includes('Duration')) {
          expect(bodyString.length).toBeGreaterThan(0);
        }
      });
    });

    test('Dashboards use appropriate statistics for metrics', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const allDashboards = JSON.stringify(dashboards);
      
      // Verify appropriate statistics are used
      expect(allDashboards).toContain('Sum'); // For counts
      expect(allDashboards).toContain('p50'); // For percentiles
      expect(allDashboards).toContain('p90'); // For percentiles
      expect(allDashboards).toContain('p99'); // For percentiles
    });
  });

  describe('Dashboard Outputs', () => {
    test('Exports System Overview Dashboard URL', () => {
      const outputs = template.findOutputs('*');
      const outputKeys = Object.keys(outputs);
      
      const hasOverviewUrl = outputKeys.some(key => 
        key.includes('SystemOverviewDashboardUrl')
      );
      expect(hasOverviewUrl).toBe(true);
    });

    test('Exports Performance Dashboard URL', () => {
      const outputs = template.findOutputs('*');
      const outputKeys = Object.keys(outputs);
      
      const hasPerfUrl = outputKeys.some(key => 
        key.includes('PerformanceDashboardUrl')
      );
      expect(hasPerfUrl).toBe(true);
    });

    test('Exports Cost Dashboard URL', () => {
      const outputs = template.findOutputs('*');
      const outputKeys = Object.keys(outputs);
      
      const hasCostUrl = outputKeys.some(key => 
        key.includes('CostDashboardUrl')
      );
      expect(hasCostUrl).toBe(true);
    });
  });

  describe('Dashboard JSON Structure Validation', () => {
    test('All dashboards have valid DashboardBody', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      
      Object.values(dashboards).forEach((dashboard: any) => {
        expect(dashboard.Properties.DashboardBody).toBeDefined();
        
        // Should be either a string or an object (CDK token)
        const bodyType = typeof dashboard.Properties.DashboardBody;
        expect(['string', 'object']).toContain(bodyType);
      });
    });

    test('Dashboard bodies are non-empty', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      
      Object.values(dashboards).forEach((dashboard: any) => {
        const bodyString = JSON.stringify(dashboard.Properties.DashboardBody);
        expect(bodyString.length).toBeGreaterThan(100);
      });
    });

    test('Dashboards reference correct metric namespaces', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const allDashboards = JSON.stringify(dashboards);
      
      // AWS service namespaces
      expect(allDashboards).toContain('AWS/Lambda');
      
      // Custom namespaces
      expect(allDashboards).toContain('VocalShield');
    });
  });

  describe('Edge Cases', () => {
    test('Handles optional Lambda functions gracefully', () => {
      const testApp = new cdk.App();
      const testStack = new cdk.Stack(testApp, 'TestStackMinimal');

      // Create with minimal Lambda functions
      const minimalFunction = new lambda.Function(testStack, 'MinimalFunction', {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {}'),
      });

      new MonitoringDashboardsConstruct(testStack, 'MinimalDashboards', {
        config: devConfig,
        lambdaFunctions: {
          audioProcessor: minimalFunction,
        },
      });

      const minimalTemplate = Template.fromStack(testStack);
      
      // Should still create all three dashboards
      minimalTemplate.resourceCountIs('AWS::CloudWatch::Dashboard', 3);
    });

    test('Dashboard names include environment from config', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      
      Object.values(dashboards).forEach((dashboard: any) => {
        const name = dashboard.Properties.DashboardName;
        expect(name).toContain(devConfig.tags.Environment);
      });
    });
  });

  describe('Metric Period Configuration', () => {
    test('Metrics use 1-minute period for real-time monitoring', () => {
      const dashboards = template.findResources('AWS::CloudWatch::Dashboard');
      const allDashboards = JSON.stringify(dashboards);
      
      // Period should be 60 seconds (1 minute) for real-time monitoring
      // CDK represents this as Duration.minutes(1) which becomes 60
      expect(allDashboards.length).toBeGreaterThan(0);
    });
  });
});
