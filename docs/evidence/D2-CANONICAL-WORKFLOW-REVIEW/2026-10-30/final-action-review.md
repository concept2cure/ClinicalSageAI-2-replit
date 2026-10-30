# Final independent review: existing action supersession

Reviewer: `action_order_contract`. Date: 2026-10-30. **APPROVED — no blocking implementation issue found.** This review read the current production diff, complete new test suite and retained root execution evidence. The reviewer ran no test, compiler, browser or Git mutation and edited no production/test source. This document and `final-action-pins.json` are the only outputs.

## What already exists

The owner remains `client/src/concept2cure/v2/surfaceActions.ts`. Existing resolved-target matching, current-handler invocation, one pending slot, TTL, cancellation and React commit/disposal mechanisms are retained. Existing bus and Drive suites remain canonical. The implemented change extends the immediate-success branch of the same `applySurfaceAction`; it creates no second bus, API, action registry, service, storage or permission. Prior contract approval is recorded in `contract-review.md`.

## Implementation assessment

- The pending entry is captured before `performRaw`. The correction runs only after an `applied` outcome and requires that exact captured entry still be pending, a distinct directive object, matching action id and the same **resolved** surface.
- The `pending === previous` check implements the required reentrancy boundary. A handler-created entry survives even when it reuses the old directive object.
- Retirement calls existing `cancelPendingSurfaceAction`; it does not duplicate cancellation/timer/callback code. The existing primitive clears the old slot/timer before notifying its observer, so observer-created work survives. The established replacement reason is explicit.
- The newer outcome is returned unchanged, including its original detail and optional commit promise. Registry validation, alias resolution, handler authority and all refused/failed/throwing paths are unchanged.
- Different actions and surfaces remain independent. Retry-to-retry replacement and identical-directive retry semantics remain their existing behavior; this is deliberately narrower than cancelling every queued operation whenever any action succeeds.
- No backend, regulated content, source admission, review/signature, export/dispatch, entitlement or actor/project permission code is changed by this delta. This statement describes the source diff, not an authenticated-client or whole-platform acceptance claim.

## Test and evidence assessment

The new `surfaceActionSupersession.test.ts` is renderer-free and uses real registry resolution and the actual bus. It controls readiness directly rather than waiting for a board row and assuming all reads settled. Its 12 executed cases retain exact outcome/selection, alias, callback-once, TTL, refusal/throw, independent action/surface, reentrant entry (including reused directive identity), queued-to-queued replacement, identical-directive and commit-promise assertions. No production guard is mocked away.

`action-red.txt` records **4 failures / 8 passes** against unchanged production. The primary failure is the actual target defect: application history becomes `['true', 'false']` after the older readiness signal, where only `['true']` is expected. The other failures show a surviving old retry timer and missing replacement notification. `action-red-inputs.json` records the before-source hash, and its test hash matches the currently reviewed test file exactly.

`action-green.txt` records **56 passes across 6 suites**, including all 12 new cases and the existing bus, React commit/disposal, Drive cancellation and React-selection tests. This is root's retained execution evidence; the reviewer did not rerun it. `action-lint.json` reports zero errors and zero warnings for the changed production/test pair. These are focused results, not final build/TypeScript/publication proof.

## Publication boundary

The approved source and evidence hashes are in `final-action-pins.json`. Root still owns combined current-caller qualification, the separate project/session-isolation change, lint/build/whole-project TypeScript, every normal push gate, synchronization and remote acceptance. Any subsequent change to this production branch requires a delta review or explicit updated qualification; this review does not approve unrelated scope changes.
