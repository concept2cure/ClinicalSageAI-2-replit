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
import firecrawlWebhooksRoutes from '../routes/firecrawl-webhooks';
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
  console.info('✅ Enterprise security and performance middleware enabled');

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
    console.info('🛡️ Guided beta route fence enabled for /api (mock/scaffold families blocked)');
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
 * Optional request logging for DEBUG mode. Body is redacted for
 * /api/concept2cure routes because they can carry large base64 payloads.
 */
export function applyDebugRequestLogging(app: Express, debugLog: DebugLogger): void {
  app.use((req: Request, _res: Response, next) => {
    const isConcept2cureRoute = isConcept2cureApiRoute(req);
    debugLog(`${req.method} ${req.url}`, {
      headers: req.headers,
      query: req.query,
      body: shouldLogRequestBody(req, isConcept2cureRoute) ? req.body : undefined,
      bodyRedacted: isConcept2cureRoute ? true : undefined,
    });
    next();
  });
}

// Append-only trails protected by the 21 CFR Part 11 immutability policy. A
// destructive mutation (DELETE / bulk-delete) on any of these is refused, so an
// audit or e-signature record can never be modified or removed over HTTP. None
// of these prefixes registers a destructive handler today; the guard keeps it
// that way and blocks any future regression. (Previously only /api/audit/events
// and /api/audit/bulk-delete were covered — both still match the first pattern.)
const IMMUTABLE_ROUTE_PATTERNS = [
  /^\/api\/audit(?:\/|$)/, // Audit trail: events, logs, signatures, exports — append-only (§11.10(e))
  /^\/api\/audit-logs(?:\/|$)/, // Legacy audit-logs read surface
  /^\/api\/audit-services(?:\/|$)/, // Audit services
  /^\/api\/mdx\/audit(?:\/|$)/, // MDX audit trail
  /^\/api\/esignature(?:\/|$)/, // Electronic-signature records — append-only (§11.70)
];

/**
 * True when a path addresses an append-only Part 11 trail (audit or
 * e-signature). Pure and exported so the immutability scope is unit-tested.
 */
export function isImmutableAuditPath(path: string): boolean {
  return IMMUTABLE_ROUTE_PATTERNS.some(pattern => pattern.test(path));
}

function applyImmutabilityPolicy(app: Express): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const isDestructive = isDestructiveAuditMutation(req);
    if (isDestructive) {
      const isImmutable = isImmutableAuditPath(req.path);
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

export function shouldLogRequestBody(
  req: Pick<Request, 'method'>,
  isConcept2cureRoute: boolean
): boolean {
  if (isConcept2cureRoute) return false;
  return !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
}

export function isDestructiveAuditMutation(req: Pick<Request, 'method' | 'path'>): boolean {
  return (
    req.method === 'DELETE' ||
    (req.method === 'POST' && /(?:^|\/)bulk-delete(?:\/|$)/i.test(req.path))
  );
}
