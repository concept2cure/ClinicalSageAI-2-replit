# F1: AnA's governed-artifact and governed-document reads hold to the person's projects and the open sponsor (2026-11-05)

A repair of shipped behaviour (package F1), found by a read-only sweep and confirmed here. It brings AnA's reads onto the
founder's statement of 2026-11-05:

> "For CROs, that also means working across authorized sponsor projects without mixing sponsor data or permissions.
> One platform and one catalog architecture do not mean unrestricted sharing across clients."

## The defect

Seven AnA tools in `server/services/ana/AnaToolExecutor.ts` read with the organization as their only filter:

| Tool | Store | Read |
|---|---|---|
| `list_vault_documents` | `concept2cure_artifacts` | `WHERE a.organization_id = $1` |
| `read_vault_document` | `concept2cure_artifacts` | by id and organization |
| `get_document_versions` | `concept2cure_artifacts`, `concept2cure_artifact_versions` | by id and organization |
| `compare_vault_versions` | the same | by id and organization |
| `list_governed_documents` | `c2c_documents` | `WHERE d.org_id = $1` |
| `read_governed_document` | `c2c_documents`, `c2c_document_sections` | by id and organization |
| `global_search` | `regulatory_programs`, `concept2cure_artifacts` | program names and artifact titles by organization |

So any member of the organization could list and read a private project's governed artifacts, its versions and its
governed documents through AnA, and see its program's name in a search. A CRO is one organization with several
sponsors, each a `client_workspaces` row, and each project names its sponsor (`projects.client_workspace_id`). Inside
sponsor A's project, AnA listed and read sponsor B's artifacts and documents in the same answer, with no sponsor named.
The Vault's own views had already been held to both rules (`GET /api/artifacts-center`, S6 V4; the Vault library,
S6 V2). AnA was the remaining way around them.

Shown on PostgreSQL (PGlite) with the real sharing policy and the unchanged handlers (`01-red.txt`, 15 of 15 fail):
- `list_vault_documents` returned the private project's `a-priv` beside the open projects' rows;
- `read_vault_document` returned the private artifact's content, and, inside sponsor A's project, sponsor B's;
- `list_governed_documents` listed `doc_priv`, and inside sponsor A's project, sponsor B's `doc_b`;
- `global_search` returned the private program's name and the private artifact's title;
- a caller who is not a member, a caller with no identity, and a sharing policy that cannot be read all got `ok: true`
  with rows.

## What already exists

- **Project access for artifacts.** `readCurrentProgramActor` (`server/services/c2c/current-program-access.ts`) reads the
  person's current membership; `getAccessibleReportProjectIds` (`server/services/report-os/project-access.ts`) applies the
  project sharing policy and returns the `projects.id` the person can open. `accessibleArtifactProjects` in
  `server/routes/artifacts-center-routes.ts` composes them for the Vault's organization view.
- **Sponsor narrowing.** `narrowToSponsorOf` and `artifactSponsor` in `server/routes/artifacts-center-routes.ts`
  (S6 V4, commit 1e83af2c96) narrow accessible projects to an open project's sponsor and name a sponsor, failing when a
  sponsor cannot be named.
- **Program scope for `c2c_documents`.** `c2c_documents.project_id` is a regulatory program uuid.
  `getCurrentAccessibleProgramScope` and `verifiedProgramAnchors` (`current-program-access.ts`) give the accessible
  programs and the one project each is anchored to, with its sponsor. `librarySponsors` in
  `server/routes/c2c/project-vault.ts` uses them for the Vault library.
- **The open project in a tool's context.** `turnToolContext` (`server/services/ana/turn-tool-context.ts`) sets
  `ctx.projectRef` to what the client sent and `ctx.projectId` to its integer form: under the v2 shell `projectRef` is a
  program uuid and `projectId` is null; for a legacy project both name `projects.id`. `admitAnaProjectScope`
  (`server/services/ana/project-scope-admission.ts`) resolves either form to `{ projectId, programId }` and refuses a
  project the person cannot open. It is how `catalog-scope.ts`, `source-read-scope.ts`, `authoring-read-tools.ts` and
  the schedule tools resolve the open project.
- **The tool admission wrapper.** `handlerAdmissionRefusal` (`AnaToolExecutor.ts:583`) checks launch scope, write
  roles, RBM admission and foreign program or record ids. It does not check project access for these read tools.
- **Existing tests of these handlers:** `read-vault-document-citable.test.ts`, `vault-named-tools-honesty.test.ts`,
  `artifact-disposition-tools.pglite.integration.test.ts`, `read-governed-document-counted.pglite.test.ts`
  (`server/services/ana/__tests__/`).

Searches run: the seven tool names over `server` and `tests`; `readCurrentProgramActor`, `getAccessibleReportProjectIds`,
`narrowToSponsorOf`, `artifactSponsor`, `librarySponsors`, `verifiedProgramAnchors`, `getCurrentAccessibleProgramScope`,
`admitAnaProjectScope`, `catalogScope`, `admitAnaSourceReadScope`, `projectId`/`projectRef` in `turn-tool-context.ts`,
importers of `artifact-registry-read`, and every handler in `AnaToolExecutor.ts` that reads `concept2cure_artifacts`.

## What changed

- **`server/services/artifact-registry-read.ts`**: `ArtifactSponsor`, `artifactSponsor` and `narrowToSponsorOf` moved
  here from the route, as exports, unchanged in rule. `narrowToSponsorOf`'s open project may now be given as a program
  uuid (the Vault's `sameClientAs`) or as a `projects.id` (AnA, where a legacy project has no program).
- **`server/routes/artifacts-center-routes.ts`**: imports them. No behaviour change.
- **`server/services/ana/AnaToolExecutor.ts`**, beside the document view tools:
  - `projectReadScope` reads the person's membership and accessible projects, admits the open project
    (`admitAnaProjectScope`), and narrows to its sponsor's projects (`narrowToSponsorOf`). With no project open, it is
    every accessible project.
  - `programReadScope` adds the verified program anchors of those projects, for `c2c_documents` and program search.
  - Each of the seven tools binds that scope in its SQL, before the limit. An id outside it reads as no row, so the
    answer is word for word the one a missing id gets.
  - Each listed row names its project (`project_id`, `project`) and its sponsor (`client`, or null). A sponsor that
    cannot be named fails the read.
  - A check that cannot run, a caller who is not a current member, a caller with no identity, and an open project the
    person cannot open each return an error with a code. None returns an empty list.
  - `global_search` said `ok: true` when one of its two searches failed, leaving that store's hits out. It now says
    which store could not be searched, as `search_all_documents` does.
  - `compare_vault_versions`'s line comparison moved into `versionLineSummary`, so the handler stays within the
    complexity limit.
- **Tests**: a new suite, `server/services/ana/__tests__/ana-vault-tools-project-scope.pglite.test.ts` (16 cases, the
  real sharing policy on PGlite). The four existing suites now give their reader an access context: real membership and
  a project in the two PGlite suites, a stub naming one open project in the two mock-pool suites.
  `artifacts-center-foreign-project.pglite.test.ts` fails at HEAD, because 1e83af2c96 added `client_workspaces` to the
  registry read and not to that test's schema. Its schema is completed here.

Two consequences, both intended. An artifact filed under another organization's project id is no longer read by these
tools, as the Vault's organization view already does not list it. A program with more than one project anchored to it
is left out of the governed-document reads until its anchor is repaired, as the Vault library already does.

`search_all_documents` is unchanged, as instructed. It has the same organization-only filter. The sweep reports that it
reads columns that do not exist. This session did not confirm that: its three arms name columns that the defining
migrations create. Its TMF arm reads `tmf_artifacts`, which `docs/design/ETMF_CONVERGENCE_2026-10-30.md` records as not
deployed (42P01 on every deploy-migrate database).

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The new suite against the unchanged handlers: 15 of 15 fail, for the reasons above. The 16th case (the program anchors cannot be read) was added after that run; the addendum shows it failing against a mutation that turns that failure into an empty scope. |
| `02-green.txt` | With the change: the new suite (16), the four existing handler suites (12) and the five `artifacts-center-*` route suites (31), 59 of 59. Below it, the baseline at HEAD: 41 of 43, the two failures being the foreign-project schema gap. |

ESLint, before and after, on the three source files: `AnaToolExecutor.ts` 94 warnings before and after, the same
rules and messages except the existing file-length warning's line count; `artifact-registry-read.ts` 0 and 0;
`artifacts-center-routes.ts` 3 and 3, identical. `node scripts/ci/check-tenant-isolation.mjs --strict-no-regression`:
0 findings.

## Not done here

- **`search_all_documents`**, as above.
- **Other handlers that read `concept2cure_artifacts` by organization alone** were not examined in this change:
  `update_vault_document` (a write, which selects the artifact by id and organization), `assemble_ectd_module_from_artifacts`
  and `draft_510k_substantial_equivalence`.
- **Not run on a PostgreSQL server or under the runtime role with RLS.** The suites run on PGlite. The reads use the
  module pool (`getPool()`), as the handlers' own reads and the route do, not `ctx.sqlClient`.
- **Not exercised in a live AnA conversation** in the running app.
- **Type-checked by the lead session before commit:** `npm run ci:typecheck:no-regression`, 0 errors. The lead
  re-ran the ten suites: 59 of 59.
