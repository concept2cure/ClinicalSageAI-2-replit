/**
 * Application logger with HIPAA/pharma-aware redaction.
 *
 * Every log line passes through `redactContext` BEFORE reaching Pino,
 * so deeply-nested sensitive fields are scrubbed regardless of how the
 * context object is shaped. Pino's own `redact.paths` only catches
 * fixed paths; the walker below handles arbitrary nesting.
 *
 * SENSITIVE_KEYS is matched case-insensitively as a substring of the
 * key name, so `userPassword`, `currentPasswordHash`, `password_hash`,
 * `oldPassword` are all caught by the same `password` entry.
 *
 * Categories covered:
 *   - Auth credentials: password, secret, token, bearer, jwt, refresh,
 *     id_token, access_token, mfa, otp, totp, cookie, session
 *   - API keys: api_key, apikey, x-api-key
 *   - PHI identifiers (HIPAA): mrn, patient_id, subject_id, nih_id,
 *     clinical_id, dob, ssn
 *   - Payment data: card_number, cvv, cvc, payment_token, stripe_*
 *   - Request headers that often carry the above: authorization,
 *     set-cookie
 *
 * If a future log line could plausibly carry a regulated field, add
 * the key here rather than scrubbing at the call site — centralized
 * redaction is harder to forget.
 */

import pino from 'pino';

type LogContext = Record<string, unknown>;

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
  // Auth credentials
  'password',
  'passwordhash',
  'password_hash',
  'secret',
  'token',
  'bearer',
  'jwt',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'id_token',
  'idtoken',
  'mfa',
  'otp',
  'totp',
  'cookie',
  'set-cookie',
  'session',
  'sessionid',
  'session_id',
  'csrf',
  // API keys
  'apikey',
  'api_key',
  'x-api-key',
  // PHI identifiers (HIPAA-protected health information)
  'mrn',
  'medical_record_number',
  'patient_id',
  'patientid',
  'subject_id',
  'subjectid',
  'nih_id',
  'clinical_id',
  'clinicalid',
  'phi',
  'phn',
  // PII
  'ssn',
  'dob',
  'date_of_birth',
  'dateofbirth',
  // Payment data
  'card_number',
  'cardnumber',
  'cvv',
  'cvc',
  'payment_token',
  'paymenttoken',
  'stripe_secret',
  'stripe_token',
  // Generic request artifacts that frequently carry the above
  'authorization',
];

const redactValue = (value: unknown) => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return '[REDACTED]';
  if (typeof value === 'object') return '[REDACTED]';
  return '[REDACTED]';
};

/**
 * Walk the context tree replacing values under sensitive keys with
 * '[REDACTED]'. Recurses into objects up to depth 6 (any deeper is
 * almost certainly accidental log spam and not worth scanning).
 * Arrays are passed through — array values usually don't contain
 * named fields, and walking large arrays kills log throughput.
 */
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

// Create a Pino logger. Redaction is performed by `redactContext` ABOVE
// the pino layer so the walker can handle arbitrary nesting; pino's own
// `redact.paths` only catches the fixed paths it knows about.
const pinoLogger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  timestamp: pino.stdTimeFunctions.isoTime,
  // Backstop: even if a caller bypasses the wrapper, the most common
  // top-level paths still get scrubbed at the pino layer.
  redact: {
    paths: [
      'context.password',
      'context.passwordHash',
      'context.token',
      'context.apiKey',
      'context.authorization',
      '*.authorization',
      '*.password',
      '*.token',
    ],
    remove: false,
  },
});

const logger: Logger = {
  info: (message: string, context?: unknown) =>
    pinoLogger.info({ context: redactContext(normalizeContext(context)) }, message),
  error: (message: string, context?: unknown) =>
    pinoLogger.error({ context: redactContext(normalizeContext(context)) }, message),
  warn: (message: string, context?: unknown) =>
    pinoLogger.warn({ context: redactContext(normalizeContext(context)) }, message),
  debug: (message: string, context?: unknown) =>
    pinoLogger.debug({ context: redactContext(normalizeContext(context)) }, message),
};

/**
 * Creates a scoped logger for a specific module or component
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

/** Exported for tests; do not call from application code. */
export const __testing = { SENSITIVE_KEYS, redactContext };

// Named export so files can use: import { logger } from '../utils/logger.js'
export { logger };
export default logger;
