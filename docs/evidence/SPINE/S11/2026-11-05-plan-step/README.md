# S11 step 4: the Plan step's program plan: due for you, and the content plan joined to the work (2026-11-05)

Package S11 (P-82), with D3's Plan step (`docs/design/THE_PROGRAM_2026-11-01.md` §3.5, §8, §9 step 4). Asked by the
design continuation session (`011Dpx…`) after step 3 (`docs/evidence/SPINE/S11/2026-11-05-owners-and-due-dates/`):

1. **Due for you**: the signed-in person's tasks in this project's plan, by date, first in the Plan step.
2. **The content plan joined to the pyramid**: every document the filing needs, tracked against the work-breakdown
   task that produces it, with that task's due date and owner.
3. **"Use the schedule's date"** on an assigned task, through tasking's existing write, if one exists.

## What already exists

Searched: `Due for you`, `dueFor`, `my-work`, `readMyWork`, `by-module`, `assigneeId`, `content plan`, `deliverable`,
`PlanDeliverable`, `taskId`, `:deliverable:`, `:subtask:`, `sectionCodes`, `documentBindings`, `ind-document-catalog`,
`dueDate` in every tasking route (`taskManagement.routes.ts`, `unifiedTasks.routes.ts`, `taskBoard.routes.ts`,
`c2c/tasks.ts`), `reschedule`, `setDueDate`, `updateUnifiedTask`. Deleted history (`git log --all --diff-filter=D`) on
`*DueFor*`, `*ContentPlan*`, `*content-plan*`, `*MyWork*`: nothing.

| What | Path | What it does today | What it does not |
|---|---|---|---|
| The filing's documents (the content plan's rows) | `client/src/concept2cure/v2/editor/IndDocumentLibrary.tsx` (`IndFilingPlan`), fed by `GET /api/authoring/ind-document-catalog` (`server/services/authoring/ind-document-catalog-source.ts`) | Every IND document by phase, its working copy, its assignment (`assignmentOf`) and Assign (`assignAction`). **Each deliverable is already derived from the IND pyramid**: its id is `<pyramid task id>:deliverable:<n>` (or `:subtask:<id>`, line 57 and 49) and it carries `taskId` | The producing task's due date and owner are not shown beside the document |
| The device filing's workstreams | `surfaces/ProjectMdxWorkflow` (via `ProjectPlan.tsx`) | Its own deliverable ids, with Assign | Not derived from a pyramid: no join is claimed for them |
| The schedule and owners | step 3: `pyramid.routes.ts` (`schedule`), `PyramidProject.tsx`, `PlanAssign.tsx` (`byPyramidTask`) | Each pyramid task's dates and owner | Read only inside the Program plan section |
| A person's tasks | `GET /api/tasks/tasks/by-module/Plan` (rows with `assigneeId`, `dueDate`, `status`, origin), already read by the Plan step (`usePlanAssignments`); `GET /api/tasks/my-work` (`server/services/tasking/my-work.ts`, S9's) across projects | Both exist | Nothing in the Plan step lists what is due for the person |
| Changing a task's due date | `PATCH /api/tasks/tasks/:taskId` (status, progress, signature; or `action: 'assign'` with `assigneeId` and reason). `unifiedTasks.routes.ts` `PATCH /:id/status`. `c2c/tasks.ts` `PUT /projects/:projectId/tasks/:taskId` takes `dueDate`, but writes `project_tasks`, a different table | — | **No existing route changes a `unified_tasks` row's due date.** So "Use the schedule's date" is not offered (below) |

## What changed

All in the Plan step (`ProjectPlan.tsx`) and S11's files; no new screen, route, mount, table or store.

- **Due for you** (`PlanAssign.tsx`: `planDueFor`, `DueForYou`): the signed-in person's open tasks of this project's plan,
  documents and work-breakdown tasks both, by due date (none last), first in the Plan step. Read from the rows the
  Plan step already reads (`GET /api/tasks/tasks/by-module/Plan`), matched on `assigneeId` against the session's user
  (`useAuthUser`, which does not throw outside a provider). Completed and cancelled tasks are left out; a past-due
  task says "past due" in words; nothing assigned is said; an unread list is said as unread. No signed-in person, no
  list: whose tasks they are is never guessed. `GET /api/tasks/my-work` (S9's) was not used: it is cross-project and
  the project's own rows were already read here.
- **The content plan joined to the work** (`PyramidProject.tsx`: `producingTaskId`, `producingTask`, `ProducedBy`):
  beside each IND document of "What this IND needs", "Work: <producing task> · due <date> · <owner or no owner>". The
  key is the catalogue's own: each document is derived from the IND pyramid and ids `<task id>:deliverable:<n>` or
  `<task id>:subtask:<id>`. Shown only where that task is in this project's pyramid, so a device workstream or a
  task outside the pyramid shows nothing rather than a guessed task. Fed through the existing `assignmentOf` slot of
  `IndFilingPlan`; the editor's library file is unchanged.
- **One read** (`useProjectPyramid`): the Plan step reads the project's pyramid once and shares it with the Program
  plan (`ProjectProgramPlan` takes `read`; it still reads for itself when mounted alone).
- Styles in `styles/pyramid-v2.css` (S11's sheet).

## "Use the schedule's date": not offered

No existing route changes a `unified_tasks` row's due date (table above). The Program plan's task sheet keeps saying
"The schedule now says <date>" beside an owner's task whose date differs. What S9 would need to add, for its holder:
`PATCH /api/tasks/tasks/:taskId` accepting `dueDate` (with a reason and its audit row, as the assign action has),
in `server/routes/taskManagement.routes.ts`. With that, the sheet's line becomes a "Use the schedule's date" button.

## Proof

| Suite | Green | Red without the client change (`red-ui.txt`) |
|---|---|---|
| `client/src/concept2cure/v2/__tests__/projectHomePlan.test.tsx` (the Plan step mounted in Project home, served reads) | 26 | 3 fail: due-for-you first and by date, nothing-assigned said, each document's producing task. "Read once" and "no signed-in person, no list" pass either way, by design: they pin that the change adds no second read and guesses no person |
| `client/src/concept2cure/v2/__tests__/projectProgramPlan.test.tsx` (the functions) | 15 | 3 fail |

Also green: `projectPlanLifecycleReference`, `projectHomeDeviceProgram`, `filingLifecyclePlan`. ESLint: no rise on any
changed file (a first draft raised `ProjectPlan`'s complexity; its reads moved into `usePlanReads`). `tsc --noEmit -p
tsconfig.check.json`: 0 errors.

## The walk, in the running app, at 1440 and 390

`walk.cjs`, on the same local server and database as step 3's walk (which made WALK-IND-301, target Jun 4, 2027, and
gave "Submit IND" to the signed-in person). `walk.json` is its log (no API 5xx).

1. "Due for you" is the first section of the Plan step: "Submit IND · Work · Due Jun 3, 2027". `desk-01-…`, `phone-01-…`
2. All 93 IND documents name their producing task: "FDA ESG submission acknowledgment" reads "Work: Submit IND · due
   Jun 3, 2027 · Founder"; "Target Product Profile" reads "Work: Define product profile · due Jan 5, 2027 · no owner".
   `desk-02-…`, `desk-03-…`, `phone-02-…`, `phone-03-…`
3. No horizontal scroll at either width.

## Not done here

§8 item 1 (the objective and strategy card) is S1's. §8 item 3 (workstreams as one list with lead and status) and item 4
(the schedule line) are D3's layout with S11 data, the next slice. The device plan's workstreams are not derived from a
pyramid, so they carry no producing task.
