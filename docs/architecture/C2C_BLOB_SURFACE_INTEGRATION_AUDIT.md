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
- **Biostat** (interims / sample-sizes / SAPs / TLF) → `biostat_*` tables + the
  `ana-biostats` service.
- **SAE cases** → `adverse_events`.
- **CMC changes** → the `cmc_*` store + the CMC service.
- **Decision lineage** → `data_lineage_records` (the same lineage store the CRE
  provenance envelope feeds).

**B — no obvious real store → genuine demo-only (needs a backend built, or retire):**
market access, reg-change, human-factors files, dossier-map, investigator-brochure,
MAA module, NDA modules, research-admin, program-journey, evidence-asks/objects,
forecast-snapshots, rule-packs, doc-journeys, cro-portfolio. Each needs a product
decision: build the write path, or mark it explicitly as a demo/preview surface.

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

1. **Class A converges** in value order: ~~IND~~ (landed) → ~~Shadow-review~~ (landed) →
   SAE → Biostat → CMC → Decision-lineage. Each is one Protocol-Dev-sized change.
2. **Class B triage** with product: build vs. label-as-preview. Do not leave a
   real-tenant surface silently empty with no signal.
3. A CI guard: fail when a registered surface's read table has only seed writers, so
   this anti-pattern can't be reintroduced.

Protocol-Dev is the first Class-A convergence, complete and landed. This document is
the tracker for the rest.
