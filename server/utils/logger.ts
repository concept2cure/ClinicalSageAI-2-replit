/**
 * Simple logger utility for the application
 */

type LogContext = Record<string, unknown>;

/** Normalize arbitrary context values into a LogContext object */
function normalizeContext(ctx: unknown): LogContext {
  if (!ctx) return {};
  if (ctx instanceof Error) return { error: ctx.message, stack: ctx.stack };
  if (typeof ctx === 'string') return { detail: ctx };
  if (typeof ctx === 'object' && !Array.isArray(ctx)) return ctx as LogContext;
  return { value: ctx };
}

interface Logger {
  info(message: string, context?: unknown): void;
  error(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  debug(message: string, context?: unknown): void;
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

const redactValue = (value: unknown) => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return '[REDACTED]';
  if (typeof value === 'object') return '[REDACTED]';
  return '[REDACTED]';
};

const redactContext = (context: LogContext, depth = 0): LogContext => {
  if (!context || typeof context !== 'object') return context;
  if (depth > 6) return context;
  if (Array.isArray(context)) return context as unknown as LogContext;

  const output: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase();
    const shouldRedact = SENSITIVE_KEYS.some(sensitive => lowerKey.includes(sensitive));

    if (shouldRedact) {
      output[key] = redactValue(value);
    } else if (value && typeof value === 'object') {
      output[key] = redactContext(value as LogContext, depth + 1);
    } else {
      output[key] = value;
    }
  }
  return output;
};

// Create a simple logger that outputs to console
const baseLogger: Logger = {
  info: (message: string, context?: unknown) => {
    const ctx = normalizeContext(context);
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message,
          context: redactContext(ctx),
        },
        null,
        2
      )
    );
  },

  error: (message: string, context?: unknown) => {
    const ctx = normalizeContext(context);
    console.error(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          level: 'error',
          message,
          context: redactContext(ctx),
        },
        null,
        2
      )
    );
  },

  warn: (message: string, context?: unknown) => {
    const ctx = normalizeContext(context);
    console.warn(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          level: 'warn',
          message,
          context: redactContext(ctx),
        },
        null,
        2
      )
    );
  },

  debug: (message: string, context?: unknown) => {
    if (process.env.DEBUG) {
      const ctx = normalizeContext(context);
      console.debug(
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            level: 'debug',
            message,
            context: redactContext(ctx),
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
    info: (message: string, context?: unknown) => logger.info(`[${scope}] ${message}`, context),
    error: (message: string, context?: unknown) => logger.error(`[${scope}] ${message}`, context),
    warn: (message: string, context?: unknown) => logger.warn(`[${scope}] ${message}`, context),
    debug: (message: string, context?: unknown) => logger.debug(`[${scope}] ${message}`, context),
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
const logger: Logger = {
  info: (message: string, context?: unknown) =>
    pinoLogger.info({ context: normalizeContext(context) }, message),
  error: (message: string, context?: unknown) =>
    pinoLogger.error({ context: normalizeContext(context) }, message),
  warn: (message: string, context?: unknown) =>
    pinoLogger.warn({ context: normalizeContext(context) }, message),
  debug: (message: string, context?: unknown) =>
    pinoLogger.debug({ context: normalizeContext(context) }, message),
};

// Named export so files can use: import { logger } from '../utils/logger.js'
export { logger };
export default logger;
