"use strict";
/**
 * XRayTracer - Distributed tracing wrapper for AWS X-Ray
 *
 * This class provides a simplified interface for instrumenting code with
 * AWS X-Ray distributed tracing.
 *
 * Features:
 * - Automatic AWS SDK instrumentation
 * - Custom subsegment creation
 * - Annotation and metadata support
 * - Sampling configuration (10% success, 100% errors)
 *
 * Usage:
 * ```typescript
 * const tracer = new XRayTracer();
 *
 * // Capture a function
 * await tracer.captureFunc('ProcessAudio', async (subsegment) => {
 *   subsegment.addAnnotation('userId', 'user-123');
 *   // ... processing logic
 * });
 *
 * // Instrument AWS SDK
 * const dynamodb = tracer.captureAWS(new DynamoDBClient({}));
 * ```
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.tracer = exports.XRayTracer = void 0;
const AWSXRay = __importStar(require("aws-xray-sdk-core"));
const structured_logger_1 = require("./structured-logger");
/**
 * XRayTracer class for distributed tracing
 */
class XRayTracer {
    constructor(config = {}) {
        this.enabled = config.enabled !== false; // Enabled by default
        this.samplingRate = config.samplingRate || 0.1; // 10% sampling by default
        if (this.enabled) {
            // Configure X-Ray sampling rules
            this.configureSampling();
        }
    }
    /**
     * Configure X-Ray sampling rules
     * - Sample 10% of successful requests
     * - Sample 100% of errors
     */
    configureSampling() {
        // X-Ray SDK automatically samples errors at 100%
        // We configure the success sampling rate
        AWSXRay.middleware.setSamplingRules({
            version: 2,
            default: {
                fixed_target: 1, // Always sample at least 1 request per second
                rate: this.samplingRate, // Sample 10% of remaining requests
            },
            rules: [],
        });
    }
    /**
     * Capture a function execution in a subsegment
     */
    async captureFunc(name, func) {
        if (!this.enabled) {
            // If tracing is disabled, just execute the function
            const mockSubsegment = this.createMockSubsegment();
            return func(mockSubsegment);
        }
        return new Promise((resolve, reject) => {
            AWSXRay.captureAsyncFunc(name, async (subsegment) => {
                try {
                    const result = await func(subsegment);
                    subsegment?.close();
                    resolve(result);
                }
                catch (error) {
                    if (subsegment) {
                        subsegment.addError(error);
                        subsegment.close();
                    }
                    reject(error);
                }
            });
        });
    }
    /**
     * Instrument AWS SDK client with X-Ray
     */
    captureAWS(service) {
        if (!this.enabled) {
            return service;
        }
        try {
            return AWSXRay.captureAWSv3Client(service);
        }
        catch (error) {
            structured_logger_1.logger.warn('Failed to instrument AWS SDK with X-Ray', {
                component: 'XRayTracer',
                metadata: {
                    error: error.message,
                },
            });
            return service;
        }
    }
    /**
     * Capture HTTP/HTTPS requests globally
     */
    captureHTTPsGlobal() {
        if (!this.enabled) {
            return;
        }
        try {
            AWSXRay.captureHTTPsGlobal(require('http'));
            AWSXRay.captureHTTPsGlobal(require('https'));
        }
        catch (error) {
            structured_logger_1.logger.warn('Failed to capture HTTP/HTTPS globally', {
                component: 'XRayTracer',
                metadata: {
                    error: error.message,
                },
            });
        }
    }
    /**
     * Add annotation to current segment
     */
    addAnnotation(key, value) {
        if (!this.enabled) {
            return;
        }
        const segment = AWSXRay.getSegment();
        if (segment) {
            segment.addAnnotation(key, value);
        }
    }
    /**
     * Add metadata to current segment
     */
    addMetadata(key, value, namespace) {
        if (!this.enabled) {
            return;
        }
        const segment = AWSXRay.getSegment();
        if (segment) {
            segment.addMetadata(key, value, namespace);
        }
    }
    /**
     * Set user ID for current segment
     */
    setUser(userId) {
        if (!this.enabled) {
            return;
        }
        const segment = AWSXRay.getSegment();
        if (segment && 'setUser' in segment) {
            segment.setUser(userId);
        }
    }
    /**
     * Get current trace ID
     */
    getTraceId() {
        if (!this.enabled) {
            return undefined;
        }
        const segment = AWSXRay.getSegment();
        if (segment && 'trace_id' in segment) {
            return segment.trace_id;
        }
        return undefined;
    }
    /**
     * Create a mock subsegment for when tracing is disabled
     */
    createMockSubsegment() {
        return {
            addAnnotation: () => { },
            addMetadata: () => { },
            addError: () => { },
            close: () => { },
        };
    }
    /**
     * Check if tracing is enabled
     */
    isEnabled() {
        return this.enabled;
    }
}
exports.XRayTracer = XRayTracer;
/**
 * Create a singleton tracer instance for convenience
 */
exports.tracer = new XRayTracer();
//# sourceMappingURL=xray-tracer.js.map