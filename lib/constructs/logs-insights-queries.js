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
exports.LogsInsightsQueriesConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const constructs_1 = require("constructs");
/**
 * CloudWatch Logs Insights Queries Construct
 *
 * Creates saved queries for common log analysis tasks:
 * - Fraud Detection Rate
 * - Processing Latency P99
 * - Error Analysis
 * - Top Sessions by Processing Time
 */
class LogsInsightsQueriesConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { config, logGroups } = props;
        const logGroupNames = logGroups.map(lg => lg.logGroupName);
        // Query 1: Fraud Detection Rate
        this.fraudDetectionRateQuery = new logs.CfnQueryDefinition(this, 'FraudDetectionRateQuery', {
            name: `VocalShield-FraudDetectionRate-${config.tags.Environment}`,
            queryString: `
fields @timestamp, sessionId, fraudScore
| filter fraudDetected = true
| stats count() as fraudCount by bin(5m) as time_window
| sort time_window desc
      `.trim(),
            logGroupNames,
        });
        // Query 2: Processing Latency P99
        this.processingLatencyQuery = new logs.CfnQueryDefinition(this, 'ProcessingLatencyQuery', {
            name: `VocalShield-ProcessingLatencyP99-${config.tags.Environment}`,
            queryString: `
fields @timestamp, processingDuration, sessionId
| filter processingDuration > 0
| stats 
    pct(processingDuration, 50) as p50,
    pct(processingDuration, 90) as p90,
    pct(processingDuration, 99) as p99,
    avg(processingDuration) as avg,
    max(processingDuration) as max
  by bin(5m) as time_window
| sort time_window desc
      `.trim(),
            logGroupNames,
        });
        // Query 3: Error Analysis
        this.errorAnalysisQuery = new logs.CfnQueryDefinition(this, 'ErrorAnalysisQuery', {
            name: `VocalShield-ErrorAnalysis-${config.tags.Environment}`,
            queryString: `
fields @timestamp, @message, error.name, error.message, sessionId, connectionId
| filter level = "ERROR"
| stats count() as errorCount by error.name
| sort errorCount desc
      `.trim(),
            logGroupNames,
        });
        // Query 4: Top Sessions by Processing Time
        this.topSessionsQuery = new logs.CfnQueryDefinition(this, 'TopSessionsQuery', {
            name: `VocalShield-TopSessions-${config.tags.Environment}`,
            queryString: `
fields @timestamp, sessionId, processingDuration, fraudScore
| filter processingDuration > 0
| sort processingDuration desc
| limit 20
      `.trim(),
            logGroupNames,
        });
        // Apply tags
        cdk.Tags.of(this).add('Component', 'LogsInsights');
    }
}
exports.LogsInsightsQueriesConstruct = LogsInsightsQueriesConstruct;
//# sourceMappingURL=logs-insights-queries.js.map