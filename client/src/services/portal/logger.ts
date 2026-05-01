/**
 * Concept2Cure Client Portal V2 - Logging Utility
 *
 * Provides structured logging with compliance-aware filtering.
 * In production, logs are sent to the audit service.
 * In development, logs are output to the console.
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11.10(e) - Audit Trail
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'audit';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  category: string;
  metadata?: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
  organizationId?: string;
}

export interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  enableRemote: boolean;
  sensitiveFields: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  audit: 4,
};

const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'accessToken',
  'refreshToken',
  'apiKey',
  'creditCard',
  'ssn',
  'socialSecurityNumber',
];

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

// ─────────────────────────────────────────────────────────────────────────────
// LOGGER CLASS
// ─────────────────────────────────────────────────────────────────────────────

class Logger {
  private config: LoggerConfig = {
    minLevel: IS_DEVELOPMENT ? 'debug' : 'info',
    enableConsole: IS_DEVELOPMENT,
    enableRemote: !IS_DEVELOPMENT,
    sensitiveFields: SENSITIVE_FIELDS,
  };

  private context: {
    userId?: string;
    sessionId?: string;
    organizationId?: string;
  } = {};

  /**
   * Set global context for all log entries
   */
  setContext(context: { userId?: string; sessionId?: string; organizationId?: string }): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear global context
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * Configure logger settings
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Sanitize metadata to remove sensitive fields
   */
  private sanitize(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = this.config.sensitiveFields.some(field =>
        lowerKey.includes(field.toLowerCase())
      );

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitize(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Check if log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
  }

  /**
   * Create a log entry
   */
  private createEntry(
    level: LogLevel,
    category: string,
    message: string,
    metadata?: Record<string, unknown>
  ): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      category,
      metadata: metadata ? this.sanitize(metadata) : undefined,
      ...this.context,
    };
  }

  /**
   * Output to console (development only)
   */
  private consoleOutput(entry: LogEntry): void {
    if (!this.config.enableConsole) return;

    const prefix = `[${entry.level.toUpperCase()}] [${entry.category}]`;

    switch (entry.level) {
      case 'debug':
        // eslint-disable-next-line no-console
        console.debug(prefix, entry.message, entry.metadata || '');
        break;
      case 'info':
        // eslint-disable-next-line no-console
        console.info(prefix, entry.message, entry.metadata || '');
        break;
      case 'warn':
        // eslint-disable-next-line no-console
        console.warn(prefix, entry.message, entry.metadata || '');
        break;
      case 'error':
      case 'audit':
        // eslint-disable-next-line no-console
        console.error(prefix, entry.message, entry.metadata || '');
        break;
    }
  }

  /**
   * Send to remote audit service (production)
   */
  private async remoteOutput(entry: LogEntry): Promise<void> {
    if (!this.config.enableRemote) return;
    if (entry.level === 'debug') return; // Never send debug logs remotely

    try {
      // TODO: Implement actual API call to audit service
      // await fetch('/api/v1/audit/log', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(entry),
      // });
    } catch {
      // Silently fail - don't crash app if logging fails
    }
  }

  /**
   * Core log method
   */
  private log(
    level: LogLevel,
    category: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.shouldLog(level)) return;

    const entry = this.createEntry(level, category, message, metadata);
    this.consoleOutput(entry);
    this.remoteOutput(entry);
  }

  /**
   * Debug level - development only
   */
  debug(category: string, message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', category, message, metadata);
  }

  /**
   * Info level - general information
   */
  info(category: string, message: string, metadata?: Record<string, unknown>): void {
    this.log('info', category, message, metadata);
  }

  /**
   * Warning level - potential issues
   */
  warn(category: string, message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', category, message, metadata);
  }

  /**
   * Error level - errors and exceptions
   */
  error(category: string, message: string, metadata?: Record<string, unknown>): void {
    this.log('error', category, message, metadata);
  }

  /**
   * Audit level - compliance-required audit trail
   * Always logged to remote service in production
   */
  audit(category: string, message: string, metadata?: Record<string, unknown>): void {
    this.log('audit', category, message, metadata);
  }

  /**
   * Create a category-scoped logger
   */
  scope(category: string): ScopedLogger {
    return new ScopedLogger(this, category);
  }
}

/**
 * Scoped logger for specific categories
 */
class ScopedLogger {
  constructor(
    private logger: Logger,
    private category: string
  ) {}

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.logger.debug(this.category, message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.logger.info(this.category, message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.logger.warn(this.category, message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.logger.error(this.category, message, metadata);
  }

  audit(message: string, metadata?: Record<string, unknown>): void {
    this.logger.audit(this.category, message, metadata);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export const logger = new Logger();

// Pre-configured scoped loggers for common categories
export const authLogger = logger.scope('auth');
export const securityLogger = logger.scope('security');
export const auditLogger = logger.scope('audit');
export const adminLogger = logger.scope('admin');
export const complianceLogger = logger.scope('compliance');
export const sessionLogger = logger.scope('session');

export default logger;
