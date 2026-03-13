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
exports.SecretsManagerConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const secretsmanager = __importStar(require("aws-cdk-lib/aws-secretsmanager"));
const constructs_1 = require("constructs");
/**
 * Secrets Manager construct for VocalShield
 *
 * Creates and manages secrets for:
 * - API keys (vocalshield/api-keys)
 * - Configuration (vocalshield/config)
 *
 * All secrets are encrypted using AWS managed KMS keys.
 * IAM policies are configured to allow Lambda functions to access secrets.
 */
class SecretsManagerConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        // Create secret for API keys
        this.apiKeysSecret = new secretsmanager.Secret(this, 'ApiKeysSecret', {
            secretName: `vocalshield/api-keys`,
            description: 'API keys for VocalShield external service integrations',
            generateSecretString: {
                secretStringTemplate: JSON.stringify({
                    mlServiceApiKey: 'PLACEHOLDER_ML_API_KEY',
                    thirdPartyIntegrationKey: 'PLACEHOLDER_INTEGRATION_KEY',
                }),
                generateStringKey: 'placeholder',
            },
        });
        // Create secret for configuration
        this.configSecret = new secretsmanager.Secret(this, 'ConfigSecret', {
            secretName: `vocalshield/config`,
            description: 'Sensitive configuration for VocalShield',
            generateSecretString: {
                secretStringTemplate: JSON.stringify({
                    fraudThreshold: 70,
                    processingTimeout: 3000,
                }),
                generateStringKey: 'placeholder',
            },
        });
        // Apply tags
        cdk.Tags.of(this.apiKeysSecret).add('Project', 'VocalShield');
        cdk.Tags.of(this.apiKeysSecret).add('Environment', props.environment);
        cdk.Tags.of(this.apiKeysSecret).add('ManagedBy', 'CDK');
        cdk.Tags.of(this.apiKeysSecret).add('CostCenter', 'VocalShield-Infrastructure');
        cdk.Tags.of(this.configSecret).add('Project', 'VocalShield');
        cdk.Tags.of(this.configSecret).add('Environment', props.environment);
        cdk.Tags.of(this.configSecret).add('ManagedBy', 'CDK');
        cdk.Tags.of(this.configSecret).add('CostCenter', 'VocalShield-Infrastructure');
    }
    /**
     * Grant read access to a Lambda function for API keys secret
     */
    grantApiKeysRead(grantee) {
        return this.apiKeysSecret.grantRead(grantee);
    }
    /**
     * Grant read access to a Lambda function for config secret
     */
    grantConfigRead(grantee) {
        return this.configSecret.grantRead(grantee);
    }
    /**
     * Grant read access to both secrets
     */
    grantAllSecretsRead(grantee) {
        return [
            this.grantApiKeysRead(grantee),
            this.grantConfigRead(grantee),
        ];
    }
}
exports.SecretsManagerConstruct = SecretsManagerConstruct;
//# sourceMappingURL=secrets-manager.js.map