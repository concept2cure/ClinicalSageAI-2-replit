# V2 Surface Integration — the `c2c_*` blob-table anti-pattern

**Date:** 2026-07 · **Branch:** `concept2cure-v2` · **Method:** static trace of every
registered v2 surface → its live read endpoint → backing table → live-writer search
(`INSERT INTO <table>` across `server/` and `scripts/`, excluding tests). Confirmed
firsthand on Protocol-Dev, IND-checklist, dossier-map, shadow-review.

## The finding

A large fraction of the v2 surface layer renders **seed-only data**. The pattern,
repeated across ~26 surfaces:

```
registered surface  ──useLive──►  GET /api/<x>  ──SELECT──►  c2c_<x>  ◄──INSERT── ga-demo seed ONLY
   (reachable)                    (read-only route)          (blob table)         (no live writer)
```

Each `c2c_<x>` table is a **single-row-per-tenant JSONB blob** written **only** by a
`scripts/seed/ga-demo.d/*.mjs` seed. There is no CRUD route, no service, no AnA tool
that writes it in normal use. Consequence:

- **On the demo tenant** (seeded) the surface looks fully populated — which is why this
  passed review.
- **On any real tenant** the table is empty, so the surface is permanently empty (or
  falls back to a fixture). The feature is demo-ware.

This is the same failure the Clinical-Regulatory-Evidence and Protocol-Dev audits
found ("correct where wired, not connected to data"), but it is **systemic**, not
per-module: it is how most of the v2 surface layer was built.

## Scope — seed-only `c2c_*` tables (no live writer)

Biostat (`c2c_biostat_interims`, `_sample_sizes`, `_saps`, `c2c_tlf_builds`),
`c2c_blockers`, `c2c_cmc_changes`, `c2c_cro_portfolio`, `c2c_decision_lineage`,
`c2c_doc_journeys`, `c2c_dossier_map`, `c2c_evidence_asks`, `c2c_evidence_objects`,
`c2c_forecast_snapshots`, `c2c_hf_files`, `c2c_ind_checklist`,
`c2c_investigator_brochure`, `c2c_labeling_pi`, `c2c_maa_module`, `c2c_market_access`,
`c2c_nda_m`, `c2c_nda_modules`, `c2c_program_journey`, `c2c_reg_changes`,
`c2c_research_admin`, `c2c_rule_packs`, `c2c_sae_cases`, `c2c_shadow_review`.

(The `c2c_*` tables that DO have a live non-seed writer — correspondence, submissions,
design_controls, agency_meetings, bla_assessments, documents, human_factors scenarios,
smpc_sections, nda_rtf, etc. — are out of scope here; they are wired, though several
still merit a data-flow check.)

## Classification for remediation

**A — a real normalized store already exists → converge (the Protocol-Dev pattern):**
- **IND checklist** → the real org-scoped **eCTD submission core** (`submissions` where
  `application_type='ind'` + `ectd_sequences` + `submission_leaves` + `coauthor_documents`),
  with the canonical 108-section blueprint (`services/regulatory/ind-ectd-sections.ts`)
  for title/module/CFR-ref. NOTE: the tempting `ind_*` tables (ind_protocols,
  ind_pre_ind_data, ind_drafts, …) are the **legacy pre-IND wizard** — UUID/project-keyed,
  no `organization_id`, no section/forms model — so they are NOT this surface's store; the
  data-flow trace lands on the submission core the co-authoring flow actually writes.
  **[CONVERGED]** — assembler + real-store-only route + reseed + pglite test landed.
- **Shadow review** → `shadow_review_runs` + `shadow_review_findings` (the tables
  `shadow-review-service.ts`'s `runShadowReview` persists). **[CONVERGED]** — assembler +
  real-store-only route + reseed + pglite test landed.
- **SAE cases** → **`adverse_events`** (migrations/20260603_pv_operational.sql — the
  UNPREFIXED, org-scoped table `pharmacovigilanceService.reportAdverseEvent` actually
  writes; NOT `pv_adverse_events`, whose SERIAL/prefixed shape the service never uses, and
  which lacks `expectedness` so the 312.32/E2A clock could never fire). Has the case facts
  + `expectedness` + suspect-product/dose, so the expedited-reporting clock computes live
  from real columns. Trial-only fields the PV intake store does not model (age/sex/arm/
  first-dose, medical history, con-meds) are honestly null — the surface renders them
  null-safe and its ICH E3 §16 composer flags them missing rather than inventing them.
  The client was already fixture-free (honest empty state); only a stale route comment
  claimed a fixture fallback. **[CONVERGED]** — assembler (live clock) + real-store-only
  route + reseed into adverse_events + pglite test landed.
- **Biostat** (interims / sample-sizes / SAPs / TLF) → **NOT A LIVE GAP (false-positive
  Class-A).** Traced before building: the `c2c_biostat_saps/_sample_sizes/_interims` +
  `c2c_tlf_builds` blobs are read by `GET /api/intelligence/biostat`, whose ONLY consumer is
  `client/src/concept2cure/intelligence/surfaces/Biostat.tsx` (via `useBiostat`) — and that
  whole `concept2cure/intelligence/` cluster is **unmounted dead code**: nothing outside the
  cluster imports its App/IntelligenceRoute, and `main.tsx → App` never routes to it (same
  pattern as the retired Editor cluster). Meanwhile the LIVE v2 biostat surfaces already read
  REAL, org-scoped backends — `Biostatistics` → `/api/ana-biostats/governed-documents`
  (concept2cure_artifacts) and `BiostatWorkbench` → `/api/statistical-defensibility` +
  `/api/biostat/assurance`. So there is no demo-ware to converge: building stores for these
  blobs would be building for a dead consumer. **[RETIRED]** — deleted the dead
  `concept2cure/intelligence/` client cluster and its `server/routes/intelligence-cluster.ts`
  route (+ format helper, tests, the pure-dead `91-biostat-docs` seed), and dropped the five
  orphaned blobs (c2c_biostat_saps / _sample_sizes / _interims / c2c_tlf_builds /
  c2c_forecast_snapshots) via `20260731_retire_intelligence_cluster_blobs.sql` (IF EXISTS;
  seed-only, no real data, no live reader).

_Methodology refinement: a blob + a route reading it is NOT sufficient evidence of a live gap —
the consuming surface must be a MOUNTED surface. Biostat (and earlier the Editor cluster) are
where table-name/route matching over-counted; always confirm the reader is reachable UI._
- **CMC changes** → **`cmc_change_controls` (built).** Was Class-B — the SUPAC attributes
  existed only in the blob's own migration with no writer. Built the real store
  (`20260730_cmc_change_control_store.sql`, org-scoped, soft-delete) with a live write path
  (`cmc-change-control-service.ts`: createCmcChange, validated; POST /api/cmc-changes,
  audited). GET /api/cmc-changes now reads the real store, projected on read through the
  existing deterministic SUPAC classifier (`projectCmcChanges` — unchanged; the verdict is
  computed, never stored). The Lifecycle card was migrated OFF the `useLiveList` fixture
  onto fixture-free `useLiveRows` (honest empty/error, no "sample" pill). **[BUILT]** —
  migration + service + read-convergence + POST write path + client fixture-free migration
  + reseed into the real store + pglite + route tests landed; blob deprecated.
- **Decision lineage** → the REAL workflow + audit store via
  **`decisionLineageService.getLineageGraph`** (document_workflows / workflow_approvals /
  workflow_history / document_audit_logs + hash-chained `audit_logs`). NOTE: the
  name-matched `data_lineage_records` is *data-derivation* provenance, the wrong model;
  and a raw `audit_logs` map would have been a lossy soft fake. The right source already
  existed: the same real service that backs the per-artifact
  `/api/decision-lineage/:entityType/:entityId`, export, and verify-chain endpoints
  produces the exact LineageGraph — what was missing was the LIST. The convergence
  enumerates the org's real governed artifacts and builds each graph through that service
  (adding `artifactLabel`), so the whole surface reads real governed trails. Real trails
  are richer where the workflow engine wrote them (approvals → signature status, history →
  delegations) and honestly sparser otherwise. **[CONVERGED]** — list assembler +
  real-store-only route + reseed into the real workflow/audit tables + pglite test landed.

_Data-flow trace result (the CRE methodology, applied to each target): the two genuinely
clean, high-value Class-A convergences — **IND** and **Shadow-review** — are landed. The
remaining "Class A" candidates were classified by table-NAME; tracing the actual read
contract shows each needs either a store decision (SAE, Biostat) or a larger,
semantically-correct assembler off a different real store (Decision-lineage), rather than a
one-table map. They are not "one Protocol-Dev-sized change" as first estimated._

**B — traced + adversarially verified (multi-agent disposition pipeline, 2026-07-31).**
Every Class-B blob was deep-traced (route → consuming surface → MOUNTED? → real store +
non-seed writer? → fixture status) and each classification adversarially checked. The
master table (execution status in brackets):

| blob | surface | disposition | real store / action |
|---|---|---|---|
| c2c_market_access | MarketAccess (mounted, now fixture-free) | **BUILD** (verified) | **[BUILT]** `market_access_positions` (20260801, org-scoped, soft-delete) + write path (market-access-service: create validated — status vocab throws on unknown since KPIs/pills key off it; POST /api/market-access audited); GET real-store-only; client's 3 fixture arrays deleted → coverage from real rows, coding = honest projection of the same positions, dossier tab = honest EmptyState (no dossier store exists anywhere — verified, nothing fabricated); reseed preserves the 7-position BX-204 narrative; blob deprecated |
| c2c_reg_changes | RegChange (mounted, fixture-free) | **BUILD** (verified) | no real store existed → built `reg_change_items` (20260801, org-scoped, soft-delete) + write path (`reg-change-service.ts`: createRegChange, validated; POST /api/reg-change, audited); GET reads the real store; client migrated off its fixture onto `useLiveRows`; reseed into the real table; blob deprecated **[BUILT]** |
| c2c_hf_files | HumanFactors (mounted, now fixture-free) | **BUILD** (verified) | **[BUILT]** `hf_engineering_files` (20260801, org-scoped, soft-delete; `present` normalized to the canonical 10 IEC 62366-1 keys so completeness has a stable denominator) + write path (hf-files-service; POST /api/human-factors audited HF_FILE_RECORDED); GET real-store-only; the already-wired c2c_hf_scenarios store kept active with its file linkage repointed to the new store (proven by the still-green scenarios write test); client fixtures deleted → honest states; reseed preserves the BX-204 CGM narrative; blob superseded (retained) |
| c2c_nda_modules | NdaCockpit CTD panel (mounted, now fixture-free) | **CONVERGE** | **[CONVERGED]** onto the eCTD submission core (submissions `application_type IN ('nda','bla')` + sequences + leaves + coauthor_documents — the IND store): nda-modules-view-assembler (module rollups derived from real authoring statuses, honest gate text, IND/NDA leak-proof both ways, proven by tests), /modules route real-store-only, client fixture deleted, reseed = real BX-204 NDA submission + 28 leaves/coauthor docs, blob deprecated. (`c2c_nda_m` was a naming artifact — no such table; the separate c2c_nda_m1_docs/c2c_nda_rtf worklists already have read+write paths and are out of scope.) |
| c2c_doc_journeys | DocJourney (mounted, now fixture-free) | **CONVERGE** (verified) | **[CONVERGED]** onto the real authoring loop — authoring_documents + doc_revisions + authoring_comments + frozen_documents (20260725 tables; live non-seed POST writer at /api/authoring): doc-journey-view-assembler derives each document's journey from its real revision/comment/freeze history (no fabricated stage timestamps); route real-store-only; client fixture deleted → honest states; reseed writes the real loop tables; blob deprecated |
| c2c_cro_portfolio | CroPortfolio (mounted, now fixture-free) | **CONVERGE** (verified) | **[CONVERGED]** onto cro_clients + cro_studies + cro_regulatory_submissions + cro_milestones + cro_team_assignments (real org-scoped CRUD at /api/cro): cro-portfolio-view-assembler (bulk; SOW state derived from real contract facts, gates = live milestone rollups, leads = real org members via team assignments, honest nulls; INTEGER org ids, hard-delete store documented); route real-store-only; client fixture deleted → honest states; reseed writes the five real tables (narrative preserved); blob deprecated |
| c2c_dossier_map | DossierMap (mounted, fixture-free) | CONVERGE (verify pending) | project_sections |
| c2c_research_admin | ResearchAdmin (mounted, fixture-free) | CONVERGE (verify pending) | personnel_training (+ research_personnel) |
| c2c_evidence_asks (+_objects) | Evidence (mounted, fixture-backed) | CONVERGE (verify pending) | ai_retrieval_runs/_chunks + ai_generation_runs (AI trace chain) over lumen_data_atoms |
| c2c_investigator_brochure | InvestigatorBrochure (mounted, fixture-free) | verify pending | trace ambivalent: real upstream nonclinical stores exist but NO IB-specific table; likely BUILD |
| c2c_labeling_pi | LabelingPi (mounted, fixture-backed) | BUILD (verify pending) | labeling.spl_sections exists but is program-scoped (not org) and lacks negotiation — likely build org-scoped store |
| c2c_program_journey | BiopharmaJourney (mounted, fixture-free) | BUILD (verify pending) | no real store |
| c2c_maa_module | MaaCockpit | **ALREADY_REAL** (verified first-hand) | stale audit entry — bare table has ZERO refs; the real store is `c2c_maa_module1_components` (migration-backed, normalized, live UI write path: POST /api/maa-module1/:market INSERT/DELETE at maa-module1.routes.ts:108/:116); surface is fixture-free. No action. |
| c2c_rule_packs | (no surface) | **ALREADY_REAL** (verified first-hand) | global doc_type×agency×version required-sections REGISTRY read by live services/routes (scaffold-project-documents.ts, c2c/projects+documents routes), installed by install-fresh — reference data, not a tenant demo blob. No action. |
| c2c_blockers | (trace pending) | pending | — |

(forecast-snapshots was already dropped with the dead intelligence cluster.)

## The proven remediation pattern (from Protocol-Dev, landed)

1. A bulk **assembler** that maps the surface's full render contract from the real
   normalized tables (org-scoped, soft-delete aware) — every field, no honest-empty.
2. The route reads the **real store only** — no blob, no fallback; an org with no data
   gets the surface's honest empty state.
3. **Reseed** the demo into the real store via the tested service's exact columns, so
   the demo renders through the same path a live tenant uses; drop the blob write.
4. **pglite integration test** proving the mapping against real SQL + tenant scope.
5. Deprecate the `c2c_<x>` blob (leave the table, stop reading/writing it).

## Prioritized roadmap

1. **Class A — COMPLETE.** ~~IND~~ (→ eCTD submission core), ~~Shadow-review~~
   (→ shadow_review_runs/findings), ~~SAE~~ (→ adverse_events), and ~~Decision-lineage~~
   (→ decisionLineageService over the real workflow/audit store) converged onto existing
   real stores; ~~CMC changes~~ was a greenfield **build** (new cmc_change_controls store +
   write path + fixture-free client); ~~Biostat~~ turned out to be a **false-positive** — its
   blobs feed an unmounted dead cluster and the live v2 biostat surfaces are already real, so
   no build was needed. Net of the original 6-target "Class A": 4 convergences + 1 greenfield
   build + 1 non-gap. Biostat follow-up cleanup DONE: the dead `concept2cure/intelligence/`
   cluster and its five orphaned blobs were retired
   (`20260731_retire_intelligence_cluster_blobs.sql`).
2. **Class B triage** with product: build vs. label-as-preview. Do not leave a
   real-tenant surface silently empty with no signal.
3. A CI guard: fail when a registered surface's read table has only seed writers, so
   this anti-pattern can't be reintroduced.

Protocol-Dev is the first Class-A convergence, complete and landed. This document is
the tracker for the rest.
