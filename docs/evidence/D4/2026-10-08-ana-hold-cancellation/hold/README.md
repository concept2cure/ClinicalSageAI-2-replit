# AnA cancellation during a hold status read

W3 / D4; canonical branch `concept2cure-v2`. Source base: `c7a0405d9`.
Owned service changes are `server/services/ana/run-hold.ts` and
`server/services/ana/turn-run-policy.ts`; the direct regression is
`server/services/ana/__tests__/run-hold-cancellation.test.ts`. The control-tower
session owns the stream's signal wiring and the parent delivery record.
There are no UI/client changes, dependencies, new tools/models or gate/baseline
changes in this delivery.

## Reachable defect and fail-first evidence

The stream checkpoint's TurnPolicy run exposed `cancelled()` from its existing
run handle, but did not pass that handle's AbortSignal into RunHold. Stop while
a status read was pending aborted the handle and drove its existing waiters.
When that read later returned a stale `paused` snapshot, there had been no wake
waiter to receive the earlier notification. The checkpoint then waited for the
five-second wake ceiling. A blocked status query could keep it waiting longer.

RunHold itself accepted a signal but only raced the wake against it. A signal
aborted during a status read did not release that read. A stale paused snapshot
could even expire the hold after Stop, and a stale running snapshot could report
running instead of cancellation.

Direct tests drive the actual RunHold and TurnPolicy with controlled status
queries and wake promises. Initial evidence was **8 failed / 1 passed**
(`red.log`). The passing control covered ordinary read completion. The failures
covered unresolved first/later reads, stale paused/running results, shared
waiter isolation, and person/Auto/Manual checkpoint cancellation.

After read cancellation was repaired, a second fail-first set showed that
TurnPolicy still started a queue drain before settling a cancelled hold. Both
person and Manual paths could block on that new database read. Outcome-based
and signal-based cancellation cases produced **4 failed / 9 passed**
(`red-settle.log`). These cases require no new drain or post-hold status read;
Manual's earlier legitimate drain remains permitted.

## Bounded repair

- TurnPolicy accepts the existing optional handle signal and passes it through
  RunHold's existing third argument in both person and Manual paths. The root
  session supplies the signal in the existing stream wiring.
- RunHold races read-only status queries against that signal. A cancelled
  waiter leaves immediately; the pending query retains its rejection observer.
  Every read listener is removed when its wait settles.
- Immediately after each awaited read, a synchronous guard prevents consuming
  a snapshot after Stop. It prevents late paused/resumed/expiry effects,
  including the inner-read to outer-consumer microtask handoff.
- A cancelled hold settles before another queue/status read. The existing
  cancellation check after an already-started drain remains, so a Stop during
  that drain still prevents announcing the steer.

Shared waiter accounting, paused-time intervals, normal Continue, guarded
expiry writers and failure propagation remain intact. The repair does not
cancel a database query already executing or undo writes; it stops waiting for
the read and ignores its later result.

## Final focused verification

Node 22.23.3 / Vitest 4.1.7:

- New direct regression: **16 / 16 passed**.
- Final direct regression plus existing RunHold and TurnPolicy suites:
  **42 / 42 passed across three files** (`green.log`).
- Additional related qualification before the equivalent complexity helper
  extraction: **146 / 146 passed across nine files**
  (`qualification-before-extraction.log`). This includes production-route
  cancellation, existing route holds/policies/disconnects, real PGlite hold
  writers and sub-agent shared holds. The root session records final-source
  broader qualification in the parent delivery record.
- Forced ESLint: **0 errors / 0 warnings** in both production service files and
  the new direct regression (`eslint-final.json`; zero-warning baseline in
  `eslint-before.json`). No suppression or baseline change was used.
- `git diff --check`: passed. Build, compiler, publication gates and commits are
  owned by the control-tower session.

The final direct cases also assert that a live-signal query failure throws its
original error, a cancelled read observes a later rejection without an
unhandled rejection, listeners do not remain attached, held time stops when
the last waiter leaves, a different waiter can still resume, and Manual files
the stopped step truthfully as not run.

Final direct command, with canonical Node 22 first on `PATH`:

```sh
node node_modules/vitest/vitest.mjs run server/services/ana/__tests__/run-hold-cancellation.test.ts server/services/ana/__tests__/run-hold.test.ts server/services/ana/__tests__/turn-run-policy.test.ts --config vitest.config.ts --reporter verbose
```

These controlled reads establish cancellation ordering and truthful outcomes;
they are not a production latency benchmark. Evidence transcripts preserve
their commands/verdicts and trim trailing whitespace only.
