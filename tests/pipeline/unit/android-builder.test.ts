/**
 * Unit Tests for AndroidBuilder
 * 
 * These tests verify specific examples, edge cases, and error conditions
 * for the Android build system.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { AndroidBuilder } from '../../../pipeline/deploy/AndroidBuilder';
import type { AndroidBuildConfig } from '../../../pipeline/types';
import * as childProcess from 'child_process';
import * as fs from 'fs';

jest.mock('child_process');
jest.mock('fs');

describe('AndroidBuilder Unit Tests', () => {
  let androidBuilder: AndroidBuilder;

  beforeEach(() => {
    androidBuilder = new AndroidBuilder();
    jest.clearAllMocks();
  });

  describe('setupEnvironment', () => {
    test('should setup Android SDK environment variables', async () => {
      const result = await androidBuilder.setupEnvironment();

      expect(result.success).toBe(true);
      expect(process.env.ANDROID_HOME).toBeDefined();
    });

    test('should verify Gradle installation', async () => {
      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        if (cmd.includes('gradle --version')) {
          callback(null, { stdout: 'Gradle 8.0', stderr: '' });
        }
      });

      const result = await androidBuilder.setupEnvironment();

      expect(result.success).toBe(true);
    });
  });

  describe('loadKeystore', () => {
    test('should load keystore from base64 encoded string', async () => {
      const base64Keystore = Buffer.from('mock-keystore-data').toString('base64');
      
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {});

      const keystorePath = await androidBuilder.loadKeystore(base64Keystore, 'release.keystore');

      expect(keystorePath).toContain('release.keystore');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    test('should throw error for invalid base64 keystore', async () => {
      const invalidBase64 = 'not-valid-base64!!!';

      await expect(androidBuilder.loadKeystore(invalidBase64, 'release.keystore'))
        .rejects.toThrow();
    });

    test('should throw error for empty keystore', async () => {
      await expect(androidBuilder.loadKeystore('', 'release.keystore'))
        .rejects.toThrow();
    });
  });

  describe('buildDebugAPK', () => {
    test('should build debug APK successfully', async () => {
      const buildConfig: AndroidBuildConfig = {
        environment: 'dev',
        buildType: 'debug',
        versionCode: 1,
        versionName: '1.0.0',
        signingKeyAlias: 'debug-key',
        keystorePath: '/path/to/debug.keystore',
        keystorePassword: 'android',
        keyPassword: 'android',
      };

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'BUILD SUCCESSFUL', stderr: '' });
      });

      const result = await androidBuilder.buildDebugAPK(buildConfig);

      expect(result.success).toBe(true);
      expect(result.apkPath).toContain('debug');
    });

    test('should handle Gradle build failures', async () => {
      const buildConfig: AndroidBuildConfig = {
        environment: 'dev',
        buildType: 'debug',
        versionCode: 1,
        versionName: '1.0.0',
        signingKeyAlias: 'debug-key',
        keystorePath: '/path/to/debug.keystore',
        keystorePassword: 'android',
        keyPassword: 'android',
      };

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(new Error('BUILD FAILED'), { stdout: '', stderr: 'Compilation error' });
      });

      await expect(androidBuilder.buildDebugAPK(buildConfig)).rejects.toThrow();
    });
  });

  describe('buildReleaseAPK', () => {
    test('should build release APK with signing', async () => {
      const buildConfig: AndroidBuildConfig = {
        environment: 'production',
        buildType: 'release',
        versionCode: 10,
        versionName: '1.0.0',
        signingKeyAlias: 'production-key',
        keystorePath: '/path/to/production.keystore',
        keystorePassword: 'secure-password',
        keyPassword: 'secure-password',
      };

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'BUILD SUCCESSFUL', stderr: '' });
      });

      const result = await androidBuilder.buildReleaseAPK(buildConfig);

      expect(result.success).toBe(true);
      expect(result.apkPath).toContain('release');
    });

    test('should fail if keystore is missing', async () => {
      const buildConfig: AndroidBuildConfig = {
        environment: 'production',
        buildType: 'release',
        versionCode: 10,
        versionName: '1.0.0',
        signingKeyAlias: 'production-key',
        keystorePath: '/nonexistent/keystore',
        keystorePassword: 'password',
        keyPassword: 'password',
      };

      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await expect(androidBuilder.buildReleaseAPK(buildConfig)).rejects.toThrow(/keystore/i);
    });
  });

  describe('signAPK', () => {
    test('should sign APK with provided keystore', async () => {
      const apkPath = '/path/to/app-unsigned.apk';
      const keystoreConfig = {
        path: '/path/to/keystore',
        alias: 'release-key',
        storePassword: 'password',
        keyPassword: 'password',
      };

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        if (cmd.includes('jarsigner')) {
          callback(null, { stdout: 'jar signed', stderr: '' });
        }
      });

      const signedPath = await androidBuilder.signAPK(apkPath, keystoreConfig);

      expect(signedPath).toContain('signed');
      expect(childProcess.exec).toHaveBeenCalledWith(
        expect.stringContaining('jarsigner'),
        expect.any(Function)
      );
    });

    test('should throw error if signing fails', async () => {
      const apkPath = '/path/to/app-unsigned.apk';
      const keystoreConfig = {
        path: '/path/to/keystore',
        alias: 'release-key',
        storePassword: 'wrong-password',
        keyPassword: 'wrong-password',
      };

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(new Error('jarsigner: unable to sign jar'), null);
      });

      await expect(androidBuilder.signAPK(apkPath, keystoreConfig)).rejects.toThrow();
    });
  });

  describe('verifyAPKSignature', () => {
    test('should verify valid APK signature', async () => {
      const apkPath = '/path/to/app-signed.apk';

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        if (cmd.includes('jarsigner -verify')) {
          callback(null, { stdout: 'jar verified', stderr: '' });
        }
      });

      const isValid = await androidBuilder.verifyAPKSignature(apkPath);

      expect(isValid).toBe(true);
    });

    test('should detect invalid APK signature', async () => {
      const apkPath = '/path/to/app-unsigned.apk';

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(new Error('jar is unsigned'), null);
      });

      const isValid = await androidBuilder.verifyAPKSignature(apkPath);

      expect(isValid).toBe(false);
    });

    test('should detect tampered APK', async () => {
      const apkPath = '/path/to/app-tampered.apk';

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: '', stderr: 'jar verified with signer errors' });
      });

      const isValid = await androidBuilder.verifyAPKSignature(apkPath);

      expect(isValid).toBe(false);
    });
  });

  describe('uploadArtifact', () => {
    test('should upload APK to artifact storage', async () => {
      const apkPath = '/path/to/app-release.apk';
      const artifactName = 'vocalshield-v1.0.0.apk';

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'Upload complete', stderr: '' });
      });

      const result = await androidBuilder.uploadArtifact(apkPath, artifactName);

      expect(result.success).toBe(true);
      expect(result.url).toBeTruthy();
    });

    test('should handle upload failures', async () => {
      const apkPath = '/path/to/app-release.apk';
      const artifactName = 'vocalshield-v1.0.0.apk';

      (childProcess.exec as jest.Mock).mockImplementation((cmd, callback) => {
        callback(new Error('Network error'), null);
      });

      await expect(androidBuilder.uploadArtifact(apkPath, artifactName)).rejects.toThrow();
    });
  });

  describe('version management', () => {
    test('should increment version code for each build', () => {
      const config1: AndroidBuildConfig = {
        environment: 'production',
        buildType: 'release',
        versionCode: 10,
        versionName: '1.0.0',
        signingKeyAlias: 'key',
        keystorePath: '/path',
        keystorePassword: 'pass',
        keyPassword: 'pass',
      };

      const config2 = androidBuilder.incrementVersionCode(config1);

      expect(config2.versionCode).toBe(11);
      expect(config2.versionName).toBe(config1.versionName);
    });

    test('should update version name', () => {
      const config: AndroidBuildConfig = {
        environment: 'production',
        buildType: 'release',
        versionCode: 10,
        versionName: '1.0.0',
        signingKeyAlias: 'key',
        keystorePath: '/path',
        keystorePassword: 'pass',
        keyPassword: 'pass',
      };

      const updated = androidBuilder.updateVersionName(config, '1.1.0');

      expect(updated.versionName).toBe('1.1.0');
      expect(updated.versionCode).toBe(config.versionCode);
    });
  });
});
