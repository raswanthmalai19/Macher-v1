/**
 * CDK Construct for CloudWatch Logs Insights Saved Queries
 * 
 * This construct deploys pre-defined saved queries for common troubleshooting scenarios.
 */

import { Construct } from 'constructs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { CfnQueryDefinition } from 'aws-cdk-lib/aws-logs';

/**
 * Props for LogInsightsQueriesConstruct
 */
export interface LogInsightsQueriesConstructProps {
  /**
   * Log group names to query
   */
  readonly logGroupNames: string[];
}

/**
 * Construct for deploying CloudWatch Logs Insights saved queries
 */
export class LogInsightsQueriesConstruct extends Construct {
  public readonly queries: CfnQueryDefinition[];

  constructor(scope: Construct, id: string, props: LogInsightsQueriesConstructProps) {
    super(scope, id);

    this.queries = [];

    // Error Analysis Query
    this.queries.push(
      new CfnQueryDefinition(this, 'ErrorAnalysisQuery', {
        name: 'MACHER-ErrorAnalysis',
        queryString: `
fields @timestamp, component, error.type, error.message
| filter level = "ERROR"
| stats count() as errorCount by component, error.type
| sort errorCount desc
        `.trim(),
        logGroupNames: props.logGroupNames,
      })
    );

    // Latency Analysis Query
    this.queries.push(
      new CfnQueryDefinition(this, 'LatencyAnalysisQuery', {
        name: 'MACHER-LatencyAnalysis',
        queryString: `
fields @timestamp, operation, duration
| filter duration > 0
| stats pct(duration, 50) as p50, pct(duration, 90) as p90, pct(duration, 99) as p99 by operation
| sort p99 desc
        `.trim(),
        logGroupNames: props.logGroupNames,
      })
    );

    // User Activity Query
    this.queries.push(
      new CfnQueryDefinition(this, 'UserActivityQuery', {
        name: 'MACHER-UserActivity',
        queryString: `
fields @timestamp, userId, operation
| filter userId != ""
| stats count() as requestCount by userId
| sort requestCount desc
| limit 100
        `.trim(),
        logGroupNames: props.logGroupNames,
      })
    );

    // Security Events Query
    this.queries.push(
      new CfnQueryDefinition(this, 'SecurityEventsQuery', {
        name: 'MACHER-SecurityEvents',
        queryString: `
fields @timestamp, userId, metadata.reason, metadata.sourceIp
| filter operation = "authenticate" and level = "ERROR"
| stats count() as failedAttempts by userId, metadata.sourceIp
| sort failedAttempts desc
        `.trim(),
        logGroupNames: props.logGroupNames,
      })
    );

    // Cold Start Analysis Query
    this.queries.push(
      new CfnQueryDefinition(this, 'ColdStartQuery', {
        name: 'MACHER-ColdStartAnalysis',
        queryString: `
fields @timestamp, component, duration, metadata.coldStart
| filter metadata.coldStart = true
| stats count() as coldStartCount, avg(duration) as avgDuration by component
| sort coldStartCount desc
        `.trim(),
        logGroupNames: props.logGroupNames,
      })
    );

    // High Latency Requests Query
    this.queries.push(
      new CfnQueryDefinition(this, 'HighLatencyQuery', {
        name: 'MACHER-HighLatencyRequests',
        queryString: `
fields @timestamp, operation, duration, requestId
| filter duration > 2000
| sort duration desc
| limit 100
        `.trim(),
        logGroupNames: props.logGroupNames,
      })
    );

    // Free Tier Usage Query
    this.queries.push(
      new CfnQueryDefinition(this, 'FreeTierUsageQuery', {
        name: 'MACHER-FreeTierUsage',
        queryString: `
fields @timestamp, metadata.service, metadata.usagePercentage
| filter operation = "trackFreeTierUsage"
| stats max(metadata.usagePercentage) as maxUsage by metadata.service
| sort maxUsage desc
        `.trim(),
        logGroupNames: props.logGroupNames,
      })
    );

    // Request Volume by Endpoint Query
    this.queries.push(
      new CfnQueryDefinition(this, 'RequestVolumeQuery', {
        name: 'MACHER-RequestVolume',
        queryString: `
fields @timestamp, operation
| stats count() as requestCount by operation, bin(1h) as hour
| sort hour desc, requestCount desc
        `.trim(),
        logGroupNames: props.logGroupNames,
      })
    );
  }
}
