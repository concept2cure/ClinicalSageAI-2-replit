# Correct existing Vault chunk cuts — D2 / W2

## What already exists

See [INVENTORY.md](INVENTORY.md). Extend the one `chunkExtractedText` implementation in `server/services/vault/document-chunking.service.ts`; preserve the existing writer, tenancy, embedding policy, pages, passage verifier and source identity helper.

## Accepted behavior

For well-formed source text and existing integer chunk-size options:

1. Every chunk remains exactly source.slice(charStart,charEnd); offsets and lengths continue counting UTF-16 code units. No trimming, normalization, replacement or code-point reindexing.
2. A hard end inside a valid surrogate pair moves backward one unit so text.length never exceeds the existing maxChars bound. Preferred paragraph/sentence/word boundaries keep their existing behavior.
3. The existing next-start calculation keeps its overlap clamp and forward-progress rule. A next start inside a pair moves forward one unit. Actual overlap may be one unit shorter, including zero when a one-unit overlap would retain half a two-unit character. It never exceeds the requested/clamped overlap.
4. Chunks stay nonempty, advance, begin at0, end at source.length, and jointly cover every source unit without gaps, including with zero overlap and repeated supplementary characters.
5. ASCII/BMP text that does not hit a split boundary keeps existing deterministic chunks, spans, separators and page attribution.
6. The existing chunkAndEmbedDocument path stores each resulting text/offset exactly through UTF-8 and real SQL. Existing exact-source context/identity checks accept newly intact chunks and still refuse corrupted legacy chunks; malformed source encoding is not repaired or relabelled as verified.
7. No provider API, new tool/model/schema/dependency/integration, source-read receipt or policy changes. Already stored corrupt chunks are not silently rewritten; reindexing remains an explicit operation through the existing path. Ordinary backfill excludes already-chunked rows and retains its separate trimmed-source limitation. Changed cuts may increase chunk count and trigger the unchanged MAX_CHUNKS refusal; no prefix may be indexed. Corrected Unicode starts may change their page attribution to the actual first character. This protects surrogate pairs, not whole grapheme clusters.

## Qualification sequence

Freeze independent new tests and show semantic failures on unchanged baseline production before editing it. Cover hard ends, overlap starts, maximums/minimum overlap, supplementary Japanese/scientific characters, delimiter cuts, dense supplementary text, UTF-8 round trips, exact coverage and a real PGlite writer/context/identity chain. Preserve passing legacy/corruption controls honestly. Run targeted existing regression, changed-file lint with no warning growth, normal canonical push hooks including whole-tree TypeScript; reconcile incoming branch history without bypass.

Evidence is local qualification, not production deployment, live embedding-provider validation, native PostgreSQL RLS qualification, or agency acceptance. PGlite is a real SQL/UTF-8 test, not proof of deployment or a complete retrieval evaluation. This increment corrects D2/W2 behavior; it does not make all launch rows green.
