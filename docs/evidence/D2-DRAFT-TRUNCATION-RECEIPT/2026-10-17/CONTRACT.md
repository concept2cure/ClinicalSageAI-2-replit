# D2: batch draft termination receipts

Control tower approved this bounded W2 / D2 contract on 2026-10-17 before implementation. Baseline: `accf8c6bacfdc2d89b5de9098e22a67fe3f27914`. Evidence stays in this directory; all commits go directly to `concept2cure-v2`.

## Observed defect

`AnaDocumentDraftingService` already returns `finishReason` and `truncated`, but `batchDraftReceipt` discards both. A nonempty result ending mid-sentence with `max_tokens` is counted as drafted and the AnA tool offers successful content for governed saving. This misstates which generated sections are usable. No provider or database call is needed to reproduce it.

## Required behavior

1. Use the existing canonical `isTruncated` classifier; do not invent another provider vocabulary. Treat either `truncated === true` or a recognized truncating finish reason as a cut-off result, even if the other field disagrees or is absent.
2. A cut-off slot is `status: failed`, `error: DRAFT_TRUNCATED`, `truncated: true`, with its original request index, section type, finish reason (or explicit null), and a fixed actionable message to shorten or split this section before retrying. It carries no `content` and contributes nothing to the successful count. Do not copy incomplete prose into a save-ready field.
3. Preserve existing receipt shape, original-slot recovery, count/failed/requested arithmetic, and `retryIndices`. Keep successful sibling drafts and their exact source receipts. Generation remains unsaved: `savedCount: 0`, `saved: false`, `authoringDocId: null`. No new persistence or write path.
4. Successful nonempty generated slots retain `finishReason` (or explicit null) and a normalized `truncated: false`. An absent or unknown finish reason does not confirm completeness, scientific correctness, qualification, approval or filing readiness. This increment does not turn the receipt into a completeness certification.
5. Update the existing batch tool guidance to save only drafted slots, to identify cut-off slots explicitly and to repair only failed indices. Do not present a cut-off response as a saved or completed deliverable.
6. Preserve source authority, current-context checks, hash/span identity, approved-model routing, per-item service settlement, existing HTTP batch semantics and governed authoring gates. No new models, integrations, dependencies, schemas, surfaces, or broad international filing claims.

## Proof and ownership

Root owns Git, contract, release integration and evidence. One owner changes only the canonical receipt and existing tool guidance. A second owner adds focused receipt regressions; an independent reviewer adds real-handler boundary proofs and reviews the final change. Tests must first fail on the baseline because incomplete prose is reported as drafted, with positive complete/unknown controls. Scope files are disjoint; no worker commits or pushes.

Cover all three canonical truncating reasons, contradictory/absent flags, explicitly truncated unknown/absent reasons, mixed successful/invalid/failed/cut-off slots, blank and source-unavailable controls, original ordering and recovery, and retained version-bound source receipts. Retain baseline snapshots and hashes, exact test/runner commands, red/green transcripts and final source bindings. Run appropriate focused regression, whole-repository TypeScript and normal Git hooks without bypass or baseline growth.

## Scope limits and next candidates

This is a receipt correction, not an automatic-save security boundary or scientific/regulatory validation. It does not add automatic retries, resumable generation, cancellation propagation, unknown-finish rejection or new extraction/tokenization behavior. Cancellation propagation remains a separately verified candidate. Latest upstream already corrected the Unicode source-window coordinate bug; see the adjacent D2-DRAFT-WINDOW-COORDINATES revalidation record. Prior competition and multi-region strategy remain research inputs, not qualification evidence for this patch.
