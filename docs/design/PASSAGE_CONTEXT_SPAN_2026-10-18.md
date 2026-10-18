# Passage context as one exact source span (design, not implemented)

Date: 2026-10-18. Status: **proposed**. Need: the second half of priority 3
in the [remaining-needs assessment](../reports/data-room-research-2026-10-14/remaining-needs-2026-10-18.md):
a result, its header and its denominator split across chunks, kept with exact
locators, hashes, budgets and withdrawal checks, "without concatenating
expanded text".

Investigated read-only by a subagent at `b200f3fa`. I re-checked the central
code facts below at `c821b0a7`.

## What happens today

- `AdvancedRAGPipeline.expandContext` fetches neighbouring chunks by
  `chunk_index BETWEEN` only (`server/services/advancedRAGPipeline.ts:1220`,
  `:1237`). It joins their text with `'\n\n'` (`:1251`). Every chunk repeats
  the previous chunk's overlap (`document-chunking.service.ts:80`, `:102`),
  so the expanded text duplicates the overlap at every seam and inserts
  paragraph breaks the source does not have.
- The joined text is used as a citation `quote` under the hit's `chunkId`
  (`:2076`), so a persisted quote can contain text that does not occur in the
  document.
- `document-passage-search.ts` maps only `text: d.content` (`:376`). The
  expansion its own comment promises never reaches AnA.
- The chunker records exact half-open UTF-16 spans
  (`document-chunking.service.ts:14`). Their stored offsets are not always
  coordinates into the current `extracted_text`:
  - the backfill chunks trimmed text, while ingest chunks raw text;
  - a same-hash retry rewrites `extracted_text`;
  - a failed re-chunk leaves the old chunks in place.

## Design

**One SQL statement inside `expandContext`.** No second read path in passage
search.
- Select `id, chunk_index, char_start, char_end` for the neighbour range,
  plus the document's `extracted_text`, once.
- Keep every existing tenant, disposition and supersession predicate.
- Pin the content hash unconditionally.
- Require the hit's own chunk row to still be present (`EXISTS … h.id = $hit
  AND h.chunk_index = $idx`). A re-chunk changes chunk ids, so this detects a
  changed chunk set.

**Verify before building.** With `T` the document text, every chunk must
satisfy `T.slice(char_start, char_end) === chunk_text`. The indices must be
consecutive, each start must exceed the previous start, and each start must
not exceed the previous end (no gaps).

**Build the span.** `T.slice(firstStart, lastEnd)`. Taken straight from the
source, the overlap appears once and there are no invented seams.
- The hit's own span is always kept.
- Each side extends by at most `contextSideChars` (default 1,000), with the
  whole capped at 12,000.
- The ends are snapped so no surrogate pair is split. Export one
  `intactWindow` helper instead of the private copies in
  `draft-project-sources.ts` and `authoring-assembly-sources.ts`.

**Identity.** `draftSourceIdentityForText(T, span)` supplies
`extractedTextSha256` and `spanSha256`, the same contract as
`DraftSourceReferenceV2`.

**`PassageHit` gains:**
- `contentHash`
- `hitSpan: {start,end} | null`
- `context`, one of:
  - `{status:'available', text, reference, chunkRange, clipped}`
  - `{status:'unavailable', reason}`, where `reason` is `no_offsets`,
    `basis_mismatch`, `chunk_set_changed`, `not_contiguous` or `budget`.

**Fail closed.** If any check fails, return the hit's own text and locator
with the reason, and no context. Never return shifted coordinates. The
existing `revalidateCandidates` and `verifyRetrievalSources` checks still run
after expansion.

**No schema change.** It uses the existing columns and computes hashes at read time.

## Fail-first tests

1. A header in chunk 4, `12/40 (30%)` in chunk 5 and `N=40 (ITT)` in chunk 6,
   with the hit on chunk 5. The context must equal `T.slice(…)` exactly, with
   the overlap appearing once. Today the overlap appears twice.
2. No `\n\n` at a seam unless `T` has one there.
3. Null offsets give `no_offsets`, and the hit is still returned.
4. Backfill-trimmed text gives `basis_mismatch`, never shifted coordinates.
5. A re-chunk or supersession during retrieval gives `chunk_set_changed` or
   no hit, and no neighbours from the new chunk set.
6. A budget cut at an astral CJK character stays within budget, splits no
   surrogate pair, and its identity verifies.

Existing seams: `server/services/__tests__/rag-context-expansion.test.ts` (stub
pool), `rag-disposition.pglite.integration.test.ts` (real SQL; the fixture
needs `chunk_index` and `char_*` columns),
`vault/__tests__/retrieval-actor-revalidation.test.ts`, and
`ana/__tests__/document-passage-tools.test.ts`.

## Risks

- **Neighbour leakage:** a neighbour must never come from a second query.
- **Same-hash re-extraction:** this changes the text without changing
  `contentHash`. `extractedTextSha256` in the reference catches it.
- **Memory:** loading `extracted_text` once per distinct document (up to
  about 2M characters). Deduplicate by document and expand only the top hits.
- **Quote correction:** fixing the citation `quote` at `:2076` to use the exact
  span is part of this change, because a persisted quote must occur in the
  source.
