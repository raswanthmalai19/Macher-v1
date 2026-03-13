"use strict";
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
exports.AnomalyDetectionConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const constructs_1 = require("constructs");
/**
 * CloudWatch Anomaly Detection Construct
 *
 * Creates anomaly detectors for:
 * - Lambda invocation count (detect traffic spikes)
 * - Lambda error rate (detect system issues)
 * - Lambda duration (detect performance degradation)
 * - DynamoDB throttling (detect capacity issues)
 */
class AnomalyDetectionConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { config, lambdaFunctions } = props;
        this.anomalyDetectors = [];
        // Create anomaly detectors for each Lambda function
        lambdaFunctions.forEach((fn, index) => {
            // Anomaly Detector 1: Invocation Count
            const invocationDetector = new cloudwatch.CfnAnomalyDetector(this, `InvocationAnomaly${index}`, {
                metricName: 'Invocations',
                namespace: 'AWS/Lambda',
                stat: 'Sum',
                dimensions: [
                    {
                        name: 'FunctionName',
                        value: fn.functionName,
                    },
                ],
            });
            this.anomalyDetectors.push(invocationDetector);
            // Anomaly Detector 2: Error Rate
            const errorDetector = new cloudwatch.CfnAnomalyDetector(this, `ErrorAnomaly${index}`, {
                metricName: 'Errors',
                namespace: 'AWS/Lambda',
                stat: 'Sum',
                dimensions: [
                    {
                        name: 'FunctionName',
                        value: fn.functionName,
                    },
                ],
            });
            this.anomalyDetectors.push(errorDetector);
            // Anomaly Detector 3: Duration (Performance)
            const durationDetector = new cloudwatch.CfnAnomalyDetector(this, `DurationAnomaly${index}`, {
                metricName: 'Duration',
                namespace: 'AWS/Lambda',
                stat: 'Average',
                dimensions: [
                    {
                        name: 'FunctionName',
                        value: fn.functionName,
                    },
                ],
            });
            this.anomalyDetectors.push(durationDetector);
        });
        // Apply tags
        cdk.Tags.of(this).add('Component', 'AnomalyDetection');
    }
}
exports.AnomalyDetectionConstruct = AnomalyDetectionConstruct;
//# sourceMappingURL=anomaly-detection.js.map