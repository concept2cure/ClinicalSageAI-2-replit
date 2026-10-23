# Unicode chunk boundary correction publication — D2 / W2

The correction is pushed directly to `concept2cure-v2` at accepted code head `70e5ea3bb1576b446ae02a6df80415850fab042b`. No PR, alternate branch, force push, rule/baseline change or hook bypass was used. Incoming remote history was merged normally without conflicts; all 82 selected qualification inputs remained unchanged.

## What already exists

The correction extends the one chunker in `server/services/vault/document-chunking.service.ts`, reached by existing ingest and backfill. The atomic writer, eligibility fences, embedding placement, pages, passage context verifier and exact-text identity remain canonical. [INVENTORY.md](INVENTORY.md) records discovery; [CONTRACT.md](CONTRACT.md) records accepted behavior.

## Code and qualification

- Baseline: `0a7abf3146aeb8cd2fd6965740446c01c013120b`.
- Contract: `0fff4da02`; normal documentation-only push passed.
- Frozen fail-first tests: `3ea41d340ae8561c11103cde3efd7607974eeb90`.
- Correction: `c7ec68c35d6009f4d4549e61ff47a362db4fbae0`.
- Accepted merge/code head: `70e5ea3bb1576b446ae02a6df80415850fab042b`.
- Three new test files: 33 cases, with 19 semantic failures / 14 controls on unchanged baseline; all pass after correction. Frozen hashes remained unchanged.
- Final selected run: **331 tests / 25 files passed**, zero failures/skips. The deterministic property test examines **2,688 inputs / 8,080 chunks with zero violations**, versus 1,019 corrupt baseline chunks.
- Changed-file lint: zero errors, one existing writer warning, zero warning growth and zero new-test warnings.
- Normal code push: every mandatory gate passed, including actual whole-project TypeScript **zero errors / compiler exit 0**. See `root/implementation-push*`.

The first local implementation passed runtime tests but gained one complexity warning. Two redundant nullish fallbacks were removed at provably in-range lookups; no frozen assertion, fixture or baseline changed. Initial/final logs and the range proof remain in the evidence. The pre-freeze test regrouping similarly removed a describe-length warning without altering cases, and baseline failure was rerun afterwards.

## Remote verification and evidence scope

`root/code-verification.json` records a fresh fetch with local = remote `70e5ea3bb1576b446ae02a6df80415850fab042b`, a clean tracked tree, no unmerged entries, all 82 selected inputs, 25 test files, three frozen test files and all 53 evidence files tracked at that code head verified against remote Git bytes. All 74 recorded retained ancestors remain reachable. Its pending evidence list is explicit.

This final evidence-only publication adds the actual push receipt, verification and documentation. `publication-manifest.json` pins every evidence file in this directory except itself; final read-only fresh-fetch checks verify that manifest, every pinned file, all selected inputs and retained history against the published branch. The manifest is not a self-hash and the last check is reported in tool output rather than generating recursive proof commits.

`qualification-source-manifest.json` deliberately pins selected inputs and one-hop relative imports, not every transitive dependency. Worker scope files preserve authoring handoff status; `root/qualification.json` and the final logs provide the current verdict. Original failed/local intermediate outputs remain historical evidence rather than current acceptance.

## Limits

This fixes valid surrogate pairs on new ingestion or explicit reindexing. Previously corrupted rows remain refused; they are not automatically repaired. It does not repair malformed originals or preserve entire grapheme clusters. Corrected cuts can change page attribution/chunk counts and may trigger the existing whole-document MAX_CHUNKS refusal. Backfill's trimmed-source basis and `read_project_document` rendered-span/receipt boundary contract remain separate needs.

PGlite tests exercise actual SQL and UTF-8 storage under a minimal owner-mode schema. They do not establish native PostgreSQL RLS, live provider behavior, deployment, full retrieval qualification, commercial launch readiness or agency acceptance.
