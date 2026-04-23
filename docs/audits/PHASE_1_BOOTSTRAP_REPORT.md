# Phase 1 — Composition Root Split (`server/index.ts`)

**Branch:** `concept2cure-v2` (per CLAUDE.md; the harness-directed
`claude/architecture-consolidation-c2c-v2-ZxSbD` was overridden).
**Date:** 2026-04-22
**Status:** Complete.

## Goal

Turn `server/index.ts` into a true composition root: early process setup,
app construction, and delegation into owned startup modules. Everything else
leaves the file.

## Result at a glance

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| `server/index.ts` lines | 1,137 | 149 | −87% |
| `server/index.ts` imports | 67 | 20 | −70% |
| `app.*` mount sites in `server/index.ts` | 52 | 0 | −100% |
| Mid-file `import` statements in `server/index.ts` | 9 | 0 | −100% |

All 36 unique route mount keys from the original file are preserved in the
new layout (verified by key-by-key diff). All 12 live `register*Routes`
calls are preserved.

## Files changed

### Created (owned startup modules)

| File | LoC | Responsibility |
| --- | ---: | --- |
| `server/startup/env.ts` | 92 | Env validation, debug logger factory, startup flags |
| `server/startup/middleware.ts` | 132 | Telemetry, security, performance, body parsers, cookie parser, beta fence, immutability policy, debug request logging |
| `server/startup/inline-endpoints.ts` | 158 | `/healthz`, `/readyz`, `/api/health`, `/api/health/full`, `/api/metrics`, `/api/ai-gateway/health`, `/api/time`, `/api/diag`, `/api/shadow/health` |
| `server/startup/frontend.ts` | 36 | Vite HMR vs. static serving branch |
| `server/startup/services.ts` | 233 | DB connection verification, Redis, Proof System, auth-table bootstrap trigger, feature toggle seed, AnA capability seed, Python backend stub, parallel services (chain monitor, pattern registry, socket server, scheduled jobs, hocuspocus), `/api` 404 catch-all |
| `server/startup/routes.ts` | 398 | Pre-start + post-start route registration, AI circuit breaker factory, static-data guard helper |
| `server/startup/shutdown.ts` | 101 | Graceful shutdown, SIGTERM/SIGINT handlers, unhandled rejection + uncaught exception |
| `server/startup/types.ts` | 5 | Shared types (`DebugLogger`) |

### Modified

| File | Change |
| --- | --- |
| `server/index.ts` | Rewritten as slim composition root. Orchestrates the startup modules in the correct order, preserves all load-bearing initialization sequencing (dotenv → IPv4 DNS → OTel await → Sentry side effect → app construction → env validation → shutdown wiring → middleware → inline endpoints → pre-start routes → service init → post-start routes → error handler → HTTP listen → parallel services). |

### Not modified

No other files were touched in Phase 1.

## Behavior preserved

The following load-bearing properties of the original `server/index.ts` were
preserved exactly:

- **Init order:**
  1. `dotenvConfig({ override: false, quiet: true })` runs before any env read
  2. Sentry side-effect import
  3. `dns.setDefaultResultOrder('ipv4first')` before any DB/HTTP work
  4. `await initializeOpenTelemetry()` before express/services imports
  5. Audit + RBAC side-effect imports retained
- **Env validation:** Same required-var rules (DATABASE_URL or
  DATABASE_NEON_NEW_SECRET, JWT_SECRET or env-specific variant), same
  `assertNoStaticDataFlagsInProduction` check, same `process.exit(1)` on
  missing criticals, same ANTHROPIC_API_KEY warning, same production
  recommended-var warnings.
- **Middleware order:** Fast-path `/healthz` / `/readyz` / `/api/health` are
  mounted **before** security/rate-limit, as in the original. The full stack
  (security → redis rate limiter → performance → http logger → firecrawl raw
  → JSON parser → urlencoded → beta fence → cookie parser → immutability)
  runs in the exact pre-refactor order.
- **Immutability policy:** Same destructive-method detection
  (`DELETE` or `POST` with `bulk-delete` in path), same 21 CFR Part 11
  response payload.
- **Health endpoints:** `/healthz`, `/readyz`, `/api/health`,
  `/api/health/full`, `/api/metrics` (Prometheus format with DB pool metrics),
  `/api/ai-gateway/health`, `/api/time`, `/api/diag`, `/api/shadow/health`
  all mount at the same path with the same response shape.
- **Graceful shutdown:** Same 6 steps in same order — HTTP drain (10s force
  close), Python kill, Redis rate-limiter close, AI action queue drain (10s) +
  SSE close + Redis close, performance cleanup, DB pool end, `process.exit(0)`.
  Same `unhandledRejection` counter semantics (exit after 10), same
  `uncaughtException` fatal handling.
- **Route mounts:** All 36 unique mount paths, all 12 live `register*Routes`
  calls, and all `createCircuitBreakerMiddleware('ai-service', …)` parameters
  preserved. The two-phase split (pre-HTTP-listen vs. post-early-services)
  matches the original `startServer()` ordering exactly.
- **Frontend serving:** Same `NODE_ENV === 'production' || SKIP_VITE` branch,
  same `setupVite(app, httpServer)` vs. `serveStatic(app)` call, same fallback
  `app.get('/')` on static-serve failure.
- **Parallel services at startup:** Same `Promise.allSettled` with chain
  integrity monitor, RIM pattern registry, socket server, scheduled jobs,
  and hocuspocus — same failure isolation behavior.
- **Logging:** Every console.log / console.warn / console.error message
  preserved byte-for-byte. The one exception is a single log line tied to an
  unused stub (see "Deletions" below).

## Tests added or updated

None in Phase 1. Phase 1 is a structural split; the governance-contract
tests (`ai-entry-point-contract.test.ts`) continue to pass unchanged,
which is the correct outcome — the split must not change what they verify.

## Tests run

```text
$ npx tsc --noEmit
# 0 errors in server/index.ts or server/startup/*
# (Pre-existing unrelated errors in client/src/*, tests/*, server/services/* remain.)

$ npx vitest run tests/routes/ai-entry-point-contract.test.ts tests/routes/chat-governed-upload.test.ts
  ai-entry-point-contract.test.ts:  33 / 33 passed  ✅
  chat-governed-upload.test.ts:     fails to load (pre-existing — verified by stashing
                                     my changes and re-running on clean HEAD; same
                                     failure. Cause: module-level getPool() call in
                                     server/services/ana-ri/command-executor.ts
                                     throws when DATABASE_URL is absent in the test
                                     env. Not introduced by Phase 1 and listed as a
                                     remaining risk.)
```

## Legacy code deleted, moved, or quarantined

Four genuinely dead pre-existing imports/locals from `server/index.ts` were
NOT carried over into the new composition root. Each was verified dead in
the pre-refactor HEAD:

1. `import { registerSubscriptionsRoutes } from './routes/reports/subscriptions-routes'`
   — imported but never called.
2. `import { getSecureOrgId } from './utils/tenantContext'` — imported but
   never called.
3. `import { drizzle } from 'drizzle-orm/node-postgres'`,
   `import { and, eq, desc } from 'drizzle-orm'`,
   `import { fda510kStageProgress, fda510kProjects, projects, draftingTasks } from '@shared/schema'`,
   and the `const db = drizzle(pool)` local they fed — the local was never read.
4. `const storageClient = { … }` stub and its `console.log('✅ Storage client
   initialized (VaultDMS deprecated)')` — the object was never consumed. The
   log line was kept out of the new file deliberately; it advertised a
   capability that did not exist.

The upstream route handlers for `subscriptions-routes`, `tenantContext`,
`drizzle-orm`, and the schema exports are untouched — only the dead
references from `server/index.ts` are gone. No router family was dropped.

No legacy code was moved to `server/legacy/` in Phase 1. (That operation
belongs to Phase 2 for retrieval and is scoped separately.)

## Remaining risks

1. **`chat-governed-upload.test.ts` pre-existing failure.** The suite throws
   at collect time because `server/services/ana-ri/command-executor.ts`
   calls `getPool()` at module top-level. This is a real bug in the test's
   mock setup (the vi.mock for `server/db.js` covers `pool` but not
   `getPool`) and should be fixed either in Phase 3 (DB runtime cleanup) or
   immediately as a standalone fix. Not a Phase 1 regression — verified by
   stashing and running on clean HEAD.
2. **Route mount ordering sensitivity.** The original file mounted some
   routes outside `startServer()` and some inside it. The split preserves
   this two-phase behavior via `registerPreStartRoutes` and
   `registerPostStartRoutes`. If Phase 6 wants to collapse this to a single
   phase, it must carefully reorder service init accordingly — e.g. AI
   Actions Redis/queue init happens inside the pre-start route mount block
   because it is tightly coupled to the `/api/ai-actions` mount.
3. **Dynamic `import()` paths with `./` prefix.** Several routes are
   dynamic-imported inside the startup modules (e.g.
   `await import('../services/ai-actions/index')`). The relative paths were
   updated from `./services/...` (file-scope in `server/index.ts`) to
   `../services/...` (now inside `server/startup/`). Path audit confirmed
   every dynamic import was remapped correctly.
4. **Mid-file imports.** The original file had 9 mid-file `import`
   statements (e.g. line 333 `cookie-parser`, line 378 `getPool`, line 572
   `circuitBreaker`). These are all now at the top of their owning module.
5. **Pool initialization timing.** `server/db.ts` initializes the pool at
   module load (synchronously). The composition root calls `getPool()`
   after env validation, matching the original ordering. If Phase 3 makes
   pool creation lazy, the composition root will need to adapt.

## Commit

See follow-up commit on `concept2cure-v2`.
