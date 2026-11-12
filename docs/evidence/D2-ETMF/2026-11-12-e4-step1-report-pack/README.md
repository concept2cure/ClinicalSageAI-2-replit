# eTMF convergence E4, step 1: the trial master file report pack reads the deployed store

2026-11-12. Session `…01KnUGoX3g` (the Vault parity lane). Plan package F1. Completes
`server/services/report-os/research-compliance-report-providers.ts`. Build plan:
`docs/design/ETMF_CONVERGENCE_E4_PLAN_2026-11-10.md` §5 and §6 step 1. Founder decisions P-74, P-75 and P-124.

## The defect

The report type `etmf.completeness_pack` counted the second trial master file store's tables (`tmf_files`,
`tmf_artifacts`) for the whole organization, with no person named. It reported `finalPct` from statuses a person
typed with no document behind them. No deploy creates those tables, so on a deployed database a run of this pack
failed on a missing relation (42P01). The E4 plan's finding 6 read this from the code. Reporting's "Sponsor
oversight pack" and the Lumen demo both run it.

## What already exists

| Piece | Path | What it does |
|---|---|---|
| The case | `server/services/report-os/research-compliance-report-providers.ts` (`computeDomainReport`) | Organization-wide counts of the retired store |
| Person-bound packs | the same file (`computeQualityEvidenceReport`), `lifecycle-calendar.ts` | Read as the acting person, over the projects that person can open (`getCurrentAccessibleProgramScope`, `verifiedProgramAnchors`, `requireProgramScopeStillCurrent`) |
| Who acts | `server/routes/report-os.ts` (the run route), `scheduling/generate-deliver.ts` (the scheduler) | Pass `recordContext` (the person and the executor) to the types in a literal list |
| A refusal said as such | `compute-run.ts` | Maps the calendar's "unavailable" to `REPORT_TYPE_NOT_COMPUTED` |
| The deployed store's read | `server/services/etmf/tmf-artifact-persistence.ts` (`readTrialTmf`) | One study: the study, its live filings, the assessment; admits the person to the study's project again |
| A project's studies | `server/services/study-design/study-design-repository.ts` (`listStudyDesigns`) | The protocol-design studies of a project |
| The registry row | `server/services/report-os/taxonomy.ts`, `migrations/20260930_report_type_registry_seed.sql` (generated; upserts every descriptive column) | Label, scopes, data dependencies |
| Unfinished work | an agent's partial patch from 2026-11-11, never committed (plan §3a) | The provider's body. Taken from it, finished and tested here |

## What changed

- `server/services/report-os/trial-master-file-pack.ts`, split out of the providers file in its folder (that file
  would pass 500 lines with it). The pack runs as the person who ran it, over one project or every project that
  person can open.
  - Each study is read with `readTrialTmf`, and every figure is that read's assessment or a count of those
    assessments: studies, studies with a filing, filings by what their document reference was found to be, and
    essential records required, present, missing and declared not applicable (P-124 item 5).
  - Each study is ready, not ready or not determined, with one row per study.
  - No percentage and no typed status are carried over from the old pack.
  - No study, and no filing, are each said as what they are. A failed study read is an error, not a study left out.
  - A project at the study list's cap is refused, not truncated. A change in the person's access while the pack is
    read refuses the whole report.
  - The pack refuses a run with no person, a scope other than project or account, and an unverified project.
- `research-compliance-report-providers.ts`: `computeDomainReport` calls the pack. The old case is deleted.
- `compute-run.ts`: the pack's refusal is answered as `REPORT_TYPE_NOT_COMPUTED`, as the calendar's is.
- `routes/report-os.ts`, `scheduling/generate-deliver.ts`: the pack joins the person-bound list in both places. A
  scheduled run acts as the subscription's creator.
- `taxonomy.ts` and the regenerated seed (L-3):
  - The label becomes "Trial master file filings and readiness".
  - The scopes become project and account. `study` was runnable nowhere, and `submission` would compute something
    wider than its name.
  - The data dependencies become what is read: `tmf_artifact_filings`, `cdisc_prm_studies`, `vault.documents`.
  - The type id is kept, because `report_runs` and `report_subscriptions` reference it.

## Evidence

| File | What it shows |
|---|---|
| `01-run-in-app.txt` | `POST /api/report-os/runs` in the running app on PostgreSQL. A project run answers 201 with the deployed store's figures, the trial master file page's own: 1 study, 2 filings, 2 of 26 essential records present. A study run answers 422 `REPORT_TYPE_NOT_COMPUTED` |
| `02-red.txt` | The 8 new cases against the providers and compute-run as they stood: all 8 fail |
| `03-green.txt` | Those pass. Every report-os suite runs the same as before: the only failures are the 38 PDF renders this host cannot draw (no report fonts), the same 38 by name on HEAD. Also the typecheck (0 errors), the gates and the lint ratchet |

## For Reporting analytics (`011HLkY…`)

The type id is kept. Its label, scopes, dependencies and content changed as above. `Insights.tsx` is not edited and
does not pin the label. A dev or deployed database shows the new label once deploy-migrate re-applies the seed.

## Next (plan §6)

Step 2: AnA's `get_tmf_view` and the trial master file part of `search_all_documents` read the deployed store.
Step 3: AnA's four retired TMF write tools.
Steps 4–5: the second store's routes, metrics, service, schema and migration.
