# A Vault catalog record for another version reads as "other version", never as "no record"

Row: **D2** (launch catalog, Vault). Date: 2026-10-15. Base: `18d58cbb2`.

## What was wrong

Every Vault document has at most one catalog record: `vault.document_catalog.document_id`
is the primary key. The record names the bytes it describes in `content_hash`. When the
document gets new bytes and its record still describes the old ones, the old record is
**stale**.

`9c266724f` (merged in `261cdb6ca`) changed both document loaders in
`server/services/vault/document-catalog-document.ts` to

```sql
LEFT JOIN vault.document_catalog c ON c.document_id = d.id AND c.content_hash = d.content_hash
```

That kept a stale record's summary, purpose and key data away from anyone reading the
current version, which was the intent. It also made a stale record look exactly like **no
record at all** (`catalog: null`), and every reader downstream then said something untrue:

| Reader | What it said for a stale record | What is true |
|---|---|---|
| `read_project_document` (`ensureReadable`) | `ok: true`, with the stored text and "Extraction metadata is unrecorded" | The record exists and describes another version: `SOURCE_VERSION_CHANGED` |
| `completeCatalog` → `catalogableDocument` | "This document has no catalog record (it predates the catalog …)" | Same: `catalogVersionRefusal`, "belong to another source version" |
| `document-catalog-actor-reads.ts` `checkedSource` (when a hash did come through) | 503 `ANA_SOURCE_IDENTITY_UNAVAILABLE`, "could not be verified" | The identity *was* verified: it is a different version (409) |
| `writeCatalogSuggestion` (the CAS write), when the record changes bytes mid-write | "This source is no longer eligible for catalog changes" (the code `SOURCE_VERSION_CHANGED` was dropped) | "This document has a newer version than the one you read" |

There was also a hazard waiting for any fix. `place_project_document`'s comprehension gate
(`document-placement-tools.ts`) checked only `catalog?.status === 'cataloged'`. A loader
that reported the stale record's status would have let AnA file a document on what was
recorded about *other bytes*. Mutation B below shows that hazard was real: with the guard
removed, the placement went through (`ok: true`).

## What changed

1. **Both loaders** (`document-catalog-document.ts:121`, `:258`). The hash-joined `c` is
   unchanged. A second join, `cv ON cv.document_id = d.id`, selects only
   `cv.content_hash AS recorded_catalog_content_hash` and
   `cv.catalog_status AS recorded_catalog_status`. The JS projection
   (`projectCatalogRow`, `admittedCatalog`) sorts the record into one of three cases:
   - **current**: the record describes these bytes. Projected as before, tagged
     `version: 'current'`.
   - **other**: the record describes other bytes. `otherVersionCatalog` returns
     `{ version: 'other', contentHash: <recorded>, status: <recorded> }`. Every extraction
     and comprehension field is `null` and `charCount` is `0`. Those columns are never
     selected for other bytes, so the stale content never leaves the database.
   - **none**: there is no record, and `catalog` is `null`.

   The comparison is also done in JS (`catalog_content_hash ?? recorded`, checked against
   `d.content_hash`), so mocked rows sort the same way. In the strict loader, a recorded
   hash that differs only in letter case (the join refused it, but it folds to equal)
   cannot be verified, and the row fails closed with 503. `version?: 'current' | 'other'`
   is added to `CatalogDocumentRow['catalog']`.
2. **Actor facade** (`document-catalog-actor-reads.ts:46-48`). A catalog hash mismatch now
   throws `AnaProjectScopeError(409, 'SOURCE_VERSION_CHANGED', catalogVersionRefusal(doc))`
   instead of the 503. `withAnaSourceReadScope` rethrows `AnaProjectScopeError` unchanged.
   `withCaughtErrors(…, { safeOutcome: true })` renders it as
   `{ ok: false, code: 'SOURCE_VERSION_CHANGED', unavailable: false, error }`. The facade
   test `catalog-hash-mismatch` still sees a rejection.
3. **Placement** (`document-placement-tools.ts:119-127`). `catalogVersionRefusal` runs
   first and refuses with `code: 'SOURCE_VERSION_CHANGED'`. A document then counts as
   studied only if it is `cataloged` **and** `catalog.contentHash === doc.contentHash`.
   The parameter type of `catalogVersionRefusal` was widened to
   `Pick<CatalogDocumentRow, 'catalog' | 'contentHash'>` (type only).
4. **Governance CAS** (`document-catalog-governance.service.ts:258`). A
   `CatalogAdmissionError` with code `SOURCE_VERSION_CHANGED` now returns the existing
   `VERSION_CHANGED` refusal. The same refusal was already given when no record exists
   for the hash being read (`!before`). `sourceProblem` gives that code when the stored
   record's hash differs from the document's, and also when the record has vanished.

No change was made to the SQL for search, passages or listings. `retrieval-actor-filter`
and `catalog-search-version` still pin `c.content_hash = d.content_hash` there, and the
listing still reports a stale record as `uncataloged` / not yet studied.

### Test change (the one assertion that conflicted with failing closed)

In `server/services/ana/__tests__/draft-authoring-document-tool.pglite.integration.test.ts`,
'project catalog — source-version truth', the assertion
`expect(unchanged?.catalog?.summary).toBe('stale endpoint 9 of 10')` is replaced by:

- a direct SQL check that `vault.document_catalog` still holds `content_hash = 'd'×64` and
  `summary = 'stale endpoint 9 of 10'` (so `completeCatalog` wrote nothing), and
- `expect(unchanged?.catalog?.summary).toBeNull()` (the loader does not expose it).

Two pins were added; every other assertion is kept:

- `loaded.catalog` matches `{ version: 'other', status: 'cataloged', summary: null, keyData: null, charCount: 0 }`;
- `place_project_document` on the stale document returns `{ ok: false, refused: true, code: 'SOURCE_VERSION_CHANGED' }`.

## Red → green

| Case | Red | Green |
|---|---|---|
| Target file at HEAD, nothing changed | 2 failed / 20 passed: the first test stops at `:240` (`catalog.contentHash` undefined, the mismatch disguised as no record); the second at `:266` ("no longer eligible…") — `red/1-target-tests-at-HEAD.txt` | 22 / 22 — `green/1-target-file.txt` |
| Wide set (58 files, list below) | 1 file failed: the same 2 tests; 735 passed — `red/2-wide-set-at-HEAD.txt` | 58 files, 737 / 737 — `green/2-wide-set.txt` |
| **Mutation A**: the 'other' branch returns the stale summary (SQL also selects `cv.summary`) | Caught at `:242`, the loader's `version: 'other'` pin (`summary: "stale endpoint 9 of 10"`) — `red/3-…` | reverted |
| Mutation A with that pin removed, so only the replacement assertion guards | Caught at `:267`: `expected 'stale endpoint 9 of 10' to be null` — `red/4-…` | reverted |
| **Mutation B**: placement guard removed | Caught at `:252`: placement returned `ok: true`, filing the document on the stale record — `red/5-…` | reverted |
| **Mutations C + D**: facade back to 503, governance code mapping dropped | `:245` `code: ANA_SOURCE_IDENTITY_UNAVAILABLE`; `:280` "no longer eligible…" — `red/6-…` | reverted |

Each mutation was applied to the finished change, run with `-t 'source-version truth'`,
and then restored from a byte copy. The green runs were taken after every restore.

Static checks (`green/3-lint-sql-typecheck.txt`):

- **ESLint:** 0 errors and 0 warnings on all six changed files, at HEAD and now.
- **`ci:sql-interpolation`:** OK.
- **`typecheck:fast`:** 9 errors, all in
  `server/services/ectd/__tests__/assess-dispatch-readiness.ind-program.pglite.test.ts`.
  That file belongs to concurrent dispatch-readiness work and is not part of this change.
  No changed file has a type error.

### The 58 files run

The draft-authoring file, every file under `server/services/vault/__tests__/` and
`server/services/ana/__tests__/` whose name contains catalog, placement, source-read or
document-catalog, `retrieval-actor-filter.test.ts`, and every test file that imports
`document-catalog-document`, `document-catalog.service` or `loadDocumentForOrg`:

```
server/routes/__tests__/authoringFileToVault.pglite.integration.test.ts
server/routes/__tests__/authoringFileToVaultApprovalCarry.pglite.integration.test.ts
server/routes/__tests__/authoringSavedSourcesExport.pglite.integration.test.ts
server/routes/__tests__/vault-ingest-type-binding.test.ts
server/routes/ana-ri/__tests__/stream-read-delivery.test.ts
server/routes/ana-ri/__tests__/stream-step-presentation.test.ts
server/services/__tests__/ana-session-bootstrap-latency.test.ts
server/services/ana/__tests__/ana-launch-scope.test.ts
server/services/ana/__tests__/batch-draft-sections.test.ts
server/services/ana/__tests__/catalog-gated-tools.test.ts
server/services/ana/__tests__/catalogue-error-contract.test.ts
server/services/ana/__tests__/document-catalog-preview-tools.test.ts
server/services/ana/__tests__/document-catalog-program-binding.test.ts
server/services/ana/__tests__/document-catalog-safe-errors.test.ts
server/services/ana/__tests__/document-catalog-tools-id-space.test.ts
server/services/ana/__tests__/document-catalog-tools-project-scope.test.ts
server/services/ana/__tests__/document-passage-tools.test.ts
server/services/ana/__tests__/document-placement-tools.test.ts
server/services/ana/__tests__/document-source-access-tools.test.ts
server/services/ana/__tests__/document-source-facade-integration.test.ts
server/services/ana/__tests__/draft-authoring-document-tool.pglite.integration.test.ts
server/services/ana/__tests__/draft-project-sources.test.ts
server/services/ana/__tests__/durable-source-read-receipts.test.ts
server/services/ana/__tests__/governed-toolset-hosted-tools.test.ts
server/services/ana/__tests__/governed-toolset-sub-agents.test.ts
server/services/ana/__tests__/governed-toolset.test.ts
server/services/ana/__tests__/read-delivery-executor.test.ts
server/services/ana/__tests__/read-receipt-snapshots.test.ts
server/services/ana/__tests__/read-receipts.test.ts
server/services/ana/__tests__/search-connected-repositories-tool.test.ts
server/services/ana/__tests__/source-read-scope.pglite.test.ts
server/services/ana/__tests__/vault-access-without-key.test.ts
server/services/authoring/__tests__/import-source-references.test.ts
server/services/authoring/__tests__/saved-draft-source-export.test.ts
server/services/authoring/__tests__/saved-draft-source-reservation.test.ts
server/services/document-data-disposition/__tests__/consumers.pglite.integration.test.ts
server/services/vault/__tests__/catalog-actor-capture-discovery.test.ts
server/services/vault/__tests__/catalog-actor-read-facades.test.ts
server/services/vault/__tests__/catalog-actor-scope-wrapper.test.ts
server/services/vault/__tests__/catalog-document-access.test.ts
server/services/vault/__tests__/catalog-fact-verification.test.ts
server/services/vault/__tests__/catalog-governance-integrity.test.ts
server/services/vault/__tests__/catalog-placement-current-writer.test.ts
server/services/vault/__tests__/catalog-search-current-version.pglite.integration.test.ts
server/services/vault/__tests__/catalog-search-version.test.ts
server/services/vault/__tests__/catalog-write-result.test.ts
server/services/vault/__tests__/document-catalog-actor-access.test.ts
server/services/vault/__tests__/document-catalog-discovery-scope.test.ts
server/services/vault/__tests__/document-catalog-key-data.test.ts
server/services/vault/__tests__/document-catalog-preview.service.test.ts
server/services/vault/__tests__/document-catalog-source-snapshot.test.ts
server/services/vault/__tests__/document-catalog.service.test.ts
server/services/vault/__tests__/document-chunking-backfill.service.test.ts
server/services/vault/__tests__/retrieval-actor-filter.test.ts
server/services/vault/__tests__/retrieval-actor-revalidation.test.ts
server/services/vault/__tests__/saved-source-tenant-consistency.pglite.integration.test.ts
server/services/vault/__tests__/vault-ingest-storage.test.ts
server/startup/__tests__/document-catalog-bootstrap.test.ts
```

## Not changed, and why

- `ensureReadable`'s own `catalogVersionRefusal` branch (`document-catalog-tools.ts:217`)
  is kept. The facade now refuses first, so the branch is a second layer and not the
  path a reader takes.
- `reviewCatalogRecord` (a person confirming or correcting a record) already returns the
  code (`refuse(err.status, err.code, err.message)`), so its caller can tell a version
  change apart. Its message wording is out of scope here.
- Every other reader of the loaded catalog already requires
  `catalog.contentHash === doc.contentHash`, so none of them treats an 'other' record as
  current: `draft-project-sources.ts:35`, `draft-source-references.ts:48`,
  `source-read-receipt.ts:107`, `document-catalog-preview.ts:26`, and
  `hasReceiptCatalog` in the facade.
