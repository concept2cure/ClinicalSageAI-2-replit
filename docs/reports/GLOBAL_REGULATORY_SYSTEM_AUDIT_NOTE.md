# Global Regulatory Document System — Audit Note

**Date:** 2026-03-27

---

## What Was Hardcoded Before

| Area | Hardcoded Pattern | Location |
|------|------------------|----------|
| Submission types | Enum: '510K', 'IND', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA', 'IVDR' | ZenSidebar SUBMISSION_BADGE, FirstRunExperience types, project model |
| Project bootstrap | switch/if-else on submissionType to choose sections | ProjectWorkspaceShell, DossierMap DEFAULT_CTD_STRUCTURE |
| Templates | 3 hardcoded: CER, 510(k), CSR | templateRegistry.ts (cerTemplate, fda510kTemplate, csrTemplate) |
| Milestones/tasks | Fixed set per submission type | INDChecklist, CSRWorkflow components |
| Region logic | Fragmented across routes and services | regional-ctd-templates.ts, ind-ectd-sections.ts |
| Readiness validation | Hardcoded completeness engine | validate-completeness-engine.ts |
| DossierMap sections | Static DEFAULT_CTD_STRUCTURE fallback | DossierMap.tsx lines 31-80 |
| SectionWorkspace lookup | Hardcoded SECTION_LOOKUP with static status values | ZenApp.tsx lines 3009-3170 |
| Onboarding types | Fixed arrays: PHARMA_TYPES, DEVICE_TYPES | FirstRunExperience.tsx |
| AnA IND context | IND-only section list in system prompt | chat.ts IND context block |

## What Is Registry-Driven Now

| Area | Registry-Driven Pattern | Location |
|------|------------------------|----------|
| Application types | 70+ entries across 12 regions, 12 agencies | shared/regulatory/global-document-registry.ts |
| Type taxonomy | Typed: Region, Agency, ApplicationFamily, ProductClass, DossierStandard, LifecycleStage | shared/regulatory/document-taxonomy.ts |
| Region profiles | 12 profiles with agency details, currency, language, dossier standards | shared/regulatory/region-profiles.ts |
| Project bootstrap | bootstrapProject(entry) → sections + milestones + requiredArtifacts | shared/regulatory/project-bootstrap.ts |
| Section blueprints | CTD, Device, CER blueprints selected by registry entry | shared/regulatory/project-bootstrap.ts |
| Task blueprints | Milestones selected by registry entry | shared/regulatory/project-bootstrap.ts |
| Readiness matrix | assessReadiness(blueprint, artifacts) — registry-driven | shared/regulatory/readiness-matrix.ts |
| Backward compat | LEGACY_TO_REGISTRY_ID maps old types to new | shared/regulatory/document-taxonomy.ts |
| Project metadata | enrichProjectMetadata() adds .regulatory without migration | shared/regulatory/project-model-integration.ts |
| API | 5 endpoints: registry, regions, search, resolve, by-id | server/routes/regulatory-registry.ts |
| UI picker | ApplicationTypePicker: Region → Type → Summary | ApplicationTypePicker.tsx |

## Coverage

| Region | Country | Agency | Application Types |
|--------|---------|--------|-------------------|
| US | United States | FDA | 14 (IND, NDA, BLA, ANDA, 505(b)(2), DMF, Pre-IND, supplements, 510(k), PMA, De Novo, EUA) |
| EU | European Union | EMA | 13 (CTA, MAA, ASMF, Type IA/IB/II variations, PIP, orphan, RMP, PSUR, renewal, CER, IVDR) |
| UK | United Kingdom | MHRA | 4 (CTA, UK MA, IRP, variations) |
| CA | Canada | Health Canada | 7 (CTA, CTA-A, NDS, SNDS, ANDS, SANDS, MF) |
| JP | Japan | PMDA | 5 (CTN, marketing approval, MF, partial/minor changes) |
| CN | China | NMPA | 4 (CTA, MAA, supplementary, renewal) |
| AU | Australia | TGA | 4 (CTN, CTA, Category 1/2) |
| CH | Switzerland | Swissmedic | 2 (CTA, MA) |
| BR | Brazil | ANVISA | 3 (DDCM, DEEC, MA) |
| IN | India | CDSCO | 7 (CT-04, CT-06, CT-07, CT-11, CT-18, CT-19, CT-21) |
| KR | South Korea | MFDS | 3 (IND, new drug MA, generic MA) |
| SG | Singapore | HSA | 2 (NDA, GDA) |

**Total: 68 application types across 12 regions and 12 agencies.**

## What Still Works (Backward Compatibility)

- Existing projects load unchanged (no migration needed)
- Old submissionType values ('510K', 'IND', etc.) resolve to registry entries
- Existing 510(k), IND, BLA, MAA, PMA flows still function
- Provenance, signatures, review, and work items untouched
- Governed artifact workflow intact

---

## 2026-04-01 Audit Addendum — Communications, Submissions, and Tasking Central System

**Scope audited**
- Communication Center scaffold (`/api/concept2cure/projects/:projectId/...`)
- Regulatory Correspondence OS (`/api/regulatory-correspondence/...`)
- Submission Ops command center (`/api/submission-ops/...`)
- Submission Center (`/api/submission-center/...`)
- Unified task systems (`/api/task-management/...`, `/api/unified-tasks/...`)
- Intended unified submissions hub (`/api/regulatory-submissions/...`)
- Client integrations in Concept2Cure workspace and related hooks/components

### Executive status

The "central system" currently exists as **multiple parallel systems**, not one converged operating backbone.  
Some pieces are production-leaning (notably `concept2cure.ts` communication center routes with tenant + audit patterns), but key surfaces are currently:

1. **Not mounted in runtime** (high risk of 404s)
2. **Partially scaffolded / structurally incomplete**
3. **Inconsistent in tenant isolation and compliance controls**
4. **Under-tested as an integrated system**

---

## Findings (severity ordered)

## CRITICAL

### 1) Regulatory Correspondence + Submission Ops + Regulatory Submissions routes are defined but not mounted in server runtime

**Evidence**
- Routes exist in aggregator:
  - `server/routes/index.ts:55` → `router.use('/regulatory-submissions', regulatorySubmissionsRoutes);`
  - `server/routes/index.ts:84` → `router.use('/submission-ops', submissionOpsRoutes);`
  - `server/routes/index.ts:85` → `router.use('/regulatory-correspondence', regulatoryCorrespondenceRoutes);`
  - `server/routes/index.ts:91` → `mountApiRoutes(app)`
- Aggregator is not wired in runtime:
  - `mountApiRoutes(` appears only in `server/routes/index.ts` (no mount call in `server/index.ts`).
  - `server/index.ts` has no `app.use('/api/submission-ops'...)`, no `app.use('/api/regulatory-correspondence'...)`, no `app.use('/api/regulatory-submissions'...)`.

**Impact**
- Client surfaces that call these routes will receive 404 in live runtime.
- `client/src/concept2cure/components/correspondence/RegulatoryCommunicationsHub.tsx` calls `/api/regulatory-correspondence/*` directly (`lines 44, 60, 61, 78, 84, 101, 215`).
- `client/src/concept2cure/hooks/useSubmissionOps.ts` calls `/api/submission-ops/*` across all hooks (`line 10` and throughout).

**Priority**
- P0: Mount these routes explicitly in `server/index.ts` (or reliably mount the central aggregator) and add smoke tests in real app wiring.

---

### 2) Regulatory Correspondence OS has tenant-boundary weaknesses and spoofable org context in route handlers

**Evidence**
- Org/user context fallback allows body/header/default values:
  - `server/routes/regulatory-correspondence.ts:128-133`
  - Uses `req.body.organizationId || req.query.organizationId || req.headers['x-organization-id'] || 1`
- Multiple DB reads/writes are **not org-scoped**:
  - `GET /submissions/:submissionId` by id only (`lines 264-272`)
  - `PATCH /submissions/:submissionId/state` update by id only (`lines 291-295`)
  - `GET /correspondence/:correspondenceId` by id only (`lines 492-507`)
  - `PATCH /issues/:issueId/review` update by id only (`lines 530-538`)
  - `GET /timeline` only optional `submissionId` filter (`lines 633-644`)
  - `GET /mailbox-connections` org sourced from query/header/default (`lines 658-664`)

**Impact**
- Cross-tenant data exposure/modification risk if IDs are known/guessable.
- Violates stated multi-tenant invariants and compliance expectations.

**Priority**
- P0: Replace actor/org extraction with authenticated tenant context only, and add org conditions to every query/update/delete.

---

## HIGH

### 3) Unified Regulatory Submissions hub is structurally incomplete (null schemas/tables)

**Evidence**
- `server/routes/regulatorySubmissions.ts:9-17`
  - `submissionProjects`, `submissionSequences`, `documentModules`, `documentGranules` are `null`
  - insert schemas are `null`
- Routes still attempt Drizzle operations against those null placeholders.

**Impact**
- Even if mounted and feature-enabled, these endpoints will fail at runtime.

**Priority**
- P0/P1: Wire real schema tables and validators before exposure.

---

### 4) Feature gate for unified submissions likely unresolved in practice

**Evidence**
- `server/routes/regulatorySubmissions.ts:26` uses `requireFeature('UNIFIED_REGULATORY_SUBMISSIONS')`
- Only occurrence of this key is in this route file.
- `FeatureToggleService` defaults to disabled if key does not exist:
  - `server/services/featureToggleService.ts:32-34`

**Impact**
- Route may remain permanently unavailable unless feature toggle row is seeded and enabled.

**Priority**
- P1: Add deterministic bootstrap for toggle + integration test proving enabled path.

---

### 5) Submission Center (`/api/submission-center`) appears non-tenant-scoped and not Part 11-grade

**Evidence**
- `server/routes/submissionCenter.routes.ts` uses raw SQL over `submission_projects` and `submission_tasks` with no org filters (`lines 43-55`, `150-157`, etc.).
- Creates with static creator `"User"` (`line 98`) and no tenant context.
- No auditable mutation envelope equivalent to Concept2Cure audit pattern.

**Impact**
- Cross-tenant mixing risk in shared DB.
- Compliance traceability weaker than concept2cure routes.

**Priority**
- P1: Either harden (org columns + auth-derived scoping + audit trail) or deprecate behind feature flag.

---

### 6) Tasking system has mixed tenant safety; several endpoints fall back to body/query/default org

**Evidence**
- Stronger pattern exists:
  - `server/routes/taskManagement.routes.ts:232`, `286` use `getSecureOrgId(req)`
- But weak fallbacks remain:
  - `POST /tasks/auto-assign` default `organizationId = 1` (`line 600`)
  - `GET /tasks/by-module/:moduleId` query org or default `1` (`lines 511-513`)
  - `GET /tasks/analytics` query org or default `1` (`lines 655-657`)
  - Template/automation routes read org from request body.

**Impact**
- Inconsistent tenancy guarantees across task endpoints.

**Priority**
- P1: Standardize all org resolution to authenticated tenant context only.

---

### 7) Client/manual intake path can violate correspondence DB constraints

**Evidence**
- Client sends placeholder submission id:
  - `client/src/concept2cure/components/correspondence/RegulatoryCommunicationsHub.tsx:103` → `'manual-submission'`
- Correspondence schema requires UUID reference in DB mode:
  - `db/migrations/20260331_regulatory_correspondence_os.sql:42` (`submission_id UUID ... REFERENCES c2c_submissions(id)`)

**Impact**
- Intake may fail when DB mode is active (depends on path/data).
- Creates unreliable behavior between in-memory fallback and real persistence.

**Priority**
- P1: Require real submission selection/creation before intake or add explicit temporary submission flow with valid UUID record.

---

## MEDIUM

### 8) Architecture is fragmented into parallel "central" systems with minimal convergence

**Evidence**
- Communication Center tables: `concept2cure_*` (`db/migrations/20260331_communication_center_scaffold.sql`)
- Correspondence OS tables: `c2c_*` (`db/migrations/20260331_regulatory_correspondence_os.sql`)
- Submission Ops: `c2c_submission_packages` etc. in `shared/schema.ts` (`line 5941+`)
- Submission Center uses separate `submission_projects` / `submission_tasks` (route-only references).
- Tasking duplicated between `taskManagement.routes.ts` and `unifiedTasks.routes.ts` with different contracts.

**Impact**
- High integration cost and semantic drift.
- Difficult to define single source of truth for package state/task state/communication state.

**Priority**
- P1/P2: Choose canonical operating model and map all parallel systems to it (keep, bridge, or retire).

---

### 9) Tests are mostly scaffold-level for this area; integrated runtime coverage is thin

**Evidence**
- Communication Center test is static source assertions:
  - `tests/communication-center-backend-scaffold.test.ts` checks string presence only.
- Correspondence integration test mounts router directly:
  - `server/routes/__tests__/regulatory-correspondence.test.ts:7`
  - Does not validate production mount graph in `server/index.ts`.
- No focused integration tests found for mounted `/api/submission-ops`, `/api/submission-center`, `/api/task-management` interplay.

**Impact**
- Critical regressions (404 wiring, tenant scoping leaks) can pass tests.

**Priority**
- P1: Add end-to-end API wiring tests through real app bootstrap + auth + tenant context.

---

### 10) Communication Center fallback behavior can mask true "empty" backend states

**Evidence**
- Hook initializes from defaults:
  - `client/src/concept2cure/hooks/useCommunicationCenterData.ts:48-57`
- Replacement occurs only when rows exist (`rows.length > 0`):
  - `lines 72-73`, `87-88`

**Impact**
- Valid empty backend response can still display demo-like defaults.
- Operators may see stale scaffold data instead of true empty state.

**Priority**
- P2: Distinguish `unavailable` vs `empty` vs `populated` explicitly in UI state.

---

## POSITIVE findings (what is already good)

1. **Communication Center routes are under strong middleware chain**
   - `server/routes/concept2cure.ts:150-152` uses auth + tenant context + organization requirement.

2. **Communication Center writes audit records on mutations**
   - Uses `logAuditEntry(...)` from `concept2cure.ts` (e.g., `10798`, `10945`, `11052`, etc.).

3. **Submission Ops publish endpoint has explicit fail-closed gates**
   - Confirmation header gate, blocker gate, readiness threshold gate:
   - `server/routes/submission-ops.ts:1215-1276`

4. **Correspondence payload validation exists**
   - `server/routes/regulatory-correspondence.validation.ts` includes bounds and schema checks.

---

## Completion matrix (current)

| Capability Area | Status | Notes |
|---|---|---|
| Communication Center API under concept2cure | Partial-usable | Mounted and scoped; migration-dependent fail-closed behavior |
| Regulatory Correspondence OS API | Implemented but likely unreachable in runtime | Router exists/tests exist; not mounted in `server/index.ts` |
| Submission Ops command center | Implemented but likely unreachable in runtime | Router exists + robust logic; not mounted in `server/index.ts` |
| Unified Regulatory Submissions hub | Incomplete | Null schema/table placeholders |
| Submission Center | Mounted but legacy/parallel | Separate model, weak tenancy/compliance posture |
| Task management APIs | Mounted and active | Mixed tenancy hardening maturity across endpoints |
| Unified central model | Not achieved | Multiple parallel domains/tables/route families |

---

## Recommended next focus sequence (for your upcoming implementation phase)

1. **Route exposure unification (P0)**  
   Make all intended central endpoints actually reachable in runtime (`server/index.ts`) and verify with integration tests.

2. **Tenant safety hardening pass (P0/P1)**  
   Eliminate body/header/default org fallbacks and enforce authenticated tenant context across correspondence/task/submission ops.

3. **Canonical domain decision (P1)**  
   Pick one canonical model for submission + correspondence + task orchestration; define explicit adapters for legacy routes.

4. **Regulatory submissions hub completion (P1)**  
   Replace null placeholders with real schema and validators; seed/verify feature toggle enablement.

5. **Client contract cleanup (P1/P2)**  
   Remove placeholder IDs (`manual-submission`), unify empty/unavailable state behavior, and align routes to mounted reality.

6. **End-to-end test gate (P1)**  
   Add smoke/integration suite that runs through actual app wiring and fails on unmounted/unsafely-scoped APIs.

---

## Audit confidence

**High** for route wiring, incomplete implementation, and tenant-scoping observations (direct code evidence).  
**Medium** for runtime behavior assumptions where environment-specific flags/data may alter active paths.
