/**
 * Simple logger utility for the application
 */

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

const redactValue = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return '[REDACTED]';
  if (typeof value === 'object') return '[REDACTED]';
  return '[REDACTED]';
};

const redactContext = (context, depth = 0) => {
  if (!context || typeof context !== 'object') return context;
  if (depth > 6) return context;

  const output = Array.isArray(context) ? [] : {};
  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase();
    const shouldRedact = SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive));

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

/**
 * Creates a scoped logger for a specific module or component
 *
 * @param {string} scope The scope/name of the module using the logger
 * @returns A logger instance that includes the scope in all messages
 */
export const createScopedLogger = (scope) => ({
  info: (message, context = {}) => baseLogger.info(`[${scope}] ${message}`, context),
  error: (message, context = {}) => baseLogger.error(`[${scope}] ${message}`, context),
  warn: (message, context = {}) => baseLogger.warn(`[${scope}] ${message}`, context),
  debug: (message, context = {}) => baseLogger.debug(`[${scope}] ${message}`, context),
});

export const createContextLogger = createScopedLogger;

const logger = baseLogger;

export default logger;
