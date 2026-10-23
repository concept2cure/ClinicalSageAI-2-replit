# Independent deterministic Unicode property corpus

## What already exists

The test calls the existing canonical `chunkExtractedText` in `server/services/vault/document-chunking.service.ts`. It implements no alternative chunker or production boundary helper. Existing source slices and UTF-16 coordinate semantics are the oracle contract; UTF-8 round trips and an independent code-unit pair detector check intact text.

The new test is `server/services/vault/__tests__/document-chunking-unicode-properties.test.ts`.

## Corpus

There are 2,688 deterministic cases: 896 targeted boundary/delimiter cases and 1,792 seeded complete-token cases. Requested sizes 499, 501, 700 and 4000 cover the existing 500-unit minimum, odd boundaries and the default-sized bound. Seven overlap choices cover negative clamping, zero, one, two, below-half, half and above-half clamping. Four supplementary characters include Japanese and scientific text: `𠮷`, `🧬`, `𝛼` and `𠀀`.

Targeted cases place characters across hard ends and overlap starts, exercise the earliest word cut and repeat supplementary characters densely. Delimiters include paragraph, sentence and word boundaries. The seeded generator appends whole tokens, including combining marks, CRLF and BOM; it never truncates generated originals into lone surrogate halves.

Every case checks original UTF-8 integrity, nonempty chunks, source start/tail, deterministic results, sequential indexes, integer/bounded coordinates, exact source slices, size cap, intact character boundaries, UTF-8 round trips, strictly advancing starts and ends, complete coverage and the overlap cap. Violations accumulate across the entire corpus before the final assertion; stdout reports case count, chunk count, per-invariant violation counts and up to eight examples.

## Execution status

No run is claimed by this authoring record. The control-tower agent owns baseline execution, frozen hashes and subsequent qualification. The source hash supplied at handoff is `517e92a5a0296735aa9b617db982d447beaf2f94deed7bdcb7a2def566e24b78`.

This is a deterministic property corpus, not exhaustive Unicode, storage, live-provider or deployment qualification. Real SQL storage is covered independently by the storage workstream.
