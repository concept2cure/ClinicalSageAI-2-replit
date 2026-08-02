# Biotech Market-Readiness — Remediation Checklist

Actionable backbone for getting Concept2Cure / TrialSage to a commercially
credible state for biotech. Derived from a fresh-eyes code review (backend,
UI shell, data-room→authoring flow, CMC). Each item cites the real files.

Legend: `[ ]` open · `[~]` in progress · `[x]` done · **P0** ship-blocker ·
**P1** needed for a credible POC · **P2** depth/scale · **P3** cleanup.

Guiding principle: **converge, don't expand.** Stop presenting 127 surfaces and
914 endpoints; prove one biotech golden path end-to-end with real data.

---

## Phase 0 — Stop advertising what the backend can't stand behind (ship-blockers)

- [ ] **P0 Back or remove every unbacked table touched by a live route.** 89 tables
  are read/written with no migration creating them; the writes 500 and the error
  is swallowed. Highest risk: the **Part-11 authoring audit trail** wrote to a
  nonexistent table and logged CRITICAL for the life of the feature — a
  compliance liability, not a bug. Source of truth: `scripts/ci/unbacked-tables-baseline.json`.
  Clusters: `authoring_*` (6), `stab_*` (~11 + 2 views), `ind_*` (3),
  `submission_*` (3), `analytical_*` (4), `maud_*` (3), knowledge/vault (~9).
- [ ] **P0 Consolidate the two migration lineages.** `migrations/` vs `db/migrations/`
  produce **67 duplicate-DDL tables** (`scripts/ci/duplicate-table-ddl-baseline.json`);
  all use `CREATE TABLE IF NOT EXISTS`, so a customer's shipped column shape
  depends on migration ordering and can differ from the demo DB. Pick one lineage.
- [ ] **P0 Remove hardcoded mock route bodies** (they read as working product):
  - `server/routes/programs.ts:449` and `:534` — fake `Dr. Sarah Chen` milestones/activity.
  - `server/routes/predictive-sections.ts:113` — "Mock template data" object.
- [ ] **P0 Delete the dead Python bridge** `server/ind-automation-service.ts:111` +
  `server/routes/ind_automation_routes.ts` — spawns `start_ind_automation_api.py`,
  a file that does not exist in the repo.

## Phase 1 — One coherent shell (fixes the reported apps/nav complaint)

- [x] **P1 Unify the segment axis.** Rail wrote `segment` from `CLIENT_CATEGORIES`
  (`diagnostics`,`health`) but `getSegment()` read it against `SEGMENTS`, so those
  two silently fell back to medtech. Fixed in `client/src/concept2cure/v2/registryModel.ts`:
  added `diagnostics`/`health` to `SEGMENTS`, `CLIENT_CATEGORIES` is now derived
  from `SEGMENTS` (drift-proof), with a regression test in
  `client/src/concept2cure/v2/__tests__/registryModel.test.ts`.
- [ ] **P1 Make one canonical app source feed all three "apps" views.** Today there
  are 3–4 divergent lists that don't read from each other:
  - Rail: hardcoded `RAIL_CORE/RAIL_SPECIALIST/RAIL_EXPLORE/RAIL_QUICK` (`registryModel.ts`) — ~13 items.
  - Home grid "Everything in your workspace": `SEGMENT_MODULES[segment]` (`registryModel.ts`) — 57 biotech surface ids.
  - Rail → Explore → "Apps catalog": `available_modules` table via `/api/module-subscriptions/catalog` (`server/services/license-manager.ts:105`) — 22 **billing module ids** (`cmc-wizard`, `doc-canvas`, `csr-author`…), a different id scheme from the surface ids.
  - Master registry: `shared/constants/ui-surface-registry.ts` — ~49–96 surfaces.
  Make `ui-surface-registry.ts` the single source; derive Home + Rail sections +
  the Apps-catalog surface from it, intersected with live entitlement state.
- [ ] **P1 Reconcile the billing-module ↔ surface-id mapping** so the Apps catalog
  lists the same apps a user sees on Home (the literal complaint). Add a
  `moduleId → surfaceId` map (or align the `available_modules.path` column to the
  v2 surface ids in `db/migrations/20260220_user_intelligence_platform.sql:78`).
- [ ] **P2 Make the Rail complete and segment-aware.** It exposes ~13 of ~57 biotech
  destinations; there is no rail path to CMC, IND, NDA, PV, program-journey, etc.
  Render the registry groups filtered by active segment.
- [ ] **P3 Fix reverse taxonomy gap:** `academic`/`regulatory`/`medical_writing`
  segments fall back to biotech in `getSegmentContext`/`getSegmentModules`
  (`registryModel.ts`). Give them real module/context maps or hide them.
- [ ] **P3 Delete or intentionally retain `KitSurfaceScaffold`** — now unreachable
  (every registry surface has a real `SURFACE_VIEWS` component), and correct the
  9 stale `readiness: 'kit-only'` entries that in fact ship a view.

## Phase 2 — The biotech golden path, fixture-free (the deal-closing demo)

Target flow: **upload to Vault → AnA drafts a grounded section into a real
editor → governed edit with citations + Part-11 e-sign → compile → eCTD export.**

- [ ] **P1 Unify the three authoring backends onto one document model.** A doc in one
  is invisible to the other two: `/api/authoring` (`authoring_sections`/`doc_revisions`),
  `/api/coauthor` (`coauthor_documents`/`coauthor_sections`), `/api/c2c/documents`
  (`c2c_documents`/`c2c_document_sections`). See `docs/spikes/authoring-convergence-spike.md`.
- [ ] **P1 Route the real editor.** The `DocCanvas` primitive (`surfaces/EditorCanvas.tsx`,
  contentEditable + formatting + real `onSave`/`onAsk` seams) is used by
  DeviceSubmission/ProtocolWorkspace but the primary authoring surfaces edit via
  `<textarea>` (`DocumentAuthoring.tsx:635`, `EctdCoauthor.tsx:366`). Swap them —
  see spike (content-format migration required; do NOT do blind).
- [ ] **P1 Draft INTO the section, not the side chat.** `EctdCoauthor.tsx:276` admits
  the pane doesn't yet consume `/api/ana-ri/stream` inline; today the user copies
  text from the chat rail. Stream generated content into the active section.
- [ ] **P1 Make grounding explicit per draft.** `/generate` grounds only on
  `conversationContext.slice(-20)` (`server/services/ana-ri/artifact-generator.ts:417`) —
  the chat, not a per-draft RAG prefetch over the selected Vault sources. Bind
  "these data-room sources → this draft" at generation time so provenance is
  guaranteed, not incidental.
- [ ] **P1 Back the `authoring_*` review/compliance tables** (suggestions, reviews,
  compliance_scores, comment_activity, suggestion_feedback, audit_events) — the
  authoring compliance UI depends on them.
- [ ] **P2 Make Vault RAG real.** `vault.document_chunks/extracted_entities/`
  `evidence_citations` are unbacked, so semantic search over the data room isn't
  real yet. (Upload + pgvector into `lumen_data_atoms` IS real.)
- [ ] **P2 Purge fixtures on every golden-path surface.** 44 surfaces still import
  `client/src/concept2cure/v2/fixtures/` behind a "Sample data" pill. Migrate to
  `useLiveData`/`useLiveRows`/`EmptyState` (`v2/dataConnect.tsx`). Relocate the
  ~6–8 legitimate logic/enum modules out of `fixtures/` (they're not demo data).

## Phase 3 — CMC: make the UI do the backend justice

Backend = ~28 route files, 120+ endpoints, ~6,700 LOC of real services. UI wires
~19 endpoints (~15%). Most of P0 is wiring already-built, already-tested routes.

- [ ] **P0(CMC) Module 3 build console** — surface `compile/:pid`, per-section
  completeness/`missingInputs`, `refresh`, **contradictions** view/resolve
  (`api/cmc/module3OperatingSystemRoutes.ts`), and the `guard/final-export` gate.
- [ ] **P0(CMC) Shelf-life (ICH Q1E) panel** on Stability — wire the already-built
  dead hook `useProjectShelfLife` / `stability/:id/projections`
  (`server/services/cmc/shelf-life.ts` real OLS regression).
- [ ] **P0(CMC) ICH-compliance dashboard** — wire dead hook `useICHComplianceCheck` /
  `POST ich-compliance` (`server/services/cmc/ich-compliance-checker.ts`).
- [ ] **P0(CMC) SUPAC/variations classifier** in the Change surface — deterministic,
  citable (`server/services/cmc/supac-classifier.ts`) alongside the AI narrative.
- [ ] **P1(CMC) §3.2.S / §3.2.P / analytical-method / manufacturing-process editors** —
  tables (`shared/cmc-schema.ts`) and routes (`api/cmc/projectRoutes.ts`) exist; no UI.
- [ ] **P1(CMC) Comparability surface** (biologics-critical) — `comparability-studies`
  CRUD + `server/services/cmc/biologics/comparability.ts`.
- [ ] **P1(CMC) Fix Specifications JSONB flattening** — `test_parameters`/
  `acceptance_criteria`/`test_methods` are JSONB but the form degrades them to text.
- [ ] **P2(CMC) Control-strategy surface**, provenance/version viewers, workflow +
  AI-command console, auto-draft-from-uploads.
- [ ] **P3(CMC) Surface or deprecate the 3 dark AI modules** (~2,000 LOC):
  manufacturing-tuner, preclinical-translator, audit-risk-monitor (`api/cmc/index.js`).
- [ ] **P3(CMC) Resolve two-copilot redundancy** — shell AnA (`/api/ana-ri/stream`) vs
  the CMC Copilot surface (`/cmc-copilot/query`).

## Phase 4 — Delete the dead weight

- [ ] **P2 Delete the disabled Python FastAPI/Celery stack** — `services/api.py`,
  `worker.py`, `celery_app.py`, `ectd_generator.py`, `job_store.py`,
  `secure_runner.py`, `services/{api,worker}.Dockerfile`, `services/docker-compose.yml`.
  Not booted in prod (`server/startup/services.ts:30` `startPythonBackend` = no-op).
- [ ] **P2 Delete `services/documents/ChangePropagationService.ts`** — zero importers.
- [ ] **P2 Delete the shelf-ware authoring shell** `client/src/concept2cure/authoring/App.tsx`
  (unrouted; its "AI" is `setTimeout` typing `AUTH_REWRITES` strings) + `authoring/data.ts`.
- [ ] **P2 Make `AuthoringEngine` real or delete it** — routed as `authoring-engine`,
  renders prose "guarantees" with zero API calls (`surfaces/AuthoringEngine.tsx:37+`).
- [ ] **P3 Burn down the 189 unreferenced modules** (`scripts/ci/unreferenced-modules-baseline.json`),
  incl. duplicate DB layers (`server/db/pool.ts`,`connection.ts`,`initDatabase.ts`,`tenantRls.ts`)
  and stray client `.js` shadows.
- [ ] **P3 Prune stale `knip.json` ignore entries** for already-deleted dirs
  (`lumen_cortex`, `analytics-engine`, `ind_automation`, `backend`, `agents`).
- [ ] **P3 Retire the 3 legacy gateway-bypass files** (`server/services/anthropic-client.ts`,
  `openai-client.ts`, `openai-service.ts`) onto `server/services/ai-gateway/`.

## Phase 5 — Harden for procurement (ongoing)

- [ ] **P2 Drive down the 556/914 orphaned endpoints** (`docs/reports/orphan-endpoints-latest.md`) — untested surface + maintenance drag.
- [ ] **P2 Finish tenant-isolation ratchets** (`scripts/ci/check-tenant-isolation.mjs`, `docs/reports/tenant-isolation-baseline.json`).
- [ ] **P1 Produce the Part-11 / CSV validation evidence pack** a biotech quality team will demand (e-sign §11.70/§11.200 is real in `server/routes/esignature.ts`; document it).

---

### What's already real (do not rebuild — connect and prove)
AI gateway (real multi-provider calls), AnA agentic loop (66 tool families,
grounding, provenance), auth/JWT/SAML, Stripe billing, eCTD ZIP packaging,
Part-11 e-signature, pgvector retrieval, S3 storage, the CMC Module-3 engine,
and the governed authoring/coauthor/c2c-documents stores. The through-line of the
whole review: **the backend is ahead of the UI, and the best work is the work
that isn't wired in.** Getting to market is mostly connect-prove-delete.
