"use strict";
/**
 * MetricPublisher - Emit custom metrics to CloudWatch
 *
 * This class handles publishing custom metrics to CloudWatch while staying
 * within AWS Free Tier limits (10 custom metrics).
 *
 * Features:
 * - Batching (max 20 metrics per API call)
 * - Exponential backoff for throttling
 * - Custom metric limit enforcement
 * - Dimension-based metric multiplexing
 *
 * Usage:
 * ```typescript
 * const publisher = new MetricPublisher({ region: 'us-east-1' });
 * await publisher.publishMetric('VocalShield/Performance', 'Latency', 150, MetricUnit.Milliseconds, { Endpoint: '/analyze' });
 * await publisher.publishBusinessKPI('FraudDetectionRate', 0.85, { Environment: 'Production' });
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricPublisher = exports.MetricPublisher = void 0;
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
const types_1 = require("./types");
const structured_logger_1 = require("./structured-logger");
/**
 * MetricPublisher class for CloudWatch metrics
 */
class MetricPublisher {
    constructor(config = {}) {
        this.metricBatch = [];
        this.uniqueMetrics = new Set();
        this.client = new client_cloudwatch_1.CloudWatchClient({ region: config.region || process.env.AWS_REGION || 'us-east-1' });
        this.maxCustomMetrics = config.maxCustomMetrics || 10; // Free Tier limit
        this.batchSize = config.batchSize || 20; // CloudWatch API limit
        this.maxRetries = config.maxRetries || 3;
    }
    /**
     * Publish a custom metric to CloudWatch
     */
    async publishMetric(namespace, metricName, value, unit, dimensions, timestamp) {
        // Track unique metrics for Free Tier compliance
        const metricKey = this.getMetricKey(namespace, metricName);
        if (!this.uniqueMetrics.has(metricKey)) {
            if (this.uniqueMetrics.size >= this.maxCustomMetrics) {
                structured_logger_1.logger.warn('Custom metric limit reached, metric not published', {
                    component: 'MetricPublisher',
                    metadata: {
                        namespace,
                        metricName,
                        limit: this.maxCustomMetrics,
                    },
                });
                return;
            }
            this.uniqueMetrics.add(metricKey);
        }
        // Create metric datum
        const metricDatum = {
            MetricName: metricName,
            Value: value,
            Unit: unit,
            Timestamp: timestamp || new Date(),
            Dimensions: Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value })),
        };
        // Add to batch
        this.metricBatch.push(metricDatum);
        // Flush if batch is full
        if (this.metricBatch.length >= this.batchSize) {
            await this.flush(namespace);
        }
    }
    /**
     * Publish a business KPI metric
     */
    async publishBusinessKPI(kpiName, value, dimensions) {
        await this.publishMetric('VocalShield/BusinessKPIs', kpiName, value, types_1.MetricUnit.Count, dimensions);
    }
    /**
     * Flush pending metrics to CloudWatch
     */
    async flush(namespace) {
        if (this.metricBatch.length === 0) {
            return;
        }
        const metricsToSend = this.metricBatch.splice(0, this.batchSize);
        try {
            await this.sendMetricsWithRetry(namespace, metricsToSend);
            structured_logger_1.logger.info('Metrics published successfully', {
                component: 'MetricPublisher',
                metadata: {
                    namespace,
                    count: metricsToSend.length,
                },
            });
        }
        catch (error) {
            structured_logger_1.logger.error('Failed to publish metrics', error, {
                component: 'MetricPublisher',
                metadata: {
                    namespace,
                    count: metricsToSend.length,
                },
            });
            // Re-add failed metrics to batch for potential retry
            this.metricBatch.unshift(...metricsToSend);
        }
    }
    /**
     * Send metrics with exponential backoff retry
     */
    async sendMetricsWithRetry(namespace, metrics, attempt = 1) {
        try {
            const command = new client_cloudwatch_1.PutMetricDataCommand({
                Namespace: namespace,
                MetricData: metrics,
            });
            await this.client.send(command);
        }
        catch (error) {
            if (attempt >= this.maxRetries) {
                throw error;
            }
            // Check if error is throttling
            const errorName = error.name;
            if (errorName === 'ThrottlingException' || errorName === 'TooManyRequestsException') {
                // Exponential backoff with jitter
                const delay = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 1000, 5000);
                structured_logger_1.logger.warn('CloudWatch API throttled, retrying', {
                    component: 'MetricPublisher',
                    metadata: {
                        attempt,
                        delay,
                    },
                });
                await this.sleep(delay);
                return this.sendMetricsWithRetry(namespace, metrics, attempt + 1);
            }
            throw error;
        }
    }
    /**
     * Get unique metric key for tracking
     */
    getMetricKey(namespace, metricName) {
        return `${namespace}/${metricName}`;
    }
    /**
     * Get count of unique custom metrics
     */
    getUniqueMetricCount() {
        return this.uniqueMetrics.size;
    }
    /**
     * Sleep utility for retry delays
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Cleanup and flush remaining metrics
     */
    async close() {
        // Flush any remaining metrics
        if (this.metricBatch.length > 0) {
            // Group by namespace (assume all are same namespace for simplicity)
            await this.flush('VocalShield');
        }
    }
}
exports.MetricPublisher = MetricPublisher;
/**
 * Create a singleton metric publisher instance for convenience
 */
exports.metricPublisher = new MetricPublisher();
//# sourceMappingURL=metric-publisher.js.map