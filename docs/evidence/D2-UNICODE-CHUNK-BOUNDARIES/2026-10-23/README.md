# Vault Unicode chunk boundary correction — D2 / W2

## What already exists

The canonical chunker and atomic tenant-fenced writer are `server/services/vault/document-chunking.service.ts`; ingestion and backfill use them. Passage verification and exact-text identity already reject corrupted chunk/source mismatches. Existing behavior and searches are in [INVENTORY.md](INVENTORY.md); the correction contract is [CONTRACT.md](CONTRACT.md).

This increment fixes the existing chunker so valid supplementary Unicode characters survive chunk boundaries and UTF-8 storage, retaining exact UTF-16 coordinates and all existing source verification gates. It adds no parallel implementation or new launch capability.

## Evidence status

Inventory and contract recorded before production edits. Baseline selected input hashes are in [baseline-inputs.json](baseline-inputs.json). Fail-first tests, implementation qualification and publication proof will be added as completed; no test or deployment result is claimed by this initial document.

## Fail-first freeze

The frozen three new suites execute 33 cases on unchanged production: **19 semantic failures and 14 passing controls**, zero skips. The failures comprise 15 pure boundary cases, three real SQL/UTF-8 writer/context cases, and one deterministic property case. Its 2,688 inputs produced 8,080 baseline chunks, of which 1,019 split a pair and failed UTF-8 round-trip identity. Commands, exact source hashes, raw outputs and JSON results are under `root/red-frozen*`; [frozen-tests.json](frozen-tests.json) records the freeze. All 17 selected baseline inputs and 22 existing regression files stayed unchanged.

The initial test lint found one describe-group length warning. The author split the top-level group before freezing, with no fixture/assertion/case change; the original source and exact grouping-only diff remain under `root/test-regroup*`. The same 19/14 baseline result was reproduced after regrouping; all three frozen test files have zero lint errors and warnings. Earlier `red*` and lint files remain historical evidence.

## Qualified correction

Only `server/services/vault/document-chunking.service.ts` changes production behavior: it moves a split end back one UTF-16 unit and a split overlap start forward one. The same writer, SQL eligibility fences, embedding policy, page attribution and exact-source checks remain in use. The frozen tests are unchanged.

The final exact-source run (`root/final*`) passes **331 tests in 25 files**, zero failures/skips. All 33 new tests pass, including the real SQL/UTF-8 persistence, corrected page attribution, successful replacement and unchanged refusal controls. The deterministic property corpus checks **2,688 inputs / 8,080 chunks with zero violations**. `root/lint-final*` reports zero errors and the one pre-existing writer complexity warning: zero warning growth and zero new-test warnings. `qualification-source-manifest.json` pins 82 selected inputs including all 25 suites and one-hop relative imports; it is not an exhaustive graph.

The initial implementation also passed331 tests but gained one complexity warning from redundant nullish fallbacks. Removing those fallbacks at two provably in-range codePointAt lookups eliminated the warning; TypeScript's non-null assertions add no runtime operation. The initial run, lint failure, range proof and final rerun are retained under `root/green*`, `root/lint-correction.json` and `root/final*`. No baseline, rule or frozen test was relaxed.

## Limits and next need

This protects surrogate pairs in newly ingested or explicitly reindexed text; it does not automatically repair already stored corrupt chunks or complete grapheme clusters. The existing verifier still refuses legacy corruption and malformed original encoding. Corrected cuts may change page attribution and chunk counts, including triggering the unchanged MAX_CHUNKS refusal. Normal backfill excludes already-chunked rows and retains a separate trimmed-source-basis issue.

The separately reproduced `read_project_document` boundary defect still needs an exact-rendered-span/receipt contract, especially at max_chars=1. Stale retrieval after re-extraction and the already-filed capture checksum-cache race remain separate follow-ups. This evidence does not establish production deployment, live provider behavior, native PostgreSQL RLS, retrieval qualification or agency acceptance. Worker handoff documents record authorship scope; the current execution verdict is `root/qualification.json`.

## Publication status

Contract commit0fff4da02 was pushed directly to concept2cure-v2 with normal hooks. Implementation qualification is complete locally; incoming remote history has no overlap with the82 selected inputs. Implementation push and whole-tree typecheck results will be recorded after they complete.
