# S1: the project's objective, landed on trunk (2026-11-05)

S1's server half (the charter objective's read and write, `6ffca88a09`) was on trunk. Its two UI commits were not: they
were dropped when this session reconciled onto trunk on 2026-11-04, taken for duplicates of the design lead's work. The
S11 session found it on 2026-11-05: `useProjectObjective` (`projectSettingsRequest.ts`) existed and nothing rendered it,
so a project's objective could be recorded but was shown nowhere.

## What already exists (RULE 3)

- `server/routes/charters.ts`, `server/services/c2c/charter-objectives.ts`: GET/PUT `/api/charters/by-project/:ref/objectives`,
  project-admitted, versioned, with sources (`6ffca88a09`).
- `client/src/concept2cure/v2/surfaces/projectSettingsRequest.ts`: `useProjectObjective`, tested, not rendered.
- The registry: project-home already claims `/api/charters/by-project` (`66bd1d21f6`), so the reads are served in
  production. The old commit's broader `/api/charters` claim was not taken.
- D3 §4.3 places the objective on the project page, said once.

## What landed

- The project page's "About this project" card states the objective (`ProjectObjective.tsx`, mounted in `ProjectHome.tsx`):
  its text, sources and versions, or "No objective is recorded for this project yet.", with "Ask AnA to propose it" and
  "Set the objective" for a person who may change the project (cherry-pick of `d516b97167`).
- New project asks for the objective (optional) and records it once the project exists; a refused record says so and
  points to the About card (cherry-pick of `76eae6309d`).
- The card's two actions were touching; `.pj-about-row` now wraps with the spacing token's gap.

## Proof

- `projectObjective`, `newProjectWizardObjective` and the 45 neighbouring project-page and New project suites: 433 of
  433. ESLint: no rise on `ProjectHome.tsx` (7), `Projects.tsx` (8), `projectIntakeRequest.ts` (0); new files clean.
  `ci:one-design-plan` OK; the CSS gates OK.
- In the running app (demo database, runtime role, forced RLS): the project page shows the Objective section with its
  empty state and both actions (`objective-on-project-page.png`). New project's objective field is on a later step of
  the wizard, as its suite pins (`new-project.png` is the first step).

Not walked: recording an objective through the UI, end to end (the suite covers the write and its refusal).
