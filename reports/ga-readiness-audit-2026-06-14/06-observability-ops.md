# GA Readiness Audit — Observability & Operations

**Date:** 2026-06-14
**Scope:** `server/` and `services/` backend + observability infra config (NOT React client, NOT raw DB schema)
**Auditor focus:** Logging, Metrics, Tracing, Health/Readiness, Error monitoring, Graceful degradation
**Method:** NET-NEW from source. No prior reports consulted.

---

## Executive Summary

The platform has a **genuinely strong observability foundation that is unevenly applied**. There is a purpose-built, HIPAA/PHI-aware Pino logger with deep recursive redaction (`server/utils/logger.ts`), a Sentry integration with a fail-closed PII/secret scrubber (`server/utils/sentry.ts`), opt-in OpenTelemetry with boot-time misconfiguration enforcement (`server/services/telemetry/opentelemetry.ts`), request-ID correlation + AsyncLocalStorage context propagation (`server/src/mw/observability.ts`), a multi-tier health endpoint suite with real dependency checks (`server/lib/health-check.ts`), and graceful shutdown with `unhandledRejection`/`uncaughtException` handlers (`server/startup/shutdown.ts`). This is well above typical pre-GA maturity.

The gaps are about **consistency and reach**, not absence:

1. **~3,197 `console.*` calls across 420 files** bypass the structured/redacted logger entirely — including in hot production route files. These are unstructured, un-correlated, and un-redacted.
2. The **request-logging middleware itself uses raw `console.*`** (`observability.ts:16-21`) and logs full error objects + header-derived context, partially defeating the redaction it sits next to.
3. **`server/metrics.js` (prom-client business metrics) is NOT mounted** into the app — it is referenced only by tests. The live `/api/metrics` endpoint is a separate hand-rolled implementation.
4. **`/readyz` checks only the DB**, not Redis or the Python/Celery worker tier, despite Redis being a documented critical dependency for token revocation. A degraded Redis or dead worker will not fail readiness.
5. Health/metrics endpoints (`/api/metrics`, `/api/health/full`) appear **unauthenticated** and leak operational internals (pool counts, circuit-breaker state, memory).

**Verdict: CONDITIONAL.** Operators *can* detect, diagnose, and respond to incidents using the infrastructure that exists, but the console.* sprawl creates real diagnostic blind spots (un-correlated, un-redacted logs) and the readiness probe will mask Redis/worker outages. No unambiguous BLOCKER that prevents launch, but the readiness gap + metrics-endpoint exposure should be fixed before GA.

**Findings:** 0 BLOCKER · 4 HIGH · 5 MEDIUM · 3 LOW

---

## What Works (Evidence-Based Strengths)

- **Redacting structured logger** — `server/utils/logger.ts`: Pino-based, recursive `redactContext` walker (depth 6) over ~50 sensitive keys (passwords, tokens, JWT, cookies, MRN, patient_id, SSN, DOB, Stripe). Centralized redaction above the Pino layer + pino `redact.paths` backstop. Used by **352 files**. Scoped loggers via `createScopedLogger`.
- **Sentry with fail-closed scrubber** — `server/utils/sentry.ts`: `sendDefaultPii: false`, strips authorization/cookie/x-api-key/x-org-id headers, removes IP/email/username, runs `redactSecretsAndPiiObject` over the whole event, and **drops the event entirely if scrubbing throws** (`beforeSend` returns `null` on error). Initialized in `server/index.ts:24`.
- **Request correlation** — `server/src/mw/observability.ts:75-76`: honors inbound `x-request-id` or mints a UUID, echoes it on the response header, and binds it into `AsyncLocalStorage` so downstream code can retrieve it via `getRequestContext()`. Audit trail correlates on `x-request-id`/`x-correlation-id` (`server/startup/audit-trail.ts:60-61`).
- **OpenTelemetry, fail-loud** — `server/services/telemetry/opentelemetry.ts`: opt-in via `OTEL_ENABLED`; if enabled in production without an exporter endpoint it `process.exit(1)` rather than silently dropping traces (lines 43-52). Auto-instrumentation enabled. Init'd in `server/index.ts:27`.
- **Multi-tier health checks with real dep probing** — `server/lib/health-check.ts`: `checkDatabase` runs `SELECT 1` + reports pool stats; `checkOpenAI` reads circuit-breaker state; `checkMemory` thresholds heap %; `checkFull` aggregates + reports graceful-degradation level. Returns proper 200/503 semantics for k8s probes.
- **Audit vs operational separation** — dedicated audit loggers (`server/services/audit/auditLogger.ts`, `server/middleware/auditLogger.js`) distinct from operational logger, with a 21 CFR Part 11 tamper-proof audit trail middleware (`server/startup/audit-trail.ts`).
- **Graceful shutdown + crash handlers** — `server/startup/shutdown.ts`: SIGTERM/SIGINT graceful drain, kills Python child on `SIGTERM`, and registers `unhandledRejection` + `uncaughtException` handlers.
- **Boot-time dependency invariants** — `server/lib/startup-invariants.ts`: checks revoked-tokens table, **Redis connectivity** (line 89 `checkRedis`), artifact columns; `STRICT_STARTUP_INVARIANTS=true` halts boot on critical failure.
- **Per-domain business metrics** — many `services/*-metrics.ts` modules (fcoi, inspection, lifecycle, ana-ri, rim, iacuc, effort, grants, cs, etmf, rag, research-security) rendered into `/api/metrics` (`server/startup/inline-endpoints.ts:94-240`).
- **Periodic posture monitor** — `securityHealthScheduler` re-runs the security self-test on an interval so drift (clamd down, audit chain broken) is observed without manual probing (`server/index.ts` startServer).

---

## Findings

### [HIGH] H1 — Massive `console.*` sprawl bypasses structured logging & redaction
**Evidence:** ~**3,197** `console.(log|error|warn|info|debug)` calls across **420 files** in `server/`. Hot production paths include `server/routes/authoring.router.ts` (99), `server/routes/ana-features.ts` (65), `server/services/unifiedDocumentIngestion.js` (39), `server/routes/client-intelligence.ts` (34), `server/routes/authoring-actions.ts` (32). Only 352 files import the redacting logger.
**Impact:** These log lines are (a) **not correlated** with `x-request-id` (cannot reconstruct a request's path across services during an incident), (b) **not run through `redactContext`** — any object containing a token/PHI/secret field logged via `console.*` leaks to stdout/log aggregation in cleartext, and (c) unstructured, so they can't be reliably queried/alerted on. This is the single biggest operational blind spot.
**Fix:** Lint-ban `console.*` in `server/` (ESLint `no-console`) with an allowlist for the boot path. Codemod the highest-volume route/service files to `createScopedLogger`. Prioritize files that log request/response bodies or error objects.

### [HIGH] H2 — Request-logging middleware uses raw `console.*` and logs un-redacted error objects
**Evidence:** `server/src/mw/observability.ts:16-21` defines a local `logger` that is literally `console.log/error/warn/debug`. `errorHandler` logs the **full `err` object** on 5xx (`observability.ts:156-165`) and the kernel evaluation consumes `toHeaderMap(req)` (all request headers, line 40-50) and a 512-char `summarizeBody` snippet (line 33-38). This middleware is mounted app-wide at `server/startup/middleware.ts:60` (`app.use('/api', httpLogger)`).
**Impact:** The central request logger — the one component that touches **every** API request — does not use the redacting Pino logger sitting one directory over. Full error objects can carry connection strings, SQL fragments, and PHI in `.message`/`.detail`; header maps and body snippets feed the kernel and can surface in denied-request logs (`observability.ts:95-104` logs `kernel.trace`). The redaction infrastructure exists but is not applied at the busiest chokepoint.
**Fix:** Replace the local `console.*` logger in `observability.ts` with `createScopedLogger('http')` from `utils/logger.ts` so request/error logs inherit redaction + structured output. Redact/whitelist headers before passing to the kernel.

### [HIGH] H3 — `/readyz` checks only the database; Redis and the Python/Celery worker tier are not gated
**Evidence:** `server/startup/inline-endpoints.ts:26-33` — `/readyz` runs only `pool.query('select 1')`. Redis is checked at **boot** (`startup-invariants.ts:89`) and documented as "token revocation primary" (line 12), but there is **no runtime readiness probe for Redis**, and no probe for the Python backend (`startPythonBackend`) or Celery workers (`services/celery_app.py`, `services/worker.py`).
**Impact:** After boot, if Redis goes down (token revocation degrades to memory/DB fallback) or the Python worker dies, `/readyz` still returns `200 ready:true`. A load balancer / k8s readiness probe will keep routing traffic to an instance that cannot revoke tokens or process async jobs — silent partial outage. Operators lose the primary "should this instance receive traffic" signal for two critical dependencies.
**Fix:** Extend `/readyz` (or point the k8s readiness probe at `/api/health/full` which already aggregates more) to include a Redis ping and a worker/Python liveness check. Decide fail-open vs fail-closed per dependency (Redis degradation may be 200-degraded; DB down is 503).

### [HIGH] H4 — Health/metrics endpoints are unauthenticated and leak operational internals
**Evidence:** `server/middleware/enterprise-security.ts:387,490-491` exempt `/healthz` and `/readyz` from auth (expected). But `/api/metrics` (`inline-endpoints.ts:59`) and `/api/health/full` (`inline-endpoints.ts:43`) are mounted via `mountDiagnosticEndpoints` and expose DB pool counts, memory/RSS, circuit-breaker failure counts, degradation level, and all per-domain business-metric counters with no visible auth gate. The unused `server/metrics.js` `/metrics` endpoint is likewise open.
**Impact:** If these routes are reachable from outside the cluster, they disclose live capacity, error rates, and internal service topology to unauthenticated callers — useful reconnaissance and a minor DoS vector (each `/api/metrics` scrape does multiple dynamic imports + a security-metrics render). PHI is not exposed, so this is HIGH not BLOCKER.
**Fix:** Gate `/api/metrics` and `/api/health/full` behind a network policy (cluster-internal only) or a scrape token / mTLS. Keep `/healthz`/`/readyz` open and minimal.

### [MEDIUM] M1 — `server/metrics.js` (prom-client business metrics) is dead/unmounted
**Evidence:** `server/metrics.js` defines real prom-client Counters/Histograms/Gauges (`trialsage_cer_jobs_total`, `cerJobDuration`, `cerJobsActive/Queued`, `cerJobErrors`, `concept2cureErrors`) and a `setupMetricsEndpoint()` Express app. Grep shows `setupMetricsEndpoint` is referenced **only** in `server/__tests__/metricsScrape.test.ts` — never imported by `index.ts` or any router. The live `/api/metrics` (`inline-endpoints.ts`) is a separate hand-rolled text builder that does **not** include these CER-job counters.
**Impact:** The CER pipeline — a core business workflow — has defined SLO metrics (job duration, queue depth, active jobs, error rate) that are **never scraped**. Whether `metrics.set(...)` calls elsewhere update these counters is moot because the registry is never exposed. Operators have no Prometheus visibility into CER job throughput/latency/failures on the critical path.
**Fix:** Either mount `setupMetricsEndpoint()`'s registry into the live `/api/metrics` (merge the prom-client `register`), or migrate the CER metrics into the `renderXMetrics()` pattern the live endpoint already aggregates. Verify the recording call sites actually fire.

### [MEDIUM] M2 — Two parallel metrics implementations with inconsistent naming
**Evidence:** Live `/api/metrics` emits `process_memory_*`, `db_pool_*`, and `renderXMetrics()` text (`inline-endpoints.ts:64-240`). `health-check.ts:getPrometheusMetrics` emits `concept2cure-ri_*` gauges (note the hyphen — `concept2cure-ri_uptime_seconds`, line 263), which is **invalid Prometheus metric-name syntax** (hyphens not allowed). `server/metrics.js` emits `trialsage_cer_*`. Three naming schemes, one invalid.
**Impact:** Inconsistent metric names fragment dashboards/alerts; the `concept2cure-ri_*` names will be rejected or mangled by Prometheus scrapers. Whichever endpoint operators point at, they get a partial, differently-named view.
**Fix:** Consolidate to one endpoint and one naming convention (`snake_case`, no hyphens, consistent prefix e.g. `c2c_`). Fix `concept2cure-ri_*` → `c2c_ri_*`.

### [MEDIUM] M3 — Console-logged boot path obscures structured startup diagnostics
**Evidence:** Boot/bootstrap files are console-heavy: `server/bootstrap/register-inline-routes.ts` (96), `register-document-routes.ts` (59), `server/startup/services.ts` (45), plus `index.ts` direct `console.log/error` (e.g. `index.ts` "Global error handler registered", startup-invariants halt message, shutdown.ts:29).
**Impact:** Startup is where most launch-time incidents surface (missing env, failed dep). Console output here is acceptable as a fallback but is un-structured and un-leveled, making it hard to alert on "boot failed" vs "boot succeeded" in log aggregation. Lower severity because it's the boot path, not request handling.
**Fix:** Route startup logging through `createScopedLogger('startup')` for structured, queryable boot events; keep raw `console.error` only for the pre-logger-init window.

### [MEDIUM] M4 — Python services use `print()` instead of structured logging in places
**Evidence:** `services/secure_runner.py` (5 `print()`), `services/ectd_generator.py` (1). `celery_app.py` and `ectd_generator.py` do import `logging`, so the pattern is mixed.
**Impact:** `print()` output in the Python tier is un-leveled and won't carry correlation IDs from the Node side, breaking cross-service trace continuity during incidents involving eCTD generation or the secure runner.
**Fix:** Standardize on Python `logging` with a JSON formatter; propagate the `x-request-id` from the Node caller into Python log records.

### [MEDIUM] M5 — No evidence of trace context propagation into external/AI calls or Python tier
**Evidence:** OTel auto-instrumentation is enabled (`opentelemetry.ts:82-87`) which covers HTTP/DB automatically, but trace/span context is not explicitly propagated into the Python subprocess (`startPythonBackend`) or attached to outbound AI-provider calls. The Node `requestId` lives in `AsyncLocalStorage` but isn't forwarded as a `traceparent` header to services.
**Impact:** Distributed traces will break at the Node→Python boundary and at AI-gateway calls — operators can't follow a single CER-generation request end-to-end across the worker tier. OTel is also opt-in (`OTEL_ENABLED`), so unless explicitly enabled in prod there is **no** distributed tracing at all.
**Fix:** Confirm `OTEL_ENABLED=true` + exporter is set in the GA environment. Inject `traceparent` into Python subprocess env / Celery task headers and into AI-gateway outbound requests.

### [LOW] L1 — `/api/metrics` does multiple dynamic imports per scrape
**Evidence:** `inline-endpoints.ts:94-240` does ~15 `await import('../services/*-metrics.js')` calls on every scrape, each wrapped in try/catch.
**Impact:** Minor per-scrape latency/overhead; the try/catch-swallow means a broken metrics module silently disappears from output rather than alerting (a metric vanishing is itself a signal that gets lost).
**Fix:** Resolve the metric renderers once at startup; log (don't silently swallow) import failures.

### [LOW] L2 — Health-check error details may leak internals on `/api/health/full` raw path
**Evidence:** `health-check.ts:170-171` puts `error.message` and `String(error)` into the `details` of the `ComponentHealth` response. The inline `/api/health/full` wrapper (`inline-endpoints.ts:50-56`) correctly catches and returns only `{status:'error'}`, but the `createHealthRouter` factory (`health-check.ts:325-331`, mounted via `server/lib/index.ts:85`) returns the raw result including DB error messages.
**Impact:** If `createHealthRouter` is mounted on an externally reachable path, DB error strings (potentially with DSN fragments) reach clients. Low because the primary `/api/health/full` path is already sanitized.
**Fix:** Sanitize `details.error` in `checkDatabase` (log full server-side, return generic message) consistently across both health entrypoints.

### [LOW] L3 — Logger redaction skips array contents by design
**Evidence:** `server/utils/logger.ts:122` — `redactContext` passes arrays through un-walked ("walking large arrays kills log throughput").
**Impact:** A sensitive object nested inside an array (e.g. `{ users: [{ ssn: ... }] }`) is **not** redacted. Documented trade-off, but a real PHI-leak path for batch operations.
**Fix:** Walk arrays of objects up to a small bound (e.g. first N elements) or redact known batch-shaped fields at call sites.

---

## GA Readiness Verdict

**CONDITIONAL — Ready with required fixes.**

Operators have the tooling to detect, diagnose, and respond: structured+redacted logging exists, Sentry is wired with PHI scrubbing, health endpoints probe real deps, metrics are emitted, shutdown/crash handlers are in place. The platform is not flying blind.

However, three issues materially weaken incident response and should be addressed before GA:
- **H3** (readiness masks Redis/worker outages) — operators will not be paged when a critical dependency degrades.
- **H1/H2** (console.* sprawl + un-redacted request logger) — diagnostic logs lack correlation and risk leaking PHI/secrets to log sinks.
- **H4** (open metrics/health endpoints) — operational internals exposed unauthenticated.

**Recommended pre-GA gate:** fix H3 + H2 + H4; schedule H1 (console codemod) and M1 (CER metrics not scraped) as fast-follow. None are launch-blocking in isolation, but H3 + H1 together create a credible "silent partial outage that's hard to diagnose" scenario.
