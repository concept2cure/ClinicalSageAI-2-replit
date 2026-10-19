# D2 / W2 — passage context as one exact, verified source span

Date: 2026-10-19. Baseline: the `concept2cure-v2` head at the start of this
work (recorded in `README.md`). Design:
[PASSAGE_CONTEXT_SPAN_2026-10-18](../../../design/PASSAGE_CONTEXT_SPAN_2026-10-18.md).
Need: the second half of priority 3 of the
[remaining-needs assessment](../../../reports/data-room-research-2026-10-14/remaining-needs-2026-10-18.md).

No new surface, model, index, schema or route. One SQL path: the existing
vault neighbour query inside `AdvancedRAGPipeline.expandContext`.

## Observed defect at baseline

`expandContext` reads vault neighbour chunks by `chunk_index` only. It sets
`expandedContent = texts.join('\n\n')`, which repeats every chunk's overlap
(the chunker's default is 400 characters) and inserts paragraph breaks the
source does not have. That text then reaches compression and is persisted as
a citation `quote`. `searchDocumentPassages` drops it and returns only the
hit chunk's `content`, though its own comment promises the expansion.

## Interfaces (exact)

**New pure module: `server/services/vault/passage-context-span.ts`**

```ts
export const PASSAGE_CONTEXT_SIDE_CHARS = 1000;   // extension on each side of the hit
export const PASSAGE_CONTEXT_MAX_CHARS = 12000;   // the identity contract's span cap
export interface ChunkCoordinate {
  id: string; chunkIndex: number; charStart: number | null; charEnd: number | null; text: string;
}
export type PassageContextUnavailableReason =
  'no_offsets' | 'basis_mismatch' | 'chunk_set_changed' | 'not_contiguous' | 'encoding' | 'budget' | 'not_expanded';
export type PassageContext =
  | { status: 'available'; text: string; reference: DraftSourceReferenceV2; chunkRange: [number, number]; clipped: boolean }
  | { status: 'unavailable'; reason: PassageContextUnavailableReason };
export function buildPassageContext(input: {
  documentId: string; contentHash: string; extractedText: string | null;
  hit: { chunkId: string; chunkIndex: number };
  chunks: ChunkCoordinate[];   // any order
}): { context: PassageContext; hitSpan: { start: number; end: number } | null };
```

Checks run in this order. The first failure decides the result, and
`hitSpan` is null unless stated otherwise.

1. **`chunk_set_changed`:** no chunk has both the hit's `id` and its
   `chunkIndex`.
2. **`no_offsets`:** `extractedText` is null, or any chunk's offsets are null.
3. **`basis_mismatch`:** any chunk's offsets are not safe integers with
   `0 ≤ start < end ≤ text.length`, or
   `extractedText.slice(start, end) !== text`.
4. **`not_contiguous`:** sorted by `chunkIndex`, the indices must be
   consecutive and each `start` must exceed the previous start and not exceed
   the previous end (no gap). Otherwise this reason; overlap is allowed.
5. **`budget`:** the hit chunk's own span exceeds `PASSAGE_CONTEXT_MAX_CHARS`.
   `hitSpan` is set.

When every check passes:

- **`hitSpan`** is the hit chunk's `[start, end)`.
- **Span:** `start = max(firstStart, hitStart − SIDE)` and
  `end = min(lastEnd, hitEnd + SIDE)`, reduced to fit `MAX` by trimming the
  side farther from the hit first. The hit is always fully inside.
- **Edges:** an edge that splits a surrogate pair moves outward by one, within
  `[firstStart, lastEnd]`. If it still splits one, or the identity helper
  refuses the encoding, the result is **`encoding`**.
- **Fields:** `text = extractedText.slice(start, end)`, the source text
  itself, so the overlap appears once and there are no invented seams.
  `chunkRange` is `[first, last]` chunk index. `clipped` is true when the span
  is narrower than `[firstStart, lastEnd)`.
- **`reference`:** `{ documentId, contentHash, span: { start, end,
  totalChars: extractedText.length }, ...draftSourceIdentityForText(...) }`,
  the existing identity helper. No second hash implementation.

**`AdvancedRAGPipeline.expandContext`, vault branch only**

- The same statement also selects `c.id`, `c.chunk_index`, `c.char_start`
  and `c.char_end`, plus `d.extracted_text` on the hit's row only
  (`CASE WHEN c.id = $hit THEN d.extracted_text END`). Every existing tenant,
  disposition, program and supersession predicate is unchanged.
- The content-hash pin applies when `sourceReadScope` is set (as today) or the
  hit carries a `contentHash`.
- No rows still drops the candidate (unchanged).
- The document gains `hitSpan` and `passageContext` from
  `buildPassageContext`. `expandedContent` is `context.text` when available.
  Otherwise it is unset: the hit's own content stands, and joined chunk text
  is never substituted.
- The `rag_chunk` branch is unchanged.

**`searchDocumentPassages`**

- `PassageHit` gains `contentHash: string | null`,
  `hitSpan: { start, end } | null` and `context: PassageContext`.
- A hit that was never expanded gets
  `{ status: 'unavailable', reason: 'not_expanded' }`.
- `text` remains the hit chunk's own content.

**The `search_document_passages` tool message** says to quote surrounding text
only from `context.text` when `context.status` is `available`. It does not
claim the reference has been accepted anywhere.

## Proof required

Fail-first against baseline bytes, then green with the same test bytes:
- **Split result:** a header in chunk 4, `12/40 (30%)` in chunk 5 and
  `N=40 (ITT)` in chunk 6, with the hit on chunk 5. The context equals
  `T.slice(…)` exactly, and the overlap appears once.
- No `\n\n` at a seam unless `T` has one.
- Each unavailable reason.
- Budget clipping, with the hit kept fully inside.
- Surrogate-safe edges, and an identity that verifies with the existing
  helper.
- The `expandContext` vault path through a stub executor: the SQL carries
  the new columns and the hit parameter, no joined text is produced, and
  `expandedContent` equals the span.
- The passage-search mapping carries `context` and `hitSpan`.

The existing RAG expansion, disposition, revalidation and passage-tool suites
still pass. Scoped ESLint, `ci:sql-interpolation` and the normal pre-push
gate.

## Limits

- The full `extracted_text` is read once per expanded hit, in the same
  statement. That is memory proportional to document size, bounded by the
  passage `limit`.
- Legacy chunks without offsets, and backfilled chunks cut from trimmed text,
  get no context. They are reported as unavailable, not approximated.
- Compressed content (`compressedContent`) is model output and unchanged.
- `rag_chunks` expansion is unchanged.
