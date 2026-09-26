# PF-17 (D2), client half: the project page lists every record anchored to it, and an artifact's status changes only in its own project

**Plan:** `docs/design/PROJECT_FIRST_PLAN_2026-09-26.md`, PF-17. The server half,
`GET /api/c2c/projects/:id/records` and the activity feed, is in
`../2026-09-26/`.

## The defects

- **No view of the project's records.** The project page listed none. Each surface
  showed its own store, so a record anchored to the project in one store could not
  be seen from the project where a client's work starts.
- **The status change named the wrong project.** `PUT
  /api/concept2cure/projects/:projectId/artifacts/:artifactId/status` checked
  access on the URL's project, then loaded the artifact by id and organization
  alone. A member of project 3 could route, approve or lock project 5's artifact
  through project 3's URL.
- **"Route to review" failed for every v2 project.** The access check parses only
  an integer id, and every v2 surface holds the project as its program UUID
  (`ConversationThread` › `ArtifactCard` sends the shell's project id). So the
  request answered 404. The promotion gate read `Number(req.params.projectId)`,
  which is NaN for that URL.

## The fix

- **`ProjectRecords.tsx` (new), mounted in ProjectHome** as "Records in this
  project". It reads the records route and lists each store under its own heading:
  submissions, Data Room sources, Authoring documents, Vault documents, study
  designs and filing documents.
  - A store the environment lacks, or whose read failed, says so. It is never shown
    as "none".
  - The server returns at most 200 rows per section, so a full section says "the
    first 200", never a total it did not count.
  - With no project open, the panel is absent and nothing is read.
- **The status route resolves the URL's project first**, through the one
  translation rule, `resolveCmcArtifactProject`: an integer project of this
  organization, or the program's anchored project. It then:
  - decides access on that project;
  - refuses an artifact that is not that project's with 404;
  - passes the resolved project to the promotion gate.

  No second resolver was written.

## Evidence

- **`01-red.txt`: red.**
  - The status suite before the change: the program UUID got 404; another
    project's artifact was changed, then the request 500'd; the gate got NaN.
  - The reachability case with the panel unmounted.
- **Green:**
  - `tests/artifact-status-project-scope.test.ts` 5/5.
  - The two existing status suites, `lock-covers-approval` and `audit-outcome`.
    They gained the resolver mock, which addresses project 3 by its integer id as
    before; their assertions are unchanged. 19/19 across the three suites.
  - `projectRecords.test.tsx` 4/4, which covers:
    - each store listed under its heading;
    - an unreadable store is not "none";
    - the 200-row page;
    - a failed read is an error.
  - `projectHomeRecords.test.tsx` 2/2: mounted and reading the open project; absent
    with none.
  - Every ProjectHome suite still passes: 9 files, 47 tests.
