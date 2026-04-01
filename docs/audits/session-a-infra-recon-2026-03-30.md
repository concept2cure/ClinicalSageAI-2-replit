# Session A Infra Recon — 2026-03-30

## 1) Local dev environment map
- `npm run dev`/`dev:local` shells through `scripts/startup.sh`, then starts `tsx server/index.ts` on `PORT` (default 5000).  
- `scripts/startup.sh` is the canonical local DB bootstrap; it prefers Docker Postgres, then falls back to native Postgres install/start + schema prep if Docker/Compose is unavailable.  
- Vite dev server is rooted in `client/` and intentionally ignores `server/**`, `shared/**`, `scripts/**`, etc. to avoid server-side edit reload thrash.  
- Test stack uses Jest + Vitest (`vitest.config.ts`, `tests/setup.ts`) with node environment.

## 2) Docker / compose environment map
- Current `docker-compose.yml` defines `vault-api` and `batch-worker`; there is no first-party LiteLLM/Langfuse/OPA/OTel collector service yet.  
- `startup.sh` expects a `db` compose service and tries `docker compose up -d db`; compose file drift risk exists because `db` is not present in the inspected compose excerpt.

## 3) Native Postgres fallback behavior
- If Docker unavailable, `startup.sh` installs `postgresql` + `postgresql-client`, starts cluster, enforces password auth, creates DB/schema (`vault`), and attempts `pgvector` enable/build.  
- This fallback is operationally heavy (apt install + sudo), but keeps local dev unblocked when container runtime is missing.

## 4) Remote DB behavior
- Runtime DB URL resolution is centralized in `server/db.ts` via `getDatabaseUrl()` (supports `DATABASE_URL`/`DATABASE_NEON_NEW_SECRET`).  
- SSL config is derived via `getSslConfig`; pool sizing/timeouts vary by production vs non-prod.
- If DB URL missing, server continues with warning and partial feature degradation (`pool = null`) rather than immediate crash in all environments.

## 5) Production build behavior
- Build path: `vite build` for client + `esbuild server/index.ts --bundle --platform=node --format=esm --outdir=dist`.  
- Start path: `NODE_ENV=production node dist/index.js`.  
- `server/index.ts` validates required env (`DATABASE_URL` or secret alias, plus `JWT_SECRET` in prod) and warns for recommended production vars.

## 6) Current AI call path
- Two AI control surfaces exist:
  1. `server/services/aiProviderRouter.ts` (legacy but still mounted via `ai-assistance` injection in `server/index.ts`).
  2. `server/services/ai-gateway/*` (widely used by `chat.ts`, `ana-ri.ts`, and others).
- Outbound model calls currently happen directly from gateway/router classes to provider SDKs (`openai`, `@anthropic-ai/sdk`, Moonshot OpenAI-compatible endpoint).
- `aiProviderRouter` already has task-aware routing strategy + fallback + per-request audit insert into `ai_provider_audit_log`.

## 7) Current audit / auth / org scoping path
- Auth: `server/auth.ts` (`authMiddleware`) resolves JWT or DEV API key, sets `req.user*`, `req.tenant*`.
- Tenant scoping: `server/middleware/tenantContext.ts` derives org context from JWT (not headers), provides `requireOrganizationContext` and strict `requireTenantContext` path with DB session vars.
- Security/audit posture: `server/middleware/enterprise-security.ts` provides input controls/rate limits/CORS/security headers; `server/src/mw/observability.ts` provides request IDs, policy kernel decision headers, structured request/error logs.
- Tool-specific audit exists (e.g., Firecrawl route writes `external_tool_audit_log`; Part 11 route writes `audit_events`).

## 8) Risk notes by tool

### LiteLLM
- **Topology risk:** introducing gateway mode can fork call paths unless `aiProviderRouter` remains single app-facing execution surface.
- **Parity risk:** JSON mode, token accounting, and fallback semantics may drift from direct-provider behavior if adapter abstraction is weak.
- **Data governance risk:** metadata passthrough must avoid secret leakage while preserving org/user/project/task correlation.

### Langfuse
- **Sensitive logging risk:** prompt/response capture can violate regulated-data handling unless redaction/suppression runs before emit.
- **Trace fragmentation risk:** route-level ad hoc instrumentation would create incoherent traces; integration belongs in gateway/orchestration layer.
- **Retention risk:** Langfuse storage/retention region and legal posture must match tenant/compliance expectations.

### OpenTelemetry
- **Startup risk:** incorrect bootstrap order in `server/index.ts` can miss critical early spans or destabilize startup.
- **Noise/duplication risk:** OTel + existing request logging/Sentry can create redundant telemetry if not scoped and env-gated.
- **Operational risk:** exporter unavailability must not block local startup (non-fatal disabled mode).

### OPA
- **Policy sprawl risk:** route-level copy/paste checks can increase complexity if not centralized in a policy client/middleware layer.
- **Fail-open risk:** regulated actions (compute/export/sign) must default deny when enforce mode is enabled and engine unreachable.
- **Context completeness risk:** policy input lacking org/user/project/resource lifecycle state causes weak or misleading decisions.
