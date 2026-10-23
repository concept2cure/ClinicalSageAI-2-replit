# D2 / W2 Vault passage freshness contract

## What already exists

[INVENTORY.md](INVENTORY.md) identifies the canonical mapper, repeated candidate fences, exact context verifier, SQL extraction identity and public consumers. Extend these; add no engine, schema, provider, dependency or tool.

## Behavior

1. Dense and lexical Vault mappers pin an internal `vaultPassageSnapshot` with nullable `extractedTextSha256`, `charStart` and `charEnd`, from the same SQL statement that selects chunk text. Original-file identity and current actor/tenant/program/disposition/supersession predicates remain intact.
2. At every existing candidate fence, read current chunk text, offsets and extraction fingerprint. Compare own text exactly and compare every pinned snapshot field. Reject stale candidates rather than silently replacing text under old scores, vectors, expansion or compression. Missing/changed candidates use the existing drop/refusal behavior; scoped original identity/access errors retain their existing whole-operation refusal.
3. When extracted text exists, SQL also establishes whether the complete current chunk text occurs in that extraction, using literal string position rather than a regex, normalization or offset remapping. Empty or absent own text is rejected. This catches already-stale stored text absent from the current extraction. It does not establish an exact span or distinguish repeated identical passages. Exact span proof remains solely the existing context verifier.
4. Preserve hit-only legacy behavior when extraction is NULL, or offsets are NULL/misaligned but the own text is still present. No invented offset correction, context reference or extraction proof. A NULL extraction is pinned as NULL so a later appearance/disappearance is a change. Missing selected columns or malformed typed values fail closed through the existing record parser.
5. A plain unpinned legacy candidate may be admitted once only after its own text equals the current row and passes the current-source membership rule, then receives the current snapshot. An unpinned candidate already carrying nonempty expanded/compressed text is refused: its derivation basis is unknown. Production initial retrieval always supplies a snapshot. An available passage-context reference must also match the current extraction fingerprint. A surrounding extraction change invalidates derived text even when the hit substring survives.
6. Existing fences cover optional-expansion-off retrieval, cached auxiliary transformations, reranking, MMR, compression, retrieval return, pre-generation and post-generation. A changed source during generation triggers the existing whole-answer refusal. Checks are point-in-time; they cannot recall already dispatched provider inputs.
7. Do not drop all unavailable contexts: unchanged legacy/no-offset/trimmed-basis and bad-neighbor controls retain honest hit-only behavior where own text remains current. Keep rag_chunks, project atoms and memory behavior unchanged. No historical reindex, vector refresh, deployment, live provider, native RLS or agency acceptance claim.

## Qualification

Independent contract review precedes implementation assignments. Independently authored tests must show semantic baseline failures and passing controls before production changes, with frozen hashes. Qualify real SQL/PGlite and asynchronous provider/generation boundaries plus existing regressions. Root alone runs compilers and Git. New tests have zero lint warnings/errors, production lint does not grow. All normal direct pushes to `concept2cure-v2` must pass mandatory gates including whole-project TypeScript; resolve incoming history by normal merge. Record commands, hashes, raw results, limits and publication evidence here.
