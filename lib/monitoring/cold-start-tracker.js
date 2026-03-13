"use strict";
/**
 * ColdStartTracker - Track Lambda function cold starts
 *
 * This class detects Lambda cold starts and publishes metrics about their
 * frequency and duration to CloudWatch. Cold starts occur when Lambda
 * initializes a new execution environment.
 *
 * Features:
 * - Automatic cold start detection using initialization markers
 * - Duration tracking from initialization to first invocation
 * - CloudWatch metric publishing
 * - Per-function tracking with dimensions
 *
 * Usage:
 * ```typescript
 * // At module level (outside handler)
 * const coldStartTracker = new ColdStartTracker();
 *
 * // In Lambda handler
 * export const handler = async (event: any) => {
 *   await coldStartTracker.trackInvocation('MyFunction');
 *   // ... rest of handler logic
 * };
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.coldStartTracker = exports.ColdStartTracker = void 0;
const metric_publisher_1 = require("./metric-publisher");
const types_1 = require("./types");
const structured_logger_1 = require("./structured-logger");
/**
 * ColdStartTracker class for Lambda cold start monitoring
 */
class ColdStartTracker {
    constructor(config = {}) {
        this.isInitialized = false;
        this.invocationCount = 0;
        this.metricPublisher = config.metricPublisher || new metric_publisher_1.MetricPublisher();
        this.namespace = config.namespace || 'VocalShield/Performance';
        // Record initialization time (module load time)
        this.initializationTime = Date.now();
        structured_logger_1.logger.info('ColdStartTracker initialized', {
            component: 'ColdStartTracker',
            metadata: {
                initializationTime: this.initializationTime,
            },
        });
    }
    /**
     * Track a Lambda function invocation and detect cold starts
     *
     * This method should be called at the beginning of every Lambda handler.
     * It detects cold starts by checking if this is the first invocation
     * in the current execution environment.
     *
     * @param functionName Name of the Lambda function
     * @returns Cold start information
     */
    async trackInvocation(functionName) {
        this.invocationCount++;
        // First invocation in this execution environment = cold start
        const isColdStart = !this.isInitialized;
        if (isColdStart) {
            // Calculate cold start duration (time from initialization to first invocation)
            const duration = Date.now() - this.initializationTime;
            // Mark as initialized
            this.isInitialized = true;
            // Publish cold start metrics
            await this.publishColdStartMetrics(functionName, duration);
            structured_logger_1.logger.info('Cold start detected', {
                component: 'ColdStartTracker',
                metadata: {
                    functionName,
                    duration,
                    invocationCount: this.invocationCount,
                },
            });
            return {
                isColdStart: true,
                duration,
                timestamp: new Date(),
            };
        }
        // Warm start - no metrics to publish
        structured_logger_1.logger.info('Warm start', {
            component: 'ColdStartTracker',
            metadata: {
                functionName,
                invocationCount: this.invocationCount,
            },
        });
        return {
            isColdStart: false,
            timestamp: new Date(),
        };
    }
    /**
     * Publish cold start metrics to CloudWatch
     *
     * Publishes two metrics:
     * 1. ColdStartOccurrence (Count) - Indicates a cold start happened
     * 2. ColdStartDuration (Milliseconds) - Duration of the cold start
     *
     * @param functionName Name of the Lambda function
     * @param duration Cold start duration in milliseconds
     */
    async publishColdStartMetrics(functionName, duration) {
        const dimensions = { FunctionName: functionName };
        const timestamp = new Date();
        try {
            // Publish cold start occurrence metric
            await this.metricPublisher.publishMetric(this.namespace, 'ColdStartOccurrence', 1, types_1.MetricUnit.Count, dimensions, timestamp);
            // Publish cold start duration metric
            await this.metricPublisher.publishMetric(this.namespace, 'ColdStartDuration', duration, types_1.MetricUnit.Milliseconds, dimensions, timestamp);
            // Flush metrics to CloudWatch
            await this.metricPublisher.flush(this.namespace);
            structured_logger_1.logger.info('Cold start metrics published', {
                component: 'ColdStartTracker',
                metadata: {
                    functionName,
                    duration,
                },
            });
        }
        catch (error) {
            structured_logger_1.logger.error('Failed to publish cold start metrics', error, {
                component: 'ColdStartTracker',
                metadata: {
                    functionName,
                    duration,
                },
            });
        }
    }
    /**
     * Check if the current execution environment has been initialized
     *
     * @returns True if this is not the first invocation (warm start)
     */
    isWarmStart() {
        return this.isInitialized;
    }
    /**
     * Get the total number of invocations in this execution environment
     *
     * @returns Invocation count
     */
    getInvocationCount() {
        return this.invocationCount;
    }
    /**
     * Get the initialization time of this execution environment
     *
     * @returns Initialization timestamp in milliseconds
     */
    getInitializationTime() {
        return this.initializationTime;
    }
    /**
     * Reset the tracker state (primarily for testing)
     *
     * WARNING: This should only be used in tests. In production,
     * each execution environment maintains its own state.
     */
    reset() {
        this.isInitialized = false;
        this.invocationCount = 0;
        structured_logger_1.logger.warn('ColdStartTracker reset (should only happen in tests)', {
            component: 'ColdStartTracker',
        });
    }
}
exports.ColdStartTracker = ColdStartTracker;
/**
 * Create a singleton cold start tracker instance
 *
 * This should be instantiated at module level (outside the handler)
 * so it persists across warm invocations in the same execution environment.
 */
exports.coldStartTracker = new ColdStartTracker();
//# sourceMappingURL=cold-start-tracker.js.map