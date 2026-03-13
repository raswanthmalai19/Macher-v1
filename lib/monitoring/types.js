"use strict";
/**
 * Shared types and interfaces for VocalShield Monitoring and Observability
 *
 * This file defines the core types used across all monitoring components.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricUnit = exports.LogLevel = void 0;
/**
 * Log levels for structured logging
 */
var LogLevel;
(function (LogLevel) {
    LogLevel["INFO"] = "INFO";
    LogLevel["WARN"] = "WARN";
    LogLevel["ERROR"] = "ERROR";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
/**
 * Metric units for CloudWatch metrics
 */
var MetricUnit;
(function (MetricUnit) {
    MetricUnit["Count"] = "Count";
    MetricUnit["Milliseconds"] = "Milliseconds";
    MetricUnit["Percent"] = "Percent";
    MetricUnit["Bytes"] = "Bytes";
})(MetricUnit || (exports.MetricUnit = MetricUnit = {}));
//# sourceMappingURL=types.js.map