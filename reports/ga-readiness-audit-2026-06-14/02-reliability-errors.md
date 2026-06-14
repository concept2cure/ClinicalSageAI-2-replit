# GA Readiness Audit — Reliability & Error Handling

**Date:** 2026-06-14
**Scope:** `server/` and `services/` application code (Node/TypeScript backend + Python services). Excludes React client, raw DB schema/migrations.
**Auditor focus:** Outage / crash / hung-request / data-corruption / silent-failure risks under production load.

---

## Executive Summary

The codebase shows **above-average reliability engineering** for a clinical SaaS: a centralized graceful-shutdown module with HTTP drain + dependency teardown, a tuned pg `Pool` (connection/statement/idle-in-tx timeouts, pool error handler), a real circuit-breaker implementation, and process-level `uncaughtException`/`unhandledRejection` handlers. This is not a greenfield-quality codebase.

However, several GA-relevant gaps remain that can cause **crashes, hung requests, or silent data loss under load**:

- **Conflicting / dead process-error handlers.** Two separate modules register `uncaughtException`/`unhandledRejection` with *opposite* policies (crash vs. log-and-continue). The "log-and-continue" module (`globalErrorHandler.ts`) is dead code, but the active policy (`shutdown.ts`) hard-exits on the *first* uncaught exception — correct for safety but means any unhandled async error in a request path takes the whole multi-tenant process down.
- **`transaction()` rollback masks original error** and can throw on a dead connection, surfacing the wrong error and potentially leaving a connection in a bad state.
- **Widespread no-op `.catch(() => {})`** on cache write-through, telemetry, and cleanup — mostly acceptable for best-effort paths, but several swallow failures on paths that matter (idempotency store, audit/telemetry persistence).
- **External-call resilience is inconsistent.** Some clients set axios timeouts; many raw `fetch()` calls (133 sites) have no timeout/AbortSignal, risking hung requests when OpenAI/HuggingFace/FDA endpoints stall.

**Verdict (Reliability):** see end of report.

---

## Findings

(severity-tagged; file:line cited)

### [HIGH] Conflicting and dead process-error handlers — uncaught-exception policy ambiguity

**Files:**
- `server/startup/shutdown.ts:97-110` (ACTIVE — registered from `server/index.ts:92`)
- `server/utils/globalErrorHandler.ts:44-81` (DEAD — never imported/called anywhere)

**Evidence:** `registerGlobalErrorHandlers` / `initializeStabilityMeasures` are exported but grep shows zero call sites outside their own file. The active handlers live in `shutdown.ts`:
- `unhandledRejection`: logs, increments a counter, exits only after **10** rejections.
- `uncaughtException`: `process.exit(1)` immediately.

**Impact:**
1. The dead `globalErrorHandler.ts` documents a "log-and-continue in production" policy that is **not** what actually runs. A maintainer reading it will have a false model of crash behavior. Worse, if someone wires it up later, it would *override* the safe crash policy with the unsafe "continue after corruption" policy (process state after an uncaught exception is undefined — continuing risks data corruption in a regulated system).
2. The active `uncaughtException` handler exits **without draining HTTP / closing the DB pool** (it does not call `gracefulShutdown`). In-flight requests are dropped and connections are not cleanly closed.
3. The `unhandledRejection` "exit after 10" counter never resets, so a long-lived process that accumulates 10 *unrelated* rejections over weeks will eventually exit for no acute reason.

**Fix:** Delete `globalErrorHandler.ts` (or repurpose it as the single source of truth). Make `uncaughtException` route through `gracefulShutdown` (best-effort drain with a short timeout) before exit. Reset the rejection counter on a rolling window, or exit immediately on the first unhandled rejection in production after logging to Sentry.

---

### [HIGH] `transaction()` rollback masks the original error and can throw on a broken connection

**File:** `server/db/runtime.ts:184-201`

**Evidence:**
```ts
} catch (error) {
  await client.query('ROLLBACK');   // <-- not guarded
  throw error;
} finally {
  client.release();
}
```

**Impact:** If the connection is already broken (e.g. the failure that triggered the catch was a connection reset, or statement_timeout killed the session), `client.query('ROLLBACK')` itself throws. That thrown rollback error **replaces** the original error via the unhandled await, so callers see a misleading "connection terminated" instead of the real cause, and the `throw error;` line never runs. In some pg failure modes `client.release()` without `release(true)` can return a poisoned connection to the pool. This is the single most-used transaction primitive (23+ call sites), so the blast radius is every multi-step write.

**Fix:**
```ts
} catch (error) {
  try { await client.query('ROLLBACK'); } catch (rbErr) { logger.error('ROLLBACK failed', { rbErr }); }
  throw error;
} finally {
  client.release();
}
```
Consider `client.release(error)` to evict poisoned connections from the pool.

---
