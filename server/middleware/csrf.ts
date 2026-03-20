/**
 * CSRF Protection Middleware
 * Uses double-submit cookie pattern — no additional dependencies required.
 *
 * How it works:
 * 1. Server sets a random CSRF token in a cookie (csrf_token)
 * 2. Client reads the cookie and sends it back as X-CSRF-Token header
 * 3. Server validates the header matches the cookie
 *
 * Safe methods (GET, HEAD, OPTIONS) are exempt.
 * Stripe webhooks (/api/billing/webhooks) are exempt (use signature verification).
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Paths exempt from CSRF (they have their own verification)
const EXEMPT_PATHS = [
  '/api/billing/webhooks',
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/enterprise/check-email',
  '/api/auth/enterprise/verify-password',
  '/api/auth/enterprise/verify-mfa',
  '/health',
  '/healthz',
  '/readyz',
  '/metrics',
];

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Always ensure a CSRF cookie exists
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = generateToken();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false, // Client JS must read this
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
  }

  // Safe methods don't need CSRF validation
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Exempt paths (webhooks, initial auth)
  const isExempt = EXEMPT_PATHS.some(p => req.path.startsWith(p));
  if (isExempt) {
    return next();
  }

  // Validate: header must match cookie
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER] as string;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({
      error: 'CSRF validation failed',
      message: 'Missing or invalid CSRF token. Include X-CSRF-Token header matching the csrf_token cookie.',
    });
    return;
  }

  // Rotate token after successful validation
  const newToken = generateToken();
  res.cookie(CSRF_COOKIE, newToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });

  next();
}

export default csrfProtection;
