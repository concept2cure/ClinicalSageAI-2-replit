# AnA heartbeat backpressure — W3 / D4

Canonical branch: `concept2cure-v2`. Reproduction base: `7db091948aa043889e8a5211880641eb4a4e177b`;
publication base: `b16ba9c75416bc7e35441dd8ac55a24abe471d5a`. This batch owns `run-control.ts`, ten appended
regressions in its existing tenant-scope test file, and this evidence directory.
Other canonical changes are preserved. This batch makes no UI contribution.

## Delivered behavior

The existing 15-second stream keepalive and round-boundary callbacks both issue
durable run heartbeats without awaiting them. A slow pool previously admitted
one UPDATE per call. The regression reproduces 20 overlapping writes; the
repaired handle admits one pending write and coalesces overlapping requests
into a successor carrying the newest requested round. Requests arriving while
that successor is pending can request another successor, with at most one
heartbeat UPDATE active for that handle at any moment.

The first admitted round is preserved. Even repeated requests for an identical
round retain a successor, so a fresh heartbeat timestamp is not discarded.
Overlapping callers await the admitted chain through its queued beats. When
the chain drains, the next call starts fresh. Admission is registered before
the pool callback can reenter; it is cleared inside the worker's final
continuation so a call between its final await and promise settlement cannot
join completed work and be lost.

Each run handle owns its own pending promise and latest requested round. No
status, database result or error is cached. Independent handles and pools
remain independent. Actual request AsyncLocalStorage scope is retained,
without a system bypass. SQL, heartbeat timestamp generation and public
signatures remain unchanged. Both synchronous and asynchronous query failures
use the existing warning and allow the pending newest beat or a later retry.

After the local run is released, future heartbeat calls and unissued queued
beats do no database work. An already issued statement is allowed to settle;
it is not cancelled. The loop checks the original local handle's identity,
so release invalidates that handle's admission. A release before the scheduled
first write also prevents that write. Heartbeat admission does not change
durable status, cancellation, control audit or governed artifact behavior.

No timer, dependency, model, tool, integration or user capability was added.
No client file was edited. Equal client hashes against the publication base
are retained in `ui-scope.json`. No lint rule, suppression, baseline, compiler
option, CI configuration or publication gate was weakened.

## Qualification

| Check | Actual result |
| --- | --- |
| Final fail-first against unchanged backend | 7 failed / 8 passed; original five cases passed; candidate restored afterward |
| Direct candidate regressions | 15 passed, including ten new heartbeat cases |
| Broader backend qualification | 269 passed / 0 failed across 17 files, exit 0, 30.482 seconds |
| Forced ESLint | Production zero errors and the same two existing warnings; test zero errors/warnings |
| Production build | Exit 0, 17.615 seconds |
| Full unchanged pre-push | Exit 0; completion banner; TypeScript zero errors (tsc exit 0), 60.632 seconds |

`heartbeat/` retains actual red/green transcripts, commands, counts, source
hashes and test hashes. All original five tenant-scope cases are preserved.
Deferred pool statements settle before assertions. Cases pin burst admission,
latest-round successors, caller completion, independent handles/pools, actual
tenant scope, release before/after issue, genuine failures and retry,
synchronous reentry, and the final-await settlement race. A scoped independent
implementation session reviewed the candidate and found no material issue.

The broader 17-file run exercises real control, hold, route and executor
exports, tenant scope, Stop, disconnect, queued cancellation and policy.
Existing PGlite contracts exercise actual shipped DDL, heartbeat timestamps,
current round and orphan/terminal-state rules. Scripted pending pool promises
qualify concurrent admission and fault behavior. This is focused backend
qualification, not the complete repository test suite, a production latency
benchmark, or real multi-instance PostgreSQL qualification. No external
provider or database was contacted. Existing build notices remain.

Compiler processes exhausted this host's heap before and after canonical sync
and did not establish a typecheck verdict. `typecheck-memory/` retains that actual failure and native
TypeScript5.6.3 cache preparation in 35 bounded processes, ending
with zero unchecked entries and zero cached diagnostic-error files. Actual
semantic diagnostics were checked; unchecked entries remained numeric until
checked. No compiler option or gate changed. Preparation is not qualification.

The full unchanged `.husky/pre-push` passed at `1e07124f682f680b129df0d804a8ca0bcd01b943`
against `b16ba9c75416bc7e35441dd8ac55a24abe471d5a`. `source-files.json` pins both qualified source blobs.
The final evidence commit changes documentation only. Published source must
match the source qualified here.

## Boundaries and publication

Intermediate queued heartbeat round values may be coalesced; the most recent
request is carried forward. The durable row remains authoritative. This does
not shorten the existing keepalive cadence, change orphan thresholds, promise
a fresh timestamp before a pending statement settles, or cancel issued work.
Coalescing is per process-local handle, not a distributed pool rate limit.
For a database that stays slower than the heartbeat cadence, the chain can
remain pending while continuing to admit only one write at a time.

`previous-ci-snapshot.json` records the preceding published commit honestly:
browser smoke, CodeQL and validation/audit passed; Semgrep failed, repository
health was cancelled, and overall CI was still running at observation. This
record does not attribute those results to a particular change or claim the
preceding delivery's remote CI was green. No unrelated CI fix is included.

Publication requires a non-force GitHub update with the expected branch SHA.
Uploaded blob hashes and resulting branch contents are compared with local
Git. The actual published commit and its own CI snapshot are reported
separately. Source publication is not production deployment; queued or
running CI is not a successful CI result.

The hook creates and cleans its temporary lint-ratchet predecessor files.
Any preparation copies are verified against publication-base originals and
removed before the full gate; none is published. Text transcripts trim trailing whitespace only; lint JSON retains
diagnostics/counts while omitting duplicate source echoes with hashes retained.
