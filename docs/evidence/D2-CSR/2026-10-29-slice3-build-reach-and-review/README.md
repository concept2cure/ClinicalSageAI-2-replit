# D2 CSR, slice 3: start a CSR build from the retained run, and review it section by section

Design: `docs/design/CSR_END_TO_END_2026-10-29.md`, slice 3. Lane: "AnA builds a CSR end to end" (`docs/work-orders/README.md`). This slice does not touch release, Authoring review, approval, signing, transmission or the Rule-2 narration tools, which belong to the D5 lane.

## What already exists

- `migrations/20260628_csr_job_state.sql` creates `csr_build_jobs` and `csr_section_outputs`. It was on no applier (`scripts/ci/migration-deploy-path-baseline.json`). It used a plain `CREATE TABLE`, so a second run failed with 42P07.
- `server/routes/csr-jobs.ts` serves `POST /api/csr/jobs`, which is auth-gated, and passes `evidenceSource` through to the runner (slice 2). Before this slice it had no client caller.
- `server/services/csr/csr-job-runner.ts` writes `evidenceSource` into `study_info_snapshot` and re-reads each results section's evidence pack. It records no review state.
- `server/routes/csr-workflow-routes.ts` and `CsrWorkflow` in `client/src/concept2cure/v2/surfaces/BiopharmaProject.tsx` are the board, which sits in NAV_HIDDEN. They showed only the 16 top-level headings, as draft or idle. A row click already opened `SourceImportDialog`, which leads into `workflow-source-import.ts`.
- `client/src/concept2cure/v2/surfaces/CsrSourceInputControls.tsx` (FrozenClinicalTables) is the CSR card. It already reads the run's retained tables through `GET /runs/:runId/clinical-tables`.
- `server/services/csr/cortex-authoring-reader.ts` `loadCsrAuthoringEvidence` is the canonical receipt-verified reader. It is reused here to check the run at enqueue.

## What changed (extended, not rebuilt)

- **Migration, amended in place with a dated note (Rule 1).** Every CREATE is now IF NOT EXISTS and the constraints are named and added only when absent. `csr_build_jobs.source_run_id` is a STORED generated column over `study_info_snapshot->'evidenceSource'->>'runId'`, so it cannot disagree with the snapshot. `csr_section_outputs` gains `review_status` (draft, in_review or approved, guarded by a CHECK), `reviewer_id`, `review_decided_at`, `review_reason` and `reviewed_content_hash`. The file now sits on `C2C_MIGRATION_FILES` just before `UUID_TENANT_ISOLATION_NONPUBLIC`, and its baseline entry is removed.
- **`server/services/csr/csr-section-review.ts`** is new and is the only writer of the review columns. It allows submit, approve and send back (with a reason). Each decision binds the exact text through `expectedContentHash`, which must still match the stored SHA-256. The build's requester may not approve. The write is optimistic, and an approval of text that has since been redrafted reads as a draft.
- **`server/routes/csr-jobs.ts`**
  - `POST /` reads the bound run through `loadCsrAuthoringEvidence`, as the user, for the protocol being built, before any job exists. A refusal carries its code and the words "No job was created."
  - `POST /:jobId/sections/:sectionNumber/review` records the reviewer from the auth principal and requires write access to the job's project.
  - `GET /:jobId/sections` now carries each section's effective review state.
- **`server/routes/csr-workflow-routes.ts`** adds `headings`: every heading of the canonical ICH E3 tree, at every depth, with `not_drafted` or its review state. It also adds `meta.sourceRunId`.
- **Client**
  - `CsrBuildProgress.tsx` adds two pieces. `CsrBuildDraftControl` sits on the card and appears only when the saved run holds retained tables; it offers "Open build progress", which goes to `csr-workflow`. `CsrHeadingReview` sits on the board. It shows the review state, and its "Import approved sections into Authoring" hands the approved numbers to the existing `SourceImportDialog`, and from there to `workflow-source-import`. The release gates are unchanged.
  - The board re-reads after each decision.

## Red, then green

| Check | Red (before) | Green (after) |
|---|---|---|
| `ci:migration-set-order`, with the file appended after `TENANT_ISOLATION_SWEEP` | exit 1 | exit 0 at the correct position |
| `ci:migration-deploy-path`, with the file on the set and still baselined | exit 1 ("now on a deploy path … shrink the baseline") | exit 0 |
| `ci:migration-drop-safety`, with a probe file appending `DROP COLUMN review_reason` | exit 1 (REPEATED) | exit 0 |
| `csr-section-review.pglite.test.ts` (6) against the HEAD migration | beforeAll 42P07 on replay, so all 6 tests skipped | 6/6 |
| `csr-jobs-build-and-review.pglite.test.ts` (4) against the HEAD route | 0/4 | 4/4 |
| `csr-workflow-headings.test.ts` (2) against the HEAD board | 0/2 | 2/2 |
| `csrBuildProgress.test.tsx` card cases against the HEAD card | 2 failed (no control) | 6/6 |

`ci:migration-drop-safety` passes either way on the after-sweep ordering, because the file drops nothing. The ordering is caught by `ci:migration-set-order`. A probe that appended `DROP COLUMN token_cost`, a column created inline in `CREATE TABLE`, also passed drop-safety. That is a gap in the gate and is reported, not fixed here.

Hand-made test DDL for these tables in four existing pglite tests gained the new columns, because Drizzle now selects and inserts them. Two of those suites were already red at HEAD and still are: `csr-job-runner.placeholder-gate` "retains the existing placeholder refusal…" (handed on by D5) and `csr-project-scope` "keeps genuine organization-wide builds…".

## Adversarial review (2026-10-29)

- Found: `POST /api/csr/jobs` queued a build whose `programId` named one program while its `evidenceSource.programId` named another; only the protocol number was compared. A run retained in one program could ground a CSR for another. Red: the new case "refuses a run retained under another program than the build, before reading it" in `server/routes/__tests__/csr-jobs-build-and-review.pglite.test.ts` got 202. Fixed by `evidenceProgramRefusal` in `server/routes/csr-jobs.ts` (409 `CSR_EVIDENCE_PROGRAM_MISMATCH`, before the run is read); green 5/5.
- Open, not fixed here: the spec makes a section approval the existing csr-scientific-review attestation chained into the audit log. This slice records a parallel, unaudited, latest-decision-only state on the row, and the board's per-row import still imports unapproved sections. It is a pre-import marker, not a governed approval.

## Not yet done

- No recorded click path from EctdCompile to an approved §11.4 section for the PUNCH CD3 transcription. Production drafting stays closed until PQ-DRAFT-001 passes.
- The readiness card (`CsrNarrativeReadiness.tsx`) and the orchestrator 409 for source-bound runs are unchanged.
- The CSR card still says "AI narrative generation remains unavailable", which refers to the package run's narrative step.
- Review keeps only the latest decision on the row. There is no per-decision history table, and no audit-chain event at the section level. The governed approval is still the Authoring document's attestation and signature.
