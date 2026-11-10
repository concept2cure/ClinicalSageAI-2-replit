# F1: the governed-documents route holds to the projects the person can open (2026-11-05)

A repair of shipped behaviour (package F1), found by a read-only audit and confirmed here. It brings
`/api/c2c/documents` onto the founder's statement of 2026-11-05: a CRO works "across authorized sponsor projects
without mixing sponsor data or permissions".

## The defect

`server/routes/c2c/documents.ts` is mounted at `/api/c2c/documents` with `authMiddleware` only
(`server/bootstrap/register-inline-routes.ts`, the "C2C document family" block). `c2c_documents.project_id` holds a
regulatory program uuid. Every read and every write selected by organization alone:

| Route | What it returned or did, for any member of the organization |
|---|---|
| `GET /` | Every governed document in the organization when no `projectId` was given; a private project's documents when its `projectId` was |
| `GET /by-legacy/cerv2-section/:id` | The id of a private project's 510(k) document |
| `GET /:id` | A private project's document |
| `GET /:id/outline` | Its outline, section by section |
| `GET /:id/sections/:key` | The section's content |
| `GET /:id/sections/:key/versions` | The section's history: author and reason of each change |
| `PATCH /:id/sections/:key` | Moved a private project's section between states |
| `POST`, `DELETE /:id/sections/:key/evidence` | Linked and unlinked evidence on it |
| `POST /:id/lock`, `POST /:id/submit` | Locked it, and recorded it as submitted |

None of the writes checked the project's edit right either: a member who could only use an `org_public` project
changed its documents.

Shown on PostgreSQL (PGlite) with the real sharing policy and the unchanged route (`01-red.txt`, 23 of 25 fail): the
list returned `doc_priv`, `doc_noprog` (no program) and the private 510(k); each document read of `doc_priv` answered
200; the legacy resolver named the private 510(k); a sharing policy that could not be read, a caller who is not a
member and a caller with no identity all got 200 with rows; every write to the private document and to the
use-only document succeeded.

## What already exists

- **The program scope.** `getCurrentAccessibleProgramScope` and `requireCurrentProgramAccess`
  (`server/services/c2c/current-program-access.ts`) give the programs whose projects the person can open, through
  the project sharing policy (`getAccessibleReportProjectIds`, `canAccessReportProject` in
  `server/services/report-os/project-access.ts`). A check that cannot run is `ProgramReadAccessError` 503
  `PROJECT_ACCESS_UNAVAILABLE`; a caller who is not a current member is 403 `PROJECT_ACTOR_ACCESS_DENIED`.
- **The same reads for AnA.** `list_governed_documents` and `read_governed_document`
  (`server/services/ana/AnaToolExecutor.ts`, through `programReadScope`) bind `project_id = ANY(<programs>)` and
  answer an id outside it as a missing one (`docs/evidence/F1/2026-11-05-ana-vault-tools-scope/`). This route is the
  same store read the same way, by the editor.
- **The edit right on a write.** `admitRiskScope` (`server/routes/mdx-risk-access.ts`) and `artifactEditRefusal`
  (`AnaToolExecutor.ts`): `requireCurrentProgramAccess` with `forShare`, the project and its visibility held
  `FOR SHARE`, then `canAccessReportProject(..., { forWrite: true })`, all on the write's own transaction.
- **The outline reader.** `readDocumentOutline` (`server/services/c2c/document-outline.ts`) reads by id and
  organization; it is not changed here, the route checks the document first.
- **Test support.** `server/routes/c2c/__tests__/support/current-member.ts` answers the program-access reads from
  seats for mock-pool route suites; it is reused here. No PGlite helper granted a person the sharing policy's edit
  right on one project, so `support/document-project-access.ts` is added beside it.
- **Client callers** (none changed): `client/src/concept2cure/v2/useFilingOutline.ts` (`GET /?projectId=…&scope=…`,
  `GET /:id/outline`), `client/src/concept2cure/mdx/hooks/useDossier.ts` (`GET /?projectId=`, `/:id/outline`,
  `/:id/sections/:key`), `client/src/concept2cure/mdx/hooks/useSectionVersions.ts` (`/versions`). Each sends a
  program uuid as `projectId` and reads one project's documents, so each still works. No client calls the writes,
  the legacy resolver or `GET /:id`.

Searches run: `api/c2c/documents` and `routes/c2c/documents` over `server`, `tests`, `scripts` and `client/src`;
`getCurrentAccessibleProgramScope`, `requireCurrentProgramAccess`, `canAccessReportProject`, `programReadScope`,
`admitRiskScope`, `artifactEditRefusal`, `readDocumentOutline`, `currentAccessDouble`; the `c2c_documents`
schema (`migrations/20260528_phase9_document_schema.sql`, `20260529_phase9_backfill.sql`, which made `project_id`
nullable for legacy rows).

## What changed

- **`server/routes/c2c/documents.ts`**, under a new "Project access" heading:
  - `readablePrograms` reads the person's accessible programs (`getCurrentAccessibleProgramScope`).
    `readableDocument` reads a document only if it is the organization's and of one of them.
  - Every read binds that set in its SQL. A document of another program, of no program, or of another organization
    is answered exactly as a missing id: the same 404 `NOT_FOUND`.
  - `GET /` lists only those programs' documents. A `projectId` outside them, or naming no program, lists nothing:
    `200 { documents: [] }`, which is what an unknown project has always received. The empty list was chosen to
    match it.
  - The legacy resolver names a document only if the person can read it, otherwise 404. Its fallback (an unlinked
    section) picks the oldest readable 510(k), not the oldest in the organization.
  - Every write first finds the document through the same read scope (404 outside it), then, inside its own
    transaction, `requireDocumentEditRight`: `requireCurrentProgramAccess` with `forShare`, the project and its
    visibility row held `FOR SHARE`, then `canAccessReportProject(..., { forWrite: true })`. Without the edit right:
    403 `PROJECT_WRITE_ACCESS_DENIED`, "Nothing was changed." A check that cannot run: 503
    `PROJECT_ACCESS_UNAVAILABLE`, rolled back, nothing written or audited.
  - `sendFailure` answers a `ProgramReadAccessError` with its status and code; anything else is the route's 500, as
    before. `GET /rule-packs` is reference data and is unchanged.
- **Tests**:
  - New: `server/routes/c2c/__tests__/documents-project-scope.pglite.test.ts`, 25 cases. It runs the real
    document migrations and the real sharing policy on PGlite. It mocks only the ledger writers, the signer's
    re-verification and the separation-of-duties lookup.
  - New: `server/routes/c2c/__tests__/support/document-project-access.ts` gives a suite's caller the edit right on one
    project through the real policy tables.
  - Eleven existing suites and one harness now give their caller access (listed in `03-suites.txt`). Nothing they
    assert was changed, except the two that pinned the old SQL: `section-versions-route.test.ts` (the document
    check's bind values) and `rule-pack-provenance-exposure.test.ts` (the outline's rule-pack read is now the second
    query).

Consequences, all intended and the same as the AnA reads: a document with no program (legacy rows from the
20260529 backfill) is no longer read or written through this route. A program with more than one anchored
project reads as missing until its anchor is repaired. A member with use but not edit on a project can no longer
move, link, lock or submit its documents.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The new suite on the unchanged route: 23 of 25 fail, for the reasons above. The 2 that pass must pass both ways: an open project's list and reads. The last case fails on HEAD only because earlier unscoped writes had already submitted its document. |
| `02-green.txt` | The new suite on the changed route: 25 of 25. |
| `03-suites.txt` | The 21 suites that reach the route: 351 of 351 with the change; the 20 existing ones were 326 of 326 at HEAD. Also the gates: ESLint ratchet (no file changed its count; `documents.ts` 5 and 5, the same rules), `ci:sql-interpolation` OK (3, baseline 3), tenant isolation no-regression OK, regulated-delete audit OK, sign-ceremony gate exit 0. |

## Not done here

- **Sponsor narrowing (condition 2) does not apply** and was not added. This route has no open-project context.
  Each document read names one document, so one project. The list either names one `projectId`, or names none and
  spans every project the person can open. Every client caller names a `projectId`.
- **`tests/db/actor-displays.dbtest.ts` was not run.** It needs a PostgreSQL server, and this session has none. Its
  dossier document had no program, so its versions read would now be 404. The fixture now names the reader's own
  program (`program`, anchored to the project the reader created). Unverified.
- **Not run on a PostgreSQL server or under the runtime role with RLS.** The route uses the module pool for reads,
  as it did before, and the write's own connection for the edit right.
- **Not exercised in the running app.** The client callers were read, not driven.
- **`tsc` was not run**, as instructed; the lead runs it.

## Run by the lead session on real PostgreSQL

`04-db-green.txt`: `tests/db/actor-displays.dbtest.ts` on PostgreSQL 16 as `app_service` with RLS enforcing, with the fixture change above (the dossier document names the reader's own program): 14 of 14.
