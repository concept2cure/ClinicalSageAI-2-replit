# F1-A: AnA's citation routes hold to the projects the person can open (2026-11-05)

## The defect

`server/routes/ana-features.ts` is mounted as `app.use('/api/ana', authenticateToken, weeklyRequestLimit, …)`
(`server/bootstrap/register-ai-routes.ts:27-29`). Each route under `/citations` carried `requireOrganizationContext`
and nothing else. Every service it called filtered by the organization, plus the artifact id, run id or project id from
the URL. No route checked whether the person could open that project.

So a member of the organization could do all of the following by id, for a private project and for another sponsor's
project:

- read a governed artifact's citations: each sentence's `text` and its sources (`GET /citations/:artifactId`, then
  `getCitationsForArtifact`, `citation-engine.ts:785`);
- read its gaps and expectations, its run history, any single run's full citations, and a diff of two runs;
- export the artifact as CSV, JSON or a DOCX with its ledger;
- read every project-level view: rollup, stale list, trends, section coverage, graph, search, gaps by rule, export,
  snapshot, diff and readiness impact. These return artifact titles, CTD sections and citation payloads.

The write routes had the same gap, without needing the edit right:

- a member started a citation run (`POST /citations/run`) or a batch run (`POST /citations/projects/:projectId/batch-run`)
  on a project they could only read, or could not open at all;
- any member pruned the run history of every project in the organization (`POST /citations/runs/prune`).

`01-red.txt` shows it: on the unchanged router, `GET /citations/a-priv` answers 200 to a member who cannot open the
private project, with `"text":"Private claim sentence."`.

## What already exists

- **The routes.** `grep -n "'/citations" server/routes/ana-features.ts` lists 26. Of these, 22 read or change project
  data, and all 22 are covered here:
  - `POST /citations/run`;
  - `GET /citations/:artifactId`, with `/gaps`, `/expectations`, `/runs` and `/export`;
  - `POST /citations/:artifactId/export.docx`;
  - `GET /citations/runs/:runId` and `/runs/:runId/diff`;
  - `POST /citations/runs/prune`;
  - 11 `GET /citations/projects/:projectId/…` routes;
  - `POST /citations/projects/:projectId/batch-run`.

  Three need no admission: `GET /citations/gap-rules` and `/gap-rules/:sectionCode` return static rule tables, and
  `GET /citations/health` is covered under "Not done here".
- **The sharing policy.** `server/services/report-os/project-access.ts`: `canAccessReportProject(org, actor, projectId,
  q, { forWrite? })`. Read access includes a live review assignment. Write access means an owner or edit membership, or
  the organization's project management role (`server/services/project-sharing-access.ts`, `canEditProject`,
  `hasOrganizationProjectManagementRole`).
- **The actor.** `readCurrentProgramActor(q, { organizationId, userId })` (`server/services/c2c/current-program-access.ts:109`)
  reads the current membership. Its failures are `ProgramReadAccessError`: 403 for someone who is not a current member,
  503 when the membership cannot be read.
- **The pattern followed.** `artifactProjectRefusal` in `server/routes/artifacts-center-routes.ts:152`. It takes the
  actor from `authedUserId(req)`, uses `canAccessReportProject` on the artifact's project, and answers 404 as an id of
  nothing. A `ProgramReadAccessError` keeps its own status, and any other failure is a 503. The F1 reference is
  `projectReadScope` in `server/services/ana/AnaToolExecutor.ts`, about line 21080, with its suite
  `ana-vault-tools-project-scope.pglite.test.ts`.
- **`projectAdmissionMiddleware`** (`server/routes/c2c/project-access.ts:547`, used through `router.param` by the c2c
  routers) was considered and does not fit:
  - `router.param('projectId', …)` binds the name for the whole router. This router has eight other `:projectId` routes
    (memory, readiness aggregate, therapeutic context and area, consistency scan, authoring plans), and they are not
    part of this change.
  - Its read path decides through `loadProjectAccessRow` on the claimed client workspace, not `canAccessReportProject`.
  - It covers only `:projectId`. The artifact and run routes, which are most of these, would still need their own check.
- **`authorizedProjectId`** (`server/routes/c2c/artifact-project-scope.ts`) translates a c2c URL's project (an integer
  or a program UUID) and calls `verifyProjectAccess`. These routes name an integer project or an artifact, so they need
  no translation.
- **The services.** The project functions in `citation-engine.ts`, `citation-graph.ts`, `citation-search.ts` and
  `citation-export.ts` already filter by `project_id` and `organization_id`, so admitting the project at the route is
  enough. No service was changed. `concept2cure_artifacts.artifact_id` is UNIQUE and `project_id` is NOT NULL
  (`shared/schema.ts`, `migrations/0000_sweet_joseph.sql:1870`). So the artifact the gate resolves is the row every
  citation read reads.
- **Searches run.**
  - `grep '/citations'` in `ana-features.ts`.
  - `grep canAccessReportProject(` and `grep projectAdmissionMiddleware` across `server/`.
  - `grep authorizedProjectId` in `server/routes/c2c`.
  - Client callers of `/api/ana/citations`: none in `client/src`.
  - Existing tests of these routes: `record-exports-recorded.test.ts` and
    `ana-docx-export-refusal-names-the-ai-use-record.test.ts`.
  - `git log --all --diff-filter=D -- '*citation*'`: deleted citation UI and old service tests, but no deleted access
    gate.

## What changed

**`server/routes/ana-features.ts`, the citations section only (219 lines added, none removed).** A small admission
helper sits at the head of the section, and each of the 22 routes has one middleware added after its rate limiter. No
handler body changed. The middleware:

1. Reads the current member: `readCurrentProgramActor` on the actor from `authedUserId(req)`, which comes from the
   token. Someone who is not a current member gets 403 `PROJECT_ACTOR_ACCESS_DENIED`. This happens before any artifact
   is looked up, so a former member learns nothing about which ids exist.
2. Resolves the projects the request reaches:
   - the `:projectId` it names, parsed by the route's own `projectIdParam`;
   - the artifact's `project_id`, for `:artifactId`, or `body.artifactId` parsed by the route's own `runCitationsSchema`;
   - for a run, both the run's recorded `project_id` and its artifact's `project_id`. A run whose artifact is gone
     reaches no project.

   Malformed input is passed on to the handler, which gives its own 400. The parsers are the routes' own, so nothing
   the handler would serve gets past unchecked.
3. Admits each project with `canAccessReportProject`. If one fails, the route answers as it does for an id of nothing,
   with the same status and words:

   | Route | Answer for an unopenable or missing id |
   |---|---|
   | Artifact reads and exports | 404 `Artifact not found` / `ARTIFACT_NOT_FOUND` |
   | `POST /citations/run` | 404 `Artifact not found: <id>` |
   | `/:artifactId/runs` | 200 with an empty history: `{ artifactId, total: 0, runs: [] }` |
   | A run | 404 `CITATION_RUN_NOT_FOUND` |
   | A run diff | 404 `CITATION_RUN_DIFF_NOT_FOUND` |
   | A project route | 404 `Project not found` / `PROJECT_NOT_FOUND` |

   A project route now answers the same 404 for a project that does not exist. Before, it answered with an empty
   rollup.
4. Writes need more:
   - `POST /citations/run` and `batch-run` also need the project's edit right
     (`canAccessReportProject(…, { forWrite: true })`). Without it they answer 403 `PROJECT_WRITE_PERMISSION_DENIED`
     and nothing runs.
   - `POST /citations/runs/prune` deletes run history across every project in the organization. It needs the
     organization's project management role, which is the policy's grant of every project's edit right. Without it, the
     answer is 403 and nothing is pruned.
5. When a check cannot run (the membership, the sharing policy, or the artifact or run lookup), the answer is 503
   `PROJECT_ACCESS_UNAVAILABLE` and the failure is logged. It is never an empty answer.

Condition 2 (narrowing to the open project's sponsor) does not apply. Every admitted route names one project, one
artifact or one artifact's runs, and the person must be able to open it.

**Tests.**

- **New:** `server/routes/__tests__/ana-citations-project-scope.pglite.test.ts`, 41 tests. It runs the real router
  through supertest on PGlite, with the real sharing policy and no access stubs. The fixture has:
  - one organization with two sponsors;
  - an org-public project (10) with an edit member (8);
  - a private project (12) owned by 9;
  - another sponsor's public project (13);
  - another organization's project (20);
  - an administrator (6), a member (7) and a former member (5).

  Four things are recorded calls, so the suite sees only who reaches them: the engine's run and batch, the DOCX ledger
  exporter (which answers a file for any artifact of the organization, as its own read does) and the pruner.
- **Extended:** `record-exports-recorded.test.ts` and `ana-docx-export-refusal-names-the-ai-use-record.test.ts`. They
  exercise the citation downloads, and their caller is now admitted to the artifact's project: the policy is stubbed to
  admit, and the pool answers the artifact's project. Both suites test export recording and the ledger refusal wording,
  which is unchanged.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The new suite on the unchanged router (`git show HEAD:server/routes/ana-features.ts`): **33 failed, 8 passed (41)**. The private artifact's sentences, runs and exports are returned, project routes answer 200 or 500 for private and missing projects alike, a read-only member runs citations and batches, a member prunes, and failed checks still answer with data. The 8 that pass are the regression guards: accessible reads, the owner's diff, the editor's run, the project reads, and the routes' own 400s. |
| `02-green.txt` | The same suite on the changed router: **41 passed (41)**. |
| `03-suites.txt` | 17 suites that reach `ana-features.ts` or the citation services, including the new one: **17 files, 148 tests passed**. Also the gates: the ESLint ratchet `--since HEAD` reports no file changed its warning count (`ana-features.ts` 16 before and 16 after; the test files 0). `ci:sql-interpolation` names none of these files. |

The red run was made by saving the changed router to the scratch area, writing HEAD's version over it, running the
suite, then copying the changed version back, checked identical with `cmp`. The router's diff against HEAD was
additions only, so no other session's work was in the file.

## Not done here

- **`GET /citations/health`** is shadowed: `GET /citations/:artifactId` is registered earlier and answers
  `/citations/health` as an artifact named `health` (404), before this change and after it. If it is ever reached, it
  returns organization-wide counts across every project, private ones included (`server/services/ana/citation-health.ts`).
  Fixing the order, and deciding who may read those counts, belongs to whoever owns that service.
- **The edit right is checked once, before the run.** It is read on the shared pool and not held through the citation
  run, which is a long retrieval call. A permission revoked during a run does not stop that run. The reference holds it
  in a transaction (`AnaToolExecutor` `artifactEditRefusal`). That is not practical around a retrieval run without
  restructuring the engine.
- **Orphaned runs.** These are runs whose artifact row no longer exists. Their artifact's project cannot be resolved,
  so they are answered as missing: an empty history, or a 404 for the run. Before this change they were listed by
  artifact id.
- **Archived projects.** A run or batch on an archived project is not refused here. The c2c admission does refuse it
  (`PROJECT_ARCHIVED`), but `canAccessReportProject` has no such rule.
- **Not run:** `tsc` (the lead runs it) and the running app. No screen calls these routes; `client/src` has no caller.
