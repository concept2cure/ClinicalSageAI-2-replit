# Backfill source handoff tests — D2 / W2

## What already exists

The existing `backfillVaultChunks` decision loop and `indexCandidate` helper call the canonical chunk writer and optional extraction-ledger builder. The canonical `buildExtractionOutcome` already applies its own trimmed character/word count convention. These tests exercise those existing paths rather than adding an indexing implementation.

## Authored scope

Owned only `server/services/vault/__tests__/document-chunking-backfill-source-basis.test.ts` and this evidence file. The suite has 12 cases: four edge-source handoffs, an uncatalogued-source handoff with the actual outcome builder, an ordinary-text control, four blank-input cases covering both apply modes, a distinct extraction-failed reason control, and a nonblank dry-run control.

The sweep and real `document-catalog-core.ts` outcome builder execute. Candidate SQL results, chunk writer, extraction-ledger writer, chunk outcome writer and database pool are controlled seams. The suite proves exact arguments, decisions and reporting; it does not prove SQL storage, embedding calls, native RLS or live-provider behavior. The blank matrix additionally asserts no writer or ledger-builder calls. Metadata counts deliberately remain the canonical builder's trimmed values.

No production or existing test file was edited. No tests, lint, compiler or Git commands were run by this worker. Root owns fail-first execution, freeze, qualification and canonical publication. Files are stable and ready for root review/lint.
