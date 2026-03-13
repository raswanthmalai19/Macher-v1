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
exports.ContributorInsightsConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const constructs_1 = require("constructs");
/**
 * CloudWatch Contributor Insights Construct
 *
 * Creates Contributor Insights rules for:
 * - Top IPs by connection count
 * - Top sessions by processing time
 * - Top error sources
 */
class ContributorInsightsConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { config, logGroups } = props;
        // Note: CloudWatch Contributor Insights rules are created via JSON configuration
        // These are typically created through the AWS Console or CLI
        // Here we document the rule configurations that should be applied
        // Rule 1: Top IPs by Connection Count
        const topIpsRuleConfig = {
            Schema: {
                Name: 'CloudWatchLogRule',
                Version: 1,
            },
            AggregateOn: 'Count',
            Contribution: {
                Filters: [
                    {
                        Match: '$.level',
                        EqualTo: 'INFO',
                    },
                    {
                        Match: '$.message',
                        Contains: 'Connection established',
                    },
                ],
                Keys: ['$.sourceIp'],
            },
            LogFormat: 'JSON',
            LogGroupNames: logGroups.map(lg => lg.logGroupName),
        };
        // Rule 2: Top Sessions by Processing Time
        const topSessionsRuleConfig = {
            Schema: {
                Name: 'CloudWatchLogRule',
                Version: 1,
            },
            AggregateOn: 'Sum',
            Contribution: {
                Filters: [
                    {
                        Match: '$.processingDuration',
                        GreaterThan: 0,
                    },
                ],
                Keys: ['$.sessionId'],
                ValueOf: '$.processingDuration',
            },
            LogFormat: 'JSON',
            LogGroupNames: logGroups.map(lg => lg.logGroupName),
        };
        // Rule 3: Top Error Sources
        const topErrorsRuleConfig = {
            Schema: {
                Name: 'CloudWatchLogRule',
                Version: 1,
            },
            AggregateOn: 'Count',
            Contribution: {
                Filters: [
                    {
                        Match: '$.level',
                        EqualTo: 'ERROR',
                    },
                ],
                Keys: ['$.error.name'],
            },
            LogFormat: 'JSON',
            LogGroupNames: logGroups.map(lg => lg.logGroupName),
        };
        // Store configurations as custom resource metadata
        // These will need to be applied via AWS CLI or Console
        new cdk.CfnOutput(this, 'TopIpsRuleConfig', {
            value: JSON.stringify(topIpsRuleConfig),
            description: 'Contributor Insights rule for top IPs by connection count',
        });
        new cdk.CfnOutput(this, 'TopSessionsRuleConfig', {
            value: JSON.stringify(topSessionsRuleConfig),
            description: 'Contributor Insights rule for top sessions by processing time',
        });
        new cdk.CfnOutput(this, 'TopErrorsRuleConfig', {
            value: JSON.stringify(topErrorsRuleConfig),
            description: 'Contributor Insights rule for top error sources',
        });
        // Apply tags
        cdk.Tags.of(this).add('Component', 'ContributorInsights');
    }
}
exports.ContributorInsightsConstruct = ContributorInsightsConstruct;
//# sourceMappingURL=contributor-insights.js.map