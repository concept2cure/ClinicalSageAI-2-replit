# D2 — Plan: what the filing needs, who does it, by when (pass 3)

Design: `docs/design/CLIENT_JOURNEY_2026-10-25.md`, "Pass 3", with its own "What already exists" table. Built on pass 2
(`2246406e4`). Founder decisions 3 and 4 of the design interview: six steps with Plan first; Plan holds what the filing
needs, the team, the target date and the tasks, and "Assign" on a deliverable creates a task in the existing store.

## What changed

- A project with no documents opens on **Plan**, the first of six steps.
- A US IND's Plan is **what this IND needs**: the 8 phases and 93 deliverables of the IND plan of work, from the
  existing catalogue read (`GET /api/authoring/ind-document-catalog`), each with this project's working copy or a start
  from its template, and "n documents · m started" per phase. A phase that a feature composes opens it on this
  project: Module 3 in CMC / Module 3 (small-molecule IND only), Module 1 in the IND forms, QA Review & Submission on
  Submit.
- **Assign** writes one task for one person with a due date to the one task store (`POST /api/tasks/tasks`), scoped by
  the verified numeric project id and linked to this project's deliverable by its origin columns; the assignment is read
  back on the row. Not offered to a viewer, nor while the project id is unverified.
- A device project's Plan is its workstreams (moved from above the steps), each assignable. Any other filing is told
  the list is not available for it in this release, and where its documents are.
- The team and the project's tasks moved from Author to Plan.

## Browser (`*.png`), local install, project "BX-401 Oncology IND" (US IND, drug, no documents)

| File | What it shows |
| --- | --- |
| `plan-new-ind-opens-on-plan.png` | The project opens on Plan: six steps, what to do now, what this IND needs. |
| `plan-assign-drawer.png` | Assign: person, due date, note. |
| `plan-assigned.png` | The row after Assign: "Assigned: …, due Nov 13, 2026", read back from the task store. |
| `plan-phases-module3-door.png` | Phases with their counts; Module 3 offers CMC / Module 3. |
| `plan-team-and-tasks.png` | Team and the project's tasks, listing both assigned deliverables. |
| `plan-phone.png` | 390 px, fresh session: no sideways scroll. |

`plan-assign-drawer.png` and `plan-assigned.png` were taken before the phase rows gained their open/closed marker.
The request the browser sent on Assign:

```json
{"title":"Prepare: Regulatory pathway assessment","moduleType":"Plan","category":"deliverable","projectId":1,
 "assigneeId":1,"dueDate":"2026-11-13T17:00:00.000Z","sourceEntityType":"filing_deliverable",
 "sourceEntityId":"16431c9c-f452-4bf6-9482-95a920ee51eb:phase1.product_profile:deliverable:1", "...": "..."}
```

Stored (`unified_tasks`): two rows, `module_type` Plan, `project_id` 1, `source_entity_type` filing_deliverable. No
page errors.

## Tests

- `projectHomePlan.test.tsx` (new, 13 tests): opening on Plan, phases in order, started vs template, a failed catalogue
  read as a failure, Assign's one write and its read-back and the task list read again, no Assign for a viewer or an
  unverified project, an unreadable assignment list, the phase doors (and none to CMC for a biologic), a device
  project's workstreams, an NDA's honest line, and the assignment model.
- **Made to fail** (`red/`): each guarded behaviour was broken in the source and the suite run; each break turned at
  least one test red, then the source was restored:
  `projectId-from-uuid` (2 red), `viewer-offered`, `unverified-offered`, `cmc-for-biologic`, `opens-on-evidence`,
  `link-by-title`, `tasks-not-reread` (1 red each).
- Tests that pinned five steps, the team and tasks on Author, and opening on Evidence were updated to the decision
  (`projectHomeStages`, `projectHomeStageTracker`, `projectHomeLaunchScope`, `projectHomeNextStep`,
  `projectHomeTeamResponsibilities`, `projectHomeTeamSetup`, `projectHomeMyWorkLine`, `ProjectHome.mdxWorkflow`).
- `green-summary.txt`: the affected set after the change. Failures that are not this change's are listed there with
  their cause.

## Gates

`ci:typecheck-no-regression` 0 errors; `ci:pushed-lint-warnings` no file gained a warning; `ci:undefined-css-classes`,
`ci:design-system`, `ci:check-phantom-tokens`, `ci:check-shell-css-collisions`, `ci:check-css-selector-shadowing`,
`ci:surface-text-ramp`, `ci:launch-scope`, `ci:fixture-fallback`, `check:catalog-copy` and
`audit:repo-health:ceiling` pass. `ProjectHome.tsx` stays under the 100,000-byte line.

## Review round (after `c693a7260`)

Three read-only reviewers read the pushed change: design system, honest state, correctness. What they found and what
changed:

- **While the project record loads, Plan said the filing has no list.** It now says "Reading this project…".
- **"m started" could undercount.** The document list (`GET /api/authoring/docs`) did not return `template_id`, so a
  working copy was matched by title only — the library's own "Open working copy" had the same gap. The list now
  returns `template_id` (`server/services/authoring/authoring-document-read.ts`), and a copy titled as its template
  also matches.
- **The band promised a list Plan does not have** for an NDA, BLA, MAA or non-US IND. `StageBand` now says Plan's
  sentence only where a list exists (`planListed`), as it already did for Submit.
- **An unconfirmed Assign did not re-read** the assignments and tasks it told the person to check. It does now.
- **The target date could show the day before** in US time zones (a zone-less date read as UTC midnight, formatted
  locally). The recorded day is formatted in UTC.
- **Words**: a finished task reads "Task completed: …", not "Completed: …" (the task is done, not the deliverable);
  a deliverable someone has offers "Assign another person"; a press with no one chosen says nothing was assigned;
  the unreadable-assignments line no longer promises that assigning works; a failed document read's hint is no
  longer swallowed by the internals filter.
- **Layout**: the phase doors wrap instead of overflowing at phone width; the device workstreams no longer get
  doubled spacing in the step body; the phase count and the assignment line align at phone width.
- `MyWorkLine` moved with the tasks into `ProjectPlan.tsx`, which keeps `ProjectHome.tsx` under the size line.

Each fix was made to fail first (`review-red/`, run with `TZ=America/Los_Angeles` so the date shift shows):
`reading-says-not-listed`, `band-promises-list`, `date-in-viewer-zone` (2 red), `started-by-title-only`,
`unconfirmed-not-reread`, `assign-again-same-label`. `projectHomePlan.test.tsx` is now 19 tests.

Not changed: the phase-summary styles repeat the device workstream's disclosure rule in a second stylesheet
(reviewer's optional note); they are kept as is until the two lists share a component.
