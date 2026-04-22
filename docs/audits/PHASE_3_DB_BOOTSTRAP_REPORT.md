# Phase 3 — Separate DB Runtime from DB Bootstrap / Install

**Branch:** `concept2cure-v2`
**Date:** 2026-04-22
**Status:** Complete.

## Goal

Split `server/db.ts` so runtime responsibilities (pool, Drizzle, query,
transaction, health check, migrations) are cleanly separated from
bootstrap/install responsibilities (auth table schema repair, org seed,
GA demo user seed, module-catalog schema creation). Startup may call
bootstrap intentionally, but runtime DB access must no longer carry that
baggage by default.

## Result at a glance

| Metric | Before | After | Notes |
| --- | ---: | ---: | --- |
| `server/db.ts` lines | 435 | 37 | −91%. Now a pure re-export facade. |
| `ensureAuthTables()` body (server/db.ts) | 1 function, ~200 lines | 0 | Moved to `server/db/bootstrap/` |
| Dedicated bootstrap modules | 0 | 3 | auth-schema, seed-default-org, bootstrap index |
| Runtime module (`server/db/runtime.ts`) | — | 205 lines | New, dedicated |
| Existing `server/db/` helpers | `ensureCoreTables.ts`, `getDatabaseUrl.ts`, `ssl.ts` (unchanged) | same | — |

All 266 existing callers of `server/db` (via `../db`, `./db`, `../db.js`,
`../db.ts`) continue to work — the facade re-exports every symbol they
import.

## Files changed

### Created

| File | LoC | Responsibility |
| --- | ---: | --- |
| `server/db/runtime.ts` | 205 | Pool creation + config, Drizzle init, `getPool`, `getDb`, `query` (with slow-query logging), `transaction`, `healthCheck`, `runMigrations`, `pool` and `db` exports |
| `server/db/bootstrap/auth-schema.ts` | 122 | Idempotent column/constraint migrations for `organizations`, `users`, `organization_users`; module-catalog schema creation for `available_modules` and `module_subscriptions`. Pure schema — no seed data. |
| `server/db/bootstrap/seed-default-org.ts` | 79 | Default org + Concept2Cure Therapeutics org + GA demo admin user (`jm.smith@concept2cure.pro`). All idempotent via `ON CONFLICT`. |
| `server/db/bootstrap/index.ts` | 38 | `ensureAuthTables()` orchestrator. Owns the BEGIN/COMMIT/ROLLBACK boundary; calls the schema migrations + seeds inside a single transaction, preserving the original semantics exactly. |

### Modified

| File | Change |
| --- | --- |
| `server/db.ts` | Collapsed from 435-line monolith to 37-line facade that re-exports runtime symbols from `server/db/runtime.ts` and `ensureAuthTables` from `server/db/bootstrap/`. Zero behavior change for callers. |
| `server/startup/services.ts` | Switched the dynamic `await import('../db.js')` to `await import('../db/bootstrap/index.js')` so the "startup → bootstrap" boundary is visible at the call site. The facade still exports `ensureAuthTables` too, for other callers. |

### Not modified (on purpose)

- `server/db/ensureCoreTables.ts` — already a separate module, untouched.
- `server/db/getDatabaseUrl.ts`, `server/db/ssl.ts` — pure helpers, untouched.
- `server/db/initDatabase.ts`, `server/db/setupLumenCortex.ts`, `server/db/maudDb.ts`, `server/db/tenantDb.ts`, `server/db/tenantDbHelper.ts`, `server/db/tenantRls.ts`, `server/db/tenantTransaction.ts` — contain pre-existing typecheck errors but those errors predate Phase 3 (verified by stashing my changes and re-running `tsc`). Not in Phase 3 scope.

## Behavior preserved

- **Pool configuration:** identical constants — `max: isProduction ? 40 : 20`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`, `statement_timeout: 30000`, `idle_in_transaction_session_timeout: 60000`, `allowExitOnIdle: !isProduction`, same SSL config, same `connectionString` source.
- **Startup retry:** `testConnection(retries = 3, delay = 3000)` behavior preserved. Same log messages, same `SKIP_DB_STARTUP_TEST` gate, same `pool.on('error', ...)` handler.
- **`ensureAuthTables()`:** single-transaction semantics preserved. Orchestrator calls the modules in the original order:
  1. `applyAuthSchemaMigrations` — organizations columns, slug back-fill, users columns, email unique constraint, organization_users junction table
  2. `seedOrganizations` — default org, Concept2Cure Therapeutics org
  3. `seedGaDemoUser` — GA demo admin on Concept2Cure org
  4. `applyModuleCatalogSchema` — available_modules and module_subscriptions schema
  Any failure inside the transaction rolls the whole thing back, same as before.
- **Slow-query threshold:** same env resolution (`SLOW_QUERY_THRESHOLD_MS` override, 250ms prod / 100ms dev default), same warn-log shape.
- **Health check / migrations:** same no-DB-pool short-circuit, same logging.
- **Log lines:** `"Initializing PostgreSQL connection pool"`, `"Database connection successful"`, `"Skipping database startup connectivity test (SKIP_DB_STARTUP_TEST=true)"`, `"ensureAuthTables: no DB pool — skipping"`, `"ensureAuthTables: GA demo user verified (...)"`, `"ensureAuthTables: auth schema verified / updated"` all preserved byte-for-byte.
- **Import surface for all 266 callers:** every named import shape (`db`, `pool`, `getPool`, `getDb`, `query`, `transaction`, `healthCheck`, `runMigrations`, `ensureAuthTables`) still resolves through the facade.
- **dotenv + pool initialization timing:** still runs at module-load for compatibility with consumers that read `pool` at import time. No lazy init introduced; that's a larger change for a future phase.

## Tests run

```text
$ npx tsc --noEmit
# Zero errors in server/db.ts, server/db/runtime.ts,
# server/db/bootstrap/* or server/startup/services.ts.
# Pre-existing errors in server/db/initDatabase.ts, setupLumenCortex.ts,
# maudDb.ts, tenantDb.ts, tenantDbHelper.ts, tenantRls.ts,
# tenantTransaction.ts (30 total) — verified present on clean HEAD by
# stash/unstash. Not Phase 3 regressions.

$ npx vitest run tests/routes/ai-entry-point-contract.test.ts
  ✅ 33/33 pass

$ npx vitest run tests/routes/chat-governed-upload.test.ts
  ⚠️ Pre-existing load failure — see Phase 1 report. Unchanged by Phase 3.
```

Phase 3 does not introduce new tests. The split is behavior-equivalent; the
existing governance suite remains the tripwire. A Phase 7 add-on could lint
that bootstrap code lives under `server/db/bootstrap/` and is not
re-imported from random places in the codebase.

## Legacy code deleted, moved, or quarantined

Nothing deleted. The split was pure extraction — every line of logic was
preserved in its new location. The `server/db.ts` file still exists as a
facade and will remain; removing it would break 266 import sites for no
benefit.

## Remaining risks

1. **Pool init is still eager at module load.** Consumers that `import { pool } from '../db'` at the top of their file expect `pool` to exist by the time their imports resolve. Converting to lazy init would be a bigger change and has to be coordinated with the chat-governed-upload test fix mentioned below.
2. **`chat-governed-upload.test.ts` pre-existing failure still unblocked.** The root cause is that `server/services/ana-ri/command-executor.ts` calls `getPool()` at module top-level, and the test's `vi.mock('../../server/db.js', ...)` stubs `pool` but not `getPool`. Phase 3 did not change the failure shape. A minimal fix is a one-line mock update in the test file. I recommend tackling it as the first chunk of Phase 4 (chat decomposition) — fixing the mock will unblock governed-upload verification across Phases 4–6.
3. **Pre-existing `server/db/*` typecheck errors** (`initDatabase.ts`, `setupLumenCortex.ts`, `maudDb.ts`, `tenantDb.ts`, `tenantDbHelper.ts`, `tenantRls.ts`, `tenantTransaction.ts`) remain. Scoping those into Phase 3 would have bloated the change; recommend a follow-on cleanup commit or Phase 8.
4. **`server/src/db/index.ts` compat shim** still re-exports `query as q` from `../../db`. It's marked `@deprecated` already. Leave until Phase 6/7 route-ownership cleanup picks it up.

## Commit

See follow-up commit on `concept2cure-v2`.
