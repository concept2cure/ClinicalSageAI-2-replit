/**
 * Default-deny authentication boundary for the /api surface.
 *
 * GA-hardening (audit finding H2): route protection previously depended on
 * every mount / route file remembering to apply an auth middleware, plus a
 * late allowlist gate inside register-platform-routes.ts. Anything mounted
 * BEFORE that gate (diagnostic endpoints, /api/users, admin routers) silently
 * bypassed it. This boundary is mounted once, immediately after the core
 * middleware stack and audit-trail observer and BEFORE any route
 * registration, so every /api request passes through it.
 *
 * Semantics:
 *   1. OPTIONS requests pass (CORS preflight carries no credentials).
 *   2. Paths on PUBLIC_API_ALLOWLIST pass (each entry documents WHY it is
 *      public and which alternative control covers it).
 *   3. Requests already authenticated upstream (req.user set) pass.
 *   4. Everything else runs the canonical `authenticateToken` from
 *      server/middleware/auth.ts (reused, not forked):
 *        - mode 'enforce': failures get the repo-standard 401 body.
 *        - mode 'warn':    failures log a structured warning (once per
 *                          method+path per process) and continue, so the
 *                          boundary can be soaked in an environment before
 *                          flipping to enforce.
 *
 * Mode selection (AUTH_BOUNDARY_MODE): 'enforce' | 'warn'. Default is
 * 'enforce' in production and 'warn' everywhere else.
 *
 * Non-/api surfaces are intentionally NOT covered by this boundary and are
 * handled deliberately elsewhere:
 *   /healthz, /readyz        — fast-path liveness probes (no tenant data).
 *   /scim/v2                 — SCIM provisioning, own bearer-token auth.
 *   /.well-known             — RFC 9116 security.txt (public by spec).
 *   static/vite frontend     — public app shell; data comes from /api.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { authenticateToken } from './auth';
import { createScopedLogger } from '../utils/logger';
import { readEnforcementMode } from '../db/rlsEnforcement';
import { runWithTenantScope } from '../db/tenantStore';
import { getPool } from '../db/runtime';
import { LazyRequestDbClient } from './lazyRequestDbClient';

const defaultLogger = createScopedLogger('auth-boundary');

export type AuthBoundaryMode = 'enforce' | 'warn';

interface AllowlistEntry {
  /** Full path as the client sends it (starts with /api). */
  path: string;
  /** 'exact' matches only the path itself; 'prefix' also matches path + '/...'. */
  match: 'exact' | 'prefix';
}

/**
 * Intentionally-public /api endpoints. Every entry needs a reason and (where
 * applicable) the alternative auth control that covers it. Derived from the
 * pre-existing gate allowlist in register-platform-routes.ts (openPrefixes)
 * plus the requireMetricsAuth-guarded observability surface. When in doubt a
 * path stays OFF this list — default deny.
 */
export const PUBLIC_API_ALLOWLIST: readonly AllowlistEntry[] = [
  // ── Auth & session management (must work unauthenticated by definition) ──
  // /api/auth covers login, signup, refresh, forgot/reset-password, MFA,
  // enterprise auth (/api/auth/enterprise) and SSO/SAML flows (/api/auth/sso).
  { path: '/api/auth', match: 'prefix' },
  // Legacy 307 redirects to /api/auth/* (register-platform-routes.ts).
  { path: '/api/login', match: 'exact' },
  { path: '/api/logout', match: 'exact' },
  { path: '/api/register', match: 'exact' },
  // First-run install setup — self-closing once any user exists (routes/setup.ts).
  { path: '/api/setup', match: 'prefix' },

  // ── Health & observability ──
  // Liveness probe (no tenant data). Sub-paths such as /api/health/full are
  // additionally guarded by requireMetricsAuth (JWT or METRICS_TOKEN) at the
  // handler (startup/inline-endpoints.ts) — a plain JWT gate here would break
  // the Prometheus shared-secret scrape path.
  { path: '/api/health', match: 'prefix' },
  { path: '/api/metrics', match: 'exact' }, // requireMetricsAuth at handler
  { path: '/api/cortex/health', match: 'exact' },
  { path: '/api/claude/health', match: 'exact' },
  { path: '/api/ai-gateway/health', match: 'exact' },
  { path: '/api/claude/models', match: 'exact' }, // static model catalog, no tenant data

  // ── Alternative-auth surfaces (NOT session-authenticated by design) ──
  // Public API v1 — X-API-Key auth + scope enforcement inside
  // routes/public-api.ts (validateApiKey / requireScope).
  { path: '/api/v1', match: 'prefix' },
  // Stripe billing webhooks — Stripe signature verification at the route.
  { path: '/api/billing/webhooks', match: 'prefix' },
  // Firecrawl webhooks — signature-verified; also mounted before the JSON
  // body parser (raw-body), ahead of this boundary. Listed for documentation
  // and defense against mount reordering.
  { path: '/api/firecrawl-webhooks', match: 'prefix' },
  // CSP violation reports — browsers POST these cross-origin with no
  // credentials (per spec); rate-limited at the route (routes/csp-report.ts).
  { path: '/api/csp-report', match: 'prefix' },

  // ── Public-by-design content ──
  // DTC pricing — read by the public marketing page. No tenant data.
  { path: '/api/billing/dtc-pricing', match: 'exact' },
  // Server-authoritative timestamp + static liveness HTML page. No tenant
  // or user data (register-platform-routes.ts kept these public on purpose).
  { path: '/api/time', match: 'exact' },
  { path: '/api/diag', match: 'exact' },
];

/**
 * True when the full request path (baseUrl + path) matches the public
 * allowlist. Exact entries match only themselves; prefix entries match the
 * path itself or any sub-path (`p === path || path.startsWith(p + '/')`) so
 * /api/healthxyz never rides on /api/health.
 */
export function isPublicApiPath(fullPath: string): boolean {
  return PUBLIC_API_ALLOWLIST.some(entry =>
    entry.match === 'exact'
      ? fullPath === entry.path
      : fullPath === entry.path || fullPath.startsWith(entry.path + '/')
  );
}

/**
 * Resolve the boundary mode. Explicit AUTH_BOUNDARY_MODE wins; otherwise
 * enforce in production, warn everywhere else (dev/test/staging soak).
 * Resolved per-request so tests and operators can flip it without a reboot.
 */
export function resolveAuthBoundaryMode(env: NodeJS.ProcessEnv = process.env): AuthBoundaryMode {
  const explicit = (env.AUTH_BOUNDARY_MODE || '').trim().toLowerCase();
  if (explicit === 'enforce' || explicit === 'warn') return explicit;
  return env.NODE_ENV === 'production' ? 'enforce' : 'warn';
}

interface AuthBoundaryOptions {
  /** Override the authenticator (tests). Defaults to the canonical authenticateToken. */
  authenticate?: RequestHandler;
  /** Override the logger (tests). */
  logger?: Pick<ReturnType<typeof createScopedLogger>, 'warn'>;
  /** Override tenant-envelope installation (tests). */
  establishTenantContext?: (req: Request, res: Response, next: NextFunction) => void;
}

function positiveIntegerClaim(value: unknown): string | null {
  const normalized = typeof value === 'number' ? String(value) : value;
  if (typeof normalized !== 'string' || !/^[1-9]\d*$/.test(normalized)) return null;
  return Number.isSafeInteger(Number(normalized)) ? normalized : null;
}

/**
 * Install the tenant execution envelope once canonical JWT authentication and
 * live membership verification have succeeded. This is the global adoption
 * point for protected `/api` routes; individual route files do not need to
 * recreate pool/session setup.
 */
function continueWithTenantExecutionContext(req: Request, res: Response, next: NextFunction): void {
  if (readEnforcementMode() !== 'on') {
    next();
    return;
  }

  const tenantId = positiveIntegerClaim(req.user?.organizationId);
  const userId = positiveIntegerClaim(req.user?.userId ?? req.user?.id);
  if (!tenantId || !userId) {
    res.status(401).json({
      error: { code: 'AUTH_011', message: 'Authenticated request is missing tenant context' },
    });
    return;
  }

  const role = req.user?.role ?? null;
  req.userId = userId;
  req.tenantId = tenantId;
  req.userRole = role ?? undefined;
  req.tenantContext = {
    ...(req.tenantContext ?? {}),
    organizationId: tenantId,
    userId,
    role,
  };

  const lazy = new LazyRequestDbClient(getPool(), async client => {
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId]);
    await client.query("SELECT set_config('app.current_user_role', $1, false)", [role ?? '']);
    await client.query("SELECT set_config('app.current_org_id', $1, false)", [
      req.tenantContext?.organizationUuid ?? '',
    ]);
  });
  req.dbClient = lazy;

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    req.dbClient = null;
    void lazy.release();
  };
  res.once('finish', release);
  res.once('close', release);

  runWithTenantScope(
    {
      tenantId,
      orgUuid: req.tenantContext.organizationUuid ?? null,
      role,
      source: 'request',
      caller: req.path,
    },
    next
  );
}

/** Cap on the warn-once dedup set so unbounded path cardinality (ids in
 *  URLs) cannot grow memory; beyond the cap new routes stop logging. */
const WARN_DEDUP_MAX_ENTRIES = 5_000;

/**
 * Build the boundary middleware. Mount once on '/api'
 * (see startup/middleware.ts::applyAuthBoundary).
 */
export function createAuthBoundary(options: AuthBoundaryOptions = {}): RequestHandler {
  const authenticate = options.authenticate ?? authenticateToken;
  const logger = options.logger ?? defaultLogger;
  const establishTenantContext =
    options.establishTenantContext ?? continueWithTenantExecutionContext;
  const warnedRoutes = new Set<string>();

  return function authBoundary(req: Request, res: Response, next: NextFunction) {
    // CORS preflight never carries credentials; the real request is gated.
    if (req.method === 'OPTIONS') return next();

    const fullPath = `${req.baseUrl || ''}${req.path || ''}`;
    if (isPublicApiPath(fullPath)) return next();

    // Already authenticated by an upstream middleware (e.g. a prior gate or
    // an auth adapter that populated req.user). authenticateToken always
    // re-verifies the Authorization header, so skipping here both avoids the
    // duplicate verification cost and keeps the boundary idempotent.
    if (req.user) return establishTenantContext(req, res, next);

    const mode = resolveAuthBoundaryMode();

    if (mode === 'enforce') {
      // Delegate the failure response to the canonical middleware so the
      // 401 body is the repo-standard { error: { code, message } } shape.
      return authenticate(req, res, () => establishTenantContext(req, res, next));
    }

    // Warn mode: run the same authenticator, but swallow its rejection —
    // log a structured warning (once per method+path per process) and let
    // the request continue to whatever per-route guards exist today.
    //
    // On SUCCESS, warn mode must install the tenant execution context exactly
    // like enforce mode does — the mode only governs how an auth FAILURE is
    // handled (reject vs warn-and-pass), never what a successfully authenticated
    // request receives. Previously the success path called `next` directly,
    // dropping the runWithTenantScope wrap; with RLS_ENFORCE=on that left every
    // authenticated request's pooled query without a tenant scope, so it failed
    // closed ([tenant-rls] FAIL-CLOSED) and returned 500 — the exact symptom
    // seen wherever the boundary defaults to warn (any non-production env) while
    // RLS enforcement is on, e.g. the RLS rollout window. When RLS is off,
    // establishTenantContext is a no-op that just calls next(), so warn-mode
    // behaviour is unchanged in the common dev case.
    const captureRes = {
      status(statusCode: number) {
        return {
          json(_body: unknown) {
            const routeKey = `${req.method} ${fullPath}`;
            if (!warnedRoutes.has(routeKey) && warnedRoutes.size < WARN_DEDUP_MAX_ENTRIES) {
              warnedRoutes.add(routeKey);
              logger.warn(
                'Unauthenticated request passed through auth boundary (mode=warn). ' +
                  'This route would be rejected in enforce mode.',
                { method: req.method, path: fullPath, statusCode }
              );
            }
            next();
          },
        };
      },
    };

    return authenticate(req, captureRes as unknown as Response, () =>
      establishTenantContext(req, res, next)
    );
  };
}
