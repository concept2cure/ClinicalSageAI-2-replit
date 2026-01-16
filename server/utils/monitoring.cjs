/**
 * Application Monitoring and Logging Utilities
 *
 * CommonJS implementation retained for legacy require() callers.
 * The ESM wrapper lives in `server/utils/monitoring.js`.
 */

const config = require('../config/environment.cjs').config;

// Create a simple structured logger
const createLogger = module => {
  const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  };

  // Get the current log level from environment or config
  const currentLogLevel = process.env.LOG_LEVEL || (config.isProduction ? 'info' : 'debug');
  const logLevelValue = logLevels[currentLogLevel] || logLevels.info;

  const log = (level, message, context = {}) => {
    if (logLevels[level] > logLevelValue) {
      return; // Skip logging if level is below current level
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...context,
        module,
      },
    };

    // In production, we could send this to a logging service
    if (level === 'error') {
      console.error(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }

    // Here we would add integrations with external monitoring services
    if (level === 'error' && process.env.SENTRY_DSN) {
      // Example: Sentry.captureException(new Error(message), { extra: context });
    }
  };

  return {
    error: (message, context) => log('error', message, context),
    warn: (message, context) => log('warn', message, context),
    info: (message, context) => log('info', message, context),
    debug: (message, context) => log('debug', message, context),
  };
};

// Simple performance monitoring
const createPerformanceMonitor = () => {
  const timers = new Map();

  return {
    // Start timing an operation
    startTimer: operationName => {
      timers.set(operationName, process.hrtime());
    },

    // End timing and get duration in ms
    endTimer: operationName => {
      const start = timers.get(operationName);
      if (!start) {
        return -1; // Timer not found
      }

      const hrtime = process.hrtime(start);
      const durationMs = hrtime[0] * 1000 + hrtime[1] / 1000000;
      timers.delete(operationName);
      return durationMs.toFixed(2);
    },
  };
};

// Request tracking for HTTP requests
const createRequestTracker = logger => {
  return (req, res, next) => {
    // Generate a unique request ID if not provided
    req.requestId =
      req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Add the request ID to response headers
    res.setHeader('X-Request-ID', req.requestId);

    // Mark request start time
    req.startTime = Date.now();

    // Log request start
    logger.debug(`${req.method} ${req.path} - Start`, {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      organizationId: req.organizationId,
    });

    // Log on request completion
    res.on('finish', () => {
      const duration = Date.now() - req.startTime;
      const level = res.statusCode >= 400 ? 'warn' : 'debug';

      logger[level](`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`, {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        organizationId: req.organizationId,
      });

      // Track slow requests for optimization
      if (duration > 1000) {
        logger.warn(`Slow request: ${req.method} ${req.path} - ${duration}ms`, {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          duration,
          organizationId: req.organizationId,
        });
      }
    });

    next();
  };
};

// Error tracking middleware
const errorTrackerMiddleware = logger => {
  return (err, req, res, next) => {
    const errorId = `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.error(`Error processing request: ${err.message}`, {
      errorId,
      requestId: req.requestId,
      stack: err.stack,
      path: req.path,
      method: req.method,
      organizationId: req.organizationId,
    });

    // In production, we'd also send this to error monitoring service
    if (process.env.SENTRY_DSN) {
      // Example: Sentry.captureException(err);
    }

    // Don't expose error details in production
    if (config.isProduction) {
      res.status(500).json({
        status: 'error',
        message: 'An unexpected error occurred',
        errorId, // Return error ID for support reference
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: err.message,
        stack: err.stack,
        errorId,
      });
    }
  };
};

module.exports = {
  createLogger,
  createPerformanceMonitor,
  createRequestTracker,
  errorTrackerMiddleware,
};
