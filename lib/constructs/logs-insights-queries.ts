import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface LogsInsightsQueriesConstructProps {
  config: EnvironmentConfig;
  logGroups: logs.ILogGroup[];
}

/**
 * CloudWatch Logs Insights Queries Construct
 * 
 * Creates saved queries for common log analysis tasks:
 * - Fraud Detection Rate
 * - Processing Latency P99
 * - Error Analysis
 * - Top Sessions by Processing Time
 */
export class LogsInsightsQueriesConstruct extends Construct {
  public readonly fraudDetectionRateQuery: logs.CfnQueryDefinition;
  public readonly processingLatencyQuery: logs.CfnQueryDefinition;
  public readonly errorAnalysisQuery: logs.CfnQueryDefinition;
  public readonly topSessionsQuery: logs.CfnQueryDefinition;

  constructor(scope: Construct, id: string, props: LogsInsightsQueriesConstructProps) {
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
