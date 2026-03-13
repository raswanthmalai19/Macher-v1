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
exports.CostManagementConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const budgets = __importStar(require("aws-cdk-lib/aws-budgets"));
const resourcegroups = __importStar(require("aws-cdk-lib/aws-resourcegroups"));
const constructs_1 = require("constructs");
/**
 * Cost Management Construct
 *
 * Creates:
 * - AWS Budget with $10/month limit and 80%/100% alerts
 * - Resource Group for all VocalShield resources (tag-based)
 */
class CostManagementConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { config, notificationEmail } = props;
        // Create AWS Budget (Task 16.1)
        this.budget = new budgets.CfnBudget(this, 'VocalShieldBudget', {
            budget: {
                budgetName: `VocalShield-Budget-${config.tags.Environment}`,
                budgetType: 'COST',
                timeUnit: 'MONTHLY',
                budgetLimit: {
                    amount: 10,
                    unit: 'USD',
                },
                costFilters: {
                    TagKeyValue: [`user:Project$${config.tags.Project}`],
                },
            },
            notificationsWithSubscribers: [
                // Alert at 80% threshold
                {
                    notification: {
                        notificationType: 'ACTUAL',
                        comparisonOperator: 'GREATER_THAN',
                        threshold: 80,
                        thresholdType: 'PERCENTAGE',
                    },
                    subscribers: [
                        {
                            subscriptionType: 'EMAIL',
                            address: notificationEmail,
                        },
                    ],
                },
                // Alert at 100% threshold
                {
                    notification: {
                        notificationType: 'ACTUAL',
                        comparisonOperator: 'GREATER_THAN',
                        threshold: 100,
                        thresholdType: 'PERCENTAGE',
                    },
                    subscribers: [
                        {
                            subscriptionType: 'EMAIL',
                            address: notificationEmail,
                        },
                    ],
                },
            ],
        });
        // Create Resource Group (Task 16.2)
        this.resourceGroup = new resourcegroups.CfnGroup(this, 'VocalShieldResourceGroup', {
            name: `VocalShield-Resources-${config.tags.Environment}`,
            description: 'All VocalShield infrastructure resources',
            resourceQuery: {
                type: 'TAG_FILTERS_1_0',
                query: JSON.stringify({
                    ResourceTypeFilters: ['AWS::AllSupported'],
                    TagFilters: [
                        {
                            Key: 'Project',
                            Values: [config.tags.Project],
                        },
                        {
                            Key: 'Environment',
                            Values: [config.tags.Environment],
                        },
                    ],
                }),
            },
            tags: [
                {
                    key: 'Project',
                    value: config.tags.Project,
                },
                {
                    key: 'Environment',
                    value: config.tags.Environment,
                },
                {
                    key: 'ManagedBy',
                    value: config.tags.ManagedBy,
                },
            ],
        });
        // Apply tags
        cdk.Tags.of(this).add('Component', 'CostManagement');
    }
}
exports.CostManagementConstruct = CostManagementConstruct;
//# sourceMappingURL=cost-management.js.map