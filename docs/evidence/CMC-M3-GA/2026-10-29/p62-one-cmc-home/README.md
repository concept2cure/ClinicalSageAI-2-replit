# P-62: a project's CMC data has one home, the CMC / Module 3 register

**Row:** D2 (CMC / Module 3). **Decision:** P-62 (`docs/LAUNCH_DEFINITION_OF_DONE.md`). **Date:** 2026-10-29.
**Session:** `session_01T2wooCZu46W7msw4TJuuzr` (a P-62 worker under the lead).

## The finding

A project's CMC data was answered from two places.

- **The CMC / Module 3 register** (`server/api/cmc`).
  - The CMC surface records a drug substance and a drug product here.
  - Each record is written through into `cmc_source_objects`.
  - Its one per-project reader is `getModule3BuildStatus` (`server/services/module3-convergence-service.ts`). The build board, AnA's Module 3 commands and the final-export gate read it.
- **Project metadata.**
  - `GET` and `PUT /api/concept2cure/projects/:projectId/cmc` (`server/routes/c2c/program-twin.ts`) read and wrote `projects.metadata.cmcDrugSubstance`, `cmcDrugProduct`, `cmcSpecifications`, `cmcStabilityStudies`, `cmcImpurities` and `cmcLastUpdated`.
  - No screen, AnA tool or script called either route, in any revision.

Two readers took CMC readiness from the metadata.

- **The task assessment.** This is `POST …/projects/:projectId/tasks/assess` in `server/routes/c2c/tasks.ts`, the block headed "Check CMC readiness".
  - It added "Enter Drug Substance data (CMC Module 3)" whenever the metadata held no `substanceName`, and "Enter Drug Product data (CMC Module 3)" whenever it held no `productName`.
  - Nothing wrote the metadata, so it told **every** project to enter drug substance data. That included a device program, a diagnostic program, a biologic, a drug program filing an EU CTA or an NDA, and a program whose register already held a drug substance.
  - `red.txt` prints the actions head returned in each case.
- **The project context** (`GET …/projects/:projectId/context`). Its `cmc` block reported the metadata. That was `null` for every project the register knew about.

### Also found and fixed: the composition boundary failed open for a program with nothing recorded

- **Where it opened.**
  - `compositionRefusal` (`composition-scope.ts`) answers "modality not established" before it reaches the application.
  - `admitProgramComposition` (`server/services/cmc/module3-compile.ts`) admits exactly that case, so the board can take a program's first record.
  - Its own comment said the application was "still judged". Nothing judged it.
- **What reached the user.** A drug program filing an NDA, an MAA or an EU CTA got an empty, admitted build board, although P-28 refuses all three by name. Once the assessment read the board, it would have told those programs to record their drug substance.
- **The fix**, approved by the lead and limited to two files:
  - `admitProgramComposition` now judges the application of a program with nothing recorded, through the existing `applicationRefusal`;
  - `composition-boundary-readers.pglite.test.ts` gains an NDA case and an EU CTA case.
- **Proof.** `boundary-red.txt` runs head's `module3-compile.ts`: **2 failed, 13 passed**. `boundary-green.txt`: **17 files, 203 of 203**. It includes the US IND small-molecule program with nothing recorded, which still gets its empty board. It also covers every suite that reaches `admitProgramComposition` or `getModule3BuildStatus`, and the compile and boundary suites.

## What already exists

| What | Where | What it does / did, and how this change uses it |
|---|---|---|
| The CMC / Module 3 register | `server/api/cmc/routes.ts` (`/drug-substances`, `/drug-products`, …), `server/services/cmc/register-writes.ts` | **The reachable replacement for the retired routes.** A create writes the register row, then links it into Module 3 through `linkToModule3` (`server/services/cmc/link-to-module3.ts`). That link is the one path into `cmc_source_objects`. |
| The CMC surface that writes it | `client/src/concept2cure/v2/surfaces/cmcRegisters.tsx` (`CmDrugSubstances`, `CmDrugProducts`), with forms in `cmcRegisterForms.ts` (`drugSubstanceBody(v, projectId)`) | Files each record under `cmcProjectUuid()` (`cmcShared.tsx:41`). That is the open program's `regulatory_programs` UUID, taken from `window.C2C_PROJECT` (`shellProject.ts`). The build board (`CmcModule3Build.tsx`) reads `GET /api/cmc/module3-os/build-state/:projectId` under the same id. |
| The register's per-project reader | `getModule3BuildStatus(orgId, projectId)`, `server/services/module3-convergence-service.ts:155` | **Used, unchanged.** It composes the sources exactly as compile does, and judges the composition boundary first. A program outside the boundary throws `CompositionOutOfScopeError`. |
| The composition boundary | `server/services/cmc/composition-scope.ts` (`compositionRefusal`, `applicationRefusal`, `compositionRefusalStatus`), `server/services/cmc/module3-compile.ts` (`admitProgramComposition`) | Decision P-28. Used as the out-of-scope verdict and its reason. Fixed for a program with nothing recorded (above). |
| The program ↔ project anchor | `projects.regulatory_program_id`, read and written only in `server/services/c2c/program-project-anchor.ts` (the C1 bridge) | How a concept2cure project, keyed by the integer `projects.id`, names its program. The register is read under that UUID. |
| The id translation in the other direction | `server/services/cmc/resolve-cmc-artifact-project.ts` | Maps a CMC TEXT id to a `projects.id`. Its header records that the v2 shell passes the program UUID and legacy callers pass the numeric id. `server/services/ana-ri/context-enrichment.ts:930` says the same for AnA: the Module 3 tables "key on the program UUID … not on projects.id". |
| The boundary's state name | `anaToolCompositionRefusal` → `status: 'outside_composition_scope'` (`composition-scope.ts`) | Reused as the out-of-scope state's name. |
| The metadata CMC routes and `cmcDataSchema` | `server/routes/c2c/program-twin.ts` at head, lines 634-744 | **Retired** (no caller). |
| The assessment's CMC lines | `server/routes/c2c/tasks.ts` at head, lines 625-639 | **Replaced** by the register read. |
| The context's `cmc` block | `server/routes/c2c/program-twin.ts` at head, lines 812-818 | **Replaced** by the register read. |

### Searches run (Rule 3)

- `cmcDrugSubstance|cmcDrugProduct|cmcSpecifications|cmcStabilityStudies|cmcImpurities|cmcLastUpdated` in every `.ts/.tsx/.js/.mjs/.sql/.json/.md/.py` file. Hits: `program-twin.ts`, `tasks.ts`, `program-twin-project-access.pglite.test.ts`, the D6 evidence README (`docs/evidence/D6-CMC-TWIN-TENANT/2026-10-29/`) and one audit register (`docs/audit-2026-07/12-findings-register.md`). Nothing else.
- Callers of `/projects/:projectId/cmc`, `…/context` and `tasks/assess` in `client/src`, `server`, `shared`, `scripts` and `tests`. Only the tests named below call them.
- `git log --all -S'cmcDrugSubstance' -- client`, `git log --all -S'tasks/assess' -- client` and `git log --all -G'concept2cure/projects/.*/(cmc|context)' -- client`: no hits. No client has ever called these routes.
- `git log --all --diff-filter=D` on `*cmc-readiness*`, `*cmcReadiness*`, `*project-cmc*`, `*ProjectCmc*`, `*task-assess*`, `*tasksAssess*`, `*cmc-data*`, `*CmcData*` and `*program-twin*`: nothing deleted.
- Readers of `getModule3BuildStatus` and `admitProgramComposition`, and existing readiness helpers (`cmcReadiness`, `module3Readiness`, `cmc_status`, AnA's `buildStatusFor`).
  - None maps a concept2cure project to the id the register keys it by.
  - None gives the three answers this needs.
  - So one small reader is new: `server/services/cmc/project-cmc-readiness.ts`. It calls `getModule3BuildStatus` and composes nothing of its own.

## Which id the register is read under, and the proof

- **The CMC surface files under the program UUID.** Every register card's create threads `cmcProjectUuid()` into the body.
- **A concept2cure project names its program** in `projects.regulatory_program_id`.
- **So the register is read under that column's UUID.** A project anchored to no program is read under its own id, which is what a legacy caller files under. For it the boundary gives its own settled answer, `CMC_PROGRAM_NOT_RECORDED`, as the board does.
- **The proof runs over real rows.** In `project-cmc-one-home.pglite.test.ts`, a drug substance is linked into Module 3 by the register's own `linkToModule3` → `writeThroughDrugSubstance`, filed under the program UUID. Then:
  - the fixture test shows the row lands at `project_id = <program uuid>`;
  - the assessment reads it as recorded, and its `cmcProjectId` is the UUID.
- **The mutation that reads `String(project.id)` instead (M1) turns 12 of the 18 tests red.**

## What changed

- **`server/services/cmc/project-cmc-readiness.ts` (new).** `readProjectCmcReadiness(orgId, project)` reads `getModule3BuildStatus` under the register's id and gives one of three answers:
  - **`read`.** For the drug substance (§3.2.S) and the drug product (§3.2.P) it gives:
    - `recorded`: whether a live drug substance or drug product record composes into that half (a retired record does not compose);
    - how many of the half's sections have a source;
    - the sections the composer scores incomplete, with their missing inputs.
  - **`outside_composition_scope`.** The boundary refused. It carries the refusal's `code` and its message.
  - **`unreadable`.** The read failed, or the refusal is one the boundary answers 503 (`CMC_APPLICATION_NOT_READABLE`). It is never reported as complete, and never as missing.

  `cmcNextActions(readiness)` gives one action per half that no record composes into, and none otherwise. Nothing is asked of a model. Every fact is the composer's.
- **`server/routes/c2c/tasks.ts`.**
  - The assessment's CMC lines come from `cmcNextActions`.
  - An unreadable read is added to `risks`.
  - The response carries `cmc`, the readiness.
  - The header's stale note about the old banner is corrected.
- **`server/routes/c2c/program-twin.ts`.**
  - `GET` and `PUT …/cmc` and `cmcDataSchema` are deleted, and so is the now-unused `zod` import.
  - The context's `cmc` is the readiness.
  - The header names the retirement and the replacement.
- **`server/services/cmc/module3-compile.ts`.** `admitProgramComposition` judges the application of a program with nothing recorded.
- **Tests.**
  - `c2c-router.parity.test.ts`: the CMC paths are removed from the program-twin list, and a new case checks that no router at `/api/concept2cure` serves `GET` or `PUT …/cmc` and that the program-twin router serves reads only.
  - `support/project-write-gates-fixture.ts`: the `PUT …/cmc` verdict is removed. The census fails if a write is registered without a verdict.
  - `program-twin-project-access.pglite.test.ts`: the access cases are asked of `…/context`. The retired `PUT` is asked once more, across tenants, to show it is not served and writes nothing. `db/runtime` is mocked to the same pool, so the readiness read runs on PGlite.

### Deletion note (working agreement)

- **What was deleted:** a server route pair that no client called, in any history. It was not a user-facing capability.
- **What delivers the user outcome now:**
  - recording CMC data: the CMC surface's register cards (`client/src/concept2cure/v2/surfaces/cmcRegisters.tsx`) over `POST` and `PUT /api/cmc/drug-substances` and `/api/cmc/drug-products` (`server/api/cmc/routes.ts`);
  - reading CMC readiness: the build board (`client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx` over `GET /api/cmc/module3-os/build-state/:projectId`), and now the assessment and the context.
- **The gates that keep the routes gone:**
  - `c2c-router.parity.test.ts`, "serves no project-metadata CMC route";
  - the project-write-gates census;
  - `project-cmc-one-home.pglite.test.ts`, which checks for a 404 and an untouched record.
  - Mutation M9 shows the first and last go red.

## Existing data

Deployed projects may carry metadata CMC keys, written by anything that called the retired `PUT`.

- **They are not migrated into the register.** A register row is a governed record attributed to whoever recorded it (`server/services/cmc/register-audit.ts`, §11.10(e)). Minting one from metadata would create records that nobody recorded or signed.
- **They are left in place**, and nothing reads them any longer (the searches above).

A deploy operator can count them. `projects.metadata` is `json`, so it is cast:

```sql
SELECT count(*) AS projects_with_metadata_cmc
  FROM projects
 WHERE metadata IS NOT NULL
   AND metadata::jsonb ?| array['cmcDrugSubstance','cmcDrugProduct','cmcSpecifications',
                                'cmcStabilityStudies','cmcImpurities','cmcLastUpdated'];
```

A non-zero count means CMC data exists outside the register. Its owner should record it on the CMC surface, which attributes it and links it into Module 3. After that, a separate change can remove the keys.

## Tests: red, green, mutations

The test is `server/routes/c2c/__tests__/project-cmc-one-home.pglite.test.ts`, 18 tests.

**Harness: what is real**
- **Database:** PGlite, a real PostgreSQL.
- **Tables:**
  - those `drizzle-kit` creates from `shared/schema`, plus `regulatory_programs` from `shared/schema/programs.ts`;
  - the CMC Module 3 tables, from their files on disk: `db/migrations/20260401_cmc_convergence_os.sql` (in the set), then `migrations/0017_module3_project_id_fix.sql`, which keys `project_id` as TEXT as deployed. The fixture test checks the TEXT key, FORCE and the policy.
- **Policies:** the set's tenant isolation sweep.
- **Runtime role:** a NOSUPERUSER NOBYPASSRLS role that owns the tables, with `RLS_ENFORCE=on`.
- **Pool and tenant scope:** `instrumentPool` and the real `establishRequestTenantScope`.
- **Register records:** written by the register's own `linkToModule3` → `writeThroughDrugSubstance` / `writeThroughDrugProduct`.
- **Register read:** `getModule3BuildStatus`, which judges the boundary on these tables.

**Harness: what is stubbed**
- Authentication, the rate limiter and the tenant-context middleware.

**Results**
- **`red.txt`:** head's `tasks.ts` and `program-twin.ts`, with the new test. **16 failed, 2 passed.**
  - The 2 that pass are the fixture checks: the register is TEXT-keyed and policied, and a record lands under the program UUID.
  - Each failure prints what head answered, for example `"Enter Drug Substance data (CMC Module 3)"` for the device, diagnostic, biologic, CTA and NDA programs and for the program whose register holds a drug substance, and `200` from the retired routes.
- **`green.txt`:** **23 files, 964 of 964.** They are:
  - the new test (18 of 18);
  - `program-twin-project-access.pglite.test.ts`, `c2c-router.parity.test.ts`, `tasks-tenant-scope.test.ts` and `project-write-gates.pglite.test.ts` (684 of 684);
  - the boundary, build-board and compile suites.
- **`mutations.txt`:** each mutation applied alone to the fixed tree and restored byte-for-byte, with sha256 checked. The runner is a scratch script outside the repository. **10 of 10 turned the suite red.**

| # | Mutation | Red |
|---|---|---|
| M1 | read the register under `String(project.id)`, not the program UUID | 12 |
| M2 | an out-of-scope refusal is not named (it reads as unreadable) | 7: five out-of-scope programs, the unanchored record, the context's device case |
| M3 | a failed read is reported as nothing recorded | 2: both unreadable cases |
| M4 | a 503 refusal (`CMC_APPLICATION_NOT_READABLE`) is treated as out of scope | 1: the application-not-readable case |
| M5 | a half counts as recorded when any source feeds it (a drug substance feeds §3.2.P.2) | 2: the substance-only assessment and context |
| M6 | the assessment drops the unreadable risk line | 2 |
| M7 | the assessment reads project metadata again (head's block) | 12 |
| M8 | the context reads project metadata again | 2 |
| M9 | `PUT …/cmc` registered again | 2: the retired-route case and the parity case |
| M10 | head's `admitProgramComposition` (the application not judged with nothing recorded) | 2: the CTA and NDA programs |

## Gates (`gates.txt`)

| Gate | Result |
|---|---|
| `npx eslint --no-ignore` on the 9 changed and new files | 0 errors. 10 warnings, against head's 10 on the same files. They are the same complexity, length and file-size rules, each smaller: the assessment handler's complexity went from 26 to 22, and program-twin.ts from 764 lines to 670. The new files have 0 warnings. |
| Scoped `tsc`: a scratch tsconfig extending `tsconfig.json`, with the 9 files | No error in a changed or new file. The 9 it reports are TS7016 (no declaration file for `metrics.js`, `jsonwebtoken`, `qrcode`, `fda_*_client.js`) in files this change does not touch. |
| `npm run ci:launch-scope-api` | OK |
| `npm run ci:drizzle-tenant-scope` | OK |
| `npm run ci:program-ownership-single-source` | OK |
| `ci:check-route-collisions`, `ci:audit-route-mounts:no-regression`, `ci:server-error-leaks`, `ci:no-mock-in-prod-routes`, `ci:fixture-fallback`, `ci:json-operator-types`, `ci:session-scoped-rls-bypass`, `ci:discarded-audit-write`, `ci:untracked-imports` | OK |
| `ci:sql-interpolation` | **Red, on files other lanes are changing** (`server/services/tenant/held-records.ts`, `server/services/tenant-export/held-record-integrity.ts`, `server/services/vault/retention-period.ts`, `server/routes/vault-retention-period.ts`). None is in this change. |
| `ci:tenant-isolation:no-regression` | **Red, on another lane's file** (`server/services/vault/vault-placement.service.ts`). None of the findings is in this change. |
| `ci:tenant-entry-points` | **Red, on another lane's file** (`server/routes/mdx-admin.ts`). None of the findings is in this change. |

## Not carried

- **Section-level incompleteness is stated, not actioned.** The `cmc` block lists, for each half, the sections the composer scores incomplete and their missing inputs. The assessment raises an action only for a half that no record composes into ("nothing when it is recorded"). Turning incomplete sections into actions is a product choice, left to the lead.
- **A refusal that names what to record is given in the boundary's own words, with no action.** This is `CMC_MODALITY_NOT_ESTABLISHED`: a recorded drug substance whose modality the record does not establish. Its message says what to record, and it is reported as `outside_composition_scope`.
- **The other Module 3 parts are not summarised:** 3.1, 3.3, the 3.2.A appendices and 3.2.R. The assessment spoke only of the drug substance and the drug product, and still does. The build board reports every section.
- **Neither route has a client caller**, and none was added. The assessment and the context have no screen today. Their reachability is outside this change.
- **The metadata keys are not removed, and the count SQL was not run on a deployed database.** No deployed database is reachable from this session.
- **No run on a real PostgreSQL server.** The `*.dbtest.ts` lane needs a disposable database. The proof runs on PGlite, with the deployed tables' DDL taken from disk and the production pool primitive.
