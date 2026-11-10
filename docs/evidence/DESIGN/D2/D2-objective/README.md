# The New project wizard's objective goes with the create, in one write

**Plan:** S1 (the project and its objective). This was asked for under D2 §2.4 item 6, and the coordinating session
assigned it on 2026-11-09. Every file changed is in S1's paths. **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`.

## What already exists (RULE 3)

| Piece | Path | Did | Did not |
|---|---|---|---|
| The field | `surfaces/ProjectObjective.tsx` `NewProjectObjectiveField`, `NewProjectObjectiveReview`; used in the wizard's step 2 and review (`Projects.tsx`) | "Objective (optional)" and its review row | Hold the server's limit |
| The server | POST `/api/c2c/projects` (`505449d7a`); `services/c2c/charter-objectives.ts` `objectiveStatedAtCreation` | Takes an optional `objective` (at most 4,000 characters, at most 20 sources) and records it as charter version 1 in the creation's own transaction. Refuses a malformed one with 400, in its own words, and creates nothing | — |
| A second write | `surfaces/projectIntakeRequest.ts` `recordIntakeObjective`: PUT `/api/charters/by-project/:id/objectives`, after the create | Recorded the objective after the project existed | Fail with the create: a refused objective left a project with no objective, and a notice |

So this was not new work. It converges two writes onto the server's one.

## What changed

- **`Projects.tsx`.**
  - The create body carries `objective` when one is stated, and nothing when it is blank.
  - The post-create `recordIntakeObjective` call is removed, with its "The project is created and open. Its
    objective was not recorded…" notice.
  - A refusal comes back through the create's existing outcome, in the server's words, and nothing is created.
- **`projectIntakeRequest.ts`.** `recordIntakeObjective` and `IntakeObjectiveAnswer` are deleted. They had no other
  caller. The objective's later edits stay with the project page's existing objectives write.
- **`ProjectObjective.tsx`.** The field gains `maxLength={4000}`, the server's limit. The label "Objective
  (optional)" was already what the server says: the objective is optional.

## Red first

- `__tests__/newProjectWizardObjective.test.tsx` is rewritten to the one-write contract, with four cases:
  - the field is labelled "Objective (optional)" and holds at most 4,000 characters;
  - a stated objective is sent with the create, the wizard opens the project, and no charter write follows;
  - a blank objective sends none;
  - a server refusal is shown in its own words, and the wizard does not navigate.
- **Red.** On trunk's wizard, 2 fail and 2 pass (`objective-red.log`).
- **Green.** With the change all 4 pass. The 17 related suites, including the wizard's, the intake's and the
  objective read's, pass: 148 cases (`tests.log`).

## In the running app

`walk.cjs` (`walk.log`, `walk.json`, `screenshots/`) runs on the dev server:
1. **1440 light.** New project, IND, a client workspace, the product, and an objective
   (`objective-field-1440-light.png`). The field's `maxlength` is 4000.
2. The review shows the objective (`objective-review-1440-light.png`).
3. Create project: POST `/api/c2c/projects` answers 201 and carries the objective. Its receipt names the recorded
   objective as its charter's version 1.
   - No charter write is sent.
   - The project's objectives read (GET `/api/charters/by-project/:id/objectives`) answers 200 and holds the
     objective (`project-created-1440-light.png`).
4. The wizard's own body, with a 4,001-character objective, is refused 400. The refusal is "The objective must be at
   most 4,000 characters…", in the server's words. The field's `maxlength` stops a person typing that far, so the
   refusal is posted directly. The wizard's display of a refusal is the test's fourth case.
5. **390 dark.** The field is labelled the same, with no sideways scroll (`objective-field-390-dark.png`).
