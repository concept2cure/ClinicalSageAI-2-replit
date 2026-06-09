# IVD Platform — UI & DB Readiness Audit

**Date:** 2026-06-09 · **Scope:** the IVD lifecycle engines + knowledge base built this program (server/service layer), and what is required to add the **UI layer** and **persistence (DB) layer** on top of it. · **Branch:** `concept2cure-v2`.

This is a build-readiness audit, not a re-statement of the regulatory audit. It answers: *what exists, what shape is it in, and exactly what must be built (DB + UI) to ship it to clients.*

---

## 1. What exists today (server/service layer)

### 1.1 Knowledge base — `server/services/ivd-knowledge/`
- **137 curated, citable entries** across 4 domains (regulatory, scientific, legal, standard), every entry carrying source citations and cross-links. Static, version-controlled TypeScript (the `validation-rule-corpus` pattern).
- Domains/files: FDA, EU IVDR, global markets (×2 waves: US/EU/CA/JP/CN/BR/AU/UK/CH/KR/IN/SA/SG), MDCG guidance, labeling rules, AI governance; analytical performance, clinical performance, biomarker validity (×2 waves, 28 markers), standardization/QC, NGS/molecular, pre-analytical/microbiology, platform methodology, clinical areas; LDT/IP/privacy/reimbursement, DTC/genetic/liability, HTA/market-access; ISO/IEC/CLSI standards index.
- **Query service** (`knowledge.service.ts`): relevance-ranked search, filters (domain/jurisdiction/topic/tag), getEntry, related-graph traversal, taxonomy.
- **Consumed by:** `/api/ivd-knowledge/*` (7 endpoints) and the `search_ivd_knowledge` AnA tool.

### 1.2 Lifecycle engines — `server/services/regulatory/` + `server/services/stats/`
Pure deterministic engines exposed at **`/api/ivd-lifecycle/*` (31 endpoints)**:
- Classification: IVDR Annex VIII classifier (+ knowledge citations).
- CDx: biomarker-aware pairing; **study-program designer**; **reviewer simulation** (mock FDA/NB deficiencies).
- Analytical: stability (real-time + Arrhenius), carryover, hook, recovery, cut-off, traceability.
- Clinical/scientific: scientific-validity scorer.
- Software: IEC 62304 safety class, SDLC, SBOM, cybersecurity.
- Change: FDA 510(k)-change, EU significant-change.
- Manufacturing: process validation, Cp/Cpk, lot release.
- Surveillance: PRR/ROR disproportionality.
- Post-market authoring: eMDR / MIR / FSN / PSUR.
- Registration: FDA, EU, Declaration of Conformity; global pathways + readiness.

### 1.3 Already DB-backed (persistence exists)
- **Design controls / DHF + Risk Management File** (`design-risk` service/routes, migration `20260609_design_risk.sql`) — 20 endpoints, org-scoped.
- **QMS** (`qms` service/routes over the previously-dormant `qms_*` tables) — 17 endpoints, org-scoped.
- **IVDR classifications** persist to `ivdr_classifications` (pre-existing table).

### 1.4 Test + quality posture
- ~250 unit tests across the IVD work (corpus invariants incl. no-dangling-links, every engine, persistence services). Typecheck + lint clean. All routes registered in `register-document-routes.ts`.

---

## 2. Architecture: stateless vs persisted (the core gap)

| Capability | API | State today | Needs DB? |
|---|---|---|---|
| Knowledge base | `/api/ivd-knowledge/*` | In-code static corpus | **Optional** (tenant-private entries, versioning, bookmarks) |
| IVDR classification | `/api/ivdr/classify` | **Persisted** (`ivdr_classifications`) | ✅ exists |
| CDx pairing | `/api/ivd-lifecycle/cdx/pair` | **Stateless** | **Yes** — save assessments |
| Study-program design | `/study-design` | **Stateless** | **Yes** — save plans |
| Reviewer simulation | `/review-simulation` | **Stateless** | **Yes** — save review runs |
| Analytical calculators (EP05/06/07/17/25, traceability, carryover, hook, recovery, cut-off) | `/api/ivd-lifecycle/*` | **Stateless** | **Yes** — save study records + results |
| Software / change / process / registration / authoring | `/api/ivd-lifecycle/*` | **Stateless** | **Yes** — save assessments + generated documents |
| Disproportionality signal | `/signal/disproportionality` | **Stateless** | **Yes** — save signals (links to existing PV) |
| Design controls / risk / QMS | `/api/design-risk`, `/api/qms` | **Persisted** | ✅ exists |

**The defining gap:** the calculators are pure functions — excellent for correctness and testing, but in a **regulated** product every computed result that informs a decision must be **persisted with an audit trail** (who ran it, when, with what inputs, against what corpus version, and the result), per 21 CFR Part 11 / ISO 13485 record-keeping. Today only classification, design/risk, and QMS persist. **This is the #1 DB workstream.**

---

## 3. DB readiness audit — what to build

### 3.1 Principle: every governed computation becomes a saved, audited record
Adopt the existing org-scoped, raw-SQL + migration pattern (mirror `design-risk.service.ts` / `20260609_design_risk.sql`). Tenant isolation via `organization_id` (+ optional `program_id` FK into `regulatory_programs`).

### 3.2 Proposed new tables (one migration, e.g. `migrations/20260610_ivd_assessments.sql`)

1. **`ivd_assessments`** — the universal "saved calculator result" spine:
   - `id uuid pk`, `organization_id int not null`, `program_id uuid`, `assessment_type text not null` (e.g. `cdx_pairing|study_design|reviewer_simulation|analytical_stability|software_safety_class|change_510k|registration_eu|psur|...`), `inputs jsonb not null`, `result jsonb not null`, `verdict text`, `corpus_version text` (which KB snapshot), `engine_version text`, `created_by`, `created_at`, `updated_at`, `deleted_at`.
   - Indexes: `(organization_id)`, `(organization_id, assessment_type)`, `(program_id)`.
   - Rationale: one table serves all 25+ stateless calculators without 25 schemas; the typed engine result lives in `result jsonb`. Specialized tables can come later only where query-by-field is needed.

2. **`ivd_analytical_studies`** — already partially exists (`ivd_analytical_performance`/`ivd_clinical_performance` from the earlier lifecycle work); extend or reuse to link a calculator run to a persisted study record + report artifact.

3. **`ivd_generated_documents`** — for authoring outputs (eMDR/MIR/FSN/PSUR/Declaration-of-Conformity): `id`, `org`, `program_id`, `doc_type`, `payload jsonb`, `status (draft|final|transmitted)`, `artifact_id` (link to existing vault/artifacts), audit columns. Ties post-market authoring into the existing submission-gateway transmit path.

4. **Knowledge persistence (optional but recommended):**
   - **`ivd_knowledge_entries`** — mirror of the `KnowledgeEntry` shape to allow *tenant-private* entries and editorial overrides on top of the static corpus (the static corpus remains the seeded baseline). Columns mirror the TS interface (id, domain, topic, title, jurisdictions text[], applies_to text[], summary, detail, key_points jsonb, criteria jsonb, pitfalls text[], citations jsonb, related text[], tags text[], last_reviewed, `source 'builtin'|'tenant'`, org, version, audit).
   - **`ivd_knowledge_bookmarks`** — per-user saved entries.
   - **`ivd_knowledge_citations_in_docs`** — which corpus entries were cited in which generated document/submission (traceability of "we relied on this source").
   - **Versioning:** add a `corpus_version` constant (e.g., a content hash of `IVD_KNOWLEDGE_BASE`) surfaced by the service so saved assessments record which knowledge snapshot informed them — important for regulated reproducibility.

5. **Audit trail:** every write already routes through `auditService.logAction`; ensure the new tables do too. For Part 11 e-signature flows (design/risk/QMS approvals), add `reason_for_change` + `e_signature` capture columns where governed transitions occur (the QMS/design tables already model approval; extend with reason capture).

### 3.3 DB tasks checklist
- [ ] Migration `20260610_ivd_assessments.sql` (assessments + generated-documents tables; optional knowledge tables).
- [ ] `ivd-assessments.service.ts` (save/list/get/soft-delete, org-scoped, audited) + thin route, and wire each `/api/ivd-lifecycle/*` POST to optionally persist when a `programId` is supplied (`?save=true` or body flag).
- [ ] Seed script for `ivd_knowledge_entries` from the static corpus (idempotent upsert, like `seed-regulatory-standards.ts`) **if** tenant-editable KB is desired.
- [ ] `corpus_version` hash surfaced by `knowledge.service.ts` and stamped on every saved assessment.
- [ ] Drizzle table definitions (if the team prefers Drizzle over raw SQL for these — match the surrounding convention).
- [ ] Indexes + tenant-scope review; confirm RLS/where-clause tenant guards on every read/write.
- [ ] Retention/soft-delete policy consistent with existing tables (`deleted_at`).

---

## 4. UI readiness audit — what to build

### 4.1 API-contract readiness (mostly good; a few hardening items)
- ✅ All endpoints authenticated (`authenticateToken`) and (for persisted ones) org-scoped.
- ✅ Consistent 422 validation errors on the calculators; consistent JSON result shapes (typed).
- ⚠️ **OpenAPI/contract:** there is `submission-center.openapi.json` precedent — **generate/author an OpenAPI spec for `/api/ivd-lifecycle`, `/api/ivd-knowledge`, `/api/design-risk`, `/api/qms`** so the frontend can codegen typed clients. This is the highest-leverage UI-enablement task.
- ⚠️ **Pagination:** `/api/ivd-knowledge/entries` and search return full arrays; add `limit`/`offset` (search already honors `limit`) and total counts for list virtualization.
- ⚠️ **Shared types:** export the engine result types (`KnowledgeEntry`, `ReviewResult`, `StudyDesignResult`, `CdxPairingResult`, classification result) from a `shared/` location so the client imports them directly (currently they live under `server/services/...`). Recommend re-exporting the IVD knowledge `types.ts` and engine result interfaces via `shared/ivd/` for client consumption.

### 4.2 Screens / components the UI needs (by surface)
1. **Knowledge Browser** — search bar (debounced → `/search`), domain/jurisdiction/topic/tag facets, entry list (virtualized), entry detail (summary, detail, key points, criteria table, pitfalls, **citations with external links**, related-entry chips for graph navigation), bookmark toggle. Empty/loading/error states.
2. **IVDR Classifier wizard** — guided intended-use questionnaire → class result + rule trace + notified-body flag + citations; "save to program."
3. **CDx Pairing** — biomarker autocomplete (from corpus), therapeutic input, readiness gauge, gaps + recommendations, citations.
4. **Study-Program Designer** — assay-type/intended-use/specimen/biomarker form → analytical + clinical study checklist (each row linking to its CLSI/standard citation), exportable plan.
5. **Reviewer Simulation** — submission-profile form + evidence checklist → deficiency table (severity-coded), verdict banner, per-finding citations; the "pre-submission self-audit" surface.
6. **Analytical calculators** — small focused forms (precision, LoD, linearity, carryover, recovery, cut-off, stability) with result + pass/fail + chart (Levey-Jennings/ROC/linearity plot); save as study record.
7. **Design Controls / DHF, Risk (ISO 14971), QMS** — full CRUD management UIs over the existing persisted endpoints (traceability matrix view, risk matrix heatmap, document-control lifecycle, training compliance, supplier/audit/management-review/NC).
8. **Post-market authoring** — eMDR/MIR/FSN/PSUR builders (form → preview → save/transmit), wired to the existing gateway.

### 4.3 Cross-cutting UI requirements (the regulated-product bar)
- **Regulated-UX (21 CFR Part 11 / GxP):** the repo has a `regulatory-compliance-ux` skill — apply it. Governed mutations (design/risk/QMS approvals, document finalization, transmit) need confirmation + **reason-for-change capture + e-signature**, **visible audit trails**, immutable history views, and role-scoped visibility. The DB columns in §3.2 must back these.
- **Accessibility:** `accessibility-enforcement` skill — WCAG 2.2 AA on every screen (focus order, keyboard, ARIA, contrast, color-never-alone for severity/pass-fail coding).
- **Microcopy/tone:** `microcopy-tone` skill — calm, factual strings for errors/empty states; these screens carry regulatory weight, so no cheerleading.
- **Motion:** `motion-discipline` skill — 200ms ease-out, reduced-motion respected.
- **Design tokens / IA:** use `design-tokens` + `information-architecture` skills to slot these surfaces into the existing product navigation (likely under a "Diagnostics/IVD" workspace alongside the existing MDX/device surfaces).
- **State/empty/loading/error:** every list and calculator needs the four states; citations must render as outbound links with `rel="noopener"`.

### 4.4 UI tasks checklist
- [ ] OpenAPI spec for the four route groups → typed client.
- [ ] Promote engine result types to `shared/ivd/` for client import.
- [ ] Add pagination + total counts to knowledge list/search.
- [ ] Build the 8 surfaces above (suggest vertical slices: Knowledge Browser → Reviewer Simulation → Classifier → Study Designer → calculators → DHF/Risk/QMS → authoring).
- [ ] Apply the 5 design/compliance skills as gates on each slice.
- [ ] Wire "save assessment" actions to the new `/api/ivd-assessments` (depends on §3).

---

## 5. Gaps, risks, and recommended sequencing

**Risks**
- **Stateless-in-a-regulated-product:** calculators must persist results for audit/repro before client GA (DB workstream blocks UI "save").
- **Types live server-side:** the client can't import them cleanly yet → promote to `shared/`.
- **Corpus versioning:** without a `corpus_version` stamp, saved assessments aren't reproducible against a moving KB.
- **Hot branch:** `concept2cure-v2` is very active; land DB migrations carefully (idempotent, additive) to avoid collisions.

**Recommended sequence**
1. **DB foundation** — `ivd_assessments` + `ivd_generated_documents` migration + service; `corpus_version`; wire `save` into calculators. *(unblocks everything)*
2. **Contract** — OpenAPI + shared types + pagination. *(unblocks the frontend)*
3. **UI slice 1** — Knowledge Browser (read-only, lowest risk, immediate value).
4. **UI slice 2** — Reviewer Simulation + Classifier + Study Designer (the differentiators).
5. **UI slice 3** — DHF/Risk/QMS management (regulated-UX heavy).
6. **UI slice 4** — Analytical calculators with charts + post-market authoring.
7. Apply compliance/accessibility/tone/motion skills as per-slice acceptance gates throughout.

**Acceptance criteria for "UI/DB ready":** typed OpenAPI client generated; every governed computation persists with an audit trail and corpus version; every list paginated; all four UI states implemented; WCAG 2.2 AA + Part 11 patterns verified per slice.

---

*This audit reflects the server/service layer as built on `concept2cure-v2` as of 2026-06-09 (137 knowledge entries, ~40 IVD API endpoints, design/risk/QMS persisted, calculators stateless). The DB and UI workstreams above are the remaining path to a client-facing IVD product.*
