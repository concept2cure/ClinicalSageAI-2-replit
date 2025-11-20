/**
 * Centralized Error Handler Middleware
 *
 * This middleware catches errors that occur during API request processing and
 * provides a consistent error response format to prevent server crashes.
 *
 * CRITICAL COMPONENT: This middleware is essential for application stability
 * and should not be removed or modified without thorough testing.
 */

import { Request, Response, NextFunction } from 'express';

interface ErrorWithStatusCode extends Error {
  statusCode?: number;
  code?: string;
}

interface ErrorLogStructure {
  timestamp: string;
  path: string | undefined; // Make path optional as it could be undefined in some contexts
  method: string;
  ip: string;
  error: {
    name: string;
    message: string;
    stack?: string | undefined;
  };
  requestId: string;
  tenant: any;
}

const errorHandler = (
  err: ErrorWithStatusCode,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('API Error:', err);

  // Create a structured error log for monitoring
  const errorLog: ErrorLogStructure = {
    timestamp: new Date().toISOString(),
    path: req.path || 'unknown_path', // Ensure path is never undefined
    method: req.method,
    ip: req.ip,
    error: {
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    },
    requestId: (req.headers['x-request-id'] as string) || 'unknown',
    tenant: (req as any).tenantContext || {},
  };

  // Log error details in development, but only summarized version in production
  if (process.env.NODE_ENV !== 'production') {
    console.error('Error details:', errorLog);
  } else {
    console.error(
      `Error processing ${req.method} ${req.path || 'unknown_path'}: ${err.name} - ${err.message}`
    );
  }

  // Determine appropriate status code based on error type
  let statusCode = err.statusCode || 500;

  // SQL errors, validation errors, and other common patterns
  if (err.code === '23505') {
    // PostgreSQL unique constraint violation
    statusCode = 409; // Conflict
  } else if (err.name === 'ValidationError') {
    statusCode = 400; // Bad Request
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401; // Unauthorized
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403; // Forbidden
  } else if (err.name === 'NotFoundError') {
    statusCode = 404; // Not Found
  }

  // Send a consistent error response
  res.status(statusCode).json({
    error: {
      message: err.message || 'An unexpected error occurred',
      code: err.code,
      status: statusCode,
      requestId: errorLog.requestId,
    },
  });
};

export default errorHandler;
