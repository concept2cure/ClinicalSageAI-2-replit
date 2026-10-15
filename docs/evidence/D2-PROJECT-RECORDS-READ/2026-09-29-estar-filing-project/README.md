# PF-15, eSTAR (D7 for D2): a tracked device filing names a project of its own organization

Plan: `docs/design/PROJECT_FIRST_PLAN_2026-09-26.md` §PF-15, "An estar
submission naming another org's project returns 404".

## The defect

`POST /api/510k/estar/submissions` starts tracking a device filing (510(k), De
Novo, PMA …) and may attach it to a project. `createEstarSubmission`
(`estar-submission-service.ts`) stored the body's `projectId` as given.
`estar_submissions.project_id` is a plain integer with no key, and the service
layer "owns scoping and validation" by the migration's own note, but the
service never checked it.

- A filing could sit on another organization's project spine. The unified work
  view reads `estar_submissions` by `project_id`
  (`unified-work-view.ts:448`), and so does `GET /submissions?projectId=`.
- It could also sit on an id that names no project at all.

## The fix

`createEstarSubmission` asks the one membership check,
`project-membership.ts` `projectBelongsToTenant`, on the same drizzle handle,
before the row or its audit entry is written.

- A project the organization does not hold is `NOT_FOUND`, which the route
  answers 404.
- A lookup that cannot complete throws. The route answers 500, and nothing is
  written.
- A filing tracked before it is attached to a project looks nothing up and is
  recorded unattached, as before.

The export path was already org-scoped (`resolveProjectAnchor` filters by
organization and 404s an unresolved project), so it is unchanged.

## Tests

`server/services/pathway-engines/estar/__tests__/estar-submission-project.test.ts`:

- an owned project is checked and recorded;
- another organization's project and an id naming none are `NOT_FOUND`, with
  no row and no audit entry;
- a lookup failure writes nothing and is not a "not found";
- no project means no lookup.

The check's SQL is proven on PGlite in
`server/services/cmc/__tests__/project-membership.pglite.test.ts`.

## Red, then green

- `01-red.txt`: the service is restored to trunk. **4 of 5 fail.** The
  no-project case passes on both, as it should.
- `02-green.txt`: every suite that reaches the eSTAR service or routes. That is
  the estar service directory, the entitlement and export-governance route
  suites, the governed-export suites and the device 510(k) golden journey:
  **27 files, 478 tests pass.**

## Still open in PF-15

- `module3BuildStateRoutes` and `module3ConvergenceRoutes` read org-scoped
  stores. A foreign project id yields an empty state there, not a leak; the
  router guard would make it an honest 404.
- LX-26, the device filing path, and whether a device filing shows its project
  in Submission Center. Both need the founder decision.
