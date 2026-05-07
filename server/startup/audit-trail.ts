/**
 * Audit-trail middleware wiring.
 *
 * Mounts a request observer that writes a tamper-proof audit entry for
 * every mutating /api request (POST, PUT, PATCH, DELETE). Logging is
 * fire-and-forget on res.finish — it never blocks or fails a request.
 *
 * Gated by AUDIT_TRAIL_ENABLED=true. The TamperProofAuditLog requires a
 * provisioned `audit.tamper_proof_log` table (see TamperProofAuditLog.initialize());
 * we do NOT auto-DDL on boot to avoid surprising operators. When the flag
 * is unset, the middleware is a no-op and bootstrap logs that it was skipped.
 *
 * Compliance:
 *   FDA 21 CFR Part 11 §11.10(e) — secure, computer-generated, time-stamped
 *   audit trails for record-changing operations.
 *
 * Operator runbook (one-time, before flipping the flag):
 *   1. Ensure Postgres has the `audit` schema and `uuid-ossp` extension.
 *   2. Run TamperProofAuditLog.initialize() once (e.g. via a migration).
 *   3. Set AUDIT_HMAC_SECRET to a 32+ byte secret.
 *   4. Set AUDIT_TRAIL_ENABLED=true and restart.
 */

import type { Express, NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';
import {
  getTamperProofAuditLog,
  type AuditEventType,
} from '../lib/tamper-proof-audit';
import type { DebugLogger } from './types';

const SKIP_PATH_PATTERNS: RegExp[] = [
  /^\/api\/health/,
  /^\/api\/_health/,
  /^\/api\/diagnostics/,
  /^\/api\/audit\//, // audit reads/writes are logged by the audit subsystem itself
  /^\/api\/firecrawl-webhooks/, // raw-body route, separate audit path
];

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function eventTypeForRequest(req: Request, statusCode: number): AuditEventType {
  // Auth failures get a dedicated event so they're easy to query.
  if (statusCode === 401 || statusCode === 403) return 'UNAUTHORIZED_ACCESS';
  if (statusCode === 429) return 'RATE_LIMIT_EXCEEDED';

  switch (req.method) {
    case 'POST':
      return 'RECORD_CREATED';
    case 'PUT':
    case 'PATCH':
      return 'RECORD_UPDATED';
    case 'DELETE':
      return 'RECORD_DELETED';
    default:
      return 'RECORD_VIEWED';
  }
}

function correlationIdFor(req: Request): string | undefined {
  const headerKeys = ['x-request-id', 'x-correlation-id'];
  for (const key of headerKeys) {
    const value = req.headers[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function clientIpFor(req: Request): string | undefined {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.ip ?? req.socket?.remoteAddress ?? undefined;
}

function shouldSkip(path: string): boolean {
  return SKIP_PATH_PATTERNS.some(pattern => pattern.test(path));
}

export function isAuditTrailEnabled(): boolean {
  return process.env.AUDIT_TRAIL_ENABLED === 'true';
}

/**
 * Mount the audit-trail observer. Idempotent: safe to call once per
 * Express app at boot.
 */
export function applyAuditTrailMiddleware(
  app: Express,
  pool: Pool,
  debugLog: DebugLogger
): void {
  if (!isAuditTrailEnabled()) {
    debugLog(
      'Audit trail middleware skipped (AUDIT_TRAIL_ENABLED is not "true"). ' +
        'Tamper-proof logging is inactive.'
    );
    return;
  }

  const auditLog = getTamperProofAuditLog(pool);

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (!MUTATING_METHODS.has(req.method)) return next();
    if (shouldSkip(req.path)) return next();

    res.on('finish', () => {
      // Fire-and-forget. We never want audit logging to block a response or
      // surface errors to the caller, but every failure is logged to stderr
      // so an operator can detect chain-write outages.
      const eventType = eventTypeForRequest(req, res.statusCode);
      const userId = (req as Request & { user?: { id?: string | number } }).user?.id;
      const userIdStr = userId === undefined ? undefined : String(userId);

      auditLog
        .log(
          eventType,
          `${req.method} ${req.path} → ${res.statusCode}`,
          {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            query: Object.keys(req.query).length > 0 ? req.query : undefined,
          },
          {
            userId: userIdStr,
            correlationId: correlationIdFor(req),
            resourceType: req.path.split('/').filter(Boolean)[1], // e.g. /api/projects/... → "projects"
            ipAddress: clientIpFor(req),
            userAgent:
              typeof req.headers['user-agent'] === 'string'
                ? req.headers['user-agent']
                : undefined,
          }
        )
        .catch(err => {
          console.error('[AuditTrail] write failed:', err instanceof Error ? err.message : err);
        });
    });

    next();
  });

  console.log(
    '🔒 Tamper-proof audit trail middleware enabled (AUDIT_TRAIL_ENABLED=true)'
  );
  debugLog('Audit trail middleware installed');
}
