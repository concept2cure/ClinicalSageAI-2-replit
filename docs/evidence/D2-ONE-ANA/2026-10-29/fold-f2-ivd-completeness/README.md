# Fold F2, product slice: the IVDR readiness board in device-diagnostics

Launch row D2, workstream "one AnA, one project". Date 2026-10-29. Working tree over `01a8811ec`. The red runs were taken over `de88cea25` and `be1181958`; the files this slice touches are the same at all three. The plan is
`docs/design/DEVICE_FOLDS_2026-10-29.md`, section F2, "Work" items 1 to 4.

**Status: done for items 1 to 4.**

- The completeness route reads only the open project, after `admitProject`.
- device-diagnostics draws the family board as its readiness panel and mounts the IVD assessment workbench.
- The workbench's store is on the deploy set.
- Both workbench lists admit the project.

Item 5, the fold itself (alias, launch scope, registry, catalogue), is the next slice. See "What the fold slice needs".

## What already exists

Re-verified at head before any change.

| Piece | Path | What it did | What it did not do |
|---|---|---|---|
| Old screen | `client/src/concept2cure/v2/surfaces/IvdCompleteness.tsx` (`ivd-completeness`, `surfaceViews.ts:490`) | Read `GET /api/ivd-completeness/completeness` and drew the seven-family board, the stat tiles and the AnA context. Mounted `IvdAssessmentWorkbench`. | It sent no project. Under an open project it showed the organization's board, headed "Organization-wide". |
| Route | `server/routes/ivd-completeness-routes.ts`, mounted `/api/ivd-completeness` behind `authenticateToken, requireTenantContext` (`server/bootstrap/register-regulatory-routes.ts:380`) | Read `ivdr_classifications`, `ivdr_per_documents`, `ivd_analytical_performance` and `ivd_clinical_performance` by organization (`:177-220`), and GSPR from `ivdr_gspr_assessments` (`:246-252`). | It ignored `program_id`, although each of the four tables has one. GSPR was `WHERE organization_id = $1 ... LIMIT 1`: the organization's newest checklist, whichever project it was for. A missing table was meant to be tolerated (42P01), but drizzle 0.45 puts the SQLSTATE on `.cause`, so the check never matched: a missing store answered 500, and the all-missing 503 could not be reached. A failed GSPR read became "not started". |
| GSPR store | `ivdr_gspr_assessments`, created by `migrations/20260813c_ivdr_schema_reconciliation.sql:158` | `project_id TEXT NOT NULL`. The writer (`server/routes/ivdr-routes.ts:1095`, `POST /gspr-checklist`) stores the project id as sent, and refuses a second checklist for a project (409). | It is not a uuid column. |
| Target screen | `client/src/concept2cure/mdx/surfaces/IvdSurface.tsx` (`device-diagnostics`) | Per-project panels: classification, analytical, clinical 2x2, GSPR matrix, CDx, CLIA, the eSTAR panels. | No completeness or PER panel, no workbench. |
| Workbench | `client/src/concept2cure/v2/surfaces/IvdAssessmentWorkbench.tsx` | Governed Annex VIII save and FSN draft, lists of saved records, working copy into Authoring. Project-scoped, from the shell's open project. | It took no program from its host. |
| Workbench routes | `server/routes/ivd-assessments.ts`, `/api/ivd-assessments` | Saves go through `governedIvdWrite`, which checks the project. | `GET /` and `GET /documents` filtered by any `program_id` sent and never asked who owns it. |
| Workbench store | `migrations/20260610_ivd_assessments.sql` | `ivd_assessments`, `ivd_generated_documents`. | On no deploy applier. It was in `scripts/ci/migration-deploy-path-baseline.json`. |
| Ownership answer | `server/lib/admit-project.ts` over `programInOrganization` (`server/services/c2c/program-access.ts:192`) | 404 "Project not found", 503 when the check cannot run. Used by `human-factors.ts`, `mdx-udi.ts`, `mdx-labeling.ts`, `mdx-engineering.ts`. | — |
| Board styles | `client/src/concept2cure/v2/styles/coverage-v2.css:1276-1331` (`.c2c-v2 .ivd-*`), loaded by `V2App.tsx:90` | The board's classes. MdxSurfaceHost renders inside `.c2c-v2`. | — |
| Parity | `.design/client-journey/FUNCTION_PARITY.md:736-751` | Where each part of the old screen goes. | — |

Searches run:

- `ivd-completeness`, `IvdCompleteness`, `/api/ivd-completeness`, `IvdAssessmentWorkbench`, `/api/ivd-assessments`,
  `ivd_assessments`, `ivd_generated_documents`, `ivdr_gspr_assessments` and `admitProject` across `server`, `client/src`,
  `shared`, `scripts`, `tests`, `migrations` and `db/migrations`.
- `git log --all --diff-filter=D` over `*ivd*`, `*Ivd*`, `*IVD*`, `*IvdReadiness*` and `*ivd_assessments*`. Nothing.

There is one board, one route and one store. Nothing was rebuilt. The board was moved out of the old screen into a
component both screens mount. The route, the lists and the workbench were each completed.

## The migration check (CLAUDE.md Rule 1)

`migrations/20260610_ivd_assessments.sql`, unchanged, now on `C2C_MIGRATION_FILES` after `20261029c` and before
`UUID_TENANT_ISOLATION_NONPUBLIC`.

- Every statement is `CREATE TABLE IF NOT EXISTS` or `CREATE INDEX IF NOT EXISTS`: 8 statements.
- There is no DROP, ALTER, ADD CONSTRAINT, UPDATE or DELETE. No other file in `migrations/` or `db/migrations/` names
  either table, so no later file redefines anything.
- Both tables are in `public` with `organization_id integer NOT NULL REFERENCES organizations(id)`. The integer sweep
  at the tail enables and forces RLS and adds `tenant_isolation_policy` to both.
- The one prerequisite is `organizations` (base schema). `gen_random_uuid()` is core PostgreSQL.

No amendment was needed, so the file carries no new header note.

Proof: `tests/schema-contract/ivd-assessments-deploy-set.pglite.test.ts`. It applies the file, saves a record, then
applies the file and the sweep three times. The shape is unchanged, the record survives, and both tables are policed.

Gates: `ci:migration-set-order` OK (436), `ci:migration-deploy-path` OK (104 baselined, one fewer),
`ci:migration-deploy-path:selftest` OK, `ci:migration-drop-safety` OK. The sweep contract
(`tenant-isolation-sweep.contract.test.ts`, 20) and `uuid-tenant-isolation`, `deploy-migration-mechanism`,
`reachability-debt-cleared`, `column-reachability-guard`, `check-constraint-replay` and
`phase11-e2e-migration-hardening` pass.

## What changed

Route, `server/routes/ivd-completeness-routes.ts`:

- With `?program_id=` it runs `admitProject` before any read. A foreign, missing, deleted or malformed project gets 404;
  two ids get 404; a check that cannot run gets 503. No IVD table is read in any of these cases.
- All five reads filter by the project. The four uuid columns use `program_id = $p`.
- GSPR keys on `project_id TEXT`. It is compared as text: `lower(project_id) = $p::uuid::text`. `::uuid::text` is the
  lower-case, hyphenated form of the admitted uuid. The column is never cast, because a legacy value that is not a uuid
  would raise 22P02 and fail the read for every project. The test stores the project's checklist in capitals and a
  legacy `legacy-project-7` row beside it.
- The response says `scope: 'program'` and `programId`. With no project it reads the organization as before and says
  `scope: 'organization'`.
- A store that cannot be read is listed in `unread`. Its families have `pct: null` and no items, `overall` is null, and
  `summary.unread` counts them. A failed GSPR read is now unread, not "not started". The SQLSTATE is read through
  drizzle's `.cause`.
- The handler is split into helpers, which clears its three eslint warnings.

Lists, `server/routes/ivd-assessments.ts`: `GET /` and `GET /documents` run `admitProject` on the `program_id` they
filter by. With no project they list the organization, as before.

Board, new `client/src/concept2cure/v2/surfaces/IvdReadinessBoard.tsx`, moved from `IvdCompleteness.tsx`:

- `useIvdReadiness(programId)` reads the board with the project's id.
- The board is drawn only when the response's scope and `programId` match what was asked for.
- A 404 says the project was not found in the organization. A 403 or 503 says the read was refused. Any other failure
  says it could not be read. None of these draws the board or an empty state, and each has a retry.
- An unread family shows "Not read", with no percentage and no overall figure.
- The flags tile is dropped (`FUNCTION_PARITY.md:740`). Nothing stores a flag, so it only ever read 0. The fourth tile
  counts the families not read.
- `ivdReadinessContext` builds the AnA context from the same view.

Old screen, `IvdCompleteness.tsx`: it mounts the board with the shell's open project, or the organization when none is
open. It still publishes `ivd-completeness` to AnA, from `ivdReadinessContext`. It holds none of the board's markup.

Target, `IvdSurface.tsx`: an "IVDR readiness · technical file" panel draws the board for `program.id`, and
`IvdAssessmentWorkbench` is mounted with `programId={program.id}`. An optional `onNav` prop is passed to the workbench.

Workbench: an optional `programId` input. When it is left out, the workbench uses the shell's open project as before.

Tests changed:

- `ivd-completeness-denominator.test.ts`: the fake request gains `query: {}`, which Express always provides.
- `bla-ivd-request-readers.test.ts`: the pool now answers only the ownership statement. The reads are still asserted to
  run on the pinned client.
- `server/middleware/__tests__/launch-scope-device-features.test.ts`: `HOOKS` now reads the call from
  `IvdReadinessBoard.tsx` for `ivd-completeness`, and for `device-diagnostics` too.

## Red, then green

At head (red files, trimmed):

- `red-completeness-route.txt`: 12 of 12 fail. Under project A the board was headed "Sibling assay" and listed the
  organization's and the sibling's studies. GSPR was the sibling's 100%. Another organization's project answered 200
  with the caller's organization's board. A failed GSPR read answered 500.
- `red-ivd-assessments-list-admits-the-project.txt`: 12 of 14 fail. Foreign, missing, deleted and malformed projects
  were listed (200), and no ownership check was made.
- `red-IvdSurface.readiness.txt`: 9 of 9 fail. IvdSurface has no readiness board and no workbench.
- `red-ivdCompletenessOneBoard.txt`: with a project open, the old screen read `/api/ivd-completeness/completeness`
  without `program_id`.
- `red-migration-set.txt`: the file is on no applier and is still baselined. The replay cases pass already.

After: `green-*.txt`, all pass. Route 12/12, lists 14/14, IvdSurface 9/9, old screen 3/3, migration 8/8.

## Mutations

Each mutation was applied to the real file, the test was run, and the file was restored from a saved copy. The sha256
of each file was checked after every restore. Logs: `mutations-route.txt`, `mutations-lists-and-board.txt`.

| # | Mutation | Turned red |
|---|---|---|
| M1 | The completeness route drops `admitProject` | 6: the four refusals, two ids, check unavailable |
| M2 | The classifications read drops the program filter | 2: project-only families, empty project |
| M3 | Every store also returns the organization's unscoped rows under a project | 2: same |
| M4 | GSPR loses its project clause (organization's newest) | 2: GSPR is this project's, empty project |
| M5 | GSPR compares `project_id` without `lower()` | 2: the capitalised checklist is missed |
| M6 | The assessments list drops `admitProject` | 6 |
| M7 | The documents list drops `admitProject` | 6 |
| M8 | The board draws a response whatever scope it says | 2: organization response, other project |
| M9 | The board reads without `program_id` | 1 |
| M10 | An unread family is drawn as 0% | 1, after tightening the test. The first run survived, because the "Not read" tile matched. The test now reads the family's own row. |
| M11 | The old screen carries a copy of the board's markup | 1: one board, two mounts |

## Kept green

These pass one file at a time:

- IVD and IVDR suites: `ivd-completeness-denominator`, `ivd-assessments.error-envelope`, `bla-ivd-request-readers`,
  `deferred-assessment-governance.pglite`, `ivd-assessments` (service), `deferredAssessmentWorkbenches` and the four
  `IvdSurface.*` tests.
- mdx suites: `MdxSurfaceHost`, `k510IvdVariant`, `noFavourableDefaults`, `tests/mdx-ivd-diagnostic-routes`,
  `mdx-ivdr.ownership`, `ivdr-program-scoping`, `tests/rls-scoped-route-mounts.contract`.
- Others: `ProjectMdxWorkflow`, `workflowAudit` (120), `design-system-surfaces-smoke`, `launch-scope-device-features`.

Gates: `ci:program-ownership-single-source`, `ci:sql-interpolation`, `ci:undefined-css-classes`,
`ci:check-css-selector-shadowing`, `ci:check-shell-css-collisions`, `ci:tenant-resolvers`, `ci:tenant-isolation`,
`ci:launch-scope`, `ci:launch-scope-api` and `ci:ana-surface-context` (112, unchanged) all pass.

eslint: the touched product files go from 6 warnings to 0. The rest are ignore-pattern notices for `mdx/` and the
migration set. tsc, scoped to the touched files: no error in any of them.

## Not done

- The fold itself (item 5) is the next slice.
- `ivdr-routes.ts` reads its GSPR checklist with `project_id = $1` (exact text). A checklist written in another case
  is not found there. That is outside this slice's files.
- The organization scope still takes GSPR as the organization's newest checklist. It is unchanged, as with every
  folded route's no-project branch, and it goes when the old screen does.
- `ivd_assessments.program_id` has no same-organization key. Writes check ownership in `governedIvdWrite`. A NOT VALID
  composite key, as `20261029_hf_engineering_files_program_key.sql` adds, would hold every other writer to the same rule.
- The workbench's Annex VIII save writes `ivd_assessments`, while the board's classification family reads
  `ivdr_classifications`. A saved classification does not yet count on the board.
- `namedProgram` in the completeness route repeats `human-factors.ts:93`. It is three lines and not exported there.
  `admit-project.ts` is the natural home.

## What the fold slice needs

- `MdxSurfaceHost.tsx`: pass `onNav` to `IvdSurface`. Without it, the workbench's "Create working copy for review and
  signing" is disabled in device-diagnostics.
- AnA context: device-diagnostics publishes the host's context only. Before `ivd-completeness` and its publish call are
  removed, publish `ivdReadinessContext(...)` for the readiness panel, or `ID_BASELINE` drops by one with nothing in
  its place.
- Registry: move `/api/ivd-completeness`, `/api/ivd-assessments` and `/api/ivd-lifecycle` from `ivd-completeness`'s
  `apiPrefixes` onto device-diagnostics, and drop the `ivd-completeness` HOOKS entry.
- Delete `IvdCompleteness.tsx` and `ivdCompletenessOneBoard.test.tsx`'s old-screen cases. The board, the workbench and
  their tests stay.
- The rest of the common checklist: alias to `device-diagnostics`, launch-scope, `mdx-project-features`, the catalogue
  rows (Rule 1, amended in place), the tours, and the CI baselines. The grant mapping is founder decision 4.
