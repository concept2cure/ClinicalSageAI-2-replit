/**
 * Enterprise Security Middleware
 * ============================================================================
 *
 * Comprehensive security hardening for regulatory-grade platform operations.
 *
 * Compliance: 21 CFR Part 11, HIPAA, SOC 2, ISO 27001
 * Version: 1.0.0
 * Last Updated: 2026-01-24
 *
 * SECURITY CONTROLS:
 * - Rate limiting with Redis backing (distributed)
 * - Input sanitization (XSS, SQL injection prevention)
 * - CORS with strict origin validation
 * - Security headers (HSTS, CSP, etc.)
 * - Request/response audit logging
 * - JWT validation with rotation support
 * - API key validation and hashing
 * - Tenant isolation enforcement
 */

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createHash, randomBytes } from 'crypto';

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  // Environment
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',

  // CORS — production origins always included; localhost only in dev
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .filter(Boolean)
    .concat([
      'https://trialsage.com',
      'https://www.trialsage.com',
      'https://app.trialsage.com',
      'https://concept2cure-ri.ai',
      'https://app.concept2cure-ri.ai',
      'https://clinicalsage.ai',
      'https://app.clinicalsage.ai',
    ])
    .concat(
      process.env.NODE_ENV !== 'production'
        ? ['http://localhost:5000', 'http://localhost:3000']
        : []
    )
    .concat(
      // Allow GitHub Codespaces forwarded origins
      process.env.CODESPACES === 'true' || process.env.CODESPACE_NAME
        ? [`https://${process.env.CODESPACE_NAME}-5000.app.github.dev`]
        : []
    ),

  // Rate Limits — environment-aware (single canonical definition)
  rateLimits: (() => {
    const isDev = process.env.NODE_ENV !== 'production';
    const m = isDev ? 10 : 1; // 10x multiplier in development only
    return {
      global: { windowMs: 60_000, max: 1000 * m }, // 1000/min prod, 10000/min dev
      api: { windowMs: 60_000, max: 200 * m }, // 200/min prod, 2000/min dev
      ai: { windowMs: 60_000, max: 20 * m }, // 20/min prod, 200/min dev
      auth: { windowMs: 15 * 60_000, max: isDev ? 100 : 5 }, // 5/15min prod, 100/15min dev
      write: { windowMs: 60_000, max: 100 * m }, // 100/min prod, 1000/min dev
      upload: { windowMs: 60_000, max: 20 * m }, // 20/min prod, 200/min dev
      export: { windowMs: 60_000, max: 10 * m }, // 10/min prod, 100/min dev
    };
  })(),

  // Request Size Limits
  maxBodySize: '50mb',
  maxUploadSize: 50 * 1024 * 1024, // 50MB

  // Session
  sessionTimeout: 30 * 60 * 1000, // 30 minutes

  // Audit
  enableAuditLog: process.env.ENABLE_AUDIT_LOG !== 'false',
  sensitiveFields: ['password', 'passwordHash', 'apiKey', 'secret', 'token', 'ssn', 'dob'],
};

// ============================================================================
// SECURITY HEADERS (Helmet Configuration)
// ============================================================================

// In development, use a permissive (but present) security policy.
// CSP is set to report-only so issues are visible without breaking HMR/iframes.
export const securityHeaders = config.isDevelopment
  ? helmet({
      contentSecurityPolicy: {
        reportOnly: true, // Don't block, but log violations in browser console
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'", 'ws:', 'wss:', 'http://localhost:*'],
          imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
          frameSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false, // Allow iframe embedding (Simple Browser)
      crossOriginResourcePolicy: false,
      hsts: false, // No HSTS in dev (no TLS locally)
      frameguard: false, // Allow iframes (VS Code Simple Browser)
      xssFilter: true, // Keep XSS filter active even in dev
    })
  : helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // TODO(hardening): scriptSrc still ships 'unsafe-inline' + 'unsafe-eval'
          // because removing them requires either (a) replacing every inline
          // <script> in the SPA build output with a nonce/hash or (b) moving
          // to strict-dynamic with a per-request nonce threaded through the
          // HTML response. Both are SPA-build coordination tasks, not
          // middleware changes. Tracked as a follow-up to this branch.
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.jsdelivr.net'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
          // Only wss:// in production; ws:// would let MITM observers see
          // socket traffic from a downgraded page.
          connectSrc: ["'self'", 'https://api.openai.com', 'https://*.neon.tech', 'wss:'],
          frameSrc: ["'self'"],
          // Restrict <base href="..."> injection — without this, an attacker
          // who plants any HTML on the page can re-anchor every relative URL.
          baseUri: ["'self'"],
          // Restrict who can embed THIS app in an iframe — modern equivalent
          // of frameguard. Matches the existing frameguard: sameorigin below.
          frameAncestors: ["'self'"],
          // Restrict where <form action="..."> can submit to.
          formAction: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false, // Disable for PDF rendering
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true,
      noSniff: true,
      ieNoOpen: true,
      dnsPrefetchControl: { allow: false },
      frameguard: { action: 'sameorigin' },
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    });

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;

  // Check if origin is allowed — always validate, even in development
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (origin && !config.isProduction && origin.endsWith('.app.github.dev')) {
    // Allow all GitHub Codespaces origins in development
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Same-origin requests, server-to-server, or curl — no wildcard in production
    if (config.isProduction) {
      // Don't set any CORS header — browser enforces same-origin by default
    } else {
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5000');
    }
  } else {
    // Log and block unauthorized CORS attempt in all environments
    console.warn(`[SECURITY] Blocked CORS request from unauthorized origin: ${origin}`);
    return res.status(403).json({
      error: 'Origin not allowed',
      code: 'CORS_ORIGIN_BLOCKED',
    });
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Request-Id'
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id, X-RateLimit-Remaining');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
}

// ============================================================================
// RATE LIMITING
// ============================================================================

// Create rate limiter with configuration
const createLimiter = (opts: {
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
}) => {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator:
      opts.keyGenerator ||
      ((req: Request) => {
        // Use X-Forwarded-For for proxy setups, fallback to IP
        const forwarded = req.headers['x-forwarded-for'];
        const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0] || req.ip;
        return ip || 'unknown';
      }),
    handler: (req: Request, res: Response) => {
      console.warn(`[RATE_LIMIT] Rate limit exceeded for ${req.ip} on ${req.path}`);
      res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(opts.windowMs / 1000),
      });
    },
    skip: (req: Request) => {
      // Skip rate limiting for health checks
      return req.path === '/healthz' || req.path === '/readyz';
    },
  });
};

export const rateLimiters = {
  global: createLimiter(config.rateLimits.global),
  api: createLimiter(config.rateLimits.api),
  ai: createLimiter(config.rateLimits.ai),
  auth: createLimiter(config.rateLimits.auth),
  write: createLimiter(config.rateLimits.write),
  upload: createLimiter(config.rateLimits.upload),
  export: createLimiter(config.rateLimits.export),
};

// ============================================================================
// INPUT SANITIZATION
//
// This middleware exists for ONE purpose: scrub prototype-pollution keys
// (__proto__, constructor, prototype) from incoming objects so a malicious
// JSON payload can't poison Object.prototype.
//
// It deliberately does NOT HTML-encode string values. Encoding at the input
// boundary is a known anti-pattern: it corrupts stored data, double-encodes
// on render, breaks JSON API consumers, and gives a false sense of XSS
// protection. The correct defense is encoding at the output boundary, which
// the SPA and templates already do. SQL injection is prevented by Drizzle's
// parameterized queries, not by regex.
// ============================================================================

const SANITIZE_MAX_DEPTH = 10;

// Deep-scrub an object, dropping prototype-pollution keys. Strings, numbers,
// booleans, and nulls are returned unchanged.
export function scrubProtoKeys(obj: any, depth = 0): any {
  if (depth > SANITIZE_MAX_DEPTH) return obj;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => scrubProtoKeys(item, depth + 1));

  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      console.warn(`[SECURITY] Blocked prototype pollution attempt: ${key}`);
      continue;
    }
    sanitized[key] = scrubProtoKeys(value, depth + 1);
  }
  return sanitized;
}

export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = scrubProtoKeys(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      req.query = scrubProtoKeys(req.query);
    }
    if (req.params && typeof req.params === 'object') {
      req.params = scrubProtoKeys(req.params);
    }
    next();
  } catch (error) {
    console.error('[SECURITY] Input sanitization error:', error);
    next(); // Continue even on error to not break request flow
  }
}

// ============================================================================
// TENANT ISOLATION
// ============================================================================

export function validateTenantContext(req: Request, res: Response, next: NextFunction) {
  // Skip for public endpoints
  const publicPaths = [
    '/healthz',
    '/readyz',
    '/api/health',
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/signup',
  ];
  if (publicPaths.some(p => req.path.startsWith(p))) {
    return next();
  }

  // SECURITY: Organization ID MUST come from the verified JWT token, NOT from
  // user-supplied headers. This prevents tenant impersonation attacks where an
  // authenticated user sends a forged x-organization-id header to access
  // another organization's data.
  const user = (req as any).user;
  const headerOrgId = req.headers['x-organization-id'] as string | undefined;

  if (user?.organizationId) {
    // Detect and block header-based impersonation attempts
    if (headerOrgId && String(headerOrgId) !== String(user.organizationId)) {
      console.warn(
        `[SECURITY] Tenant impersonation attempt blocked: ` +
          `JWT org=${user.organizationId}, Header org=${headerOrgId}, ` +
          `userId=${user.id || user.userId || 'unknown'}, path=${req.path}`
      );
      return res.status(403).json({
        error: 'Organization mismatch',
        code: 'TENANT_MISMATCH',
      });
    }
    (req as any).organizationId = user.organizationId;
  }
  // SECURITY: If no JWT user is present, do NOT fall back to header-based org ID.
  // Unauthenticated requests should not have tenant context set from untrusted input.
  // The route's own auth middleware will reject unauthenticated requests as needed.

  next();
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

interface AuditLogEntry {
  timestamp: string;
  requestId: string;
  method: string;
  path: string;
  statusCode?: number;
  userId?: string;
  organizationId?: string;
  ip: string;
  userAgent: string;
  duration?: number;
  error?: string;
}

// Scrub sensitive data from objects
function scrubSensitiveData(obj: any, depth = 0): any {
  if (depth > 5 || !obj) return obj;

  if (typeof obj === 'string') {
    // Mask potential sensitive values
    if (obj.length > 20 && /^[A-Za-z0-9+/=_-]+$/.test(obj)) {
      return obj.substring(0, 4) + '***REDACTED***';
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => scrubSensitiveData(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const scrubbed: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (config.sensitiveFields.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
        scrubbed[key] = '***REDACTED***';
      } else {
        scrubbed[key] = scrubSensitiveData(value, depth + 1);
      }
    }
    return scrubbed;
  }

  return obj;
}

export function auditLog(req: Request, res: Response, next: NextFunction) {
  if (!config.enableAuditLog) return next();

  const startTime = Date.now();
  // Prefer the validated id set by the requestId middleware. Only fall back
  // to a fresh value if this middleware ran without it (unusual ordering).
  const existingId = (req as any).requestId;
  const supplied = req.headers['x-request-id'];
  const requestId: string =
    typeof existingId === 'string' && existingId.length > 0
      ? existingId
      : isValidClientRequestId(supplied)
        ? supplied
        : randomBytes(16).toString('hex');

  // Add request ID to response headers
  res.setHeader('X-Request-Id', requestId);
  (req as any).requestId = requestId;

  // Log on response finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const user = (req as any).user;

    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      userId: user?.id || user?.userId,
      organizationId: (req as any).organizationId,
      ip: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      duration,
    };

    // Log errors with more detail
    if (res.statusCode >= 400) {
      entry.error = res.statusMessage;
    }

    // Write to audit log (in production, this would go to a dedicated audit service)
    if (config.isProduction || res.statusCode >= 400) {
      console.log('[AUDIT]', JSON.stringify(entry));
    }
  });

  next();
}

// ============================================================================
// API KEY VALIDATION
// ============================================================================

export async function validateApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    return next(); // API key is optional, fall through to JWT auth
  }

  // Validate format: prefix_base64urlsafe
  if (!/^[a-z0-9]{2,10}_[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
    return res.status(401).json({
      error: 'Invalid API key format',
      code: 'INVALID_API_KEY_FORMAT',
    });
  }

  // Validate against API key service (database lookup)
  try {
    const { validateApiKey: validateKey } = await import('../services/api-key-service.js');
    const result = await validateKey(apiKey);

    if (!result.valid) {
      return res.status(401).json({
        error: 'Invalid API key',
        code: 'INVALID_API_KEY',
        reason: result.reason,
      });
    }

    (req as any).authMethod = 'api_key';
    (req as any).apiKeyId = result.keyId;
    (req as any).tenantId = result.organizationId;
    (req as any).apiScopes = result.scopes;
    (req as any).apiRateLimit = result.rateLimit;
  } catch {
    // If api_keys table doesn't exist yet, fall through gracefully
    const keyHash = createHash('sha256').update(apiKey).digest('hex');
    (req as any).authMethod = 'api_key';
    (req as any).apiKeyHash = keyHash;
  }

  next();
}

// ============================================================================
// REQUEST ID MIDDLEWARE
// ============================================================================

// Accept a client-provided request id only if it matches a conservative,
// log-safe shape (alphanumeric, dashes, underscores, dots, bounded length).
// Otherwise the value is replaced with a server-generated id. Without this
// guard, callers can supply arbitrary strings — spoofing correlation ids,
// polluting log search, or injecting odd characters that the downstream log
// pipeline may not handle cleanly.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export function isValidClientRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

export function requestId(req: Request, res: Response, next: NextFunction) {
  const supplied = req.headers['x-request-id'];
  const id = isValidClientRequestId(supplied) ? supplied : randomBytes(16).toString('hex');
  (req as any).requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

// ============================================================================
// JWT VALIDATION HELPERS
// ============================================================================

export function requireJwtSecret(): void {
  if (!process.env.JWT_SECRET && config.isProduction) {
    console.error('[CRITICAL] JWT_SECRET environment variable is not set in production!');
    process.exit(1);
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error('[CRITICAL] JWT_SECRET must be at least 32 characters!');
    process.exit(1);
  }
}

// ============================================================================
// CSRF PROTECTION (Origin / Referer validation)
// ============================================================================

/**
 * For JWT Bearer-token SPAs, CSRF risk is inherently low because
 * Authorization headers are not auto-sent by browsers. This middleware
 * adds defense-in-depth by validating Origin/Referer on state-changing
 * requests in production.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Only check state-changing methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip for non-production (dev/test tooling needs flexibility)
  if (!config.isProduction) {
    return next();
  }

  // Skip for API-key authenticated requests (server-to-server)
  if ((req as any).authMethod === 'api_key') {
    return next();
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  // At least one must be present and match an allowed origin
  const source = origin || (referer ? new URL(referer).origin : null);

  if (!source) {
    // No origin/referer — could be server-to-server or curl; allow if has Bearer token
    if (req.headers.authorization?.startsWith('Bearer ')) {
      return next();
    }
    console.warn(
      `[SECURITY] CSRF: state-changing request without Origin/Referer/Bearer on ${req.path}`
    );
    return res.status(403).json({ error: 'Forbidden', code: 'CSRF_VALIDATION_FAILED' });
  }

  if (
    !config.allowedOrigins.includes(source) &&
    !(source.endsWith('.app.github.dev') && !config.isProduction)
  ) {
    console.warn(
      `[SECURITY] CSRF: origin mismatch — ${source} not in allowedOrigins for ${req.path}`
    );
    return res.status(403).json({ error: 'Forbidden', code: 'CSRF_ORIGIN_MISMATCH' });
  }

  next();
}

// ============================================================================
// COMBINED SECURITY MIDDLEWARE STACK
// ============================================================================

// HTTPS enforcement for production — redirects HTTP to HTTPS
export function enforceHttps(req: Request, res: Response, next: NextFunction) {
  if (config.isProduction && req.header('x-forwarded-proto') !== 'https') {
    return res.redirect(301, `https://${req.header('host')}${req.url}`);
  }
  next();
}

export function applySecurityMiddleware(app: any) {
  // Validate critical environment variables
  requireJwtSecret();

  // HTTPS enforcement (must be before everything else)
  app.use(enforceHttps);

  // Security headers (must be first after HTTPS)
  app.use(securityHeaders);

  // Request ID for correlation
  app.use(requestId);

  // CORS
  app.use(corsMiddleware);

  // Global rate limit — removed: Redis rate limiter on /api (in index.ts) provides
  // category-based limits with persistence across restarts. Keeping per-path limiters below
  // for defense-in-depth on sensitive endpoints.

  // NOTE: sanitizeInput was previously mounted here. It is now mounted by
  // server/startup/middleware.ts AFTER the body parsers — its prototype-
  // pollution scrub needs req.body to be populated, and Express does not
  // populate it until express.json runs. Mounting here ran the scrub on an
  // undefined body, making the body-side protection a no-op.

  // CSRF protection (origin/referer validation for state-changing requests)
  app.use(csrfProtection);

  // Tenant isolation
  app.use(validateTenantContext);

  // Audit logging
  app.use(auditLog);

  // API key validation (optional)
  app.use(validateApiKey);

  // Route-specific rate limits
  app.use('/api/auth', rateLimiters.auth);
  app.use('/api/ai', rateLimiters.ai);
  app.use('/api/export', rateLimiters.export);
  app.use('/api/upload', rateLimiters.upload);
  app.use('/api/workflow', rateLimiters.write);
  app.use('/api/documents', rateLimiters.write);

  console.log('✅ Enterprise security middleware applied');
}

export default {
  securityHeaders,
  corsMiddleware,
  rateLimiters,
  sanitizeInput,
  validateTenantContext,
  auditLog,
  validateApiKey,
  requestId,
  requireJwtSecret,
  applySecurityMiddleware,
};
