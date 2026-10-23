# Vault Unicode chunk boundary correction — D2 / W2

## What already exists

The canonical chunker and atomic tenant-fenced writer are `server/services/vault/document-chunking.service.ts`; ingestion and backfill use them. Passage verification and exact-text identity already reject corrupted chunk/source mismatches. Existing behavior and searches are in [INVENTORY.md](INVENTORY.md); the correction contract is [CONTRACT.md](CONTRACT.md).

This increment fixes the existing chunker so valid supplementary Unicode characters survive chunk boundaries and UTF-8 storage, retaining exact UTF-16 coordinates and all existing source verification gates. It adds no parallel implementation or new launch capability.

## Evidence status

Inventory and contract recorded before production edits. Baseline selected input hashes are in [baseline-inputs.json](baseline-inputs.json). Fail-first tests, implementation qualification and publication proof will be added as completed; no test or deployment result is claimed by this initial document.
