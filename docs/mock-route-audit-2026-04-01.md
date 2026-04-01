# Mock Route & Incomplete Backend Audit

Date: 2026-04-01  
Scope: `server/` route handlers and API modules (excluding tests and seed data)

## Method

Used targeted code search to locate production route handlers that still contain mock/stub/incomplete behavior:

- `rg -n -S "mock|stub|placeholder|not implemented|for now|demo mode|fallback" server/routes server/api --glob '!**/__tests__/**'`
- `rg -n -S "Mock response - replace with actual DB" server/routes server/api`
- Manual review of high-signal files listed below.

## Executive Summary

High-priority backend route groups still return in-memory/mock payloads or incomplete placeholder behavior:

1. **`/api/supply-chain/*`** uses large in-file mock datasets and mock fallback writes/updates.
2. **`/api/evidence/*`** is mostly scaffold responses with explicit "replace with DB" comments.
3. **`/api/programs/*`** is largely mock CRUD + mock timeline/statistics.
4. **`/api/cerv2/export/mock/*`** intentionally exposes dev mock export endpoints.
5. **`/api/tenants/:id` and `/api/tenant-stats/:id`** return dev-only mock tenant payloads.

Additional medium-priority routes have explicit "not implemented" or placeholder behavior and should be queued after the five groups above.

## Priority-Ordered Findings

## P0 — Mock route families to replace first

### 1) Supply Chain API is mock-first (not DB-first)
- File: `server/routes/supplyChain.routes.ts`
- Evidence:
  - Large hardcoded mock entities (`mockSuppliers`, `mockMaterials`, `mockBatches`, `mockShipments`, etc.).
  - Multiple endpoints mutate in-memory arrays and fall back to mock on DB errors.
- Risk:
  - Non-durable writes, inconsistent state, no auditable persistence guarantees.
- Recommended conversion:
  - Move all reads/writes to governed tables through a service layer.
  - Remove mock fallback writes entirely (fail closed when DB unavailable).
  - Add migration + integration tests for each CRUD route.

### 2) Evidence API scaffolded with mock response blocks
- File: `server/routes/evidence.ts`
- Evidence:
  - Explicit `"Mock response - replace with actual DB query/insert/update"` markers in core CRUD/search endpoints.
  - Hardcoded evidence records and synthetic facets/stats.
- Risk:
  - Appears functional to clients while bypassing real persistence and tenant data integrity.
- Recommended conversion:
  - Implement DB-backed repository queries scoped by org/tenant.
  - Replace random code generation and synthetic totals with transactional writes + SQL aggregates.

### 3) Programs API scaffolded with mock CRUD/activity/stats
- File: `server/routes/programs.ts`
- Evidence:
  - Core CRUD, milestones, activity feed, and overview stats return hardcoded objects.
- Risk:
  - Program management surfaces non-source-of-truth state; impossible to audit or reconcile.
- Recommended conversion:
  - Introduce table-backed program + milestone models and replace all hardcoded response blocks.
  - Preserve existing response contract but source all fields from DB.

### 4) CERV2 mock export routes are still mounted
- File: `server/routes/cerv2-export-routes.ts`
- Evidence:
  - Explicit mock endpoints:
    - `GET /mock/:docType`
    - `GET /mock/:docType/docx`
    - `GET /mock/:docType/zip`
    - `GET /mock/:docType/json`
  - Uses `mockVault` content for export generation.
- Risk:
  - Dev endpoints can be invoked in non-prod environments and normalize mock pathways in critical flows.
- Recommended conversion:
  - Remove or feature-flag mock endpoints behind explicit dev-only build/runtime flag.
  - Ensure UI export flows use only document IDs persisted in DB.

### 5) Tenant endpoints still return development mock payloads
- Files:
  - `server/routes/tenants.ts`
  - `server/routes/tenant-stats.ts`
- Evidence:
  - `NODE_ENV === 'development'` branches returning hardcoded tenant/profile/stats payloads.
- Risk:
  - Environment-dependent behavior can mask missing schema/data and produce false confidence.
- Recommended conversion:
  - Remove hardcoded dev payload branches.
  - Keep local-dev usability via seeded DB records (`npm run db:ensure` + seed scripts) instead of inline mock objects.

## P1 — Incomplete/placeholder route behavior

### 6) Regulatory calendar creation endpoint explicitly not implemented
- File: `server/routes/regulatoryRoutes.ts`
- Evidence:
  - `POST /calendar` returns `501 Not implemented` with guidance text.
- Recommended conversion:
  - Implement governed insert path into regulatory correspondence/submission workflow tables with org scoping and audit event write.

### 7) Organizations routes return mock organization data
- File: `server/routes/organizations-routes.ts`
- Evidence:
  - Comments and handlers indicate mock organization/client payloads.
- Recommended conversion:
  - Back route with organization + client DB tables and drop in-file mock records.

### 8) Compliance gap analysis generates mock trend/report data
- File: `server/routes/compliance-gap-analysis.ts`
- Evidence:
  - Comments: "Generate mock trend data" and "mock data for now".
- Recommended conversion:
  - Derive trends/reports from persisted historical assessments and violations.

### 9) Predictive sections returns mock template data
- File: `server/routes/predictive-sections.ts`
- Evidence:
  - Comment indicates mock template data in production route path.
- Recommended conversion:
  - Query governed template catalog tables and materialize responses per submission type.

### 10) Intelligent docs contains disabled placeholder scoring path
- File: `server/routes/intelligentDocs.ts`
- Evidence:
  - Returns `Not implemented` to prevent placeholder compliance scoring.
- Recommended conversion:
  - Implement real scoring against document evidence/quality signals or remove endpoint from client until ready.

## Suggested Fix Sequence (one-by-one)

1. `server/routes/supplyChain.routes.ts` (largest mock surface; highest risk).  
2. `server/routes/evidence.ts` (core regulated data path).  
3. `server/routes/programs.ts` (program lifecycle source-of-truth).  
4. `server/routes/cerv2-export-routes.ts` mock endpoints removal/flagging.  
5. `server/routes/tenants.ts` and `server/routes/tenant-stats.ts` dev-mock removal.  
6. Remaining P1 routes.

## Implementation Guardrails for Each Conversion

- Keep tenant/org scoping mandatory for every query/mutation.
- Fail closed on DB/service outages (no in-memory write fallback for regulated records).
- Add route-level integration tests covering CRUD + auth + org boundary.
- Emit audit events on creates/updates/deletes in regulated domains.
- Preserve API contract shape to avoid frontend regressions while swapping backing implementation.

