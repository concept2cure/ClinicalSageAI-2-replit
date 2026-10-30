# Tasking read truth and recovery

## What already exists

`client/src/concept2cure/v2/surfaces/TaskBoard.tsx` owns the live board, unread-source notice, project choices, retry counter and AnA surface-action handlers. `dataConnect.tsx` already owns shape guards, list reads and the shared ErrorState/retry controls. `surfaceActions.ts` owns handler registration, readiness and refusals. Existing board response-shape, every-store, notification-target, assignment recovery, signature and write-refusal suites cover the related product controls. The server board and cross-store reader already supply partial-read metadata; neither is changed here. The root design/evidence inventory records current routes, services, deleted-history searches and canonical ownership.

## Correction

One local incomplete-read flag recognizes `partial: true` and named unread sources independently. Incomplete empty reads show unavailable/retry and publish unknown counts; incomplete nonempty reads retain saved cards and qualify observed counts with named or generic wording. AnA can open a readable matching task; a miss on an incomplete board is an incomplete-read refusal. Existing complete empty, complete miss, loading, signature and archive-canvas guards remain distinct.

The board's project-options read reuses `isRowsWith` and validates every row's numeric safe positive ID and string name. Malformed containers, names, identities and later null rows become unread choices, preserving saved task cards. A named project needs a successful project read; all-project clearing and module/mine-only filters do not. Combined filters stage all values before any setter, so a refused combination changes nothing.

The existing shared ErrorState provides an independent project-list retry, including when the board is empty. The existing partial status notice keeps its role/text and gains an explicit board retry with the existing retry-button style. Each retry repeats its own read only. Refs prevent same-turn repeat clicks; hook loading displays progress and prevents in-flight dispatch. Repeated identical failures and incomplete results permit another explicit attempt. No automatic retry loop or task mutation is added.

## Verification

- `red.log.gz`: **13 failed / 9 passed**, before production changes; exact 22-case source pins in `red-inputs.json`, test source in `truthfulness-test.tsx.gz`.
- `green-22.log.gz`: **22 passed** after the initial truth/shape correction. `truthfulness-source.patch.gz` records that source stage and `recovery-before-inputs.json` pins its inputs.
- `recovery-red.log.gz`: **7 failed / 22 passed**, before adding explicit retry controls; inputs pinned separately.
- `green.log.gz`: **29 passed** after retry completion.
- `companions-before-notice-correction.log.gz`: the first companion run found one real compatibility regression (**94 passed / 1 failed**): changing the existing partial status notice to an alert conflicted with a notification-target refusal alert. The notice's original status semantics were restored; existing tests were not changed.
- `notice-correction.log.gz`: **70 passed / 2 suites** after that correction.
- **`companions.log.gz`: 124 passed / 8 suites** on the final source, including the 29 focused cases and seven existing board/bus/recovery/signature/refusal suites. `qualified-inputs.json` pins the exact final source/test. Earlier counts overlap and must not be summed.
- `lint.log.gz` and `lint-before.log.gz`: zero errors; nine existing warnings both before and after, zero warnings in the new test. Root owns whole-product build/compiler, integration review and canonical publication.

Checks exercise the actual TaskBoard and surface-action bus, with synthetic HTTP boundary responses. They do not establish the hosted incident's cause. Shared null/204 empty semantics remain unchanged. Board payload validation retains the shared first-row/key-presence limit; only this board's project-options read gains whole-row value validation. Modal project readers and task writes/signatures are outside this correction.
