/**
 * Simple logger utility for the application
 */

type LogContext = Record<string, any>;

interface Logger {
  info(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
}

const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'set-cookie',
  'ssn',
  'dob',
];

const redactValue = (value: any) => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return '[REDACTED]';
  if (typeof value === 'object') return '[REDACTED]';
  return '[REDACTED]';
};

const redactContext = (context: LogContext, depth = 0): LogContext => {
  if (!context || typeof context !== 'object') return context;
  if (depth > 6) return context;

  const output: LogContext = Array.isArray(context) ? [] : {};
  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase();
    const shouldRedact = SENSITIVE_KEYS.some(sensitive => lowerKey.includes(sensitive));

    if (shouldRedact) {
      (output as any)[key] = redactValue(value);
    } else if (value && typeof value === 'object') {
      (output as any)[key] = redactContext(value as LogContext, depth + 1);
    } else {
      (output as any)[key] = value;
    }
  }
  return output as LogContext;
};

// Create a simple logger that outputs to console
const baseLogger: Logger = {
  info: (message: string, context: LogContext = {}) => {
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message,
          context: redactContext(context),
        },
        null,
        2
      )
    );
  },

  error: (message: string, context: LogContext = {}) => {
    console.error(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          level: 'error',
          message,
          context: redactContext(context),
        },
        null,
        2
      )
    );
  },

  warn: (message: string, context: LogContext = {}) => {
    console.warn(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          level: 'warn',
          message,
          context: redactContext(context),
        },
        null,
        2
      )
    );
  },

  debug: (message: string, context: LogContext = {}) => {
    if (process.env.DEBUG) {
      console.debug(
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            level: 'debug',
            message,
            context: redactContext(context),
          },
          null,
          2
        )
      );
    }
  },
};

/**
 * Creates a scoped logger for a specific module or component
 *
 * @param scope The scope/name of the module using the logger
 * @returns A logger instance that includes the scope in all messages
 */
export function createScopedLogger(scope: string): Logger {
  return {
    info: (message: string, context?: Record<string, unknown>) =>
      logger.info(`[${scope}] ${message}`, context || {}),
    error: (message: string, context?: Record<string, unknown>) =>
      logger.error(`[${scope}] ${message}`, context || {}),
    warn: (message: string, context?: Record<string, unknown>) =>
      logger.warn(`[${scope}] ${message}`, context || {}),
    debug: (message: string, context?: Record<string, unknown>) =>
      logger.debug(`[${scope}] ${message}`, context || {}),
  };
}

// Alias for createScopedLogger to support different naming conventions
export const createContextLogger = createScopedLogger;

import pino from 'pino';

// Create a Pino logger with redaction for sensitive fields
const pinoLogger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'context.password',
      'context.passwordHash',
      'context.token',
      'context.apiKey',
      '*.authorization',
    ],
    remove: false,
  },
});

// Adapter to match the existing Logger interface used in the repo
const logger = {
  info: (message: string, context: any = {}) => pinoLogger.info({ context }, message),
  error: (message: string, context: any = {}) => pinoLogger.error({ context }, message),
  warn: (message: string, context: any = {}) => pinoLogger.warn({ context }, message),
  debug: (message: string, context: any = {}) => pinoLogger.debug({ context }, message),
};

// Named export so files can use: import { logger } from '../utils/logger.js'
export { logger };
export default logger;
