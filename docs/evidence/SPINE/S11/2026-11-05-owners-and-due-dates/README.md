# S11 step 3: each program-plan task gets an owner and a back-scheduled due date (2026-11-05)

Package S11 (founder decision P-82; `docs/design/THE_PROGRAM_2026-11-01.md` §3.3, §7.2, §9 step 3): each task in the
project's work breakdown gets an owner from the team and a due date, scheduled backwards from the project's target
submission date along the pyramid's dependencies. A task with an owner is that person's task, so it shows as what is
due for them.

## What already exists

Searched (code, tests, migrations, client surfaces): `owner`, `assignee`, `RACI`, `due`, `dueDate`, `deadline`,
`target date`, `targetSubmissionDate`, `target_submission_date`, `milestone`, `back-schedul`, `backward`,
`criticalPath`, `critical_path`, `latestStart`, `float`, `typicalDurationWeeks`, `estimateTimeline`, `lead time`,
`tasking`, `taskManagement`, `my-work`, `by-module`, `filing_deliverable`, `pyramid_task`. Deleted history:
`git log --all --diff-filter=D` on `*chedul*`, `*Gantt*`, `*Milestone*`, `*critical*`, `*MyWork*`, `*my-work*`,
`*owner*`, `*assign*`, `*due*`, `*deadline*`, `*timeline*`: nothing deleted under those names.

| What | Path | What it does today | What it does not |
|---|---|---|---|
| The work breakdown and its durations | `services/regulatory/SubmissionPyramidEngine.ts`, `services/regulatory/pyramids/*.ts` | Tasks with `dependencies`, `estimatedHours`, `critical`, `criticalPathIds`; IND-family tasks carry `timeline.typicalDurationWeeks` (IND 50 of 58, IND amendment 23/28, annual report 19/23, safety report 20/24; none for NDA, BLA, MAA, J-NDA, PMA, 510(k), De Novo). `estimateTimeline` lays IND phases forward from week 0. Every pyramid ends in one "complete" task; the PMA's last phase is post-submission readiness, after "Submission Complete" | Nothing schedules backwards from a date. No duration for non-IND tasks other than hours |
| The project's pyramid (step 2) | `server/routes/pyramid.routes.ts` (`GET`/`PATCH /api/v1/pyramids/by-project/:ref`), `surfaces/PyramidProject.tsx` (`ProjectProgramPlan`) | Per-project progress in the feature store, admitted, tenant-scoped | No owner, no due date |
| The target date | `regulatory_programs.target_submission_date` (`shared/schema/programs.ts`), set at intake (`server/routes/c2c/projects.ts`) and in Project settings (`server/routes/c2c/project-settings.ts`, `surfaces/ProjectSettings.tsx`, governed: revision and reason, audited). The Plan step already prints it (`ProjectPlan.tsx` `targetWords`) | A recorded field: nothing to add. `project_charters.target_submission_date` exists too, but the charter is not reached from the project (THE_PROGRAM §6) |
| Assign a planned item to a person with a due date | `surfaces/PlanAssign.tsx`: `AssignAction`, `buildDeliverableTaskBody`, `planAssignments`, `AssignmentLine`; a task in `unified_tasks` through tasking's create path `POST /api/tasks/tasks` (`createAssignedTask`, `editor/AssignReviewDialog.tsx`), read back from `GET /api/tasks/tasks/by-module/Plan`, keyed by `sourceEntityType`/`sourceEntityId` | Only for the filing's deliverables (IND documents, device workstreams), not the pyramid's tasks |
| A person's due work | `server/services/tasking/my-work.ts` (reads `unified_tasks` by `assignee_id`, ordered by due date), `surfaces/TaskBoard.tsx` | Held by S9 (RIM session); reached here only through its API |
| Critical path over board tasks | `server/services/tasking/task-planning.ts` `calculateCriticalPath` | Over `unified_tasks` dependencies, not the pyramid; S9's |
| Other date engines | `server/services/ind-lifecycle/ind-timeline-service.ts` (the 30-day and annual-report dates after an IND is filed), `server/services/protocol-milestones/` (study milestones), `server/services/market-specs/regulatory-timelines.ts` (agency clocks) | All forward from a filed or study date; none back-schedules a work breakdown |

So: the dependencies, durations, critical path, target date, owner roster, task store and its create and read API all
exist. What is missing is the arithmetic that turns the target date and the dependencies into each task's start and
due date, and the Plan step reaching the existing Assign for a pyramid task.

## What changed

- **The engine** (`services/regulatory/SubmissionPyramidEngine.ts`): `backSchedule(pyramid, target)` and
  `taskWorkingDays`. The task that completes the submission is due on the target date (the working day before, for a
  weekend target). Every other task is due the working day before the earliest start of the tasks that depend on it.
  Its length is the engine's `timeline.typicalDurationWeeks` (five working days a week) or, where it has none, its
  estimated hours at an eight-hour day. Tasks after the submission (the PMA's post-submission readiness, named by
  `SUBMISSION_ANCHOR`) are laid forward from it. Working days are Monday to Friday; no holiday calendar is applied, and
  the plan says so. An invalid date, a dependency cycle or a breakdown with no single completing task is refused
  (`ScheduleError`), never given dates. Pure: no clock, no store, no model (RULE 2).
- **The route** (`server/routes/pyramid.routes.ts`): `GET /api/v1/pyramids/by-project/:ref` also returns `target`
  (`to_char(rp.target_submission_date, 'YYYY-MM-DD')`, read in the same admitted, organisation-scoped query as the
  filing), `asOf` (today, UTC) and `schedule`. No target recorded gives `schedule: null`, never an assumed date. No new
  mount and no new table: the target date is the project's existing field, so nothing is stored in the feature store.
- **Owners** (`surfaces/PlanAssign.tsx`): the Plan step's existing Assign is reached for a work-breakdown task.
  `buildPyramidTaskBody` makes the task through tasking's existing `POST /api/tasks/tasks` (moduleType `Plan`,
  `sourceEntityType: 'pyramid_task'`, `sourceEntityId: '<program uuid>:<task id>'`, the verified `projects.id`,
  priority high for a critical-path task). `usePlanAssignments` reads both kinds from the one
  `GET /api/tasks/tasks/by-module/Plan` (`byPyramidTask`), kept apart by origin type. The owner and due date live in
  the task store, once: the program plan does not keep a second copy. The form's due date starts from the schedule's
  date and the person confirms it.
- **The UI** (`surfaces/PyramidProject.tsx`, `Pyramid.tsx`, `ProjectPlan.tsx`, `fixtures/pyramid-data.ts`,
  `styles/pyramid-v2.css`): in the Plan step's Program plan, one sentence ("Scheduled back from the target submission
  date, Jun 4, 2027: the work starts by Dec 23, 2026. … 1 of 58 tasks have an owner."), one quiet line on how the dates
  were reached, each row's owner and due date (with "past due" or "should have started" in words, coloured only then),
  and the task sheet's "Schedule and owner" with Assign. No target recorded: "No target submission date is recorded,
  so the tasks have no due dates. Set one in Project settings, at the top of this page." A change of target in Project
  settings reads the schedule again. `PyWorkBreakdown` and `PyTaskSheet` take optional slots (`rowPlan`, `plan`); the
  standalone pyramid is unchanged.

## Proof

Red/green, each failing without its change (outputs in this folder):

| Suite | Green | Red without the change |
|---|---|---|
| `tests/services/regulatory/pyramidBackSchedule.test.ts` (engine) | 11 | `red-engine.txt`: with a successor's start as the due date, 2 fail; without the engine change, all 11 fail (`taskWorkingDays is not a function`) |
| `server/routes/__tests__/pyramid-project-progress.test.ts` (route: schedule, admission, tenant scope) | 16 | `red-route.txt`: 3 schedule cases fail. The admission and other-organisation cases pass either way, by design: they pin that the schedule changes neither |
| `client/src/concept2cure/v2/__tests__/projectProgramPlan.test.tsx` (UI: sentence, rows, Assign, moved schedule, no target, re-read) | 12 | `red-ui.txt`: 6 fail |

Also green: `projectHomePlan`, `pyramidProgressPersists`, `pyramidRoleLabels`, `projectPlanLifecycleReference`,
`filingLifecyclePlan`, `projectHomeDeviceProgram` (46), `pyramid-task-progress`, `submissionPyramidEngine`.
`tsc --noEmit -p tsconfig.check.json`: 0 errors. ESLint on every changed file: no rise (the two complexity warnings
the first draft added were removed by splitting the functions).

## The walk, in the running app

`walk.cjs`, against a fresh database (`scripts/db/install-fresh.mjs`, then `scripts/db/deploy-migrate.mjs`: 462 of 462
applied) on Postgres 16, the server on port 5100 with `LAUNCH_SCOPE_ENFORCE=on` and
`LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`, signed in by dev-login as a user made with `scripts/seed-founder.mjs`. Two IND
projects made through New project's own create. `walk.json` is its log (no API 5xx); screenshots in `screenshots/`.

1. WALK-IND-301 (target Jun 4, 2027), Plan step: "Scheduled back from the target submission date, Jun 4, 2027: the work
   starts by Dec 23, 2026. 0 of 58 tasks have an owner." `01-schedule-sentence.png`
2. The work breakdown: each row "No owner / due …"; "Submit IND" due Jun 3, 2027, "QA Review & Submission Complete"
   due Jun 4. `02-rows-owner-due.png`
3. "Submit IND": "Starts by May 28, 2027, due Jun 3, 2027 · 5 working days, the engine's typical duration." `03-…`
4. Assign: the form's due date starts at 2027-06-03; the person chosen; `POST /api/tasks/tasks` 200. `04-…`, `05-…`
5. Reloaded: the row names its owner; "1 of 58 tasks have an owner." `06-after-reload.png`
6. Tasking's own read, `GET /api/tasks/my-work`: "Submit IND", project WALK-IND-301, due 2027-06-03, priority high;
   and on Tasks. `07-tasks.png`
7. WALK-IND-302 (no target): the no-target sentence, no dates. `08-no-target.png`
8. 390 wide: no horizontal scroll. `09-phone.png`

Found on the way, not this change's: `install-fresh.mjs` ends with "2 tenant-keyed table(s) carry no RLS policy"
(`public.ctd_cross_references`), and the deploy set needs the `vector` extension (`postgresql-16-pgvector`) installed.
The sheet's assignment line shows a leading "·" from `.pj-plan-assigned`'s list styling (`app-v2.css`, the
coordinator's sheet); cosmetic, left to the sheet's holder.

## What S9 needs to know

Nothing in S9 was changed or needed. The owner's task is an ordinary `unified_tasks` row made through
`POST /api/tasks/tasks`, so My work, Tasks, the due sweep and notifications treat it as any other. If S9 wants to
group program-plan tasks, they carry `moduleType 'Plan'`, `taskType 'program-plan'`, `sourceEntityType 'pyramid_task'`.

## Not done here (S11's later steps)

"Due for you" at the head of the Plan step and the schedule line (step 4, with D3); the content plan joined; AnA's
program-manager questions (S4); the portfolio line (step 6). A changed target date does not move the due date of a task
already assigned: the plan says "The schedule now says …" beside it, and the person reassigns. Re-dating owned tasks in
bulk would be a write into tasking, which is S9's.
