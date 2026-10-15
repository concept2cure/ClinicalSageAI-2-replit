# D4 — canonical upload resolved-path containment

Date: 2026-10-07. Starting source: `1995c72c1`, branch `concept2cure-v2`.
Contract: `ADOPTION-PLAN.md`, canonical metadata/byte reader scope only.

## Defect and bounded production change

`rowBelongsToOrg` previously checked the raw storage-path prefix and row
organization. A path such as `uploads/org-7/../org-9/file_1` passed for org 7,
including the pre-migration undefined-organization fallback. Metadata exposed
that path, and the byte reader resolved it into another namespace. The byte
reader's later containment check covered only the global uploads root.

The shared tenant decision now requires both the original permitted namespace
and a resolved child path inside that namespace. This applies to both
`loadUploadedFileMetadata` and `loadUploadedFile` without changing their public
interfaces. Ownerless `uploads/unscoped/` paths cannot resolve into a tenant
directory or into the legacy flat namespace. Directory roots themselves are
not admitted as files.

| Candidate | Expected result for named caller |
| --- | --- |
| Org 7 row, `uploads/org-7/file_1`, caller 7 | Retained |
| Org 7 row, `uploads/org-7/nested/../file_1`, caller 7 | Retained; final path remains contained |
| Undefined org column, `uploads/org-7/file_1`, caller 7 | Existing pre-migration fallback retained |
| Org 7 or undefined row, `uploads/org-7/../org-9/file_1`, caller 7 | Hidden/refused before filesystem read |
| Org 7 row resolving into unscoped, a sibling prefix such as org-70, or outside uploads | Hidden/refused |
| Ownerless `uploads/unscoped/file_1`, unscoped caller | Retained |
| Ownerless `uploads/file_legacy`, unscoped caller | Existing flat legacy access retained |
| `uploads/unscoped/../org-7/file_1`, unscoped caller | Hidden/refused |
| `uploads/unscoped/../file_legacy`, unscoped caller | Refused; traversal does not gain legacy compatibility |

Refusal remains indistinguishable from an unknown upload:
metadata returns no item; the byte loader throws `UPLOAD_NOT_FOUND` before
`fs.readFile`. Existing organization mismatch/ownerless symmetry, digest
mismatch (`UPLOAD_INTEGRITY_FAILED`), missing bytes (`UPLOAD_BYTES_MISSING`),
and honest legacy `unverifiable` status remain unchanged. The adoption route's
HTTP mapping is owned by the separate handoff worker.

## Red before implementation

Added `server/services/ana/__tests__/uploaded-file-path-containment.test.ts`
before editing production. It independently drives both canonical readers
through ten invalid path/ownership combinations, five compatibility controls,
and three existing byte-integrity states. DB/filesystem seams are mocked; the
actual canonical decision, `path.resolve`, SHA-256 calculation, and coded
reader failures execute.

```sh
npx vitest run server/services/ana/__tests__/uploaded-file-path-containment.test.ts server/services/ana/__tests__/uploaded-file-access-tenancy.test.ts --reporter=dot
```

Result: **20 failed, 22 passed / 2 files**. Every new negative path case failed
for both readers before the production change. Existing metadata tenancy,
compatibility, valid-byte, tamper, missing-byte, and legacy checksum controls
passed. Some paths outside the global root previously reached a generic
exception rather than the tenant-safe missing-upload refusal; these were also
demonstrated red.

## Green and regression verification

```sh
npx vitest run server/services/ana/__tests__/uploaded-file-path-containment.test.ts server/services/ana/__tests__/uploaded-file-access-tenancy.test.ts server/services/ana/__tests__/derived-spreadsheet-capture.test.ts server/services/ana/__tests__/derived-spreadsheet-sql.test.ts --reporter=dot
npx eslint server/services/ana/uploaded-file-access.ts server/services/ana/__tests__/uploaded-file-path-containment.test.ts server/services/ana/__tests__/uploaded-file-access-tenancy.test.ts
git diff --check
```

Results: **61 tests passed / 4 files** (7.60 seconds), including existing derived
capture and in-memory PGlite SQL regressions. ESLint exited 0 with **no errors
or warnings**. `git diff --check` exited 0.

`tests/db/upload-integrity-check.dbtest.ts` was inspected, not executed: it
inserts/deletes rows in a configured PostgreSQL database and writes upload
fixtures. No configured/shared database writes were performed for this worker
receipt. The new actual-loader controls independently retain its verified,
mismatch-refusal, missing-bytes, and legacy-unverifiable behavior under mocked
storage/DB seams; this is not a live PostgreSQL/filesystem qualification claim.

## Exact owned files and limits

- `server/services/ana/uploaded-file-access.ts`: only `isUnscopedPath`, the new
  lexical namespace helper, and the `rowBelongsToOrg` guard.
- `server/services/ana/__tests__/uploaded-file-path-containment.test.ts`: new
  focused regression. Existing tenancy/derivation tests were run unchanged.
- This evidence receipt.

No changes to `saveSpreadsheetDerivation`, loader interfaces, routes, stores,
migrations, dependencies, scanner policy, extraction, filing, or client UI.
No worker commit or push.

This proves **lexical resolved-directory containment**. It does not resolve
symlinks, prove immutable storage, prevent a later filesystem replacement, or
qualify independent-connection disposition/adoption concurrency. Those claims
must not be inferred from the passing mocked-reader or PGlite regressions.
