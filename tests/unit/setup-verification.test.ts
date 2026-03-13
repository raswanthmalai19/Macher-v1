/**
 * Setup Verification Test
 * 
 * This test verifies that the project structure and dependencies are correctly set up
 * for the Competition MVP Backend implementation.
 */

import * as fc from 'fast-check';

describe('Project Setup Verification', () => {
  describe('TypeScript Configuration', () => {
    test('should have strict mode enabled', () => {
      const tsconfig = require('../../tsconfig.json');
      expect(tsconfig.compilerOptions.strict).toBe(true);
      expect(tsconfig.compilerOptions.target).toBe('ES2022');
    });
  });

  describe('Dependencies', () => {
    test('should have AWS CDK dependencies installed', () => {
      expect(() => require('aws-cdk-lib')).not.toThrow();
      expect(() => require('constructs')).not.toThrow();
    });

    test('should have AWS SDK dependencies installed', () => {
      expect(() => require('@aws-sdk/client-transcribe-streaming')).not.toThrow();
      expect(() => require('@aws-sdk/client-bedrock-agent-runtime')).not.toThrow();
      expect(() => require('@aws-sdk/client-dynamodb')).not.toThrow();
      expect(() => require('@aws-sdk/lib-dynamodb')).not.toThrow();
      expect(() => require('@aws-sdk/client-apigatewaymanagementapi')).not.toThrow();
    });

    test('should have testing dependencies installed', () => {
      expect(() => require('jest')).not.toThrow();
      expect(() => require('fast-check')).not.toThrow();
      expect(() => require('aws-sdk-client-mock')).not.toThrow();
    });
  });

  describe('Property-Based Testing Setup', () => {
    test('fast-check should generate random values', () => {
      fc.assert(
        fc.property(fc.integer(), (n) => {
          return typeof n === 'number';
        }),
        { numRuns: 10 }
      );
    });

    test('fast-check should support async properties', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string(), async (s) => {
          return typeof s === 'string';
        }),
        { numRuns: 10 }
      );
    });
  });

  describe('Directory Structure', () => {
    test('should have required directories', () => {
      const fs = require('fs');
      const path = require('path');

      const requiredDirs = [
        'lib',
        'lambda',
        'tests',
        'tests/unit',
        'tests/property',
        'tests/properties',
        'tests/integration'
      ];

      requiredDirs.forEach(dir => {
        const dirPath = path.join(process.cwd(), dir);
        expect(fs.existsSync(dirPath)).toBe(true);
      });
    });
  });

  describe('Jest Configuration', () => {
    test('should have coverage thresholds configured', () => {
      const jestConfig = require('../../jest.config.js');
      expect(jestConfig.coverageThreshold).toBeDefined();
      expect(jestConfig.coverageThreshold.global.lines).toBe(80);
      expect(jestConfig.coverageThreshold.global.branches).toBe(75);
      expect(jestConfig.coverageThreshold.global.functions).toBe(90);
    });

    test('should have TypeScript support configured', () => {
      const jestConfig = require('../../jest.config.js');
      expect(jestConfig.transform).toBeDefined();
      expect(jestConfig.transform['^.+\\.tsx?$']).toBeDefined();
    });
  });
});
