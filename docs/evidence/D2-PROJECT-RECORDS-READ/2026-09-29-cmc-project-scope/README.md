# PF-15, first slice (D7 for D2): CMC Module 3 writes only under a project of the caller's organization

Plan: `docs/design/PROJECT_FIRST_PLAN_2026-09-26.md` §PF-15. This slice closes
producers MISSED-1 ("POST /api/cmc-changes is served in production and writes
unchecked keys") and the same defect across the Module 3 operating-system routes.

## The defect

CMC Module 3 keys its stores (`cmc_source_objects`, the compiled
`cmc_module3_sections`, lineage, contradictions, placements) on the shell's
project id as TEXT. That is a `regulatory_programs` UUID for a v2 project, or a
legacy numeric `projects.id`. The writers took that id from the request and
never asked whose it was.

- **`/api/cmc/module3-os/*/:projectId`** (15 routes: source objects, compile,
  source-changed, contradictions, readiness, section read, provenance, approve,
  refresh, final-export guard, place-into-submission). Each checked only that
  an organization was in context. So an organization's Module 3 sources,
  compiled sections, approvals and placements could be filed under another
  organization's project, or under an id that names no project at all.
- **`POST /api/cmc-changes`**. The change is org-scoped, but the write-through
  files its §3.2 source object under the body's `cmcProjectId`, unchecked.

## The fix

- **One answer for both id-spaces:** `server/services/cmc/cmc-project-access.ts`
  `cmcProjectInOrganization(db, organizationId, projectId)`.
  - A UUID is checked by `programInOrganization`, the canonical check: a live
    program of this organization.
  - A numeric id must be a `projects` row of this organization.
  - Anything else is refused.
  - A lookup that cannot complete throws. "Could not tell" is not "not yours".
- **Module 3 routes:** one `router.param('projectId', …)` guards every route
  that names a project.
  - Another organization's project, a deleted one and a malformed id get 404
    `PROJECT_NOT_FOUND` before the handler runs.
  - A failed lookup is a 500.
  - With no organization in context, the handler's own refusal stands.
- **`POST /api/cmc-changes`:** a stated `cmcProjectId` that is not the
  organization's is 404 before anything is written: no change, no audit row, no
  source object. With no project stated, the change is still recorded org-wide
  and reports `skipped_no_project`, as before.

## Tests

- `server/services/cmc/__tests__/cmc-project-access.pglite.test.ts`: the
  helper on real SQL (PGlite), 14 cases.
  - Two organizations.
  - A live, a deleted and a foreign program.
  - An owned and a foreign numeric project.
  - Zero, malformed, empty, non-string and past-the-safe-range ids.
  - The same ids seen from the other organization.
  - A lookup that throws.
- `server/api/cmc/__tests__/module3ProjectScope.test.ts`: eleven routes, writes
  and reads, answer 404 for a foreign project and issue **no query at all**.
  - The organization asked about is the caller's.
  - A lookup failure is a 500.
  - With no organization in context, no project is looked up and the handler's
    own refusal stands.
  - `module3OperatingSystemRoutes.test.ts` admits its fixture project through
    the same mock and is otherwise unchanged.
- `server/routes/__tests__/cmc-changes-read.test.ts`: a foreign project and an
  id naming none are 404. `createCmcChange`, the audit `logAction` and
  `writeThroughChangeControl` are not called. A lookup failure writes nothing.

## Red, then green

- `01-red-guards-removed.txt`: both route files are restored to trunk, and the
  new cases run against them. **16 fail**:
  - the 11 Module 3 refusals, its own-organization case and its lookup-failure
    case;
  - the 2 cmc-changes refusals and its lookup-failure case.
  The no-organization case passes on trunk as well, as it should: it pins that
  the guard changes nothing there.
- `02-green.txt`: every suite under `server/api/cmc/__tests__`,
  `server/services/cmc/__tests__` and the cmc-changes suite. **46 files, 472
  tests pass.**

## Still open in PF-15

- `module3BuildStateRoutes.ts`, `module3AutoDraftRoutes.ts`,
  `module3ConvergenceRoutes.ts`, `projectRoutes.ts` and `server/api/cmc/routes.ts`
  also take `:projectId`. They are next.
- The interview commit's `projectRef` (MISSED-2).
- `estar_submissions` and the eSTAR export.
- LX-26, the device filing path, which needs a founder decision.
