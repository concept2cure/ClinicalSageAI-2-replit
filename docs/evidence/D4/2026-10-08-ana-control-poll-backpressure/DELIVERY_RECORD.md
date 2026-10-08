# AnA control poll backpressure — W3 / D4

Canonical branch: `concept2cure-v2`, repository
`concept2cure/ClinicalSageAI-2-replit`. Reproduction base:
`4920b8866d97f30981b4a63bcde91489bbcfd8c5`; publication base: `9d8eda896bc7b2990f5699760e80f7b3e4bd5014`.
Other-session changes since the preceding delivery were synchronized before
this batch and are preserved. A subsequent filing-path test and work-order
documentation update, followed by another session's filing-path UI delivery,
were also merged before the final build and full publication gate. Both
qualified backend files stayed identical; client files match the publication
base, and this batch contributes no UI edits.
This batch owns one backend file, one new test
file and this evidence directory.

## Delivered behavior

The degraded cross-instance control fallback admits one pending poll per
listener lifetime. Previously, every two-second tick started another SELECT
even when the previous query was still pending. Five ticks retained five
pending reads. The repaired path retains one and admits the next read on the
next normal tick after settlement. This reduces query/pool backlog under a
slow database; it is not a measured production latency or SLA claim.

Success, asynchronous rejection and synchronous query failure all release
admission in `finally`. Genuine failures remain logged. With no local runs,
the fallback issues no read. The existing two-second interval, NOTIFY primary
path, SQL and explicit system tenant scope remain unchanged.

A private generation identifies each listener lifetime. Stop invalidates old
continuations before returning the current connection. A late old connect
success returns its own connection; a late old failure cannot release the
restarted client's connection or arm polling through the old pool. Released
clients' error and notification callbacks cannot dispatch into the restarted
lifetime. Poll and notification-read completion check their generation before
applying status. An old pending read cannot abort a retained run or affect the
new poll's independent admission.

Exported APIs, durable control/audit writes, tenant authorization, run status
rules and governed writers are unchanged. Client files, markup, styles and
layout are untouched, proven by equal client directory Git hashes in
`ui-scope.json`. No dependency, capability, model, tool, integration, existing
test, shared harness, lint suppression or publication gate was added or changed.

## Evidence and qualification

| Phase | Actual result |
| --- | --- |
| Initial unchanged-source fail-first | 6 failed / 2 passed across 8 cases; overlapping reads and obsolete client lifecycle reproduced |
| Expanded unchanged-source fail-first | 8 failed / 2 passed across 10 cases; synchronous throw and late old poll result additionally reproduced |
| Final direct regressions | 10 passed / 0 failed |
| Focused related qualification | 18 passed across 3 files |
| Final broader backend qualification | 241 passed / 0 failed across 17 files, exit 0, 32.122 seconds |
| Forced ESLint | Production zero errors and its same 2 existing warnings; new test zero errors/warnings |
| Production build | Exit 0, 20.067 seconds; existing large-chunk and experimental runtime notices remain |

`poll/` contains the actual red/green commands, transcripts and phase hashes.
The baseline source was unchanged for both fail-first runs. Independent
read-only review found no material issue in client ownership, generation
checks, per-lifetime admission or tenant scope. `qualification-command.json`,
`qualification.json`, `qualification.txt` and `qualification-verdict.json`
capture the final 17-file run. It includes real PGlite durable-control and
hold-writer contracts, tenant ALS, existing status/checkpoint/run-policy,
queued cancellation, stream disconnect, held Stop and mid-tool Stop contracts.
`source-files.json` pins the two final production/regression blobs. This is a
focused backend qualification, not the full repository test suite.

The first full-gate attempt exhausted the workspace's compiler heap and
established no typecheck verdict. Its actual failure is preserved under
`typecheck-memory/initial-*`. The existing TypeScript 5.6.3 native-cache helper
then prepared actual incremental diagnostics in 11 bounded
processes, retaining unchecked entries until checked. Final pending entries
and cached diagnostic-error files were zero. No compiler option, source root,
baseline or gate changed. Preparation alone is not qualification; the full
unchanged hook was subsequently rerun and its completed verdict below is the
publication gate. Native commands/results are retained in `typecheck-memory/`.

After a later concurrent filing-path UI delivery was preserved, the unchanged
hook again exhausted its heap while checking newly invalidated sources.
`post-remote-advance-failed-qualification.*` retains that failure;
`pre-remote-advance-qualification.*` retains the earlier successful gate.
The same helper then completed 11 additional bounded
processes, from 11970 missing diagnostics to
zero, with zero cached diagnostic-error files. Exact commands and native
results are in `post-remote-preparation-command.json` and
`post-remote-preparation/`. Final source/root counts are
12030 / 6971.
Both qualified backend files remained identical, and the final production
build was rerun successfully with the other session's UI update preserved.


The local source checkpoint `45e87a5f1ff1ac62f29f3eac108d714656f881e9` passed the
**full unchanged `.husky/pre-push`** against the publication base: exit 0,
completion banner observed, **TypeScript zero errors (tsc exit 0)**,
55.855 seconds. See `prepush-qualification.txt` and
`prepush-qualification.json`. The final local evidence commit changes only
this evidence directory; the published commit contains qualified source and
final evidence. No hook, rule, diagnostic, baseline or CI configuration was
weakened.

## Verification boundaries and publication

New regressions execute the actual service exports with controlled pool/client
promises and fake timers. Actual AsyncLocalStorage scope is observed inside
each query; reads under two tenant requests use the existing system scope and
deliver cancellation to both runs. The PGlite suites execute shipped DDL and
real writer/control logic. They do not qualify real PostgreSQL NOTIFY delivery
across production instances. A native PostgreSQL client is unavailable in this
workspace; the existing cross-instance `.dbtest` was not run here.

An already-issued database query may settle after Stop. This repair does not
cancel PostgreSQL work or undo writes. One read is admitted per current
listener lifetime; a previous lifetime's read can remain pending in the
background until the database settles it. The generation prevents that result
from controlling the restarted lifetime.

The preceding source delivery `ebc3076e` passed remote lint, TypeScript, AnA
readiness, browser smoke, CodeQL and validation/audit checks. Its overall CI and
Semgrep workflows failed. The exact Semgrep finding was in a client shell-nav
test outside that batch; remaining test/integration/coverage attribution was
not established here and is not claimed unrelated. No client fix was folded
into this backend-only batch, and that prior pipeline is not reported green.

Publication uses the connected GitHub API on `concept2cure-v2`, after the full
local gate. Uploaded files and all resulting branch contents are verified
against local Git, and the non-force update requires the expected remote SHA.
The published commit and its own workflow snapshot are checked afterward and
reported separately. Source publication is not production deployment, and
queued or pending CI is not reported as successful.

Lint evidence retains every diagnostic/count, omitting the duplicate source
echo only with its hash retained. Text transcripts trim trailing whitespace
only, preserving commands and verdicts.
