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

// centralized error handler
export function errorHandler(err: any, _req: any, res: any, _next: any) {
  logger.error({ err }, 'unhandled_error');
  const code = err?.status || 500;
  res.status(code).json({ error: err?.message || 'Internal Server Error' });
}
