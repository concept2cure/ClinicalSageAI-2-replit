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

// Create a simple logger that outputs to console
const baseLogger: Logger = {
  info: (message: string, context: LogContext = {}) => {
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message,
          context,
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
          context,
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
          context,
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
            context,
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
    info: (message: string, context: LogContext = {}) => {
      baseLogger.info(`[${scope}] ${message}`, context);
    },

    error: (message: string, context: LogContext = {}) => {
      baseLogger.error(`[${scope}] ${message}`, context);
    },

    warn: (message: string, context: LogContext = {}) => {
      baseLogger.warn(`[${scope}] ${message}`, context);
    },

    debug: (message: string, context: LogContext = {}) => {
      baseLogger.debug(`[${scope}] ${message}`, context);
    },
  };
}

// Alias for createScopedLogger to support different naming conventions
export const createContextLogger = createScopedLogger;

// Default logger instance for backward compatibility
const logger = baseLogger;

export default logger;
