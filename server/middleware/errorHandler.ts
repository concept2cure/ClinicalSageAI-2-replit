/**
 * Error Handling Middleware for TrialSage
 *
 * Provides consistent error handling, logging, and response formatting
 * for all application errors.
 */
import { Request, Response, NextFunction } from 'express';
import { createContextLogger } from '../utils/logger';

const logger = createContextLogger({ module: 'error-handler' });

// Custom error class with status code
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';

    // Ensure stack trace preserves prototype chain for proper instanceof checks
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }
}

/**
 * Formats HTTP error responses consistently
 */
function formatError(error: any, req: Request) {
  // Default values
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';
  const errorCode = error.code || 'UNKNOWN_ERROR';

  // Return formatted error response
  return {
    error: {
      status: statusCode,
      code: errorCode,
      message,
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString(),
      request_id: (req as any).id,
      details: error.details || undefined,
    },
  };
}

/**
 * Main error handler middleware
 */
export function errorHandler(error: any, req: Request, res: Response, next: NextFunction) {
  // Skip if headers already sent
  if (res.headersSent) {
    return next(error);
  }

  // Prevent app crash on unhandled promise rejections or FATAL errors
  if (
    error instanceof Error &&
    (error.message.includes('FATAL') || error.stack?.includes('unhandledRejection'))
  ) {
    logger.error(`CRITICAL ERROR PREVENTED: ${error.message}`, {
      stack: error.stack,
      request_id: (req as any).id,
      request_path: req.path,
      request_method: req.method,
    });

    // Create a more friendly error for response
    error = new ApiError(
      500,
      'The service encountered an unexpected error and has been protected from shutdown',
      'PROTECTED_SERVER_ERROR'
    );
  }

  // Determine status code
  const statusCode = error.statusCode || 500;
  const errorResponse = formatError(error, req);

  // Log error with appropriate level based on severity
  if (statusCode >= 500) {
    logger.error(`Server error in ${req.method} ${req.path}`, {
      statusCode,
      error: error.message,
      stack: error.stack,
      request_id: (req as any).id,
      details: error.details || undefined,
    });
  } else if (statusCode >= 400) {
    logger.warn(`Client error in ${req.method} ${req.path}`, {
      statusCode,
      error: error.message,
      request_id: (req as any).id,
    });
  }

  // Send consistent response format
  res.status(statusCode).json(errorResponse);
}

/**
 * Not found handler middleware
 */
export function notFoundHandler(req: Request, res: Response) {
  const error = new ApiError(404, `Resource not found: ${req.path}`, 'NOT_FOUND');
  errorHandler(error, req, res, () => {});
}

/**
 * Async handler wrapper to catch Promise rejections
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create a validation error
 */
export function createValidationError(message: string, details: any) {
  return new ApiError(400, message, 'VALIDATION_ERROR', details);
}

/**
 * Create an authorization error
 */
export function createAuthError(message = 'Unauthorized access') {
  return new ApiError(401, message, 'UNAUTHORIZED');
}

/**
 * Create a forbidden error
 */
export function createForbiddenError(message = 'Access forbidden') {
  return new ApiError(403, message, 'FORBIDDEN');
}

/**
 * Create a not found error
 */
export function createNotFoundError(resource = 'Resource') {
  return new ApiError(404, `${resource} not found`, 'NOT_FOUND');
}

/**
 * Create a conflict error
 */
export function createConflictError(message: string) {
  return new ApiError(409, message, 'CONFLICT');
}

/**
 * Create a rate limit error
 */
export function createRateLimitError(message = 'Too many requests') {
  return new ApiError(429, message, 'RATE_LIMIT_EXCEEDED');
}

/**
 * Create a server error
 */
export function createServerError(message = 'Internal server error') {
  return new ApiError(500, message, 'SERVER_ERROR');
}

/**
 * Create a service unavailable error
 */
export function createServiceUnavailableError(message = 'Service temporarily unavailable') {
  return new ApiError(503, message, 'SERVICE_UNAVAILABLE');
}

export default errorHandler;
