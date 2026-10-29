# D6: the program-twin router checks project access before it reads or writes CMC data

**Row:** D6 (tenant isolation). **Date:** 2026-10-29. **Session:** `session_01T2wooCZu46W7msw4TJuuzr`.

## The finding

**Did cross-tenant access work at head? Yes, wherever RLS was not filtering. In production, RLS alone stopped it.**

- **Another organization's project.** `GET` and `PUT /api/concept2cure/projects/:projectId/cmc` and `GET …/context` read and wrote `projects` by integer id only. There was no organization predicate and no project-access check, and the write had no role gate.
  - Under `RLS_ENFORCE` unset or `off` (the default in every environment that is not production), org A read org B's CMC data, project and tasks, and overwrote org B's CMC record.
  - Under `RLS_ENFORCE=on` (production refuses to boot without it), the FORCEd `tenant_isolation_policy` hid the row. The handlers answered 404 and the UPDATE matched nothing. RLS was the only layer that held.
- **Inside one organization, RLS cannot help, so production was affected too.**
  - A member who is not on a private project read and wrote its CMC data and read its context.
  - A viewer wrote CMC data.
  - A member without edit permission wrote it.
  - An archived project accepted writes.
- **Who calls these routes.** No client screen and no AnA tool calls them today. The searches are listed below. They are still served in production:
  - their launch-scope verdict is `launch` (claimed by `project-home` and `conversation-thread`);
  - `MODULE_ENFORCEMENT` defaults to `off`;
  - authentication is the only thing in front of them.

## What already exists

| What | Where | What it does / why it was or was not used |
|---|---|---|
| `requireProjectAdmission`, `projectAdmissionMiddleware` | `server/routes/c2c/project-access.ts` | **The canonical check, and the one used here.** It reads the caller's current membership (`readCsrProjectActor`, not the token's role), finds the project by id, organization and workspace (`loadProjectAccessRow`), and applies the sharing policy (`canUseProject`). For a write it also checks `GOVERNED_WRITE_ROLES` and `canEditProject`, and refuses an archived project. It answers 404, 403, 409 or 503. Sibling routers mount it with `router.param('projectId', projectAdmissionMiddleware())`: `conversations.ts:46`, `exports.ts:66`, `knowledge-sources.ts:59` and `project-knowledge.ts:49` (and `communication-center.ts:197`). |
| `verifyProjectAccess` | same file | The boolean form of the same row check. At head, program-twin's other four handlers (program-twin, verification, change-impact, transform-context) already called it, which is why they answered 404 across tenants. The three CMC/context handlers did not. |
| `projectRecordAdmission` | `server/routes/concept2cure.ts:100` | The main router's private wrapper over `requireProjectAdmission`. It is not exported, and `projectAdmissionMiddleware` is its exported equivalent. |
| `authorizedProjectId`, `loadProjectArtifact` | `server/routes/c2c/artifact-project-scope.ts` | They resolve the CMC artifact spine, then call `verifyProjectAccess`. They are artifact-scoped, not the shape these routes need. |
| `installProjectRouteAccess`, `requireProjectRouteAccess` | `server/routes/c2c/project-route-access.ts` | Admission for routes whose `:id` is the regulatory-program **uuid** (the Projects and Vault routers). Not applicable here, because every route in this file takes the integer project id. |
| `programInOrganization` | `server/services/c2c/program-access.ts` | Ownership of a uuid program (`ci:program-ownership-single-source`). Not applicable, for the same reason. |
| The same defect on the tasks router | `server/routes/c2c/__tests__/tasks-tenant-scope.test.ts` | Fixed earlier. It records that the static SQL gate cannot see Drizzle query-builder calls, which is why this route was not caught. |
| `ci:drizzle-tenant-scope` and its baseline | `scripts/ci/check-drizzle-tenant-scope.mjs`, `scripts/ci/drizzle-tenant-scope-baseline.json:38-45` | It **had** program-twin's 8 unscoped Drizzle sites on its baseline, as known debt. It now reports exactly those 8 as fixed. |
| The CMC / Module 3 register | `server/api/cmc/routes.ts` | The product's CMC store. The project-metadata CMC fields these routes read and write (`metadata.cmcDrugSubstance` …) are a separate store. Their only other reader is `server/routes/c2c/tasks.ts:604` (next-action hints). Not consolidated here; see Not done. |

**Searches run:**
- callers of `/cmc`, `/context`, `program-twin`, `transform-context`, `change-impact` and `verification` under `client/src`, `server/services` and `shared`: none for these routes;
- readers of `cmcDrugSubstance`: `tasks.ts:604` only;
- `git log --all --diff-filter=D -- '*program-twin*' '*cmc-twin*'`: nothing deleted.

## What was established by running it

1. **Mount.**
   - `server/bootstrap/register-concept2cure-routes.ts:39` mounts the router: `app.use('/api/concept2cure', authenticateToken, programTwinRoutes)`.
   - The router's own chain runs the rate limiter, then `authMiddleware`, `tenantContextMiddleware` and `requireOrganizationContext`.
   - `launchScopeApiVerdict` was run for the four paths, and every one is `launch`.
2. **Database client.**
   - `db` from `server/db` is Drizzle over the shared runtime pool (`server/db/runtime.ts:119`). The pool is wrapped by `instrumentPool` (`server/db/poolInstrumentation.ts`).
   - Under `RLS_ENFORCE=on`, each statement runs in a micro-transaction. That transaction sets `app.current_tenant_id` to the caller's organization, taken from the scope that `establishRequestTenantScope` opens, and pins `app.rls_enforce='on'`.
   - Under any other value, no tenant variable is set, and the policy's leading clause passes every row.
3. **The real PostgreSQL** (16.15, the dev database provisioned by the deploy set). The results are in `demo-real-postgres.txt`.
   - `projects` and `project_tasks` have RLS enabled and FORCEd, and carry one `tenant_isolation_policy`.
   - Their owner is the runtime role `c2c`, which is neither superuser nor BYPASSRLS. FORCE is what subjects that owner to the policy.
   - Running the head handlers' own statements in org A's scope, in one rolled-back transaction:
     - with enforcement on: the select returned 0 rows and the update changed 0;
     - with it off: the select returned org B's row and the update changed it.
   - Production boot also asserts `RLS_ENFORCE=on` and the catalog posture (`server/index.ts:162-171`).
4. **Through the route itself, on PGlite:** `red.txt`. The harness is described under Tests.

**At head**, org A calling the head router (from `red.txt`):

| Caller → project | Route | `RLS_ENFORCE=off` | `RLS_ENFORCE=on` |
|---|---|---|---|
| org A → org B's 501 | `GET …/cmc` | **200**, `{"drugSubstance":{"substanceName":"Org B confidential API"},…}` | 404 (RLS hid the row) |
| org A → org B's 501 | `PUT …/cmc` | **200**; org B's `cmcDrugSubstance` becomes `"written by org A"` | 404; nothing written |
| org A → org B's 501 | `GET …/context` | **200**, org B's project name and `"Org B confidential task"` | 404 |
| org A → org B's 501 | program-twin, change-impact, transform-context, verification | 404 (`verifyProjectAccess`) | 404 |
| A member not on private 402 | `GET …/cmc`, `GET …/context` | | **200** with its data |
| A member not on private 402 | `PUT …/cmc` | | **200**, written |
| A viewer → 401 | `PUT …/cmc` | | **200**, written |
| A member without edit permission → 401 | `PUT …/cmc` | | **200**, written |
| A owner → archived 403 | `PUT …/cmc` | | **200**, written |
| membership read fails | `GET …/cmc` | | 200 (no check ran) |
| project read fails | `GET …/cmc` | | 500 |

## What changed (`server/routes/c2c/program-twin.ts`)

- **Line 47:** `router.param('projectId', projectAdmissionMiddleware())`, the check the sibling routers use. All seven routes in the file take `:projectId`, and none runs before the project is admitted. The answers are:
  - **404** `PROJECT_NOT_FOUND` for a missing project or another organization's;
  - **403** `PROJECT_WRITE_PERMISSION_DENIED` or `PROJECT_MEMBERSHIP_REQUIRED` when the caller's current role or project permission cannot change it;
  - **409** `PROJECT_ARCHIVED` for a write to an archived project;
  - **503** `PROJECT_ACCESS_UNAVAILABLE` when the check could not run.
- **`organizationProject(projectId, organizationId)` (line 674):** the project read by id **and** `organization_id`. `GET` and `PUT …/cmc` and `GET …/context` use it.
- **`PUT …/cmc`:** the UPDATE carries `organization_id` and `returning`. If it updates zero rows, the route answers 404.
- **`GET …/context`:** the `project_tasks` read carries `organization_id`.
- **`GET …/program-twin` and `…/verification`:** the `concept2cure_signatures` and `concept2cure_review_comments` reads carry `organization_id` (NOT NULL on both tables).
- **Kept:** the four existing `verifyProjectAccess` calls stay. Each sibling router keeps its own beside its `router.param` in the same way.

## Tests: red, green, mutations

The test is `server/routes/c2c/__tests__/program-twin-project-access.pglite.test.ts`, 30 tests.

**Harness: what is real**
- **Database:** PGlite, a real PostgreSQL.
- **Tables:** created by `drizzle-kit` from `shared/schema`, which is what `drizzle-kit push` does as the deploy's first step.
- **Policies:** from the migration set's own tenant isolation sweep (`TENANT_ISOLATION_SWEEP`, the set's last file), read from disk.
- **Runtime role:** a NOSUPERUSER NOBYPASSRLS role that owns the tables, as on the dev database.
- **Pool and driver:** `instrumentPool`, the production primitive, and the same node-postgres Drizzle driver `runtime.ts` builds.
- **Tenant scope:** opened by the real `establishRequestTenantScope`.

**Harness: what is stubbed**
- authentication, the rate limiter and the tenant-context middleware are pass-throughs;
- the request carries the identity a verified session would.

**Results**
- **`red.txt`:** head's `program-twin.ts` (`git show HEAD:…`) with the new test. **16 failed, 14 passed.**
  - The 14 that pass are:
    - the posture and negative-control tests;
    - every `RLS_ENFORCE=on` cross-tenant case, where RLS held;
    - the four routes that already called `verifyProjectAccess`;
    - the owner's read and write.
  - The failures show what was supplied and what was written: the cross-tenant body, the overwritten record, and the private project's data.
- **`green.txt`:** **30 of 30** with the fix, plus `c2c-router.parity.test.ts` (14 of 14), 44 in total.
- **`mutations.txt`:** each mutation applied alone to the fixed file and then reverted. **7 of 7 turned the suite red.**

| # | Mutation | Red |
|---|---|---|
| M1 | drop the access check (the `router.param` line) | 7: the private-project read and write, the viewer, the member without edit permission, archived, both 503 cases |
| M2 | drop the organization predicate on the project read | 3: the predicate tests for `GET` and `PUT …/cmc` and `GET …/context` |
| M3 | drop it on the CMC UPDATE | 1: `PUT …/cmc` predicate |
| M4 | drop it on the context's `project_tasks` read | 2: the context predicate test, and the mis-keyed foreign task appearing in context |
| M5 | drop the role gate (admission with `forWrite: false`) | 3: viewer, member without edit permission, archived |
| M6 | drop it on program-twin's signature read | 1 |
| M7 | drop it on verification's review-comment read | 1 |

The negative control is `is the layer that decides at head`. It shows that the fixture's policy really filters:
- with enforcement on, org A sees 0 of org B's rows;
- with it off, org A sees 1.

So the `RLS_ENFORCE=on` cases pass because the database hid the row, not because the fixture saw nothing.

## Gates (`gates.txt`)

| Gate | Result |
|---|---|
| `npm run ci:sql-interpolation` | OK, no new interpolation |
| `npm run ci:program-ownership-single-source` | OK |
| `npm run ci:tenant-isolation:no-regression` | OK, 0 current findings, 0 baseline |
| `npm run ci:tenant-entry-points` | OK, 13 entry points, none unclassified |
| `npm run ci:drizzle-tenant-scope` | OK. "8 fixed since the baseline was written": exactly program-twin's 8 baselined sites. `--list` shows no program-twin site now. |

These were also checked on the two changed files:
- **Scoped `tsc`:** no error in either file. The only errors it reports are missing-declaration errors (TS7016) in files this change does not touch: `shared.ts` (`metrics.js`), `token-revocation.ts` and `jwtVerify.ts` (`jsonwebtoken`).
- **`npx eslint --no-ignore` on both files:** 0 errors and 7 warnings, the same 7 complexity and length warnings head has.

## Not done

- **The drizzle-tenant-scope baseline still lists the 8 sites this change fixed.** `npm run ci:drizzle-tenant-scope:write-baseline` would bank them. That is a `scripts/ci` file outside this change, so it is left to main.
- **Whether the project-metadata CMC store should exist at all.** It sits beside the CMC / Module 3 register (`server/api/cmc`), has no client or AnA caller, and is read only by `tasks.ts:604`. That is a Rule 3 question about convergence, for main or the founder. This change made the existing routes safe; it did not converge or delete them.
- **No route-level run on a real PostgreSQL server.** The `*.dbtest.ts` lane needs a disposable database and `APP_DATABASE_URL`, and inserts rows it keeps. Instead:
  - the database's behaviour on these statements is shown on real PostgreSQL 16 in a rolled-back transaction;
  - the route-level proof runs on PGlite with the production pool primitive.
