// Stub for observability middleware
import { randomUUID } from 'crypto';

export const logger = {
  info: console.log,
  error: console.error,
  warn: console.warn,
  debug: console.debug,
};

function pinoHttp(options?: any) {
  return (req: any, res: any, next: any) => next();
}

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req: any) => req.headers['x-request-id'] || randomUUID(),
  customSuccessMessage: (req: any, res: any) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req: any, res: any, err: any) =>
    `ERR ${req.method} ${req.url} ${res.statusCode}: ${err?.message}`,
});

// Centralized error handler — consistent { error: { code, message, ... } } format
export function errorHandler(err: any, req: any, res: any, next: any) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err?.statusCode || err?.status || 500;
  const errorCode = err?.code || (statusCode >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR');
  const message = statusCode >= 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : (err?.message || 'Internal server error');

  if (statusCode >= 500) {
    logger.error({ err, path: req.path, method: req.method }, 'unhandled_error');
  } else {
    logger.warn({ path: req.path, method: req.method, code: errorCode, message }, 'client_error');
  }

  res.status(statusCode).json({
    error: {
      code: errorCode,
      message,
      path: req.path,
      timestamp: new Date().toISOString(),
    },
  });
}
