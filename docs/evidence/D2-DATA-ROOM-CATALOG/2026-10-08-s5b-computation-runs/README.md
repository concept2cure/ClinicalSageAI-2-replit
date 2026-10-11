# D2 — a computed sample size names the stored, reproducible run that produced it (Data Room catalog S5b)

Date: 2026-10-08. Launch row: **D2**.
Design: `docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md`, slice S5.
S5a, the drafted-figure check, is in `../2026-10-08-s5a-drafted-figures/`.

## The defect

The statistics engine stamps each result with its provenance
(`stats/computation-provenance.ts`: engine, version, inputs SHA-256, seed), and nothing
kept that stamp. `applySampleSizeToDesign`, the governed write of a planned N onto a
study design, recorded three things:

- a label;
- a `sha256:` reference on the design's evidence;
- the hash in the governed-action payload.

It did not keep the inputs themselves. So the N a protocol synopsis and its SAP §6 state
could not be reproduced from any record (ICH E9 sample-size justification; ALCOA+
"original").

## The change

- **`migrations/20261008f_stats_computation_runs.sql`** creates `public.stats_computation_runs`.
  - Each row holds the inputs as computed, the outputs, a SHA-256 of each, the method,
    engine, version, seed and purpose, and who ran it.
  - `organization_id INTEGER NOT NULL`. The tenant sweeps, which run last, give it RLS:
    enabled, forced, one policy, as verified after migrating.
  - It has same-organization keys to the project
    (`regulatory_programs (id, organization_id)`) and the study design
    (`cdisc_prm_studies (id, tenant_id)`). Each is `ON DELETE SET NULL` of its own column,
    so deleting a design detaches its runs and keeps them.
  - Every statement is `IF NOT EXISTS`, there is no DROP, and it sits before the sweep
    pair.
- **`server/services/stats/computation-runs.ts`.**
  - `recordComputationRun` writes the run on the caller's transaction. It hashes the
    stored JSON form, so a dropped `undefined` or a `NaN` cannot make a faithful record
    look tampered.
  - `reproduceComputationRun` recomputes the stored inputs and reports five things:
    whether the inputs and outputs still hash to what was recorded, whether the
    recompute equals the stored outputs, whether the engine version matches, and why a
    run could not be recomputed when it could not.
- **`applySampleSizeToDesign`** stores the run first, in its own transaction, against the
  design's row and project. The design's evidence stamp reads "… stored run #N", with the
  inputs hash as its `ref`. The governed-action payload carries `computationRunId` and
  `outputsSha256`, and the result returns `computationRunId`.
- **SAP §6** (`sap-projection.ts`) prints the stamp with the inputs hash: "stored run #N
  (inputs sha256:abcdef012345…)".

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | `tests/db/stats-computation-run.dbtest.ts` against trunk's code: 6/6 fail. No run is stored, so there is no table, no run id and no key (`42P01`). |
| `02-green-real-pg.txt` | The suite on PostgreSQL 16 as `app_service` with `RLS_ENFORCE=on`: 6/6. The run is stored against this design and project. The design, the governed action and the SAP name it. The stored inputs recompute to the stored outputs. An edited output is caught. Another organization neither finds the run nor can key one to this design (`23503`). |
| `03-migrate-twice.txt` | `deploy-migrate.mjs` twice on the same database. |
| `04-integrity-check-removed-red.txt` | With `outputsIntact` forced true, the edited output passes unnoticed and the test fails. This shows the check catches the case it exists for. |

## Not in this slice

- **Span lineage with `computed` usage for a figure in a document.**
  `document_span_lineage` can cite only an evidence-spine source today. A new provenance
  kind would be counted as unattributed by `summarizeDocumentAttribution`, whose
  `KIND_PRECEDENCE` lists four kinds, so that reader has to learn the kind first. The
  design-level record above is what a document's figure will cite.
- **Engines other than the bridge's sample-size compute** (about 30 import
  `computation-provenance`). Each records a run when its figure is used, through the
  same `recordComputationRun`.
