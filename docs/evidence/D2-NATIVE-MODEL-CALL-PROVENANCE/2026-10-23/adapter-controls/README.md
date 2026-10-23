# Existing adapter and model-reader compatibility controls — D2 / W2

## What already exists

`AnaToolExecutor.executeAgenticLoop` already invokes the optional
`onModelResponse` after each returned gateway call, including round 0. Its
existing observer-fault containment and canonical model-author reader are reused
by the approved [contract](../CONTRACT.md); this increment does not modify them.
The three suites below are unchanged controls, not new fail-first evidence.

## Observed result

**35 tests passed / 3 suites, zero failures, skips or todo; exit 0**, using
Node 22.23.3, the canonical Vitest configuration, one worker and no file parallelism.
All 26 selected baseline source/config/rule/test inputs matched the recorded
baseline before and after this run; all three test hashes were unchanged.

- `executor-agentic-loop-options.test.ts` (23 cases): the observer receives each
  returned scripted gateway response once, in rounds `[0, 1, 2]`; throwing
  observers cannot prevent tool results reaching the next call or the final
  answer. Existing dispatch, cancellation, policy and loop-option controls pass.
- `turn-record-served-models.test.ts` (9 cases): the existing real recorder and
  canonical reader preserve model-call authors, including explicit unknowns;
  distinct author lists retain first-seen order. Existing qualification and
  legacy/malformed-body fallback behavior remain unchanged.
- `context-window-executor-carry.test.ts` (3 cases): an initial or later typed
  context refusal retains the exact error object. Later refusal preserves raw
  callbacks, framed staging and the fixture's admitted source receipt. A fitting
  follow-up retains normal completion.

## Evidence and limits

[command.json](command.json) retains the exact argv, runtime, test hashes and
start time. [raw.txt](raw.txt), [results.json](results.json), [exit.json](exit.json)
and [SUMMARY.json](SUMMARY.json) retain the transcript, machine report, completion
and counts. The baseline snapshots are [before](baseline-before.json) and
[after](baseline-after.json).

The adapter/core-loop/dispatch/staging/framing and recorder/reader/qualification
are real. Gateways/providers are scripted; Vault/source/receipt access and selected
tool authorization are fixtures. Model-reader records are sealed in memory, not
persisted by these tests. The existing non-fatal development audit-service/HMAC
warnings remain in the raw transcript; no live provider, real gateway admission,
durable receipt/record database write, production audit guarantee or agency
acceptance is claimed. Native host wiring and first-failure observation limits
belong to the separate fail-first suites.

No source, test, dependency, compiler, hook or Git mutation was performed. This
worker wrote only this evidence folder.
