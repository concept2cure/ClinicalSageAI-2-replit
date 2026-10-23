# Backfill exact stored-source contract — D2 / W2

## What already exists

[INVENTORY.md](INVENTORY.md) identifies the existing sweep, tenant CLI wrapper, canonical chunk writer/verifier and ledger count convention. Correct only the sweep's source argument; add no engine, repair job, flag, schema, provider, dependency, tool or UI.

## Behavior

1. Keep `doc.extracted_text ?? ''` unchanged as the text passed to the existing indexCandidate helper, chunk writer and optional uncatalogued extraction-ledger builder. Do not trim, normalize, repair encoding, shift offsets or change source storage.
2. Use `.trim().length === 0` only as the existing blank-document predicate. NULL, empty, ECMAScript whitespace/BOM-only inputs keep their named skips and no writer/ledger/provider calls, in dry-run and apply modes. Preserve existing extraction-failed versus missing-text reasons.
3. Nonblank stored text preserves all leading/trailing spaces, CRLF, BOM, NBSP, Japanese/scientific and supplementary characters. Persisted chunks must equal the stored source's UTF-16 slices; verified context/reference comes from that same source and totalChars, with no invented remap. Keep the existing chunker's Unicode boundary behavior.
4. Keep dry-run, tenant UUID admission/writer ownership, candidate selection, limits, retryFailed, embedding policy, keyless mode, failure reporting, transactions and outcome recording unchanged. Edge whitespace may alter chunk count or trigger existing MAX_CHUNKS refusal; never index a prefix to fit. No guessed page attribution is added.
5. Catalog character/word counts retain the canonical builder's independently trimmed convention; this is not a catalog-count migration. Preserve existing candidate/writer checks, without claiming the candidate SELECT has supersession/live-parent/disposition predicates it does not contain.
6. Adds no automatic historical reindex policy. No production backfill run, live-provider, native RLS, deployment, complete platform readiness or agency acceptance claim. A source changing during an indexing await remains governed by existing writer/retrieval behavior; this correction adds no new indexing snapshot protocol.

## Qualification

Independent contract review precedes worker expansion. Author meaningful fail-first backfill, canonical writer/storage/context and boundary controls; preserve original hashes before production changes. New tests should be explicitly typed (generic Queryable adapters and optional mock arguments in particular). Root owns production, compilers, tests and Git; workers own disjoint new files only. Current-source runs, lint without growth and mandatory normal direct canonical push gates including whole-project TypeScript must pass. Resolve incoming history by normal merge/fast-forward; publish all evidence here.
