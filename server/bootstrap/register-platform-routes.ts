import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { PlatformBootstrapContext } from './types';
import { runWithPreAuthScope } from '../db/tenantStore';
import { establishRequestSystemScope } from '../middleware/establishRequestTenantScope';
import cspReportRouter from '../routes/csp-report';
import adminSecurityRouter from '../routes/admin-security';
import { CSP_REPORT_URI } from '../middleware/enterprise-security';

export async function registerPlatformRoutes({ app, pool, authMiddleware }: PlatformBootstrapContext) {
  // Pre-auth scope: work that runs BEFORE a tenant can be known — resolving an
  // identity, verifying a password/IdP response. Carries no role, so it grants
  // no policy bypass; it exists so the pre-auth user-lookup is not blocked by
  // the fail-closed pool guard under RLS_ENFORCE=on. Declared once here and
  // shared by the auth family (/api/auth, /api/v1/auth) and enterprise auth.
  const preAuthScope: RequestHandler = (req, _res, next) =>
    runWithPreAuthScope(`auth:${req.method} ${req.path}`, next);
  // CSP violation reporting — must match the report-uri set on the policy.
  // Mounted on the platform router so it's available before any auth-gated
  // routes need it, and so it survives the validateTenantContext skip list.
  app.use(CSP_REPORT_URI, cspReportRouter);

  // Admin security-health endpoint. Lives under /api/admin so the
  // global /api auth gate runs first (auth + admin role enforced
  // by the router itself). Returns the security self-test report
  // on demand for ops dashboards and SOC tooling.
  app.use('/api/admin', adminSecurityRouter);

  // /healthz and /readyz are NOT registered here.
  //
  // They are mounted by mountFastPathHealthEndpoints (server/startup/
  // inline-endpoints.ts) at server/index.ts:111 — module level, before
  // startServer() and therefore before this function runs. Express keeps the
  // first handler registered for a method+path, so the definitions that used to
  // live here were permanently shadowed dead code.
  //
  // That mattered more than dead code usually does. The shadowed /readyz only
  // ran `select 1` and returned `{ ready: true }` — no schema verification at
  // all. Any future change to boot ordering would have silently swapped the
  // real, schema-aware, fail-closed probe for one that reports healthy against
  // a completely unmigrated database, with no test or type error to notice.
  // Removed rather than left in place: a second definition of a safety probe is
  // a trap, not a fallback.

  // /api/health, /api/health/full, /api/metrics and /api/ai-gateway/health are
  // NOT registered here either, for exactly the reason spelled out above about
  // /healthz and /readyz — and this file removed those two while leaving these
  // four standing directly beneath the explanation.
  //
  // mountFastPathHealthEndpoints (server/index.ts:107) and
  // mountDiagnosticEndpoints (server/index.ts:129) both run at MODULE level;
  // startServer() is called at server/index.ts:260, so every definition that
  // used to live here was permanently shadowed. Express keeps the first handler
  // registered for a method+path.
  //
  // Shadowed is not harmless here. The surviving definitions in
  // server/startup/inline-endpoints.ts are the HARDENED ones: /api/health/full
  // and /api/metrics sit behind requireMetricsAuth, and /api/health/full logs
  // its exception server-side instead of returning `message: err.message` —
  // because a health-checker exception can carry DB DSN fragments, file paths
  // and env var names. The copies removed from here had neither protection.
  //
  // So this was an unauthenticated, error-leaking pair of ops endpoints that
  // became live the moment anyone reordered boot. A second definition of a
  // safety probe is a trap, not a fallback.

  // NOTE: /api/time and /api/diag intentionally MOVED below the global auth
  // gate (see further down). Everything registered ABOVE the gate bypasses
  // auth entirely, so this pre-gate surface MUST stay minimal and limited to
  // health/readiness probes that expose zero sensitive data. Do not add new
  // pre-gate /api/* routes here; register them after the gate (and allowlist
  // them only if they must be public).

  try {
    const authModule = await import('../routes/auth');
    const authRouter = authModule.default;
    if (authRouter && (typeof authRouter === 'function' || (authRouter as any).handle)) {
      // Authentication runs BEFORE a tenant can be known: the query that
      // resolves an identity from an email address is the one that would
      // establish the tenant. Pool instrumentation blocks unscoped queries once
      // RLS_ENFORCE=on, and production permits ONLY `on`, so without this the
      // login user-lookup was blocked and every login returned 500.
      //
      // Declaring the scope here — rather than per query — keeps the whole
      // pre-auth surface (login, dev-login, signup, refresh, MFA, password
      // reset) consistent. It carries no role, so it grants no policy bypass;
      // see runWithPreAuthScope. Requests that go on to authenticate get the
      // real tenant scope installed by the auth boundary, which nests inside
      // this one and wins.
      app.use('/api/auth', preAuthScope, authRouter);
      app.use('/api/v1/auth', preAuthScope, authRouter);
    }
  } catch (error) {
    console.error('❌ Failed to mount auth routes:', error);
  }

  try {
    const usersModule = await import('../routes/users');
    const usersRouter = usersModule.default;
    if (usersRouter && (typeof usersRouter === 'function' || (usersRouter as any).handle)) {
      // These mounts sit BEFORE the global /api gate, so the gate's
      // authMiddleware (and the scope lever) never runs for them. The router is
      // MIXED: pre-auth routes (/login, /register, /logout) alongside
      // authenticated ones (/, /me, /:id, /me/preferences, …), and it verifies
      // JWTs inline rather than via a mount middleware — so it opens no tenant
      // scope of its own. Under RLS_ENFORCE=on the authenticated routes then
      // failed closed (profile / preferences 500'd), while login stayed
      // pre-auth. A pre-auth scope is the right boundary for the whole mount:
      // it clears the fail-closed guard, carries no role (no policy bypass),
      // and is safe here because every table this router touches is RLS-policy-
      // free under 0021 — users (no policy), organizations (no organization_id
      // column → not policied), organization_users (0021 allowlist), and
      // notification_preferences (keyed on user_id only, no org column). So the
      // app-level WHERE clauses do the filtering and a tenant-less scope neither
      // empties a read nor violates a write. Mirrors /api/auth and
      // /api/auth/enterprise, which are pre-auth-scoped for the same reason.
      app.use('/api/users', preAuthScope, usersRouter);
      app.use('/api/user', preAuthScope, usersRouter);
    }
  } catch (error) {
    console.error('❌ Failed to mount users routes:', error);
  }

  app.post('/api/login', (_req, res) => res.redirect(307, '/api/auth/login'));
  app.post('/api/logout', (_req, res) => res.redirect(307, '/api/auth/logout'));
  app.post('/api/register', (_req, res) => res.redirect(307, '/api/auth/signup'));

  // First-run setup for private / single-tenant installs (self-closing once a
  // user exists — see routes/setup.ts). Open prefix added to the auth gate below.
  try {
    const setupModule = await import('../routes/setup');
    const setupRouter = setupModule.default;
    if (setupRouter && (typeof setupRouter === 'function' || (setupRouter as any).handle)) {
      // First-run install runs before any tenant exists, and this mount sits
      // BEFORE the global /api gate, so nothing else opens a scope. Give it the
      // system scope so its bootstrap writes are not blocked by the fail-closed
      // pool guard under RLS_ENFORCE=on.
      app.use('/api/setup', establishRequestSystemScope, setupRouter);
    }
  } catch (error) {
    console.error('❌ Failed to mount setup routes:', error);
  }

  try {
    const authEnterpriseModule = await import('../routes/authEnterprise');
    const authEnterpriseRouter = authEnterpriseModule.default;
    if (authEnterpriseRouter && (typeof authEnterpriseRouter === 'function' || (authEnterpriseRouter as any).handle)) {
      // Enterprise auth resolves an identity/tenant before a JWT exists, exactly
      // like /api/auth and /api/auth/sso. It sits before the global /api gate and
      // declared no scope of its own (audit NEEDS_VERIFY #1), so its pre-tenant
      // lookups fail closed under RLS_ENFORCE=on. Make the pre-auth scope
      // explicit rather than relying on fragile cross-mount inheritance.
      app.use('/api/auth/enterprise', preAuthScope, authEnterpriseRouter);
    }
  } catch (error) {
    console.error('❌ Failed to mount enterprise auth routes:', error);
  }

  try {
    const ssoModule = await import('../routes/sso');
    const ssoRouter = ssoModule.default;
    if (ssoRouter && (typeof ssoRouter === 'function' || (ssoRouter as any).handle)) {
      app.use('/api/auth/sso', ssoRouter);
    }
  } catch {
    console.warn('⚠️ SSO helper routes not mounted - continuing without SSO helpers');
  }

  // SCIM 2.0 provisioning — mounted OUTSIDE /api (it uses its own bearer-token
  // auth, not session auth). Inert until SCIM_BEARER_TOKEN/SCIM_ORG_ID are set.
  try {
    const scimModule = await import('../routes/scim');
    const scimRouter = scimModule.default;
    if (scimRouter && (typeof scimRouter === 'function' || (scimRouter as any).handle)) {
      // SCIM provisions users/groups ACROSS a tenant with its own bearer-token
      // auth, mounted outside /api so the global gate never runs. It reads
      // cross-org config tables; the system scope is the correct boundary (a
      // per-user scope would misattribute it). See SYSTEM_SCOPE_PREFIXES.
      app.use('/scim/v2', establishRequestSystemScope, scimRouter);
    }
  } catch {
    console.warn('⚠️ SCIM routes not mounted - continuing without SCIM provisioning');
  }

  // Admin API for SCIM tenant tokens (super-admin only; session-authed under /api).
  try {
    const scimAdminModule = await import('../routes/admin/scim-tenants');
    const scimAdminRouter = scimAdminModule.default;
    if (scimAdminRouter && (typeof scimAdminRouter === 'function' || (scimAdminRouter as any).handle)) {
      // Super-admin console over cross-org SCIM token config, mounted before the
      // global gate. System scope; see SYSTEM_SCOPE_PREFIXES.
      app.use('/api/admin/scim-tenants', establishRequestSystemScope, scimAdminRouter);
    }
  } catch {
    console.warn('⚠️ SCIM tenant admin routes not mounted');
  }

  // SIEM audit feed (admin; org-scoped). Incremental, cursor-paginated NDJSON
  // pull of this tenant's Part 11 audit trail for SOC/SIEM ingestion.
  try {
    const auditSiemModule = await import('../routes/admin/audit-siem');
    const auditSiemRouter = auditSiemModule.default;
    if (auditSiemRouter && (typeof auditSiemRouter === 'function' || (auditSiemRouter as any).handle)) {
      // SIEM audit feed, mounted before the global gate. The router itself
      // filters the audit trail by the caller's org in its SQL WHERE clause, so
      // the system scope does not broaden what it returns; it only lets the
      // (correctly org-filtered) query run at all under RLS_ENFORCE=on. See
      // SYSTEM_SCOPE_PREFIXES.
      app.use('/api/admin/audit', establishRequestSystemScope, auditSiemRouter);
    }
  } catch {
    console.warn('⚠️ SIEM audit feed routes not mounted');
  }

  // Admin API for the SCIM source-IP allowlist (super-admin; session-authed).
  try {
    const scimIpModule = await import('../routes/admin/scim-ip-allowlist');
    const scimIpRouter = scimIpModule.default;
    if (scimIpRouter && (typeof scimIpRouter === 'function' || (scimIpRouter as any).handle)) {
      // Super-admin console over the cross-org SCIM source-IP allowlist, mounted
      // before the global gate. System scope; see SYSTEM_SCOPE_PREFIXES.
      app.use('/api/admin/scim-ip-allowlist', establishRequestSystemScope, scimIpRouter);
    }
  } catch {
    console.warn('⚠️ SCIM IP allowlist admin routes not mounted');
  }

  // RFC 9116 vulnerability disclosure — /.well-known/security.txt (public).
  try {
    const wellKnownModule = await import('../routes/well-known');
    const wellKnownRouter = wellKnownModule.default;
    if (wellKnownRouter && (typeof wellKnownRouter === 'function' || (wellKnownRouter as any).handle)) {
      app.use('/.well-known', wellKnownRouter);
    }
  } catch {
    console.warn('⚠️ .well-known routes not mounted');
  }

  // Global /api auth gate — routes not in the allowlist require session auth.
  // Routes that use their own auth (API keys, webhook signatures, etc.) MUST be listed here.
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const openPrefixes = [
      // Auth & session management
      '/api/auth', '/api/login', '/api/logout', '/api/register',
      // First-run install setup — self-closing once any user exists.
      '/api/setup',
      // Health & observability
      '/api/health', '/api/health/full', '/api/metrics',
      '/api/cortex/health', '/api/claude/health', '/api/ai-gateway/health',
      '/api/claude/models',
      // Public API — secured by x-api-key header auth (see routes/public-api.ts),
      // NOT session auth.  All /api/v1 sub-routes MUST enforce their own API-key
      // middleware; bypassing session auth here relies on that invariant.
      '/api/v1',
      // Billing webhooks — Stripe signature verification, no session auth
      '/api/billing/webhooks',
      // Firecrawl webhooks — signature verification (also mounted before body parser)
      '/api/firecrawl-webhooks',
      // CSP violation reports — sent by browsers from any origin (the
      // reporting endpoint must accept cross-origin POSTs by spec).
      // No session auth; rate-limited at the route level.
      '/api/csp-report',
      // DTC pricing — public marketing page reads this. No tenant data.
      '/api/billing/dtc-pricing',
      // Diagnostics — server-authoritative timestamp + a static "is the
      // server alive" HTML page. No tenant/user data. Public by design so
      // the in-editor Simple Browser can probe connectivity.
      '/api/time', '/api/diag',
    ];
    const fullPath = req.baseUrl + req.path;
    const isOpen = openPrefixes.some(p => fullPath === p || fullPath.startsWith(p + '/'));
    if (isOpen) return next();
    return authMiddleware(req, res, next);
  });

  // Diagnostics — registered AFTER the gate so they pass through the same
  // middleware chain as every other /api route; they remain reachable only
  // because they're explicitly allowlisted above. Both expose nothing beyond
  // a timestamp and a static liveness page.
  // /api/time and /api/diag are likewise served from
  // server/startup/inline-endpoints.ts (module level, so they win). The two
  // definitions were byte-equivalent, so nothing changes by removing these.
  //
  // The gate-placement reasoning in the NOTE above is still correct and still
  // matters — it just belongs to the surviving handlers now, not to these.
  // Reasoning about the middleware position of a route Express never reaches
  // is the kind of comment that reads as a guarantee and is not one.

  console.log('✅ Platform health/auth routes mounted');
}
