# F1-D: the shared evidence retrieval holds to the projects the person can open

Date: 2026-11-05. Lane: F1 cross-sponsor reads (Vault parity session, plan §3a, P-100).

## The defect

`searchHybrid` and `searchSimilar` in `server/services/enhancedEmbeddingService.ts` rank `lumen_data_atoms`.

- With no project, they ranked every atom in the organization.
- With a project, they trusted it. The filter was `source_id IN (SELECT artifact_id … WHERE project_id = $7)`, built as an interpolated SQL fragment.

Four routes reached them with no project, or with a project nobody had checked against the person:

| Route | What it did |
|---|---|
| `POST /api/evidence/ask` (`server/routes/evidence-ask.ts`) | It checked `projectId` only with `SELECT 1 FROM projects WHERE id=$1 AND organization_id=$2`. That proves the project is the organization's, not that the person can open it. With no `projectId`, it searched the whole organization. It returned the snippets and grounded a model answer on them. |
| `POST /api/cortex/query`, `mode:'search'` (`server/routes/cortexQueryRoutes.ts`) | It called `searchHybrid` with no project. `context.projectId` was ignored. |
| `POST /api/cortex/query`, `mode:'graph'` | It called `searchSimilar` across the organization. Its edge query named the titles and types of any of the organization's atoms at either end of an edge. |
| `POST /api/deep-research/document/generate` (`server/routes/deep-research.ts`) | It called `retrieveDataRoomEvidence` (`server/services/data-room-retrieval.ts`) with no project, and put the hits into each section's prompt. |

So a member got a private project's evidence back, or a model answer grounded on it. Inside a CRO, they also got other sponsors' evidence. The founder's rule, 2026-11-05: a CRO works across authorized sponsor projects "without mixing sponsor data or permissions".

## What already exists

Searches run:

- `grep -rn "searchHybrid\|searchSimilar\|retrieveDataRoomEvidence"` over the repository, excluding `node_modules`.
- `grep -rn "readCurrentProgramActor(\|getAccessibleReportProjectIds("` in `server/routes`.
- `grep -rn "allowedProgramIds\|sourceReadScope"` in `server/services`.
- `grep -rn "INSERT INTO lumen_data_atoms"` in `server`.
- `grep -rln "cortexQueryRoutes\|evidence-ask\|data-room-retrieval\|enhancedEmbeddingService"` in the test directories.

| Piece | Path | What it does |
|---|---|---|
| Project sharing policy | `server/services/report-os/project-access.ts` | `getAccessibleReportProjectIds` and `canAccessReportProject`. Used as-is. |
| Current actor | `server/services/c2c/current-program-access.ts` | `readCurrentProgramActor` gives the actor. `getCurrentAccessibleProgramScope` and `verifiedProgramAnchors` give the verified programs. Used as-is. |
| Reference implementation | `server/services/ana/AnaToolExecutor.ts` | `projectReadScope` and `programReadScope` are the same policy for AnA's Vault tools. Its test, `ana-vault-tools-project-scope.pglite.test.ts`, gave this suite its fixture approach. |
| Atom search | `server/services/enhancedEmbeddingService.ts` | `searchHybrid` and `searchSimilar`. Extended; no new search. |
| Data Room retrieval | `server/services/data-room-retrieval.ts` | `retrieveDataRoomEvidence` has a three-state outcome (`ok`, `empty`, `failed`). Extended. |
| Router program filter | `server/services/ragRouter.ts` → `advancedRAGPipeline.ts` | `ragRouter.query` and `ragRouter.retrieve` already accept `filters.allowedProgramIds`. `buildDocFilterClause` (`server/services/rag-filters.ts`) binds it as `d.program_id = ANY($n::uuid[])` on every Vault arm. They also accept `sourceReadScope` (`admitAnaSourceReadScope`), which refuses `persistCitations`. |
| Callers already admitted | `server/routes/c2c/ai-editing.ts`, `server/routes/chat/send-message.ts` | `ai-editing.ts` admits its project with `requireProjectAdmission`. `send-message.ts` admits its project with `admitAnaProjectScope`. |
| Not changed here | `server/services/advancedRAGPipeline.ts` | `searchProjectAtoms` passes one project from `artifactScope`. Out of this lane's files. |
| Existing tests | `server/routes/__tests__/evidence-ask.test.ts`, `deep-research-retrieval-status.test.ts`, `cortexQueryRoutes-error-containment.test.ts`, `o01-ai-authoring-audits.pglite.test.ts`, `server/services/__tests__/enhancedEmbeddingService.source-identity.test.ts`, the `send-message-*` and `ai-editing-*` suites | Extended where they named the old option. |
| Real-database tests | `tests/db/atom-search.dbtest.ts`, `atom-search-tenant-key.dbtest.ts`, `retrieval-floor.dbtest.ts`, `cortex-query-tenant-header.dbtest.ts`, over `tests/db/two-tenant-fixture.ts` | The D3 tenant-key and D4 retrieval-floor proofs. Their atoms belonged to no project, so they were updated (see What changed). |

Nothing new was added: no route, service, table, mount or AnA tool.

## What changed

- **`searchHybrid` and `searchSimilar` take a required project scope** (`AtomSearchProjectScope`, `projectIds: readonly number[]`). They rank only the atoms of those projects' artifacts. The SQL is written out: `a.source_type IN ('artifact','data_room_upload') AND a.source_id IN (SELECT artifact_id FROM concept2cure_artifacts WHERE project_id = ANY($n::int[]))`. The interpolated `projectFilterClause` is gone, so the file's interpolation count goes from 9 to 8.
  - A missing or malformed scope throws `atom search refused: no project scope`.
  - `[]` returns nothing, before the embedding call.
  - `searchSimilar`'s fourth argument is now `{ organizationUuid, projectIds }`.
  - The single `projectId: string` form remains, marked deprecated, for its one remaining caller, `advancedRAGPipeline.ts`. That caller passes a project it was given, as before.
- **`readDataRoomProjectScope`** (`data-room-retrieval.ts`) computes the scope:
  - If the person names a project they can open (`canAccessReportProject`), the scope is that project.
  - If they name none, it is every project they can open (`getAccessibleReportProjectIds`, with the actor from `readCurrentProgramActor`).
  - A project they cannot open throws `ProgramReadAccessError` 404 `PROJECT_NOT_FOUND`, the same answer as a project that does not exist.
  - With no current member, it throws 403.
  - A check that cannot run throws 503 `PROJECT_ACCESS_UNAVAILABLE`.
  - `retrieveDataRoomEvidence` now requires `projectIds`.
- **`POST /api/evidence/ask`** replaces the organization-only check with that scope.
  - A project the person cannot open answers `404 {error:'Project not found', code:'PROJECT_NOT_FOUND'}`. These are the words a missing project already got.
  - A check that cannot run is a 503 with its code. No search runs and no model is called.
  - The prompt's "organization-wide" scope line now names the projects the user can open.
- **`POST /api/cortex/query`** computes the scope from the person, and from `context.projectId` when it is given, for every mode:
  - Search passes `projectIds`.
  - Graph passes them to `searchSimilar`. Its edge query requires both ends of an edge to be atoms of those projects, written out with `$3::int[]`.
  - Generate and advisory pass `filters.allowedProgramIds`: the verified programs of those projects (`getCurrentAccessibleProgramScope` and `verifiedProgramAnchors`).
  - A refusal answers with its status and code. A project the person cannot open answers `404 Project not found`.
- **`POST /api/deep-research/document/generate`** computes the person's accessible projects once, before any section, and passes them to every retrieval. A check that refuses or cannot run is an error with its code, and nothing is generated.
- **The already-admitted callers** now pass `projectIds`:
  - `ai-editing.ts` passes `[admittedProject.id]`, in both places.
  - `send-message.ts` passes `[turnProjectId]`. With no project, it passes the accessible list. If that list cannot be read, the retrieval step fails as an outage does (`retrievalStatus: 'unavailable'`).
  - `send-message.ts` used to pass the raw `project_id` string. For a program uuid, `Number(uuid)` was `NaN` and the search failed. It now passes the admitted integer.

- **The four real-database suites** keep their proofs. Their atoms are now artifact atoms of the two-tenant fixture's projects, and every search carries `projectIds`.
  - The tenant-key refusals (`TenantKeyRequiredError`, `TenantScopeMismatchError`) are proved with a scope present.
  - The owner-connection cases name tenant B's project in the scope, so the organization filter alone is what holds.
  - The route suites rely on the fixture's users creating their projects, which lets them open them.
  - `atom-search.dbtest.ts` makes a second project for tenant A (`${TAG}-project-A2`, removed by the fixture's teardown by name) and adds the not-named-project case.
  - `two-tenant-fixture.ts` was not changed.

Behaviour change to note: `searchHybrid` and `searchSimilar` no longer rank atoms that belong to no project's artifact. These are atoms with `source_type` `chat_upload`, `clinical_regulatory_evidence`, `project_memory` and `document`. Until now they were reachable only through the organization-wide search.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The new suite, `server/routes/__tests__/evidence-retrieval-project-scope.pglite.test.ts`, against HEAD's seven source files: 17 failed, 1 passed. The one that passes is the positive control, "a named project the person can open: that project only", which the old code also served. |
| `02-green.txt` | The same suite on the changed source: 18 passed. |
| `03-suites.txt` | The new suite and the 27 existing suites that cover the changed files: 28 files, 195 tests passed. Before the change, the 27 existing files passed 177 tests. It also records both gates. |
| `04-db-green.txt` | The four real-database suites, on PostgreSQL 16 with pgvector, as the runtime role with RLS enforcing: 4 files, 23 tests passed. Before their update, the change failed 13 of 22 cases. One case is new: an atom of a second project of the same tenant, which the scope does not name, is not returned, and is returned when the scope names it. |

The suite runs the real sharing policy and the real search SQL on PGlite, with these stand-ins:

- `vector` is a domain over text, and `search_atoms_hybrid` and `<=>` are stand-ins. The stand-in ranks the newest atom first, so a private atom would outrank the open ones.
- The model, the embedding provider, `ragRouter`, auth and licence are stubs.

It covers, for evidence-ask, cortex search and graph, and deep-research generate:

- a private project's atoms are not returned or sent to a model;
- a named private project is answered exactly as a missing one, before any search;
- the projects the person can open still return;
- an access check that cannot run is a 503 with its code, and no search runs.

It also covers cortex generate and advisory: the Vault filter is bound to the open projects' programs, and a private project is refused before the Vault is read.

Gates:

- `node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD` exits 0: no file changed its warning count.
- `npm run -s ci:sql-interpolation` reports one problem: `enhancedEmbeddingService.ts: now 8 (baseline 9)`. That is a shrink. The lane's rules forbid regenerating a baseline, so lowering the entry in `scripts/ci/sql-interpolation-baseline.json` to 8 is left to the lead.

## Not done here

- **The real-database suites were run once, on one database** (`platform_ci_vault_fixture_s6v2`; `04-db-green.txt`).
  - The RLS-disabled mutation run in the D3 evidence was not repeated.
  - `tests/db` is outside `tsconfig.json`'s include, so `tsc` does not check them.
- **`advancedRAGPipeline.ts`'s `searchProjectAtoms` still passes a single `projectId`** from `artifactScope` (the deprecated form). Whether each `artifactScope` caller admitted its project was not checked here. The callers are `submission-chat-*-handler.ts`, `AnaToolExecutor.ts`, `authoring-plan-generator.ts` and `citation-engine.ts`.
- **Inside an open project, the sponsor narrowing (`narrowToSponsorOf`) is not applied.** No route here spans projects while a project is open:
  - A named project reads that project only.
  - A request with no project reads every project the person can open.
  - Deep research's document generation takes no project, so it draws on the open projects of every sponsor the person works for. A project parameter would let it narrow.
- **An outage inside evidence-ask's search is still answered as an empty result,** `422 NO_ADMISSIBLE_EVIDENCE`. That behaviour predates this change.
- **Atoms that belong to no project's artifact are no longer reachable through these searches.** Notably, clinical-regulatory evidence atoms are keyed by program. Reaching them by the person's programs would need a program join; this change did not add one.
- `GET /api/evidence-asks` (`server/routes/evidence-asks.routes.ts`) reads the organization's most recent ask. It was not examined.
- `tsc` was not run, per the lane's rules.
