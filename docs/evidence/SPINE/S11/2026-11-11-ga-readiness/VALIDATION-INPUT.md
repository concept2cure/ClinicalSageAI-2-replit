# Input for the validation package (launch row D4): what S11 shipped, as requirements with their proof

For the holder of `docs/validation/**` (the "Validation for GA" session, `01QoxbLcnW…`). Not an edit to the package:
this lane does not hold those files. `URS-001-PROJECTS.md` (URS-PROJ-001 to 014) predates the program plan, so none
of the behaviour below is traced in TM-001 yet. Each row is written as a candidate requirement, with the automated
test that proves it today and where it was exercised in the running app as the runtime role (`app_service`,
`RLS_ENFORCE=on`).

Risk is this lane's suggestion (the package's own scale decides): **high** where a governed record or tenant
isolation is at stake, **medium** where a person could be misled, **low** otherwise.

## Governed records (Part 11 relevant)

| # | Candidate requirement | Risk | Proof (automated) | Running app |
|---|---|---|---|---|
| 1 | A project's objective of record, with its success criteria, regulatory strategy and sources, is versioned: every change is a new version with the stated reason, the actor and the time, on a hash chain; earlier versions stay readable; the audit trail cannot be rewritten or removed. | high | `server/services/c2c/__tests__/charter-objectives.pglite.test.ts` (versions, hash chain, append-only trail, a version recorded before the strategy existed keeps its hash) | `../2026-11-10-strategy-and-reschedule/walk.json` step 3: version 2 "Agreed at the program kickoff" over version 1 |
| 2 | A task's due date is changed only with a stated reason, by a person permitted to change the project, on an unfinished task; the change and its `task.reschedule` ledger entry (previous date, new date, reason, actor) commit together or not at all; a task changed meanwhile is refused; an unconfirmed commit is reported as unknown, never as done. | high | `server/routes/__tests__/task-assignment.pglite.test.ts`, "a task's due date is changed with a reason, on the ledger" (real SQL and ledger) | same walk, steps 5–6; ledger row quoted in that README |
| 3 | A task's owner is notified when another person changes its due date, only after the change has committed. | low | same suite, "tells the owner when someone else moves their deadline" | this folder's README, second pass |
| 4 | A work-breakdown task is assigned to a person through the one task store, with its origin (`pyramid_task`, the project and task) recorded, and appears in that person's work. | medium | `client/.../__tests__/projectProgramPlan.test.tsx` (the create body), `projectHomePlan.test.tsx` | `../2026-11-05-owners-and-due-dates/walk.json` steps 4–6 |

## Tenant isolation and permissions

| # | Candidate requirement | Risk | Proof (automated) | Running app |
|---|---|---|---|---|
| 5 | A project's plan, its progress, its portfolio line, its objective and strategy, and its tasks' due dates are readable and changeable only within the project's organisation. Another organisation's member is answered "not found" (or `unavailable` in the batch read) and nothing changes. | high | `server/routes/__tests__/pyramid-project-progress.test.ts` (admission and organisation scope, single and batch reads); `task-assignment.pglite.test.ts` (another organisation, another client scope) | `access.txt`, first block |
| 6 | A viewer reads the plan and is refused every change (task status, objective and strategy, due date, task create); the screen shows statuses without offering them and offers no Assign, Edit or reschedule. | high | `projectProgramPlan.test.tsx` ("a person who may not change the project"); `planStrategyAndReschedule.test.tsx` ("is not offered to a viewer"); `task-assignment.pglite.test.ts` (a project reader) | `access.txt`, second block; `screenshots/desk-viewer-sheet.png` |
| 7 | Task progress is recorded per project, never shared between two projects of the same filing type. | medium | `pyramid-project-progress.test.ts` (the project's own key; the per-type row untouched) | `../2026-11-04-program-plan/` walk, step 4 |

## Computed figures (Rule 2: engines compute, nothing is invented)

| # | Candidate requirement | Risk | Proof (automated) | Running app |
|---|---|---|---|---|
| 8 | Each task's start and due date is computed from the project's recorded target submission date and the work breakdown's dependencies; no target date gives no dates; an invalid date, a dependency cycle or no completing task is refused. | medium | `tests/services/regulatory/pyramidBackSchedule.test.ts` (all eleven work breakdowns) | `../2026-11-05-owners-and-due-dates/walk.json` |
| 9 | Where a filing type has no typical task durations on record, the plan, the Projects card and the global schedule state that the dates are the earliest possible and not a forecast. | medium | `pyramidBackSchedule.test.ts` ("durations"); `projectProgramPlan.test.tsx`, `projectsPortfolioLine.test.tsx`, `reportingGlobalSchedule.test.tsx` | `screenshots/desk-device-2-pj-program-plan.png`, `desk-global-schedule.png` |
| 10 | The agency review clock shown after the filing is the published goal for the pathway (or the IND's 30-day review), with its source named; none is shown where none is on record. | medium | `pyramid-project-progress.test.ts` ("review clock") | `../2026-11-05-portfolio-line/walk.json` |
| 11 | A project's status word (on track, at risk, blocked, not scheduled, complete) on the plan, the Projects card and the global schedule follows one rule, computed server-side and matched by the client. | medium | `pyramidBackSchedule.test.ts` (`scheduleSummary`); `projectProgramPlan.test.tsx` (parity with the engine) | `../2026-11-05-portfolio-line/walk.json` step 4 |

## Not validated here, and why

- Typical durations for 510(k), De Novo, PMA, NDA, BLA, MAA and J-NDA are not on record; requirement 9 is how the
  product stays truthful until they are.
- A responsibility chart (RACI) per deliverable is not built: one owner per task is.
