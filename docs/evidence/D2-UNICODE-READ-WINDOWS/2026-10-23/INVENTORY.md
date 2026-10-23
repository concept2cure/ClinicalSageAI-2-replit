# Existing AnA document read windows — D2 / W2

## What already exists

- `server/services/ana/document-catalog-tools.ts` owns registered read_project_document, readWindowBounds, budget rendering, prospective coverage, source revalidation and deferred receipts. It currently slices raw UTF-16 offsets and uses offset+fit.size in both receipt spans, so valid surrogate pairs can be split.
- `server/services/ana/read-receipts.ts` already owns fitReadWindow and host-admitted receipt settlement; `agentic-loop.ts` already applies whole-or-nothing read budgets. These remain canonical and unchanged. Fitting knows no source characters; its selected size can differ from an intact span's actual length. Binary-search renders may end with a rejected candidate, so never retain the last callback's span as the final span.
- `server/services/ana/source-read-receipt.ts` already validates returned payload window start/end/text against sourceSnapshot.span and the actual source slice. Both deferred spans must match the final rendered span exactly. Existing current-source, actor, version and cancellation guards remain in use.
- `server/services/authoring/authoring-read-render.ts` already moves split starts backward and ends backward unless that empties the window, then includes one complete code point. That renderer carries authoring-specific HTML/proposal behavior, so the Vault read is corrected locally rather than importing that subsystem. `draft-project-sources.ts` likewise has its own selected-span boundary policy.
- `server/services/ana/document-catalog-tool-defs.ts` already describes this tool; its max_chars and offset descriptions need to disclose UTF-16 actual bounds, backward-start adjustment and the two-unit minimum for a supplementary character.
- Existing handler, executor and stream delivery tests exercise real registered handlers and host budgeting. `support/read-delivery-vault.ts` is explicitly an in-memory service/receipt seam, not SQL persistence. Existing guarded-writer, snapshot, strict-body and source-access suites supply unchanged controls. Tests must not reuse the executor suite's code-point reconstruction helper for UTF-16 offsets.
- Previous `D2-UNICODE-CHUNK-BOUNDARIES/2026-10-23` fixed chunk storage and explicitly left these read/receipt windows separate. No new chunker, tool, model, store or schema is needed.

## Searches

Discovery covered read_project_document, readWindowBounds, fitDocumentReadWindow, deferDocumentWindow, fitReadWindow, sourceSnapshot, payloadWindowMatches, wholeOrNothing, splitsPair, intactWindow, source-read receipts, catalog handlers/definitions and their route/client/tool consumers. Deleted history was searched with git log --all --diff-filter=D for document-catalog-tools, read-receipt, read-render and Unicode-window names; no removed Vault read-window correction was found.

## Reproduced need

For source A🧬B, offset0/max_chars2 currently returns A plus a high surrogate; offset2/max_chars1 returns a lone low surrogate; offset1/max_chars1 returns a lone high surrogate. A budget-shrunk candidate can make the same cut even when the initial request was safe. JSON can escape a lone surrogate but does not turn it into the intact source character.

## Existing host-scope limitation

Whole-or-nothing protection follows the deferred receipt map. Historical/no-host/ineligible reads do not create that entry and may still receive ordinary result truncation when a host round is squeezed. This increment qualifies intact handler windows for those controls, and exact host dispatch/settlement for current receipt-eligible reads; it does not silently widen host budgeting or receipt eligibility.
