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
exports.ParameterStoreConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const constructs_1 = require("constructs");
/**
 * Parameter Store construct for VocalShield
 *
 * Creates hierarchical parameters following the pattern:
 * /vocalshield/{env}/{component}/{param}
 *
 * Parameters are used for non-sensitive configuration that can be
 * changed without redeploying the infrastructure.
 *
 * All parameters use Standard tier (free).
 */
class ParameterStoreConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { environment } = props;
        // Create fraud threshold parameter
        this.fraudThresholdParameter = new ssm.StringParameter(this, 'FraudThresholdParameter', {
            parameterName: `/vocalshield/${environment}/audio-processor/fraud-threshold`,
            description: 'Fraud detection threshold score (0-100). Scores above this trigger alerts.',
            stringValue: '70',
            tier: ssm.ParameterTier.STANDARD,
        });
        // Create max processing time parameter
        this.maxProcessingTimeParameter = new ssm.StringParameter(this, 'MaxProcessingTimeParameter', {
            parameterName: `/vocalshield/${environment}/audio-processor/max-processing-time`,
            description: 'Maximum audio processing time in milliseconds',
            stringValue: '3000',
            tier: ssm.ParameterTier.STANDARD,
        });
        // Create notifications enabled parameter
        this.notificationsEnabledParameter = new ssm.StringParameter(this, 'NotificationsEnabledParameter', {
            parameterName: `/vocalshield/${environment}/notifications/enabled`,
            description: 'Whether Family Loop notifications are enabled',
            stringValue: 'true',
            tier: ssm.ParameterTier.STANDARD,
        });
        // Create wavelength enabled parameter
        this.wavelengthEnabledParameter = new ssm.StringParameter(this, 'WavelengthEnabledParameter', {
            parameterName: `/vocalshield/${environment}/features/wavelength-enabled`,
            description: 'Whether AWS Wavelength Zone integration is enabled',
            stringValue: 'false',
            tier: ssm.ParameterTier.STANDARD,
        });
        // Store all parameters in a map for easy access
        this.parameters = new Map([
            ['fraudThreshold', this.fraudThresholdParameter],
            ['maxProcessingTime', this.maxProcessingTimeParameter],
            ['notificationsEnabled', this.notificationsEnabledParameter],
            ['wavelengthEnabled', this.wavelengthEnabledParameter],
        ]);
        // Apply tags to all parameters
        this.applyTags(props.environment);
    }
    /**
     * Apply consistent tags to all parameters
     */
    applyTags(environment) {
        const parameters = [
            this.fraudThresholdParameter,
            this.maxProcessingTimeParameter,
            this.notificationsEnabledParameter,
            this.wavelengthEnabledParameter,
        ];
        parameters.forEach(parameter => {
            cdk.Tags.of(parameter).add('Project', 'VocalShield');
            cdk.Tags.of(parameter).add('Environment', environment);
            cdk.Tags.of(parameter).add('ManagedBy', 'CDK');
            cdk.Tags.of(parameter).add('CostCenter', 'VocalShield-Infrastructure');
        });
    }
    /**
     * Grant read access to all parameters for a Lambda function
     */
    grantRead(grantee) {
        // Grant read access to all parameters under /vocalshield/{environment}/*
        return iam.Grant.addToPrincipal({
            grantee,
            actions: ['ssm:GetParameter', 'ssm:GetParameters'],
            resourceArns: Array.from(this.parameters.values()).map(param => param.parameterArn),
        });
    }
    /**
     * Grant read access to specific parameters
     */
    grantReadParameter(grantee, parameterName) {
        const parameter = this.parameters.get(parameterName);
        if (!parameter) {
            throw new Error(`Parameter ${parameterName} not found`);
        }
        return parameter.grantRead(grantee);
    }
    /**
     * Get parameter ARN by name
     */
    getParameterArn(parameterName) {
        const parameter = this.parameters.get(parameterName);
        if (!parameter) {
            throw new Error(`Parameter ${parameterName} not found`);
        }
        return parameter.parameterArn;
    }
    /**
     * Get parameter name (full path) by key
     */
    getParameterName(parameterName) {
        const parameter = this.parameters.get(parameterName);
        if (!parameter) {
            throw new Error(`Parameter ${parameterName} not found`);
        }
        return parameter.parameterName;
    }
}
exports.ParameterStoreConstruct = ParameterStoreConstruct;
//# sourceMappingURL=parameter-store.js.map