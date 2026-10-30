# D2 / W1 — a CSR build is reviewed, approved and imported into Authoring from Submission Center's CSR card

Date: 2026-10-30. Launch row **D2**, workstream **W1**. SYNTHETIC test data only.

## The gap

A CSR built in production could be drafted, given narratives, assembled and placed from
Submission Center's CSR card (`2026-10-30-csr-card-reach/`), but its sections could not be
**reviewed, approved or imported into Authoring** there. Those controls (`CsrHeadingReview`)
were mounted only on the csr-workflow board, whose data comes from
`GET /api/csr-workflow/board`. Production refuses that path (`csr-workflow` is not in
`shared/constants/launch-scope.ts`; verdict `out-of-scope` below). The card did read the
build's sections, from `GET /api/csr/jobs/:jobId/sections`, but derived label-less headings
with no content hash from them (`headingsOf`), which cannot drive a review decision: the
review POST requires `expectedContentHash`.

## What already exists

Searched: `buildHeadings`, `CsrWorkflowHeading`, `CsrHeadingReview`, `CsrBoardHeading`,
`headings`, `section review`, `Import approved sections`, `SourceImportDialog`,
`openImportedDocument`, `kind: 'csr'`, `/sections/:sectionNumber/review`, `/api/csr/jobs`,
`/api/csr-workflow`, `flattenICHE3Sections`, `effectiveReviewState`; and
`git log --all --diff-filter=D -- '*csr*heading*' '*CsrHeading*' '*csr-review*' '*CsrSectionReview*' '*CsrReview*'`
(no deleted file).

| Piece | Path | What it does today | What it did not do |
|---|---|---|---|
| Section review UI | `client/src/concept2cure/v2/surfaces/CsrBuildProgress.tsx` `CsrHeadingReview` | Per heading: send for review, approve, send back with a reason (`POST /api/csr/jobs/:jobId/sections/:num/review` with `expectedContentHash`); "Import approved sections into Authoring" hands the approved numbers to its host | Was mounted only on the board |
| Heading tree | `server/routes/csr-workflow-routes.ts` `buildHeadings` (+ `iso`, `CsrWorkflowHeading`) | Every ICH E3 heading (all depths) with label, depth, manual, effective review state, content hash, reviewer, decision time, reason | Served only by the refused board route |
| Review decision | `server/routes/csr-jobs.ts` `POST /:jobId/sections/:sectionNumber/review`, `server/services/csr/csr-section-review.ts` | Records the decision as the signed-in reviewer; in launch scope under `/api/csr/jobs` | — |
| Section listing | `server/routes/csr-jobs.ts` `GET /:jobId/sections` | Org-scoped, project-access-checked outputs with `review` | No labels, no tree, not shaped for review |
| Authoring import | `client/src/concept2cure/v2/editor/SourceImportDialog.tsx` (`SourceImportDialog`, `openImportedDocument`), source `{ kind: 'csr', jobId, sectionNumbers }`, server `workflow-source-import` | The canonical intake: creates the working copy and opens it in the editor | Was opened for a CSR only from the board (`BiopharmaProject.tsx` `CsrWorkflowBoard`) |
| The card | `client/src/concept2cure/v2/surfaces/CsrSourceInputControls.tsx` → `CsrRunBuilds.tsx` | Lists the run's builds, polls a running one, carries `CsrNarrativeBuild` and `CsrAssemblyControl` for the selected build | No review, no import; headings had `label: ''` and no `contentHash` |

Nothing was rebuilt. The work is: **converge** the heading tree onto one server module,
**reach** it under the launch prefix, and **reach** `CsrHeadingReview` and the canonical
import from the card.

## What changed

1. **Moved** `buildHeadings`, `CsrWorkflowHeading` and `iso` from `csr-workflow-routes.ts`
   into `server/services/csr/csr-headings.ts`. The board imports them; nothing is copied.
   While there, the board handler's pre-existing complexity warning (20, present at HEAD)
   was removed by extracting `resolveActorUserId`, `projectCondition` and `emptyBoard`, so
   the changed file passes `eslint --max-warnings 0`.
2. **Reached** the tree at `GET /api/csr/jobs/:jobId/headings` (`server/routes/csr-jobs.ts`),
   scoped exactly as `GET /:jobId/sections`: 400 on a malformed id, 401 without an
   organization, `requireCsrJobAccess` (project access) then the org-scoped
   `getCSRBuildJobStatus` probe (404 for missing or another organization's job, never an
   empty tree), `CsrScopeError` passed through. Returns `{ headings }`.
3. **Card** (`CsrRunBuilds.tsx`): `headingsOf` and the `/sections` read are replaced by
   `useBuildHeadings`, which reads `/headings`, validates every row (a malformed row
   refuses the read), re-reads when the polled build's `updatedAt` moves and after each
   review decision. `CsrHeadingReview` and `CsrNarrativeBuild` share that one source. The
   import opens `SourceImportDialog` with `{ kind: 'csr', jobId, sectionNumbers }`, then
   `openImportedDocument(docId, programId, onNav, code)` exactly as the board does.
   `onNav` is passed down from `CsrSourceInputControls` (via `FrozenClinicalTables`).
   A failed headings read is an alert, and no review is rendered.
4. `programName`: the card (and its host `OrchestratorRunControls` in `EctdCompile.tsx`)
   holds only the program id. The dialog's existing handling applies: "Target project:
   {programName || programId}". When the host passes no `onNav`, the dialog is given no
   `onOpenDocument` and says where to find the saved copy (its existing branch).

## Evidence (red, then green)

| File | What it shows |
|---|---|
| `server-red.txt` | The two new `/headings` tests fail before the route exists (404 for the tree, 404 instead of 400 for a malformed id) |
| `server-cross-org-mutation.txt` | With the org-scoped existence probe removed from the new route, the cross-organization test fails (`expected 200 to be 404`): the check catches a leak, not just a missing route |
| `server-green.txt` | `csr-jobs-build-and-review.pglite.test.ts` (9), `csr-workflow-headings.test.ts`, `csr-workflow-program-scope.pglite.test.ts` — 14 passed |
| `server-project-access-mutation.txt` | Reviewer finding (project-access half untested): with the `requireCsrJobAccess` line deleted from `GET /:jobId/headings`, `csr-jobs-headings-project-access.pglite.test.ts` fails 2 of 5 (`expected 200 to be 403` for a same-org member without access to a private project, and for a user outside the organization). File restored, SHA-256 `4dc3e23d…` before and after |
| `server-project-policy-mutation.txt` | The same test with the real project policy disabled inside `resolveCsrScope` (`server/services/csr/project-scope.ts`, the check `requireCsrJobAccess` reaches): the private-project test fails (`expected 200 to be 403`). File restored, SHA-256 `515dd7c9…` before and after |
| `server-project-access-green.txt` | The new project-access test (5) with the earlier server suites and `tests/unit/csr-jobs-routes.test.ts`: 5 files, 28 passed |
| `eslint-project-access.txt`, `tsc-full-project-access.txt` | `eslint --max-warnings 0` on the new test file and the full typecheck after the fix, both exit 0 |
| `client-red.txt` | Before the card change: no "Section review", no import button, no alert for a refused headings read; the existing §14.3.3 test also fails once the card's data comes from `/headings` |
| `client-fail-closed-mutation.txt` | With a failed headings read turned into an empty list, the fail-closed test fails |
| `client-green.txt` | `csrCardReach`, `csrBuildProgress`, `csrSourceInputControls`, `workflowEditorEntryPoints` — 31 passed |
| `launch-scope-api.txt` | `npm run ci:launch-scope-api`: 573 paths, none refused, exit 0 |
| `launch-scope-api-list-csr.txt` | The `--list` lines for `/api/csr/jobs…` |
| `launch-scope-runtime-verdict.txt` | `launchScopeApiVerdict` on the paths the card now calls: `/api/csr/jobs/41/headings` and `/sections/10.1/review` are `launch`; `/api/csr-workflow/board` is `out-of-scope` |
| `eslint.txt` | `eslint --max-warnings 0` over every changed file, exit 0 |
| `tsc-full.txt` | `NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .`, exit 0 |

Two assertions in the first client draft were wrong in the test, not the code (9 is not
drafted, so "4 of 5"; the editor target field is `sectionCode`), and were corrected before
`client-green.txt`. They were not what made `client-red.txt` red: those tests failed earlier,
at "Unable to find a label with the text of: Section review" and the missing import button.

**Board output byte-identical.** A temporary harness (deleted after use) called
`GET /api/csr-workflow/board` with the `csr-workflow-headings.test.ts` mocks, for no job and
for a job with four outputs (approved, stale approval with a string timestamp, sent back
with a reason, null hash), and wrote `sections` and `headings` to JSON before the move and
after both the move and the complexity extraction. Both files: SHA-256
`a51d191dffdb8fbdfceba3d71fcee0f548817645fb504b15710f35b673d3a54a`, `cmp` identical. The
board's `meta` (including the empty-board meta now built by `emptyBoard`) is held by
`csr-workflow-program-scope.pglite.test.ts`, green.

## Project access, against real project rows (review fix, 2026-10-30)

A reviewer found that nothing tested the project-access half of the new route's scoping:
`csr-jobs-build-and-review.pglite.test.ts` and `tests/unit/csr-jobs-routes.test.ts` both mock
`requireCsrJobAccess` to `true`, so deleting that line from `GET /:jobId/headings` left both
green. `server-cross-org-mutation.txt` only proved the organization check.

`server/routes/__tests__/csr-jobs-headings-project-access.pglite.test.ts` now runs the real
`requireCsrJobAccess` → `resolveCsrScope` → `canAccessReportProject` (no mock of
`project-scope`), over the real `migrations/20260628_csr_job_state.sql` and project, membership
and visibility rows, as `csr-workflow-program-scope.pglite.test.ts` does for the board. Project
11 is organization-visible and project 12 is private, with one project member. It checks:
- an ordinary member reads project 11's headings (200, with the output's state and hash);
- the same member is refused project 12: 403 `CSR_PROJECT_ACCESS_DENIED`, with no `headings`
  and none of the private output's hash in the body;
- project 12's own member reads it (200), so the refusal comes from the project policy and not
  from the job;
- a user outside the organization is refused (403 `CSR_PROJECT_ACCESS_DENIED`);
- a job the access check cannot find in this organization gives 404, never an empty tree.

The route code was already correct. This change adds only the test that was missing. The
test passed against the unchanged route, and the red runs are the two mutations listed above.

## Launch scope

Nothing was added to `shared/constants/launch-scope.ts` or the surface registry. The new path
is admitted by eCTD Compile's `/api/csr/jobs` prefix (`launch-scope-runtime-verdict.txt`).
`ci:launch-scope-api` does not list `/api/csr/jobs/:p/headings` itself because the card
builds the path from a `JOBS` constant (`${JOBS}/${jobId}/headings`), which the static scan
reads as a non-`/api` template; the same is true of the existing `/sections` and
`/narratives/status` reads. The runtime verdict above is the check that applies.

## Open

- The board (`CsrWorkflowBoard` in `BiopharmaProject.tsx`) still mounts the same controls
  from `/api/csr-workflow/board`. It is not a launch surface; it was left as is.
- `GET /api/csr/jobs/:jobId/sections` now has no client caller (it returns section content,
  which `/headings` does not). It is kept: it is the API for a build's drafted text, held by
  `csr-jobs-build-and-review.pglite.test.ts` and `tests/unit/csr-jobs-routes.test.ts`.
  Removing it is a separate decision.

## Follow-up (2026-10-30, lead session): the import dialog names the project

Item 4 above is closed. `CsrRunBuilds.tsx` reads the open shell project (`useShellProject`, the same
source `EctdCompile` reads) and passes its title as `programName` only when the shell project's id is
this card's `programId` (case-insensitive). Any other open project, or none, leaves the dialog naming
the target by id, as before. No prop is threaded through the five hosts.

| Check | Result |
|---|---|
| `csrCardReach.test.tsx` "names the target project … and only then", with `programName` not passed | fails: `expected { …(2) } to match object { …(2) }` |
| Same, restored | 8 of 8 pass |
| ESLint `--max-warnings 0` on both files | clean |
