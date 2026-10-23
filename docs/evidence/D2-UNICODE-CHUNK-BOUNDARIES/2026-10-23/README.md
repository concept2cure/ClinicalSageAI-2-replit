# Vault Unicode chunk boundary correction — D2 / W2

## What already exists

The canonical chunker and atomic tenant-fenced writer are `server/services/vault/document-chunking.service.ts`; ingestion and backfill use them. Passage verification and exact-text identity already reject corrupted chunk/source mismatches. Existing behavior and searches are in [INVENTORY.md](INVENTORY.md); the correction contract is [CONTRACT.md](CONTRACT.md).

This increment fixes the existing chunker so valid supplementary Unicode characters survive chunk boundaries and UTF-8 storage, retaining exact UTF-16 coordinates and all existing source verification gates. It adds no parallel implementation or new launch capability.

## Evidence status

Inventory and contract recorded before production edits. Baseline selected input hashes are in [baseline-inputs.json](baseline-inputs.json). Fail-first tests, implementation qualification and publication proof will be added as completed; no test or deployment result is claimed by this initial document.

## Fail-first freeze

The frozen three new suites execute 33 cases on unchanged production: **19 semantic failures and 14 passing controls**, zero skips. The failures comprise 15 pure boundary cases, three real SQL/UTF-8 writer/context cases, and one deterministic property case. Its 2,688 inputs produced 8,080 baseline chunks, of which 1,019 split a pair and failed UTF-8 round-trip identity. Commands, exact source hashes, raw outputs and JSON results are under `root/red-frozen*`; [frozen-tests.json](frozen-tests.json) records the freeze. All 17 selected baseline inputs and 22 existing regression files stayed unchanged.

The initial test lint found one describe-group length warning. The author split the top-level group before freezing, with no fixture/assertion/case change; the original source and exact grouping-only diff remain under `root/test-regroup*`. The same 19/14 baseline result was reproduced after regrouping; all three frozen test files have zero lint errors and warnings. Earlier `red*` and lint files remain historical evidence.
