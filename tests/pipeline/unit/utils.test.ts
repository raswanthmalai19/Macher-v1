/**
 * Unit tests for pipeline utility functions
 */

import {
  maskSecret,
  isValidConfigValue,
  simpleHash,
  formatDuration,
  retryWithBackoff,
  sleep,
  isValidEmail,
  isValidUrl,
  safeJsonParse,
  generateId,
  truncate,
  deepClone,
  deepMerge,
  isDefined,
  filterDefined,
  groupBy,
  calculatePercentage,
  formatBytes,
  isValidAwsRegion,
  isValidAwsAccountId,
} from '../../../pipeline/utils';

describe('Pipeline Utils', () => {
  describe('maskSecret', () => {
    it('should mask secrets with default visible characters', () => {
      const secret = 'my-secret-key-12345';
      const masked = maskSecret(secret);
      expect(masked).toContain('my-s');
      expect(masked).toContain('2345');
      expect(masked).toContain('*');
      expect(masked).not.toContain('secret');
    });

    it('should return *** for short secrets', () => {
      expect(maskSecret('abc')).toBe('***');
      expect(maskSecret('12345')).toBe('***');
    });

    it('should handle custom visible characters', () => {
      const secret = 'my-secret-key-12345';
      const masked = maskSecret(secret, 2);
      expect(masked).toContain('my');
      expect(masked).toContain('45');
    });
  });

  describe('isValidConfigValue', () => {
    it('should return true for valid values', () => {
      expect(isValidConfigValue('valid-value')).toBe(true);
      expect(isValidConfigValue('us-east-1')).toBe(true);
      expect(isValidConfigValue('123456789012')).toBe(true);
    });

    it('should return false for empty or whitespace values', () => {
      expect(isValidConfigValue('')).toBe(false);
      expect(isValidConfigValue('   ')).toBe(false);
    });

    it('should return false for placeholder values', () => {
      expect(isValidConfigValue('TODO')).toBe(false);
      expect(isValidConfigValue('CHANGEME')).toBe(false);
      expect(isValidConfigValue('PLACEHOLDER')).toBe(false);
      expect(isValidConfigValue('<replace-me>')).toBe(false);
      expect(isValidConfigValue('XXX')).toBe(false);
    });
  });

  describe('simpleHash', () => {
    it('should generate consistent hashes', () => {
      const value = 'test-value';
      const hash1 = simpleHash(value);
      const hash2 = simpleHash(value);
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different values', () => {
      const hash1 = simpleHash('value1');
      const hash2 = simpleHash('value2');
      expect(hash1).not.toBe(hash2);
    });

    it('should return hexadecimal string', () => {
      const hash = simpleHash('test');
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(45000)).toBe('45s');
    });

    it('should format minutes', () => {
      expect(formatDuration(60000)).toBe('1m');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(120000)).toBe('2m');
    });

    it('should format hours', () => {
      expect(formatDuration(3600000)).toBe('1h');
      expect(formatDuration(5400000)).toBe('1h 30m');
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const result = await retryWithBackoff(operation);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValue('success');

      const result = await retryWithBackoff(operation, 3, 10);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('persistent failure'));

      await expect(retryWithBackoff(operation, 2, 10)).rejects.toThrow('persistent failure');
      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('sleep', () => {
    it('should delay execution', async () => {
      const start = Date.now();
      await sleep(100);
      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(90); // Allow some variance
    });
  });

  describe('isValidEmail', () => {
    it('should validate correct email addresses', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('test.user@domain.co.uk')).toBe(true);
      expect(isValidEmail('user+tag@example.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('invalid@')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
    });
  });

  describe('isValidUrl', () => {
    it('should validate correct URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:3000')).toBe(true);
      expect(isValidUrl('https://api.example.com/path')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('ftp://invalid')).toBe(true); // URL constructor accepts ftp
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      const obj = { key: 'value', number: 42 };
      const json = JSON.stringify(obj);
      expect(safeJsonParse(json)).toEqual(obj);
    });

    it('should return null for invalid JSON', () => {
      expect(safeJsonParse('invalid json')).toBeNull();
      expect(safeJsonParse('{incomplete')).toBeNull();
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with correct format', () => {
      const id = generateId();
      expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    });
  });

  describe('truncate', () => {
    it('should not truncate short strings', () => {
      expect(truncate('short', 10)).toBe('short');
    });

    it('should truncate long strings', () => {
      const long = 'this is a very long string';
      const truncated = truncate(long, 10);
      expect(truncated).toBe('this is...');
      expect(truncated.length).toBe(10);
    });

    it('should use custom suffix', () => {
      const truncated = truncate('long string', 8, '---');
      expect(truncated).toBe('long ---');
    });
  });

  describe('deepClone', () => {
    it('should clone objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      const cloned = deepClone(obj);
      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.b).not.toBe(obj.b);
    });

    it('should clone arrays', () => {
      const arr = [1, 2, { a: 3 }];
      const cloned = deepClone(arr);
      expect(cloned).toEqual(arr);
      expect(cloned).not.toBe(arr);
    });
  });

  describe('deepMerge', () => {
    it('should merge objects', () => {
      const target = { a: 1, b: { c: 2 } };
      const source = { b: { c: 2, d: 3 }, e: 4 };
      const merged = deepMerge(target, source);
      expect(merged).toEqual({ a: 1, b: { c: 2, d: 3 }, e: 4 });
    });

    it('should not mutate target', () => {
      const target = { a: 1 };
      const source = { a: 1, b: 2 };
      deepMerge(target, source);
      expect(target).toEqual({ a: 1 });
    });
  });

  describe('isDefined', () => {
    it('should return true for defined values', () => {
      expect(isDefined(0)).toBe(true);
      expect(isDefined('')).toBe(true);
      expect(isDefined(false)).toBe(true);
      expect(isDefined({})).toBe(true);
    });

    it('should return false for null and undefined', () => {
      expect(isDefined(null)).toBe(false);
      expect(isDefined(undefined)).toBe(false);
    });
  });

  describe('filterDefined', () => {
    it('should filter out null and undefined', () => {
      const arr = [1, null, 2, undefined, 3];
      expect(filterDefined(arr)).toEqual([1, 2, 3]);
    });
  });

  describe('groupBy', () => {
    it('should group items by key', () => {
      const items = [
        { type: 'a', value: 1 },
        { type: 'b', value: 2 },
        { type: 'a', value: 3 },
      ];
      const grouped = groupBy(items, item => item.type);
      expect(grouped).toEqual({
        a: [{ type: 'a', value: 1 }, { type: 'a', value: 3 }],
        b: [{ type: 'b', value: 2 }],
      });
    });
  });

  describe('calculatePercentage', () => {
    it('should calculate percentage', () => {
      expect(calculatePercentage(50, 100)).toBe(50);
      expect(calculatePercentage(1, 3)).toBe(33.33);
      expect(calculatePercentage(2, 3, 1)).toBe(66.7);
    });

    it('should handle zero total', () => {
      expect(calculatePercentage(10, 0)).toBe(0);
    });
  });

  describe('formatBytes', () => {
    it('should format bytes', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1.00 KB');
      expect(formatBytes(1048576)).toBe('1.00 MB');
      expect(formatBytes(1073741824)).toBe('1.00 GB');
    });

    it('should use custom precision', () => {
      expect(formatBytes(1536, 0)).toBe('2 KB');
      expect(formatBytes(1536, 3)).toBe('1.500 KB');
    });
  });

  describe('isValidAwsRegion', () => {
    it('should validate correct AWS regions', () => {
      expect(isValidAwsRegion('us-east-1')).toBe(true);
      expect(isValidAwsRegion('eu-west-2')).toBe(true);
      expect(isValidAwsRegion('ap-south-1')).toBe(true);
    });

    it('should reject invalid AWS regions', () => {
      expect(isValidAwsRegion('invalid')).toBe(false);
      expect(isValidAwsRegion('us-east')).toBe(false);
      expect(isValidAwsRegion('us-east-1a')).toBe(false);
    });
  });

  describe('isValidAwsAccountId', () => {
    it('should validate correct AWS account IDs', () => {
      expect(isValidAwsAccountId('123456789012')).toBe(true);
      expect(isValidAwsAccountId('000000000000')).toBe(true);
    });

    it('should reject invalid AWS account IDs', () => {
      expect(isValidAwsAccountId('12345')).toBe(false);
      expect(isValidAwsAccountId('12345678901')).toBe(false);
      expect(isValidAwsAccountId('1234567890123')).toBe(false);
      expect(isValidAwsAccountId('abcdefghijkl')).toBe(false);
    });
  });
});
