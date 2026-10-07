# Saved-source rendition and filing snapshot receipt

Date: 2026-10-07. W3/D4. Branch `concept2cure-v2`.
Continuation scope: existing document-first Authoring, export, Vault filing and
document-disposition contracts. No new product surface, evidence store,
integration, dependency or migration was added.

## Saved-source export boundary

The actual sealed `/docs/:docId/export` handler must read persisted
`provenance` and `client_program_id`. Reading only the former export columns
made a source-linked document look manually authored to the saved-source
verifier. A withdrawn, noncurrent, failed-extraction or malformed selected
source could then produce an artifact and export receipt.

The root corrected the actual handler projection. Source-linked exports now
begin one transaction, take the canonical program advisory lock, reserve
`vault.documents` and `vault.document_catalog` with `SHARE`, and verify the
selected identities/current versions before the EXPORT event. Rendering and
history use that same executor through commit. An unavailable saved selection
returns `409 SOURCE_REFERENCES_UNAVAILABLE` before any export audit/history.
Legacy/manual records keep their existing path. Original-file removal with
`keep_data` remains usable when its extracted evidence is current and readable.

`authoringSavedSourcesExport.pglite.integration.test.ts` exercises the real
handler with a signed JWT, actual document/source/catalog/disposition/version
queries, XML rendering and export-history SQL. The membership lookup and
audit-trail persistence are explicit seams. Its two successful cases assert
the source-table reservation precedes the first current-only source read,
audit/history share the transaction executor, and commit follows history.

The isolated RED executor substitutes the exact old document SELECT for the
handler's document query; the shared route is never modified:

```sh
SAVED_SOURCE_EXPORT_PROJECTION_MUTANT=1 NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --config vitest.config.ts server/routes/__tests__/authoringSavedSourcesExport.pglite.integration.test.ts --testNamePattern='refuses' --reporter=dot
```

`saved-source-route-projection-red.txt`: **4 failed / 2 skipped**, 15.46
seconds, actual HTTP 200 instead of the required 409 for withdrawn,
noncurrent, extraction-failed and malformed receipts. The normal isolated
GREEN in `saved-source-route-green.txt` was **6 passed**, 8.64 seconds.
Both valid current data and `keep_data` succeeded.

Read-only review also confirmed the final file-to-Vault record transaction
reserves those same source stores before its document-state check. The current
source read scopes ownership through the organization/program relation,
requires the chosen program, applies existing data eligibility, and excludes
a current successor only in the same scoped version family. No content-hash
guess is used to select a replacement.

## Filing section/receipt addendum

Vault ingestion occurs after rendering and before the final Authoring receipt.
An editable working draft can change while those bytes are being admitted.
The former final check compared only document status and then computed
`doc_sha256` from a fresh section read. Content edits, added sections or a
reorder with unchanged `draft` status left the original bytes visible in Vault
but wrote the new section digest as their export baseline. A section title
change also changed the rendered document, while the canonical digest omits
titles and therefore could not detect it.

The approved root fix carries the original rendered section rows into the
record transaction. After source reservation and the existing NOWAIT document
state check, it sets a local five-second lock timeout and takes `SHARE` on
`authoring_sections` so inserts as well as updates are reserved. It rereads the
same scoped `id`, `code`, `title`, `content` projection in `order_index` order
and compares those rendered fields and their order to the original snapshot.
A mismatch returns `409 DOCUMENT_CHANGED_DURING_FILING` before history/audit;
the existing compensation soft-deletes the admitted Vault row. A stable filing
uses the canonical `sectionsDigest` of the original rendered rows as its
receipt baseline.

`authoring-file-to-vault-snapshot.pglite.integration.test.ts` calls the real
filing service. Its ingest seam commits an actual Vault row and changes actual
section rows between rendering and recording. The PDF engine returns explicit
fixture bytes over the real HTML, and the audit persistence seams insert
transactional fixture audit rows. Four realistic regressions cover content,
title, reorder and an added section; each asserts unchanged document status,
the typed refusal, no filing receipt, and a compensated admission. The stable
control asserts the canonical digest/artifact hash and actual SQL ordering:
section SHARE, final section read, history, commit.

Actual pre-fix command and RED:

```sh
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --config vitest.config.ts server/services/authoring/__tests__/authoring-file-to-vault-snapshot.pglite.integration.test.ts --reporter=dot
```

`filing-snapshot-red.txt`: **5 failed**, 4.95 seconds. All four mutations
returned `filed`, kept the admitted row visible, and wrote EXPORT/history;
content/order/addition receipts recorded the changed digest. Title mutation
remained invisible to that digest. The stable case succeeded but lacked the
required section SHARE reservation.

Final focused and neighboring GREEN:

```sh
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --config vitest.config.ts server/services/authoring/__tests__/authoring-file-to-vault-snapshot.pglite.integration.test.ts server/routes/__tests__/authoringFileToVault.pglite.integration.test.ts server/routes/__tests__/authoringFileToVaultApprovalCarry.pglite.integration.test.ts server/routes/__tests__/authoringSavedSourcesExport.pglite.integration.test.ts --reporter=dot
```

`filing-snapshot-green.txt`: **30 passed / 4 files**, exit 0, 37.94
seconds. This includes the existing route ingestion/placement/recording,
compensation and approval-carryover SQL suites. Owned test ESLint in
`authoring-owned-eslint.txt` reports **0 errors / 0 warnings**. The npm
environment emitted its existing unknown `http-proxy` configuration notice.

## Qualification boundary and ownership

These focused checks use the existing single-connection PGlite fixture.
They prove SQL projections, refusal behavior, rollback/compensation, receipt
hashes and reservation ordering with the named seams. They do not prove
independent-connection lock contention, production RLS, external admission
storage/scanner behavior or a production audit-HMAC verdict. Source-linked
export holds its source SHARE reservation through rendering; final filing's
section reservation begins after ingestion. Operational contention remains
unqualified. This section contract compares the rendered section fields/order,
not every mutable document metadata field, and does not rewrite earlier files.
Declared source identity/currentness remains distinct from scientific claim
support, clinical/statistical validity or regulatory release qualification.

Focused worker owns the two new test files and this evidence addendum/logs.
The root owns the handler, source-reservation helper, renderer and filing
service production changes, saved-source disposition integration, combined
release checks and publication. No worker commit or push occurred.
