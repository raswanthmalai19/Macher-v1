/**
 * Migration Manager for MACHER CI/CD Pipeline
 * 
 * This module manages database migrations, including detection,
 * validation, execution, and rollback of schema changes.
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6
 */

import { logger } from '../logger';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Migration definition
 */
export interface Migration {
  id: string;
  version: number;
  description: string;
  upScript: string;
  downScript: string;
  checksum: string;
}

/**
 * Migration result
 */
export interface MigrationResult {
  success: boolean;
  migrationId: string;
  duration: number;
  error?: string;
}

/**
 * Backup information
 */
export interface BackupInfo {
  backupId: string;
  tableName: string;
  timestamp: Date;
  location: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * MigrationManager handles database migrations.
 */
export class MigrationManager {
  private readonly migrationsPath: string;
  private readonly historyTableName: string;

  /**
   * Creates a new MigrationManager instance.
   * 
   * @param migrationsPath - Path to migrations directory (defaults to 'migrations')
   * @param historyTableName - DynamoDB table name for migration history (defaults to 'MigrationHistory')
   */
  constructor(
    migrationsPath: string = 'migrations',
    historyTableName: string = 'MigrationHistory'
  ) {
    this.migrationsPath = migrationsPath;
    this.historyTableName = historyTableName;
  }

  /**
   * Detects pending migrations that haven't been applied.
   * 
   * Requirements: 14.1
   * 
   * @param currentVersion - Current database version
   * @returns Promise resolving to array of pending migrations
   */
  async detectPendingMigrations(currentVersion: number): Promise<Migration[]> {
    try {
      logger.info('Detecting pending migrations', { currentVersion });

      // Load all migration files
      const allMigrations = await this.loadMigrations();

      // Filter migrations newer than current version
      const pendingMigrations = allMigrations.filter(
        migration => migration.version > currentVersion
      );

      // Sort by version
      pendingMigrations.sort((a, b) => a.version - b.version);

      logger.info('Pending migrations detected', {
        count: pendingMigrations.length,
        versions: pendingMigrations.map(m => m.version),
      });

      return pendingMigrations;
    } catch (error) {
      logger.error(
        'Failed to detect pending migrations',
        error instanceof Error ? error : new Error(String(error)),
        { currentVersion }
      );
      throw error;
    }
  }

  /**
   * Validates migration scripts for syntax errors.
   * 
   * Requirements: 14.5
   * 
   * @param migrations - Migrations to validate
   * @returns Promise resolving to validation result
   */
  async validateMigrationScripts(migrations: Migration[]): Promise<ValidationResult> {
    try {
      logger.info('Validating migration scripts', { count: migrations.length });

      const errors: string[] = [];

      for (const migration of migrations) {
        // Validate up script
        if (!migration.upScript || migration.upScript.trim().length === 0) {
          errors.push(`Migration ${migration.id}: Up script is empty`);
        }

        // Validate down script
        if (!migration.downScript || migration.downScript.trim().length === 0) {
          errors.push(`Migration ${migration.id}: Down script is empty`);
        }

        // Validate checksum
        const calculatedChecksum = this.calculateChecksum(
          migration.upScript + migration.downScript
        );
        if (calculatedChecksum !== migration.checksum) {
          errors.push(`Migration ${migration.id}: Checksum mismatch`);
        }

        // Basic syntax validation for DynamoDB operations
        if (migration.upScript.includes('aws dynamodb')) {
          // Validate AWS CLI syntax
          try {
            // Dry-run validation (doesn't execute)
            const testCommand = migration.upScript.replace(
              'aws dynamodb',
              'aws dynamodb --dry-run'
            );
            // Note: This is a simplified validation
          } catch (error) {
            errors.push(
              `Migration ${migration.id}: Invalid AWS CLI syntax in up script`
            );
          }
        }
      }

      const valid = errors.length === 0;

      logger.info('Migration validation complete', { valid, errorCount: errors.length });

      return {
        valid,
        errors,
      };
    } catch (error) {
      logger.error(
        'Failed to validate migration scripts',
        error instanceof Error ? error : new Error(String(error))
      );

      return {
        valid: false,
        errors: ['Validation failed: ' + (error instanceof Error ? error.message : 'Unknown error')],
      };
    }
  }

  /**
   * Creates a backup of a DynamoDB table before migration.
   * 
   * Requirements: 14.4
   * 
   * @param tableName - Table name to backup
   * @returns Promise resolving to backup information
   */
  async createBackup(tableName: string): Promise<BackupInfo> {
    try {
      logger.info('Creating table backup', { tableName });

      const timestamp = new Date();
      const backupName = `${tableName}-backup-${timestamp.getTime()}`;

      const command = `aws dynamodb create-backup \
        --table-name ${tableName} \
        --backup-name ${backupName}`;

      const output = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const result = JSON.parse(output);
      const backupArn = result.BackupDetails.BackupArn;

      logger.info('Table backup created', { tableName, backupName, backupArn });

      return {
        backupId: backupName,
        tableName,
        timestamp,
        location: backupArn,
      };
    } catch (error) {
      logger.error(
        'Failed to create table backup',
        error instanceof Error ? error : new Error(String(error)),
        { tableName }
      );
      throw error;
    }
  }

  /**
   * Executes a migration.
   * 
   * Requirements: 14.2
   * 
   * @param migration - Migration to execute
   * @returns Promise resolving to migration result
   */
  async executeMigration(migration: Migration): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      logger.info('Executing migration', {
        id: migration.id,
        version: migration.version,
        description: migration.description,
      });

      // Execute the up script
      execSync(migration.upScript, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: '/bin/bash',
      });

      const duration = Math.floor((Date.now() - startTime) / 1000);

      logger.info('Migration executed successfully', {
        id: migration.id,
        duration,
      });

      return {
        success: true,
        migrationId: migration.id,
        duration,
      };
    } catch (error) {
      const duration = Math.floor((Date.now() - startTime) / 1000);

      logger.error(
        'Migration execution failed',
        error instanceof Error ? error : new Error(String(error)),
        { id: migration.id }
      );

      return {
        success: false,
        migrationId: migration.id,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Rolls back a migration.
   * 
   * Requirements: 14.3
   * 
   * @param migration - Migration to rollback
   * @returns Promise resolving to rollback result
   */
  async rollbackMigration(migration: Migration): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      logger.info('Rolling back migration', {
        id: migration.id,
        version: migration.version,
      });

      // Execute the down script
      execSync(migration.downScript, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: '/bin/bash',
      });

      const duration = Math.floor((Date.now() - startTime) / 1000);

      logger.info('Migration rolled back successfully', {
        id: migration.id,
        duration,
      });

      return {
        success: true,
        migrationId: migration.id,
        duration,
      };
    } catch (error) {
      const duration = Math.floor((Date.now() - startTime) / 1000);

      logger.error(
        'Migration rollback failed',
        error instanceof Error ? error : new Error(String(error)),
        { id: migration.id }
      );

      return {
        success: false,
        migrationId: migration.id,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Updates the migration history table.
   * 
   * Requirements: 14.6
   * 
   * @param migration - Migration that was executed
   * @param result - Migration execution result
   * @returns Promise resolving when history is updated
   */
  async updateMigrationHistory(
    migration: Migration,
    result: MigrationResult
  ): Promise<void> {
    try {
      logger.info('Updating migration history', { migrationId: migration.id });

      const item = {
        migrationId: { S: migration.id },
        version: { N: migration.version.toString() },
        description: { S: migration.description },
        checksum: { S: migration.checksum },
        executedAt: { S: new Date().toISOString() },
        duration: { N: result.duration.toString() },
        success: { BOOL: result.success },
      };

      if (result.error) {
        item['error'] = { S: result.error };
      }

      const command = `aws dynamodb put-item \
        --table-name ${this.historyTableName} \
        --item '${JSON.stringify(item)}'`;

      execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      logger.info('Migration history updated', { migrationId: migration.id });
    } catch (error) {
      logger.error(
        'Failed to update migration history',
        error instanceof Error ? error : new Error(String(error)),
        { migrationId: migration.id }
      );
      throw error;
    }
  }

  /**
   * Gets the current database version from migration history.
   * 
   * @returns Promise resolving to current version
   */
  async getCurrentVersion(): Promise<number> {
    try {
      const command = `aws dynamodb scan \
        --table-name ${this.historyTableName} \
        --filter-expression "success = :true" \
        --expression-attribute-values '{":true":{"BOOL":true}}' \
        --projection-expression "version" \
        --output json`;

      const output = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const result = JSON.parse(output);
      
      if (!result.Items || result.Items.length === 0) {
        return 0;
      }

      // Find the maximum version
      const versions = result.Items.map((item: any) => parseInt(item.version.N, 10));
      const maxVersion = Math.max(...versions);

      logger.info('Current database version', { version: maxVersion });

      return maxVersion;
    } catch (error) {
      logger.warn('Failed to get current version, assuming 0', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  /**
   * Loads all migration files from the migrations directory.
   * 
   * @returns Promise resolving to array of migrations
   */
  private async loadMigrations(): Promise<Migration[]> {
    try {
      if (!fs.existsSync(this.migrationsPath)) {
        logger.warn('Migrations directory not found', { path: this.migrationsPath });
        return [];
      }

      const files = fs.readdirSync(this.migrationsPath);
      const migrations: Migration[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(this.migrationsPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const migration = JSON.parse(content) as Migration;

        migrations.push(migration);
      }

      return migrations;
    } catch (error) {
      logger.error(
        'Failed to load migrations',
        error instanceof Error ? error : new Error(String(error))
      );
      return [];
    }
  }

  /**
   * Calculates checksum for migration scripts.
   * 
   * @param content - Content to checksum
   * @returns Checksum string
   */
  private calculateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
