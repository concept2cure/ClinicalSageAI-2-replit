# S11: the strategy at the head of the Plan step, and "Use the schedule's date" (2026-11-10)

The founder, 2026-11-10, on the three items left open in `../2026-11-05-portfolio-line/README.md`: "Yes to all but I
want you to make the most educated right calls on behalf of our potential customers and what they will want to pay
for." The calls, and why:

1. **The objective stays under the project's name; the Plan step opens with the strategy.** A regulatory team needs
   the objective in view on every step (Author, Review, Submit), not only on Plan, and it is said once (D3 §4.3). The
   strategy is how the project gets there, which is what a plan opens with (THE_PROGRAM §8 item 1).
2. **The strategy is part of the objective of record**, not a second record: one governed form, one write, a new
   version with a reason and an audit row, and AnA is given it with the objective. A strategy nobody can state, or
   one that can change with no trail, is worth nothing to a regulated customer.
3. **Moving a task's due date is a governed change**: a reason, a ledger row on the same transaction, and a refusal
   when the task changed meanwhile. That is what tasking already does for a reassignment.

## What already exists

Searched: `strategy`, `regulatory_strategy`, `regulatoryStrategy`, `critical_success_factors`, `charter_sections`,
`OBJECTIVES_SECTION_KEY`, `successCriteria`, `useProjectObjective`, `ProjectObjective`, `objectivesContextBlock`;
`dueDate`, `due_date`, `reschedule`, `task.assign`, `TaskAuditCommand`, `assignTask`, `namedAssignmentSchema`,
`c2c_ana_actions` command checks. Deleted history (`git log --all --diff-filter=D`) on `*trategy*`, `*eschedul*`: nothing
relevant.

| What | Path | What it does today | What it does not |
|---|---|---|---|
| The objective of record | `server/services/c2c/charter-objectives.ts` (`GET`/`PUT /api/charters/by-project/:ref/objectives`), `surfaces/ProjectObjective.tsx` under the project's name | Objective, success criteria and sources as one versioned, hashed, audited charter section; given to AnA (`objectivesContextBlock`) | No strategy. `project_charters.regulatory_strategy` is a column no project read reaches |
| A governed task change | `server/services/tasking/task-assignment.ts` (`assignTask`, on `PATCH /api/tasks/tasks/:taskId` with `action: 'assign'`), `task-audit.ts` | Admission, compare-and-set, the `task.assign` ledger row on the same transaction, unknown-outcome handling | No route changes a `unified_tasks` due date |
| The plan's date beside an owner's task | `surfaces/PyramidProject.tsx` `TaskPlan` (step 3) | "The schedule now says <date>" | No way to act on it |

## What changed

No new screen, route file, mount, table or store.

- **Tasking** (S9; `task-assignment.ts`, `task-audit.ts`, `taskManagement.routes.ts`): `PATCH /api/tasks/tasks/:taskId`
  takes `{ action: 'reschedule', dueDate, expectedDueDate, reason }`. It uses the reassignment's admission (a governed
  writer, the project open for writing, an unfinished task, never a review route's member). It refuses a stale or
  unchanged date, clears the due-soon and overdue markers so the owner is reminded against the new date, and writes
  a `task.reschedule` ledger row with the stated reason on the same transaction. A lost commit is said as unknown.
- **The objective of record** (S1; `charter-objectives.ts`): an optional `strategy` (up to 8,000 characters). It is
  written into the canonical content only when stated, so every version recorded before it keeps its hash. It is in
  the history and in AnA's context block ("Regulatory strategy:").
- **The Plan step** (`ProjectObjective.tsx` `PlanStrategy`, `ProjectPlan.tsx`): "Strategy" is the first section, then
  "Due for you". None recorded is said as none, with "State the strategy" for a person who may change the project.
  It opens the objective's own form, which now has a "Regulatory strategy (optional)" field. Both readers of the
  record (the block under the name, the Plan's strategy) read again after a save. Editing the objective keeps the
  strategy.
- **"Use the schedule's date"** (`PlanAssign.tsx` `UseScheduleDate`, `PyramidProject.tsx`): in a task's sheet, where
  an unfinished owner's task is due on another day than the plan's. It asks for the reason and sends the reschedule
  with the date the person was shown. A refusal is said with nothing changed; an unconfirmed save reads the task again.

## Proof

| Suite | Green | Red without the change |
|---|---|---|
| `server/routes/__tests__/task-assignment.pglite.test.ts` (real SQL and ledger: the date, the markers, the row, stale, same date, no reason, a reader, another client scope, another organisation, finished tasks, ledger failure rolls back, lost commit) | 23 | `red-reschedule.txt`: 7 fail |
| `server/services/c2c/__tests__/charter-objectives.pglite.test.ts` (old versions keep their hash; a new version with its reason; AnA's block; the executor read; the length limit) | 33 | `red-strategy-server.txt`: 4 fail |
| `client/.../__tests__/planStrategyAndReschedule.test.tsx`, `projectProgramPlan.test.tsx`, `projectHomePlan.test.tsx` | 12 + 24 + 26 | `red-ui.txt`: 13 fail |

Also green: the 51 client suites that mount these surfaces (540 tests); the tasking, review-route, charter, project
create and AnA-prefix server suites (159 tests). ESLint: no rise on any changed file. `tsc --noEmit -p
tsconfig.check.json`: 0 errors.

## The walk, in the running app, at 1440 and 390

`walk.cjs`, on the local database brought to trunk (deploy-migrate 468/468), the server on port 5100 with the launch
gate enforcing. `walk.json` is its log (no API 5xx).

1. WALK-IND-501, made through New project's create with an objective. The Plan step opens with "Strategy · No
   regulatory strategy is recorded yet"; the objective is under the name. `desk-01`
2. "State the strategy" opens the objective's form; the strategy and a reason are recorded (200). `desk-02`
3. After a reload the strategy is shown, "Recorded with the objective, version 2". The route reads it back; the
   history is version 2 "Agreed at the program kickoff" over version 1 "Stated when the project was created." The
   objective under the name is unchanged. `desk-03`
4. "Submit IND" assigned a week early: "Assigned to Founder, due May 27, 2027. The schedule now says Jun 3, 2027",
   with "Use the schedule's date". `desk-04`
5. The reason is given; `PATCH` answers 200 with the previous and new dates. The ledger holds `task.reschedule`,
   "Aligned to the back-scheduled plan", 2027-05-27 → 2027-06-03. `desk-05`, `desk-06`
6. Tasking's own read (`GET /api/tasks/my-work`) has Jun 3; the sheet no longer offers the move. `desk-07`
7. 390 wide: no horizontal scroll. `phone-01`, `phone-02`

## Known, not done

- The objective's route is now read twice on the project page (under the name, and in the Plan step). One shared read
  would need `ProjectHome.tsx` to own it; left to D3's holder.
- The form's submit button says "Record objective" when it is opened from the strategy; the form is the objective of
  record's, and the strategy is one of its fields.
- Typical durations for the non-IND pyramids still need cited sources (the engine's content owner).
