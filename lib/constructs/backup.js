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
exports.BackupConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const backup = __importStar(require("aws-cdk-lib/aws-backup"));
const events = __importStar(require("aws-cdk-lib/aws-events"));
const constructs_1 = require("constructs");
/**
 * AWS Backup Construct
 *
 * Creates:
 * - Backup vault for DynamoDB tables
 * - Backup plan with daily backups
 * - 7-day retention policy
 */
class BackupConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { config, connectionsTable, metadataTable } = props;
        // Create Backup Vault
        this.backupVault = new backup.BackupVault(this, 'VocalShieldBackupVault', {
            backupVaultName: `VocalShield-Vault-${config.tags.Environment}`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // Create Backup Plan
        this.backupPlan = new backup.BackupPlan(this, 'VocalShieldBackupPlan', {
            backupPlanName: `VocalShield-DailyBackup-${config.tags.Environment}`,
            backupVault: this.backupVault,
            backupPlanRules: [
                new backup.BackupPlanRule({
                    ruleName: 'DailyBackup',
                    scheduleExpression: events.Schedule.cron({
                        hour: '2',
                        minute: '0',
                    }),
                    deleteAfter: cdk.Duration.days(7),
                    startWindow: cdk.Duration.hours(1),
                    completionWindow: cdk.Duration.hours(2),
                }),
            ],
        });
        // Add DynamoDB tables to backup plan
        this.backupPlan.addSelection('DynamoDBTablesSelection', {
            resources: [
                backup.BackupResource.fromDynamoDbTable(connectionsTable),
                backup.BackupResource.fromDynamoDbTable(metadataTable),
            ],
        });
        // Apply tags
        cdk.Tags.of(this.backupVault).add('Component', 'Backup');
        cdk.Tags.of(this.backupPlan).add('Component', 'Backup');
    }
}
exports.BackupConstruct = BackupConstruct;
//# sourceMappingURL=backup.js.map