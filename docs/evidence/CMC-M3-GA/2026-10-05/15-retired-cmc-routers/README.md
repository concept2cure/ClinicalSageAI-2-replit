# The CMC routers nothing called are gone before CMC / Module 3 joins the launch catalog

Row **D2** (launch catalog integrity). Found by the GA readiness review of
2026-10-05: routers mounted under `/api/cmc` with **no caller** in `client/src`
or in server code. They carried patterns a launch surface must not have. Once
`cmc` is a launch app, everything under `/api/cmc` is reachable launch surface,
so they were **deleted**, not fixed. Fixing an uncalled router means building
it (zero-duplication rule).

## Why they had to go

- **A model decided a regulatory verdict.** `change-impact-simulator.js` let
  the model pick the filing category (CBE-30, Type II) for a manufacturing
  change. Its own header said so: *"The filing category is still a model's
  verdict (CLAUDE.md Rule 2)."*
- **Disk reads by id with no organization.** `blueprint-generator`,
  `change-impact-simulator`, `manufacturing-tuner`, `preclinical-translator`,
  `global-compliance.js` and `audit-risk-monitor` wrote model output to
  `process.cwd()/output` and served it back from `GET /download/:id`. The id
  came from the caller, and no tenant key was checked.
- **Phantom schema.** `portfolio.ts` wrote to `reg_rpi_snapshots` and read
  `reg_m3_sections.up_stability`. No applier creates either one (both are
  listed in `scripts/ci/tables-live-schema-baseline.json`).
- **A manifest that over-claimed.** `GET /api/cmc/status` was a static list
  that called seven modules "available". Some of them could not work:
  - every `audit-risk-monitor` POST threw after its first model call (it read
    `.choices` from a response that has none; classified 2026-09-23);
  - `manufacturing-tuner`'s `/optimize` threw the same way;
  - `manufacturing-tuner`'s `/analyze` always dropped its structured
    recommendations.
- **A third document store with a hard DELETE.** `documentRoutes.ts` kept
  `cmc_documents`, beside Vault and the governed Module 3 sections. It took
  `created_by` / `updated_by` from the request body and ran
  `DELETE FROM cmc_documents`.
- **A second project store and a second workflow store.** `projectRoutes.ts`
  used `cmc_projects` and `workflowRoutes.ts` used `project_workflows` under
  it, beside the program spine and the unified task board.

`server/services/cmcEvents.js` was reached only from `POST /test-event`, so it
was deleted too. So were three helpers that only the deleted routers reached:
`server/utils/api-security.js`, `server/utils/document-generator.js` (imported
only by `blueprint-generator.js`) and `server/services/cmc/auto-draft-composer.ts`
(imported only by `module3AutoDraftRoutes.ts`).

### Callers checked before deleting

- **Client:** a scan of `client/src` and `ui_kits` for every `/api/cmc/*`
  literal found nothing for any of these paths. The live CMC client calls
  registers, `module3-os`, `module3-board`, `agency-questions`,
  `specifications`, `batch-records`, `quality/qbd`, `control-strategy`,
  `ich-compliance` and `stability-studies/*`.
- **Server:** `git grep` found no importer of any deleted file other than
  `register-core-routes.ts`, the aggregator `index.js` and `blueprintRoutes.ts`
  (which mounted `portfolio.ts` and `playbookRoutes.ts`), and tests and CI
  baselines.
- **Deletion history** (`git log --all --diff-filter=D -- 'server/api/cmc/*'`)
  shows one prior commit: `917289202` *Four cross-tenant reads on CMC routers
  no client calls*. It removed `/api/cmc/collaboration` and fixed reads on
  `workflowRoutes.ts` for the same reason: routers no client calls. Nothing in
  this set was built to replace an earlier deleted surface.

**Found still called: nothing.** `scripts/reg-auto-check.mjs` calls
`/api/cmc/blueprint/regulatory/*`, but those paths already 404'd before this
change: their `regulatoryIR` router was deleted earlier (see the header of the
former `blueprintRoutes.ts`). The script is not wired into `package.json` or CI.
It is left as found.

## What was deleted, and what now delivers the outcome

| Deleted | Mount | Now delivered by (path) | Proven reachable by |
|---|---|---|---|
| `server/api/cmc/index.js` (GET /status, POST /test-event) + `server/services/cmcEvents.js` | `/api/cmc` | No replacement. A static manifest and a non-production event hook, not user outcomes. | — |
| `cmc-copilot.js` | `/api/cmc/cmc-copilot` | AnA's CMC tools `find_cmc_guidance`, `get_cmc_requirements`, `explain_cmc_topic` (`server/services/ana/cmc-knowledge-tools.ts`); `POST /api/cmc/control-strategy`, `POST /api/cmc/ich-compliance` (`server/api/cmc/routes.ts`) | `server/services/ana/__tests__/cmc-knowledge-tools.test.ts`, `cmc-knowledge-registration.test.ts`; `scripts/dev/cmc-staff-simulation.sh` step 3b (`ich-compliance`); `server/api/cmc/__tests__/cmc-write-role-gate.test.ts` |
| `change-impact-simulator.js` | `/api/cmc/change-impact-simulator` | `POST /api/cmc/variations/classify` (`routes.ts` → `server/services/cmc/supac-classifier`, deterministic); `/api/cmc/change-control` (`routes.ts`); governed changes `POST /api/cmc-changes` | staff simulation step 9 (`/api/cmc-changes`); `server/routes/__tests__/cmc-changes-read.test.ts`; `cmc-write-role-gate.test.ts` (`variations/classify`) |
| `blueprint-generator.js`, `blueprintRoutes.ts` | `/api/cmc/blueprint-generator`, `/api/cmc/blueprint` | `GET /api/cmc/quality/qbd/:projectId` (`server/services/cmc/qbd-analyzer.ts`), `POST /api/cmc/control-strategy` (`control-strategy-generator.ts`); Module 3 drafting → `POST /api/cmc/module3-os/compile/:projectId` | staff simulation step 11 (compile); `server/services/cmc/__tests__/cmc-analysis-tenancy.pglite.test.ts` |
| `manufacturing-tuner.js`, `preclinical-translator.js`, `global-compliance.js`, `audit-risk-monitor.js` | `/api/cmc/<name>` | The registers in `server/api/cmc/routes.ts` and its deterministic stability estimators: `POST /api/cmc/stability-studies/:id/shelf-life`, `/:id/trending`, `/stability-studies/poolability`. **No replacement** for the model's process-tuning advice, scale-up / batch-record drafts, per-region rewrites or the audit-risk monitor. These were model prose on local disk, never a governed record, with no caller, and partly never working (above). They were deleted as uncalled and ungoverned, not migrated. `server/routes/global-compliance.ts` is a different, live router and is untouched. | staff simulation step 11c (shelf-life, trending); `server/api/cmc/__tests__/stabilityPoolabilityRoute.test.ts` |
| `projectRoutes.ts` | `/api/cmc` (`/projects/*`) | The program spine `/api/c2c/projects` (`server/routes/c2c/projects.ts`) and the Module 3 project guard (`server/api/cmc/module3-project-guard.ts`). `GET /api/cmc/projects/:projectId/process-capability` was always served by `routes.ts` and stays. | staff simulation step 2 (`POST /api/c2c/projects`) and 11b-cap (process-capability); `server/api/cmc/__tests__/module3ProjectScope.test.ts` |
| `workflowRoutes.ts` | `/api/cmc/workflows` | The unified task board `/api/tasks` (`server/routes/taskManagement.routes.ts`); governed CMC drafting → `POST /api/cmc/module3-os/compile/:projectId`, `/build-section/:projectId/:sectionKey` | `client/src/concept2cure/v2/__tests__/collabAutoAssignHonesty.test.tsx` (`/api/tasks/tasks`); `server/api/cmc/__tests__/buildSectionCanonical.test.ts` |
| `playbookRoutes.ts` (under `/api/cmc/blueprint/playbook`) | `/api/cmc/blueprint/playbook` | `/api/tasks` (workflows, checklists); `POST /api/cmc/control-strategy` (the guidance the playbook's placeholder stood in for) | as above |
| `portfolio.ts` (under `/api/cmc/blueprint/portfolio`) | `/api/cmc/blueprint/portfolio` | `GET /api/cmc/module3-board` (`server/routes/cmc-module3-board.routes.ts`): the same `reg_submissions` / `reg_questions` read and RPI engine, with honest nulls | the v2 CMC surface (`client/src/concept2cure/v2/surfaces/CmcModule.tsx`, 24 `/api/cmc/module3-board` references in client code); staff simulation step 24 |
| `documentRoutes.ts` | `/api/cmc/documents` | Vault: `POST /api/vault/ingest` (`server/routes/vault-ingest.ts`), linked to the Module 3 record it evidences by `/api/cmc/module3-os/source-evidence` (`sourceEvidenceRoutes.ts`); authored content → Authoring and the governed sections `/api/cmc/module3-os/sections` | staff simulation steps 21 and 21b (vault ingest, source evidence) |
| `module3AutoDraftRoutes.ts` + `server/services/cmc/auto-draft-composer.ts` | `/api/cmc/module3` | An upload becomes a canonical source through `POST /api/cmc/module3-os/classify-artifact/:projectId` (`module3ConvergenceRoutes.ts`). Module 3 is composed by `POST /api/cmc/module3-os/compile/:projectId` and `/build-section/:projectId/:sectionKey`, with lineage and provenance. The deleted route was a preview that could not write. | staff simulation step 11; `buildSectionCanonical.test.ts`; `module3OperatingSystemRoutes.test.ts` |

Tests that tested only deleted code were deleted:
`server/api/cmc/__tests__/cmc-drafting-governance.test.ts` (blueprintRoutes /
playbookRoutes), `ai-command-inputs.contract.test.ts` (workflowRoutes),
`module3AutoDraftRoutes.test.ts`, `tests/cmc-portfolio-routes.test.ts`,
`server/services/cmc/__tests__/auto-draft-composer.test.ts`.

## The authentication projectRoutes.ts performed is kept

`projectRoutes.ts` was mounted on bare `/api/cmc` and began with
`router.use(authenticateToken)`. That ran for **every** `/api/cmc` request that
reached it: everything mounted below it, including specifications, batch
records and the four `module3-os` routers.

In production the `/api` boundary enforces authentication. In development,
staging and test it only warns and lets the request through
(`server/middleware/authBoundary.ts`). There, this router-level call was the
authenticator for those mounts.

Deleting the router must not delete that. `register-core-routes.ts` now mounts
`app.use('/api/cmc', authenticateToken)` exactly where `projectRoutes` was:
after the write-role gate and `routes.ts`, before every sub-mount. The pin test
asserts that no `/api/cmc/*` sub-mount sits above it unless it carries its own
`authenticateToken`.

## Schema: nothing dropped (CLAUDE.md RULE 1)

No migration file and no `C2C_MIGRATION_FILES` entry was changed. The 358
entries are identical to HEAD (checked by importing both versions).

The tables the deleted code used stay where they are:

- `migrations/20260919_cmc_playbook_schema.sql` still creates the five playbook
  tables. They stay inside the tenant sweep, and tenant offboarding still purges
  them.
- `cmc_projects` is still FK-referenced by `migrations/0006_regulatory_atoms.sql`.
- `project_workflows` is still written by `routes.ts`.

Only comments in `scripts/db/migration-set.mjs` changed, each one dated.
`tests/schema-contract/cmc-playbook-schema.contract.test.ts` keeps its
migration-level assertions: on the applier, above the sweep, `organization_id`
on all five tables, 12 seeded templates. It dropped the assertions that planned
SQL extracted from the deleted handlers.

## The pin, red then green

`server/api/cmc/__tests__/cmc-retired-routers.contract.test.ts` is static. It
reads source, so it names the file and line it objects to. It pins five things:

1. no retired file exists, under `.ts` or `.js`;
2. `register-core-routes.ts` imports none of them;
3. nothing is mounted on `/api/cmc/blueprint`, `/workflows`, `/documents` or
   `/module3` (compared exactly; `/module3-os` and `/module3-board` are live);
4. no `/api/cmc/*` sub-mount sits above the bare `authenticateToken`;
5. no `client/src` file calls a retired path.

A control check confirms that the live mounts are still found.

- **Before** (`red-pin-test-before.txt`, run on the unchanged tree at HEAD
  `35095fedd`): **4 failed, 2 passed**.
  - 17 retired files present;
  - 6 imports, at `register-core-routes.ts:10,11,12,16,21,22`;
  - 4 retired mounts, at `:76` `/api/cmc/blueprint`, `:87` `/api/cmc/workflows`,
    `:94` `/api/cmc/module3` and `:122` `/api/cmc/documents`;
  - no bare authenticator.

  The client-scan check and the control passed: no client called these paths.
  The three helper modules were added to the retired list after this run.
- **Routed before** (`before-routed.txt`): mounting HEAD's `index.js` at
  `/api/cmc` answers `GET /api/cmc/status` with **200** and seven modules
  "available". The pre-change mount lines are listed there.
- **After** (`green-pin-test-after.txt`): **13 passed**. That count covers this
  test, `cmcConvergenceMap.test.ts` and `cmc-route-uniqueness.contract.test.ts`.
- **Checks shown failing on the case they exist to catch, on the after tree**
  (`probes-check-fails.txt`; each mutation was reverted):
  - a `client/src` file calling `/api/cmc/cmc-copilot/query` fails the client
    scan;
  - moving the bare authenticator below `/api/cmc/specifications` fails the
    ordering check, naming `register-core-routes.ts:116`;
  - the HEAD convergence map fails the new "lists only files that exist" test
    on the four retired routers and `server/routes/cmc-dashboard.ts`, which was
    already gone.

## Other references updated

- `server/api/cmc/__tests__/cmc-route-uniqueness.contract.test.ts`: the routers
  on bare `/api/cmc` are now **read** from `register-core-routes.ts`, not
  listed by hand. A hand list naming only `routes.ts` could never find a
  collision.
- `server/api/cmc/cmcConvergenceMap.ts` and its test: removed the four retired
  routers and the already-missing `cmc-dashboard.ts`. Added "lists only files
  that exist" and "lists each file once".
- `cmc-js-model-task-types.contract.test.ts`: dropped the entries for the three
  deleted JS routers and `document-generator.js`. `indCopilot.js` keeps its pin.
- `cmc-write-role-gate.test.ts`: its DELETE example used `/api/cmc/documents/1`.
  It now uses a live prefix, because no DELETE route remains under `/api/cmc`.
- CI baselines:
  - `unapproved-model-pins` lost 3 files and 20 pins (54 → 34);
  - `tenant-resolvers` lost 3 modules (188 → 185);
  - `drizzle-tenant-scope` lost the 24 `projectRoutes.ts` sites;
  - `unbacked-tables` and `tables-live-schema` lost `portfolio.ts` and the
    `reg_rpi_snapshots` entry (23 → 22 and 40 → 39);
  - `duplicate-table-ddl` has a dated note on its `compliance_tracking` reason;
  - `check-js-ts-shadows` dropped `server/api/cmc/index.js` from its allowlist.
- Comments: `check-org-path-param-guards` (+ selftest), `migration-set.mjs`,
  `qbd-analyzer.ts`, `control-strategy-generator.ts`, `module3Composer.ts`,
  `shared/cmc-schema.ts`, `client-intelligence.ts`, `cmc-module3-board.routes.ts`,
  `register-clinical-intel-routes.ts`, the ga-demo seed (`80-programs-tlf-pdev.mjs`)
  and the compliance-tracking schema contract.
  `server/betaRouteManifest.ts` names an unrelated `projectRoutes` (510k), so it
  is unchanged.

Not touched, by agreement with the session editing them:
`server/api/cmc/routes.ts`, whose comments at about `:2074` ("The
blueprint-generator route keeps its type-string heuristics") and `:2155` ("the
fallback playbook string") now describe deleted code. Also untouched: the
migration SQL comments, which name the deleted files and are history.

## Verification

| Check | Result |
|---|---|
| `npx vitest run server/api/cmc server/bootstrap server/services/cmc` | **60 files, 992 tests passed**. Includes in-progress tests from the concurrent session. On an earlier run, `registered-routers-load` timed out once at 10 s importing the unrelated `../routes/chat`; alone it passes 334/334, and the re-run of the full set was clean. |
| `tests/schema-contract/cmc-playbook-schema` + `cmc-compliance-tracking-tenancy` | 15 passed |
| `ci:unapproved-model-pins` (+selftest), `ci:duplicate-table-ddl`, `ci:unbacked-tables`, `ci:drizzle-tenant-scope` (+selftest), `ci:unreferenced-modules` (82 = baseline 82), `ci:org-path-param-guards` (+selftest), `ci:js-ts-shadows`, `ci:tenant-resolvers` (+selftest), `ci:migration-drop-safety`, `ci:audit-route-mounts:no-regression`, `ci:route-ownership-matrix:check`, `ci:check-client-api-calls`, `ci:runtime-ddl` | all exit 0 |
| `ci:tables-live-schema` | not runnable here: it needs a provisioned `DATABASE_URL`. The baseline only shrank. |
| `node scripts/ci/check-eslint-warning-ratchet.mjs --since origin/concept2cure-v2` | net **−67**, no file increased |
| `NODE_OPTIONS=--max-old-space-size=12288 tsc --noEmit -p tsconfig.check.json` | **one error, not from this change**: TS2352 at `server/api/cmc/routes.ts:856` (`row as LinkableRow`). It is in code committed concurrently as `f4110503a` (signed CMC records), in a file this change does not touch. It was present in that session's working tree before it committed, and it is the only error in the output. Every file this change touches type-checks. |
