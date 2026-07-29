/**
 * Application logger with HIPAA/pharma-aware redaction.
 *
 * Mirrors server/utils/logger.ts. The two files are kept in sync by
 * hand because much of the codebase imports the .js extension
 * explicitly. If you edit one, edit the other or the redaction list
 * drifts and PHI starts leaking into logs.
 *
 * SENSITIVE_KEYS is matched case-insensitively as a substring of the
 * key name, so `userPassword`, `currentPasswordHash`, `MRN`,
 * `bearerToken` are all caught by the corresponding base entries.
 */

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

const redactValue = value => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return '[REDACTED]';
  if (typeof value === 'object') return '[REDACTED]';
  return '[REDACTED]';
};

const redactContext = (context, depth = 0) => {
  if (!context || typeof context !== 'object') return context;
  if (depth > 6) return context;
  if (Array.isArray(context)) return context;

  const output = {};
  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase();
    const shouldRedact = SENSITIVE_KEYS.some(sensitive => lowerKey.includes(sensitive));

    if (shouldRedact) {
      output[key] = redactValue(value);
    } else if (value && typeof value === 'object') {
      output[key] = redactContext(value, depth + 1);
    } else {
      output[key] = value;
    }
  }
  return output;
};

// Create a simple logger that outputs to console
const baseLogger = {
  info: (message, context = {}) => {
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

  error: (message, context = {}) => {
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

  warn: (message, context = {}) => {
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

  debug: (message, context = {}) => {
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

export const createScopedLogger = scope => ({
  info: (message, context = {}) => baseLogger.info(`[${scope}] ${message}`, context),
  error: (message, context = {}) => baseLogger.error(`[${scope}] ${message}`, context),
  warn: (message, context = {}) => baseLogger.warn(`[${scope}] ${message}`, context),
  debug: (message, context = {}) => baseLogger.debug(`[${scope}] ${message}`, context),
});

export const createContextLogger = createScopedLogger;

const logger = baseLogger;

// Exported for parity with logger.ts; do not call from app code.
export const __testing = { SENSITIVE_KEYS, redactContext };

// Named export so files can use: import { logger } from '../utils/logger.js'
export { logger };
export default logger;
