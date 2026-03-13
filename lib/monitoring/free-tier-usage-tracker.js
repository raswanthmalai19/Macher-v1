"use strict";
/**
 * FreeTierUsageTracker - Monitor AWS Free Tier usage and project overages
 *
 * This class tracks usage across AWS services to ensure VocalShield stays
 * within Free Tier limits. It monitors Lambda, DynamoDB, CloudWatch Logs,
 * CloudWatch Metrics, and API Gateway usage.
 *
 * Features:
 * - Track current usage against Free Tier limits
 * - Calculate usage percentage for each service
 * - Project end-of-month usage based on current trends
 * - Trigger alarms at 80% and 95% thresholds
 * - Publish usage metrics to CloudWatch
 *
 * Usage:
 * ```typescript
 * const tracker = new FreeTierUsageTracker();
 * const usage = await tracker.trackLambdaUsage(50000, 100000);
 * const projection = tracker.projectUsage(usage, 15); // 15 days into month
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.freeTierUsageTracker = exports.FreeTierUsageTracker = exports.FREE_TIER_LIMITS = void 0;
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
const types_1 = require("./types");
const structured_logger_1 = require("./structured-logger");
const metric_publisher_1 = require("./metric-publisher");
/**
 * Free Tier limits for AWS services (monthly)
 */
exports.FREE_TIER_LIMITS = {
    LAMBDA_INVOCATIONS: 1000000, // 1M requests per month
    LAMBDA_COMPUTE_TIME: 400000, // 400K GB-seconds per month
    DYNAMODB_STORAGE: 25, // 25 GB storage
    DYNAMODB_RCU: 25, // 25 Read Capacity Units
    DYNAMODB_WCU: 25, // 25 Write Capacity Units
    CLOUDWATCH_LOGS: 5, // 5 GB ingestion per month
    CLOUDWATCH_METRICS: 10, // 10 custom metrics
    API_GATEWAY_REQUESTS: 1000000, // 1M requests per month
};
/**
 * FreeTierUsageTracker class
 */
class FreeTierUsageTracker {
    constructor(config = {}) {
        this.client = new client_cloudwatch_1.CloudWatchClient({
            region: config.region || process.env.AWS_REGION || 'us-east-1'
        });
        this.metricPublisher = config.metricPublisher || new metric_publisher_1.MetricPublisher();
        this.warningThreshold = config.alarmThresholds?.warning || 80;
        this.criticalThreshold = config.alarmThresholds?.critical || 95;
    }
    /**
     * Track Lambda invocation usage
     */
    async trackLambdaInvocations(currentInvocations, timestamp) {
        const usage = this.calculateUsage('Lambda', 'Invocations', currentInvocations, exports.FREE_TIER_LIMITS.LAMBDA_INVOCATIONS, timestamp);
        await this.publishUsageMetric(usage);
        await this.checkThresholds(usage);
        return usage;
    }
    /**
     * Track Lambda compute time usage (GB-seconds)
     */
    async trackLambdaComputeTime(currentGBSeconds, timestamp) {
        const usage = this.calculateUsage('Lambda', 'ComputeTime', currentGBSeconds, exports.FREE_TIER_LIMITS.LAMBDA_COMPUTE_TIME, timestamp);
        await this.publishUsageMetric(usage);
        await this.checkThresholds(usage);
        return usage;
    }
    /**
     * Track DynamoDB storage usage
     */
    async trackDynamoDBStorage(currentStorageGB, timestamp) {
        const usage = this.calculateUsage('DynamoDB', 'Storage', currentStorageGB, exports.FREE_TIER_LIMITS.DYNAMODB_STORAGE, timestamp);
        await this.publishUsageMetric(usage);
        await this.checkThresholds(usage);
        return usage;
    }
    /**
     * Track DynamoDB read capacity usage
     */
    async trackDynamoDBReadCapacity(currentRCU, timestamp) {
        const usage = this.calculateUsage('DynamoDB', 'ReadCapacity', currentRCU, exports.FREE_TIER_LIMITS.DYNAMODB_RCU, timestamp);
        await this.publishUsageMetric(usage);
        await this.checkThresholds(usage);
        return usage;
    }
    /**
     * Track DynamoDB write capacity usage
     */
    async trackDynamoDBWriteCapacity(currentWCU, timestamp) {
        const usage = this.calculateUsage('DynamoDB', 'WriteCapacity', currentWCU, exports.FREE_TIER_LIMITS.DYNAMODB_WCU, timestamp);
        await this.publishUsageMetric(usage);
        await this.checkThresholds(usage);
        return usage;
    }
    /**
     * Track CloudWatch Logs ingestion usage
     */
    async trackCloudWatchLogs(currentIngestionGB, timestamp) {
        const usage = this.calculateUsage('CloudWatch', 'LogsIngestion', currentIngestionGB, exports.FREE_TIER_LIMITS.CLOUDWATCH_LOGS, timestamp);
        await this.publishUsageMetric(usage);
        await this.checkThresholds(usage);
        return usage;
    }
    /**
     * Track CloudWatch custom metrics count
     */
    async trackCloudWatchMetrics(currentMetricCount, timestamp) {
        const usage = this.calculateUsage('CloudWatch', 'CustomMetrics', currentMetricCount, exports.FREE_TIER_LIMITS.CLOUDWATCH_METRICS, timestamp);
        await this.publishUsageMetric(usage);
        await this.checkThresholds(usage);
        return usage;
    }
    /**
     * Track API Gateway request usage
     */
    async trackAPIGatewayRequests(currentRequests, timestamp) {
        const usage = this.calculateUsage('APIGateway', 'Requests', currentRequests, exports.FREE_TIER_LIMITS.API_GATEWAY_REQUESTS, timestamp);
        await this.publishUsageMetric(usage);
        await this.checkThresholds(usage);
        return usage;
    }
    /**
     * Calculate usage percentage for a service
     */
    calculateUsagePercentage(service, currentUsage, limit) {
        if (limit <= 0) {
            structured_logger_1.logger.warn('Invalid limit for usage calculation', {
                component: 'FreeTierUsageTracker',
                metadata: { service, limit },
            });
            return 0;
        }
        const percentage = (currentUsage / limit) * 100;
        return Math.max(0, percentage); // Ensure non-negative
    }
    /**
     * Calculate usage data
     */
    calculateUsage(service, metric, currentUsage, limit, timestamp) {
        const usagePercentage = this.calculateUsagePercentage(service, currentUsage, limit);
        return {
            service,
            metric,
            limit,
            currentUsage,
            usagePercentage,
            period: 'monthly',
            lastUpdated: timestamp || new Date(),
        };
    }
    /**
     * Project usage at end of month based on current trends
     */
    projectUsage(usage, currentDayOfMonth) {
        if (currentDayOfMonth <= 0 || currentDayOfMonth > 31) {
            structured_logger_1.logger.warn('Invalid day of month for projection', {
                component: 'FreeTierUsageTracker',
                metadata: { currentDayOfMonth },
            });
            return usage;
        }
        // Calculate daily usage rate
        const dailyUsageRate = usage.currentUsage / currentDayOfMonth;
        // Assume 30-day month for projection
        const daysInMonth = 30;
        const projectedUsage = dailyUsageRate * daysInMonth;
        // Calculate days until overage (if projected to exceed)
        let daysUntilOverage;
        if (projectedUsage > usage.limit) {
            const remainingCapacity = usage.limit - usage.currentUsage;
            if (remainingCapacity > 0 && dailyUsageRate > 0) {
                daysUntilOverage = Math.floor(remainingCapacity / dailyUsageRate);
            }
            else {
                daysUntilOverage = 0; // Already over or will be immediately
            }
        }
        return {
            ...usage,
            projectedUsage,
            daysUntilOverage,
        };
    }
    /**
     * Check if usage exceeds alarm thresholds
     */
    async checkThresholds(usage) {
        if (usage.usagePercentage >= this.criticalThreshold) {
            structured_logger_1.logger.error('Critical Free Tier usage threshold exceeded', new Error('Free Tier limit critical'), {
                component: 'FreeTierUsageTracker',
                metadata: {
                    service: usage.service,
                    metric: usage.metric,
                    usagePercentage: usage.usagePercentage,
                    threshold: this.criticalThreshold,
                    currentUsage: usage.currentUsage,
                    limit: usage.limit,
                },
            });
        }
        else if (usage.usagePercentage >= this.warningThreshold) {
            structured_logger_1.logger.warn('Warning Free Tier usage threshold exceeded', {
                component: 'FreeTierUsageTracker',
                metadata: {
                    service: usage.service,
                    metric: usage.metric,
                    usagePercentage: usage.usagePercentage,
                    threshold: this.warningThreshold,
                    currentUsage: usage.currentUsage,
                    limit: usage.limit,
                },
            });
        }
    }
    /**
     * Publish usage metric to CloudWatch
     */
    async publishUsageMetric(usage) {
        try {
            await this.metricPublisher.publishMetric('VocalShield/FreeTier', 'UsagePercentage', usage.usagePercentage, types_1.MetricUnit.Percent, {
                Service: usage.service,
                Metric: usage.metric,
            }, usage.lastUpdated);
            structured_logger_1.logger.info('Free Tier usage metric published', {
                component: 'FreeTierUsageTracker',
                metadata: {
                    service: usage.service,
                    metric: usage.metric,
                    usagePercentage: usage.usagePercentage,
                },
            });
        }
        catch (error) {
            structured_logger_1.logger.error('Failed to publish Free Tier usage metric', error, {
                component: 'FreeTierUsageTracker',
                metadata: {
                    service: usage.service,
                    metric: usage.metric,
                },
            });
        }
    }
    /**
     * Get all Free Tier usage data
     */
    async getAllUsage() {
        // This would typically query CloudWatch for current usage
        // For now, return empty array as placeholder
        structured_logger_1.logger.info('Getting all Free Tier usage data', {
            component: 'FreeTierUsageTracker',
        });
        return [];
    }
    /**
     * Check if any service is projected to exceed Free Tier within specified days
     */
    async checkProjectedOverage(usage, currentDayOfMonth, daysThreshold = 7) {
        const projected = this.projectUsage(usage, currentDayOfMonth);
        if (projected.daysUntilOverage !== undefined && projected.daysUntilOverage <= daysThreshold) {
            structured_logger_1.logger.warn('Free Tier overage projected within threshold', {
                component: 'FreeTierUsageTracker',
                metadata: {
                    service: usage.service,
                    metric: usage.metric,
                    daysUntilOverage: projected.daysUntilOverage,
                    daysThreshold,
                    projectedUsage: projected.projectedUsage,
                    limit: usage.limit,
                },
            });
            return true;
        }
        return false;
    }
}
exports.FreeTierUsageTracker = FreeTierUsageTracker;
/**
 * Create a singleton instance for convenience
 */
exports.freeTierUsageTracker = new FreeTierUsageTracker();
//# sourceMappingURL=free-tier-usage-tracker.js.map