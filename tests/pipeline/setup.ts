/**
 * Test setup for pipeline tests
 * 
 * This file configures the test environment for pipeline component tests.
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.CI = 'true';
process.env.GITHUB_ACTIONS = 'true';
process.env.GITHUB_SHA = 'test-commit-hash-1234567890abcdef';
process.env.GITHUB_REF = 'refs/heads/main';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Increase test timeout for integration tests
jest.setTimeout(30000);
