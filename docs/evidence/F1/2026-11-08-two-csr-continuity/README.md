# F1 — Two CSR documents, retained data cuts and collaboration

Date: 2026-11-08. Synthetic fixture data only. This slice qualifies existing paths; it does not establish clinical validity, production deployment, a formal CSR supersession workflow or complete regulatory acceptance.

## What already exists

- `server/services/authoring/csr-import-into-document.ts` implements the existing `POST /api/authoring/import/source` target mode. It requires the exact project/document and the build's frozen study-data binding, rechecks approved source headings against a preview fingerprint, and writes content, clause lineage, ledger revisions and import receipts in one transaction.
- A target accepts in-place imports from one build. `IMPORT_TARGET_BOUND_TO_OTHER_BUILD` protects the existing retained source origin; `IMPORT_TARGET_STUDY_DATA_MISMATCH` protects the frozen data's document identity. Human edits are preserved by the existing edited-section rule.
- `server/services/csr/csr-study-data.ts` and `migrations/20261031_csr_study_data.sql` retain immutable snapshots. A new data cut is another frozen row, never a rewrite of the old snapshot. A CSR-template document is created through the existing `POST /api/authoring/docs` route.
- `server/services/authoring/workflow-import-governance.ts` verifies retained creation/import receipts and current clause lineage. Build-heading approvals and signatures do not become approval or signature of the target document.
- `client/src/concept2cure/v2/surfaces/CsrRunBuilds.tsx` imports approved headings into the document already open. It displays the named server refusal, but a refusal for another build offers no instruction for starting the next CSR. The existing source-copy path is deliberately outside this slice.
- `server/routes/__tests__/authoringCsrImportIntoDocument.pglite.integration.test.ts` already uses actual authoring HTTP routes, JWT verification and migrated PGlite tables for template creation/import, edited-section protection, stale approval refusal, project/document mismatch and retained workflow governance. Its synthetic approved job and frozen snapshot are established by fixture SQL; it does not execute real clinical-source ingestion, drafting or signed heading review.
- The existing document read routes return the admitted document and its sections by exact document ID. A second authorized collaborator can use those same routes; collaboration does not require another source import or document copy.
- General authoring has no discovered CSR clone/new-revision API. The controlled Quality document revision service has a separate native contract. `/docs/:docId/working-copy` exports an uncontrolled file and is not a document revision operation.

## Scope and discovery

Root assigned this qualification after a read-only review of the existing CSR, source-import and authoring lifecycle paths. No production server route, service, table, dependency, copy mechanism or supersession relationship is added. No held task/board, agency-response or authoring draft/accept path is edited.

The checkout reports `git rev-parse --is-shallow-repository` as `false`. A bounded deletion search with `git log --all --since=2026-08-01 --diff-filter=D` found no deletions for the existing target-import test, `CsrRunBuilds.tsx` or `csrCardReach.test.tsx`. This records those paths and that time range, rather than claiming a repository-wide retirement review.

## Qualification planned before edits

1. Create two CSR-template documents in one programme through the existing route. Bind each to its own synthetic immutable cut and approved build.
2. Import each build into its own document; prove distinct document, snapshot, job, section revision and import receipt identities without making a source working copy.
3. Refuse cross-target imports and an additional build aimed at an already bound document. Compare saved text, revisions, lineage and import receipts before and after each refused operation.
4. Have two authenticated, currently authorized collaborators open the same document and its sections. Check that both see the same IDs and retained content and that opening it does not create or re-import a copy. Also retain a current-access refusal case where practical.
5. If the existing refusal wording is supplemented, keep the named reason and direct another data cut to Project → New document → Clinical Study Report. Collaborators continue with the same document ID. The server's binding restrictions remain unchanged.

## Results

The production server contracts required no change. Five additional migrated PGlite/HTTP cases qualify the existing behavior:

- Two CSR-template documents in one programme receive different frozen-cut IDs, source document IDs/digests/dates and build IDs. Each approved synthetic job imports into its own document with distinct section revisions and the expected build-specific UPDATE/CSR_IMPORT receipts. Neither import creates another document.
- Both directions of wrong-target import refuse with `IMPORT_TARGET_STUDY_DATA_MISMATCH`, at preview and write. Each refusal preserves both documents, all sections, revision ledgers, import receipts, clause lineage and frozen snapshot rows exactly.
- A third synthetic job, rerunning the initial frozen cut, refuses with `IMPORT_TARGET_BOUND_TO_OTHER_BUILD`, at preview and write. Its current source-only preview supplies the exact attempted fingerprint without creating a copy. The original records remain unchanged.
- Two JWT-authenticated members open the same document and exact sections through actual GET routes. The second member has an explicit document AUTHOR grant. Both see the same document/section IDs and retained source origin; opening it creates no document, import or revision. Project `use` permits that read but correctly refuses import preview; the current native project `edit` grant permits the unchanged-content preview.
- Sharing one document does not grant access to the second CSR. Revoking the shared document grant makes both its header and sections unavailable to the same still-valid token, without changing the report's retained records.

The only production change is the existing import error wording in `CsrRunBuilds.tsx`. After either named binding refusal with HTTP 409, it retains the original server explanation and appends:

> For a different data cut, go to Project → New document → Clinical Study Report. Freeze that cut for the new document, then build and import there. Collaborators should open this existing CSR.

Four client regressions cover both named codes at preview and write; an additional negative case confirms that an access refusal does not offer this guidance. These cases assert that the target remains the current document, with no source-copy dialog or navigation. Existing malformed-response and original import checks remain intact.

### Commands and measured outcomes

Runtime: the root-provisioned Node 22 directory `/workspace/scratch/3002d574f952/node22-runtime/node_modules/node/bin` was placed first in `PATH`.

```sh
node_modules/.bin/vitest run --config vitest.config.ts \
  server/routes/__tests__/authoringCsrImportIntoDocument.pglite.integration.test.ts \
  client/src/concept2cure/v2/__tests__/csrCardReach.test.tsx
```

- Initial run, before production wording changed: **21 passed / 3 failed** (`red.log`). Two failures were the missing UI recovery text. The third was the new fixture expecting import preview from a collaborator without a current project edit grant; production correctly refused. The fixture now explicitly asserts the distinction between project `use` and `edit` rather than weakening that gate.
- Expanded UI red run with `-t 'explains the existing new-CSR path'`: **4 failed / 12 skipped** (`recovery-red.log`). Both error codes lacked recovery text at both preview and write.
- Intermediate combined run after the wording change: **25 passed / 1 failed** (`targeted.log`), retaining that fixture's project-role expectation for transparency.
- Final combined run: **26 passed / 0 failed across 2 files**, exit 0 (`targeted-final.log`): **10 server PGlite/HTTP cases and 16 client cases**.
- During final lint cleanup, the two-CSR fixture helpers were moved to file scope and its test groups divided into cut/import continuity and current collaborator access. Every assertion was retained. All **10 server PGlite/HTTP cases passed again** in `../2026-11-08-quality-batch-handoffs/targeted-refactor-fixture.log`; that broader run contains one unrelated new CMC timestamp fixture expectation failure, subsequently corrected and passed in its own focused rerun. The CSR client source/tests did not change in this cleanup.
- `git diff --check` over the three changed source/test files and this evidence directory: clean.
- A later compiler diagnostic found that the audit-receipt assertion read an untyped fixture query result. That assertion now uses the existing PGlite query API with an explicit receipt shape; its SQL and job-identity predicate are unchanged. All **10 server PGlite/HTTP cases pass again** in `../2026-11-08-cross-module-data-flow/typed-fixture-regressions.log` (22 total cases including the statistical-basis fixture), with zero scoped lint warnings/errors.

No full compiler/build or Git mutation was run by this lane; root owns final integration and publication gates.

### Qualification limits

The saved frozen rows and approved output rows are synthetic fixture SQL on the ordinary migrated tables. The suite exercises actual document creation, JWT admission, target import and current document reads; it does not execute the clinical-source Vault-byte freeze, model drafting, heading approval ceremony, full scientific review or final signing. The synthetic snapshot digest is a fixture value, not a qualified clinical-evidence seal.

PGlite/HTTP qualification does not prove native multi-writer locking, a browser journey, live study data or a signed regulatory submission. Separate native section-concurrency evidence belongs to its own lane. No formal relationship saying that the later CSR supersedes the first is inferred from two documents in one project. The original report, cut and receipts remain available under their own identities.
