/**
 * CSRF Protection Middleware
 * Uses double-submit cookie pattern — no additional dependencies required.
 *
 * How it works:
 * 1. Server sets a random CSRF token in a cookie (csrf_token)
 * 2. Client reads the cookie and sends it back as X-CSRF-Token header
 * 3. Server validates the header matches the cookie (constant-time)
 *
 * Safe methods (GET, HEAD, OPTIONS) are exempt.
 * Stripe webhooks (/api/billing/webhooks) are exempt (use signature verification).
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOKEN_BYTES = 32;
const TOKEN_HEX_LENGTH = TOKEN_BYTES * 2;
const COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Paths exempt from CSRF (they have their own verification). Matched
// as exact path or as a directory prefix ending in '/'. Bare prefix
// matching (e.g. '/healthz' allowing '/healthzevil') is intentionally
// avoided to prevent crafted-path bypass of the exempt list.
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
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

function isExemptPath(path: string): boolean {
  for (const exempt of EXEMPT_PATHS) {
    if (path === exempt) return true;
    if (path.startsWith(exempt + '/')) return true;
  }
  return false;
}

function tokensMatch(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  // Reject anything that isn't a fixed-length hex token so
  // timingSafeEqual can't be probed with attacker-controlled lengths.
  if (a.length !== TOKEN_HEX_LENGTH) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // Client JS must read this
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Always ensure a CSRF cookie exists
  if (!req.cookies?.[CSRF_COOKIE]) {
    setCsrfCookie(res, generateToken());
  }

  // Safe methods don't need CSRF validation
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Exempt paths (webhooks, initial auth)
  if (isExemptPath(req.path)) {
    return next();
  }

  // Validate: header must match cookie (constant-time).
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];

  if (!tokensMatch(cookieToken, headerToken)) {
    res.status(403).json({
      error: 'CSRF validation failed',
      code: 'CSRF_VALIDATION_FAILED',
      message:
        'Missing or invalid CSRF token. Include X-CSRF-Token header matching the csrf_token cookie.',
    });
    return;
  }

  // Rotate token after successful validation
  setCsrfCookie(res, generateToken());

  next();
}

export default csrfProtection;
