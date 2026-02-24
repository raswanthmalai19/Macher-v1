/**
 * VocalShield Monitoring and Observability
 * 
 * This module provides comprehensive monitoring and observability utilities
 * for the VocalShield application, including:
 * - Structured logging
 * - Custom metrics publishing
 * - Distributed tracing with X-Ray
 * - Alarm management
 * - SNS notifications
 * 
 * All components are designed to stay within AWS Free Tier limits.
 */

// Export types
export * from './types';

// Export logger
export { StructuredLogger, logger } from './structured-logger';

// Export metric publisher
export { MetricPublisher, metricPublisher } from './metric-publisher';

// Export X-Ray tracer
export { XRayTracer, tracer, Subsegment } from './xray-tracer';

// Export alarm manager
export { AlarmManager } from './alarm-manager';

// Export SNS notification handler
export { SNSNotificationHandler } from './sns-notification-handler';

// Export percentile calculator
export { PercentileCalculator, percentileCalculator } from './percentile-calculator';

// Export cold start tracker
export { ColdStartTracker, coldStartTracker } from './cold-start-tracker';

// Export service metric tracker
export { ServiceMetricTracker, serviceMetricTracker } from './service-metric-tracker';

// Export error tracker
export { ErrorTracker, errorTracker, ErrorCategory } from './error-tracker';
export type { ErrorContext, LambdaErrorContext, APIGatewayErrorContext, DynamoDBErrorContext } from './error-tracker';

// Export free tier usage tracker
export { FreeTierUsageTracker, freeTierUsageTracker, FREE_TIER_LIMITS } from './free-tier-usage-tracker';
export type { FreeTierUsageTrackerConfig, ServiceUsageData } from './free-tier-usage-tracker';

// Export security monitor
export { SecurityMonitor, securityMonitor } from './security-monitor';

// Export log insights query manager
export { LogInsightsQueryManager, logInsightsQueryManager } from './log-insights-query-manager';
export type { TimeRange, QueryResult, LogRecord, SavedQuery } from './log-insights-query-manager';
