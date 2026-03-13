"use strict";
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logInsightsQueryManager = exports.LogInsightsQueryManager = exports.securityMonitor = exports.SecurityMonitor = exports.FREE_TIER_LIMITS = exports.freeTierUsageTracker = exports.FreeTierUsageTracker = exports.ErrorCategory = exports.errorTracker = exports.ErrorTracker = exports.serviceMetricTracker = exports.ServiceMetricTracker = exports.coldStartTracker = exports.ColdStartTracker = exports.percentileCalculator = exports.PercentileCalculator = exports.SNSNotificationHandler = exports.AlarmManager = exports.tracer = exports.XRayTracer = exports.metricPublisher = exports.MetricPublisher = exports.logger = exports.StructuredLogger = void 0;
// Export types
__exportStar(require("./types"), exports);
// Export logger
var structured_logger_1 = require("./structured-logger");
Object.defineProperty(exports, "StructuredLogger", { enumerable: true, get: function () { return structured_logger_1.StructuredLogger; } });
Object.defineProperty(exports, "logger", { enumerable: true, get: function () { return structured_logger_1.logger; } });
// Export metric publisher
var metric_publisher_1 = require("./metric-publisher");
Object.defineProperty(exports, "MetricPublisher", { enumerable: true, get: function () { return metric_publisher_1.MetricPublisher; } });
Object.defineProperty(exports, "metricPublisher", { enumerable: true, get: function () { return metric_publisher_1.metricPublisher; } });
// Export X-Ray tracer
var xray_tracer_1 = require("./xray-tracer");
Object.defineProperty(exports, "XRayTracer", { enumerable: true, get: function () { return xray_tracer_1.XRayTracer; } });
Object.defineProperty(exports, "tracer", { enumerable: true, get: function () { return xray_tracer_1.tracer; } });
// Export alarm manager
var alarm_manager_1 = require("./alarm-manager");
Object.defineProperty(exports, "AlarmManager", { enumerable: true, get: function () { return alarm_manager_1.AlarmManager; } });
// Export SNS notification handler
var sns_notification_handler_1 = require("./sns-notification-handler");
Object.defineProperty(exports, "SNSNotificationHandler", { enumerable: true, get: function () { return sns_notification_handler_1.SNSNotificationHandler; } });
// Export percentile calculator
var percentile_calculator_1 = require("./percentile-calculator");
Object.defineProperty(exports, "PercentileCalculator", { enumerable: true, get: function () { return percentile_calculator_1.PercentileCalculator; } });
Object.defineProperty(exports, "percentileCalculator", { enumerable: true, get: function () { return percentile_calculator_1.percentileCalculator; } });
// Export cold start tracker
var cold_start_tracker_1 = require("./cold-start-tracker");
Object.defineProperty(exports, "ColdStartTracker", { enumerable: true, get: function () { return cold_start_tracker_1.ColdStartTracker; } });
Object.defineProperty(exports, "coldStartTracker", { enumerable: true, get: function () { return cold_start_tracker_1.coldStartTracker; } });
// Export service metric tracker
var service_metric_tracker_1 = require("./service-metric-tracker");
Object.defineProperty(exports, "ServiceMetricTracker", { enumerable: true, get: function () { return service_metric_tracker_1.ServiceMetricTracker; } });
Object.defineProperty(exports, "serviceMetricTracker", { enumerable: true, get: function () { return service_metric_tracker_1.serviceMetricTracker; } });
// Export error tracker
var error_tracker_1 = require("./error-tracker");
Object.defineProperty(exports, "ErrorTracker", { enumerable: true, get: function () { return error_tracker_1.ErrorTracker; } });
Object.defineProperty(exports, "errorTracker", { enumerable: true, get: function () { return error_tracker_1.errorTracker; } });
Object.defineProperty(exports, "ErrorCategory", { enumerable: true, get: function () { return error_tracker_1.ErrorCategory; } });
// Export free tier usage tracker
var free_tier_usage_tracker_1 = require("./free-tier-usage-tracker");
Object.defineProperty(exports, "FreeTierUsageTracker", { enumerable: true, get: function () { return free_tier_usage_tracker_1.FreeTierUsageTracker; } });
Object.defineProperty(exports, "freeTierUsageTracker", { enumerable: true, get: function () { return free_tier_usage_tracker_1.freeTierUsageTracker; } });
Object.defineProperty(exports, "FREE_TIER_LIMITS", { enumerable: true, get: function () { return free_tier_usage_tracker_1.FREE_TIER_LIMITS; } });
// Export security monitor
var security_monitor_1 = require("./security-monitor");
Object.defineProperty(exports, "SecurityMonitor", { enumerable: true, get: function () { return security_monitor_1.SecurityMonitor; } });
Object.defineProperty(exports, "securityMonitor", { enumerable: true, get: function () { return security_monitor_1.securityMonitor; } });
// Export log insights query manager
var log_insights_query_manager_1 = require("./log-insights-query-manager");
Object.defineProperty(exports, "LogInsightsQueryManager", { enumerable: true, get: function () { return log_insights_query_manager_1.LogInsightsQueryManager; } });
Object.defineProperty(exports, "logInsightsQueryManager", { enumerable: true, get: function () { return log_insights_query_manager_1.logInsightsQueryManager; } });
//# sourceMappingURL=index.js.map