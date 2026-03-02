/**
 * Structured logging utility for VocalShield CI/CD Pipeline
 * 
 * Provides JSON-formatted logging with consistent structure across all pipeline components.
 */

import { maskSecret } from './utils';

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  requestId?: string;
  userId?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  component: string;
  minLevel: LogLevel;
  maskSecrets: boolean;
}

/**
 * Structured logger class
 */
export class Logger {
  private config: LoggerConfig;
  private requestId?: string;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      component: config.component || 'pipeline',
      minLevel: config.minLevel || LogLevel.INFO,
      maskSecrets: config.maskSecrets !== false,
    };
  }

  /**
   * Sets the request ID for correlation
   */
  setRequestId(requestId: string): void {
    this.requestId = requestId;
  }

  /**
   * Logs a debug message
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Logs an info message
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * Logs a warning message
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  /**
   * Logs an error message
   */
  error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
    const errorMetadata = error
      ? {
          ...metadata,
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
        }
      : metadata;

    this.log(LogLevel.ERROR, message, errorMetadata);
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.config.component,
      message,
      requestId: this.requestId,
      metadata: this.config.maskSecrets
        ? this.maskSensitiveData(metadata)
        : metadata,
    };

    const output = JSON.stringify(entry);

    switch (level) {
      case LogLevel.ERROR:
        console.error(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  /**
   * Checks if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentLevelIndex = levels.indexOf(this.config.minLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Masks sensitive data in metadata
   */
  private maskSensitiveData(
    metadata?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (!metadata) {
      return undefined;
    }

    const sensitiveKeys = [
      'password',
      'secret',
      'token',
      'key',
      'apikey',
      'api_key',
      'accesskey',
      'access_key',
      'secretkey',
      'secret_key',
      'credential',
      'auth',
      'authorization',
    ];

    const masked: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(metadata)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some(sensitiveKey =>
        lowerKey.includes(sensitiveKey)
      );

      if (isSensitive && typeof value === 'string') {
        masked[key] = maskSecret(value);
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = this.maskSensitiveData(value as Record<string, unknown>);
      } else {
        masked[key] = value;
      }
    }

    return masked;
  }

  /**
   * Creates a child logger with additional context
   */
  child(component: string): Logger {
    return new Logger({
      ...this.config,
      component: `${this.config.component}:${component}`,
    });
  }

  /**
   * Logs the start of an operation and returns a function to log completion
   */
  startOperation(operationName: string): () => void {
    const startTime = Date.now();
    this.info(`Starting ${operationName}`);

    return () => {
      const duration = Date.now() - startTime;
      this.info(`Completed ${operationName}`, { duration });
    };
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger();

/**
 * Creates a logger for a specific component
 */
export function createLogger(component: string, minLevel?: LogLevel): Logger {
  return new Logger({ component, minLevel });
}
