# AnA GA Bring-Up Runbook

## Goal
Bring AnA (`/api/ana-ri/*`) to production-grade operation with clear startup checks, smoke tests, and GA hardening gates.

## 1) Runtime architecture map (what must be alive)

1. **Server route mount**
   - `server/index.ts` dynamically mounts AnA RI routes on `/api/ana-ri`.
2. **AnA route handler**
   - `server/routes/ana-ri.ts` exposes the primary APIs:
     - `POST /chat`
     - `POST /stream` (SSE)
     - `POST /plan`
     - `POST /generate`
     - plus observability/deficiency/action/rubric endpoints.
3. **Gateway dependency**
   - `server/services/ai-gateway/gateway.ts` initializes provider clients and currently prefers Anthropic for all tasks.
4. **Client chat panel**
   - `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` streams from `/api/ana-ri/stream` and includes auth headers.

---

## 2) Required environment and startup contract

## Must-have
- `DATABASE_URL` **or** `DATABASE_NEON_NEW_SECRET`
- `JWT_SECRET` in production

## Strongly recommended for production
- `ANTHROPIC_API_KEY` (live intelligence)
- `REDIS_URL` (rate limiting / resilience)
- `SENTRY_DSN` (error telemetry)

## Deterministic-mode fallback
- If `AI_GATEWAY_DETERMINISTIC=true` (or `DETERMINISTIC_MODE=true`), AnA can still answer using deterministic responses for validation and non-live smoke testing.

---

## 3) “AnA is not working” triage sequence

Run these in order:

1. `npm run dev`
   - Confirm log line: `AnA RI routes mounted (/api/ana-ri)`.
2. `curl -sS http://localhost:5000/api/health`
   - Must return healthy response.
3. `curl -sS http://localhost:5000/api/ana-ri/rubric`
   - Confirms route wiring and handler load path.
4. UI-level smoke
   - Open chat panel and send a message.
   - Verify SSE stream starts and final response is persisted.
5. Gateway check
   - If responses fail with provider errors, verify `ANTHROPIC_API_KEY` and outbound network policy.
6. Database check
   - If thread/history or command execution fails, verify DB connectivity and core tables.

---

## 4) Current known failure modes (from repo behavior)

1. **Missing DB env**
   - Service-level AnA tests fail fast with `Database connection not available` when DB env is absent.
2. **Missing Anthropic key in live mode**
   - Gateway throws if Anthropic client is not initialized and deterministic mode is off.
3. **Contract drift between legacy tests and modern UI code**
   - Some regression tests assert old implementation strings and fail despite valid modern APIs. Treat as test-debt backlog, not runtime blocker for core AnA APIs.

---

## 5) GA-quality acceptance gates for AnA

AnA is GA-ready only when all are true:

1. **Reliability**
   - Route mount + health checks pass on every deploy.
   - Deterministic fallback path validated.
2. **Availability**
   - Redis-backed rate limiting enabled in prod.
   - Error telemetry (Sentry) enabled.
3. **Quality**
   - Targeted AnA tests pass (`ana-gap-analysis`, `ana-orchestrator`, `ana-ri` with test DB).
4. **Security & compliance**
   - Auth context flows correctly to AnA routes.
   - Audit and generation logs available via AnA observability endpoints.
5. **Operational readiness**
   - On-call runbook (this file) and smoke command set documented.

---

## 6) Minimal CI job recommendation for AnA

Add a dedicated CI lane that runs:

1. Static checks: `npm run typecheck`
2. Targeted AnA tests:
   - `npx vitest run tests/routes/ana-gap-analysis.test.ts tests/resolution/ana-orchestrator.test.ts`
3. Optional (when DB test env present):
   - `npx vitest run server/services/__tests__/ana-ri.test.ts`

Fail the lane on any regression.

---

## 7) High-availability next steps (priority order)

1. **Multi-provider fallback policy**
   - Re-enable a second provider in gateway registry for controlled failover.
2. **Readiness endpoint for AnA specifically**
   - Add `/api/ana-ri/health` to report provider status, DB status, and stream readiness.
3. **SSE resiliency**
   - Add stream heartbeat + reconnect guidance envelope in client.
4. **Fix or retire stale regression tests**
   - Update tests asserting obsolete code strings so they validate actual behavior.

