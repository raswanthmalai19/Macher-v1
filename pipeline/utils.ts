/**
 * Utility functions for MACHER CI/CD Pipeline
 * 
 * This module provides common utility functions used across pipeline components.
 */

/**
 * Masks sensitive values in strings for logging
 * @param value - The string to mask
 * @param visibleChars - Number of characters to show at start and end (default: 4)
 * @returns Masked string
 */
export function maskSecret(value: string, visibleChars: number = 4): string {
  if (!value || value.length <= visibleChars * 2) {
    return '***';
  }
  
  const start = value.substring(0, visibleChars);
  const end = value.substring(value.length - visibleChars);
  const masked = '*'.repeat(Math.max(8, value.length - visibleChars * 2));
  
  return `${start}${masked}${end}`;
}

/**
 * Validates that a string is not empty or placeholder
 * @param value - The string to validate
 * @returns True if valid, false otherwise
 */
export function isValidConfigValue(value: string): boolean {
  if (!value || value.trim().length === 0) {
    return false;
  }
  
  const placeholders = [
    'TODO',
    'CHANGEME',
    'PLACEHOLDER',
    'XXX',
    'REPLACE_ME',
    '<',
    '>',
  ];
  
  const upperValue = value.toUpperCase();
  return !placeholders.some(placeholder => upperValue.includes(placeholder));
}

/**
 * Calculates a simple hash of a string
 * @param value - The string to hash
 * @returns Hash string
 */
export function simpleHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Formats a duration in milliseconds to a human-readable string
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    return remainingSeconds > 0 
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}

/**
 * Retries an async operation with exponential backoff
 * @param operation - The async operation to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param baseDelay - Base delay in milliseconds (default: 1000)
 * @returns Result of the operation
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Sleeps for a specified duration
 * @param ms - Duration in milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validates an email address format
 * @param email - Email address to validate
 * @returns True if valid, false otherwise
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates a URL format
 * @param url - URL to validate
 * @returns True if valid, false otherwise
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely parses JSON with error handling
 * @param json - JSON string to parse
 * @returns Parsed object or null if invalid
 */
export function safeJsonParse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Generates a unique ID based on timestamp and random value
 * @returns Unique ID string
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `${timestamp}-${random}`;
}

/**
 * Truncates a string to a maximum length
 * @param str - String to truncate
 * @param maxLength - Maximum length
 * @param suffix - Suffix to add if truncated (default: '...')
 * @returns Truncated string
 */
export function truncate(str: string, maxLength: number, suffix: string = '...'): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Deep clones an object
 * @param obj - Object to clone
 * @returns Cloned object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Merges two objects deeply
 * @param target - Target object
 * @param source - Source object
 * @returns Merged object
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };
  
  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];
    
    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[Extract<keyof T, string>];
    } else {
      result[key] = sourceValue as T[Extract<keyof T, string>];
    }
  }
  
  return result;
}

/**
 * Checks if a value is defined (not null or undefined)
 * @param value - Value to check
 * @returns True if defined, false otherwise
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Filters out null and undefined values from an array
 * @param array - Array to filter
 * @returns Filtered array
 */
export function filterDefined<T>(array: (T | null | undefined)[]): T[] {
  return array.filter(isDefined);
}

/**
 * Groups an array of items by a key function
 * @param array - Array to group
 * @param keyFn - Function to extract the key
 * @returns Grouped object
 */
export function groupBy<T, K extends string | number>(
  array: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  return array.reduce((result, item) => {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
    return result;
  }, {} as Record<K, T[]>);
}

/**
 * Calculates percentage with precision
 * @param value - Current value
 * @param total - Total value
 * @param precision - Decimal places (default: 2)
 * @returns Percentage value
 */
export function calculatePercentage(
  value: number,
  total: number,
  precision: number = 2
): number {
  if (total === 0) {
    return 0;
  }
  return Number(((value / total) * 100).toFixed(precision));
}

/**
 * Formats bytes to human-readable size
 * @param bytes - Size in bytes
 * @param precision - Decimal places (default: 2)
 * @returns Formatted size string
 */
export function formatBytes(bytes: number, precision: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(precision)} ${sizes[i]}`;
}

/**
 * Checks if running in CI environment
 * @returns True if in CI, false otherwise
 */
export function isCI(): boolean {
  return process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
}

/**
 * Gets the current Git commit hash
 * @returns Commit hash or 'unknown'
 */
export function getCommitHash(): string {
  return process.env.GITHUB_SHA || 'unknown';
}

/**
 * Gets the current Git branch
 * @returns Branch name or 'unknown'
 */
export function getBranch(): string {
  const ref = process.env.GITHUB_REF || '';
  return ref.replace('refs/heads/', '') || 'unknown';
}

/**
 * Validates AWS region format
 * @param region - AWS region to validate
 * @returns True if valid, false otherwise
 */
export function isValidAwsRegion(region: string): boolean {
  const regionRegex = /^[a-z]{2}-[a-z]+-\d{1}$/;
  return regionRegex.test(region);
}

/**
 * Validates AWS account ID format
 * @param accountId - AWS account ID to validate
 * @returns True if valid, false otherwise
 */
export function isValidAwsAccountId(accountId: string): boolean {
  const accountIdRegex = /^\d{12}$/;
  return accountIdRegex.test(accountId);
}
