/**
 * Tenant lifecycle guard — refuses requests from organizations that are
 * suspended, inactive, past due, or scheduled for deletion.
 *
 * Mounted once in the authenticated `/api` chain (see
 * `middleware/auth.ts::authenticateToken`), immediately after membership is
 * re-verified and the tenant scope is established. Placing it there means it
 * runs for every authenticated route on the platform without any route file
 * opting in — the same reasoning that produced `authBoundary`.
 *
 * ── What it does NOT do ───────────────────────────────────────────────────────
 * It is not an authorization control and does not look at the caller's role
 * within the tenant. It answers one question about the *organization*: is this
 * tenancy currently entitled to operate? Role checks stay where they are.
 *
 * ── Carve-outs ────────────────────────────────────────────────────────────────
 * Three classes of path stay reachable even when the tenant is denied, because
 * blocking them would make the state unrecoverable or breach the customer
 * agreement:
 *
 *   1. Billing — a past-due customer must be able to reach checkout. Locking
 *      the paywall behind the paywall is the classic version of this bug.
 *   2. Data portability — `/api/tenant-export` and the audit export are
 *      contractual obligations under every enterprise MSA and under GDPR
 *      Art. 20. An offboarding customer must be able to take their regulatory
 *      record with them.
 *   3. Session and identity — the user must be able to authenticate and read
 *      their own profile in order to be *shown* the suspension notice at all.
 *
 * Platform staff (super-admin class roles) bypass the guard entirely: support
 * has to be able to operate on a suspended tenant to un-suspend it.
 *
 * ── Response contract ─────────────────────────────────────────────────────────
 * Denied:    403 with `error.code` from the posture (TENANT_SUSPENDED, …).
 * Read-only: 403 on mutating verbs only; safe verbs pass through.
 * Unknown:   503 TENANT_STATE_UNVERIFIED — fail-closed, never assume active.
 *
 * The body carries the machine-readable `code` and a customer-safe `message` so
 * the client can render the correct banner and call-to-action rather than a
 * generic "forbidden".
 *
 * @module server/middleware/tenantLifecycleGuard
 */

import type { Request, Response, NextFunction } from 'express';
import { createScopedLogger } from '../utils/logger';
import {
  decisionPermitsMethod,
  getTenantAccessPosture,
  type TenantAccessPosture,
} from '../services/tenant/tenant-lifecycle';
import { tenantLifecycleDecisions } from './tenantLifecycleMetrics';

const logger = createScopedLogger('tenant-lifecycle-guard');

interface CarveOut {
  path: string;
  match: 'exact' | 'prefix';
}

/**
 * Paths that remain reachable regardless of tenant posture. Every entry needs a
 * reason; when in doubt an entry stays OFF this list, because the default is the
 * safe one.
 */
export const LIFECYCLE_CARVE_OUTS: readonly CarveOut[] = [
  // ── Pay your way out of the state ──
  // Checkout, portal, invoices, subscription management. Without this a
  // past-due tenant cannot settle the invoice that would restore access.
  { path: '/api/billing', match: 'prefix' },

  // ── Data portability (contractual / GDPR Art. 20) ──
  { path: '/api/tenant-export', match: 'prefix' },
  { path: '/api/admin/audit', match: 'prefix' },

  // ── Session & identity: needed to render the notice ──
  { path: '/api/auth', match: 'prefix' },
  { path: '/api/users/me', match: 'prefix' },
  { path: '/api/organizations/current', match: 'exact' },

  // ── The posture endpoint itself ──
  // The client polls this to decide which banner to show; it must answer even
  // when the answer is "denied".
  { path: '/api/tenant-status', match: 'prefix' },

  // ── Liveness / observability (no tenant data) ──
  { path: '/api/health', match: 'prefix' },
  { path: '/api/metrics', match: 'exact' },
];

/**
 * Roles that act ACROSS tenants. Kept in sync with the platform-admin
 * vocabulary in `middleware/auth.ts`; the org-scoped `admin` role is a
 * *customer* and deliberately absent — an org admin must not be able to shrug
 * off their own organization's suspension.
 */
const PLATFORM_ROLES = new Set(['super_admin', 'app_super_admin', 'platform_admin']);

export function isLifecycleCarveOut(fullPath: string): boolean {
  return LIFECYCLE_CARVE_OUTS.some(entry =>
    entry.match === 'exact'
      ? fullPath === entry.path
      : fullPath === entry.path || fullPath.startsWith(entry.path + '/')
  );
}

function isPlatformActor(req: Request): boolean {
  const role = req.user?.role;
  if (typeof role === 'string' && PLATFORM_ROLES.has(role)) return true;
  const roles = req.user?.roles;
  return Array.isArray(roles) && roles.some(r => typeof r === 'string' && PLATFORM_ROLES.has(r));
}

/**
 * Strict positive-integer coercion, matching `tenantContext.strictPositiveInt`.
 * A bare `parseInt` would turn a UUID subject into a plausible-looking org id.
 */
function resolveOrganizationId(req: Request): number | null {
  const raw = req.user?.organizationId ?? req.tenantContext?.organizationId;
  if (raw === null || raw === undefined) return null;
  const str = typeof raw === 'number' ? String(raw) : raw;
  if (typeof str !== 'string' || !/^[1-9]\d*$/.test(str)) return null;
  const n = Number(str);
  return Number.isSafeInteger(n) ? n : null;
}

function fullPath(req: Request): string {
  return `${req.baseUrl || ''}${req.path || ''}`;
}

/** Attach the resolved posture so downstream handlers and the UI can read it. */
function attachPosture(req: Request, posture: TenantAccessPosture): void {
  (req as Request & { tenantPosture?: TenantAccessPosture }).tenantPosture = posture;
}

function refuse(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

/**
 * The guard. Safe to mount more than once — a request that has already been
 * evaluated carries `req.tenantPosture` and short-circuits.
 */
export function enforceTenantLifecycle(req: Request, res: Response, next: NextFunction): void {
  // Idempotent: an outer mount already decided this request.
  if ((req as Request & { tenantPosture?: TenantAccessPosture }).tenantPosture) {
    next();
    return;
  }

  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  const path = fullPath(req);
  if (isLifecycleCarveOut(path)) {
    next();
    return;
  }

  // Platform staff operate across tenants, including on suspended ones.
  if (isPlatformActor(req)) {
    next();
    return;
  }

  const organizationId = resolveOrganizationId(req);
  if (organizationId === null) {
    // No numeric tenant on this identity — nothing to evaluate. Downstream
    // tenant guards still apply, and an unscoped DB touch fails closed.
    next();
    return;
  }

  void getTenantAccessPosture(organizationId)
    .then(posture => {
      if (!posture) {
        // Indeterminate. Never assume active — a suspension must not lapse
        // because a lookup failed. Warning already logged by the service.
        tenantLifecycleDecisions.inc({ decision: 'unverified', state: 'unknown' });
        refuse(
          res,
          503,
          'TENANT_STATE_UNVERIFIED',
          'Organization status could not be verified. Please retry shortly.'
        );
        return;
      }

      attachPosture(req, posture);

      if (decisionPermitsMethod(posture.decision, req.method)) {
        tenantLifecycleDecisions.inc({
          decision: posture.decision === 'allow' ? 'allow' : 'read_only_pass',
          state: posture.state,
        });
        next();
        return;
      }

      tenantLifecycleDecisions.inc({
        decision: posture.decision === 'deny' ? 'deny' : 'read_only_block',
        state: posture.state,
      });
      logger.info('Request refused by tenant lifecycle posture', {
        organizationId,
        state: posture.state,
        decision: posture.decision,
        method: req.method,
        path,
      });
      refuse(res, 403, posture.code, posture.reason);
    })
    .catch(error => {
      logger.warn('Tenant lifecycle guard crashed — refusing access (fail-closed)', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      tenantLifecycleDecisions.inc({ decision: 'unverified', state: 'unknown' });
      refuse(
        res,
        503,
        'TENANT_STATE_UNVERIFIED',
        'Organization status could not be verified. Please retry shortly.'
      );
    });
}
