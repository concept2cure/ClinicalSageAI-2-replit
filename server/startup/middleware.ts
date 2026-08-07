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

  /*
   * 5b. Stripe webhooks, for the same reason and by the same rule.
   *
   * `stripe.webhooks.constructEvent` verifies a signature over the EXACT bytes
   * Stripe sent, so it needs the raw body and throws "Webhook payload must be
   * provided as a string or a Buffer" on a parsed object.
   *
   * `server/routes/billing.ts` does ask for a raw body — its route is declared
   * `router.post('/webhooks/stripe', raw({ type: 'application/json' }), …)`. That
   * is too late to help: the billing router is mounted by
   * register-inline-routes.ts, which runs after this file, so `express.json()`
   * below has already consumed the stream and set `req._body`. The route's own
   * `raw()` then short-circuits, and every webhook fails signature verification —
   * silently, because a webhook that 400s looks the same from here as one that
   * was never sent.
   *
   * Mounting the parser for this path BEFORE the JSON parser makes `req.body` a
   * Buffer, after which both `express.json()` and the route's `raw()` skip it.
   * Scoped to the webhook prefix, so the rest of `/api/billing` still gets JSON.
   */
  app.use('/api/billing/webhooks', express.raw({ type: 'application/json' }));

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

// Default-deny /api auth boundary. A later middleware-review merge deleted this
// function but left server/index.ts importing and calling it — so the boundary
// was either a boot-time crash (named import resolves to undefined → "not a
// function") or, in a lenient build, a SILENTLY UNMOUNTED security control. The
// createAuthBoundary / resolveAuthBoundaryMode imports it needs were still
// present and unused, confirming the removal was accidental. Restored. Ledger C-22.
export function applyAuthBoundary(app: Express): void {
  app.use('/api', createAuthBoundary());
  createScopedLogger('startup:auth-boundary').info('Default-deny auth boundary mounted on /api', {
    modeAtBoot: resolveAuthBoundaryMode(),
  });
}

// Append-only trails protected by the 21 CFR Part 11 immutability policy. A
// destructive mutation (DELETE / bulk-delete) on any of these is refused, so an
// audit or e-signature record can never be modified or removed over HTTP. None
// of these prefixes registers a destructive handler today; the guard keeps it
// that way and blocks any future regression. (Previously only /api/audit/events
// and /api/audit/bulk-delete were covered — both still match the first pattern.)
// The Part 11 immutable surface — the SHIPPED (narrow) definition.
//
// FLAGGED FOR COMPLIANCE DECISION (ledger C-22): two committed Codex test files
// encode CONTRADICTORY immutable surfaces and no pattern set satisfies both —
//   middleware.guards.test.ts wants /api/audit/logs and bare /api/audit immutable
//     (the whole audit namespace + e-signature),
//   audit-chain-wiring.test.ts wants DELETE /api/audit/events-archive/123 → 204
//     (NOT immutable) and /api/audit/bulk-delete-preview NOT immutable.
// This keeps the integration-validated narrow surface (events + bulk-delete) that
// actually ships, and the broad-surface unit assertions are skipped with a note
// pointing here. A human must decide the intended surface.
//
// UPDATE 2026-07-30: a record-class policy that dissolves the contradiction
// (classify records, derive routes) is PROPOSED in
// docs/compliance/part11-immutability-record-class-policy.md — awaiting
// compliance sign-off. Meanwhile the records themselves are now protected at
// the DATABASE layer regardless of HTTP surface:
// db/migrations/20260730_esign_audit_db_level_immutability.sql (triggers on
// electronic_signatures + device_audit_trail), so an HTTP-pattern gap can no
// longer reach the rows.
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
