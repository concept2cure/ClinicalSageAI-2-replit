# Pure chunker contract cases

## What already exists

`server/services/vault/document-chunking.service.ts` owns the public `chunkExtractedText` splitter. `server/services/ana/draft-source-identity.ts` owns malformed-source refusal. The existing pure chunker suite verifies ASCII coverage and overlap; the new `server/services/vault/__tests__/document-chunking-unicode.test.ts` extends those contracts through the same public APIs.

The new file defines 24 cases: three hard-end fixtures; five overlap/default-clamp cases; four dense supplementary fixtures; minimum-size and UTF-16-coordinate cases; three separator cases and one separator-priority case; two exact ASCII/BMP controls; two malformed-source controls; one mixed-text determinism/coverage case; and one empty/short-source control. Invariants check exact source slices, UTF-8 round trips, bounded size and overlap, advancing starts/ends, and full source coverage. Delimiter and legacy control expectations are explicit, rather than a second chunker implementation.

These tests were written from the published contract before production changes. This document records authorship and scope only. Root owns the unchanged-baseline run, semantic fail-first classification, source/test hash freeze, and subsequent qualification. No test result is claimed here before that run.
