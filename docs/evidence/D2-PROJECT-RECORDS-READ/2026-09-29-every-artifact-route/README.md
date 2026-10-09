# PF-17 remainder (D2/D3): every artifact route acts only on its own project's artifact, and a v2 project reaches them all

**Found by** the multi-lens review of the status-route fix (`fe7db61a`). A mapping
pass then confirmed each route by reading it (`wf_cd6d16f7-e35`, evidence slice;
the other slices' agents hit the account's weekly limit, so the rest was mapped
by hand with a scripted census).

## The defect

Twenty routes in `server/routes/c2c/artifacts.ts` followed the same two steps:

- check access on the URL's project, `verifyProjectAccess(req,
  req.params.projectId)`, which parses an integer only;
- then load the artifact by `artifactId` and `organizationId` alone.

So:

- **Cross-project, same organization.** A caller with access to project 3 read,
  or changed, project 5's artifact through project 3's URL. Reads included the
  full content of every version, the Part 11 signatures, the provenance (with
  the other project's name), the audit report and the integrity verdict. Writes
  included edits, placement, CTD section, rollback, comments, comment
  resolution, reviewer assignment, withdrawal and reminders, and review
  submission.
  - Comment resolution and reminders did not check that the comment or
    assignment belonged to the URL's artifact at all.
- **No v2 project reached any of them.** Every v2 surface holds the project as its
  program UUID, and the integer parse refused it with 404.
- **Raw URL text recorded as a project.** The RIM signals and the reminder's
  notification took `parseInt`/`Number` of the URL as a project id. For a program
  UUID that is another project, or NaN.

## The fix: one scope, `server/routes/c2c/artifact-project-scope.ts`

- **`authorizedProjectId(req, organizationId)`.** It resolves the URL's project
  through the one translation rule, `resolveCmcArtifactProject`. That rule
  accepts an integer project of this organization, or the program's anchored
  project. It asks `strict`, so a lookup that cannot complete is the route's 500,
  never "not found", and it decides access on that project.
- **`loadProjectArtifact(organizationId, projectId, artifactId)`.** It loads the
  artifact by id, organization and project, and checks the row against what it
  asked for.

Every artifact route uses the two, including the status route, which is
refactored onto them. The list, create, dossier-metrics and team routes resolve
the URL the same way.

- **Comment resolution and reminders** now load the URL's artifact first, and
  require the comment or assignment to be on it. **Reviewer withdrawal** checks
  the assignment against the scoped artifact.
- **The recorded project ids** (the create audit row, both RIM signals, the
  reminder's `artifactId` and `projectId`) are the resolved project and the
  artifact's own id.
- **Responses that echo the URL** are unchanged.
- **Net code:** 278 lines removed, 99 added. Fifteen copies of the same lookup
  are gone.

## Evidence

- **`01-red.txt`**: `tests/artifact-routes-project-scope.test.ts` against trunk
  `57dad115`'s router. 39 of 42 fail:
  - 19 of 21 cross-project cases;
  - 20 of 21 program-UUID cases.
- **Green:**
  - `artifact-routes-project-scope` 42/42, table-driven over 21 routes on the
    real router.
    - **(a)** Every read returns project 5's artifact while the URL names project
      3. The answer is 404, with no update and no insert.
    - **(b)** The program UUID resolves to project 3. Whatever the route
      answers, it is not "Project not found".
  - Every suite that mounts the router: `server/routes/c2c/__tests__`, the
    artifact status and bundle suites, `routes/concept2cure`, source evidence,
    the Part 11 snapshots, and the resolver and anchor suites. 79 files, 757
    tests.
    - Three suites gained the resolver mock: `artifact-routes-invalidate-bundles`,
      `routes/concept2cure` and `concept2cure-artifact-source-evidence`. Each
      addresses its project by integer id, which resolves to itself. Their
      assertions are unchanged.
  - `tsc`: 0 errors. The ESLint ratchet is −1 in `artifacts.ts`.
