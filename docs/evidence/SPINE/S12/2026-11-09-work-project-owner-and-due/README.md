# S12: a work project's owner and due date, through the Plan's one assign path

**Package:** S12 (founder decisions P-83, P-109). P-109's third clarification says the owner and due date come from
the work project and its existing tasks, with no new column. **Plan:** S12, and D3 for one CSS rule.
**Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`.

## What already exists (RULE 3)

The search ran before any code, because the owner and the due date had been built several times already.

| Piece | Path | Does | Did not |
|---|---|---|---|
| The Plan's assign | `surfaces/PlanAssign.tsx` (`AssignAction`, `planAssignments`, `usePlanAssignments`, `AssignmentLine`); POST `/api/tasks/tasks`; GET `/api/tasks/tasks/by-module/Plan`; table `unified_tasks` (`assignee_id`, `due_date`) | A filing deliverable, or a work-breakdown task, becomes one person's task with a due date, keyed by origin type and `'<program>:<id>'`. It reads back as "Assigned to X, due …" | Covered no work project |
| Work projects | `surfaces/ProjectCoreWork.tsx` `ProjectWorkProjects` (S12) | Lists them with their kind and `projects.owner_id`'s name | No due date |
| `projects.target_end_date` | `shared/schema.ts` | — | Nothing writes it or shows it |
| Section assign and deadline | `project_sections` (`assigned_to`, `deadline`); `server/routes/project-sections.ts` | A full API | **No v2 caller** |
| Milestones | `project_milestones` (`owner_id`, `due_date`); `/api/project-sections/milestones` | — | **No v2 caller** |
| Project tasks | `project_tasks` (`assignee_id`, `due_date`) | Read by the rollup and the task boards | Not verified in the v2 project page |
| `cdisc_task_deliverables` | `migrations/0000_sweet_joseph.sql:966` | — | Nothing reads it |

The three stores with no v2 caller (section assign and deadline, milestones, and `cdisc_task_deliverables`) are
reported to the coordinating session. Each one is either reached or retired by its owner. This slice adds a fifth to
none of them.

## What changed

There is no new table, column, route, store or screen.

- **`ProjectCoreWork.tsx`.** Each work project row now says one of three things, and offers **Assign** to a person
  who may write:
  - "No one is assigned to deliver it yet.";
  - "Assigned to Dana Ruiz, due Nov 30, 2026" (the Plan's own `AssignmentLine`);
  - "Its assignment could not be read." In that case no Assign is offered.
- **How Assign works.** Assign is the Plan's `AssignAction`, with a body for a work project
  (`buildWorkProjectTaskBody`):
  - a `unified_tasks` row in the Plan module, origin type `work_project`, keyed `'<program uuid>:<work project id>'`;
  - scoped to the filing project's verified `projects.id`, so it appears in that project's tasks and in the assignee's;
  - read back through the Plan's own task read (`usePlanAssignments`, `planAssignments`).

  That read runs only once there are rows to show, so nothing is read before the project's id is known.
- **What stays as it was.** `PlanAssign.tsx` is S11's and F1's, and is not changed. So the Plan step's "Due for you"
  still lists document deliverables and work-breakdown tasks only. A work project's task is in the assignee's own task
  list.
- **`project-home-v2.css` (D3).** The assignment line and its Assign sit under the row, and the line takes no leading
  separator there.

## Red first

`__tests__/projectWorkProjects.test.tsx` gains one case:

1. A work project reads "No one is assigned to deliver it yet."
2. Assign posts a task: `moduleType 'Plan'`, `projectId 11`, `sourceEntityType 'work_project'`,
   `sourceEntityId '<program>:101'`, the person and the due date.
3. The row then says "Assigned to Dana Ruiz, due Nov 30, 2026".
4. With the task read failing, the row says so, and no Assign is offered.

On trunk's `ProjectCoreWork.tsx` that case fails and the other 5 pass (`ui-red.log`). With the change, all 6 pass
(`ui.log`). The existing case "nothing before the id is known" caught a first version that read the tasks too early;
the read moved into the list.

## In the running app

`walk.cjs` (`walk.log`, `walk.json`, `screenshots/`) runs on C2C-101:

1. A fresh CMC work project is added through the one intake.
2. In the Work areas card it says "No one is assigned to deliver it yet."
3. Assign opens the Plan's form (`assign-form-1440-light.png`). A member and 30 Nov 2026 are chosen.
4. POST `/api/tasks/tasks` answers with `sourceEntityType: 'work_project'` and `sourceEntityId: '<program>:<id>'`.
5. The row says "Assigned to JM Smith, due Nov 30, 2026", read back (`assigned-1440-light.png`).
6. At 390 dark it says the same, with no sideways scroll (`assigned-390-dark.png`).
