# P-39 step 3, S1: the correspondence family reads one project's letters, for a person who may open it

Row: D2 (W1). This is slice S1 of `docs/design/CORRESPONDENCE_CONVERGENCE_2026-10-29.md`. Its "What already exists"
section maps the family and the inbox.

## The defect

- **Every letter in the organisation.** The device screens' Correspondence tab (`programTabsService.getCorrespondence`)
  names its program, a `regulatory_programs` uuid. `GET /api/regulatory-correspondence/correspondence` did
  `Number(req.query.projectId)` and got NaN. The `if (projectId)` filter was therefore dropped, and the tab listed
  every letter in the organisation: other projects' letters, private projects' included.
- **No project check on the detail.** `GET /correspondence/:id` checked the organisation only, so any member could open
  any letter by its id.
- **No project check on the review.** `PATCH /issues/:id/review`, the family's one governed write, also checked the
  organisation only.

## What changed

- **`admittedProjects`.**
  - It takes an integer project id, or a program uuid, which it resolves to the projects anchored to that program
    (`projects.regulatory_program_id`).
  - It keeps each project the person is admitted to (`requireProjectAdmission`, the platform's one project-admission
    check).
  - The list filters on `project_id = ANY($2::int[])`.
  - A request that names no project gets a 422. A project the person may not open gets a 404. Neither ever falls back
    to the organisation-wide list.
- **The detail** admits the reader to the letter's own project. A letter of a project the reader may not open is "not
  found".
- **The review** requires write admission to the letter's project before its transaction, and refuses with the
  admission's own status.

## Proof

- **`server/routes/__tests__/regulatory-correspondence-project-scope.test.ts`.**
  - A program anchoring projects 7 and 8, read by someone admitted to 7, lists with `[2, [7]]`.
  - No project, or "not-a-project", gives a 422. A project the reader may not open gives a 404, with no list query run.
  - Another project's letter gives a 404.
  - A review by someone who may read the project but not change it gives a 403, and no UPDATE runs.
- **Mutation:** restoring the organisation-wide list fails the first case. Restoring the project clause makes it pass.
- **Unchanged and passing:**
  - `regulatory-correspondence-names-the-session-user.test.ts`;
  - `regulatory-correspondence-device-intake.test.ts`;
  - `launch-scope-device-features.test.ts`.
- **Gates:**
  - `ci:sql-interpolation`: OK;
  - `tsc --noEmit`: no error.
