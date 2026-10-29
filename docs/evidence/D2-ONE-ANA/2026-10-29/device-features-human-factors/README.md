# Device features reach the project: human factors

Launch row D2, workstream "one AnA, one project". Date 2026-10-29. Working tree over `ceea6843`. The files this slice
touches are the same at `bbe7971e`, where the baseline was taken.

**Status: done for human-factors.** The screen reads the open project's usability engineering file, and Plan opens it.
Before that, the routes were fixed: they refuse a project the caller's organization does not own.

`9cf764e5` mapped the device project features. `ca88fa26` reached Pre-Sub, UDI and labeling. Human factors was the
fourth one placed in the project, and it was left because `hf_engineering_files` had no project column. This slice
adds the column, scopes the routes, sends the open project from the screen, and gives Plan the door. It also adds
"Start the usability file" (IA slice 19), which the lead approved on 2026-10-29. Without it the door would open an
empty screen with no next step.

## What already exists

Re-verified at head before any change.

| Piece | Path | What it did | What it did not do |
|---|---|---|---|
| The table | `hf_engineering_files`, created by `db/migrations/20260801_hf_files_store.sql`, on `C2C_MIGRATION_FILES` | One IEC 62366-1 HFE/UE file per row: device, framework, element map `present`, soft delete. `organization_id INTEGER NOT NULL`. The `CREATE TABLE` is unqualified, so it is in `public`. Index `(organization_id, created_at DESC) WHERE deleted_at IS NULL`. No keys. | No project column. |
| Use scenarios | `c2c_hf_scenarios`, `db/migrations/20260717_human_factors_store.sql` | Hazard-related use scenarios, keyed to a file by `file_id`. `organization_id INTEGER NOT NULL`, public. | Not changed here. A scenario belongs to a file, and the file now belongs to a project. |
| Retired blob | `c2c_hf_files`, same migration | Superseded. No route reads it. | — |
| File service | `server/services/human-factors/hf-files-service.ts` | `createHfFile`, `listHfFiles` (newest first), `getHfFile`, `setHfFileElements`, `deleteHfFile`. These were the only INSERT and SELECT on the table. | It took no project. |
| Routes | `server/routes/human-factors.ts`, mounted at `/api/human-factors` (`server/bootstrap/register-advanced-platform-routes.ts:137`, behind `authenticateToken`) | `GET /`: the organization's newest file, plus its scenarios. `POST /`: create a file, audited `HF_FILE_RECORDED`. `POST /scenarios`: attach to the organization's oldest file (route SQL), with no audit row. `PATCH /scenarios/:id/mitigate`: by scenario id in the organization, with a reason, audited. `PATCH /elements`: the newest file, audited. `POST /hfe-completeness` and `/use-related-risk`: pure computes. | Every read and write was scoped to the organization. None took a project or checked ownership. The read showed the newest file, but a new scenario attached to the oldest. |
| Screen | `client/src/concept2cure/v2/surfaces/HumanFactors.tsx` | Read `GET /api/human-factors`. Drew the panels only when `meta.scope === 'program'`, which the route never sent (slice 0). Otherwise it showed the `hf-not-keyed` note and offered no write. | It never read a project. |
| Screen tests | `humanFactorsProjectKeyed`, `humanFactorsHonesty`, `humanFactorsSummativeGate` (`client/src/concept2cure/v2/__tests__/`) | The first serves the unscoped response. The other two serve `scope: 'program'`, a shape the route could not send. | They opened no project. |
| Route tests | `server/routes/__tests__/human-factors-{read,files-read,write,governed-writes}.test.ts` | Pin the organization-scoped contract. | — |
| Service test | `server/services/human-factors/__tests__/hf-files-service.pglite.integration.test.ts` | PGlite, with a hand-written copy of the DDL. | The copy would not have the new column. |
| Plan | `client/src/concept2cure/v2/surfaces/ProjectMdxWorkflow.tsx` `WORK_DESTINATIONS` | `human-factors-usability` had no entry, so the package opened Evidence. The compiler plans the package for every device route (`shared/regulatory/work-packages.ts`, `selectPackageIds`, `[PKG.humanFactors, true]`). | No door to `human-factors`. |
| Placement guard | `client/src/concept2cure/v2/__tests__/ProjectMdxWorkflow.test.tsx` | `human-factors` in `NO_PROJECT_DOOR`, with its reason. | — |
| Door names | `.design/client-journey/INFORMATION_ARCHITECTURE.md` section 9, read by `clientNamesSlice1.test.tsx` | Fails any drawn device door that is not in the table. | No row for this door. Section 5's `human-factors` row names the job "Build the usability engineering file", and slice 19 names "Start the usability file". |
| Ownership answer | `server/lib/admit-project.ts` (`8d37e8ad`), over `programInOrganization` (`server/services/c2c/program-access.ts`) | 404 "Project not found" when the organization does not own the live project, 503 when the check cannot run. Used by `mdx-udi.ts` and `mdx-labeling.ts`. | — |
| Shell project | `client/src/concept2cure/v2/shellProject.ts` `useShellProject`, `shellProgramId` | The open project for v2 screens. Labeling reads it (`ca88fa26`). | HumanFactors did not read it. |
| Demo seed | `scripts/seed/ga-demo.d/95-human-factors.mjs` | Inserts the BX-204 file with no project. | Not changed (see Not done). |
| AnA | `design_human_factors_study` (`server/services/ana/combinationProductsTools.ts`) | A deterministic compute: participants per user group. | It writes no HFE/UE file. |

Searches run:

- `hf_engineering_files`, `c2c_hf_files`, `c2c_hf_scenarios`, `listHfFiles`, `createHfFile`, `HfEngineeringFileRow` and
  `/api/human-factors` across `server`, `client/src`, `shared`, `scripts` and `tests`.
- `human-factors`, `HumanFactors`, `usability`, `62366` and `human-factors-usability` across `client/src`, `shared` and
  `server`.
- `programInOrganization`, `admitProject` and `installProjectRouteAccess` over `server/routes` and `server/lib`.
- PGlite program-key migration tests in `tests/schema-contract`. `chat-threads-program-key.pglite.test.ts` was used as
  the pattern.
- `git log --all --diff-filter=D` over `*HumanFactors*`, `*human-factors*`, `*human_factors*`, `*hf-files*`,
  `*hf_files*` and `*usability*`. It found nothing. The checkout is shallow (1,087 commits).

There is no second human-factors screen, route or store. Nothing here was rebuilt. The existing table, service,
routes and screen were each completed.

## The migration, and Rule 1

`migrations/20261029_hf_engineering_files_program_key.sql`, placed on `C2C_MIGRATION_FILES` immediately before
`UUID_TENANT_ISOLATION_NONPUBLIC`. That puts it after its creator (`db/migrations/20260801_hf_files_store.sql`), after
`20260926b` (`regulatory_programs_id_org_uq`), and before the isolation tail.

1. `hf_engineering_files.program_id UUID`, nullable. `regulatory_programs.id` is `UUID`, and so are
   `labeling_documents.program_id` and `chat_threads.program_id`.
2. `regulatory_programs_id_org_uq` when absent, the same statement 20260926b and 20261001c use.
3. `hf_engineering_files_program_same_org_fk`: `(program_id, organization_id)` → `regulatory_programs (id,
   organization_id)`, `NOT VALID`, `ON DELETE SET NULL (program_id)`. The route checks ownership before it writes. The
   key holds every other writer, such as the demo seed or a later writer, to the same rule, as 20260926b does for the
   stores it keys. The column list means a tenant purge clears the project and keeps the NOT NULL organization.
4. `idx_hf_engineering_files_org_program` on `(organization_id, program_id, created_at DESC) WHERE deleted_at IS NULL
   AND program_id IS NOT NULL`, for the project read.

Rule 1 notes:

- Every statement runs only when its object is absent (`to_regclass`, `pg_attribute`, `pg_constraint`), so a replay
  runs no DDL.
- It is additive. There is no DROP, no backfill, no COMMENT, and no constraint that another file defines.
- The table is in `public` with `organization_id INTEGER NOT NULL`, so the tenant sweep at the tail already polices
  it. No table is created.
- **Existing rows keep `program_id` NULL.** They are the organization's unscoped files. The project read filters
  `program_id = $2`, so NULL never matches. No project shows them, and no project write lands in them. Nothing guesses
  a project for them. A file holds only a device name, and matching that to a project would be a guess.
- `npm run ci:migration-set-order`: OK, 431 migrations.
- `npm run ci:migration-drop-safety`: OK.

Proof of replay: `tests/schema-contract/hf-engineering-files-program-key.pglite.test.ts`. It applies the real DDL:
`20260524` (regulatory_programs) and `20260801` (the table). It writes a file before the column exists, then runs the
migration, the creators again, and the migration again, and once more after that.

- One nullable uuid column, one NOT VALID key that nulls only the program, and one index.
- A third replay leaves the shape unchanged.
- The legacy file keeps NULL.
- The key accepts the file's own organization's project. It refuses another organization's project, or a missing one,
  on insert and on update (23503).
- Deleting a project clears the file's project and keeps its organization.

7/7.

## Tenant check, per route

The pattern is `ca88fa26`'s, through `admitProject` (`server/lib/admit-project.ts`, committed in `8d37e8ad`). When a
request names a project, the route answers before it reads or writes anything:

- 404 when the organization does not own the live project: another organization's, a missing one, the
  organization's own deleted one, or a value that is not a project id;
- 503 when the check cannot run.

A request with no project is unchanged and makes no ownership lookup.

| Route | Project from | With a project |
|---|---|---|
| `GET /api/human-factors` | `?program_id=` | That project's newest file only, `meta: { scope: 'program', programId }`. A project with no file reads `data: null`, never the organization's file. |
| `POST /api/human-factors` | body `programId` | The file is created with `program_id` recorded. The audit row carries `programId`. `meta.scope: 'program'`. |
| `POST /api/human-factors/scenarios` | body `programId` | Attaches to that project's file, the one the read shows. 409 `NO_FILE` when the project has none. |
| `PATCH /api/human-factors/elements` | body `programId` | That project's file. 409 `NO_FILE` when it has none. `meta.scope: 'program'`. |

Without a project, every response now says `meta.scope: 'organization'`. The read still returns the organization's
newest file, and a scenario still attaches to the oldest.

`PATCH /scenarios/:id/mitigate` is unchanged. It names a scenario id, which the screen takes from the project's read,
and it stays scoped by organization.

The file service takes the project as a bind parameter: `AND ($2::uuid IS NULL OR program_id = $2::uuid)`.
`ci:sql-interpolation` is OK, and its baseline is unchanged. `ci:program-ownership-single-source` is OK.

Test: `server/routes/__tests__/human-factors-reads-the-project.test.ts`, 22 cases. It does not mock the ownership
answer or the file service. The real `programInOrganization` and `hf-files-service` run against a database double that
answers each statement from a small table, by the statement's own filters. The table holds the organization's oldest
and newest files, both with no project, one project's file, and another organization's project's file.

## What changed

- **Migration and set**: as above.
- **Service** (`hf-files-service.ts`):
  - `createHfFile` takes `programId` and records it.
  - `listHfFiles(orgId, { programId })` returns only that project's files.
  - The row type carries `program_id`.
- **Route** (`human-factors.ts`): as in the table above. It adds small helpers (`namedProgram`, `scopeOf`,
  `currentFile`, `scenarioFileId`) and no new SQL. The scenario path's existing lookup of the oldest file moved into
  `scenarioFileId` unchanged.
- **Screen** (`HumanFactors.tsx`):
  - It reads the shell's open project (`useShellProject`, `shellProgramId`) at `?program_id=`.
  - With no project, or an open project with no project id, it reads nothing and says which (`hf-no-project`). It
    offers "Open projects".
  - A file is drawn only when the response says `scope: 'program'` and the open project's `programId`. The
    organization's scope, no scope, or another project's id stays behind the `hf-not-keyed` note. So an unscoped
    organization file is never shown under a project.
  - The element tick and the use-scenario add send `programId`.
  - **Start the usability file** appears on the project's own empty state only. It takes the device name and POSTs
    `{ device, programId }`. Only a 201 that the route reports as this project's counts. The screen then reads the
    file again from the record. A refused or failed start shows "File not started — {reason}" and no file.
  - Copy that said "organization" for the keyed state now says "project".
  - AnA's not-ready contexts moved into one helper (`hfNotReadyContext`). Each state is published as itself, and the
    keyed empty state lists the start action.
- **Plan's door**:
  - `DEVICE_DOORS.humanFactors`, "Build the usability engineering file", in `projectDoors.ts`.
  - `WORK_DESTINATIONS['human-factors-usability']` → `human-factors`, falling back to Evidence when the feature is not
    available. The compiler plans the package for every device route, so the door is on every device route.
  - A drug project has no device workflow.
- **Guard**: `human-factors` moves from `NO_PROJECT_DOOR` to `REACHED_FROM_PLAN`. The counts read twelve and eight.
- **IA section 9, Door names**: one row, `| Device workstream | No door (the human-factors package opens Evidence) |
  Build the usability engineering file |`. The job name is section 5's for `human-factors`. `clientNamesSlice1` needs
  the row: every drawn device door must be a job name in that table (see mutation M8). No other edit was made to that
  file.
- **Existing tests moved to the new contract**, approved by the lead, with no assertion weakened:
  - The three HumanFactors tests open a project through the shell (`publishShellProject` before mount,
    `clearShellProject` after). Their `scope: 'program'` fixtures carry that project's `programId`.
  - The failed-read case matches the project read's path.
  - The element-tick body now includes `programId`.
  - `hf-files-service.pglite.integration.test.ts` applies the real creating migrations plus 20261029 instead of
    hand-written DDL, and gains three project cases.
  - `human-factors-read.test.ts` pins the unscoped read's params as `[7, null]` instead of `[7]`, because the project
    filter is now a bind parameter.

## Proof

- `baseline.txt`: 12 related files at head, all green.
- `red.txt`: each new test at head plus the test only, before the product change it pins.
  - Service: 3 of 7 red, the project cases.
  - Routes: 21 of 22 red. The one green case is the unchanged unscoped scenario path.
  - Screen: 9 of 12 red. The three green cases are guards the head screen already met, because it hid every
    unscoped file.
  - Door: 26 of 27 red. The green case is the drug guard.
- `green.txt`: 17 files, 243 tests, all green, after every mutation was restored. It also covers the migration-set
  contract tests, the four gates (`ci:migration-set-order`, `ci:migration-drop-safety`, `ci:sql-interpolation`,
  `ci:program-ownership-single-source`) and a full cold `npm run typecheck`, which exits 0.
  - `tenant-isolation-sweep.contract` fails at suite level on `20261027_cdi_public_reference_seed.sql`, which is ordered
    before this migration. It fails the same way with this migration off the set (M7). It is not this slice's.
- Mutations. Each one was applied from a scratch copy, run, restored, and compared byte for byte. `git diff` then
  shows only this slice's changes.
  - The lead's four:
    - `mutation-M1a.txt`: the read skips the ownership check. 5 fail: the foreign, missing, deleted and malformed
      projects, and the check that cannot run.
    - `mutation-M1b.txt`: the create skips the ownership check. 5 fail, the same five on `POST /`.
    - `mutation-M2a.txt`: the route reads without the project. 6 fail: the project's own read, a project with no file,
      and both writes.
    - `mutation-M2b.txt`: the service filter is dropped but its bind parameter is kept. 2 fail, the PGlite project
      cases.
    - `mutation-M3.txt`: the door's availability gate is dropped. 1 fails.
    - `mutation-M4a.txt`: the screen treats any response under an open project as keyed, so the unscoped
      organization file is shown. 9 fail across the new screen test and `humanFactorsProjectKeyed`.
    - `mutation-M4b.txt`: the route falls back to the organization's file for a project with none. 3 fail.
  - The start control:
    - `mutation-M5.txt`: "Start the usability file" is offered on an unscoped empty state. 1 fails.
    - `mutation-M6.txt`: any 201 is taken as this project's file. 1 fails.
  - The migration and the IA row:
    - `mutation-M7.txt`: 20261029 is taken off the set. The order case fails.
    - `mutation-M8.txt`: the IA section 9 row is removed. `clientNamesSlice1` fails on "each device workstream door is
      drawn with its job name". So the row is needed.
- `eslint.txt`: every changed file has the same count at head and now. The four new test files have 0.

## Not done

- **Project sharing inside an organization** is not applied to these routes, as with the Pre-Sub, UDI and labeling
  reads. A member can read a private project's file by its id. The organization-wide read already returned it.
- **The demo seed** (`scripts/seed/ga-demo.d/95-human-factors.mjs`) still inserts BX-204's file with no project. So
  the demo shows "No HFE/UE file yet" under its project, with "Start the usability file" offered. Seeding it under the
  demo's project needs the seed to resolve that project's id. The seed is not in this slice.
- **`PATCH /scenarios/:id/mitigate`** takes no project. It is tenant-safe by organization, and the screen only offers
  it on the project's own scenarios.
- **`scripts/db/program-same-org-preflight.mjs`** does not list `hf_engineering_files`. The column is new and its key
  checks every row written since, so there is no legacy cross-organization row to find.
- `INFORMATION_ARCHITECTURE.md` section 5's `human-factors` row still describes the state before this slice ("No door
  from a project…"). The lead limited this slice to the section 9 row.
