# Existing Vault authoring-source traceability audit

Read-only audit on the canonical state reported by root as `30afd3bd1`.
No production/test changes, tests, Git mutation, compiler, build or provider
calls were performed. This audit file is the only write.

## What already exists

- `server/services/authoring/authoring-file-to-vault.ts::recordFiling` writes
  `authoring.document.file_to_vault` through the canonical chained writer in
  the same transaction as export history and the Authoring EXPORT audit. The
  row's `table_name`, `record_id` and `target` identify the Authoring source;
  its payload records the Vault UUID, captured project UUID, exact artifact
  SHA-256, export ID, format, filename, status and placement. It does not yet
  record the source version or sections digest in that chained payload.
- `authoring-export.ts::logExport` writes the source sections digest and
  metadata to `authoring_export_history`. Its creating migration is
  `db/migrations/20260730_authoring_runtime_ddl.sql`. Searches found no
  table-specific immutability guarantee; this history is not stronger
  provenance authority than the chained filing receipt.
- `auditService.ts::writeChainedAuditRow` hashes `new_values` and binds action,
  actor, target, time and tenant into the existing chain/HMAC recipe.
  `audit/chain-row.ts::verifySequencedRow` verifies one row against the exact
  predecessor selected by that writer. `vault-history-access.ts` already
  combines `hashPayload(new_values) === payload_hash` with that verifier and
  accepts a linked row with `valid` or explicitly reported `no-key` seal.
  There is no need for another hash, seal or ledger implementation.
- `c2c/document-alias-map.ts` supports the `vault_documents` vocabulary but
  refuses a second native ID for the same `(canonical_id, store)`. Every
  rendered Vault version therefore cannot be aliased to one Authoring UUID.
  Alias identity equivalence and recorded derivation are different facts.
- `ectd/leaf-source-resolver.ts::coauthorLineage` reads alias identity for
  co-author staged sources. Its Vault branch verifies scoped retained bytes,
  stages those exact bytes, and retains `vaultVersionNotTransmittable` gates,
  but sets no lineage. `core-to-packager.ts::LeafLineage` currently describes
  alias identity only. `assemble-from-core.ts` copies this lineage into the
  existing `package-governance.sha256.json` sources list, never the backbone.
- `regulatory/authoring-approval-carryover.ts` records `carriedFrom` in its
  own creation audit, but creates a canonical lifecycle record with only the
  Vault source ref and runs only when approval can carry. It cannot establish
  derivation for every working or otherwise unapproved export.
- `ectd/submission-leaf-source-evidence.ts` already verifies request-owned
  program/actor/source identity and bytes. Its PDF/binary content verdict is
  deliberately undetermined. Provenance does not prove substantive content;
  no readiness/content/approval gate should be relaxed by this correction.

Root's initial code/history searches are recorded in the discovery contract.
Further local searches followed alias writers, `source_refs`, export history,
audit verification, staged lineage, governance sources and source evidence.
No competing derivation store or stronger universally written source receipt
was found.

## Recommended bounded correction

Complete the existing Vault staged-source provenance using the recorded,
verified `authoring.document.file_to_vault` receipt. This is independent of
legacy version-family policy and does not rewrite identities or version labels.

1. Keep native Vault identity and any real alias identity intact. Add an
   optional, separately typed derivation/provenance property to the existing
   staged/governance lineage contract. Do not set alias `canonicalId` or alias
   `source` to an Authoring UUID merely because a receipt names it.
2. After the Vault branch has verified the actual retained SHA-256, read
   tenant-scoped filing candidates for that exact Vault UUID. Verify the
   canonical payload hash and `verifySequencedRow`; match the action,
   `authoring_document` resource/target, a real source UUID, captured project
   and exact staged artifact SHA. Source identity must not come from a title,
   `document_code` prefix or a current editable document body.
3. State verification results rather than assuming them. No receipt means no
   recorded authoring derivation, not an invented source. An unsequenced,
   malformed, tampered, mismatched, ambiguous or truncated candidate set must
   not produce a positive derivation claim. Distinguish a missing relation or
   failed read from a valid empty result. Reuse the existing verifier's
   `no-key` distinction explicitly; it is not HMAC authenticity.
4. Capture only immutable receipt facts already verified. The source may have
   changed after filing; that must not relabel the retained Vault PDF as the
   current source text. Historical source content/version cannot be recovered
   from this receipt alone. If root wants future source snapshot metadata,
   add the already-computed sections digest and captured source version to
   the existing filing payload; do not invent or backfill them for old rows.
5. Pass this additive provenance through the existing governance sources list.
   Retain exact native Vault pointers, byte pins, raw-byte staging, approval,
   current-version, release and substantive-content gates. Do not add source
   metadata to the agency backbone or an editor jump to an unchecked source.

Suggested ownership: a narrow reader adjacent to the existing Authoring filing
service or the Vault source services; additive types in `core-to-packager.ts`;
the existing Vault materialization branch in `leaf-source-resolver.ts`; the
existing governance projection/comment in `assemble-from-core.ts` only if its
current pass-through is insufficient. Do not change the alias writer or
`submission-leaf-source-evidence.ts` content verdicts.

## Existing fixtures and meaningful failure cases

`placement-vault-leaf-parity.pglite.test.ts` already runs the real Authoring
router, ingest, filing receipt writer, approval carryover, leaf write and
materializer over PGlite. Its explicit OPEN GAP assertion that Vault lineage
is absent is the best composed RED starting point. Storage/OCR/HTML-to-PDF
remain declared seams; this does not qualify Chromium or native concurrency.

Use the canonical chain functions to prepare/verify real audit rows in focused
reader fixtures. Cover valid receipt; missing receipt/native upload; wrong
tenant/project/Vault UUID/artifact SHA; changed payload without its hash;
broken predecessor/target; missing or invalid seal with a configured key;
unsequenced legacy row; unavailable relation/read; conflicting source receipts;
and a source edited after filing. Never turn the last case into a read of
today's body. Existing `leaf-source-resolver-lineage.test.ts`, Vault resolver,
finalized, source-evidence and assembly/governance fixtures preserve the
independent alias, content, approval and raw-byte boundaries.

## Limits

This corrects the missing retained authoring derivation, not historical
hash-version supersession, all-source snapshot reconstruction or alias
equivalence. The remaining re-filing TODO stays explicit. Current source access
must be checked separately before a future client attempts to open the
Authoring source; an opaque audit-bound source ID must not authorize body reads.
No new UI, schema, store, provider, version-numbering rule or transport is needed.
