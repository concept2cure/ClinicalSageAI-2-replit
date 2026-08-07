/**
 * Establish the request's tenant scope — the central lever of the RLS
 * route-layer fix (see docs/architecture/RLS_ROUTE_LAYER_SYSTEMIC_FIX_DESIGN.md).
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * Under RLS_ENFORCE=on (the only value production accepts) the instrumented pool
 * fails closed on any non-infrastructure query issued with no active tenant
 * scope. Historically the ONLY middleware that opened a scope was
 * `requireTenantContext`; the auth middlewares that actually run on the request
 * path (`authMiddleware`, `authenticateToken`) authenticated and then called a
 * bare `next()`. The result: ~80% of mounted route surfaces 500'd once
 * enforcement was on, even though the verified tenant identity was already on
 * `req.user`.
 *
 * This module turns that already-known identity into a real scope + a
 * request-scoped DB client, at the one point every authenticated route passes
 * through. It is called from `authMiddleware` (the global `/api` gate),
 * `authenticateToken` (mountAll groups), and `requireTenantContext` (which
 * reuses the same tail so there is exactly one implementation).
 *
 * ── Idempotent, but scope-KIND aware ──────────────────────────────────────────
 * If a REAL per-user scope is already active (a self-scoped mount, the gate, or
 * `requireTenantContext`) or `req.dbClient` is set, the helper is a pass-through
 * — it never clobbers an authoritative scope. But the check is deliberately not
 * "any active scope wins": the two tenantId-'0' PLACEHOLDER scopes are handled
 * by kind, not treated as final —
 *   - a pre-auth scope (`runWithPreAuthScope`, no role) opened on an auth mount
 *     is REPLACED once a verified identity exists, so authenticated tenant work
 *     runs under the caller's org rather than tenantId '0';
 *   - a system route is routed to the system scope even if a per-user or
 *     pre-auth scope opened first, so cross-tenant consoles are never restricted
 *     to the caller's org.
 * (Both were P1 review findings — the coarse "any active scope is idempotent"
 * check silently left e-signatures pre-auth-scoped and could shadow admin
 * carve-outs.)
 *
 * ── Two scope flavours ────────────────────────────────────────────────────────
 *  - per-user (`establishRequestTenantScope`): the caller's org. The default.
 *  - system  (`establishRequestSystemScope`): cross-tenant / pre-auth-admin
 *    consoles that read ACROSS orgs. A per-user scope would wrongly restrict
 *    them, so they run under the system scope (tenantId '0', app_super_admin).
 *    The per-user path auto-delegates to the system path for any request whose
 *    path is in SYSTEM_SCOPE_PREFIXES; pre-gate/outside-gate system mounts apply
 *    `establishRequestSystemScope` directly as mount middleware.
 */

import type { Request, Response, NextFunction } from 'express';
import type { PoolClient } from 'pg';
import { getPool } from '../db';
import {
  getTenantScope,
  runWithTenantScope,
  runWithSystemTenantScope,
  type TenantScope,
} from '../db/tenantStore';
import { LazyRequestDbClient } from './lazyRequestDbClient';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('establish-tenant-scope');

/**
 * Path prefixes whose routes read/write ACROSS tenants and must run under the
 * system scope, never the caller's org scope. Matching mirrors the global
 * `/api` auth gate: exact, or a prefix followed by `/`.
 *
 * These are the cross-tenant admin/system consoles from the RLS audit's
 * carve-out class 1. Mounts registered AFTER the global gate (admin/master,
 * admin/business, admin/access, tenant-export) reach the per-user lever and are
 * redirected here by this list. Mounts registered BEFORE the gate, or outside
 * `/api` (scim, the /api/admin/scim-* + /api/admin/audit family, setup), do not
 * pass through the lever and instead apply `establishRequestSystemScope`
 * directly at their mount — this list documents them too so the intent lives in
 * one place.
 */
export const SYSTEM_SCOPE_PREFIXES: readonly string[] = [
  '/api/admin/master',
  '/api/admin/business',
  '/api/admin/access',
  '/api/admin/scim-tenants',
  '/api/admin/scim-ip-allowlist',
  '/api/admin/audit',
  '/api/tenant-export',
  '/scim/v2',
  // Tenant admission (POST /api/tenants) counts across ALL orgs to enforce
  // plan limits, so it must run cross-tenant, not scoped to the caller's org
  // (audit NEEDS_VERIFY #2). The prefix's GET/PUT/DELETE use a separate
  // postgres connection that bypasses the instrumented pool, so a system scope
  // here changes only the create path — the one that touches the instrumented
  // db. `/api/tenants` matches exactly or as `/api/tenants/…`, never the
  // sibling `/api/tenant-users` etc. (a different prefix). The bypass
  // connection remains an RLS-governance gap worth a separate follow-up.
  '/api/tenants',
];

/** Full request path, computed the same way the global `/api` gate computes it. */
function fullPath(req: Request): string {
  return (req.baseUrl || '') + (req.path || '');
}

/** True when the request targets a cross-tenant/system route. */
export function isSystemScopedPath(req: Request): boolean {
  const path = fullPath(req);
  return SYSTEM_SCOPE_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
}

/**
 * The cross-tenant system scope: tenantId '0' AND the super-admin role. Only
 * `runWithSystemTenantScope` / `establishRequestSystemScope` produce this shape.
 */
function isSystemScope(scope: TenantScope | undefined): boolean {
  return !!scope && scope.tenantId === '0' && scope.role === 'app_super_admin';
}

/**
 * A REAL per-tenant scope — a genuine caller-org scope, established by the auth
 * boundary or `requireTenantContext`. Distinguished from the two placeholder
 * shapes that also use tenantId '0': the pre-auth scope (`runWithPreAuthScope`,
 * no role) and the system scope (super-admin role). A pre-auth placeholder is
 * deliberately NOT "real": it is opened before an identity is known and MUST be
 * replaced by the caller's actual scope once authentication succeeds, or tenant
 * work would run under tenantId '0' and be RLS-denied/misattributed.
 */
function isRealTenantScope(scope: TenantScope | undefined): boolean {
  return !!scope && scope.tenantId !== '0';
}

/**
 * Resolve the caller's tenant id as a positive-integer string, or null when the
 * identity carries no numeric org (platform-level / pre-auth tokens). Mirrors
 * the strict semantics of tenantContext.strictPositiveInt: a bare `parseInt`
 * would turn '42abc' or a UUID subject into a real-looking id.
 */
function resolveTenantId(req: Request): string | null {
  const raw = req.user?.organizationId;
  if (raw === null || raw === undefined) return null;
  const str = typeof raw === 'number' ? String(raw) : raw;
  if (typeof str !== 'string') return null;
  if (!/^[1-9]\d*$/.test(str)) return null;
  const n = Number(str);
  return Number.isSafeInteger(n) ? str : null;
}

/** Read the org uuid the auth middlewares may have attached, if any. */
function resolveOrgUuid(req: Request): string | null {
  const fromUser = (req.user as { organizationUuid?: string | null } | undefined)?.organizationUuid;
  if (typeof fromUser === 'string' && fromUser) return fromUser;
  const fromCtx = req.tenantContext?.organizationUuid;
  return typeof fromCtx === 'string' && fromCtx ? fromCtx : null;
}

/**
 * Attach a lazily-acquired, session-var-setting DB client to the request and
 * arrange for its release when the response ends. The client is only acquired
 * on first `.query()`, so requests that never touch the DB spend no pool slot.
 */
function attachLazyClient(
  req: Request,
  res: Response,
  applySessionVars: (client: PoolClient) => Promise<void>,
): void {
  const lazy = new LazyRequestDbClient(getPool(), applySessionVars);
  req.dbClient = lazy;
  const release = () => {
    req.dbClient = null;
    void lazy.release();
  };
  res.on('finish', release);
  res.on('close', release);
}

/** Session-var applier for a per-user tenant scope. */
function tenantSessionVars(
  tenantId: string,
  role: string | null,
  orgUuid: string | null,
): (client: PoolClient) => Promise<void> {
  return async (client: PoolClient) => {
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId]);
    await client.query("SELECT set_config('app.current_user_role', $1, false)", [role ?? '']);
    await client.query("SELECT set_config('app.current_org_id', $1, false)", [orgUuid ?? '']);
  };
}

/** Session-var applier for the cross-tenant system scope (super-admin). */
function systemSessionVars(): (client: PoolClient) => Promise<void> {
  return async (client: PoolClient) => {
    await client.query("SELECT set_config('app.current_tenant_id', '0', false)");
    await client.query("SELECT set_config('app.current_user_role', 'app_super_admin', false)");
    await client.query("SELECT set_config('app.current_org_id', '', false)");
  };
}

/**
 * Open a per-user tenant scope for the rest of the request and attach a
 * request-scoped DB client. Idempotent. Falls through to `next()` (no scope)
 * when the identity has no numeric tenant — a fabricated scope would be worse
 * than a fail-closed DB touch, which is the correct outcome for a tenant-less
 * request.
 */
export function establishRequestTenantScope(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const active = getTenantScope();

  // Cross-tenant consoles must run under the SYSTEM scope — decided BEFORE any
  // idempotency return, so a system route is never left running under a per-user
  // or pre-auth scope that happened to open first (e.g. a per-user scope from
  // the global gate). If a system scope is already active, keep it.
  if (isSystemScopedPath(req)) {
    if (isSystemScope(active)) {
      next();
      return;
    }
    establishRequestSystemScope(req, res, next);
    return;
  }

  // Idempotent for the real case: a genuine per-user scope (from the gate or
  // requireTenantContext) or an already-attached request client is authoritative
  // — do not clobber it. A pre-auth PLACEHOLDER scope (tenantId '0', no role) is
  // intentionally excluded here: it must be replaced once we have a verified
  // identity, or authenticated tenant work (e.g. the /api/auth/enterprise
  // electronic-signature path, mounted under runWithPreAuthScope) would execute
  // under tenantId '0' and be RLS-denied/misattributed.
  if (req.dbClient || isRealTenantScope(active)) {
    next();
    return;
  }

  const tenantId = resolveTenantId(req);
  if (tenantId === null) {
    // Platform-level / still-pre-auth identity: no tenant to scope to. Do not
    // fabricate one; leave any pre-auth placeholder as-is. Downstream guards
    // still apply and an unscoped DB touch fails closed, which is correct.
    next();
    return;
  }

  const orgUuid = resolveOrgUuid(req);
  const role = req.user?.role != null ? String(req.user.role) : null;

  attachLazyClient(req, res, tenantSessionVars(tenantId, role, orgUuid));

  runWithTenantScope(
    { tenantId, orgUuid, role, source: 'request', caller: fullPath(req) },
    () => next(),
  );
}

/**
 * Open the cross-tenant system scope for the rest of the request and attach a
 * system-scoped DB client. Used for admin/system consoles that read across
 * orgs. NOT guarded by the `req.dbClient` idempotency check the per-user path
 * uses: when applied as mount middleware behind the global gate (which may have
 * opened a per-user scope first), it deliberately nests a system scope so the
 * router's queries are cross-tenant — AsyncLocalStorage gives the innermost
 * scope, and the system client overrides req.dbClient for RQ routers.
 */
export function establishRequestSystemScope(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const caller = `system:${req.method} ${fullPath(req)}`;
  if (getTenantScope()) {
    // A scope is already open (e.g. the gate's per-user scope). Nest a system
    // scope so this console's reads are cross-tenant, and override the client.
    logger.debug('Nesting system scope over an existing request scope', { caller });
  }
  attachLazyClient(req, res, systemSessionVars());
  runWithSystemTenantScope(caller, () => next());
}
