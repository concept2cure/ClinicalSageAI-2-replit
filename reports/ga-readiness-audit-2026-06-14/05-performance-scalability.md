# GA Readiness Audit — Performance & Scalability

**Date:** 2026-06-14
**Scope:** `server/` and `services/` application code (DB access patterns, query efficiency, caching, rate limiting, event-loop blocking, memory, external-call latency). Excludes React client and raw DB schema design.
**Method:** Source-level grep + hot-path sampling. Net-new findings only.

> Status: COMPLETE.

## Executive Summary

The infrastructure foundations are solid: a single shared, well-configured Postgres pool (`server/db/runtime.ts:47` — max 40 prod, statement_timeout 30s, idle-in-tx timeout, RLS hooks), a lazy per-request DB client that avoids spending a pool slot on requests that never touch the DB (`server/middleware/lazyRequestDbClient.ts`), a `new Pool` ban enforced in CI (`package.json:48`, all stray `new Pool` confined to scripts/tests), and a genuinely good Redis sliding-window rate limiter with a bounded (10k) in-memory fallback (`server/middleware/redisRateLimiter.ts`). The AI gateway is resilient (120s timeouts, retry-with-jitter, circuit breaker, streaming stall watchdog).

The risks that threaten GA under real concurrent multi-tenant load are concentrated in a few hot paths:
1. **N+1 query fan-out** in the foresight-ai-advanced routes that can exhaust the connection pool on a single large-tenant request.
2. **Unbounded in-memory accumulation** — the eCTD ZIP buffered entirely in heap (OOM risk), the never-evicting `tenantCache` Map, and unbounded `findMany` result sets.
3. **Event-loop blocking** — per-request `readFileSync`+`JSON.parse` in CMC route handlers and `scryptSync` on every connector credential op.
4. **Missing global backpressure** — no in-flight concurrency cap on outbound AI calls; per-minute throttles are per-process, not cluster-wide.

None of these are crashes today, but each degrades or falls over as tenant data and concurrency grow — exactly the GA failure mode.

**Findings by severity:** BLOCKER 0 · HIGH 4 · MEDIUM 4 · LOW 2 (10 total)

**Performance GA verdict: CONDITIONAL.** Ship-blocking work: fix the foresight N+1 (HIGH), stream the eCTD ZIP / move it off the request thread (HIGH), and convert the CMC `readFileSync`/`JSON.parse` handlers to async/streamed (HIGH). The tenantCache unbounded-Map + wrong-TTL (HIGH) should also be fixed before GA. The MEDIUM items (AI concurrency cap, scryptSync, prisma LIMIT defaults, Redis-backed throttle) are strongly recommended for the first weeks of GA load.

## Findings

### [HIGH] N+1 query fan-out in foresight-ai-advanced dose-escalation/narrative/analysis list routes
**File:** `server/routes/foresight-ai-advanced.ts:431-496` (also :518-590 narratives, :630+ analyses)
Parent query selects ALL studies for an org (no LIMIT/pagination), then `Promise.all(studies.map(async ...))` fires one cohort query per study, and within each, `Promise.all(cohorts.map(async ...))` fires one DLT query per cohort. For an org with S studies and C cohorts each, this issues 1 + S + S*C queries — all dispatched concurrently. Under load this both explodes query count and saturates the connection pool (max 40 prod): a single request with 40+ cohorts can grab every pool slot, starving all other tenants/requests. The same nested-fan-out shape repeats for ind-narratives (sections) and the analyses/comparisons route.
**Impact:** Pool exhaustion + latency cliff as data grows; one tenant's large dataset degrades the whole node.
**Fix:** Replace with a single set-based query using JOINs or `WHERE study_id = ANY($1)` / `WHERE cohort_id = ANY($1)` aggregating in 2-3 round trips total; add LIMIT + pagination to the parent SELECT.

### [HIGH] Unbounded, never-expiring entries in tenantCache + wrong TTL unit
**File:** `server/cache/tenantCache.ts:17` (module-level `Map` with no max size / LRU), consumed in `server/routes/quality-management-api.ts:171,473,586`
`cacheStore` is a process-global `Map` with only lazy TTL eviction *on read* — entries that are never read again are never freed. Multi-tenant keys (`tenantId:entityType:entityId`) accumulate without bound; there is no max-size cap (unlike the rate limiter's 10k cap). Additionally the call sites mostly pass **no TTL** (`storeInCache(orgId,'qmp',key,enrichedQmp)` at :586, :473) so those entries live forever, and the dashboard call `storeInCache(organizationId,'qmp',cacheKey,dashboard,2)` at :171 passes `2` into the `ttlMs` parameter — a 2-millisecond TTL (effectively no caching), not "priority 2" as the comment implies.
**Impact:** Slow memory growth across tenants (potential OOM on long-running nodes); cache is either useless (2ms) or stale-forever (no invalidation on underlying data change beyond explicit `invalidateCache`).
**Fix:** Add a max-size LRU bound + periodic sweep; fix call sites to pass explicit sensible `ttlMs` (e.g. 30-300s); remove the misleading "priority" argument.

### [MEDIUM] Filesystem cache uses sync existsSync and double-reads each file
**File:** `server/cache_manager.js:95,100,122-124` (`isCacheValid` → `getCachedData`)
`isCacheValid()` calls sync `fs.existsSync()` (event-loop blocking) then reads+JSON.parses the file; `getCachedData()` then calls `isCacheValid()` AND re-reads/re-parses the same file — every cache hit does 2 full file reads + 2 JSON.parse passes. The directory-create path also uses sync `existsSync`/`mkdirSync` at module load (:20) and per-source (:39). Used by FAERS/MAUDE external-data clients.
**Impact:** Blocking syscalls under concurrency; doubled IO on the hot cache path.
**Fix:** Single async `readFile` with try/catch for missing-file; cache the parse; use `fs.promises.mkdir({recursive:true})`.

### [HIGH] eCTD submission ZIP fully buffered in heap (no streaming)
**File:** `server/services/ectdExportService.ts:563,706-710` (`zip.file(...)` accumulates every leaf PDF into a single `JSZip`; `zip.generateAsync({ type: 'nodebuffer' })`)
Every leaf PDF is rendered (`renderLeafPdf`, :557-562) and added to one in-memory `JSZip` instance, the vendored DTD files are read with `fs.readFileSync` (:283) and also stuffed in, then the whole archive is materialized as one Node `Buffer` in heap before being returned/written. A full eCTD sequence can be hundreds of MB to multiple GB (many large PDF leaves). The PDF bytes exist twice (rendered buffer + zip entry) plus the final concatenated buffer. There is no streaming to disk / S3 and no per-request size guard.
**Impact:** A few concurrent large submissions can spike heap into multi-GB territory and OOM-kill the node — taking down all tenants on that instance. Also blocks the event loop during the synchronous DTD `readFileSync` and the (CPU-heavy) DEFLATE pass.
**Fix:** Stream to a temp file / object store using `zip.generateNodeStream(...)` (or `archiver` with a write stream) and pipe leaf renders in incrementally; convert DTD reads to async; cap total submission size; offload the compile to a background job/worker rather than serving it inline on a request.

### [HIGH] Per-request synchronous `readFileSync` + `JSON.parse` in CMC route handlers
**Files:** `server/api/cmc/manufacturing-tuner.js:375,408,451`; `server/api/cmc/global-compliance.js:484,540,573`; `server/api/cmc/change-impact-simulator.js:168,257`; `server/api/cmc/audit-risk-monitor.js:474,695` (pattern: `fs.existsSync()` then `JSON.parse(fs.readFileSync(filePath,'utf8'))` directly inside `router.get/post` handlers)
These Express handlers synchronously stat, read, and parse JSON result files on the request thread. `readFileSync` + `JSON.parse` of a multi-MB analysis result blocks the entire Node event loop for the duration — every other concurrent request (all tenants) stalls. The `existsSync` adds a second blocking syscall. This is the classic single-threaded-Node trap on a per-request hot path.
**Impact:** Tail-latency and throughput collapse under concurrency; one tenant downloading a large CMC result freezes the node for everyone.
**Fix:** Use `await fs.promises.readFile(...)` and parse asynchronously (or stream the file straight to the response with `res.sendFile`/`createReadStream().pipe(res)` since most of these just echo the JSON back); drop `existsSync` in favor of catching ENOENT.

### [MEDIUM] `scryptSync` key derivation on every connector credential encrypt/decrypt
**File:** `server/services/connectors/connector-registry.ts:60,72`
`encrypt()` and `decrypt()` each call `crypto.scryptSync(ENCRYPTION_KEY,'salt',32)` to derive the AES key. `scrypt` is intentionally CPU-expensive (tens of ms with default cost params) and `*Sync` blocks the event loop. The salt and key are both static, so the derived key is identical every call — it is recomputed needlessly on every connector credential read/write. Under a burst of connector syncs this serializes request handling.
**Impact:** Event-loop stalls proportional to connector credential operations; wasted CPU.
**Fix:** Derive the key once at module init (cache it), and/or move to `crypto.scrypt` (async) or a fast KDF since the salt is fixed. Note the static `'salt'` is also a correctness/security smell (out of perf scope but worth flagging).

### [MEDIUM] AI Gateway has no in-flight concurrency cap / queue on outbound LLM calls
**File:** `server/services/ai-gateway/gateway.ts:376-485` (`route`) and `server/services/ai-gateway/policy.ts:166,184` (per-minute counters only)
The gateway enforces a per-org/per-user *requests-per-minute* count (in-memory buckets in the policy engine — also note these are per-process, not shared across nodes), but there is no limit on the number of *simultaneously in-flight* provider calls. Each call holds a socket and up to 120s timeout (:677,:883,:1193). A spike of expensive `document_analysis`/`regulatory_review` requests (often large prompts + extended thinking) can open hundreds of concurrent provider sockets and pin large prompt buffers in memory until each resolves, while also racing past the coarse per-minute gate. The HTTP-layer `redisRateLimiter` `ai` bucket (30/min/key) helps but is keyed per user/IP and does not bound global concurrency.
**Impact:** Memory pressure and provider-side 429 storms under load; no backpressure — the node accepts unbounded concurrent AI work.
**Fix:** Add a bounded concurrency limiter (e.g. `p-limit`/semaphore) around `executeProvider`, sized per provider, with a short queue + fast-fail when saturated. Make the per-minute throttle Redis-backed so it holds across nodes.

### [MEDIUM] `prisma/client.js` list shims allow unbounded result sets (LIMIT is optional)
**File:** `server/prisma/client.js:75-91` (`audit_log.findMany`), `:136-152` (`document.findMany`); pattern repeats for `electronic_signatures` (:246)
`findMany` builds `SELECT * FROM <table> ... ORDER BY created_at DESC` and only appends `LIMIT` when the caller passes `take`. There is no default cap. Tenant isolation is enforced (good — `document.findMany` throws without an org filter), but a long-lived/high-volume tenant's audit_logs or documents table can return tens of thousands of rows into memory in one shot when a caller forgets `take`.
**Impact:** Latency and memory spikes as tenant data grows; full table materialization per request.
**Fix:** Apply a default `LIMIT` (e.g. 100-500) with explicit pagination (keyset on `created_at`/id); require callers to opt into larger pages.

### [LOW] In-memory rate-limit / policy buckets are per-process, not distributed
**File:** `server/services/ai-gateway/policy.ts:166,184`; `server/middleware/rateLimiter.ts:58` (in-memory `ipLimiters`)
The Redis rate limiter (`redisRateLimiter.ts`) correctly uses a shared sliding window with a graceful in-memory fallback (10k cap, `unref` cleanup — well done). But the AI-gateway policy engine's per-minute org/user buckets and the legacy `rateLimiter.ts` IP buckets are pure in-process maps. In a multi-node deployment the effective limit is `N_nodes × configured_limit`, so the documented per-org/per-user ceilings are not actually enforced cluster-wide.
**Impact:** Rate ceilings under-enforced behind a load balancer; possible cost overruns / provider throttling.
**Fix:** Back the gateway throttle with the same Redis store; treat in-memory as fallback only.

### [LOW] Nested fan-out / sequential awaits in foresight narrative & analyses routes (same shape as the HIGH N+1)
**File:** `server/routes/foresight-ai-advanced.ts` (ind-narratives + analyses/comparisons handlers, ~:518-590, :630+)
Confirmed the dose-escalation N+1 (parent SELECT with no LIMIT → `Promise.all(studies.map → cohorts.map → dlt query))`) repeats structurally for the narrative-sections and analyses routes. Folded into the HIGH finding above; listed separately for completeness so each route is fixed.
**Fix:** Same as the HIGH N+1 — set-based queries with `= ANY($1)` and parent pagination.

