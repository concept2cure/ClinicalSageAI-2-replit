# Preserved baseline failure

The 20-file qualification has 262 passed / 1 failed (263 total). All 16 new
regression cases pass. The failure is the unchanged existing
`stream-tool-carry-over.test.ts` case “a step the person declined is not carried,
and a first turn is offered what it was”. With all three changed production
files temporarily restored to synchronized base
`b0b1694aa00ee991b6792edab530f9fa59f1df93`, the same suite has 11 passed / 1
failed, at the same assertion. The original test blob is unchanged. The final
six production/test blobs were restored and verified in `finally`.

`carry-over-baseline.*` preserves the baseline command, actual exit 1 and
transcript. `qualification.*` preserves the final 20-file command and actual
exit 1. `baseline-comparison.json` checks matching test path/name and all 16
new passing assertions. This failure is not excluded from the qualification.

The synchronized CMC policy puts `get_cmc_requirements` in
`ALWAYS_ON_TOOLS` in `server/services/ana/tool-selection.ts`. The test's governed
pool includes it, so it is offered regardless of the declined trace. The old
expectation that it be absent (and the later three-tool first-turn expectation)
predates this policy. `carriedToolsFrom` continues to exclude error-status tools.
This existing disagreement is outside this listener/Stop batch. Merge commit
`748b9baceb3fa939e0ff6a0adc652907f5781fd9` already records the exact failure on
trunk. No selector, existing test, baseline, suppression or gate is changed.

Remote advancement to `4536fe4c2` changed documentation and filing-path tests
only; all six tested source/test blobs stayed identical. Publication compares
this batch against that synchronized base, preserving other-session work.
