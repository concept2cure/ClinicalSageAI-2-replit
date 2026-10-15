# Proposal identity and editor lifecycle checks

Independent W1 / D2 test session on `concept2cure-v2`, base `bd873886`.
Contract: [Existing editor remedy lifecycle](../../../../design/EDITOR_REMEDY_LIFECYCLE_2026-10-14.md).
This session changed tests only, with no production/provider call, migration,
dependency, editor or suggestion store.

## Before implementation

The initial 18-case probe ran against unchanged `suggestions.ts` and
`RichSectionEditor.tsx`: **16 failed and two conservative-state cases passed**.
[Before results](low-level-before.txt) retain the assertions and case outcomes;
the raw local output is `/workspace/scratch/remedy-low-level-before.log`.
No case failed because of a missing import. The tests use real TipTap marks,
review commands, serialized HTML and the actual device draft controls.

The failures show missing application IDs on real marks, loss of IDs on
serialization, two adjacent same-turn proposals becoming one decision,
reject/reapply reusing the same-minute decision IDs, and the handle lacking
observable pending/resolved/readiness state or notifications. Existing source
mode/destroyed-editor refusal and restored modified content without marks
remained conservative. One preliminary source fixture was corrected before
this preserved probe; its fixture failure is excluded from this evidence.
The implementation session received its go signal only after this probe ended.

## Final low-level scope

Six identity cases prove exact UUID receipts, preserved AnA turn attribution,
adjacent same-turn separation, mark serialization, multi-block list replacement
identity, distinct same-minute reject/reapply decision IDs, and unchanged legacy
typing-run grouping/IDs when no application ID exists.

Twenty-two handle cases prove pending state from actual surviving marks, full
rejection and explicit retry, partial rejection, partial acceptance, full
acceptance, deletion-only accept/reject, notifications and unsubscribe, readiness,
explicit cache Discard, modified cache Restore without marks, pending cache
Restore, saved-redline remount, unreadable device-cache handling, initial
proposal availability before hydration and cache choice, and
source/read-only/destroyed-editor refusal. A command
capability check cannot be mistaken for an actual acceptance. The tests observe
the same mounted editor, its real review commands and device-cache choices;
they do not maintain a separate suggestion census.

The existing anchored-replacement suite retains all 44 text, quote, source,
selection, structural and accept/reject round-trip cases. Its success matcher
now permits the added receipt fields, and the editable-handle success case
awaits the public `canProposeReplacement()` readiness and wraps the real edit
in `act`. Intended-success lifecycle helper calls also await that readiness.
The direct unready/cache-refusal cases remain immediate calls, and all content
and refusal assertions are unchanged.

## Results and reproduction

The initial green probe passed **64 tests in three files in 7.49 seconds**,
including the first 20 new cases.
[Green results](low-level-green.txt); raw local output:
`/workspace/scratch/remedy-low-level-after.log`.
Both new files passed strict zero-warning ESLint; output:
`/workspace/scratch/remedy-low-level-lint.log`.

A subsequent control-tower review found an unreadable-cache edge: the cache
check flag remained false after `getItem` threw, although the editor offered no
Restore/Discard choice. A focused regression failed on the real pending marks
being reported unavailable: **one failed, 14 skipped**, 2.02 seconds;
[Before results](unreadable-cache-before.txt). Only the account-scoped cache
read is made unavailable; the mounted rich editor still creates and resolves
real proposals.

After the implementation session corrected the completed-cache-check flag,
**all 15 handle cases passed in 3.35 seconds**, including known-instance
pending, complete rejection, explicit retry with a distinct application ID and
no save under unreadable storage: [Green results](unreadable-cache-green.txt).
The updated handle suite passed strict zero-warning ESLint. Raw outputs:
`/workspace/scratch/remedy-unreadable-cache-{before,green,lint}.log`.
Initial application availability received five further handle cases. The
first focused run produced **four failures, one pass and 15 skipped**;
[Before results](first-proposal-before.txt). Three direct behavioral failures
showed actual proposal writes before hydration or behind an unresolved cached
draft choice. Source mode refused, and the new writable-availability assertion
also failed before the handle method existed. The test verifies unchanged
body/marks and no save while unavailable, then successful explicit application
after either Restore or Discard.

The first availability implementation left a retained handle reporting
available immediately after unmount, during TipTap's deferred destruction:
**19 passed, one failed**, [Detached handle results](detached-handle-before.txt).
The implementation session then applied the existing lifecycle's synchronous
liveness guard to the initial proposal door. The final complete handle run
passed **all 20 cases in 7.30 seconds**, [Green results](first-proposal-green.txt),
and the updated suite passed strict zero-warning ESLint. Raw local outputs:
`/workspace/scratch/remedy-first-proposal-{before,green,lint}.log` and
`/workspace/scratch/remedy-detached-handle-before.log`.

There are now 28 new cases across the two independent suites. These runs
overlap and their counts must not be added together as unique tests.

After the final availability/liveness contract froze, the three low-level
suites passed together: **70 tests in three files, 8.20 seconds**. This is the
pre-sync complete result: [Green results](low-level-final-green.txt), raw
output `/workspace/scratch/remedy-low-level-final-ready.log`. All three test
files passed strict zero-warning ESLint, output
`/workspace/scratch/remedy-low-level-final-lint.log`.

## Existing session guard integration

The control tower synchronized the remote platform changes at `11fb58f1`,
including the existing synchronous `sessionChangeGuard` hold in the rich editor.
Two authorized integration cases verify that a retained ready handle immediately
refuses a proposal inside the same `act` as the session reservation, before
React's held-state render; releasing the reservation restores availability.
The other case places a real proposal and attempts the reservation in the same
`act`, proving the synchronous dirty guard sees the pending work before React
commits. The held refusal preserves content; neither case saves. These exercise the
preexisting guard directly; no new production guard or forced mutation was added.

The parent compiler also identified the React 19 ref contract: `createRef`
returns a ref whose current value can be null. The owned test helper arguments
now explicitly accept `RefObject<LifecycleHandle | null>`, without casts or
compiler suppressions.

The current post-sync complete low-level result is **72 tests in three files,
15.60 seconds**, [Post-sync green results](low-level-post-sync-green.txt), raw
output `/workspace/scratch/remedy-low-level-post-sync.log`. All three files
passed strict zero-warning ESLint, output
`/workspace/scratch/remedy-low-level-post-sync-lint.log`. Whole-tree compiler
verification remains with the control tower.

```sh
PATH=/workspace/scratch/editor-toolchain/node_modules/.bin:$PATH \
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --config vitest.config.ts \
  client/src/concept2cure/v2/editor/__tests__/proposalApplicationIdentity.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/richProposalLifecycle.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/suggestionsPropose.test.tsx
```

Whole-workbench model/version/scope guards, browser scenarios, compiler/build,
repository release gates and final commit/push evidence belong to the control
tower. These local test results do not claim deployed or qualified model behavior.
