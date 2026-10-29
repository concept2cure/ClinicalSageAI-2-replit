# D2 — CSR: the patient safety narrative build, off the request path

Launch row D2 (Authoring / Submission Center), workstream W1. Design: `docs/design/CSR_END_TO_END_2026-10-29.md`
(slice 7, decision 5: 1,000 narratives per build). Board row: "AnA builds a CSR end to end" in
`docs/work-orders/README.md`. Its "Next" names this item: "the narrative build off the request path". Slice 7's evidence
(`../2026-10-29-slice7-narratives/README.md`, "Open") recorded that the build ran in the request.

Boundary: the D5 CSR-path lane keeps release, review, approval, signing and transmission,
`shared/authoring/csr-scientific-review.ts`, and the AnA tools `draft_safety_narrative`, `narrate_statistical_result` and
`record_endpoint_result`. None of them was touched.

All data here is **SYNTHETIC** (`server/services/csr/__tests__/support/adam-narrative-synthetic.ts`). No value is
Lumen's, LMN-201's, a patient's or a reported result.

## What already exists

Searches run, across `server/`, `shared/`, `client/src/` and `migrations/`: `launchCSRBuildAsync`, `enqueueCSRBuildJob`,
`runCSRBuildJob`, `setImmediate`, `pg-boss`, `bull`, `job queue`, `withTenantConnection`, `csr_assembly_runs`,
`csr_narrative_outputs`, `buildCsrNarratives`, `runNarrativeJob`, `narrativesSection`, `CsrNarrativeBuild`, `stalled`,
`heartbeat`, `recoverStale`, `requeue`. Deleted history: `git log --all --diff-filter=D` on `*narrative*run*` and
`*narrative*queue*` found nothing.

| Piece (path) | What it does today | What it did not do (before this change) |
|---|---|---|
| CSR build queue: `server/services/csr/csr-job-runner.ts` `enqueueCSRBuildJob` / `runCSRBuildJob`, started by `server/services/csr-builder.ts` `launchCSRBuildAsync` | A durable `csr_build_jobs` row, a worker started with `setImmediate`, a claim by conditional `UPDATE … WHERE status = …`, progress on the row, the outcome or refusal recorded there. | There is no other queue in the repo (`scheduled-jobs.ts` is cron, `action-queue.ts` is AnA actions). No restart recovery: a stopped build stays `drafting`. **Followed, not duplicated** (below). Its row cannot carry the narrative build: its status machine (queued → drafting → complete) and `progress` describe drafting and are what the board already shows. |
| Assembly queue: `server/services/csr/csr-assembly-run.ts` (2026-10-30, uncommitted work of the assembly item) | The same pattern on its own row (`csr_assembly_runs`), run under `withTenantConnection` as the requester, with a 15-minute stall rule. | No resume: a stalled assembly is assembled again. **Pattern followed**, file not edited. |
| Narrative job: `server/services/csr/csr-narrative-job.ts` `runNarrativeJob` (slice 7) | Composes one subject at a time, saves each with SHA-256 and facts digest, resumes per subject, preserves a damaged row, lands §14.3.3 and §12.3.2 only when every subject verifies. | No progress report. Resume and landing read **every saved row with its text**. §14.3.3 was built as **one string of every narrative** (673,113 characters at 1,000 narratives). **Extended.** |
| Narrative store: `server/services/csr/csr-narrative-store.ts` `sqlNarrativeStore`, `buildCsrNarratives`, `readCsrNarrativeQc` | The only writer of `csr_narrative_outputs` and of the narrative rows of `csr_section_outputs`; the build entry as the requesting user. | Wrote §14.3.3 in one statement. **Extended.** |
| Section text: `server/services/csr/narrative-section.ts` `narrativesSection` | §14.3.3 and the §12.3.2 cross-reference. | Only as a whole. **Extended** with `narrativesSectionHead` and `narrativeSectionBlock`; `narrativesSection` is now their concatenation, so the text is the same. |
| Routes: `server/routes/csr-jobs.ts` `POST/GET /api/csr/jobs/:jobId/narratives` (slice 7) | POST composed in the request and returned the result; GET returned the QC list. | **Moved** into `server/routes/csr-jobs-narratives.ts` (mounted on the jobs router, as `csr-jobs-assembly.ts` is). The slice-7 handlers were deleted from `csr-jobs.ts` in the same change (zero duplication). |
| Board panel: `client/src/concept2cure/v2/surfaces/CsrBuildProgress.tsx` `CsrNarrativeBuild` (slice 7), on `CsrWorkflow` in `BiopharmaProject.tsx` | "Build narratives" awaited the POST and showed its result; the QC list. | No progress, no status. **Extended in place.** No new surface. |
| Job tables: `migrations/20260628_csr_job_state.sql` (on `C2C_MIGRATION_FILES`; amended in place by slices 3 and 7 and by the assembly item) | Tables 1–4. | **Amended in place** (RULE 1) with Table 5, `csr_narrative_runs`, and a dated header note. |

## What changed

- **The queue.** `server/services/csr/csr-narrative-run.ts` (new) puts the narrative build on the CSR build's queue
  pattern: a durable row in `csr_narrative_runs`, a worker started with `setImmediate` (`startNarrativeRun`, as
  `launchCSRBuildAsync` starts a build), a claim by conditional `UPDATE` that increments `attempt`, and the outcome or
  refusal recorded on the row by code. The worker runs under the organization's tenant scope (`withTenantConnection`) on
  one dedicated connection, **as the user who asked**: `buildCsrNarratives` re-reads the bound run and the approved ADaM
  bundle with that user's access, as the request did.
  - **Progress:** subjects done (composed, refused or resumed) of those selected, written after every subject. Each write is
    the heartbeat and the check that this attempt still holds the run and the build is not cancelled. A refused write stops
    the job (`onProgress` returns false).
  - **Restart:** a worker that stopped (a restart, a lost connection) cannot record its end. A queued or running run with no
    heartbeat for 5 minutes (`NARRATIVE_STALL_MINUTES`) reads as `stalled`, and the next request **takes over the same
    run**: it is queued again, claimed under a new attempt, and the job resumes per subject, so verified narratives are not
    composed again. A superseded attempt's progress and outcome writes are refused. Before the stall time a second request
    is refused (`CSR_NARRATIVE_BUILD_IN_PROGRESS`, with the run id): the run may still be alive.
  - **Cancellation:** cancelling the build (`POST /api/csr/jobs/:jobId/cancel`, unchanged) stops the run at the next
    subject (the store refuses the save, and the progress write refuses too). The run is recorded `cancelled`, keeps what
    was composed, and lands nothing. A cancelled build is refused at the next request.
  - **Outcome:** `complete` and `incomplete` (refused subjects named) carry the job result; `failed` carries a code and the
    message (`CSR_NARRATIVE_INTEGRITY_FAILED` with the subjects; the source readers' typed refusals by their own code
    with their row issues, including the program access check's `PROJECT_*` codes and the Vault byte reader's codes;
    anything else `CSR_NARRATIVE_FAILED`, logged, with no detail invented).
- **The routes** (`server/routes/csr-jobs-narratives.ts`): `POST /api/csr/jobs/:jobId/narratives` returns **202**
  `{ runId, status: 'queued', resumed }`. A cancelled build and one with no bound run are still refused at once
  (`CSR_NARRATIVE_BUILD_NOT_RUNNABLE`, `CSR_NARRATIVE_RUN_REQUIRED`). `GET …/narratives/status` returns the newest run;
  `GET …/narratives` returns the QC list as before. Write access is checked for the POST, read access for the GETs, as the
  signed-in user. The ectd-compile surface's existing claim on `/api/csr/jobs` covers the new path
  (`npm run ci:launch-scope-api`: 542 paths, none refused).
- **Memory.** The job no longer holds every narrative's text. `NarrativeStore.heads()` returns each saved row's facts
  digest, sequence and an integrity verdict **computed in the database** (`content_hash =
  encode(sha256(convert_to(content,'UTF8')),'hex')`), without the text. Landing reads the text 50 narratives at a time
  (`page`, keyset on sequence and subject), re-verifies each row's hash in Node as it is read, and streams §14.3.3 as its
  opening and one block per subject. The SQL store appends each page to the `csr_section_outputs` row **inside one
  transaction**, and sets `content_hash` only where the database's SHA-256 of the stored text equals the digest streamed in
  Node (`CSR_NARRATIVE_SECTION_DIGEST` otherwise, and the transaction rolls back). A row that fails its check while it is
  streamed rolls the landing back, and the run fails naming it. Readers outside the transaction see the old section or the
  new one, never a part. Per subject the job still holds the metadata (id, digest, status: about 100 bytes) and the
  selection itself.
- **The panel** (`CsrNarrativeBuild`): "Build narratives" queues and polls `…/status` every 2 s while the run is queued
  or running. It shows "Queued", "Reading the run's ADaM data", "Composing narratives: 37 of 80 subjects" with a progress
  bar, then the outcome (`incomplete` names the subjects not composed), the recorded refusal with its code's message and
  row issues, "cancelled", or "stopped making progress at … Build narratives resumes it". The button is disabled while
  the run is active. An unreadable status is an alert in the server's words, never an empty panel. The QC list reloads
  and the board refreshes (`onChanged`) when the run settles.
- **RULE 1:** `migrations/20260628_csr_job_state.sql` gains Table 5 by in-place amendment with a dated header note:
  `CREATE TABLE IF NOT EXISTS csr_narrative_runs` with its CHECKs inside the CREATE, two `CREATE INDEX IF NOT EXISTS`
  (one a partial unique index: one queued or running run per build). Public, `organization_id INTEGER NOT NULL`, before
  the file's `COMMIT`. Nothing is dropped. Replayed twice in the PGlite tests. `ci:migration-drop-safety`,
  `ci:migration-set-order`, `ci:migration-deploy-path`, `ci:column-reachability` and `ci:drizzle-tenant-scope` are OK.
  `ci:sql-interpolation` reports nothing in these files (the stall interval is a bind parameter). It does report
  `csr-assembly-run.ts` and `csr-assembly-supply.ts`, which belong to the assembly item and were not edited here.

## Red first

Each check was shown failing on the case it exists to catch, then restored. The files are in this folder.

| Red | What fails | Green |
|---|---|---|
| `red-section-one-string.txt`: the memory test against HEAD | One statement sends 673,289 characters (the whole §14.3.3) and resume reads 772,214 characters of text, against a bound of a tenth of the section | The largest statement sends 33,934 characters, and the largest read is 29,358 characters. §14.3.3 is byte-identical to `narrativesSection` and its stored hash is its SHA-256 |
| `red-request-blocks.txt`: the new route test with the slice-7 handler body put back in the POST | The POST does not answer while the source read is held, and the test times out at 10 s. A source refusal cannot be recorded on a run | 202 with a run id at once. While the run is held, the status reads `queued` or `running`, and a second POST is 409 `CSR_NARRATIVE_BUILD_IN_PROGRESS` with the run id. After release, the status is `complete` with subjects done equal to the total |
| `red-stalled-run-not-taken-over.txt`: enqueue without the takeover | After a worker dies and the run is stale, the next request is refused as in progress, for ever | The same run is queued again, claimed as attempt 2, and completes |
| `red-resume-recomposes.txt`: the job without its per-subject resume | After the takeover, the run result shows 0 resumed, and all 80 subjects are composed again | 30 resumed, and exactly the 50 subjects not saved before the crash are composed. The 30 saved rows are not written again (their `updated_at` is unchanged) |
| `red-panel-no-progress.txt`: the new panel test against the HEAD panel | No "Composing narratives: 37 of 80 subjects", no recorded refusal, no stalled message, no alert on an unreadable status | All shown |

### Adversarial review (2026-10-30)

Two defects were found in review, each shown failing first and then fixed in the item's own files:

| Red | What failed | Fix |
|---|---|---|
| `red-review-refusal-code-lost.txt`: a typed source refusal without the `CSR_` prefix (`PROJECT_PERMISSION_DENIED` from the program access check) | The run recorded the generic `CSR_NARRATIVE_FAILED` "The narrative build failed", losing the code and message the slice-7 route returned | `failureOf` (`csr-narrative-run.ts`) keeps the code of any `CsrSourceInputError`, `CsrNarrativeBuildError` or `CsrNarrativeRunError` |
| `red-review-fast-build-not-settled.txt`: a build that finished before the panel's first status read | The outcome showed, but the QC list never reloaded and `onChanged` never ran: the panel only settled after it had itself seen the run active | The panel watches a run it just queued (`useNarrativeRun().watch`), so it settles on the outcome however fast it arrives |

Known, not changed: the progress write refuses a superseded attempt, but the narrative save and the §14.3.3 landing are
not attempt-guarded. A worker taken over while still alive (no heartbeat for 5 minutes, for example a slow source read)
may save a row or land the section once more before its next progress write stops it. With template prose the text is
deterministic, so the rows and the section are identical, and the landing's digest check still holds.

## Green and scale

`green.txt`: 9 files, 45 tests. That covers the new suites (`csr-narrative-run.pglite`, `csr-narrative-memory.pglite`),
the updated suites (`csr-narrative-job`, `csr-jobs-narratives.pglite`, `csrNarrativeBuild`), and the unchanged slice-7
suites (`csr-narrative-store.pglite`, `narrative-reconciliation`, `narrative-subject-selection`,
`vault-adam-narrative-datasets`). Neighbours run green, 15 files and 85 tests: every suite that loads
`20260628_csr_job_state.sql` or mounts the jobs router (`csr-section-review`, `csr-assembly-run`,
`csr-worker-private-access`, `csr-jobs-build-and-review`, `authoringWorkflowImport`, `csr-jobs-assembly`), the board
(`csrBuildProgress`, `csrWorkflowProgramScope`), and the CSR route and scope suites (`csr-build-scope-refusal`,
`csr-workflow-program-scope`, `csr-draft-source-honesty`, `csr-builder-retired-endpoints`, `csr-workflow-headings`,
`csr-retired-modules-have-no-importer`, `csr-project-scope`).

At the design scale target (SYNTHETIC: 5,000 subjects, 1,000 narratives), through the real migration in PGlite, the
build completes in about 2–3 s including landing. §14.3.3 is 673,113 characters, and no statement carries more than about
34,000 characters of it. In memory, the largest chunk the store receives is under a tenth of the section.

ESLint: no warning on any new or changed file. Line counts: `csr-narrative-run.ts` 199, `csr-narrative-job.ts` 197,
`csr-narrative-store.ts` 180, `csr-jobs-narratives.ts` 90, `CsrBuildProgress.tsx` 278, `csr-jobs.ts` 478 (from 533).
`tsc.txt`: `NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .`.

## Remaining

1. A stalled run is resumed when someone asks again: the board says it stopped and that "Build narratives" resumes it.
   Nothing re-dispatches it on server start, because the repo has no boot-recovery hook for any CSR queue (the build and
   the assembly have none either). A boot sweep over the three queues is the natural next step. It touches server
   start-up, a shared file, so it was not added here.
2. The worker holds one tenant connection for the whole build. At 1,000 template narratives that is seconds. Once a prose
   model writes (after PQ-DRAFT-001), it will be minutes, and the connection should be taken per page.
3. Downstream readers of §14.3.3 (section review, Authoring import, assembly) still read it as one text. That is their
   own memory profile and is unchanged here.
4. The ADaM datasets themselves are held as slice 6's reader loads them (up to 64 MiB per file), as slice 7 recorded.
5. The board row in `docs/work-orders/README.md` is left to the root session, which commits.
