# Report OS Sprint — Architecture First (Concept2Cure V2)

**Date:** 2026-03-30  
**Branch intent:** `concept2cure-v2` only  
**Directive:** architecture/data/orchestration first; no decorative dashboard work.

---

## 1) Blunt truth

Concept2Cure has strong report **ingredients** (submission readiness, editor verification signals, immutable report ledger, export governance, dossier state), but it does **not** yet have a single scope-aware Report OS; reporting is split across workflow screens, point tools, and a powerful-but-generic intelligent report engine that is not yet anchored to canonical account/program/project/study/submission/document scope orchestration.

---

## 2) Phase 1 Forensic architecture audit (repo-truth)

## A. What is truly implemented

1. **Submission readiness provider exists and is real** (`SubmissionReadiness.tsx`): pulls project sections + artifacts and computes readiness by section status.  
2. **Project home has real context signals** (`ProjectHomeDashboard.tsx`): artifact counts, in-review counts, readiness-context prompts; intentionally calm, not dashboard-heavy.  
3. **SubmissionApps can generate governed drafts** (`SubmissionAppsPanel.tsx`): writes artifacts with CTD placement metadata.  
4. **Editor has rich report-provider signals** (`EditorPanel.tsx`): provenance, audit, compliance scan, inconsistencies, compare, version history, submission readiness, GA readiness.  
5. **Unified project hierarchy exists** (`projects` table): self-referential parent/depth/path model supports program/project/study/sub-project lineage.  
6. **Immutable report ledger exists** (`immutable_report_records`, `report_atom_provenance`, `report_seal_events`, `indemnification_attestations`).  
7. **Intelligent report API exists** (`/api/intelligent-reports/*`) with generate/list/provenance/seal/verify/supersede.

## B. What is wired but thin

1. **IntelligentReportGenerator UI** is broad and feature-rich but generic; not yet a canonical scoped report workspace.  
2. **`reports` and `strategic_reports` tables** exist, but they are not formalized around scope taxonomy, dependency contracts, and governed report products.  
3. **Program concepts are split**: `projects.depth=0` hierarchy model and separate `regulatory_programs` schema module both exist, increasing ambiguity.

## C. What is fragmented

1. Reporting signals are spread across:
   - workflow surfaces (submission readiness, dossier)
   - editor inspectors (verify/publish signals)
   - intelligent reports surface
   - submission ops readiness history
2. No single orchestration contract tying these providers into one report artifact model with freshness/confidence/dependency handling.

## D. Existing report data providers (promote to first-class)

- `SubmissionReadiness.tsx` / project sections + artifacts
- Dossier tree/map section placement and status
- `EditorPanel` providers: provenance, compliance, audit, versions, compare, health, proof
- `SubmissionAppsPanel` generated governed artifacts
- submission ops package readiness + readiness history routes
- governance boundary / status transitions / signatures / audit logs

## E. Scaffold/demo-like or over-promising areas

- Generic report UI can imply comprehensive coverage without true scope dependency transparency.
- Report generation currently allows broad domain output without explicit scoped dependency matrix (required provider checks per scope + report type).

---

## 3) Phase 2 Target Report OS architecture map (canonical)

## Canonical system components

1. **Report Workspace (single UI surface)**
   - Scope selector (account/program/project/study/submission/document)
   - Filters: persona, report family, stage, freshness, blockers
   - Snapshot timeline/history
   - Deliverables list (governed artifacts only)

2. **Scope Resolver**
   - Resolves entity + descendants + permissions + tenancy
   - Emits normalized `ReportScopeContext`

3. **Report Taxonomy Registry**
   - Registry of report types and contracts (dependencies, allowed scopes, personas, export templates, governance requirements, truthfulness policy)

4. **Report Orchestration Engine (single backend)**
   - Accepts scope + report type + options
   - Executes provider graph
   - Produces dependency map, unresolved blockers, confidence score
   - Generates governed report artifact and snapshot metadata

5. **Provider Layer (adapters over existing surfaces/services)**
   - readiness provider
   - provenance/evidence provider
   - review/issues provider
   - compliance/audit provider
   - lifecycle/version provider
   - submission package provider

6. **Governed Artifact Output + Snapshot Store**
   - Reuse immutable report records and existing export governance
   - Add scope lineage + snapshot grouping + rerun chain metadata

7. **Truthfulness/Confidence Policy Engine**
   - Blocks “final-ready” claims when dependencies missing
   - Allows draft/partial with explicit caveats and degraded confidence

---

## 4) Phase 3 formal scope model

## Scope enum

- `account`
- `program`
- `project`
- `study`
- `submission`
- `document`

## Scope resolution rules

1. **account**: all accessible org/workspace entities, aggregate by portfolio rules.  
2. **program**: saved grouping of selected projects (not necessarily only hierarchy descendants).  
3. **project**: single `projects.id` root for document workflow aggregation.  
4. **study**: project node where `type`/metadata classify study-level unit, or child of a project/program path.  
5. **submission**: package-level or submission target view (sequence/region/type context).  
6. **document**: single governed artifact/document lineage.

## Aggregation rules

- Roll-up must preserve **source scope IDs** and **weighting logic** (no blind averaging).  
- Readiness/risk aggregates must expose denominator, stale providers, and missing evidence counts.  
- Cross-scope merge rules must retain per-provider freshness timestamps.

## Permissions

- Tenant/org/workspace scoping required on every scope resolution.  
- Scope access = intersection of base entity permission + report-type persona policy.  
- Program scope requires access to all included projects; partial-access programs must degrade to allowed subset and disclose exclusions.

## Freshness rules

- Every provider returns `{observedAt, computedAt, stalenessBudgetMs}`.  
- Engine computes `freshnessStatus` per provider and global worst-case freshness.  
- Snapshots record source freshness at generation time.

## Artifact/report lineage rules

- Every report artifact stores:
  - `scopeType`, `scopeId`
  - `scopeLineage` (ancestor chain)
  - provider dependency set with versions/hashes
  - source artifact IDs and version pins
  - previous snapshot/report link (if rerun)

---

## 5) Phase 4 saved Program grouping model (formal)

## Functional model

A **Program** in Report OS is a saved multi-project grouping with lifecycle:

- create from selected projects
- name/describe/tag
- edit membership
- archive/restore
- run report packs across group
- snapshot over time (reruns are linked snapshots)

## Data model additions (exact)

1. `report_program_groups`
   - `id`, `organization_id`, `client_workspace_id`
   - `name`, `description`, `status` (`active|archived`)
   - `created_by`, `updated_by`, timestamps

2. `report_program_group_projects`
   - `id`, `program_group_id`, `project_id`
   - `added_at`, `added_by`
   - unique `(program_group_id, project_id)`

3. `report_program_group_snapshots`
   - `id`, `program_group_id`
   - `snapshot_label`, `snapshot_reason`
   - `as_of`, `created_by`
   - stores resolved project set hash + scope checksum

4. `report_runs` (shared run ledger for all scopes)
   - `id`, `run_uuid`, `scope_type`, `scope_id`
   - `report_type_id`, `status`, `requested_by`
   - `dependency_summary`, `blockers`, `confidence`, `freshness`
   - `started_at`, `completed_at`, `error`

5. `report_snapshots`
   - `id`, `run_id`, `scope_type`, `scope_id`
   - `snapshot_version`, `is_latest`
   - `previous_snapshot_id`
   - `artifact_record_id` (FK to immutable report record)
   - `snapshot_metadata`

---

## 6) Phase 5 report taxonomy schema (canonical registry)

## Registry contract (`report_type_registry`)

Each report type must define:

- `id`
- `label`
- `family`
- `allowedScopes[]`
- `allowedPersonas[]`
- `allowedClientSegments[]`
- `dataDependencies[]`
- `artifactDependencies[]`
- `workflowDependencies[]`
- `anaModules[]`
- `exportTemplate`
- `governanceRequirements`
- `truthfulnessRules`

## Initial families (required)

1. readiness reports  
2. executive risk/decision memos  
3. evidence/provenance reports  
4. review/issue/contradiction reports  
5. compliance/audit reports  
6. version impact reports  
7. segment-specific submission reports  
8. investor/diligence reports  
9. agency response / HAQ packages

---

## 7) Phase 6 report orchestration engine design

## Input contract

`GenerateReportRunInput` includes:

- scope context (resolved)
- project/program/account hierarchy state
- dossier state
- artifact state
- review state
- contradictions/issues
- provenance/evidence state
- compliance scan state
- audit/signature state
- readiness state
- AnA analysis modules output
- submission type / segment / region

## Execution stages

1. Resolve scope and permissions  
2. Load taxonomy contract for report type  
3. Execute provider graph in deterministic order  
4. Evaluate dependency completeness and blockers  
5. Compute confidence and truthfulness flags  
6. Build report payload + provenance map  
7. Register immutable governed artifact  
8. Persist run + snapshot + lineage links  
9. Trigger governed export using existing pipeline

## Output contract

- governed report artifact (immutable record)
- metadata envelope
- provenance map
- unresolved dependencies
- confidence level
- export package references

---

## 8) Phase 7 provider mapping from existing repo surfaces

| Provider target | Current source | Mapping action |
|---|---|---|
| Submission readiness | `SubmissionReadiness.tsx`, `/api/project-sections`, artifacts API | Extract backend provider service (`readinessProvider`) |
| Dossier completion | dossier tree/map + section placement | Add `dossierProvider` with section completeness contract |
| Provenance/evidence | `EditorPanel` provenance/proof/crossref | Add `provenanceProvider` API adapter |
| Review/issues | comments/reviewers/inconsistency panels | Add `reviewIssuesProvider` |
| Compliance/audit | compliance scanner + audit report + signatures | Add `complianceAuditProvider` |
| Version impact | versions + compare + status timeline | Add `versionImpactProvider` |
| Submission operations | submission ops readiness/history/export | Add `submissionOpsProvider` |
| HAQ/response | existing HAQ flows/services where present | Add `agencyResponseProvider` |

**Rule:** UI components become consumers; provider truth must be backend-first.

---

## 9) Minimum first implementation slice (no decorative UI first)

## Slice-1 (P0) deliverables

1. `report_type_registry` (backend canonical taxonomy)  
2. Scope resolver service + enum contracts  
3. Program grouping tables + CRUD APIs  
4. Report run + snapshot tables + persistence  
5. Orchestrator skeleton with 3 providers:
   - readiness
   - provenance
   - compliance/audit
6. Generate one governed report to immutable record + export handoff  
7. Thin Report Workspace shell (list/rerun/history), no vanity charts

---

## 10) P0 / P1 / P2 reporting gaps

## P0 gaps (must close first)

- No single scope-aware orchestration contract.  
- No saved program grouping model tied to reports.  
- No canonical taxonomy registry with dependency contracts.  
- No run/snapshot lineage model across scopes.

## P1 gaps

- Full provider coverage for review/issues/version impact/HAQ.  
- Persona-based packaged report presets and policy enforcement depth.  
- Cross-region/segment template branching completeness.

## P2 gaps

- Advanced automation (scheduled runs, drift-triggered reruns).  
- Predictive recommendations and portfolio forecasting overlays.  
- Deeper external diligence data integrations.

---

## 11) Migration plan (architecture to implementation)

1. **Schema migration A**: add program grouping + report run/snapshot + taxonomy tables.  
2. **Schema migration B**: add scope lineage columns to immutable report metadata (non-breaking additive).  
3. **Backend phase A**: scope resolver + program CRUD.  
4. **Backend phase B**: provider interfaces + first 3 providers.  
5. **Backend phase C**: orchestrator run endpoint and immutable record integration.  
6. **UI phase A**: Report Workspace skeleton for run/list/history.  
7. **UI phase B**: scope/program selection + blocker/confidence visualization.  
8. **Validation**: truthfulness tests for missing dependencies and confidence downgrade.

---

## 12) Deferred items (explicit)

- Portfolio-level predictive benchmarking visualizations.  
- Non-core decorative charting.  
- Real-time push updates for long-running report runs.  
- Full pack templating across every segment before P0 core is stable.

---

## 13) Sellable first report packs (initial go-to-market)

1. **Executive / Board Pack** — account/program/project scopes.  
2. **RA Lead Pack** — project/submission/document scopes.  
3. **Medical Writing Pack** — project/study/document scopes.  
4. **CMC Pack** — project/submission/document scopes.  
5. **QA / Audit Pack** — submission/document scopes.  
6. **Investor / Diligence Pack** — account/program/project scopes.

**First to sell:** Executive/Board + RA Lead + QA/Audit (highest immediate decision + governance value with existing provider coverage).

---

## 14) Exact schema/data model changes proposed in this architecture pass

**New tables (additive):**
- `report_program_groups`
- `report_program_group_projects`
- `report_program_group_snapshots`
- `report_type_registry`
- `report_runs`
- `report_snapshots`
- `report_run_dependencies` (optional but recommended normalization)

**Additive columns (recommended):**
- `immutable_report_records.scope_type`  
- `immutable_report_records.scope_id`  
- `immutable_report_records.scope_lineage` (json)  
- `immutable_report_records.report_type_id`  
- `immutable_report_records.run_id`

**No destructive migration in slice-1.**

---

## 15) Exact files touched in this architecture-first pass

- `docs/plans/REPORT_OS_ARCHITECTURE_AND_IMPLEMENTATION_SLICE_2026-03-30.md`

