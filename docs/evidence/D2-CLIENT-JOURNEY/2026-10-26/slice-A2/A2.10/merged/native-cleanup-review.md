# PM-05 native-test shutdown repair

Launch row D2, merged A2.10, 2026-10-26. This repairs only the disposable
database test's own shutdown, with all 16 functional assertions preserved.

## What already exists

`tests/db/project-client-workspace-intake.dbtest.ts` provisions its own public
database and runtime role, executes real canonical intake/anchor/audit SQL with
FORCE RLS, then ends its runtime and owner pools before dropping that database.
The prior teardown used DROP DATABASE WITH FORCE. The shared database and the
native browser fixture are separate and must not be dropped by this harness.

The installed pg-pool's `_pulseQueue` resolves pool.end() once its client array
is empty. `_remove` removes each client from that array before its Client.end()
callback receives the connection-end acknowledgement. Thus pool.end() is not
proof that every connection has acknowledged closure before a following forced
database drop. No additional production connection owner is needed to explain
the observed failure.

## Observed red and correction

The first merged native run passed all 16 assertions but reported two uncaught
57P01 errors during teardown. Both were owner-role connections to this test's
disposable database, already ending but not ended. The forced database drop
raced their graceful termination. This is a failed qualification, not a clean
16-case pass; the lead retained the failure evidence.

Track each pool client's public end event before the first query. End the
pool, then await all outstanding client end acknowledgements. Drop the test's
database without FORCE, so an unexpected remaining connection fails cleanup
instead of being terminated and hidden. No error listener, suppression, ignored
Vitest errors, production pool, guard, role, RLS or test assertion changes.

## Verification

The corrected test passes all **16 unique native cases**, exits zero and reports
no unhandled errors. A second run was justified to check this shutdown race;
it also passes the same 16 cases with exit zero and no unhandled errors. Times
were 6.88 and 7.31 seconds. The successful plain database drop proves this test
has no remaining database connection requiring forced termination at cleanup.

The functional describe body is byte-identical to `37f2ed240`, recorded in
`native-cleanup-proof.json`. Only connection tracking and teardown change;
RLS, the non-owner/NOBYPASSRLS runtime, SQL, production code and all assertions
remain. Scoped ESLint has no diagnostics and diff checking is clean.

Logs: `native-cleanup-green.log.gz` and `native-cleanup-confirm.log.gz`.
These repeat the same 16 cases and must not be counted as 32 unique tests.
This narrow test does not qualify deployment posture, real authentication or
formal OQ. The earlier failed cleanup run remains attributed as a failure.
