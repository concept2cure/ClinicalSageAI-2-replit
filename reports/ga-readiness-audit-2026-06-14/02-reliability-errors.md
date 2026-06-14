# GA Readiness Audit — Reliability & Error Handling

**Date:** 2026-06-14
**Scope:** `server/` and `services/` application code (Node/TypeScript backend). Excludes React client/UI and raw DB schema/migrations.
**Auditor focus:** Outage / crash / hung-request / data-corruption / silent-failure risks under production load.
**Method:** Independent source review — grep for error-handling primitives + read of entrypoints, DB layer, schedulers, external clients. All findings cite `file:line` and were verified against source.

---

## Executive Summary

This codebase shows **above-average reliability engineering** for a clinical SaaS. Verified strengths:

- **Centralized graceful shutdown** (`server/startup/shutdown.ts`): HTTP drain with 10s force-close, Python subprocess SIGTERM, Redis teardown, AI action-queue drain, DB pool `end()`, wired on `SIGTERM`/`SIGINT`.
- **Tuned pg `Pool`** (`server/db/runtime.ts:47`): `connectionTimeoutMillis`, `statement_timeout` (30s), `idle_in_transaction_session_timeout` (60s), `max` scaled by env, retrying startup probe, and a `pool.on('error')` handler.
- **Active error handler scrubs internals** (`server/src/mw/observability.ts:141`): 5xx responses return a generic message in production; no stack trace in the response body.
- **Process-level handlers exist** for `uncaughtException` / `unhandledRejection`.
- **Schedulers are mostly well-guarded**: `setInterval` callbacks wrap async work in `.catch`/try-catch, and timers are `unref()`'d (e.g. `driftSentinelSweep.ts:57`, `fdaIntegrationService.ts:785`).
- **AI Gateway** (`server/services/ai-gateway/gateway.ts`) has retry-with-backoff + model fallback + streaming chunk watchdog; an Express-level circuit breaker (`server/middleware/circuitBreaker.ts`) fronts AI routes.

It is **not** a greenfield-quality codebase. However, several GA-relevant gaps remain that can cause crashes, hung requests, or silent data divergence under load. No outright BLOCKER was found, but two HIGH issues affect every multi-step write and the regulated submission-data path.

**Reliability GA Verdict: CONDITIONAL** — ship-able after addressing the two HIGH transaction/write-through items and adding timeouts to the unbounded `fetch()` external clients. Details below.

---

## Findings

Severity tags: **[BLOCKER]** (will cause outage/corruption at GA), **[HIGH]** (likely under load), **[MEDIUM]**, **[LOW]**.

### [HIGH] `transaction()` rollback is unguarded — masks original error, risks poisoned pool connection

**File:** `server/db/runtime.ts:184-201` (re-exported from `server/db.ts`, ~266 callers)

```ts
export async function transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');   // <-- NOT guarded
    throw error;
  } finally {
    client.release();                 // <-- always release(); never release(err)
  }
}
```

**Impact:** This is the most-used transaction primitive in the app (every multi-step write flows through it). If the connection is already broken when the catch fires (connection reset, `statement_timeout` killed the session, `idle_in_transaction_session_timeout` fired), `client.query('ROLLBACK')` itself **throws**. That rollback error then propagates *instead of* the original error (`throw error;` never executes), so callers and logs see a misleading "connection terminated" rather than the real cause. Separately, `client.release()` is always called without an error argument, so a poisoned connection is returned to the pool instead of being evicted (`client.release(err)` destroys it). Under load with intermittent DB blips this both obscures root cause and can recirculate bad connections.

**Fix:**
```ts
} catch (error) {
  try { await client.query('ROLLBACK'); }
  catch (rbErr) { logger.error('ROLLBACK failed', { rbErr }); }
  throw error;
} finally {
  client.release();
}
```
Prefer `client.release(error)` (or `release(true)`) in the rollback path to evict poisoned connections.

---

### [HIGH] Fire-and-forget write-through to canonical submission source is silently swallowed — data divergence in regulated eCTD path

**Files (representative):**
- `server/api/cmc/batchRecordRoutes.ts:146, 245, 393`
- `server/api/cmc/specificationRoutes.ts:142, 249, 347`
- `server/api/cmc/routes.ts:83`
- Target: `server/services/cmc-write-through.ts:428` (`writeThroughToCanonicalSource`)

**Evidence:** Route handlers write the primary record (e.g. `cmc_batch_records`) inside the request, then propagate it to the **canonical Module-3 source object** used for eCTD submission assembly as fire-and-forget with a fully silent catch:
```ts
const batch = result.rows[0];
if (batch.project_id) {
  writeThroughBatchRecord(Number(tenantId), batch.project_id, String(batch.id), batch).catch(() => {});
}
res.status(201).json({ success: true, data: batch, ... });   // 201 returned regardless
```

**Impact:** If the write-through fails (transient DB error, validation throw, deadlock), the user-facing record exists and the API returns `201`, but the canonical source object feeding the regulatory submission is silently missing or stale. There is **no log, no retry, no reconciliation, no metric** — the empty `() => {}` discards the error entirely. In a 21 CFR Part 11 / eCTD context this is a silent data-integrity divergence between the operational record and the submission corpus. Affects batch records, specifications, change controls, comparability, process validation, analytical methods.

**Fix:** At minimum, log the failure with `orgId`/`recordId`/`sourceType` and emit a metric. Better: enqueue a durable retry (outbox table or job) so the canonical source eventually converges, or perform the canonical write in the same transaction as the primary write.

---

### [HIGH] Conflicting / dead process-error handler with an unsafe "log-and-continue" policy

**Files:**
- ACTIVE: `server/startup/shutdown.ts:97-110` (registered via `server/index.ts:92`)
- DEAD: `server/utils/globalErrorHandler.ts:44-108` — `grep` confirms zero external call sites; only self-references inside the file.

**Evidence:** The active handlers:
- `unhandledRejection` (shutdown.ts:98): logs, increments a counter, `process.exit(1)` only after **10** rejections; the counter **never resets**.
- `uncaughtException` (shutdown.ts:107): `process.exit(1)` immediately, but **without** routing through `gracefulShutdown` — no HTTP drain, no pool close.

The dead `globalErrorHandler.ts` documents a "log-and-continue in production" policy that is NOT what runs.

**Impact:**
1. `uncaughtException` hard-exits without draining: in-flight multi-tenant requests are dropped and DB connections close abruptly.
2. The never-resetting rejection counter means a long-lived process accumulating 10 *unrelated* rejections over weeks eventually exits for no acute reason (low-frequency surprise restart).
3. The dead module is a latent foot-gun: if someone wires up `initializeStabilityMeasures()` later, it would install the unsafe "continue after an uncaught exception" policy. Continuing after `uncaughtException` leaves V8 in undefined state — unacceptable for a regulated system (corruption risk).

**Fix:** Delete `globalErrorHandler.ts` (or make it the single source of truth). Route `uncaughtException` through `gracefulShutdown` with a short bounded timeout before exit. Reset the rejection counter on a rolling window, and report rejections to Sentry.

---

### [MEDIUM] External `fetch()` calls without timeout / AbortSignal — hung-request risk

**Evidence:** Many `fetch()` sites DO set `signal: AbortSignal.timeout(...)` or an `AbortController` (e.g. `live-ctgov-fetcher.ts:37`, `webhook-notifications.ts:272`), but several outbound clients on hot/blocking paths have **no** timeout, so a stalled upstream hangs the Node request indefinitely (consuming an event-loop request slot and any pool connection held across the await):

- `server/services/literature/grobidClient.ts:45` — POST full PDF to GROBID (slow, large bodies), no timeout.
- `server/services/search/opensearchClient.ts:31, 53` — index + query, no timeout.
- `server/services/connectors/veeva-vault.ts:73, 89, 109` and `server/services/connectors/ellucian-banner.ts:46, 72, 97` — external SaaS connectors, no timeout on `search`/`fetch` data calls.
- `server/services/policy/opaClient.ts:73` — policy decision in request path (verify; if it gates auth/authorization a stall blocks requests).

**Impact:** A single slow/blackholed upstream stalls request handlers and can exhaust the request/pool budget under load. Hung requests are harder to detect than crashes (no error, just rising latency and saturation).

**Fix:** Add `signal: AbortSignal.timeout(<n>)` (Node 18+) to every outbound `fetch`. Standardize via a small `fetchWithTimeout` wrapper so new code inherits the default. Prioritize request-path clients (OPA, OpenSearch) over background connectors.

---

### [MEDIUM] OpenAI SDK client constructed without explicit timeout (10-min default)

**File:** `server/services/openai-client.ts:61` — `_client = new OpenAI({ apiKey })`

**Impact:** The OpenAI Node SDK defaults to a **600s** request timeout. Embeddings/chat that route through this client (and any direct callers) can hang for up to 10 minutes on a stalled completion, far longer than any sane request budget. Chat completions largely flow through the AI Gateway (which has retry + a streaming chunk watchdog at `gateway.ts:1065/1130`), reducing exposure, but the bare client is still reachable.

**Fix:** `new OpenAI({ apiKey, timeout: 30_000, maxRetries: 2 })` (or align with the gateway's per-request budget).

---

### [MEDIUM] Idempotency store silently falls back to in-process memory — breaks idempotency across instances

**File:** `server/services/integrations/idempotencyStore.ts:14, 34-45, 66, 88-92`

**Evidence:** On any Redis error (connect, get, set), the store logs a `warn` and uses a private `new Map()` (`this.memory`). All gets/sets then operate on per-process memory.

**Impact:** In a multi-instance GA deployment, when Redis is unavailable the idempotency guarantee silently degrades to per-process — the same integration/webhook event can be processed more than once (different instances, or the same instance after restart clears the Map). This is a *silent* correctness downgrade (`warn` only), exactly the failure mode that bites under production load when Redis flaps.

**Fix:** Treat Redis loss as a hard error for idempotency-critical paths (fail closed / reject with 503), or at minimum surface a metric/alert rather than only a warn so operators know the guarantee is degraded.

---

### [MEDIUM] Unbounded `Promise.all(rows.map(async ...))` fan-out scaling with tenant data size

**Files (representative):**
- `server/routes/clients-routes.ts:162, 241` — `Promise.all(clients.map(async client => { ... }))` with per-client async work.
- `server/services/rag-retrieval-strategies.ts:58` — `Promise.all(queries.map(q => deps.search(...)))`.

(238 `Promise.all` sites total; most are small fixed-arity and fine. The risk is the ones whose array size grows with DB rows / user input.)

**Impact:** Fan-out width equals the number of rows returned. A tenant with many clients (or a large `queries`/citation list) issues that many concurrent downstream calls (DB, search, external) simultaneously — a self-inflicted load spike that can saturate the pool or a downstream dependency, with no concurrency cap.

**Fix:** Bound concurrency with `p-limit` (or chunked batches) on any `Promise.all` whose array length is data- or user-driven.

---

### [LOW] Active error handler echoes raw `err.message` for ALL 4xx (not just curated `ApiError`)

**File:** `server/src/mw/observability.ts:148-151`

**Evidence:** The mounted handler (this is the one wired in `server/index.ts:34/195`, *not* the stricter `server/middleware/errorHandler.ts`) returns the generic message only for `statusCode >= 500` in production; for any 4xx it returns `err?.message` verbatim, regardless of whether the error is a curated `ApiError`.

**Impact:** A third-party SDK or library that throws a 4xx with an internal-detail message (file paths, internal IDs, validation internals) will leak that text to the client. Low severity (4xx, not 5xx; no stack trace), but inconsistent with the stricter, unused `errorHandler.ts` which only exposes curated `ApiError` messages.

**Fix:** Apply the `errorHandler.ts` policy in the active handler — for 4xx, expose the message only when `err instanceof ApiError`; otherwise return a generic per-status message.

---

### [LOW] `uncaughtException` exit path skips graceful drain (noted in HIGH #3, called out separately for ops)

See HIGH "Conflicting / dead process-error handler." The immediate `process.exit(1)` on `uncaughtException` (shutdown.ts:109) drops in-flight requests. Acceptable as a fail-fast safety policy, but pairing it with a best-effort bounded drain would reduce dropped requests during the (rare) crash.

---

## Reliability GA Verdict

**CONDITIONAL.**

The foundations are solid: graceful shutdown, a tuned/observed pool, a scrubbing error handler, guarded schedulers, and an AI gateway with retries/fallback/circuit-breaker. No BLOCKER-class defect (nothing that *guarantees* outage or corruption at GA) was found.

Gate GA on the three **HIGH** items:
1. Guard the `transaction()` ROLLBACK and evict poisoned connections (`db/runtime.ts:196`) — blast radius is every multi-step write.
2. Stop silently swallowing the canonical write-through failures in the CMC/eCTD routes — add logging + durable retry (regulated data-integrity divergence).
3. Resolve the process-error-handler ambiguity — delete dead `globalErrorHandler.ts`, route `uncaughtException` through bounded drain, fix the non-resetting rejection counter.

Then address the **MEDIUM** items (fetch timeouts on GROBID/OpenSearch/connectors/OPA, OpenAI SDK timeout, idempotency fail-closed, bounded fan-out) in the first hardening sprint. None of the MEDIUMs alone blocks GA, but collectively they are the difference between "degrades gracefully" and "saturates silently" under production load.
