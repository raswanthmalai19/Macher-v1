"use strict";
/**
 * StructuredLogger - Emit consistent JSON-formatted logs to CloudWatch Logs
 *
 * This logger ensures all log entries follow a consistent structure with
 * required fields for correlation, troubleshooting, and compliance.
 *
 * Features:
 * - JSON-formatted output for CloudWatch Logs Insights
 * - Automatic timestamp and correlation ID inclusion
 * - PII sanitization
 * - Size limiting (256 KB max)
 *
 * Usage:
 * ```typescript
 * const logger = new StructuredLogger();
 * logger.info('User authenticated', { component: 'AuthHandler', userId: 'user-123' });
 * logger.error('Database error', new Error('Connection timeout'), { component: 'DataLayer' });
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.StructuredLogger = void 0;
const types_1 = require("./types");
/**
 * Maximum log entry size in bytes (CloudWatch limit is 256 KB)
 */
const MAX_LOG_SIZE = 256 * 1024;
/**
 * PII patterns to sanitize from logs
 */
const PII_PATTERNS = [
    // Phone numbers (various formats)
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    // Email addresses
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    // Credit card numbers (basic pattern)
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    // SSN (US Social Security Number)
    /\b\d{3}-\d{2}-\d{4}\b/g,
];
/**
 * StructuredLogger class for consistent JSON logging
 */
class StructuredLogger {
    /**
     * Log a message with specified level and context
     */
    log(level, message, context) {
        const entry = this.createLogEntry(level, message, context);
        this.emit(entry);
    }
    /**
     * Log an informational message
     */
    info(message, context) {
        const fullContext = {
            component: context?.component || 'Unknown',
            ...context,
        };
        this.log(types_1.LogLevel.INFO, message, fullContext);
    }
    /**
     * Log a warning message
     */
    warn(message, context) {
        const fullContext = {
            component: context?.component || 'Unknown',
            ...context,
        };
        this.log(types_1.LogLevel.WARN, message, fullContext);
    }
    /**
     * Log an error message with error details
     */
    error(message, error, context) {
        const fullContext = {
            component: context?.component || 'Unknown',
            ...context,
            metadata: {
                ...context?.metadata,
                error: {
                    message: error.message,
                    stack: error.stack || '',
                    type: error.constructor.name,
                },
            },
        };
        this.log(types_1.LogLevel.ERROR, message, fullContext);
    }
    /**
     * Create a structured log entry
     */
    createLogEntry(level, message, context) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message: this.sanitizePII(message),
            component: context.component,
        };
        // Add optional fields if present
        if (context.requestId) {
            entry.requestId = context.requestId;
        }
        if (context.userId) {
            entry.userId = this.sanitizePII(context.userId);
        }
        if (context.sessionId) {
            entry.sessionId = context.sessionId;
        }
        if (context.operation) {
            entry.operation = context.operation;
        }
        if (context.duration !== undefined) {
            entry.duration = context.duration;
        }
        if (context.metadata) {
            // Extract error from metadata if present
            const metadata = context.metadata;
            if (metadata.error && typeof metadata.error === 'object') {
                const errorObj = metadata.error;
                entry.error = {
                    message: this.sanitizePII(errorObj.message),
                    stack: this.sanitizePII(errorObj.stack),
                    type: errorObj.type,
                };
                // Remove error from metadata to avoid duplication
                const { error, ...restMetadata } = metadata;
                entry.metadata = Object.keys(restMetadata).length > 0 ? restMetadata : undefined;
            }
            else {
                entry.metadata = this.sanitizeMetadata(metadata);
            }
        }
        return entry;
    }
    /**
     * Sanitize PII from a string
     */
    sanitizePII(text) {
        let sanitized = text;
        for (const pattern of PII_PATTERNS) {
            sanitized = sanitized.replace(pattern, '[REDACTED]');
        }
        return sanitized;
    }
    /**
     * Sanitize PII from metadata object
     */
    sanitizeMetadata(metadata) {
        const sanitized = {};
        for (const [key, value] of Object.entries(metadata)) {
            if (typeof value === 'string') {
                sanitized[key] = this.sanitizePII(value);
            }
            else if (typeof value === 'object' && value !== null) {
                sanitized[key] = this.sanitizeMetadata(value);
            }
            else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }
    /**
     * Emit log entry to stdout (Lambda automatically sends to CloudWatch Logs)
     */
    emit(entry) {
        const json = JSON.stringify(entry);
        // Check size limit
        const size = Buffer.byteLength(json, 'utf8');
        if (size > MAX_LOG_SIZE) {
            // Truncate metadata if entry is too large
            const truncatedEntry = {
                ...entry,
                metadata: {
                    _truncated: true,
                    _originalSize: size,
                },
            };
            console.log(JSON.stringify(truncatedEntry));
            return;
        }
        // Emit to stdout (Lambda sends to CloudWatch Logs)
        console.log(json);
    }
}
exports.StructuredLogger = StructuredLogger;
/**
 * Create a singleton logger instance for convenience
 */
exports.logger = new StructuredLogger();
//# sourceMappingURL=structured-logger.js.map