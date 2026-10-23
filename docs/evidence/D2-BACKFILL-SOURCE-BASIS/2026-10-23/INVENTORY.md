# D2 / W2: correct the existing backfill source basis

## What already exists

- `server/services/vault/document-chunking-backfill.service.ts` already supplies bounded per-tenant dry-run/apply, named skip/failure reports, retry selection and optional embedding of previously keyless chunks. At the candidate loop it trims stored extracted_text before calling its existing indexCandidate helper, shifting the basis of every stored coordinate when edge whitespace exists.
- `server/services/vault/document-chunking.service.ts` already owns deterministic exact UTF-16/Unicode chunking, MAX_CHUNKS refusal, governed embedding, atomic DELETE/INSERT replacement, organization/binary-disposition checks and chunk outcome recording. Extend its caller, not this writer or splitter.
- `scripts/backfill-vault-chunks.mjs` reaches `backfillVaultChunksForTenant`, which resolves the tenant UUID under audited system scope and binds the existing tenant job scope. No other production caller was found in server/client/scripts searches. This is an operator path, not a new Data Room recovery action.
- `server/services/vault/passage-context-span.ts` and `server/services/ana/draft-source-identity.ts` already verify exact stored-source slices and identities. Existing context tests demonstrate basis_mismatch for historical chunks cut from trimmed source. The preceding freshness correction rejects changed extraction snapshots but deliberately preserves honest hit-only fallback for current text with misaligned historical coordinates.
- `server/services/vault/document-catalog-core.ts` buildExtractionOutcome independently trims text when computing catalog character/word counts. Passing raw text to the existing extraction-ledger builder does not change that count convention.
- Existing unit backfill, chunker, tenancy, Unicode/property/storage, context and source-reference suites provide controls. `document-chunking-unicode-storage.test.ts` provides owner-mode PGlite with actual writer SQL. Native `tests/db/vault-chunk-backfill.dbtest.ts` covers the tenant wrapper in dry-run; it does not prove applied source preservation.

Two independent read-only inventories searched backfill/chunk writer names, services, CLI, server routes, client surfaces, tables/migrations and matching deleted-file history. No removed matching correction was found. Initial synchronization fast-forwarded 48 incoming canonical commits to 035ee6854, preserving selected source and instruction-file bytes (`root/initial-sync*`).

## Boundary

Default backfill excludes chunked rows; embedding-enabled runs may reselect keyless rows subject to retry/error rules. Correct future selected indexing without silently rewriting already-indexed historical chunks. Existing candidate SQL has a program/organization join and deleted-document fence; it does not independently implement supersession/live-parent/disposition filtering. Preserve it and the existing writer checks without claiming absent controls.
