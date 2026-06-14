# GA Readiness Audit — Performance & Scalability

**Date:** 2026-06-14
**Scope:** `server/` and `services/` application code (DB access patterns, query efficiency, caching, rate limiting, event-loop blocking, memory, external-call latency). Excludes React client and raw DB schema design.
**Method:** Source-level grep + hot-path sampling. Net-new findings only.

> Status: IN PROGRESS — written incrementally.

## Executive Summary

_(to be finalized)_

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

