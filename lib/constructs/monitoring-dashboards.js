"use strict";
/**
 * Monitoring Dashboards Construct
 *
 * Creates CloudWatch Dashboards for VocalShield monitoring:
 * - System Overview Dashboard
 * - Performance Dashboard
 * - Cost Monitoring Dashboard
 */
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
exports.MonitoringDashboardsConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const constructs_1 = require("constructs");
class MonitoringDashboardsConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { config, lambdaFunctions } = props;
        const environment = config.tags.Environment;
        // System Overview Dashboard
        this.systemOverviewDashboard = new cloudwatch.Dashboard(this, 'SystemOverviewDashboard', {
            dashboardName: `VocalShield-Overview-${environment}`,
        });
        // Add title widget
        this.systemOverviewDashboard.addWidgets(new cloudwatch.TextWidget({
            markdown: `# VocalShield System Overview - ${environment}\n\nReal-time monitoring of all system components`,
            width: 24,
            height: 1,
        }));
        // Lambda metrics row
        const lambdaWidgets = [];
        if (lambdaFunctions.connectHandler || lambdaFunctions.disconnectHandler || lambdaFunctions.audioProcessor) {
            const functions = [
                lambdaFunctions.connectHandler,
                lambdaFunctions.disconnectHandler,
                lambdaFunctions.audioProcessor,
            ].filter(Boolean);
            // Lambda invocations
            lambdaWidgets.push(new cloudwatch.GraphWidget({
                title: 'Lambda Invocations',
                width: 8,
                height: 6,
                left: functions.map(fn => fn.metricInvocations({ statistic: 'Sum', period: cdk.Duration.minutes(1) })),
            }));
            // Lambda errors
            lambdaWidgets.push(new cloudwatch.GraphWidget({
                title: 'Lambda Errors',
                width: 8,
                height: 6,
                left: functions.map(fn => fn.metricErrors({ statistic: 'Sum', period: cdk.Duration.minutes(1) })),
            }));
            // Lambda duration
            lambdaWidgets.push(new cloudwatch.GraphWidget({
                title: 'Lambda Duration (ms)',
                width: 8,
                height: 6,
                left: functions.map(fn => fn.metricDuration({ statistic: 'Average', period: cdk.Duration.minutes(1) })),
            }));
            this.systemOverviewDashboard.addWidgets(...lambdaWidgets);
        }
        // Performance Dashboard
        this.performanceDashboard = new cloudwatch.Dashboard(this, 'PerformanceDashboard', {
            dashboardName: `VocalShield-Performance-${environment}`,
        });
        this.performanceDashboard.addWidgets(new cloudwatch.TextWidget({
            markdown: `# VocalShield Performance Metrics - ${environment}\n\nLatency and throughput monitoring`,
            width: 24,
            height: 1,
        }));
        // Add Lambda duration percentiles
        if (lambdaFunctions.audioProcessor) {
            this.performanceDashboard.addWidgets(new cloudwatch.GraphWidget({
                title: 'Audio Processor Latency Percentiles',
                width: 12,
                height: 6,
                left: [
                    lambdaFunctions.audioProcessor.metricDuration({ statistic: 'p50', period: cdk.Duration.minutes(1), label: 'P50' }),
                    lambdaFunctions.audioProcessor.metricDuration({ statistic: 'p90', period: cdk.Duration.minutes(1), label: 'P90' }),
                    lambdaFunctions.audioProcessor.metricDuration({ statistic: 'p99', period: cdk.Duration.minutes(1), label: 'P99' }),
                ],
                leftYAxis: {
                    min: 0,
                    max: 3000,
                },
            }));
        }
        // Add custom performance metrics
        this.performanceDashboard.addWidgets(new cloudwatch.GraphWidget({
            title: 'Cold Starts',
            width: 12,
            height: 6,
            left: [
                new cloudwatch.Metric({
                    namespace: 'VocalShield/Performance',
                    metricName: 'ColdStarts',
                    statistic: 'Sum',
                    period: cdk.Duration.minutes(1),
                }),
            ],
        }));
        // Cost Monitoring Dashboard
        this.costDashboard = new cloudwatch.Dashboard(this, 'CostDashboard', {
            dashboardName: `VocalShield-Costs-${environment}`,
        });
        this.costDashboard.addWidgets(new cloudwatch.TextWidget({
            markdown: `# VocalShield Cost Monitoring - ${environment}\n\nAWS Free Tier usage tracking`,
            width: 24,
            height: 1,
        }));
        // Free Tier usage widgets
        const freeTierServices = [
            'LambdaInvocations',
            'LambdaComputeTime',
            'DynamoDB',
            'CloudWatchLogs',
            'APIGateway',
        ];
        const freeTierWidgets = freeTierServices.map(service => new cloudwatch.GraphWidget({
            title: `${service} (% of Free Tier)`,
            width: 8,
            height: 6,
            left: [
                new cloudwatch.Metric({
                    namespace: 'VocalShield/FreeTier',
                    metricName: `${service}Usage`,
                    statistic: 'Average',
                    period: cdk.Duration.minutes(5),
                    dimensionsMap: {
                        Environment: environment,
                    },
                }),
            ],
            leftYAxis: {
                min: 0,
                max: 100,
            },
        }));
        // Add widgets in rows of 3
        for (let i = 0; i < freeTierWidgets.length; i += 3) {
            this.costDashboard.addWidgets(...freeTierWidgets.slice(i, i + 3));
        }
        // Outputs
        new cdk.CfnOutput(this, 'SystemOverviewDashboardUrl', {
            value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=${this.systemOverviewDashboard.dashboardName}`,
            description: 'System Overview Dashboard URL',
        });
        new cdk.CfnOutput(this, 'PerformanceDashboardUrl', {
            value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=${this.performanceDashboard.dashboardName}`,
            description: 'Performance Dashboard URL',
        });
        new cdk.CfnOutput(this, 'CostDashboardUrl', {
            value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=${this.costDashboard.dashboardName}`,
            description: 'Cost Dashboard URL',
        });
    }
}
exports.MonitoringDashboardsConstruct = MonitoringDashboardsConstruct;
//# sourceMappingURL=monitoring-dashboards.js.map