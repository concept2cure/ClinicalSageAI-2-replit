# Passage withholding outcome — frozen baseline proof

## What already exists

- `server/services/ana/tool-outcome.ts` already provides `shortfallOf` and
  `buildShortfallNote`. The native reader distinguishes genuine empty results,
  unavailable services, missing input and successful known-match omissions. It
  does not yet recognize the agreed round-withholding declaration.
- `server/services/ana/tool-trace.ts` already owns refusal interpretation. The
  native shortfall reader uses it before interpreting other outcomes; these
  tests retain that priority.
- `tests/services/tool-outcome.test.ts` and
  `tests/services/tool-outcome-passage-omission.test.ts` already cover ordinary
  shortfalls and known omitted matches. This new file completes the existing
  consumer's withheld-result contract, without substituting or duplicating it.
- The parent [inventory](../INVENTORY.md) and [contract](../CONTRACT.md) record
  the existing budget, hosts, trace seams and pre-design searches.

## Frozen scope

`tests/services/tool-outcome-passage-withheld.test.ts` calls the two existing
native exports directly. No production mock or missing future export creates
the red result. There are no handler, retrieval, model, gateway, source-access
or database operations in this proof.

The exact top-level code `PASSAGE_RESULT_WITHHELD` with `delivered === false`
must yield the distinct `withheld` kind, after refusal, declared status and
nonempty-record priorities. It must not reinterpret copied diagnostic prose,
zero counters or stray omission metadata as authority to claim unavailable,
empty or known matching passages. Invalid flags/codes, nested declarations and
non-object inputs do not establish withholding.

The note must name withholding and offer narrowing/reading guidance without
asserting matches or a miss. Mixed rounds preserve the separate meanings of
withheld results, known omitted matches and genuine misses. Ordinary and
known-omitted notes are compared against their exact existing bytes. Failed,
stopped, held and returned-record steps retain their existing note behavior.

## Observed baseline

The canonical Node **v22.23.3** run used `vitest.config.ts`, one worker, no file
parallelism and a 4 GiB heap. It observed **8 intended failures and 39 passing
controls, 47 tests total**. All eight failures are the missing withheld kind or
guidance; the existing exports loaded and all priority/shape/compatibility
controls passed. See [baseline-command.json](baseline-command.json), byte-raw
[baseline-red.txt](baseline-red.txt) and [baseline-result.json](baseline-result.json).

The test was frozen after that run with SHA256
`5083e50ba788ff7f7dded872c6be2152cc13d1ed5cd165e0740bd18d3074429e`.
All **26 root baseline inputs** remained unchanged before and after the run;
two existing consumer-control test files are additionally pinned. These selected
28 inputs are not an exhaustive dependency graph. Exact pins/counts are in
[frozen-test.json](frozen-test.json).

Scoped ESLint observed **0 errors and 0 warnings**. Its exact command and result
are in [lint-command.json](lint-command.json); [lint-raw.json](lint-raw.json) is
the unmodified JSON stdout, with stderr retained separately. No compiler was
run. Raw transcripts retain their original bytes and terminal whitespace.

This qualifies deterministic outcome interpretation of synthetic JSON, not
source admission, actual budget delivery, provider service or agency acceptance.
This owner changed only the new test and this evidence subdirectory, with no
production or Git mutations. The test remains frozen for root implementation.
