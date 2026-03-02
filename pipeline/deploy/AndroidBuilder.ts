/**
 * Android Builder for VocalShield CI/CD Pipeline
 * 
 * This module handles Android APK building, signing, verification,
 * and artifact upload operations.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { logger } from '../logger';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Android keystore for APK signing
 */
export interface Keystore {
  path: string;
  password: string;
  alias: string;
  keyPassword: string;
}

/**
 * APK artifact information
 */
export interface APKArtifact {
  path: string;
  variant: 'debug' | 'release';
  versionCode: number;
  versionName: string;
  size: number;
}

/**
 * Signed APK artifact
 */
export interface SignedAPK extends APKArtifact {
  signed: true;
  keystore: string;
}

/**
 * Upload result
 */
export interface UploadResult {
  success: boolean;
  destination: string;
  url?: string;
  error?: string;
}

/**
 * AndroidBuilder handles Android application building and signing.
 */
export class AndroidBuilder {
  private readonly androidProjectPath: string;

  /**
   * Creates a new AndroidBuilder instance.
   * 
   * @param androidProjectPath - Path to Android project directory (defaults to 'android')
   */
  constructor(androidProjectPath: string = 'android') {
    this.androidProjectPath = androidProjectPath;
  }

  /**
   * Sets up the Android build environment.
   * 
   * Requirements: 5.1
   * 
   * @returns Promise resolving when setup is complete
   */
  async setupEnvironment(): Promise<void> {
    try {
      logger.info('Setting up Android build environment');

      // Check for required tools
      const checks = [
        { command: 'java -version', name: 'Java' },
        { command: 'gradle --version', name: 'Gradle' },
      ];

      for (const check of checks) {
        try {
          execSync(check.command, { stdio: 'pipe' });
          logger.info(`${check.name} is available`);
        } catch (error) {
          throw new Error(`${check.name} is not installed or not in PATH`);
        }
      }

      // Ensure Android project exists
      if (!fs.existsSync(this.androidProjectPath)) {
        throw new Error(`Android project not found at ${this.androidProjectPath}`);
      }

      logger.info('Android build environment setup complete');
    } catch (error) {
      logger.error(
        'Failed to setup Android build environment',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Loads a keystore from base64-encoded data.
   * 
   * Requirements: 5.2, 5.3
   * 
   * @param keystoreBase64 - Base64-encoded keystore file
   * @param password - Keystore password
   * @param alias - Key alias
   * @param keyPassword - Key password
   * @returns Promise resolving to keystore information
   */
  async loadKeystore(
    keystoreBase64: string,
    password: string,
    alias: string,
    keyPassword: string
  ): Promise<Keystore> {
    try {
      logger.info('Loading keystore', { alias });

      // Decode base64 keystore
      const keystoreBuffer = Buffer.from(keystoreBase64, 'base64');

      // Write to temporary file
      const keystorePath = path.join(this.androidProjectPath, 'app', 'keystore.jks');
      fs.writeFileSync(keystorePath, keystoreBuffer);

      logger.info('Keystore loaded successfully', { path: keystorePath });

      return {
        path: keystorePath,
        password,
        alias,
        keyPassword,
      };
    } catch (error) {
      logger.error(
        'Failed to load keystore',
        error instanceof Error ? error : new Error(String(error)),
        { alias }
      );
      throw error;
    }
  }

  /**
   * Builds a debug APK.
   * 
   * Requirements: 5.1, 5.4
   * 
   * @param gradleArgs - Additional Gradle arguments
   * @returns Promise resolving to APK artifact
   */
  async buildDebugAPK(gradleArgs: string[] = []): Promise<APKArtifact> {
    try {
      logger.info('Building debug APK', { gradleArgs });

      const args = gradleArgs.join(' ');
      const command = `cd ${this.androidProjectPath} && ./gradlew assembleDebug ${args}`;

      execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Find the generated APK
      const apkPath = path.join(
        this.androidProjectPath,
        'app',
        'build',
        'outputs',
        'apk',
        'debug',
        'app-debug.apk'
      );

      if (!fs.existsSync(apkPath)) {
        throw new Error('Debug APK not found after build');
      }

      const stats = fs.statSync(apkPath);
      const versionInfo = this.extractVersionInfo();

      logger.info('Debug APK built successfully', { path: apkPath, size: stats.size });

      return {
        path: apkPath,
        variant: 'debug',
        versionCode: versionInfo.versionCode,
        versionName: versionInfo.versionName,
        size: stats.size,
      };
    } catch (error) {
      logger.error(
        'Failed to build debug APK',
        error instanceof Error ? error : new Error(String(error)),
        { gradleArgs }
      );
      throw error;
    }
  }

  /**
   * Builds a release APK.
   * 
   * Requirements: 5.1, 5.4
   * 
   * @param gradleArgs - Additional Gradle arguments
   * @param keystore - Keystore for signing
   * @returns Promise resolving to signed APK artifact
   */
  async buildReleaseAPK(gradleArgs: string[] = [], keystore: Keystore): Promise<SignedAPK> {
    try {
      logger.info('Building release APK', { gradleArgs });

      const args = gradleArgs.join(' ');
      const command = `cd ${this.androidProjectPath} && ./gradlew assembleRelease ${args} \
        -Pandroid.injected.signing.store.file=${keystore.path} \
        -Pandroid.injected.signing.store.password=${keystore.password} \
        -Pandroid.injected.signing.key.alias=${keystore.alias} \
        -Pandroid.injected.signing.key.password=${keystore.keyPassword}`;

      execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Find the generated APK
      const apkPath = path.join(
        this.androidProjectPath,
        'app',
        'build',
        'outputs',
        'apk',
        'release',
        'app-release.apk'
      );

      if (!fs.existsSync(apkPath)) {
        throw new Error('Release APK not found after build');
      }

      const stats = fs.statSync(apkPath);
      const versionInfo = this.extractVersionInfo();

      logger.info('Release APK built successfully', { path: apkPath, size: stats.size });

      return {
        path: apkPath,
        variant: 'release',
        versionCode: versionInfo.versionCode,
        versionName: versionInfo.versionName,
        size: stats.size,
        signed: true,
        keystore: keystore.alias,
      };
    } catch (error) {
      logger.error(
        'Failed to build release APK',
        error instanceof Error ? error : new Error(String(error)),
        { gradleArgs }
      );
      throw error;
    }
  }

  /**
   * Signs an APK with a keystore.
   * 
   * Requirements: 5.2, 5.3
   * 
   * @param apk - APK artifact to sign
   * @param keystore - Keystore for signing
   * @returns Promise resolving to signed APK
   */
  async signAPK(apk: APKArtifact, keystore: Keystore): Promise<SignedAPK> {
    try {
      logger.info('Signing APK', { apkPath: apk.path, alias: keystore.alias });

      const signedPath = apk.path.replace('.apk', '-signed.apk');

      const command = `jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
        -keystore ${keystore.path} \
        -storepass ${keystore.password} \
        -keypass ${keystore.keyPassword} \
        -signedjar ${signedPath} \
        ${apk.path} \
        ${keystore.alias}`;

      execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      logger.info('APK signed successfully', { signedPath });

      return {
        ...apk,
        path: signedPath,
        signed: true,
        keystore: keystore.alias,
      };
    } catch (error) {
      logger.error(
        'Failed to sign APK',
        error instanceof Error ? error : new Error(String(error)),
        { apkPath: apk.path }
      );
      throw error;
    }
  }

  /**
   * Verifies an APK signature.
   * 
   * Requirements: 5.6
   * 
   * @param apk - Signed APK to verify
   * @returns Promise resolving to true if signature is valid
   */
  async verifyAPKSignature(apk: SignedAPK): Promise<boolean> {
    try {
      logger.info('Verifying APK signature', { apkPath: apk.path });

      const command = `jarsigner -verify -verbose -certs ${apk.path}`;

      const output = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const isValid = output.includes('jar verified');

      logger.info('APK signature verification complete', {
        apkPath: apk.path,
        isValid,
      });

      return isValid;
    } catch (error) {
      logger.error(
        'Failed to verify APK signature',
        error instanceof Error ? error : new Error(String(error)),
        { apkPath: apk.path }
      );
      return false;
    }
  }

  /**
   * Uploads an APK artifact to storage.
   * 
   * Requirements: 5.5
   * 
   * @param apk - Signed APK to upload
   * @param destination - Destination path or URL
   * @returns Promise resolving to upload result
   */
  async uploadArtifact(apk: SignedAPK, destination: string): Promise<UploadResult> {
    try {
      logger.info('Uploading APK artifact', { apkPath: apk.path, destination });

      // For S3 upload
      if (destination.startsWith('s3://')) {
        const command = `aws s3 cp ${apk.path} ${destination}`;

        execSync(command, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        logger.info('APK uploaded to S3', { destination });

        return {
          success: true,
          destination,
          url: destination.replace('s3://', 'https://s3.amazonaws.com/'),
        };
      }

      // For local file copy
      const destPath = path.resolve(destination);
      const destDir = path.dirname(destPath);

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.copyFileSync(apk.path, destPath);

      logger.info('APK copied to local destination', { destination: destPath });

      return {
        success: true,
        destination: destPath,
      };
    } catch (error) {
      logger.error(
        'Failed to upload APK artifact',
        error instanceof Error ? error : new Error(String(error)),
        { apkPath: apk.path, destination }
      );

      return {
        success: false,
        destination,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Extracts version information from build.gradle.
   * 
   * @returns Version information
   */
  private extractVersionInfo(): { versionCode: number; versionName: string } {
    try {
      const buildGradlePath = path.join(this.androidProjectPath, 'app', 'build.gradle');
      const content = fs.readFileSync(buildGradlePath, 'utf-8');

      const versionCodeMatch = content.match(/versionCode\s+(\d+)/);
      const versionNameMatch = content.match(/versionName\s+"([^"]+)"/);

      return {
        versionCode: versionCodeMatch ? parseInt(versionCodeMatch[1], 10) : 1,
        versionName: versionNameMatch ? versionNameMatch[1] : '1.0.0',
      };
    } catch (error) {
      logger.warn('Failed to extract version info, using defaults', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        versionCode: 1,
        versionName: '1.0.0',
      };
    }
  }
}
