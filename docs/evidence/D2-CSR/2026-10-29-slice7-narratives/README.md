# CSR slice 7: patient safety narratives from subject-level ADaM data

Launch row D2 (Authoring / Submission Center, W1) and the D4 biostatistics evidence it rests on.
Design: `docs/design/CSR_END_TO_END_2026-10-29.md`, slice 7. Board row: "AnA builds a CSR end to end" in `docs/work-orders/README.md`.
Lane boundary: the D5 CSR-path lane owns release, review, approval, signing and transmission, and the AnA tools
`draft_safety_narrative`, `narrate_statistical_result` and `record_endpoint_result`. None of these tools, their
`AnaToolExecutor` handlers or `shared/authoring/csr-scientific-review.ts` was edited. The deterministic composer
`composeSafetyNarrative` is imported unchanged.

All data in this slice is **SYNTHETIC**. It is invented test data shaped like LMN-201 Part B
(`server/services/csr/__tests__/support/adam-narrative-synthetic.ts`). No value is Lumen's, LMN-201's, a patient's or a
reported result.

## What already exists

Searches run: `narrative`, `safety-narrative`, `SafetyNarrative`, `12.3.2`, `14.3.3`, `16.2.7`, `ADMH`, `AESI`,
`special interest`, `DTHFL`, `ASTDY`, `ASTDT` across `server/`, `shared/`, `client/src/concept2cure/`, `migrations/` and
`db/migrations/`. Deleted history: `git log --all --diff-filter=D -- '**/*arrative*'`.

| Piece (path) | What it does today | What it does not do |
|---|---|---|
| `server/services/ana/safety-narrative.ts` `composeSafetyNarrative` | Deterministic E3-ordered prose for one subject from supplied fields, and a missing-field list. | It has no reader. The model types the fields in through `draft_safety_narrative` (D5 lane). **Reused by import, unchanged.** It is the template prose of every narrative here. |
| `draft_safety_narrative` (`AnaToolExecutor.ts`) and the `safety_narrative` intelligence flow (`intelligence-questions/engine.ts:615`) | One case per chat call, from interview answers. | No subject-level data and no batch. D5 lane; not touched. |
| Deleted batch UI `2895218b8` (2026-08-04): `SafetyNarrativeAffordance.tsx`, `SafetyNarrativeQcPanel.tsx`, `safetyNarrativeBatch.ts` | Parsed an uploaded line listing, chained `draft_safety_narrative` → `author_docx_native` → `verify_docx_against_source`, and showed a QC checklist of missing E3 fields. | Its inputs were typed or uploaded case fields, not ADaM. **Its QC role is restored on the build board** (`CsrNarrativeBuild`, below), fed by the engine rather than a user-supplied listing. No second editor or surface was built. |
| `server/services/safety-narrative-service.ts` + `server/routes/safety-narrative.ts` (`/api/safety-narratives/*`, `SafetyNarrative.tsx` surface) | Pharmacovigilance SAE **case** worklist (pv `sae-cases`) and model-written aggregate, SAE, benefit-risk and signal narratives, behind a number-grounding guard. | It does not read ADaM, select subjects by the E3 §12.3.2 rule, or write CSR §14.3.3. It is a PV/ICSR case narrative, not the CSR's subject narratives. **Not converged in this slice.** Its `generateSAENarrative` asks a model for the narrative. That is a RULE 2 candidate for slice 9's retirement list, recorded under "Open" below. |
| `server/services/csr/csr-job-runner.ts` | Per-section persistence with SHA-256, resume of only verified sections, preservation of damaged rows, and claim/cancel checks. | No per-subject work. **Its rules are followed per subject** in `csr-narrative-job.ts`, and the narrative output lands in its `csr_section_outputs`. |
| Slice 6 ADaM engine (`adam-dataset-reader.ts`, `adam-rows.ts`, `adam-bundle-load.ts`, `vault-source-input.ts`, `shared/csr-adam-bundle.ts`) | Reads Dataset-JSON and XPT, and derives the csr-source.v1 envelope under Vault approval checks. | It discards the rows after derivation. It has no ADMH and no AESI declaration. **Extended** (below). |
| Slice 3 board (`CsrBuildProgress.tsx`, `CsrWorkflow` in `BiopharmaProject.tsx`, `csr-section-review.ts`) | Heading review and import of approved sections into Authoring. | It had no narrative action. **Extended** with one panel in the same file. |
| `ICH_E3_GUIDANCE` §12.3.2 / §14.3.3 (`csr-e3-sections-results.ts`, `csr-e3-sections-appendices.ts`) | The E3 brief: narrative order, study days rather than dates, and placement in §14.3.3. | The source of the rules followed here. Read, not edited. |

Nothing in the repository selected narrative subjects from subject-level data (the design names
`narrative-subject-selection.ts` as new), and nothing reconciled a narrative's dates and days to ADaM rows.

## What changed

Engine (new, in the existing csr service):
- `narrative-subject-selection.ts` applies the E3 §12.3.2 rule over ADSL and ADAE. It selects every death (ADSL DTHFL or
  DCSREAS DEATH, ADAE AESDTH or AEOUT FATAL), every SAE (AESER = Y, **including events that are not
  treatment-emergent**), every withdrawal for an AE (AEACN DRUG WITHDRAWN, and ADSL DCSREAS or DCTREAS ADVERSE EVENT) and
  every AESI the manifest declares (`adverseEventsOfSpecialInterest`: an ADAE flag and/or MedDRA PTs). Subjects are ordered
  by treatment group, then subject. A blank AESER, an undeclared AESI flag variable, or an ADAE subject that ADSL does not
  list is a typed `CSR_ADAM_*` refusal naming `ADAE[row].VAR`. None of these is read as "no".
- `narrative-subject-facts.ts` builds each subject's facts from that subject's rows only, using one-pass row indexes for
  ADEX, ADCM and ADMH. The facts are demographics, treatment, first dose, exposure (TRTDURD), event term, onset
  (ASTDT/ASTDY), severity or grade, seriousness criteria, action, outcome, relatedness, concomitant medications at onset,
  history, and death day and cause. Every fact carries its `DATASET[row].VAR` source. A missing value is listed for QC and
  never filled in. Dates are ISO; an ADaM numeric date is SAS days since 1960-01-01, and a partial date is not used.
- `narrative-reconciliation.ts` is the fact gate. Every ISO date and "study day N" must be recorded for the subject. In a
  sentence that names an event, every date and day must be that event's own, so an onset that differs from ADAE ASTDT or
  ASTDY is refused even when the wrong value is another fact. The gate also requires every event to be named with its
  recorded onset, the age to equal ADSL AGE, each grade and severity to be the recorded one, and a death to appear only
  where one is recorded.
- `narrative-compose.ts` writes one paragraph per qualifying event through `composeSafetyNarrative`, then the treatment
  course and any death. Study days are used, as E3 asks. A subject that ADSL records as dead or withdrawn for an AE, with
  no qualifying ADAE event, is **refused by name** rather than narrated around. `NarrativeProseWriter` is the only way a
  model can touch the text. Its output passes the same gate; a rewrite that moves a fact is discarded, the template is
  kept, and the refusal is recorded. **No writer is passed in production**: PQ-DRAFT-001 has not passed (ADR-0015 §3), so
  every narrative is fact-only template prose, and users get it today.
- `narrative-section.ts` writes §14.3.3 (a basis statement with the engine's counts, then one narrative per subject,
  headed with subject, arm, events and categories) and the §12.3.2 cross-reference. With no qualifying subject, both say so.
- `csr-narrative-job.ts` composes one subject at a time and saves each with its SHA-256 and facts digest. A resumed run
  skips only subjects whose saved row verifies and whose facts match. A damaged row fails the run and is preserved, never
  overwritten. Sections are written only when every selected subject has a verified composed narrative, so a refused
  subject leaves the build `incomplete` and is listed. A cancelled build stops the run.
- `csr-narrative-store.ts` holds the SQL store, the build entry point and the QC read. The store is the only writer of
  `csr_narrative_outputs`. §14.3.3 is always replaced. §12.3.2 is written only when it is absent or this job wrote it
  (`lineage.composer`), so a drafted §12.3.2 is kept. The build reads the bound run's verified receipt
  (`readSavedClinicalTables`), then the approved ADaM bundle as the signed-in user (`readCsrAdamDatasets`).

Extended (smallest additive edits):
- `shared/csr-adam-bundle.ts` adds the optional ADMH dataset and the optional `adverseEventsOfSpecialInterest`
  declaration. `adam-rows.ts` adds `ADMH?` to `AdamDatasets`.
- `adam-bundle-load.ts` adds `loadAdamBundleDatasets`, which `loadAdamBundleEnvelope` now uses, so the behaviour is
  unchanged.
- `vault-source-input.ts` adds `readCsrAdamDatasets`, which makes the same exact-version, digest and lifecycle-approval
  checks as a package run, in one transaction. A hand-built csr-source.v1 file is refused (`CSR_NARRATIVE_ADAM_REQUIRED`):
  it holds no subject-level dates.
- `server/routes/csr-jobs.ts` adds `POST /api/csr/jobs/:jobId/narratives` (write access, as the user) and
  `GET /api/csr/jobs/:jobId/narratives` (the QC list without text).
- `CsrBuildProgress.tsx` adds `CsrNarrativeBuild`, rendered on the existing `CsrWorkflow` board under the section review.
  It holds "Build narratives", the outcome or refusal as the server stated it, and per subject: events, categories,
  composed or not, prose source, fields not recorded, model-prose refusals, and whether §14.3.3 still awaits review.
- RULE 1: `migrations/20260628_csr_job_state.sql` is **amended in place** with a dated header note. It adds table 3,
  `csr_narrative_outputs`, with `CREATE TABLE IF NOT EXISTS` and its constraints inside the CREATE. The table is public,
  with `organization_id INTEGER NOT NULL`, so the final sweep polices it. Nothing is dropped.
  `ci:migration-drop-safety`, `ci:migration-set-order`, `ci:column-reachability`, `ci:migration-deploy-path`,
  `ci:sql-interpolation` and `ci:drizzle-tenant-scope` are OK.

## Red first

Each check was shown failing on the case it exists to catch, then restored. Files are in this folder.
- `red-selection-misses-sae.txt`: the selection narrowed to treatment-emergent SAEs. "never misses an SAE subject" fails
  on SYN-NARR-0014, a pre-treatment SAE, and the exact-set test fails (36 of 40).
- `red-onset-mismatch-accepted.txt`: the gate without per-event binding. Moving the Septic shock onset to day 21 (the
  recorded *death* day) passes, and a wrong ASTDT is only "unsourced".
- `red-no-fact-gate.txt`: no gate. A model rewrite that moves the onset to study day 18 is accepted.
- `red-narrative-table-absent.txt`: the store against the migration at HEAD fails with
  `relation "csr_narrative_outputs" does not exist` (42P01).
- `red-board-without-build-narratives.txt`: the board without the panel. "Build narratives" is not reachable.

## Green and scale

`green.txt` lists the runs. Timings come from the test output (SYNTHETIC data):
- In memory: 1,000 subjects give **200 narratives** (10 deaths, 110 SAE, 60 AE withdrawals, 40 AESI) in about 50 ms. Each
  narrative was then **independently re-reconciled against its rows**: 3,660 facts, all ok.
- At the design scale target: 5,000 subjects give **1,000 narratives** in about 0.5 s, and §14.3.3 is about 670k characters.
- Through the database (PGlite, real migration): 1,000 subjects give 200 narratives, persisted one at a time, in about
  0.4 s. A resume skips all 200 in about 0.1 s.
- `sample-output-synthetic.txt` shows §12.3.2, the start of §14.3.3 and QC rows from a 30-subject synthetic run.

Memory: one subject's facts and text are in flight at a time, and each narrative is saved as it is composed. The datasets
themselves are held as slice 6's reader loads them, up to 64 MiB per file. Streaming the file reader itself is not done
here.

## Open

- No narrative has been composed from real or CDISC-pilot ADaM. The pilot set needs network access the sandbox refuses
  (as in slice 6), so the end-to-end proof is synthetic.
- A prose model is wired only as a gated seam. Production passes none until PQ-DRAFT-001 passes (founder decision).
- The build runs in the request. At 1,000 narratives it takes under a second of compute plus the Vault reads. A background
  queue is needed once a model writes prose.
- The gate cannot see an invented clinical detail that has no date, day, number or event term. That is why the model is
  limited to connective prose and the template is the fallback. Dose amount (ADEX dose parameters), laboratory findings,
  dechallenge and rechallenge, and the sponsor's causality are not yet read. History lists every ADMH term, and its
  relevance is not assessed.
- §16.2.7 (AE listings) is not written by this slice.
- RULE 2 candidate for slice 9: `safety-narrative-service.generateSAENarrative` (`POST /api/safety-narratives/sae`) asks a
  model for an SAE narrative. Its grounding guard checks numbers only.
- The two `server/services/csr` failures in `green.txt` (placeholder-gate, organization-wide builds) were already red at
  HEAD (slice 3's commit names them). They are not touched here.

## Adversarial review, 2026-10-29

Gaps found in the fact gate, each shown red first (`red-review-model-number-severity.txt`), then closed (`green-review.txt`):

- A model rewrite could change a figure the gate had no pattern for. Changing the exposure "for 19 days" to "for 28 days" was accepted. The fix is `reconcileRewrite` in `narrative-reconciliation.ts`, which `narrative-compose.ts` now applies to model prose: a rewrite may state no number the fact-only template does not state (`NARRATIVE_NUMBER_UNSOURCED`).
- A day written without "study" ("Day 18") or a date not in ISO 8601 form ("January 30, 2026") was invisible to the gate. Days now match with or without "study". A non-ISO date is refused as `NARRATIVE_DATE_UNSOURCED`.
- A severity stated for an event whose ASEV/AESEV is blank was accepted. Now any severity that the named event does not record is refused.
- A death subject whose ADSL has no DTHDT/DTHADY or no DTHCAUS column did not list those values for QC. They are now on the missing list.
- The job's header said only one subject's text is ever in flight. That was not true: resume and landing read every saved row, and §14.3.3 is a single text. The comment now says so.

Full `npx tsc --noEmit -p .` passes with a 12 GB heap (exit 0, no errors).
