# D2: opening a task from the board opens the task itself. PAUSED, not done.

**Row:** D2. **Lane:** `…session_01JNRgCKWRqqJxZ1cJCyxoor`. **Status:** paused on 2026-10-22 at the founder's instruction
("stop, pause and push all work"). Nothing in this row has shipped. This file records the decision and everything learned,
so the next session completes it without re-deriving any of it.

## The decision (product owner, under the founder's request of 2026-10-01)

A card on the task board can come from another store: a schedule task, an agency-correspondence item, or a tracked
filing. Opening one should give three levels:

1. **A quick look on the board.** This exists: `OtherStoreTaskDetail` in `TaskBoard.tsx`.
2. **Open the item** (the primary action). Land on the screen where the item is worked, with that item open and
   highlighted and the project set. This is what Veeva Vault and MasterControl do: open the record, not its folder.
3. **Open the project** (the secondary action).

There must also be a way back to the board that restores its filters, view and last-opened card, so a triage pass is
not lost. And if the item is no longer there (closed, moved, or access lost), the destination must say so, never land
silently on a page that does not show it. The deep link should go through the shell's existing channel (`navParams`,
with params declared in `shared/navigation/index.ts`), so AnA can open the same items.

## What already exists (RULE 3), mapped on 2026-10-01; the paths were re-checked 2026-10-22

**The shipped "Open in Project home" button reaches nothing item-specific. This is a defect in the board work of
2026-10-01, and it is the first thing to fix.** `ProjectHome.tsx` lists none of these rows. It also accepts only a
string (UUID) project id (`const pid = typeof sel?.id === 'string'`), while the board hands it the numeric
`projects.id`, so Project home opens in its no-project state.

| Store | GET routes returning rows | Screens listing rows one by one | Focus on arrival |
|---|---|---|---|
| `project_tasks` | `/api/concept2cure/projects/:id/tasks` (`c2c/tasks.ts`), no client caller; `/api/project-home/:id` (`project-home-routes.ts`), deliberately not called | Task board only | none |
| `c2c_project_work_items` | `/api/concept2cure/projects/:id/work-items` (`c2c/notifications.ts`), no client caller; `/api/submission-ops/due-soon`, no client caller | Task board only. The MDx `device-tasks` Kanban shows per-owner totals from `/workload`, with a `Math.random()` id fallback and a `(Untitled)` fallback. | none |
| `estar_submissions` | `/api/510k/estar/submissions[/:id]` (`510k-estar-routes.ts`) | Submission Center's "Device filings · eSTAR" table (`SubmissionCenter.tsx`, no selected-filing state; the row button only goes to `device-510k`); MDx `EstarFilingPanel` in `device-510k`, `device-pma` and `device-diagnostics` (org-wide list, no selected row) | none |

Mechanisms to reuse rather than rebuild:
- `navParams.ts`: `consumeNavParams` is one-shot, keyed to the surface, and expires after 2 minutes. Precedents are
  `artifactId` on `artifacts-center` (writer `V2App.tsx`) and `studyId` on `biostatistics`.
- The surface-action bus: `tasking.open-task` already opens one card on the board.
- `shellProject.ts`: `publishShellProject` and `useShellProject`.

Also found:
- Submission Center's programme label compares UUIDs from `/api/c2c/projects` with a numeric `f.projectId`, so it
  always reads "programme not resolved".
- `CommunicationCenter`'s "Open in Tasking" chip never appears in practice.

## What the next session builds (each red-first)

1. **Somewhere each store's item can be opened.**
   - The work-item and project-task rows have routes with no screen. Choose the screen deliberately: the
     Communication Center or a project-scoped list fed by the existing `/projects/:id/unified-work` route, which has no
     caller. Do not add a new list endpoint.
   - eSTAR: give `SubmissionCenter`'s eSTAR table a selected-filing state consuming a declared `filingId` param, with
     an honest "no longer on this programme" state.
2. **The board's "Open the item" button,** with "Open the project" as secondary, fixing the numeric-versus-UUID
   project hand-off.
3. **The board's place memory.** Filters, view and last-opened card in sessionStorage; focus returns to that card; a
   stale project filter falls back to all. Also clear `sessionStorage` in the global `afterEach` in `tests/setup.ts`,
   so a test does not start where the previous one left the board.
   - Written and green on 2026-10-01: the 7 board suites 26/26, and the whole v2 client directory 384 files,
     4088/4088.
   - **Lost uncommitted when the container was replaced.** Rewrite it from this description.

## Found on the way, handed on (not done here)

- **Security: one project route with no access check.** `GET /api/concept2cure/projects/:projectId/context`
  (`server/routes/c2c/program-twin.ts`, line 705 on 2026-10-22) reads `projects` by id and `project_tasks` by
  `projectId` with no organisation predicate and no `verifyProjectAccess`; its sibling routes have both. Row-level
  security should still hold in production, but this route has no check of its own. Add the same check its siblings use.
- **Reporting PDF metadata pinning is absent from trunk.** The commit that pinned a Reporting PDF's metadata to its
  recorded export time and id is missing: `writer.ts`'s `stampExportIdentity` and the tests `export-identity.test.ts`
  and `run-pdf.test.ts` are gone, and the writers were since reworked (branding, bidirectional text). History was
  squashed on 2026-10-21, so when they left cannot be seen. If the export's recorded sha256 is meant to be
  re-verifiable by re-rendering, restore the pin and its test.
