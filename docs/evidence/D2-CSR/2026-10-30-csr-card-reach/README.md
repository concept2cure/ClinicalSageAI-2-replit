# D2 / W1 — a CSR built in production is reached end to end from Submission Center's CSR card (2026-10-30)

**Row moved:** D2 (launch surfaces reach their capability in production). **Workstream:** W1.
**Product decision (CPO):** reach the build from the launch card. Do not admit the csr-workflow board.

## The defect

The D5 lane reported this on 2026-10-30 (`docs/work-orders/README.md`, CSR end-to-end row):
`CsrNarrativeBuild` and `CsrAssemblyControl` were mounted only on the CSR workflow board
(`BiopharmaProject.tsx:570-571`), and production refuses `/api/csr-workflow/board`
(`out-of-scope`, see `verdicts.txt`). So a CSR built in production could not get narratives,
be assembled or be placed from any screen. `CsrBuildProgress`'s "Open build progress" button also
navigated to `csr-workflow`, a surface that is locked at launch.

There was a second gap. The card knew only a build it had started on the current page load. No
launch-scoped read listed a run's builds: the board's "latest job" query was the only one, and
it is out of scope. After a reload, a production build could not be reached at all.

## What already exists

The searches: `CsrBuildDraftControl`, `CsrNarrativeBuild`, `CsrAssemblyControl`, `CsrBuildProgress`,
`CsrPlacementLifecycle`, `csr-workflow/board`, `router.get(` in `server/routes/csr-jobs*.ts`,
`/api/csr` in `shared/constants/ui-surface-registry.ts`, `launchCSRBuild`, and
`check-launch-scope-api.ts --list`.

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| CSR card | `client/src/concept2cure/v2/surfaces/CsrSourceInputControls.tsx` (Submission Center / eCTD Compile) | Frozen clinical tables of a saved run, `CsrBuildDraftControl`, `StudyPivotalDeclarations` | Had no narrative, assembly or placement control |
| Build start | `CsrBuildDraftControl` in `CsrBuildProgress.tsx` | `POST /api/csr/jobs` bound to the run | On success, offered only a navigation to the locked board |
| Narratives | `CsrNarrativeBuild` in `CsrBuildProgress.tsx` | Queues and polls the narrative build, shows the QC list | Mounted on the board only. Took `headings` from the board |
| Assembly and placement | `CsrAssemblyControl.tsx` + `CsrPlacementLifecycle.tsx` | Assembles, supplies or declares appendices, places, withdraws a partial placement | Mounted on the board only |
| Section review | `CsrHeadingReview` in `CsrBuildProgress.tsx` | Review decisions over the full ICH E3 heading tree | Board only. **Not moved** (see Open) |
| Jobs API | `server/routes/csr-jobs.ts`, `csr-jobs-narratives.ts`, `csr-jobs-assembly.ts` | Every `/:jobId/...` read and write the controls call. `GET /:jobId/sections` carries each section's review state | Had no `GET /` that lists builds by run |
| Launch scope | `ui-surface-registry.ts` ectd-compile `apiPrefixes: '/api/csr/jobs'` | Already admits every `/api/csr/jobs...` path at launch | — |
| Board | `server/routes/csr-workflow-routes.ts` `GET /board` | Latest job for the org or project | Out of scope in production. Left as it was |

## What changed

The work completes the card's reach. Nothing was rebuilt.

- **`client/src/concept2cure/v2/surfaces/CsrRunBuilds.tsx`** (new, 115 lines) mounts the
  existing `CsrNarrativeBuild` and `CsrAssemblyControl` (with its placement and lifecycle
  actions) on the card, for the build selected from the run's builds. §14.3.3's review state is
  mapped from `GET /api/csr/jobs/:jobId/sections`, not the board. A read that fails is shown as an
  alert. An empty list says "No CSR build has been started from this run." While any build of the
  run has not ended (`queued` through `cross_linking`), the list is re-read every `BUILD_POLL_MS`
  (5 s) through the same in-scope `GET /api/csr/jobs?programId&runId`, and the selected build's
  sections are re-read when its `updatedAt` moves. The re-reads stop once every build is
  `complete`, `failed` or `cancelled` (review fix, see below).
- **`CsrSourceInputControls.tsx`**: `FrozenClinicalTables` renders `CsrRunBuilds` under the build
  control, and focuses a newly queued build.
- **`CsrBuildProgress.tsx`**: the dead "Open build progress" navigation to `csr-workflow` is
  removed. `CsrBuildDraftControl` takes `onQueued` in place of `onNav`. The queued line now says
  where the build is on the card.
- **`server/routes/csr-jobs.ts`** adds `GET /api/csr/jobs?programId&runId`. It returns the builds
  bound to that run (`study_info_snapshot -> 'evidenceSource' ->> 'runId'`), newest first, at most
  25. It is scoped to the organization and to the program's project through `resolveCsrScope`
  (read access). A missing or malformed `runId` is refused with `CSR_RUN_REQUIRED`, and a missing
  `programId` with `CSR_PROJECT_REQUIRED`.
- **Launch scope**: no registry change. Every path is already `launch` under ectd-compile's
  `/api/csr/jobs` (`verdicts.txt`). `ci:launch-scope-api` passes. Its `--list` now attributes
  `/api/csr/jobs/:p/assembly` and `.../supply-candidates` to ectd-compile; before this change no
  launch screen named them. The board remains `out-of-scope`.

## Red, then green

- `red.txt`: 5 failures, before any implementation.
  - 2 server cases: `GET /api/csr/jobs?...` answers 404, and gives no `CSR_RUN_REQUIRED`.
  - 3 client cases in `csrCardReach.test.tsx`: the card has no "CSR builds from this run" region,
    no narrative or assembly control, and no stated empty state.
- `green.txt`: 10 files, 72 tests pass (71 in the first pass, plus the polling case). This covers the new card test, the jobs, assembly and
  narratives route tests, `csrBuildProgress` (whose board-link case now asserts there is **no**
  navigation to `csr-workflow`), `csrAssemblyControl`, `csrNarrativeBuild`,
  `csrSourceInputControls`, `tests/unit/csr-jobs-routes.test.ts` and `csr-pivotal-launch-scope`.
- `launch-scope-api.txt`: the gate, plus its selftest showing that it fails on a refused path.
  `verdicts.txt`: the verdict for each path the card calls.
- `tsc-scoped.txt`: the full `tsc -p .` could not run here. It used more than 10 GB of heap and
  was OOM-killed at 12 GB, in a 15 GB container shared with another agent. The scoped run (the root
  config, with only the changed files and their imports) shows no error in any changed file. Its 19
  errors are all ambient declarations that the full include provides: CSS modules,
  `import.meta.env`, and the Express `Request` augmentation. **The full typecheck was owed by
  the lead session.** It has since run clean in this lane (`tsc-full.txt`, see Review fixes).
- ESLint is clean on every changed file.

## Review fixes (2026-10-30, second pass)

A reviewer found three points in the first pass. Each fix was shown red, then green.

1. **The "newest first" order was never checked.** The list test had one matching row, so
   flipping or removing `orderBy(desc(updatedAt), desc(id))` in `csr-jobs.ts` still passed. The
   card relies on that order: with nothing focused, it selects `builds[0]`. The fixture now has
   job 4 (same organization, project and run, `updated_at = now() + 1 day`), and the test asserts
   `[4, 1]`. `order-red.txt`: fails with the order flipped to `asc` and fails with it removed.
   `order-green.txt`: 7 of 7 pass with the code as written.
2. **The build line was read once.** A build focused as `queued · 0%` stayed that way until the
   user chose "Reload builds". `CsrRunBuilds` now polls while a build is running (above). New case
   in `csrCardReach.test.tsx`: a `drafting · 40%` build reads `complete · 100%` after one poll
   interval, and the list is not read again over three more intervals. `poll-red.txt`: fails with
   the poll disabled (the first-pass behaviour) and fails with the poll made unconditional (2 reads
   expected, 5 received). `poll-green.txt`: 4 of 4 pass.
3. **`tests/unit/csr-jobs-routes.test.ts` is modified in the working tree, and this lane did not
   modify it.** The change updates the `GET /:jobId/sections` expectation to carry the `review`
   field added by 7b209818ac (CSR slice 3). This lane's `csr-jobs.ts` diff does not touch that
   route. Run against the current route, the file's HEAD version fails 1 of 9
   (`returns the section array`: the response carries `review`, the old expectation does not). So the green below includes that file passing only because of
   another session's edit. The lead should commit that edit with the session that made it.

`green.txt` was re-run after these fixes: 10 files, 72 tests pass. The full
`NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .` then completed with exit 0 and no
errors (`tsc-full.txt`), so the typecheck the first pass owed is now done. ESLint is clean on
`CsrRunBuilds.tsx`, `csrCardReach.test.tsx` and `csr-jobs-build-and-review.pglite.test.ts`.

## Open

1. **`launchCSRBuild` (`server/services/csr-builder.ts:305`) is not deleted.** It has no
   production caller; `launchCSRBuildAsync` via `POST /api/csr/jobs` is the canonical path.
   But it has two test callers, not one: `csr-builder-completeness.test.ts` (8 call sites) and
   `csr/__tests__/csr-builder-scope-quota.test.ts` (2). Also, `computeBuildCompleteness`, the
   job-level fail-closed status those tests pin, is used **only** by `launchCSRBuild`. The async
   runner (`csr-job-runner.ts`) decides completeness its own way. Deleting the function means
   moving those assertions onto the runner's gate (`csr-job-runner.placeholder-gate.test.ts`) and
   deleting `computeBuildCompleteness` with it. That is a CSR-lane change and is not safe as a
   drive-by.
2. **Section review (`CsrHeadingReview`) is still board-only.** It needs the full ICH E3 heading
   tree with labels, which only the board composes. Narratives and assembly do not depend on it,
   but the CSR's own approval path does. Reaching it means either a launch-scoped tree read under
   `/api/csr/jobs/:jobId` or shared-side composition with `getICHE3Structure`.
3. The 2026-10-30 note in `docs/work-orders/README.md` (CSR end-to-end row) is not updated here,
   because another agent edits that file. The lead should record this change there.
