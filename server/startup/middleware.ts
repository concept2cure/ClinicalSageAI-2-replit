/**
 * Middleware wiring for the Express app.
 *
 * Extracted from server/index.ts. Middleware order is LOAD-BEARING and
 * preserved exactly:
 *
 *   1. beta-ops telemetry (/api scope)
 *   2. fast-path health endpoints (see inline-endpoints.ts) — BEFORE security
 *   3. enterprise security (applySecurityMiddleware)
 *   4. redis rate limiter (/api scope)
 *   5. enterprise performance (applyPerformanceMiddleware)
 *   6. http structured logger (/api scope)
 *   7. firecrawl webhooks (raw-body-safe, BEFORE json parser)
 *   8. JSON + urlencoded parsers (/api scope; /api/concept2cure gets 50mb)
 *   9. beta route fence (/api scope)
 *  10. cookie parser
 *  11. immutability policy middleware (21 CFR Part 11)
 *  12. request debug logging (dev-only)
 *
 * applyAuthBoundary (exported separately) mounts the default-deny /api
 * authentication boundary. It is called from server/index.ts AFTER the
 * audit-trail observer (so boundary 401s are still recorded as
 * UNAUTHORIZED_ACCESS events) and BEFORE any route registration.
 */

import type { Express, NextFunction, Request, Response } from 'express';
import express from 'express';
import cookieParser from 'cookie-parser';
import { betaFlowTelemetryMiddleware } from '../middleware/betaFlowTelemetry';
import { applySecurityMiddleware, sanitizeInput } from '../middleware/enterprise-security.js';
import { applyPerformanceMiddleware } from '../middleware/enterprise-performance.js';
import { createRedisRateLimiter } from '../middleware/redisRateLimiter';
import { httpLogger } from '../src/mw/observability.js';
import { createBetaRouteFence, isBetaRouteFenceEnabled } from '../middleware/betaRouteFence';
import { createAuthBoundary, resolveAuthBoundaryMode } from '../middleware/authBoundary';
import firecrawlWebhooksRoutes from '../routes/firecrawl-webhooks';
import { createScopedLogger } from '../utils/logger';
import type { DebugLogger } from './types';

/**
 * Pre-health-endpoint middleware: just the telemetry tap that must see
 * every /api request. Fast-path health endpoints are mounted right after
 * this and before heavier middleware.
 */
export function applyTelemetryMiddleware(app: Express): void {
  app.use('/api', betaFlowTelemetryMiddleware);
}

/**
 * The bulk of the middleware stack that runs AFTER fast-path health endpoints
 * but BEFORE route registration. See module docstring for order rationale.
 */
export function applyCoreMiddleware(app: Express, debugLog: DebugLogger): void {
  // 1. Enterprise security (helmet, CORS, global rate limit, CSRF, input sanitization, org validation)
  applySecurityMiddleware(app);

  // 2. Redis-backed /api rate limiter (burst protection; layered on top of
  //    the global limiter installed by applySecurityMiddleware).
  const redisRateLimiter = createRedisRateLimiter();
  app.use('/api', redisRateLimiter);

  // 3. Enterprise performance middleware (compression, monitoring)
  applyPerformanceMiddleware(app);
  console.log('✅ Enterprise security and performance middleware enabled');

  // 4. Structured HTTP logging, scoped to /api (health/static short-circuit above).
  app.use('/api', httpLogger);

  // 5. Firecrawl webhooks — raw-body-safe, must come BEFORE the global JSON parser.
  app.use('/api/firecrawl-webhooks', firecrawlWebhooksRoutes);

  // 6. Body parsers. Concept2Cure routes get 50MB for base64 document bodies.
  app.use('/api/concept2cure', express.json({ limit: '50mb' }));
  app.use('/api', express.json({ limit: '2mb' }));
  app.use('/api', express.urlencoded({ extended: true, limit: '2mb' }));

  // 6b. Prototype-pollution scrub. MUST run after the body parsers —
  //     Express does not populate req.body until express.json /
  //     express.urlencoded execute, so mounting this any earlier (as
  //     applySecurityMiddleware used to) made the body-side scrub a
  //     silent no-op.
  app.use('/api', sanitizeInput);

  // 7. Beta route fence (mock/scaffold families blocked by default).
  app.use('/api', createBetaRouteFence());
  if (isBetaRouteFenceEnabled()) {
    console.log('🛡️ Guided beta route fence enabled for /api (mock/scaffold families blocked)');
  }

  // 8. Cookie parsing (required for CSRF double-submit pattern).
  app.use(cookieParser());

  // NOTE: CSRF protection is already applied by applySecurityMiddleware().
  // CORS, input sanitization, and organization validation are also handled there.

  // 9. Immutability policy — 21 CFR Part 11 audit trail protection.
  applyImmutabilityPolicy(app);
  debugLog('Immutability policy enforcement middleware installed');

  debugLog('Express middleware configured');
}

/**
 * Optional request logging for DEBUG mode. Request/query values are never
 * logged; only allowlisted transport metadata and query keys are retained.
 */
export function applyDebugRequestLogging(app: Express, debugLog: DebugLogger): void {
  app.use((req: Request, _res: Response, next) => {
    const isConcept2cureRoute = isConcept2cureApiRoute(req);
    debugLog(`${req.method} ${req.url}`, {
      headers: getDebugHeaderMetadata(req),
      query: getDebugQueryMetadata(req),
      body: undefined,
      bodyRedacted: true,
      bodyMetadata: getDebugBodyMetadata(req),
      concept2curePayload: isConcept2cureRoute,
    });
    next();
  });
}

// Append-only trails protected by the 21 CFR Part 11 immutability policy. A
// destructive mutation (DELETE / bulk-delete) on any of these is refused, so an
// audit or e-signature record can never be modified or removed over HTTP. None
// of these prefixes registers a destructive handler today; the guard keeps it
// that way and blocks any future regression. Scoped to precise event/bulk-delete
// paths so similarly named routes (e.g. /api/audit/events-archive) are unaffected
// — see audit-chain-wiring.test.ts for the exact boundary contract.
const IMMUTABLE_ROUTE_PATTERNS = [
  /^\/api\/audit\/events(?:\/|$)/, // Audit trail events — append-only
  /^\/api\/audit\/bulk-delete(?:\/|$)/, // Explicit bulk-delete block
];

export function applyImmutabilityPolicy(app: Express): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const isDestructive = isDestructiveAuditMutation(req);
    if (isDestructive) {
      const isImmutable = isImmutableAuditRoute(req.path);
      if (isImmutable) {
        console.warn(
          `[IMMUTABILITY] Blocked ${req.method} ${req.path} — audit records are append-only`
        );
        return res.status(403).json({
          error: 'IMMUTABILITY_VIOLATION',
          message:
            'This resource is protected by the immutability policy (21 CFR Part 11). Records can only be appended, never modified or deleted.',
          path: req.path,
          method: req.method,
        });
      }
    }
    next();
  });
}

export function isConcept2cureApiRoute(req: Pick<Request, 'originalUrl' | 'path' | 'url'>): boolean {
  const requestPath = req.originalUrl || req.path || req.url || '';
  return /^\/api\/concept2cure(?:\/|\?|$)/.test(requestPath);
}

/**
 * Mount the default-deny auth boundary on /api. The boundary re-resolves its
 * enforce/warn mode per request (so operators can flip AUTH_BOUNDARY_MODE without
 * a reboot); the startup-resolved mode is logged once for ops visibility. Public
 * paths (see authBoundary PUBLIC_API_ALLOWLIST) pass through.
 */
export function applyAuthBoundary(app: Express): void {
  const mode = resolveAuthBoundaryMode();
  console.info(`[AUTH_BOUNDARY] mounting default-deny /api boundary (startup mode: ${mode})`);
  app.use('/api', createAuthBoundary());
}

export function getDebugBodyMetadata(
  req: Pick<Request, 'method' | 'headers'>
): Record<string, unknown> | undefined {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) return undefined;
  return {
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    transferEncoding: req.headers['transfer-encoding'],
  };
}

const DEBUG_HEADER_ALLOWLIST = [
  'accept',
  'content-length',
  'content-type',
  'traceparent',
  'user-agent',
  'x-request-id',
] as const;

export function getDebugHeaderMetadata(
  req: Pick<Request, 'headers'>
): Record<string, string | string[] | undefined> {
  return Object.fromEntries(
    DEBUG_HEADER_ALLOWLIST.map(header => [header, req.headers[header]]).filter(
      ([, value]) => value !== undefined
    )
  );
}

export function getDebugQueryMetadata(
  req: Pick<Request, 'query'>
): { parameterCount: number; keys: string[] } {
  const keys = Object.keys(req.query).sort();
  return { parameterCount: keys.length, keys };
}

export function isDestructiveAuditMutation(req: Pick<Request, 'method' | 'path'>): boolean {
  const method = req.method.toUpperCase();
  return (
    ['DELETE', 'PUT', 'PATCH'].includes(method) ||
    (method === 'POST' && /(?:^|\/)bulk-delete(?:\/|$)/i.test(req.path))
  );
}

export function isImmutableAuditRoute(path: string): boolean {
  return IMMUTABLE_ROUTE_PATTERNS.some(pattern => pattern.test(path));
}
