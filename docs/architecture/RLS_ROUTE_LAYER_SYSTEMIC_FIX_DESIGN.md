# Route-Layer RLS Scope — Systemic Fix Design

**Status:** Design (decision-ready; NOT yet approved for implementation)
**Date:** 2026-08-07
**Companion:** [`docs/reports/rls-fail-closed-audit.md`](../reports/rls-fail-closed-audit.md)
(the census this design responds to)
**Scope:** clear the ~310 live `RLS_ENFORCE=on` fail-closed 500s at the route
layer with one central mechanism, not ~50 per-router tranche PRs.

> **This change is load-bearing and security-critical** — it touches the
> authenticated request path of essentially every tenant route. It must not be
> implemented without explicit sign-off. This document exists so that sign-off
> rests on a precise, code-grounded plan rather than a sketch. §7 states the
> exact decision being asked for.

---

## 1. The defect, precisely

Under `RLS_ENFORCE=on` (the only value production accepts),
`server/db/poolInstrumentation.ts` **fails closed**: any non-infrastructure
`pool.query(...)` or `pool.connect(...)` that runs with no active
`getTenantScope()` (AsyncLocalStorage) throws
`[tenant-rls] FAIL-CLOSED` before touching the database
(`poolInstrumentation.ts:344`, `:369`). A request therefore needs an **active
ALS tenant scope on its call stack** at the moment a handler touches the DB, or
it 500s.

The audit found **329/413 mounted route surfaces (79.7%) fail closed** — a
whole-application outage class with a single uniform cause, not a scatter of
independent bugs. The cause:

- The **only** middleware that establishes a request tenant scope today is
  `requireTenantContext` (`server/middleware/tenantContext.ts:166`). It wraps
  `next()` in `runWithTenantScope(...)` **and** sets `req.dbClient`
  (`:301`, `:313-322`).
- The two auth middlewares that actually run on the request path —
  `authMiddleware` (`server/auth.ts:110`) and `authenticateToken`
  (`server/middleware/auth.ts:111`) — **authenticate and then call a bare
  `next()`**. They resolve and verify `req.user` (org id + role) but open no
  scope and set no `req.dbClient`.

So the tenant identity is *known and verified* by the time a handler runs; it is
simply never turned into a DB scope.

---

## 2. The one fact that reshapes the fix: the global `/api` gate runs first

The audit's recommendation assumed "a change to the auth middleware alone is
necessary but not sufficient, because a large subset of FC mounts run no auth
middleware at all." Reading the composition root shows this is **not the case**
for routes under `/api`, and it changes the recommended fix.

`server/startup/routes.ts` registers `registerPlatformRoutes` **first**
(`routes.ts:89`), before every other route family. Inside it,
`register-platform-routes.ts:253` installs the global gate:

```js
app.use('/api', (req, res, next) => {
  const isOpen = openPrefixes.some(p => fullPath === p || fullPath.startsWith(p + '/'));
  if (isOpen) return next();
  return authMiddleware(req, res, next);   // ← runs for EVERY non-open /api route
});
```

Because this is registered before the inline / core / regulatory / document /
governance / ind / tenant / project / clinical-intel / advanced-platform
families (all registered later in `routes.ts`), Express runs the gate — and thus
`authMiddleware` — ahead of all of them. The mounts the audit flagged as "no
auth middleware" (e.g. `/api/documents`, the grp8 bare `app.use` project/tenant
family) have no *mount-level* middleware, but they are still authenticated by
the upstream gate. **`req.user` is populated for them.**

**Consequence:** making `authMiddleware`'s post-auth `next()` establish the
scope + `req.dbClient` fixes essentially the entire FC inventory that lives under
`/api`, in one place. The registrar-layer rewrite the audit proposed is only
needed for the residue that does **not** pass through the gate (§4.3).

> ⚠️ **This is the single most important thing the implementation must prove
> before relying on it.** A test must assert that the gate's `authMiddleware`
> actually runs (and now establishes a scope) for a representative sample of the
> "no mount-level auth" FC routes — e.g. `/api/documents`, `/api/projects`,
> `/api/tenant-config`. `server/bootstrap/__tests__/api-auth-gate.test.ts`
> already exercises the gate and is the natural home for it. If any FC route is
> reachable *without* passing the gate, it needs §4.3 handling; the test is what
> tells us which.

---

## 3. What a correct fix must include (from the audit, verified against code)

1. **Open a real ALS tenant scope** (`runWithTenantScope`) around the downstream
   handler — this is what clears the pool-instrumentation fail-closed for every
   global-pool / drizzle / service / store router (the GP/GD/SVC/STORE/MIX
   classes, ~285 of the 329).

2. **Set `req.dbClient`** (a `LazyRequestDbClient`), not just the ALS scope.
   `requestDb(req)` / `getDb(req)` read `req.dbClient` and throw
   `MissingRequestDbContextError` when it is null — an *application-level* throw
   independent of RLS. The **~24 `RQ` routers** (quality, review, taskBoard,
   ivd-completeness, batch-draft, charters, change-propagation,
   mdx-industry-context, mdx-client-review, mdx-rbm, conversation-thread, cro,
   snowglobe, onboarding, tenant-config, tenant-traceability,
   tenant-quality-validation, tenant-ctq-factors, documents, …) stay broken
   without it. `requireTenantContext` already does exactly this
   (`tenantContext.ts:291-306`); the fix reuses that code.

3. **Idempotency.** The mechanism must detect an already-active scope and not
   clobber it, so the **6 self-scoped `SCOPED_OK` mounts** (`/api/v1`,
   `/api/admin` securityHealth, `/api/auth/sso`, `/api` pre-auth gate, the
   `requireTenantContext` route inside `/api/ana`) and the **8 mounts already
   fixed on PR #1276/#1277** survive unchanged.

4. **SYSTEM carve-outs get a *system* scope, never a per-user scope** (§4.2).

### 3.1 The `governed()` claim, corrected

The audit listed "fix the shared `governed()` helper" as a **MUST**, reasoning
that it calls `pool.connect()` before `setTenantContextTx`, so `connect()`
rejects first. Reading the instrumentation shows this is true **only when no ALS
scope is active** — which is exactly the state the central fix eliminates:

- `governed()` (a per-file local helper, ~20 copies, e.g.
  `protocol-development.ts:63`) imports the **instrumented** canonical pool
  (`import { pool } from '../db'` → `runtime.ts:274`, instrumented at `:63`).
- With a scope active, `instrumentedConnect` (`poolInstrumentation.ts:365`) does
  **not** reject — it returns a client already wrapped by `wrapClientForScope`
  (`:392`). The subsequent `client.query('BEGIN')` triggers the wrapper to inject
  the LOCAL tenant vars from the ALS scope (`:287-291`).
- `governed()` then calls `setTenantContextTx(client, orgId)`
  (`governed-tenant-context.ts:25`), which re-sets the same vars with
  `set_config(..., true)` (LOCAL). `orgId` derives from the same JWT org as the
  scope, so this is a redundant, harmless re-statement — not a conflict.

**Therefore the ~20 `GOV` routers clear the moment the central scope is open;
no per-file `governed()` edit is required to stop the 500.** Refactoring
`governed()` to reuse the request-scoped client is worthwhile *consistency*
cleanup, but it is **not a blocker** and should not gate this fix. (This is the
one place this design departs from the audit's §5, and it makes the fix
smaller.)

---

## 4. Design

### 4.1 Primary lever — establish scope in the auth middlewares (post-auth)

Extract the scope-establishment tail of `requireTenantContext`
(`tenantContext.ts:291-322`) into a shared, idempotent helper and call it from
both auth middlewares right where they currently call the bare `next()`:

```ts
// server/middleware/establishRequestTenantScope.ts  (new)
export function establishRequestTenantScope(
  req, res, next,
  ident: { tenantId: string; role: string | null; orgUuid: string | null },
) {
  // Idempotent: a scope already on the stack (self-scoped mounts,
  // requireTenantContext) wins; do not clobber it.
  if (getTenantScope() || req.dbClient) return next();

  const lazy = new LazyRequestDbClient(getPool(), async (client) => {
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [ident.tenantId]);
    await client.query("SELECT set_config('app.current_user_role', $1, false)", [ident.role ?? '']);
    await client.query("SELECT set_config('app.current_org_id', $1, false)", [ident.orgUuid ?? '']);
  });
  req.dbClient = lazy;
  const release = () => { req.dbClient = null; void lazy.release(); };
  res.on('finish', release);
  res.on('close', release);

  return runWithTenantScope(
    { tenantId: ident.tenantId, orgUuid: ident.orgUuid, role: ident.role, source: 'request', caller: req.path },
    () => next(),
  );
}
```

- **`authMiddleware` (`server/auth.ts:210`)** — replace `return next();` with
  `return establishRequestTenantScope(req, res, next, { tenantId: String(parsedOrganizationId), role: resolvedRole, orgUuid: null });`.
  This runs on every non-open `/api` route via the global gate → covers the bulk
  of the inventory.
- **`authenticateToken` (`server/middleware/auth.ts`)** — same substitution at
  its post-auth `next()`, for routers gated by it directly through `mountAll`.
- **`requireTenantContext`** — refactor its inline tail (`:291-322`) to call the
  same helper, so there is exactly one implementation. Behavior is unchanged (it
  already does this); the idempotency guard makes double-application a no-op.

Why the auth middlewares and not a fresh registrar middleware as the primary
lever: they are the one point where the **verified** tenant identity already
exists (membership checked, `req.user` set). A registrar middleware would either
re-do that verification or trust an unverified header. Reusing the post-auth
point keeps the fix downstream of the security check that already passed.

### 4.2 SYSTEM carve-outs — a parallel system-scope helper

These routes read/write **across** tenants; a per-user org scope would RLS-filter
them to the caller's org (wrong results, or a super-admin silently seeing only
their own org). They must run under `runWithSystemTenantScope` instead. Provide
`establishRequestSystemScope(req, res, next, caller)` and apply it explicitly at
these mounts (which are mounted **before** the gate or **outside** `/api`, so the
primary lever does not touch them):

| Class | Mounts | Handling |
|---|---|---|
| Cross-tenant admin consoles | `/api/admin/master`, `/api/admin/business`, `/api/admin/access` (grp8); `/api/admin/scim-tenants`, `/api/admin/audit`, `/api/admin/scim-ip-allowlist` (grp7); `/api/tenant-export` (grp3) | `establishRequestSystemScope` (after their own admin authZ) |
| SCIM (own bearer auth, outside `/api`) | `/scim/v2` | `establishRequestSystemScope` |
| Pre-auth / no-tenant-yet | `/api/setup` (first-run, no org exists), `/api/users`·`/api/user` | system scope for setup; users needs its own review (no mount auth today) |
| Auth family (already correct) | `/api/auth`, `/api/v1/auth`, `/api/auth/sso`, `/api/auth/enterprise` | **leave as-is** (own pre-auth scope); make `/api/auth/enterprise` explicit (NEEDS_VERIFY #1) |
| Public/global-library reads (`csr_reports`, no `organization_id`) | csr-intelligence, csr-analytics, analytics-routes | system/public read scope (functional 500s today, not tenant leaks) |
| Already self-scoped | `/api/v1`, `/api/admin`, `/api/auth/sso`, `requireTenantContext` route in `/api/ana` | idempotency guard → untouched |

`admin/master`·`business`·`access` are under `/api` and **not** in the open
allowlist, so today the gate's `authMiddleware` runs for them — meaning after
§4.1 they would get a **per-user** scope. They must be moved to the system-scope
helper (or added to a "system-scoped" set the primary lever recognizes) so the
fix does not *break* cross-org admin reads. This is the single most delicate
interaction and needs a dedicated test per console.

### 4.3 Registrar backstop — only for mounts not behind the gate

For any tenant mount the §2 test proves is reachable **without** passing the
global gate (mounted before it, or outside `/api`), attach the scope explicitly
at the mount. Two mechanics:

- `mountAll(app, [...], authenticateToken)` — since `authenticateToken` now
  establishes scope, adding it as the group middleware fixes those groups
  (`mount-routes.ts:60` already threads group middleware).
- Root-mounted routers outside `/api` (documentOrchestration, esgSubmission) —
  wrap at their `app.use(...)`.

This is the bounded, enumerable residue — **not** ~50 tranches. The §2 test
turns "which mounts need this" from guesswork into a list.

### 4.4 Independent one-offs (fix regardless of the scope work)

- **`/api/health/full`** (`lib/health-check.ts`) — probes with
  `SELECT 1 as check, NOW() as time`, which is not in `INFRASTRUCTURE_QUERIES`
  and so fails closed → reports DB unhealthy (503). Fix: use the exact infra
  probe string, or add the probe to `INFRASTRUCTURE_QUERIES`.
- **`/api/graphrag`** (`graphrag.ts`) — `req.app.pool` is `undefined`; 500s
  regardless of RLS. Wire the pool.

---

## 5. Test & verification plan

The fix is fail-*closed* by nature, which is the ideal test posture: a
regression 500s loudly rather than leaking silently.

1. **Gate-coverage test (§2, gating the whole approach).** In
   `api-auth-gate.test.ts`, assert that an authenticated request to a
   representative "no mount-level auth" FC route (`/api/documents`,
   `/api/projects`, `/api/tenant-config`) has an active tenant scope by the time
   the handler runs, and that an unauthenticated request still 401s at the gate.
2. **Scope + `req.dbClient` unit test** for `establishRequestTenantScope`:
   idempotency (active scope → bare next), scope contents, `req.dbClient` set and
   released on `finish`/`close`.
3. **RQ-router integration test** (PGlite): a `requestDb(req)` route behind the
   gate returns rows instead of `MissingRequestDbContextError`.
4. **GOV-router integration test** (PGlite): a `governed()` route
   (protocol-development) commits under an active scope — proving §3.1 without a
   per-file edit.
5. **SYSTEM carve-out tests**: `/api/admin/master` (and siblings) read across
   orgs under the system scope; a per-user scope would fail this — the test pins
   the carve-out.
6. **Self-scoped idempotency tests**: `/api/v1`, `/api/auth/sso`, and a
   #1276/#1277 `requireTenantContext` route still behave identically.
7. **CI guard** (follow-up): extend the tenant-isolation guard family so a new
   tenant mount that neither passes the gate nor declares a scope fails CI —
   turning this from a one-time fix into a standing invariant, mirroring
   `check-lineage-save-gate` / `check-artifact-provenance`.

---

## 6. Rollout

1. Land §4.4 one-offs + the §5.1 gate-coverage test **first** (independent, low
   risk, and the test de-risks everything after it).
2. Land `establishRequestTenantScope` + the `authMiddleware` /
   `authenticateToken` / `requireTenantContext` refactor behind the existing
   `RLS_ENFORCE` staging path; verify on staging with `RLS_ENFORCE=on` that the
   fail-closed metric (`tenant_session_var_missing_total`) collapses toward the
   carve-out set only.
3. Land the SYSTEM carve-outs (§4.2) — ideally in the **same** PR as §4.1 so the
   window where admin consoles get a wrong per-user scope never ships.
4. Sweep the §4.3 residue the gate-coverage test enumerated.
5. Fold #1276/#1277 into the pattern (they become the last tranche, not the
   template) and retire the per-router approach.
6. Add the §5.7 CI guard.

Each step is independently revertable; steps 1–2 carry the fail-closed metric as
a live gauge of progress.

---

## 7. The decision being requested

Approve implementing the **primary lever (§4.1) + SYSTEM carve-outs (§4.2) as
one PR**, preceded by the **§4.4 one-offs + §5.1 gate-coverage test**, then the
**§4.3 residue** and **§5.7 CI guard** as follow-ups — in place of ~50
per-router tranche PRs.

Specifically, sign-off is requested that:
- the auth-middleware post-auth point (not a new registrar middleware) is the
  correct primary lever, given the global gate runs first (§2);
- `governed()` is left as-is for now (§3.1), refactor deferred;
- the SYSTEM carve-out list (§4.2) is complete and correct — this is the part
  where a wrong call misroutes cross-tenant admin reads, so it warrants explicit
  review;
- the two `NEEDS_VERIFY` items (`/api/auth/enterprise`, `/api/tenants` POST) are
  resolved as part of the work (test + make explicit; system scope for the
  create path).

Until that sign-off, this stays a document. No route-path or auth-middleware
code changes will be made on its basis.
