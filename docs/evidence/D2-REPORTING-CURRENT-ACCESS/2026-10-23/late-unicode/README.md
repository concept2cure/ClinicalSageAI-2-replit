# Preserve concurrent Vault Unicode chunk correction

## What already exists

The canonical `chunkExtractedText` function already records exact UTF-16 source spans and feeds the existing atomic tenant-fenced writer, SQL/UTF-8 storage and exact-source verification. The incoming correction extends this same function. [Its existing evidence](../../../D2-UNICODE-CHUNK-BOUNDARIES/2026-10-23/README.md) retains frozen fail-first tests and separate broader regression qualification.

Incoming canonical `70e5ea3bb` was normally merged at `41c39279a` after a second publication attempt passed its gates but encountered a remote advance. The only incoming runtime delta moves a hard end inside a surrogate pair back one unit and a split overlap start forward one. Bounds, overlap clamp, forward progress, source slicing, writer and verification paths remain in use. This read-only review found no blocker and made no application changes.

All **33 tests in the three changed suites pass**, with **zero failures, pending cases or TODOs**, in **9.53 seconds**. The deterministic corpus covers **2,688 inputs and 8,080 chunks with zero violations**; the SQL suite checks UTF-8 persistence, page attribution, replacement, exact-source identity and retained corruption/access/disposition refusals.

All **four current source/test pins** match before and after execution. The previous **20 backend, 36 reporting client, 12 native provenance and 18 re-filing pins** also remain unchanged. `checks.json` records exact command, results and pins; lossless verbose/JSON logs are compressed and verified by `archives.json`. Earlier overlapping counts retain their own source epochs and are not added to this run.

This correction protects surrogate pairs in new or explicitly reindexed chunks. It does not repair legacy corruption or preserve whole grapheme clusters; existing MAX_CHUNKS refusal and separate retrieval/backfill/cache limitations remain. Local PGlite and deterministic tests do not establish native PostgreSQL RLS, deployment, provider or agency acceptance. Root owns the refreshed build, full compiler and normal canonical publication gates.
