# Incoming Unicode chunk compatibility review

## What already exists

`vault/document-chunking.service.ts` already splits extracted text into bounded,
overlapping exact UTF-16 spans and uses the existing all-or-nothing chunk
writer. Ownership and binary-disposition checks precede embedding/replacement;
MAX_CHUNKS refuses a truncated-prefix index. `vault/passage-context-span.ts`
already verifies chunk slices against the actual extracted text before issuing
surrounding context. `ana/draft-source-identity.ts` and
`authoring/draft-source-references.ts` retain exact extraction/span hashes.
`authoring/authoring-assembly-sources.ts` already clips its selected-source
windows at surrogate boundaries and records current source versions, permissions,
extraction SHA and exact span SHA rather than treating a chunk as verified fact.

## Incoming change and conclusion

Reviewed the diff from `0ef71516c9efe22960a752a485b89ec208471bbc` to
`26d85015640a87dc06fda9209f4eef678970c279`: one production path, three new test
paths and retained Unicode qualification documents. No registry/template,
source-identity, tenancy, schema, dependency, compiler or UI boundary changes.

The chunker moves an end inward one UTF-16 unit when it bisects a surrogate
pair, and moves an overlap start inward one unit in the matching case. It keeps
UTF-16 coordinates, source text, exact `text.slice(start,end)` semantics, bounded
overlap and forward coverage. It does not convert offsets into code-point
indices, normalize source text, change original-byte/extraction hashes, retarget
a version or weaken source/approval/tenant checks. The safe boundary adjustment
is consistent with existing assembly-source clipping and verified passage context.

No blocking compatibility or provenance finding. The incoming production bytes
match the merged working file exactly; SHA-256 is
`be3c168333f00d315050b5a4f46bfc17919bb81af2c62cce9d36923dc27674ca`.
The new storage fixture calls the real chunk writer over declared owner-level
PGlite/UTF-8 transport, page mapping, passage verification and identity logic.
It asserts reindex replacement and preserves foreign-tenant/disposition,
malformed-source and legacy stored-byte-mismatch refusals. Its embedding service
is stubbed and embedding is disabled; this is not provider/native-RLS proof.

## Recommended exact integration cohort

The parent's bounded nine-suite selection is appropriate:

- `server/services/vault/__tests__/document-chunking-unicode.test.ts`
- `server/services/vault/__tests__/document-chunking-unicode-properties.test.ts`
- `server/services/vault/__tests__/document-chunking-unicode-storage.test.ts`
- `server/services/vault/__tests__/document-chunking.service.test.ts`
- `server/services/vault/__tests__/document-chunking.tenancy.test.ts`
- `server/services/vault/__tests__/document-chunking-backfill.service.test.ts`
- `server/services/vault/__tests__/passage-context-span.test.ts`
- `server/services/vault/__tests__/document-passage-search-context.test.ts`
- `server/routes/__tests__/authoringSelectedSources.pglite.test.ts`

These cover the changed splitting/storage seam, unchanged writer/ownership and
backfill contracts, verified AnA passage context and the editor's actual selected
source manifest. Parent owns execution, build and normal push-hook qualification;
this review did not run tests or compiler.

## Remaining limits

The change does not migrate existing malformed chunks or claim historical
retrieval repair. Existing verification continues reporting mismatched legacy
stored chunks as unavailable until the ordinary reindex workflow replaces them.
It preserves valid Unicode scalar pairs; no new grapheme-normalization contract
is introduced. Existing text-size and malformed-input policies are unchanged.
No source edits or Git mutation were performed; this review file is the only
write made for this task.

Checked at 2026-10-23T18:18:59.284581+00:00.
