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
exports.WafConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const wafv2 = __importStar(require("aws-cdk-lib/aws-wafv2"));
const constructs_1 = require("constructs");
/**
 * AWS WAF Web ACL Construct
 *
 * Creates a Web ACL with:
 * - Rate limiting: 100 requests per 5 minutes per IP
 * - AWS managed Core Rule Set
 * - AWS managed Known Bad Inputs Rule Set
 *
 * Associates with API Gateway for protection
 */
class WafConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { config, apiGatewayArn } = props;
        // Create Web ACL
        this.webAcl = new wafv2.CfnWebACL(this, 'WebSocketWAF', {
            name: `VocalShield-WebACL-${config.tags.Environment}`,
            scope: 'REGIONAL',
            defaultAction: { allow: {} },
            description: 'WAF protection for VocalShield WebSocket API',
            rules: [
                // Rule 1: Rate Limiting
                {
                    name: 'RateLimitRule',
                    priority: 1,
                    statement: {
                        rateBasedStatement: {
                            limit: 100,
                            aggregateKeyType: 'IP',
                        },
                    },
                    action: { block: {} },
                    visibilityConfig: {
                        sampledRequestsEnabled: true,
                        cloudWatchMetricsEnabled: true,
                        metricName: 'RateLimitRule',
                    },
                },
                // Rule 2: AWS Managed Core Rule Set
                {
                    name: 'AWSManagedRulesCommonRuleSet',
                    priority: 2,
                    statement: {
                        managedRuleGroupStatement: {
                            vendorName: 'AWS',
                            name: 'AWSManagedRulesCommonRuleSet',
                        },
                    },
                    overrideAction: { none: {} },
                    visibilityConfig: {
                        sampledRequestsEnabled: true,
                        cloudWatchMetricsEnabled: true,
                        metricName: 'AWSManagedRulesCommonRuleSet',
                    },
                },
                // Rule 3: AWS Managed Known Bad Inputs Rule Set
                {
                    name: 'AWSManagedRulesKnownBadInputsRuleSet',
                    priority: 3,
                    statement: {
                        managedRuleGroupStatement: {
                            vendorName: 'AWS',
                            name: 'AWSManagedRulesKnownBadInputsRuleSet',
                        },
                    },
                    overrideAction: { none: {} },
                    visibilityConfig: {
                        sampledRequestsEnabled: true,
                        cloudWatchMetricsEnabled: true,
                        metricName: 'AWSManagedRulesKnownBadInputsRuleSet',
                    },
                },
            ],
            visibilityConfig: {
                sampledRequestsEnabled: true,
                cloudWatchMetricsEnabled: true,
                metricName: `VocalShield-WebACL-${config.tags.Environment}`,
            },
        });
        // Associate Web ACL with API Gateway
        new wafv2.CfnWebACLAssociation(this, 'WebACLAssociation', {
            resourceArn: apiGatewayArn,
            webAclArn: this.webAcl.attrArn,
        });
        // Apply tags
        cdk.Tags.of(this.webAcl).add('Component', 'WAF');
    }
}
exports.WafConstruct = WafConstruct;
//# sourceMappingURL=waf.js.map