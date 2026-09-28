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

/**
 * Personal data that is not secret but is still not for a log line: an e-mail
 * address or an IP address is masked wherever it appears as a string value
 * (security audit 2026-09-24, DP-26; GDPR Art. 5(1)(c) and 25). The mask keeps
 * what an operator needs to correlate — the first character and the domain of
 * an address, the network part of an IP — and drops the identifying rest.
 * Mirrors logger.ts; edit both.
 */
const MASK_SCAN_LIMIT = 2048;
const EMAIL_RE = /([A-Za-z0-9._%+-])([A-Za-z0-9._%+-]*)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const IPV4_RE = /\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b/g;
const IPV6_RE = /\b((?:[0-9a-f]{1,4}:){3})(?:[0-9a-f]{0,4}:?){1,5}\b/gi;

export const maskPersonalData = value => {
  if (value.length > MASK_SCAN_LIMIT) return value;
  let out = value;
  if (out.includes('@')) out = out.replace(EMAIL_RE, (_m, first, _rest, domain) => `${first}***@${domain}`);
  if (/\d\.\d/.test(out)) out = out.replace(IPV4_RE, '$1.xxx');
  if (out.includes(':') && /[0-9a-f]{1,4}:[0-9a-f]{1,4}:/i.test(out)) out = out.replace(IPV6_RE, '$1:xxxx');
  return out;
};

const redactValue = value => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return '[REDACTED]';
  if (typeof value === 'object') return '[REDACTED]';
  return '[REDACTED]';
};

/**
 * Walk the context tree replacing values under sensitive keys with
 * '[REDACTED]' and masking personal data in every other string. Recurses
 * into objects AND arrays up to depth 6. An array element has no key to
 * match against SENSITIVE_KEYS, so a string element is masked and an object
 * element is walked; before the security review of 2026-09-26 (DP-39)
 * arrays were passed through unscanned. Mirrors logger.ts; edit both.
 */
const redactContext = (context, depth = 0) => {
  if (!context || typeof context !== 'object') return context;
  if (depth > 6) return context;
  if (Array.isArray(context)) return context.map(item => maskValue(item, depth));

  const output = {};
  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase();
    const shouldRedact = SENSITIVE_KEYS.some(sensitive => lowerKey.includes(sensitive));
    output[key] = shouldRedact ? redactValue(value) : maskValue(value, depth);
  }
  return output;
};

/** A value under an ordinary key, or an array element: walked, masked, or passed through. */
function maskValue(value, depth) {
  if (value && typeof value === 'object') return redactContext(value, depth + 1);
  if (typeof value === 'string') return maskPersonalData(value);
  return value;
}

/**
 * The message is a string the caller composed, often by interpolation, and
 * it is masked like any other string (DP-39). A non-string message — a legacy
 * caller passing an object or an Error — is handed on as before; the logger
 * must not throw inside the request that is logging. Mirrors logger.ts.
 */
const maskMessage = message => (typeof message === 'string' ? maskPersonalData(message) : message);

// Create a simple logger that outputs to console
const baseLogger = {
  info: (message, context = {}) => {
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: maskMessage(message),
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
          message: maskMessage(message),
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
          message: maskMessage(message),
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
            message: maskMessage(message),
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
export const __testing = { SENSITIVE_KEYS, redactContext, maskPersonalData };

// Named export so files can use: import { logger } from '../utils/logger.js'
export { logger };
export default logger;
