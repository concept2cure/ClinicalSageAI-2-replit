# CMC + AnA Integration Audit (Codebase Reality Check)

Status: ACTIVE
Canonical: Yes
Supersedes: —
Superseded By: —
Related Reports: CMC_TOP_LEVEL_UI_HUMAN_EXPERIENCE_AUDIT_2026-03-25.md; CONCEPT2CURE_ANA_INTEGRATION_EXECUTION_PLAN_2026-03-24.md


**Date:** 2026-03-25  
**Scope audited:** CMC module backend + frontend, AnA integration surfaces, API connectivity, and activation/readiness gaps.

## Executive summary

The platform has substantial CMC and AnA building blocks, but they are not wired together as one coherent, production-ready flow yet.

- **CMC exists in multiple parallel implementations** (legacy module, large wizard, blueprint stack, Prisma dashboard path).
- **AnA exists via multiple APIs** (`/api/ana-ri`, `/api/ai-actions`, `/api/ai/regulatory-guidance`) with inconsistent UI usage.
- **Primary gap:** the CMC UI that users hit by default is not the same one that exercises the richer CMC + workflow + intelligence stack.
- **Secondary gap:** several CMC-specific frontend surfaces call endpoints that are defined in files that are not mounted under `/api/cmc` in `server/index.ts` (notably workflow/collaboration/document subrouters from `cmcRoutes.ts`).
- **Result:** partial functionality, uneven data persistence, and inconsistent AnA behavior depending on entrypoint.

---

## 1) How the CMC module currently works

### 1.1 Server-side CMC architecture (current)

Mounted CMC routes in `server/index.ts` are:

- `app.use('/api/cmc', cmcCoreRoutes)`
- `app.use('/api/cmc', cmcAggregatorRoutes)`
- `app.use('/api/cmc', cmcProjectRoutes)`
- `app.use('/api/cmc/blueprint', cmcBlueprintRoutes)`
- `app.use('/api/cmc/specifications', cmcSpecificationRoutes)`
- `app.use('/api/cmc/stability', cmcStabilityRoutes)`
- `app.use('/api/cmc/batch-records', cmcBatchRecordRoutes)`
- `app.use('/api/cmc/dashboard', cmcDashboardPrisma)`
- `app.use('/api/cmc/dashboard-legacy', cmcDashboardRoutes)`

This means CMC is split across at least:

- **Core CRUD route set** (`server/api/cmc/routes.ts`) for analytical methods, process validation, stability studies, QC, change control, drug substances/products, etc.
- **Project-centric route set** (`server/api/cmc/projectRoutes.ts`) with authenticated project/sub-resource operations.
- **Blueprint route set** (`server/api/cmc/blueprintRoutes.ts`) for generating CMC blueprints and templates.
- **Prisma dashboard route set** (`server/routes/cmc-dashboard-prisma.ts`) for summary/stage gates/tasks/risks/insights.
- **Legacy dashboard route set** (`server/routes/cmc-dashboard.ts`) for org-scoped project metrics from `cmc_change_control`.

### 1.2 CMC data models

CMC data is distributed across at least two schema families:

- Large shared Drizzle schema (`shared/schema.ts`) containing core CMC tables.
- CMC-focused schema (`shared/cmc-schema.ts`) used by project/specification/workflow-related APIs.

There is also some **in-memory fallback/mock behavior** (e.g., comparability studies in `server/api/cmc/routes.ts`) and Prisma missing-table fallback responses in dashboard routes.

### 1.3 Frontend CMC surfaces

There are at least two major CMC UX paths:

1. **`/cmc` → `CMCPage` → `CMCModule`** (tabbed, lighter experience; pulls projects/substances/products).
2. **`/cmc-wizard` → `CmcWizard` → `ComprehensiveCMCPlatformClean`** (very large, enterprise-style CMC workspace with many tabs and endpoint calls).

Plus:

- `/cmc-blueprint` mapped to `CMCBlueprintGenerator`.

This creates a split UX where users may land in a simpler module and miss richer workflow/quality/regulatory orchestration features in the wizard path.

---

## 2) How AnA can work with CMC today

### 2.1 Available AnA-capable backend surfaces

You have three different AI pathways relevant to CMC:

1. **AnA RI** (`/api/ana-ri`) — rich orchestrated chat and stream routes.
2. **AI Actions** (`/api/ai-actions`) — structured action execution with auth, permissions, queueing, locking, provenance.
3. **Regulatory guidance endpoint** (`/api/ai/regulatory-guidance`) — used by current `LumenAiAssistant` UI.

### 2.2 UI-to-AnA reality in CMC context

The globally mounted assistant UI (`LumenAiAssistant`) currently posts to `/api/ai/regulatory-guidance`, not `/api/ana-ri/chat` and not `/api/ai-actions/execute`.

Implication:

- CMC users can chat with an assistant, but they are **not consistently entering the full AnA RI orchestration + action loop** from that surface.

### 2.3 Structured action readiness

`/api/ai-actions` is production-oriented (permissions, async queue fallback, status polling, SSE stream). This is the right control plane for auditable “AnA does work in CMC” interactions.

However, frontend CMC flows are not consistently wired to dispatch governed module-scoped actions through this API.

---

## 3) Does it deliver all needed CMC services/features?

### 3.1 What is present

- Strong breadth of endpoints and UI components for CMC authoring, quality, process, stability, risk, and blueprinting.
- Separate CMC dashboard metrics and readiness APIs.
- Advanced workflow and collaboration route files exist.
- AnA RI + AI Actions foundations exist.

### 3.2 Critical delivery gaps

1. **Route/implementation fragmentation**
   - `server/api/cmc/cmcRoutes.ts` mounts `/workflows`, `/collaboration`, `/documents` subrouters, but that router itself is not mounted in `server/index.ts`.
   - Net effect: code exists for richer CMC subdomains but may be unreachable via intended `/api/cmc/...` paths unless duplicated elsewhere.

2. **Multiple CMC entry points with inconsistent capability depth**
   - `/cmc` and `/cmc-wizard` are different products from a user perspective.
   - This creates support burden, inconsistent behavior, and unclear “source of truth” for CMC operations.

3. **Navigation mismatch**
   - UI links refer to `/cmc-module` in some places, while canonical routes in App are `/cmc`, `/cmc-wizard`, `/cmc-blueprint`.
   - This likely causes dead links or user confusion depending on nav component used.

4. **AnA integration inconsistency**
   - Assistant UI route uses `/api/ai/regulatory-guidance`, while full AnA RI lives at `/api/ana-ri`.
   - This splits capabilities, telemetry, and governance outcomes.

5. **Governed actions not yet first-class in CMC UX**
   - AI Actions API is mounted and capable, but CMC UIs do not appear uniformly wired to it for mutation workflows with provenance.

6. **Mixed persistence maturity**
   - Some CMC pieces are robust (DB-backed), some include in-memory stores/fallbacks.
   - This can break continuity, auditability, and multi-user reliability.

---

## 4) How CMC is accessed from UI today

Current route map highlights:

- `/cmc` → `CMCPage` → legacy-style `CMCModule`.
- `/cmc-wizard` → `ComprehensiveCMCPlatformClean` (full CMC wizard UX).
- `/cmc-blueprint` → CMC blueprint-focused surface.

Also observed:

- Some nav cards/buttons target `/cmc-module`, which is not defined as an app route in `client/src/App.jsx`.

Recommended UX decision:

- Pick one canonical CMC route (suggest `/cmc`) and make it render the full, production CMC surface.
- Keep old routes as explicit redirects with deprecation notes.

---

## 5) What is needed to get this fully hooked up and functional

## Phase 0 (1–2 days): decide canonical architecture

1. Declare one canonical CMC frontend entrypoint.
2. Declare one canonical CMC backend composition (which route file is authoritative).
3. Declare one canonical AnA invocation path for CMC (prefer `/api/ana-ri` for chat and `/api/ai-actions` for mutations).

## Phase 1 (2–4 days): routing and mounting cleanup

1. Mount/retire duplicated CMC routers explicitly.
   - Either mount `cmcRoutes.ts` under `/api/cmc` or fold its subrouters into already-mounted routers.
2. Eliminate dead/duplicate endpoints or alias with a documented migration path.
3. Fix all UI links to canonical routes (`/cmc`, `/cmc-wizard` redirect strategy, remove `/cmc-module` ambiguity).

## Phase 2 (3–5 days): AnA + CMC hard integration

1. In CMC UI, wire assistant actions to:
   - `/api/ana-ri/chat` for contextual CMC reasoning.
   - `/api/ai-actions/execute` for governed actions (create/edit/promote/validate/route/export).
2. Pass module context explicitly (`module: 'cmc'`, section, artifact, project metadata).
3. Surface action receipts/provenance in CMC UI (status, actionId, object mutations).

## Phase 3 (3–5 days): persistence and readiness hardening

1. Remove in-memory-only CMC stores from production code paths.
2. Replace fallback “synthetic success” responses with clear readiness states and setup instructions.
3. Add tenancy/auth consistency checks across all CMC APIs.

## Phase 4 (2–4 days): E2E and operational validation

1. Build CMC golden-path E2E tests:
   - create project → author section → run validation → AnA action → promote/export.
2. Add contract tests that detect route drift between frontend calls and mounted backend endpoints.
3. Add observability dashboards for CMC+AnA flow success/failure and queue fallback frequency.

---

## 6) Definition of “fully hooked up” (acceptance criteria)

You can consider CMC + AnA fully functional when all are true:

1. **Single canonical CMC route** used by end users.
2. **No dead CMC links** in nav/components.
3. **All CMC UI API calls hit mounted routes** in current server startup config.
4. **AnA from CMC uses canonical RI + Actions stack** with module-scoped context.
5. **Every mutation action has provenance** (who/when/what changed).
6. **No in-memory production data paths** for CMC business entities.
7. **E2E green** for at least one complete regulatory CMC scenario.

---

## 7) Priority defects / risks to track immediately

1. `cmcRoutes.ts` not mounted while containing important subrouter composition.
2. `/cmc-module` links present but route not declared in App router.
3. Split assistant pathways causing non-uniform AnA behavior.
4. Potential capability confusion between `/cmc` and `/cmc-wizard` experiences.

---

## 8) Recommended immediate execution order

1. **Routing truth pass** (frontend links + backend mounted routes).
2. **Canonical CMC UX decision** (`/cmc` as unified entry).
3. **AnA endpoint unification** (`/api/ana-ri` + `/api/ai-actions` in CMC surfaces).
4. **Persistence hardening and fallback cleanup**.
5. **E2E and release gate for CMC+AnA scenario**.

