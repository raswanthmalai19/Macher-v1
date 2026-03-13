"use strict";
/**
 * SecurityMonitor - Security event tracking and threat detection
 *
 * This class monitors security-related events across VocalShield components,
 * detecting potential attacks and logging security events for audit purposes.
 *
 * Features:
 * - Failed authentication attempt tracking
 * - Brute force attack detection (>5 failed attempts in 5 minutes)
 * - Invalid token request tracking
 * - Rate limiting violation detection (>100 requests/minute per user)
 * - Sensitive data access logging
 * - Security metrics publishing to CloudWatch
 *
 * Usage:
 * ```typescript
 * const monitor = new SecurityMonitor();
 * await monitor.logFailedAuth('user-123', 'Invalid password', '192.168.1.1');
 * await monitor.logSensitiveDataAccess('user-123', 'GetItem', { userId: 'user-123' });
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.securityMonitor = exports.SecurityMonitor = void 0;
const structured_logger_1 = require("./structured-logger");
const metric_publisher_1 = require("./metric-publisher");
const types_1 = require("./types");
/**
 * SecurityMonitor class for security event tracking and threat detection
 */
class SecurityMonitor {
    constructor(logger, metricPublisher) {
        // Configuration constants
        this.BRUTE_FORCE_THRESHOLD = 5; // attempts
        this.BRUTE_FORCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
        this.RATE_LIMIT_THRESHOLD = 100; // requests per minute
        this.RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
        this.logger = logger || new structured_logger_1.StructuredLogger();
        this.metricPublisher = metricPublisher || new metric_publisher_1.MetricPublisher();
        this.failedAuthAttempts = new Map();
        this.rateLimitRecords = new Map();
    }
    /**
     * Log a failed authentication attempt
     * Requirement 10.1: Log failed authentication attempts with userId, timestamp, reason, source IP
     * Requirement 10.2: Track failed auth attempts per userId
     * Requirement 10.3: Detect brute force attacks (>5 failed attempts in 5 minutes)
     */
    async logFailedAuth(userId, reason, sourceIp) {
        const timestamp = new Date();
        // Log the failed authentication attempt
        this.logger.warn('Failed authentication attempt', {
            component: 'SecurityMonitor',
            operation: 'authentication',
            userId,
            metadata: {
                reason,
                sourceIp,
                timestamp: timestamp.toISOString(),
            },
        });
        // Track the attempt for brute force detection
        this.trackFailedAuthAttempt(userId, timestamp, reason, sourceIp);
        // Publish metric for failed authentication
        await this.publishSecurityMetric('FailedAuthAttempts', 1, { UserId: userId });
        // Check for brute force attack
        const isBruteForce = this.detectBruteForce(userId);
        if (isBruteForce) {
            await this.handleBruteForceDetection(userId, sourceIp);
        }
    }
    /**
     * Log an invalid token request
     * Requirement 10.4: Track invalid token requests
     */
    async logInvalidToken(userId, sourceIp, reason) {
        const timestamp = new Date();
        // Log the invalid token request
        this.logger.warn('Invalid token request', {
            component: 'SecurityMonitor',
            operation: 'tokenValidation',
            userId,
            metadata: {
                reason,
                sourceIp,
                timestamp: timestamp.toISOString(),
            },
        });
        // Publish metric for invalid token requests
        await this.publishSecurityMetric('InvalidTokenRequests', 1, {
            Reason: this.sanitizeReason(reason),
        });
    }
    /**
     * Track a request for rate limiting detection
     * Requirement 10.5: Detect rate limiting violations (>100 requests/minute per userId)
     */
    async trackRequest(userId) {
        const now = new Date();
        // Get or create rate limit record for this user
        let record = this.rateLimitRecords.get(userId);
        if (!record) {
            // First request in this window
            record = {
                userId,
                requestCount: 1,
                windowStart: now,
            };
            this.rateLimitRecords.set(userId, record);
            return;
        }
        // Check if we're still in the same window
        const windowAge = now.getTime() - record.windowStart.getTime();
        if (windowAge > this.RATE_LIMIT_WINDOW_MS) {
            // Start a new window
            record.requestCount = 1;
            record.windowStart = now;
            this.rateLimitRecords.set(userId, record);
            return;
        }
        // Increment request count in current window
        record.requestCount++;
        this.rateLimitRecords.set(userId, record);
        // Check for rate limiting violation
        if (record.requestCount > this.RATE_LIMIT_THRESHOLD) {
            await this.handleRateLimitViolation(userId, record.requestCount);
        }
    }
    /**
     * Log sensitive data access
     * Requirement 10.6: Log sensitive data access with userId, timestamp, operation, item key
     */
    async logSensitiveDataAccess(userId, operation, itemKey) {
        const timestamp = new Date();
        // Log the sensitive data access
        this.logger.info('Sensitive data access', {
            component: 'SecurityMonitor',
            operation: 'dataAccess',
            userId,
            metadata: {
                accessOperation: operation,
                itemKey,
                timestamp: timestamp.toISOString(),
            },
        });
        // Publish metric for sensitive data access
        await this.publishSecurityMetric('SensitiveDataAccess', 1, {
            Operation: operation,
        });
    }
    /**
     * Track a failed authentication attempt in memory
     */
    trackFailedAuthAttempt(userId, timestamp, reason, sourceIp) {
        const attempt = {
            userId,
            timestamp,
            reason,
            sourceIp,
        };
        // Get existing attempts for this user
        const attempts = this.failedAuthAttempts.get(userId) || [];
        // Add new attempt
        attempts.push(attempt);
        // Clean up old attempts outside the brute force window
        const cutoffTime = new Date(timestamp.getTime() - this.BRUTE_FORCE_WINDOW_MS);
        const recentAttempts = attempts.filter(a => a.timestamp >= cutoffTime);
        // Update the map
        this.failedAuthAttempts.set(userId, recentAttempts);
    }
    /**
     * Detect brute force attack based on failed authentication attempts
     */
    detectBruteForce(userId) {
        const attempts = this.failedAuthAttempts.get(userId) || [];
        return attempts.length > this.BRUTE_FORCE_THRESHOLD;
    }
    /**
     * Handle brute force attack detection
     */
    async handleBruteForceDetection(userId, sourceIp) {
        const attempts = this.failedAuthAttempts.get(userId) || [];
        // Log critical security event
        this.logger.error('Brute force attack detected', new Error('Brute force attack detected'), {
            component: 'SecurityMonitor',
            operation: 'bruteForceDetection',
            userId,
            metadata: {
                attemptCount: attempts.length,
                sourceIp,
                timeWindow: `${this.BRUTE_FORCE_WINDOW_MS / 1000} seconds`,
                threshold: this.BRUTE_FORCE_THRESHOLD,
            },
        });
        // Publish critical security metric
        await this.publishSecurityMetric('BruteForceAttacks', 1, {
            UserId: userId,
            SourceIp: sourceIp,
        });
    }
    /**
     * Handle rate limiting violation
     */
    async handleRateLimitViolation(userId, requestCount) {
        // Only log once when threshold is first exceeded
        if (requestCount === this.RATE_LIMIT_THRESHOLD + 1) {
            this.logger.warn('Rate limit violation detected', {
                component: 'SecurityMonitor',
                operation: 'rateLimitDetection',
                userId,
                metadata: {
                    requestCount,
                    threshold: this.RATE_LIMIT_THRESHOLD,
                    timeWindow: `${this.RATE_LIMIT_WINDOW_MS / 1000} seconds`,
                },
            });
            // Publish security metric
            await this.publishSecurityMetric('RateLimitViolations', 1, {
                UserId: userId,
            });
        }
    }
    /**
     * Publish a security metric to CloudWatch
     */
    async publishSecurityMetric(metricName, value, dimensions) {
        try {
            await this.metricPublisher.publishMetric('VocalShield/Security', metricName, value, types_1.MetricUnit.Count, dimensions);
        }
        catch (error) {
            // Don't let metric publishing failures affect security monitoring
            this.logger.warn('Failed to publish security metric', {
                component: 'SecurityMonitor',
                metadata: {
                    metricName,
                    error: error.message,
                },
            });
        }
    }
    /**
     * Sanitize reason string for use in metric dimensions
     * CloudWatch dimension values have restrictions
     */
    sanitizeReason(reason) {
        // Remove special characters and limit length
        return reason
            .replace(/[^a-zA-Z0-9_\-. ]/g, '')
            .substring(0, 255)
            .trim() || 'Unknown';
    }
    /**
     * Clear old tracking data (for memory management)
     * Should be called periodically in production
     */
    clearOldData() {
        const now = new Date();
        // Clear old failed auth attempts
        for (const [userId, attempts] of this.failedAuthAttempts.entries()) {
            const cutoffTime = new Date(now.getTime() - this.BRUTE_FORCE_WINDOW_MS);
            const recentAttempts = attempts.filter(a => a.timestamp >= cutoffTime);
            if (recentAttempts.length === 0) {
                this.failedAuthAttempts.delete(userId);
            }
            else {
                this.failedAuthAttempts.set(userId, recentAttempts);
            }
        }
        // Clear old rate limit records
        for (const [userId, record] of this.rateLimitRecords.entries()) {
            const windowAge = now.getTime() - record.windowStart.getTime();
            if (windowAge > this.RATE_LIMIT_WINDOW_MS) {
                this.rateLimitRecords.delete(userId);
            }
        }
    }
    /**
     * Get failed authentication attempt count for a user (for testing/monitoring)
     */
    getFailedAuthCount(userId) {
        const attempts = this.failedAuthAttempts.get(userId) || [];
        return attempts.length;
    }
    /**
     * Get current request count for a user (for testing/monitoring)
     */
    getCurrentRequestCount(userId) {
        const record = this.rateLimitRecords.get(userId);
        return record?.requestCount || 0;
    }
}
exports.SecurityMonitor = SecurityMonitor;
/**
 * Create a singleton security monitor instance for convenience
 */
exports.securityMonitor = new SecurityMonitor();
//# sourceMappingURL=security-monitor.js.map