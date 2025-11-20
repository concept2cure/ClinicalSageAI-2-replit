/**
 * Simple logger utility for the application
 */

// Create a simple logger that outputs to console
const logger = {
  info: (message, context = {}) => {
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

  error: (message, context = {}) => {
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

  warn: (message, context = {}) => {
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

  debug: (message, context = {}) => {
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

export default logger;
