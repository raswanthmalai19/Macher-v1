/**
 * Shared types and interfaces for VocalShield Monitoring and Observability
 * 
 * This file defines the core types used across all monitoring components.
 */

/**
 * Log levels for structured logging
 */
export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

/**
 * Metric units for CloudWatch metrics
 */
export enum MetricUnit {
  Count = 'Count',
  Milliseconds = 'Milliseconds',
  Percent = 'Percent',
  Bytes = 'Bytes'
}

/**
 * Context information for structured log entries
 */
export interface LogContext {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  component: string;
  operation?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Structured log entry format
 */
export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  component: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  operation?: string;
  duration?: number;
  error?: {
    message: string;
    stack: string;
    type: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Alarm severity levels
 */
export type AlarmSeverity = 'critical' | 'warning' | 'info';

/**
 * Alarm configuration
 */
export interface AlarmConfig {
  alarmName: string;
  description: string;
  metricNamespace: string;
  metricName: string;
  dimensions: Record<string, string>;
  statistic: 'Average' | 'Sum' | 'Maximum' | 'Minimum' | 'SampleCount';
  period: number;
  evaluationPeriods: number;
  threshold: number;
  comparisonOperator: 'GreaterThanThreshold' | 'LessThanThreshold' | 'GreaterThanOrEqualToThreshold' | 'LessThanOrEqualToThreshold';
  treatMissingData: 'notBreaching' | 'breaching' | 'ignore' | 'missing';
  actionsEnabled: boolean;
  alarmActions: string[];
  severity: AlarmSeverity;
}

/**
 * Dashboard widget types
 */
export type DashboardWidgetType = 'metric' | 'log' | 'number' | 'text' | 'alarm';

/**
 * Dashboard widget configuration
 */
export interface DashboardWidget {
  type: DashboardWidgetType;
  x: number;
  y: number;
  width: number;
  height: number;
  properties: WidgetProperties;
}

/**
 * Widget properties (union type for different widget types)
 */
export type WidgetProperties = MetricWidgetProperties | LogWidgetProperties | NumberWidgetProperties | TextWidgetProperties;

/**
 * Metric widget properties
 */
export interface MetricWidgetProperties {
  metrics: MetricQuery[];
  period: number;
  stat: 'Average' | 'Sum' | 'Maximum' | 'Minimum' | 'p50' | 'p90' | 'p99';
  region: string;
  title: string;
  yAxis?: {
    left?: { min?: number; max?: number };
    right?: { min?: number; max?: number };
  };
}

/**
 * Log widget properties
 */
export interface LogWidgetProperties {
  query: string;
  region: string;
  title: string;
}

/**
 * Number widget properties
 */
export interface NumberWidgetProperties {
  metrics: MetricQuery[];
  region: string;
  title: string;
}

/**
 * Text widget properties
 */
export interface TextWidgetProperties {
  markdown: string;
}

/**
 * Metric query for CloudWatch
 */
export interface MetricQuery {
  namespace: string;
  metricName: string;
  dimensions: Record<string, string>;
  stat: string;
  label?: string;
}

/**
 * Notification message for SNS
 */
export interface NotificationMessage {
  severity: AlarmSeverity;
  alarmName: string;
  alarmDescription: string;
  metricName: string;
  currentValue: number;
  threshold: number;
  timestamp: string;
  dashboardLink: string;
  remediationSteps: string[];
}

/**
 * Free Tier usage tracking
 */
export interface FreeTierUsage {
  service: string;
  metric: string;
  limit: number;
  currentUsage: number;
  usagePercentage: number;
  period: 'daily' | 'monthly';
  lastUpdated: Date;
  projectedUsage?: number;
  daysUntilOverage?: number;
}
