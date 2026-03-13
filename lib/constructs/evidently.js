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
exports.EvidentlyConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const evidently = __importStar(require("aws-cdk-lib/aws-evidently"));
const constructs_1 = require("constructs");
/**
 * CloudWatch Evidently Construct
 *
 * Creates:
 * - Evidently project for experiments
 * - Feature flag: new-fraud-algorithm (On/Off)
 * - Default variation: Off
 */
class EvidentlyConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { config } = props;
        // Create Evidently Project
        this.project = new evidently.CfnProject(this, 'VocalShieldExperiments', {
            name: `vocalshield-experiments-${config.tags.Environment}`,
            description: 'Feature flags and A/B testing for VocalShield',
        });
        // Create Feature Flag: new-fraud-algorithm
        this.newFraudAlgorithmFeature = new evidently.CfnFeature(this, 'NewFraudAlgorithmFeature', {
            project: this.project.name,
            name: 'new-fraud-algorithm',
            description: 'Enable new fraud detection algorithm',
            variations: [
                {
                    variationName: 'Off',
                    booleanValue: false,
                },
                {
                    variationName: 'On',
                    booleanValue: true,
                },
            ],
            defaultVariation: 'Off',
        });
        // Apply tags
        cdk.Tags.of(this.project).add('Component', 'Evidently');
    }
}
exports.EvidentlyConstruct = EvidentlyConstruct;
//# sourceMappingURL=evidently.js.map