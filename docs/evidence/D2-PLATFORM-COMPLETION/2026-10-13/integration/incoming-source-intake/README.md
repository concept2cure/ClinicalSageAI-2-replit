# Incoming canonical source intake: project access and regressions

Reviewed merged incoming implementation `30e80b571` / remote `22c0c85b2` on the
`concept2cure-v2` worktree after platform commit `728f6364f`. This evidence covers
the incoming Vault/data-room intake and its narrow project-access repair. Stored
protocol/CSR selectors are still pending.

## Concrete private-project defect and repair

The incoming importer checked `programInOrganization`, which proves tenant
ownership but not the actor's access to a private project. In a real PGlite
sharing/source SQL fixture with physical source bytes, actor 7 was denied by the
existing project sharing policy yet the importer read bytes, converted them and
invoked document creation. That diagnostic used a spied creation dependency;
it was followed by the stronger HTTP/JWT/full-authoring-store regression.

The actual authoring router regression set the program's canonical project to
private with a different owner and no actor assignment. The incoming code
returned **201**, with persisted authoring document/section/revision/audit evidence,
when **403** was required. This is the meaningful red control in
[private-source-http-red.txt](private-source-http-red.txt).

`authoring-source-import.ts` now validates exact numeric actor/principal identity,
live program ownership, one current active organization membership and its role
against the existing `GOVERNED_WRITE_ROLES`, a unique existing program/project
anchor, and the existing `canAccessReportProject` sharing policy before reading
source metadata or bytes. It repeats that authorization in the canonical creation
transaction before writes. Fresh membership roles also govern existing draft
reuse, preventing a stale administrator claim from supplying object access.
Membership/user/organization rows are read with `FOR SHARE` on that transaction.

Missing/ambiguous anchors, revoked memberships, denied sharing and unverifiable
access fail closed. Existing receipt, conversion, source integrity/disposition,
advisory reservation, edited-draft reuse and exact-ID responses are preserved.
No duplicate role list or project-ownership query was introduced. No original
source is modified and no route/context change was needed.

## Verification

- Before guard: **82/82**, eight affected source/import/provenance/machine-claim/
  reservation suites passed on the merged incoming tree. This did not prove
  private-project safety; the new negative regression exposed that missing check.
- After guard: **98/98**, the same eight suites plus new negative/positive cases
  passed (41.00 seconds). Private source denial occurs even while the physical
  original is unavailable, with no new document, section, revision, audit or
  permission evidence. Explicit private assignment permits reuse; revocation
  refuses it. A previously issued member token cannot override a current viewer
  membership.
- An actual canonical creation transaction test reads real Word bytes and runs
  native Word conversion, revokes sharing during conversion, then proves the
  transaction refuses and leaves document/section/revision/audit/permission counts
  unchanged. This is not a mocked persistence callback.
- Source unit cases also cover malformed/mismatched actor identities,
  missing/ambiguous anchors, unavailable access lookup and revocation between
  initial authorization and the transaction.
- ESLint: **0 errors**, three test-only complexity/function-length warnings.
  The production service has no lint warnings. Whole-tree final typecheck is the
  control tower's publication gate.

The eight suite paths are:

1. `server/services/authoring/__tests__/authoring-source-import.test.ts`
2. `server/routes/__tests__/authoringSourceImport.pglite.integration.test.ts`
3. `server/services/authoring/__tests__/import-source-references.test.ts`
4. `server/services/authoring/__tests__/governed-machine-claims.pglite.test.ts`
5. `server/services/authoring/__tests__/saved-draft-source-reservation.test.ts`
6. `server/services/authoring/__tests__/saved-draft-source-export.test.ts`
7. `server/routes/__tests__/authoringFromDraft.pglite.integration.test.ts`
8. `server/routes/__tests__/authoringFromDraftProvenance.pglite.integration.test.ts`

Logs are retained alongside this file: baseline merged tests, real SQL diagnostic,
HTTP red control, green regressions and lint. ANSI formatting and absolute repo
prefixes were normalized; no credentials are present. Development fallback/audit
warnings remain visible and are not treated as production key evidence.
PGlite proves actual SQL and transaction rollback, not native PostgreSQL
concurrency, runtime RLS, deployment or a live model.

## Separate pre-existing direct from-draft issue

Read-only trace, reported to the control tower without widening this repair:
`createDocumentFromDraft` establishes program tenant ownership but not current
project sharing. `verifySourcesInsideSave` invokes `verifyDraftSourceReferences`,
which loads the selected Vault text using `loadDocumentForOrg(includeText:true)`
with tenant/program/current-version predicates and no actor sharing check.
Stored/returned `projectSourceReferences` can contain source titles and clinical
claim comparisons; conflicting comparisons include private source quotes.
The service can also create a document in that private program and grant creator
ownership. A valid source/hash/span selector therefore remains a pre-existing
direct-door concern distinct from incoming `/import/source`.

The next assigned increment must extract a reusable canonical authoring program
access guard, apply it before these reads and writes in direct from-draft, and
extend it to workflow preview/create before any workflow bridge ships. Saved
origin verifier helpers are not independent authorization front doors; the
calling action must establish current source/target access. The revised bounded
workflow contract is
[GOVERNED_PROTOCOL_CSR_AUTHORING_BRIDGE_2026-10-13.md](../../../../../design/GOVERNED_PROTOCOL_CSR_AUTHORING_BRIDGE_2026-10-13.md).
