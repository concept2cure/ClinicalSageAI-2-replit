# Preserve intact Unicode document read windows

## What already exists

`document-catalog-tools.ts` already owns registered Vault document reads, exact UTF-16 source slices, serialized result fitting and private deferred legacy receipts. `document-catalog-tool-defs.ts` describes the existing tool. Executor/stream hosts already admit results, and `read-receipts.ts` plus `source-read-receipt.ts` settle them through the guarded writer. This completion extends those bounds; it creates no alternate reader or receipt ledger.

## Reconciliation and review

The incoming completion through `3b16fc98c` changes two existing runtime files and adds four regression suites. The read-only review found no blocker and made no application edits. Starts inside supplementary characters move backward to their intact start; split ends move inward, with an explicit complete-character minimum of two UTF-16 units when `max_chars` is one. The selected actual span now reaches the deferred receipt instead of the fitter’s nominal size or last rejected candidate.

Existing source revalidation, host-budget admission, cancellation, withholding and historical-source receipt eligibility remain authoritative. Minimal metadata-heavy results may still exceed host budget and be withheld. Prospective legacy coverage does not establish current-actor/extraction-specific or provider-served delivery, full grapheme segmentation or historical chunk repair.

## Exact verification

All **45 tests across 4 suites pass**, with zero failures, pending cases or TODOs, in **24.10 seconds**. `checks.json` records the exact four-suite command and six source/test hashes before and after execution, with no drift. The actual execution began after completed merge `005045533`; all six source/test hashes match before and after. Coverage includes registered reads, actual executor dispatch, the stream host, and real guarded-writer/PGlite transaction/INSERT behavior. Admission and provider seams remain synthetic; owner-mode PGlite does not qualify deployed RLS, native concurrent PostgreSQL, live provider service or durable V2 receipt admission.

All prior selected pin groups remain unchanged: **36 client, 20 backend, 12 native, 18 refiling, four chunk-Unicode and 16 planning**. No qualified dependency in those groups was superseded. Their earlier results retain their original scopes and are neither rerun nor summed here. Text and JSON output are losslessly archived with SHA-256 and decoded byte lengths in `archives.json`.

Root owns the refreshed build, full compiler, normal push gates and canonical publication. Live acceptance remains separate.
