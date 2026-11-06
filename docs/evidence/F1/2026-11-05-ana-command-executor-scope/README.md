# F1-C: AnA's platform commands, `search_all_documents` and `validate_cross_references` read only the projects the person can open

2026-11-05. Session slug `ana-command-executor-scope`.

## The defect

The founder's rule (2026-11-05): a CRO is one organization working for several sponsors, and a CRO user works "across
authorized sponsor projects without mixing sponsor data or permissions". A read therefore admits only the projects the
person can open (the project sharing policy), and inside an open project only that project's sponsor's projects.

**AnA's platform commands.** `executeCommands` (`server/services/ana-ri/command-executor.ts`) applied role RBAC only
(`authorizeCommand`, `server/services/ana-ri/command-rbac.ts`). These handlers then read `concept2cure_artifacts` or
`concept2cure_artifact_versions` by organization, plus a project or artifact id from `params` (the model's channel, or
the request body's), with no access check:

| Command | Handler | What it read |
|---|---|---|
| `list_artifacts` | `listArtifacts` | a project's artifacts, by `params.projectId` |
| `check_dossier_readiness` | `checkDossierReadiness` | a project's artifacts, by `params.projectId` |
| `search_artifacts` | `searchArtifacts` | full text and `ILIKE` over every artifact's title and content; the project filter was optional |
| `list_artifact_versions` | `listArtifactVersions` | an artifact's versions, by `params.artifactId` |
| `run_compliance_scan` | `runComplianceScan` | an artifact's content, by `params.projectId` and `params.artifactId` |
| `export_artifact` | `exportArtifact` | an artifact's content, by `params.projectId` and `params.artifactId` |
| `compare_versions` | `compareVersions` | two versions' content, by `params.artifactId` |
| `review_version_impact` | `reviewVersionImpact` | two versions' content and the artifact's title, by `params.artifactId` |

So a member read a private project's artifacts, and inside sponsor A's project a CRO's other sponsors' artifacts.
`01-red.txt` shows each read returning them.

`list_artifacts` and `check_dossier_readiness` were declared `(ctx, projectId, filters)`, but dispatch calls every
handler as `handler(ctx, cmd.params)`. The params object reached the SQL as the project id, so every dispatched call
failed (`invalid input syntax for type integer: "[object Object]"`). These two did not leak through dispatch. They did
not work. `update_project` had the same defect and was fixed the same way (`update-project-dispatch.contract.test.ts`).

**What reaches `executeCommands` from each caller:**

| Caller | Person | Open project |
|---|---|---|
| AnA tool `execute_platform_command` (`server/services/ana/AnaToolExecutor.ts`) | `ctx.userId`, `ctx.organizationId` | `ctx.projectId` as `activeProjectId`. Under the v2 shell `ctx.projectId` is null and the open program uuid is in `ctx.projectRef` (`server/services/ana/turn-tool-context.ts`), which was not passed: inside a v2 project nothing could narrow to its sponsor |
| `POST /api/ana-ri/execute` (`server/routes/ana-ri/generate-execute.ts:132`) | `extractRequestContext(req)` | the request body's `params.projectId` |
| Chat command blocks (`server/routes/ana-ri/post-processing.ts`, `processCommandsInResponse`) | the turn's user | the turn's project as an integer (`turnProjectId`), admitted at the start of the turn (`server/routes/ana-ri/stream.ts`, `admitTurnProject`) |
| `POST /api/ana-ri/governed-action` (`server/routes/ana-ri/utility.ts`) | the confirming person | none |

**`search_all_documents`** (`AnaToolExecutor.ts`) selected `concept2cure_artifacts` and `c2c_documents` by
organization only. **`validate_cross_references`** read `c2c_documents` by organization and a model-supplied
`document_id`, then the outlines of that document's project.

## What already exists

- `projectReadScope`, `programReadScope`, `projectScopeRefusal` and the `ProjectReadScope` / `ProgramReadScope` types,
  private in `server/services/ana/AnaToolExecutor.ts` (F1, 2026-11-05,
  `docs/evidence/F1/2026-11-05-ana-vault-tools-scope/`). They hold `list_vault_documents`, `read_vault_document`,
  `get_document_versions`, `compare_vault_versions`, `list_governed_documents`, `read_governed_document`,
  `global_search`, `update_vault_document` and `assemble_ectd_module_from_artifacts` to the scope. They are the
  implementation; this change moves them and does not write a second one.
- `admitAnaProjectScope`, `AnaProjectScopeError` in `server/services/ana/project-scope-admission.ts`: admits an open
  project (integer id or program uuid) against the sharing policy.
- `getAccessibleReportProjectIds`, `canAccessReportProject` in `server/services/report-os/project-access.ts`: the
  project sharing policy.
- `readCurrentProgramActor`, `getCurrentAccessibleProgramScope`, `verifiedProgramAnchors`, `ProgramReadAccessError`
  in `server/services/c2c/current-program-access.ts`.
- `narrowToSponsorOf` in `server/services/artifact-registry-read.ts`: narrows to the open project's sponsor.
- `validateCommandContext` and `authorizeCommand` (`command-rbac.ts`): identity and role checks only, no project scope.
- `server/services/ana/__tests__/ana-vault-tools-project-scope.pglite.test.ts`: the reference suite, PGlite with the
  real sharing policy and no access stubs.

Searches run:

- `grep -n "projectReadScope|programReadScope|projectScopeRefusal|ProjectReadScope|scopedArtifactKey" server/services/ana/AnaToolExecutor.ts`
- `grep -rln "project-scope-admission" server` (37 non-test importers). None of them is in the helper's static import
  graph, and `command-executor.ts` imports the module dynamically plus a type-only import, so moving the helpers there
  makes no cycle.
- `grep -n "compareVersions|reviewVersionImpact|exportArtifact|runComplianceScan|searchArtifacts|listArtifacts|listArtifactVersions|checkDossierReadiness" server/services/ana-ri/command-executor.ts`
- `grep -rn "executeCommands|activeProjectId|processCommandsInResponse" server/routes/ana-ri server/routes/chat server/services/ana server/services/ana-ri`
- `grep -rn "listArtifacts(|checkDossierReadiness(|listTasks(" server client shared` (no direct caller of the executor's handlers)
- `grep -n "projectRef|projectId" server/services/ana/turn-tool-context.ts`
- `git log --all --diff-filter=D --name-only -- '*project-scope*' '*command-scope*' '*read-scope*' '*command-executor*'` (nothing deleted)

## What changed

- **`server/services/ana/project-scope-admission.ts`.** The scope helpers moved here from `AnaToolExecutor.ts`
  unchanged in behaviour. `resolveProjectReadScope` / `resolveProgramReadScope` return the scope or a refusal
  `{ error, code }`. `projectReadScope` / `programReadScope` / `projectScopeRefusal` give the tools' JSON-string form.
  - The dynamic imports stay dynamic, and the module gains no static import.
  - `ProgramReadAccessError` is recognised by the name its constructor sets, not imported. A first version imported
    `c2c/current-program-access` statically, and `document-source-facade-integration.test.ts` then hung.
  - The cause of that hang: the test's mock factory for `current-program-access` loads a fixture that imports this
    module, so the factory waited on itself. With HEAD's files the test passes in 3 s.
- **`server/services/ana/AnaToolExecutor.ts`.**
  - The private copies are removed and the helpers are imported.
  - `search_all_documents` reads through `programReadScope`: artifacts by `project_id = ANY($4::int[])`, governed
    documents by `project_id = ANY($4::uuid[])`.
  - `validate_cross_references` reads its document by `project_id = ANY($3::uuid[])`. A document outside the scope is
    answered as a missing one.
  - `execute_platform_command` passes `activeProjectRef: ctx.projectRef`. This one line sits outside the listed
    region, and without it no read inside a v2 project could narrow to that project's sponsor.
- **`server/services/ana-ri/command-executor.ts`.**
  - `CommandContext.activeProjectRef` holds the open program uuid.
  - `executeCommands` resolves the scope once per dispatch, before a scoped read runs (`scopeRefusalBeforeRead`). The
    scope is the sharing policy's projects for the person, narrowed to the open project's sponsor when one is open.
    It is computed from the person's identity and the server-pinned open project, never from a project in `params`.
    It is held in a module-private `WeakMap` keyed by the dispatch's context, so neither a caller nor `params` can
    supply one.
  - Each of the eight handlers adds `project_id = ANY($n::int[])` (or `a.project_id = ANY(...)` on the versions join).
    A handler called directly resolves the scope itself.
  - An artifact or project outside the scope reads as no row, so it gets the missing id's answer.
  - A scope that cannot be resolved refuses the read with its code, for example `PROJECT_ACCESS_UNAVAILABLE` or
    `PROJECT_ACTOR_ACCESS_DENIED`.
  - An open project the person cannot open, and one that does not exist, both get `ANA_PROJECT_NOT_FOUND` with the
    same words. `POST /execute` takes the open project from the request body, so the answer must not tell the two
    apart.
  - `listArtifacts` and `checkDossierReadiness` now take `(ctx, params)`, the contract dispatch uses. An omitted
    `projectId` means the open project.
- **Tests.**
  - New: `server/services/ana-ri/__tests__/command-executor-project-scope.pglite.test.ts`, 17 tests through
    `executeCommands`, plus `reviewVersionImpact` directly because it is propose-only.
  - Extended: `ana-vault-tools-project-scope.pglite.test.ts`, 8 new tests for `search_all_documents`,
    `validate_cross_references` and `execute_platform_command` inside a v2 project.

No route, service, table, mount or AnA tool was added. No `server/routes/ana-ri/*` file was touched.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The new tests against HEAD's three source files. 49 tests: 21 fail, 28 pass. The 28 are the 24 trunk tests plus 4 controls: an accessible document is checked, an accessible artifact reads, another organization's artifact was already refused, and a command that reads no artifact is not held to the scope. Each failure is a private or other-sponsor row returned, or the dispatch defect. |
| `02-green.txt` | The same 49 tests on the changed sources: 49 pass. |
| `03-suites.txt` | Run by the lead session after the agent stopped: the new suites, the AnA scope, write-gate, confirm-gate, role-gate, atomicity and reason suites, and every `server/services/ana-ri` suite. 117 files, 1,547 tests, all passing. |

Gates on the changed files:

- `npm run -s ci:sql-interpolation`: interpolations unchanged, 6 in `command-executor.ts`, 12 in `AnaToolExecutor.ts`
  and 0 in `project-scope-admission.ts`. The gate's only problem is in another session's file
  (`enhancedEmbeddingService.ts`, below its baseline).
- `node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD`: "no file changed its warning count since HEAD". Per
  file, before → after: `command-executor.ts` 17 → 17, `AnaToolExecutor.ts` 94 → 94, `project-scope-admission.ts`
  0 → 0, and both test files 0.

## Not done here

- **TMF in `search_all_documents`.** The TMF store is still searched organization-wide. `tmf_artifacts` reaches a
  program only through `tmf_files.study_id` → `clinical_studies.program_id`, and that study is nullable. Its sibling
  `get_tmf_view` is organization-wide too.
- **Other executor reads not in this slice.** None of these has an access check:
  - `list_projects` lists every project in the organization, private ones included.
  - `list_tasks` is declared positionally like `list_artifacts` was, so it fails under dispatch.
  - `load_user_context` lists the organization's projects.
  - `list_milestones` reads by package id.
- **`review_version_impact` with `saveAsArtifact`** writes into `params.projectId`. Its write right is not checked
  here: writes are outside this slice.
- **`POST /api/ana-ri/governed-action`** dispatches with no open project. Its reads are held to the projects the person
  can open, but are not narrowed to a sponsor.
- **`search_artifacts` fallback.** The `ILIKE` fallback ignores `params.projectId`. This predates the change, and the
  fallback stays inside the scope.
- **409 before the access check.** `admitAnaProjectScope` answers `ANA_PROJECT_ANCHOR_UNRESOLVED` (409) before it
  checks access. So a private project with an ambiguous anchor, named as the open project, can be told from a missing
  one. This predates the change and lives in admission.
- **Failures seen while this slice was built.** Two suites failed with this change's three files restored to HEAD:
  - `governed-reason-not-invented.test.ts`, the `update_vault_document` reason check. The cause was the lead session's
    `99666f51b8`, fixed in `3d9eae7298` before this slice was committed; it passes in `03-suites.txt`.
  - `submission-center-tools.test.ts`, `generate_stf`, which this change does not touch. Not investigated here.
- **The full sweep.** The 391-file sweep of every test importing `AnaToolExecutor` timed out after 50 minutes with 43
  files done. The 106 suites that import `command-executor` or `project-scope-admission`, or name a changed tool, were
  run instead.
- **`tsc` and the running app.** `tsc` was not run; the lead runs it. Nothing was exercised in the running app.
