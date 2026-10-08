# AnA notification backpressure — W3 / D4

Canonical branch: `concept2cure-v2`. Reproduction base:
`e6183e52ee8d8d47b01eb2325f9790097ac16a1a`; publication base: `7de37444e6a3272984ab5405e395dd4b4ca4de2b`.
This batch owns one backend file, appended regressions in its existing test
file, and this evidence directory. Concurrent canonical work is preserved.

## Delivered behavior

The primary NOTIFY control path now admits one pending status read per run,
per listener lifetime. The fail-first regression demonstrated 100 pending
SELECTs from 100 notifications for one run. The repaired path keeps one read
pending and coalesces notifications received during it into one successor.
Another burst while that successor is pending remains bounded as well.
Different runs are independent: a slow read for one cannot block another's
cancellation delivery.

The successor is essential. An earlier read can observe running before Stop
is committed elsewhere. Dropping the later notification would leave a healthy
listener with that old snapshot and no fallback poll to recover it. The dirty
successor rereads the durable status and delivers the newer cancellation.
Success and failure release admission; actual errors remain logged. Every
read retains the real explicit system tenant scope. Nonlocal run IDs, missing
payloads and other channels issue no query.

The queue belongs to the listener lifetime. Stop/restart cannot carry old
results or queued work into the new listener. Releasing a local run prevents
its queued successor. An already issued database read can remain pending until
the database settles it; this change does not cancel PostgreSQL queries.

SQL, exported APIs, authorization, RLS scope, status transitions, durable
control/audit writes, the two-second fallback interval and its prior
backpressure are unchanged. No dependency, integration, capability, model,
tool, UI file, style or layout was added or changed by this batch. Equal client
directory hashes in `ui-scope.json` prove the no-UI contribution against the
publication base. No rules, baselines, suppressions or gates were weakened.

## Qualification

| Check | Actual result |
| --- | --- |
| Fail-first on unchanged backend | 7 failed / 12 passed across 19 tests; all original ten passed |
| Final direct regressions | 19 passed, including nine new notification cases |
| Related control / tenant qualification | 27 passed across three files |
| Broader backend qualification | 250 passed / 0 failed across 17 files, exit 0, 34.032 seconds |
| Forced ESLint | Backend zero errors and same two existing warnings; test zero errors/warnings |
| Production build | Exit 0, 18.771 seconds; existing chunk/runtime notices remain |
| Full unchanged pre-push | Exit 0, completion banner observed, TypeScript zero errors (tsc exit 0), 60.506 seconds |

`notification/` retains fail-first and final commands, transcripts, phase
hashes and the independent read-only review. The initial backend was unchanged
for the red run. The later test restructuring split describe callbacks to
avoid a new function-length warning; no lint rule was suppressed. A repeated
burst during the successor was added to the final existing burst case.

Broader qualification covers the actual service/route/loop exports, tenant
AsyncLocalStorage, status and policy contracts, held cancellation and writer
logic, stream disconnection and mid-tool Stop. PGlite suites exercise real
shipped DDL and durable writer/control logic. Notification tests use scripted
pool/client promises and controlled event callbacks. They do not measure
production latency or qualify real multi-instance PostgreSQL NOTIFY delivery;
no external provider or database was contacted. This is focused backend
qualification, not the full repository test suite.

After synchronization, the full compiler run exhausted its workspace heap.
The failed gate is preserved; it established no typecheck verdict. The existing
TypeScript 5.6.3 helper prepared actual native incremental diagnostics in
10 bounded processes, ending with zero unchecked entries and
zero cached error files. No gate or compiler option was weakened. Recovery
commands, native results and boundaries are in `typecheck-memory/`.
Preparation alone is not qualification; the completed full hook below is.

The full unchanged `.husky/pre-push` completed at `835386ce7265fbd927e99ab3899e02d741d9ab60`
against `7de37444e6a3272984ab5405e395dd4b4ca4de2b`. `source-files.json` pins the two qualified file blobs.
The final evidence commit adds documentation only; published source remains
identical to the tested source. Native commands and actual verdicts are in
`qualification-*`, `production-build.*` and `prepush-qualification.*`.

## Publication and prior CI

Publication uses a non-force GitHub update on the canonical branch requiring
the expected remote SHA. All uploaded blobs and resulting branch contents are
verified against local Git before and after publication. The published commit
and its exact workflow snapshot are reported separately. Source publication
is not production deployment; running or queued CI is not reported green.

`previous-ci-snapshot.json` records the preceding delivery's observed remote
results. CodeQL, browser smoke, validation/audit and repository health passed;
overall CI was still running at that observation. Semgrep failed with six
delta findings against its historical baseline, all in files outside the
preceding control batch. No UI or unrelated Semgrep fix is folded into this
delivery, and its prior pipeline is not claimed successful.

Lint JSON retains all diagnostics and counts; only duplicate source echoes
are omitted, with their hashes retained. Text evidence trims trailing
whitespace only and preserves actual commands/results.
