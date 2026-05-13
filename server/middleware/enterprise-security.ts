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
import type { IncomingMessage, ServerResponse } from 'http';
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

/**
 * Per-request CSP nonce middleware. Stashes a 128-bit base64 nonce on
 * `res.locals.cspNonce` so:
 *   - the helmet CSP directive below can emit `'nonce-<value>'` in
 *     `script-src`, allowing the SPA's bundled module loader to run
 *     without needing `'unsafe-inline'`;
 *   - the HTML serving layer (server/vite.ts) can inject the same nonce
 *     into every `<script>` tag in index.html.
 *
 * Strict-dynamic propagates trust from the nonced loader to scripts it
 * imports, so we don't need to enumerate every chunk URL.
 */
export function cspNonce(req: Request, res: Response, next: NextFunction) {
  res.locals.cspNonce = randomBytes(16).toString('base64');
  next();
}

// Helmet types the directive function as (IncomingMessage, ServerResponse) so
// we have to match that exactly — Express's narrower types would fail TS's
// contravariant parameter check. The `as` cast at call time recovers locals.
const scriptSrcDirective = (_req: IncomingMessage, res: ServerResponse) => {
  const locals = (res as ServerResponse & { locals?: { cspNonce?: string } }).locals;
  return `'nonce-${locals?.cspNonce ?? ''}'`;
};

// In development, keep CSP report-only so HMR/Vite injections don't break
// the dev loop — violations still surface in the browser console where we
// can act on them. Production enforces.
/**
 * CSP violation report endpoint path. Browsers POST to this URL when a
 * directive is violated; the handler in server/routes/csp-report.ts logs
 * the report. Defined as a constant so the middleware directive and the
 * handler mount path stay in sync.
 */
export const CSP_REPORT_URI = '/api/csp-report';

/**
 * Reporting Endpoints group name. Referenced by the `report-to` CSP
 * directive and by the `Reporting-Endpoints` response header in
 * `permissionsPolicy`. Two layers because:
 *   - `report-uri` (legacy) — Firefox, Safari today.
 *   - `report-to` + `Reporting-Endpoints` (modern API) — Chrome/Edge.
 * Keeping both means reports land regardless of browser.
 */
export const CSP_REPORT_TO_GROUP = 'csp-endpoint';

export const securityHeaders = config.isDevelopment
  ? helmet({
      contentSecurityPolicy: {
        reportOnly: true,
        directives: {
          defaultSrc: ["'self'"],
          // Even in dev we drop 'unsafe-inline' from script-src so the
          // report-only signal is meaningful. Vite's dev HMR injects its
          // own scripts through its middleware — those get the nonce via
          // setupVite's transformIndexHtml hook.
          scriptSrc: ["'self'", scriptSrcDirective, "'strict-dynamic'", "'unsafe-eval'"],
          // Split style-src into elem (for <style> and <link>) and attr
          // (for inline style="..."). React style={{...}} props are the
          // pervasive case and stay allowed via style-src-attr; runtime
          // <style> injection from Tiptap/Radix is nonced by the boot-time
          // patch in client/src/cspNonce.ts.
          styleSrcElem: ["'self'", scriptSrcDirective, "'unsafe-inline'"],
          styleSrcAttr: ["'unsafe-inline'"],
          connectSrc: ["'self'", 'ws:', 'wss:', 'http://localhost:*'],
          imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
          frameSrc: ["'self'"],
          // Hardening directives (defense-in-depth, report-only in dev):
          //   base-uri locks <base href> so an injected element can't
          //     re-root every relative URL on the page.
          //   form-action restricts where forms can POST/GET, blocking
          //     phishing pages that inject a form into our DOM.
          //   frame-ancestors stops other origins from iframing the
          //     app — defense against clickjacking. Mirrors frameguard.
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'self'"],
          reportUri: [CSP_REPORT_URI],
          reportTo: [CSP_REPORT_TO_GROUP],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false, // Allow iframe embedding (Simple Browser)
      crossOriginResourcePolicy: false,
      hsts: false, // No HSTS in dev (no TLS locally)
      frameguard: false, // Allow iframes (VS Code Simple Browser)
      xssFilter: true,
    })
  : helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Hardened: per-request nonce + strict-dynamic. Drops both
          // 'unsafe-inline' and 'unsafe-eval' for scripts. The nonce is
          // injected into <script> tags by the HTML serving layer
          // (server/vite.ts), and strict-dynamic propagates trust to
          // imported chunks so we don't have to whitelist them.
          scriptSrc: ["'self'", scriptSrcDirective, "'strict-dynamic'"],
          // style-src split: elem requires a nonce (no 'unsafe-inline'),
          // attr keeps 'unsafe-inline' so React style={{...}} props work.
          // Runtime <style> injection from Tiptap/Radix is auto-nonced by
          // the boot-time createElement patch in client/src/cspNonce.ts.
          // Google Fonts stylesheet is loaded via <link> from index.html.
          styleSrcElem: [
            "'self'",
            scriptSrcDirective,
            'https://fonts.googleapis.com',
          ],
          styleSrcAttr: ["'unsafe-inline'"],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
          connectSrc: ["'self'", 'https://api.openai.com', 'https://*.neon.tech', 'wss:', 'ws:'],
          frameSrc: ["'self'"],
          objectSrc: ["'none'"],
          // Hardening directives (enforced in prod):
          //   base-uri 'self' blocks <base href> injection from rewriting
          //     every relative URL on the page.
          //   form-action 'self' confines form posts to our origin,
          //     killing phishing forms that an XSS could inject.
          //   frame-ancestors 'self' is the CSP-spec replacement for
          //     X-Frame-Options; defense against clickjacking.
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'self'"],
          upgradeInsecureRequests: [],
          reportUri: [CSP_REPORT_URI],
          reportTo: [CSP_REPORT_TO_GROUP],
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

/**
 * Permissions-Policy (formerly Feature-Policy) — opt out of browser
 * features we don't use. Reduces the blast radius of a successful XSS
 * by denying access to powerful APIs even after script execution.
 *
 * Defaults are restrictive; we explicitly allow clipboard-write on
 * self because the editor's "copy as markdown" / "copy citation"
 * actions need it. Everything else is `()` (disabled for all origins).
 */
export function permissionsPolicy(_req: Request, res: Response, next: NextFunction) {
  // Reporting-Endpoints — the modern Reporting API binding. CSP's
  // `report-to <group>` directive resolves to this URL. Browsers that
  // understand this header use it; older ones fall back to `report-uri`.
  // Single quoted-string form per spec.
  res.setHeader(
    'Reporting-Endpoints',
    `${CSP_REPORT_TO_GROUP}="${CSP_REPORT_URI}"`,
  );

  res.setHeader(
    'Permissions-Policy',
    [
      'accelerometer=()',
      'autoplay=()',
      'camera=()',
      'clipboard-read=()',
      'clipboard-write=(self)',
      'cross-origin-isolated=()',
      'display-capture=()',
      'encrypted-media=()',
      'fullscreen=(self)',
      'geolocation=()',
      'gyroscope=()',
      'hid=()',
      'idle-detection=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'payment=()',
      'picture-in-picture=()',
      'publickey-credentials-get=()',
      'screen-wake-lock=()',
      'serial=()',
      'sync-xhr=()',
      'usb=()',
      'web-share=()',
      'xr-spatial-tracking=()',
    ].join(', '),
  );
  next();
}

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
// ============================================================================

// Sanitize string to prevent XSS
function sanitizeString(value: string): string {
  if (typeof value !== 'string') return value;

  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .replace(/`/g, '&#96;');
  // NOTE: SQL keyword stripping removed — Drizzle ORM uses parameterized queries,
  // making regex-based SQL keyword removal unnecessary and harmful to legitimate content.
}

// Deep sanitize object
function sanitizeObject(obj: any, depth = 0): any {
  if (depth > 10) return obj; // Prevent infinite recursion

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }

  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip prototype pollution attempts
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        console.warn(`[SECURITY] Blocked prototype pollution attempt: ${key}`);
        continue;
      }
      sanitized[key] = sanitizeObject(value, depth + 1);
    }
    return sanitized;
  }

  return obj;
}

export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
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
    '/api/csp-report',
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
    // Detect and block header-based impersonation attempts.
    // Audit AND log: this is a security-significant event — a valid
    // JWT user actively trying to access another tenant's data. The
    // audit pipeline gives regulators an authoritative record;
    // logger.warn gives ops live visibility.
    if (headerOrgId && String(headerOrgId) !== String(user.organizationId)) {
      const impersonationDetail = {
        jwtOrg: user.organizationId,
        headerOrg: headerOrgId,
        userId: user.id || user.userId || 'unknown',
        path: req.path,
        method: req.method,
        ipAddress: req.ip,
      };
      // Fire-and-forget audit. Dynamic import keeps this middleware
      // free of a top-level audit-service dependency (which itself
      // imports DB code and would slow boot).
      (async () => {
        try {
          const { default: auditService } = await import('../services/auditService');
          await auditService.logAction({
            tenantId: user.organizationId,
            userId: user.id || user.userId,
            action: 'tenant_impersonation_attempt',
            resourceType: 'security_event',
            resourceId: String(headerOrgId),
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            details: impersonationDetail,
          });
        } catch {
          /* audit failure is non-fatal */
        }
      })();
      // Keep the structured-log line as well for ops dashboards.
      // eslint-disable-next-line no-console
      console.warn('[SECURITY] Tenant impersonation attempt blocked', impersonationDetail);
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
  const requestId = (req.headers['x-request-id'] as string) || randomBytes(8).toString('hex');

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

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = (req.headers['x-request-id'] as string) || randomBytes(16).toString('hex');
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
/**
 * Fire-and-forget audit-event writer for security middleware. Dynamic
 * import of auditService keeps boot fast and avoids a cycle between
 * security middleware and the service that depends on the DB pool.
 */
function auditSecurityEvent(
  req: Request,
  action: string,
  details: Record<string, unknown>,
): void {
  (async () => {
    try {
      const { default: auditService } = await import('../services/auditService');
      const user = (req as any).user;
      await auditService.logAction({
        tenantId: user?.organizationId,
        userId: user?.id ?? user?.userId,
        action,
        resourceType: 'security_event',
        resourceId: req.path,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        details,
      });
    } catch {
      /* audit failure is non-fatal for security middleware */
    }
  })();
}

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
    // Audit + log. Repeated CSRF failures from a single IP suggest
    // active attack; recording them gives SOC visibility and gives
    // regulators a queryable surface for the failure rate.
    auditSecurityEvent(req, 'csrf_validation_failed', {
      reason: 'no_origin_no_referer_no_bearer',
      method: req.method,
    });
    // eslint-disable-next-line no-console
    console.warn(
      `[SECURITY] CSRF: state-changing request without Origin/Referer/Bearer on ${req.path}`
    );
    return res.status(403).json({ error: 'Forbidden', code: 'CSRF_VALIDATION_FAILED' });
  }

  if (
    !config.allowedOrigins.includes(source) &&
    !(source.endsWith('.app.github.dev') && !config.isProduction)
  ) {
    auditSecurityEvent(req, 'csrf_validation_failed', {
      reason: 'origin_mismatch',
      method: req.method,
      origin: source,
    });
    // eslint-disable-next-line no-console
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

  // CSP nonce — must run before securityHeaders so the directive function
  // can read res.locals.cspNonce.
  app.use(cspNonce);

  // Security headers (must be first after HTTPS)
  app.use(securityHeaders);

  // Permissions-Policy — runs after CSP so it can't shadow any of the
  // helmet-emitted headers. Deny most browser features by default.
  app.use(permissionsPolicy);

  // Request ID for correlation
  app.use(requestId);

  // CORS
  app.use(corsMiddleware);

  // Global rate limit — removed: Redis rate limiter on /api (in index.ts) provides
  // category-based limits with persistence across restarts. Keeping per-path limiters below
  // for defense-in-depth on sensitive endpoints.

  // Input sanitization
  app.use(sanitizeInput);

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
  cspNonce,
  permissionsPolicy,
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
