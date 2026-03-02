/**
 * Unit tests for pipeline logger
 */

import { Logger, LogLevel, createLogger } from '../../../pipeline/logger';

describe('Pipeline Logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Logger creation', () => {
    it('should create logger with default config', () => {
      const logger = new Logger();
      logger.info('test message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.component).toBe('pipeline');
      expect(logEntry.level).toBe('INFO');
    });

    it('should create logger with custom component', () => {
      const logger = new Logger({ component: 'test-component' });
      logger.info('test message');

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.component).toBe('test-component');
    });

    it('should create logger with custom min level', () => {
      const logger = new Logger({ minLevel: LogLevel.WARN });
      logger.info('should not log');
      logger.warn('should log');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Log levels', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = new Logger({ minLevel: LogLevel.DEBUG });
    });

    it('should log debug messages', () => {
      logger.debug('debug message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe('DEBUG');
      expect(logEntry.message).toBe('debug message');
    });

    it('should log info messages', () => {
      logger.info('info message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe('INFO');
      expect(logEntry.message).toBe('info message');
    });

    it('should log warn messages', () => {
      logger.warn('warn message');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe('WARN');
      expect(logEntry.message).toBe('warn message');
    });

    it('should log error messages', () => {
      logger.error('error message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe('ERROR');
      expect(logEntry.message).toBe('error message');
    });
  });

  describe('Metadata handling', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = new Logger();
    });

    it('should include metadata in log entry', () => {
      logger.info('test message', { name: 'value', count: 42 });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.metadata).toEqual({ name: 'value', count: 42 });
    });

    it('should mask sensitive data in metadata', () => {
      logger.info('test message', {
        username: 'user',
        password: 'secret123',
        apiKey: 'key-12345',
      });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.metadata.username).toBe('user');
      expect(logEntry.metadata.password).not.toBe('secret123');
      expect(logEntry.metadata.password).toContain('*');
      expect(logEntry.metadata.apiKey).not.toBe('key-12345');
      expect(logEntry.metadata.apiKey).toContain('*');
    });

    it('should mask nested sensitive data', () => {
      logger.info('test message', {
        config: {
          database: 'mydb',
          password: 'dbsecret',
        },
      });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.metadata.config.database).toBe('mydb');
      expect(logEntry.metadata.config.password).not.toBe('dbsecret');
      expect(logEntry.metadata.config.password).toContain('*');
    });

    it('should not mask when maskSecrets is false', () => {
      const logger = new Logger({ maskSecrets: false });
      logger.info('test message', { password: 'secret123' });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.metadata.password).toBe('secret123');
    });
  });

  describe('Error logging', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = new Logger();
    });

    it('should log error with Error object', () => {
      const error = new Error('test error');
      logger.error('operation failed', error);

      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logEntry.message).toBe('operation failed');
      expect(logEntry.metadata.error.name).toBe('Error');
      expect(logEntry.metadata.error.message).toBe('test error');
      expect(logEntry.metadata.error.stack).toBeDefined();
    });

    it('should log error without Error object', () => {
      logger.error('operation failed');

      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logEntry.message).toBe('operation failed');
      expect(logEntry.metadata).toBeUndefined();
    });

    it('should merge error with existing metadata', () => {
      const error = new Error('test error');
      logger.error('operation failed', error, { context: 'deployment' });

      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logEntry.metadata.context).toBe('deployment');
      expect(logEntry.metadata.error.message).toBe('test error');
    });
  });

  describe('Request ID', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = new Logger();
    });

    it('should include request ID when set', () => {
      logger.setRequestId('req-123');
      logger.info('test message');

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.requestId).toBe('req-123');
    });

    it('should not include request ID when not set', () => {
      logger.info('test message');

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.requestId).toBeUndefined();
    });
  });

  describe('Child logger', () => {
    it('should create child logger with nested component', () => {
      const parent = new Logger({ component: 'parent' });
      const child = parent.child('child');

      child.info('test message');

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.component).toBe('parent:child');
    });

    it('should inherit parent configuration', () => {
      const parent = new Logger({ component: 'parent', minLevel: LogLevel.WARN });
      const child = parent.child('child');

      child.info('should not log');
      child.warn('should log');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Operation timing', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = new Logger();
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should log operation start and completion', () => {
      const complete = logger.startOperation('test-operation');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      let logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.message).toBe('Starting test-operation');

      jest.advanceTimersByTime(1000);
      complete();

      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      logEntry = JSON.parse(consoleLogSpy.mock.calls[1][0]);
      expect(logEntry.message).toBe('Completed test-operation');
      expect(logEntry.metadata.duration).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('Log entry structure', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = new Logger({ component: 'test' });
    });

    it('should have correct structure', () => {
      logger.info('test message', { key: 'value' });

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry).toHaveProperty('timestamp');
      expect(logEntry).toHaveProperty('level');
      expect(logEntry).toHaveProperty('component');
      expect(logEntry).toHaveProperty('message');
      expect(logEntry).toHaveProperty('metadata');
      expect(new Date(logEntry.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('createLogger helper', () => {
    it('should create logger with component', () => {
      const logger = createLogger('helper-test');
      logger.info('test message');

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.component).toBe('helper-test');
    });

    it('should create logger with custom min level', () => {
      const logger = createLogger('helper-test', LogLevel.ERROR);
      logger.info('should not log');
      logger.error('should log');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });
});
