# AnA orphan sweep backpressure — W3 / D4

Canonical branch: `concept2cure-v2`. Reproduction base: `0b8a8c3dfd6166286e085de59e13b1217cb17dee`;
publication base: `71126f27b949a5551bddd0aa480ac743691d7abf`. This batch owns one backend file, appended tests
in its existing backpressure test file, and this evidence directory.
Concurrent canonical changes are preserved; there is no UI contribution.

## Delivered behavior

Every opened AnA turn opportunistically calls the estate-wide orphan sweep.
Previously, 20 overlapping calls issued 20 duplicate UPDATEs on the same pool
and cutoff, occupying connections also needed for answers and Stop requests.
The repaired path admits one pending sweep for that pool and effective SQL
cutoff. All overlapping callers observe its actual row count or its actual
failure. This is a query-pressure regression result, not a measured production
latency or SLA claim.

A private WeakMap holds only pending promises, keyed by database pool and the
existing rounded seconds parameter. Different pools and different effective
cutoffs remain independent; millisecond cutoffs that round to the same SQL
parameter share work. The promise is registered before the query can execute,
including a reentrant callback. Its returned cleanup chain releases admission
on success, asynchronous rejection or synchronous query failure. A later call
starts a fresh sweep; neither a result nor an error is cached. A null row count
still means zero. There is no TTL or new timer.

Actual SQL, system tenant scope, stale threshold default and rounding,
eligible live statuses, orphan reason, audit/durable writes and exported
signatures remain unchanged. No UI, dependency, model, tool, integration or
capability was added or changed. Existing control and notification admission
remain unchanged. Equal client directory hashes in `ui-scope.json` prove the
no-UI contribution against the publication base. No lint rule, suppression,
baseline, CI configuration or publication gate was weakened.

## Qualification

| Check | Actual result |
| --- | --- |
| Fail-first, unchanged backend | 7 failed / 7 passed across 14 cases; original five remained passing |
| Final-placement fail-first, unchanged backend | 7 failed / 21 passed across 28 cases; qualified source restored afterward |
| Final direct backpressure/sweep tests | 28 passed, including nine new regressions |
| Related control qualification | 36 passed across three files |
| Broader backend qualification | 259 passed / 0 failed across 17 files, exit 0, 32.05 seconds |
| Forced ESLint | Backend zero errors and its same two existing warnings; test zero errors/warnings |
| Production build | Exit 0, 17.309 seconds; existing chunk/runtime notices remain |
| Full unchanged pre-push | Exit 0, completion banner observed, TypeScript zero errors (tsc exit 0), 83.768 seconds |

`sweep/` retains red/green commands, transcripts, actual verdicts and hashes.
The initial red run used the tenant-scope file; the same nine cases were then
placed in the existing backpressure test file, preserving its original 19
cases and restoring all five original tenant-scope cases unchanged.
Controlled pending queries settle before assertions; shared failures are
observed with allSettled so an unhandled rejection cannot hide a result.
Actual AsyncLocalStorage is observed inside the query across tenant callers.
Independent read-only review found no material issue in isolation, admission,
settlement cleanup or error propagation.

The 17-file run exercises real service/route/loop exports, tenant scope,
statuses, policy, holds and writers, queued cancellation, disconnect and
mid-tool Stop. Existing PGlite integration contracts exercise shipped DDL and
actual orphaning rules, including live heartbeats and terminal-state
preservation. Scripted pool promises pin concurrent admission/fault behavior;
they do not benchmark production database contention. No external provider or
database was contacted. This is focused backend qualification, not the full
repository test suite or real multi-instance PostgreSQL qualification.

The full unchanged `.husky/pre-push` completed at `35a8b0d4e91498e65295788d2dbc4675f135225f`
against `71126f27b949a5551bddd0aa480ac743691d7abf`. Exact commands and actual results are retained in
`qualification-*`, `production-build.*` and `prepush-qualification.*`.
`source-files.json` pins both qualified file blobs. The final evidence commit
changes documentation only; published source is identical to tested source.

## Boundaries and publication

Only callers overlapping one active sweep share its observation and result.
The first sweep's statement determines which rows it updates. Coalescing does
not run an additional queued sweep for each overlapping caller, and it does
not make opportunistic cleanup periodic. A later call always checks afresh.
An already issued database statement is not cancelled. No row outcome or
failure is fabricated and no durable control state is cached locally.

`previous-ci-snapshot.json` records the preceding delivery at observation:
CodeQL, browser smoke, validation/audit and repository health passed; overall
CI and Semgrep were still running and are not claimed successful. No unrelated
CI fix is folded into this backend batch.

Publication uses a non-force GitHub update on the sole canonical branch,
requiring the expected remote SHA. Uploaded blobs and all resulting branch
contents are verified against local Git. The published commit and its own
workflow snapshot are reported separately. Source publication is not
production deployment; queued or running CI is not reported green.

The unchanged warning ratchet's temporary predecessor files are checked
against publication-base originals and removed after qualification; none is
published. Lint JSON retains all diagnostics/counts while omitting duplicate
source echoes with hashes retained. Text transcripts trim trailing whitespace
only, preserving commands and actual results.
