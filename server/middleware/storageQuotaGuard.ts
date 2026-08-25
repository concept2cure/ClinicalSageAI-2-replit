/**
 * Storage quota guard — enforces `organizations.max_storage` on content-bearing
 * requests.
 *
 * ── Why a middleware and not a check inside the upload helpers ────────────────
 * `middleware/uploadSafety.ts::assertUploadSafe` looked like the natural home:
 * every upload path already calls it. It takes a Buffer, a MIME type and a
 * filename — it has no request, therefore no tenant. Threading an *optional*
 * organization id through it would have produced a control that most of its
 * eight call sites did not pass, i.e. a quota that is enforced on whichever
 * routes someone remembered. That is the same defect as a hand-maintained table
 * list, and this codebase has been bitten by it twice already.
 *
 * So the check lives where the tenant is already known and every authenticated
 * request already passes: the auth chain, immediately after the lifecycle guard.
 * There is no per-route wiring, therefore nothing for a future upload route to
 * forget.
 *
 * ── What counts as a content-bearing request ──────────────────────────────────
 * `Content-Length` on the request, read BEFORE any body parser runs. That makes
 * the check transport-agnostic: multer routes, raw streams to object storage and
 * routes that have not been written yet are all covered identically.
 *
 * The guard deliberately evaluates only requests that plausibly store bytes —
 * multipart / octet-stream, or a declared body at or above
 * `CONTENT_BEARING_BYTES`. A storage limit must block *storage*, not every
 * mutation: refusing a project rename because the tenant is near its disk quota
 * conflates metering with suspension, and suspension is the lifecycle guard's
 * job. A small JSON body that nonetheless persists content is therefore NOT
 * caught — an under-approximation, in the same safe direction as the partial
 * measurement it is built on.
 *
 * A chunked request declares no `Content-Length`. Its incoming size is counted
 * as zero, which degrades the check to "is this tenant ALREADY over?" — still a
 * real refusal for an over-quota tenant, just not a pre-flight one.
 *
 * ── Why this fails OPEN when the lifecycle guard fails closed ─────────────────
 * They are different kinds of control and the asymmetry is deliberate.
 * Entitlement and isolation are security properties: an unreadable posture must
 * never be read as "active", so the lifecycle guard answers 503. A storage quota
 * is commercial metering. Failing closed there would mean a database hiccup
 * blocks every upload on the platform — taking out regulated submission work for
 * a billing reason. An unmeasurable quota is not enforced; it is logged and
 * counted as `unverified` so the blind spot is visible.
 *
 * @module server/middleware/storageQuotaGuard
 */

import type { Request, Response, NextFunction } from 'express';
import { createScopedLogger } from '../utils/logger';
import { getPool } from '../db';
import {
  evaluateStorageQuota,
  getTenantStorage,
  isStorageEnforcementOn,
  recordAdmittedBytes,
  type StorageQuotaDecision,
} from '../services/tenant/tenant-storage';
import { isLifecycleCarveOut } from './tenantLifecycleGuard';
import { tenantQuotaDecisions } from './tenantLifecycleMetrics';

const logger = createScopedLogger('storage-quota-guard');

/**
 * Declared-body threshold at which a request is treated as storing content.
 * One mebibyte: comfortably above any form post or JSON document this platform
 * sends, comfortably below any regulatory attachment worth metering.
 */
export const CONTENT_BEARING_BYTES = 1024 * 1024;

const CONTENT_BEARING_TYPES = ['multipart/form-data', 'application/octet-stream'];

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/** Declared request body size, or null when the client sent none (chunked). */
export function declaredBodyBytes(req: Request): number | null {
  const raw = req.get?.('content-length');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/**
 * Whether this request plausibly stores bytes. See the module note — this is an
 * intentional under-approximation, not a complete classifier.
 */
export function isContentBearing(req: Request): boolean {
  if (!WRITE_METHODS.has(req.method)) return false;
  const type = (req.get?.('content-type') || '').toLowerCase();
  if (CONTENT_BEARING_TYPES.some(t => type.startsWith(t))) return true;
  return (declaredBodyBytes(req) ?? 0) >= CONTENT_BEARING_BYTES;
}

/**
 * Strict positive-integer coercion, matching the lifecycle guard's. A bare
 * `parseInt` would turn a UUID subject into a plausible-looking org id.
 *
 * `apiOrganizationId` is included so the guard is correct on the `/api/v1`
 * key-authenticated surface, which sets that field instead of `req.user`. The
 * lifecycle guard had to be patched onto that surface after the fact when it was
 * found to be a hole exactly the shape of the public API; this one resolves the
 * tenant there from the start.
 */
function resolveOrganizationId(req: Request): number | null {
  const raw =
    req.user?.organizationId ??
    (req as Request & { apiOrganizationId?: number }).apiOrganizationId ??
    req.tenantContext?.organizationId;
  if (raw === null || raw === undefined) return null;
  const str = typeof raw === 'number' ? String(raw) : raw;
  if (typeof str !== 'string' || !/^[1-9]\d*$/.test(str)) return null;
  const n = Number(str);
  return Number.isSafeInteger(n) ? n : null;
}

function fullPath(req: Request): string {
  return `${req.baseUrl || ''}${req.path || ''}`;
}

/**
 * The LIMIT is read fresh on every evaluation while usage is cached, and the
 * asymmetry is deliberate. Usage is an eleven-table aggregate; the limit is a
 * single primary-key lookup. Caching the limit would buy nothing measurable and
 * would cost the property that matters most here: a customer who has just paid to
 * raise their quota is unblocked on their next request rather than up to a cache
 * TTL later. Being told to wait after paying is the worst moment to be stale.
 */
async function readStorageLimitGb(organizationId: number): Promise<number | null> {
  const { rows } = await getPool().query<{ max_storage: number | string | null }>(
    'SELECT max_storage FROM organizations WHERE id = $1',
    [organizationId]
  );
  if (rows.length === 0) return null;
  const raw = rows[0].max_storage;
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function gib(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * Customer-facing refusal. The message names the actual numbers because the only
 * useful next action — delete something or buy more — depends on knowing how far
 * over the request is.
 */
function refuse(res: Response, decision: StorageQuotaDecision): void {
  res.status(413).json({
    error: {
      code: 'TENANT_STORAGE_QUOTA_EXCEEDED',
      message:
        `This upload would put your organization over its ${gib(decision.limitBytes ?? 0)} ` +
        `storage limit (currently using ${gib(decision.usedBytes)}). ` +
        'Remove unused files or contact your administrator to increase the limit.',
      details: {
        usedBytes: decision.usedBytes,
        limitBytes: decision.limitBytes,
        incomingBytes: decision.incomingBytes,
      },
    },
  });
}

/**
 * The guard. Mounted alongside `enforceTenantLifecycle`; safe to mount more than
 * once — an evaluated request carries `req.storageQuota` and short-circuits.
 */
export function enforceStorageQuota(req: Request, res: Response, next: NextFunction): void {
  const decorated = req as Request & { storageQuota?: StorageQuotaDecision };
  if (decorated.storageQuota) {
    next();
    return;
  }

  if (!isContentBearing(req)) {
    next();
    return;
  }

  // The paths that must stay reachable when a tenant is suspended must stay
  // reachable when it is out of space, for the same reason: billing and data
  // export are how a customer gets OUT of the state.
  if (isLifecycleCarveOut(fullPath(req))) {
    next();
    return;
  }

  const organizationId = resolveOrganizationId(req);
  if (organizationId === null) {
    next();
    return;
  }

  const incomingBytes = declaredBodyBytes(req) ?? 0;

  void (async () => {
    let decision: StorageQuotaDecision;
    try {
      const pool = getPool();
      const [usage, maxStorageGb] = await Promise.all([
        getTenantStorage(pool, organizationId),
        readStorageLimitGb(organizationId),
      ]);
      decision = evaluateStorageQuota({
        usedBytes: usage.bytes,
        maxStorageGb,
        incomingBytes,
      });
    } catch (error) {
      // Fail OPEN — see the module note on why this differs from the lifecycle
      // guard. The blind spot is counted so it can be alerted on.
      tenantQuotaDecisions.inc({ resource: 'storage', outcome: 'unverified' });
      logger.warn('Storage quota could not be evaluated; allowing the request', {
        organizationId,
        path: fullPath(req),
        error: error instanceof Error ? error.message : String(error),
      });
      next();
      return;
    }

    decorated.storageQuota = decision;

    if (decision.allowed) {
      tenantQuotaDecisions.inc({ resource: 'storage', outcome: 'allowed' });
      // Charge the admitted bytes so a burst inside one cache window cannot
      // outrun the quota. See tenant-storage.recordAdmittedBytes.
      if (incomingBytes > 0) recordAdmittedBytes(organizationId, incomingBytes);
      next();
      return;
    }

    if (!isStorageEnforcementOn()) {
      // Report mode is not inert: the decision is computed, counted and logged,
      // so an operator can see exactly who would be refused before flipping
      // enforcement on.
      tenantQuotaDecisions.inc({ resource: 'storage', outcome: 'allowed' });
      logger.warn('Storage quota exceeded (report mode — not blocking)', {
        organizationId,
        path: fullPath(req),
        usedBytes: decision.usedBytes,
        limitBytes: decision.limitBytes,
        incomingBytes,
      });
      if (incomingBytes > 0) recordAdmittedBytes(organizationId, incomingBytes);
      next();
      return;
    }

    tenantQuotaDecisions.inc({ resource: 'storage', outcome: 'denied' });
    logger.warn('Storage quota exceeded — refusing upload', {
      organizationId,
      path: fullPath(req),
      usedBytes: decision.usedBytes,
      limitBytes: decision.limitBytes,
      incomingBytes,
    });
    refuse(res, decision);
  })();
}
