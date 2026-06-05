# Submission Center — canonical architecture & build state

Single source of truth for the AnA Submission Center. Supersedes the earlier
phase handoff. Parent spec: `AnA_Submission_Center_Architecture_and_Build_Spec.md`.
Audit record: `RECONCILE.md`.

**Branch:** `concept2cure-v2` (only). **Verification state:** `tsc --noEmit` = 0
errors; 59 unit tests green. DB-runtime (`drizzle-kit push`, live endpoints) and
all UI are **not** verified here — no database/browser in the build container.

---

## 1. The one canonical model (everything converges here)

The submission core is **one** region-agnostic spine. Region/pathway differences
are projections, never forks.

| Table | Role |
|---|---|
| `submissions` | the lifecycle-aware submission object (application type, client type, primary region, lifecycle stage) |
| `submission_regions` | per-region projection (region × pathway + profile versions) |
| `ectd_sequences` | the lifecycle ledger (0000 → amendments → …); status, validation/dispatch status, frozen_at |
| `submission_leaves` | doc→CTD-leaf mapping; section, granularity, lifecycle op, **polymorphic** `document_table`+`document_id`, parent leaf |
| `submission_evidence_links` | provenance: a section/claim ⟶ its source document (Truth Engine seed) |
| `shadow_review_runs` / `shadow_review_findings` | the moat: simulated-reviewer runs + RTF/CRL/format/NB findings |

All SERIAL int PKs, the 6 mandatory columns, every FK indexed, tenant-scoped by
`organization_id`. Migrations are date-prefixed SQL + Drizzle (`shared/schema/*`)
+ types; re-exported through `shared/schema.ts`.

## 2. The layers (all on the canonical core)

- **Service** — `services/submission-service`: CRUD + lifecycle transitions
  (`draft→assembling→validated→frozen→dispatched`, pure-rule enforced), governed
  freeze, Builder-leaf upsert. Every mutation audited.
- **API** — `routes/submissions.ts` at `/api/submissions`: list/create/get
  submissions, list/create sequences, sequence transition, list/upsert leaves.
  RBAC (`regulatory-author`), rate-limited, Zod-validated, org/user from session.
- **Ingestion** — `services/ingestion`: `document-classify` + `document-extract`
  through the AI gateway → persists leaf proposals + evidence links; endpoints on
  `ectd-documents.ts`.
- **eCTD engine (deterministic)** — the real publisher `submission-gateways/
  regional-packager.ts` (`packageEctdSubmission`) + validators
  (`ectd/ectd4-validator`, `ectd-regional-rules`, `ectd-validator-hardening`) +
  live transmission (`fda-esg`/`ema-cesp`/`pmda-gateway`). New pure primitives:
  `ectd/lifecycle-operator`, `cross-reference-resolver`, `stf-generator`,
  `pdfa-detect`. **Bridge:** `ectd/core-to-packager` + `package-from-core` make
  the canonical core drive the real publisher.
- **Shadow Review** — `services/shadow-review`: region-lensed reviewer pass →
  persisted runs + findings; deterministic risk aggregation bounds the model.
- **AnA control (governed)** — AnA tools cover the core end-to-end:
  `compute_lifecycle_operations`, `generate_stf`, `check_ectd_cross_references`,
  `validate_ectd_package`, `classify_submission_document`,
  `extract_submission_document`, `run_shadow_review` — plus the pre-existing
  `package_ectd_for_region`/`transmit_submission`/etc. Tenant/user from
  `ToolContext`, never model args.

**Governance rail (non-negotiable):** irreversible/outward actions — sequence
**freeze** and **transmit to FDA/EMA/PMDA** — require the human e-signature /
governed-action gate; no LLM path bypasses it. Deterministic publishing bytes are
never touched by an LLM (spec §7).

## 3. Cleanup / convergence (the legacy sprawl)

The repo accreted **several parallel submission representations**. The canonical
core above is the one they converge onto. Convergence status:

| Legacy model | Used by | Plan |
|---|---|---|
| `reg_*` packager (`src/services/reg/{indexXml,packager}`) | nothing (orphaned) | **DONE — deleted.** Replaced by `core-to-packager` + the live publisher. |
| `reg_submissions`/`reg_m3_*` readiness/portfolio | portfolio, IR-draft, rpi/impact/digest/gatekeeper/preflight/playbook | **TODO (DB):** repoint onto the core, then retire; needs a UUID→serial id map + the drifted `reg_m3_sections.up_*` columns fixed. |
| `submission_projects`/`submission_tasks` (`/api/submission-center`) | submission-center UI | **TODO:** migrate projects/tasks into `submissions` + a tasks table on the core. |
| `ctd_onboarding_*`, `ind_submissions`, `regulatory_submissions`, `fda510k_submissions`, `pma_submissions`, `cro_regulatory_submissions`, `qSubmissions`, `ctdSubmissions` | various pathway/onboarding flows | **TODO:** fold into `submissions` + `submission_regions` (pathway field); keep pathway-specific detail tables, drop duplicate submission headers. |

This is the largest remaining backend effort and is a **data migration** — it must
run against a real DB with the operator, not be fabricated blind.

## 4. What "full scale done" still needs (prioritized)

1. **DB cutover** — `npm ci` + `drizzle-kit push`; seed + `--verify`; exercise
   `/api/submissions` and the AnA tools against real data; the legacy→core data
   migration (§3).
2. **UI** — all seven workspaces (Planner, Builder, Sequences, Validation, Shadow
   Review, Cross-Region, Dispatch). Nothing is built; the API + data now exist to
   render against. Claude Design owns this (design-system non-negotiables apply).
3. **Remaining AI tasks** — `submission-plan`, `section-generation` (streaming),
   `provenance-trace`, `consistency-check`, `validation-explain`,
   `cross-region-gap`, `dispatch-qc` (only classify/extract/shadow-review exist).
4. **Truth Engine** — `consistency_findings` + cross-document consistency.
5. **A real `resolveFile`** for `package-from-core` (materialize document content
   to disk) + wire `packageSequenceFromCore` to a route/AnA tool.
6. **Real `requireRole` value** — confirm seeded users carry `regulatory-author`.

## 5. Honest state

The **backbone is now one coherent system**: a single canonical data model, a
service + REST API, ingestion, the real deterministic eCTD engine driven from the
core, Shadow Review, and AnA control — all typechecked and unit-tested, with the
Part 11 governance rails intact. Against the full Definition of Done (plan →
assemble → validate → shadow-review → cross-region → publish → dispatch, with a
UI, every legacy model converged, runtime-proven), this is the **spine and the
moat**, not the finished product. The remaining work is concentrated in §4 — most
of it requires a database and a browser, which this container does not have.
