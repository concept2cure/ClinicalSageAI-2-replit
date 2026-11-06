# F1-E: four listing doors held to the projects the person can open

**Date:** 2026-11-05. **Base:** `11877757f`. **Branch:** `concept2cure-v2`.

## The defect

The founder's rule (2026-11-05): a CRO is one organization working for several sponsors. Each sponsor is a
`client_workspaces` row. A CRO user works "across authorized sponsor projects without mixing sponsor data or
permissions". Four doors read with the organization as their only filter.

1. **`GET /api/mdx/search`** (`server/routes/mdx-search.ts`, mounted at `server/bootstrap/register-inline-routes.ts:1217`).
   - Type `artifact` ran `concept2cure_artifacts WHERE organization_id=$1 AND (title ILIKE $2 OR content ILIKE $2)`.
     It returned the title, CTD section, status and link of a private project's artifact. Because it matched on
     content, it was also an oracle for what a private project holds.
   - Other types read project data the same way:
     - `program`: `regulatory_programs`.
     - `q_sub`: `q_submissions`, through the organization's programs.
     - `labeling`, `risk`, `study` and `udi`: `labeling_documents`, `risk_items`, `clinical_studies` and
       `udi_records`, each by `program_id`.
     - `cdx`: `cdx_pairings`, by `device_program_id`.
     - `thread`: `chat_threads`. It returned colleagues' AnA conversations by title.
2. **`/api/project-sections`** (`server/routes/project-sections.ts`, mounted at
   `server/bootstrap/register-document-routes.ts:213`).
   - Every route that names a project (`project_id` in the query or body) read or changed that project for any
     `project_id` in the organization.
   - Reads returned the project's sections with artifact ids, titles, status, version, open-comment counts and
     artifact counts, and its comments, history, dependencies, milestones and timeline.
   - Writes did the same: comments, status, assignment, deadline, section fields, dependencies, milestones and
     initialization.
   - `PATCH` and `DELETE /milestones/:id` changed any milestone of the organization by its id.
3. **`GET /api/concept2cure/projects/all/artifacts-summary`** (`server/routes/c2c/artifacts.ts`). It counted every
   artifact in the organization by status, a private project's included, with no access check.
4. **MCP `c2c_list_projects`** (`server/mcp/tools/catalog.ts`). It listed every program in the organization
   (`listPrograms`).

## What already exists

The policy, the reference shapes and the test approach all existed. Nothing new was built; each door now calls the
existing policy.

- **Project sharing policy:** `server/services/report-os/project-access.ts`.
  - `getAccessibleReportProjectIds(orgId, actor, q)`: the projects a person can open.
  - `canAccessReportProject(orgId, actor, projectId, q)`: whether a person can open one project.
- **Actor and program scope:** `server/services/c2c/current-program-access.ts`.
  - `readCurrentProgramActor`: the current member and role.
  - `getCurrentAccessibleProgramScope(...).programIds`: the verified accessible programs, for program-keyed tables.
  - `ProgramReadAccessError`: the coded refusal.
- **Fixed reference shapes:**
  - `server/services/ana/AnaToolExecutor.ts`: `global_search` reads through `programReadScope`, with
    `id = ANY($4::uuid[])` and `project_id = ANY($4::int[])`.
  - The sibling route `GET /api/concept2cure/artifacts` (`server/routes/c2c/artifacts.ts`): it uses
    `requireCurrentProjectActor`, `getAccessibleReportProjectIds` and `inArray(projectId, accessible)`.
  - The risk register list (`server/routes/mdx-risk-management.ts:169`): it uses
    `(program_id IS NULL OR program_id = ANY(...))`, so an organization-level record stays visible.
  - The thread list (`server/routes/chat/threads.ts:77-121`): it lists the caller's own conversations
    (`user_id = me`).
- **The MCP Vault tools** (`server/mcp/tools/vault.ts`): they pass `ctx.sqlClient` and
  `{ organizationId, userId }` from `ctx.principal` to services that call `getCurrentAccessibleProgramScope`. They
  refuse with `REQUEST_DB_CONTEXT_REQUIRED` when there is no call connection.
- **Path-param admission:** `projectAdmissionMiddleware` (`server/routes/c2c/project-access.ts:547`). It admits a
  `:projectId` path parameter, with workspace pinning and write roles. Project sections name the project in the query
  or body, not the path, and carry no client workspace, so the middleware does not fit as it stands.
  `canAccessReportProject` was used directly.
- **Test approach:** `server/services/ana/__tests__/ana-vault-tools-project-scope.pglite.test.ts` (PGlite, the real
  sharing policy, no access stubs).
- **Searches run:**
  - Uses of `getAccessibleReportProjectIds`, `canAccessReportProject`, `getCurrentAccessibleProgramScope` and
    `projectAdmissionMiddleware` across `server/`.
  - Schemas in `migrations/` for every search table: `q_submissions`, `chat_threads` (and
    `20261001c_chat_threads_program_key.sql`), `labeling_documents`, `risk_items`, `clinical_studies`, `udi_records`,
    `cdx_pairings`, `ldt_inventory` and `qms_documents`.
  - Every caller and test of `project-sections`, `artifacts-summary`, `mdx-search` and `c2c_list_projects`. The
    client has no caller of `/api/project-sections` or of `artifacts-summary`.

## What changed

- **`server/routes/mdx-search.ts`**
  - A new helper, `readSearchScope`, reads the actor, `getAccessibleReportProjectIds` and
    `getCurrentAccessibleProgramScope`. It runs only when a project type is wanted (`scopeOrRefusal`).
  - Each project type binds the scope: `artifact` to `project_id = ANY($4::int[])`; `program` and `q_sub` to
    `id = ANY($4::uuid[])`.
  - `labeling`, `risk`, `study`, `udi` and `cdx` bind `(program_id IS NULL OR program_id = ANY($4::uuid[]))`, so an
    organization-level record is still found.
  - `thread` binds `user_id = $4 AND (program_id IS NULL OR program_id = ANY($5::uuid[]))`.
  - `audit`, `ldt` and `qms` carry no project and are unchanged.
  - A scope that cannot be read answers `503 PROJECT_ACCESS_UNAVAILABLE`. A caller who is not an identified member
    answers `403 PROJECT_ACTOR_ACCESS_DENIED`. In both cases nothing is searched.
- **`server/routes/project-sections.ts`**
  - `router.use(admitNamedProject)` reads the `project_id` the handler reads, from the query or the body, and admits
    it with `canAccessReportProject`.
  - A project the person cannot open answers `404 {error:'Project not found', code:'PROJECT_NOT_FOUND'}`, the same
    answer as a project id that does not exist.
  - `admitMilestoneProject` admits a milestone's project on `PATCH` and `DELETE /milestones/:id`. A milestone outside
    the scope answers `404 Milestone not found`, as a missing milestone does. `DELETE` of a missing milestone used to
    answer 200; it now answers that 404 too.
  - A check that cannot run answers `503 PROJECT_ACCESS_UNAVAILABLE`.
- **`server/routes/c2c/artifacts.ts`, the `artifacts-summary` route only.** It now uses the gallery's shape:
  `requireCurrentProjectActor`, then `getAccessibleReportProjectIds`, then `inArray(projectId, accessible)`. A failed
  scope read answers `503 PROJECT_ACCESS_UNAVAILABLE`.
- **`server/mcp/tools/catalog.ts`, `c2c_list_projects` only.**
  - It filters `listPrograms`' rows to `getCurrentAccessibleProgramScope(ctx.sqlClient, principal).programIds`.
    `regulatory-programs.service.ts` is untouched.
  - Without a call connection it refuses `REQUEST_DB_CONTEXT_REQUIRED`. A scope that cannot be read refuses with
    its code.
- **Tests**
  - New: `server/routes/__tests__/listing-doors-project-scope.pglite.test.ts`. It has 28 tests in four `describe`
    blocks, one per door, run on PGlite with the real policy.
  - Two existing harnesses answered every query with one canned row, so the policy could not read a membership.
    They now script the policy's own reads:
    - `server/routes/__tests__/audit-second-doors.test.ts`: the membership row.
    - `tests/mdx-qms-labeling-search-analytics-routes.test.ts`, in the Global search block only: one open project.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The new suite on the four source files at `HEAD`: **23 failed, 5 passed** (28). The five passes are the controls: the owner sees their private project, and the open project lists. |
| `02-green.txt` | The same suite with the change: **28 passed** (28). |
| `03-suites-light.txt` | The existing suites that cover these files: 34 files, **555 passed**. They are `audit-second-doors`, `mdx-qms-labeling-search-analytics-routes`, `c2c-router.parity`, all of `server/mcp/__tests__` (non-db), the smoke suite, `tests/routes/concept2cure`, the artifact route, status and bundle suites, `launch-reproof-narrowing` and others. |
| `03-suites-pglite.txt` | The PGlite suites that mount the artifacts router: `project-write-gates`, `artifact-approval-ceremony` and `artifact-approval-follows-status`. Final run with the change: **3 files, 738 passed**. |

**Gates**

- **`npm run -s ci:sql-interpolation`:** none of these files is reported. `project-sections.ts` stays at its
  baseline of 5, and the others at 0. The gate exits 1 on one file, `server/services/enhancedEmbeddingService.ts`
  ("now 8 (baseline 9)"). That file belongs to another lane.
- **`node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD`:** exit 0, "no file changed its warning count
  since HEAD".

  | File | Warnings before | Warnings after |
  |---|---|---|
  | `catalog.ts` | 0 | 0 |
  | `mdx-search.ts` | 2 | 2 |
  | `project-sections.ts` | 9 | 9 |
  | `artifacts.ts` | 23 | 23 |
  | The new test and the two edited harnesses | 0 | 0 |

  The search handler's existing complexity warning went from 20 to 21, and its length from 218 to 221 lines. It
  was already over both limits.

## Not done here

- **Sponsor narrowing (condition 2).** None of the four doors takes an open project: the search overlay is global,
  the summary is `projects/all`, MCP calls carry no project, and project sections name one explicit project. So
  `narrowToSponsorOf` does not apply. If a client later passes an open project to the search, it should narrow then.
- **The edit right on project-section writes.** A write now requires that the person can open the project.
  Whether they may *edit* it (`canAccessReportProject(..., { forWrite: true })`, `GOVERNED_WRITE_ROLES`) is not
  imposed. That is a D6 write-gate decision: on an `org_public` project, a member who is not on its team would lose
  writes they have today.
- **Project notifications** (`/notifications`) are per user and were not changed.
- **`chat_threads` rows with only the legacy integer `project_id`** and no `program_id` are found by their owner as
  before. They are the owner's own conversations.
- **Not run (no PostgreSQL in this session):** `tests/db/actor-displays.dbtest.ts`, which uses project sections and
  whose project is created by the caller, so it should still be admitted, and `server/mcp/__tests__/mcp-connector.dbtest.ts`,
  which seeds an anchored project for each program, so `c2c_list_projects` should still list it.
- **Not run:** `tsc` (the lead runs it) and the running app.
