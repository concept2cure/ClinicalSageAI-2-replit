# AnA hold cancellation — W3 / D4

Canonical branch: `concept2cure-v2`, repository
`concept2cure/ClinicalSageAI-2-replit`. Reproduction base:
`c7a0405d9a1a6da9a7eecb54cbee8870e1dfb333`. Publication base:
`7eb3695b36b5e403ad94f9fc88e093174b2c4687`; the intervening automated repo-health commit
changed two report files only. All five qualified production/regression blobs
were unchanged when that documentation update was fast-forwarded.

## Delivered behavior

Stop releases an existing parent hold while its status read or wake is pending.
The stream passes its existing cancellation signal through both TurnPolicy hold
paths into RunHold's existing signal argument. Status reads race cancellation;
listeners are removed on settlement and late query rejection remains observed.
Each outer read continuation checks cancellation before consuming its snapshot,
so a stopped waiter cannot announce a late pause/resume or start an expiry action.

A cancelled hold settles before starting another queue drain or status read.
The cancellation check after an already-started drain remains. Manual retains
the held step as `not_run`, names it in `pendingSteps`, and records the hold as
stopped. Normal Continue, expiry policy, shared waiter accounting and original
query errors remain covered by the tests.

The delivery changes three existing backend files and adds two regression
files. Client files, markup, styles and layout are untouched, verified by
identical client Git trees in `ui-scope.json`. No dependency, model, tool,
integration, non-stream hold capability, authorization rule, regulated-artifact
writer or publication gate is added or changed.

## Evidence and qualification

| Phase | Actual result |
| --- | --- |
| Initial direct fail-first | 8 failed / 1 passed; pending first/later reads and stale paused/running snapshots reproduce the defect |
| Initial mounted-route fail-first | 4 failed / 2 passed; person/Manual read and wake cancellation stall, normal Continue passes |
| Direct settling fail-first after read repair | 4 failed / 9 passed; cancelled outcome and aborted signal both start an extra queue drain |
| Mounted-route settling fail-first | 4 failed / 2 passed; extra post-Stop drains occur in both modes |
| Final combined qualification | 294 passed, zero failed, across 18 backend files; 22 new cases across the two regression files |
| Final forced ESLint | Zero errors and no warning growth; stream retains 23 existing warnings, other four changed source/test files have zero |
| Final production build | Exit 0, 18.335 seconds; existing large-chunk and runtime experimental notices remain |

`hold/` and `route/` contain the actual failing and successful phase transcripts.
`qualification-command.json`, `qualification.json`, `qualification.txt` and
`qualification-verdict.json` capture the final 18-file run. It includes real
PGlite hold-writer/control integrations, existing pause/expiry/shared-waiter,
run-policy, disconnect, run-control, cancellation accounting, approval and
Manual record coverage. Sub-report hashes identify their own earlier phase;
`source-files.json` pins the five blobs used by the final combined qualification
and unchanged full publication gate.

The local source checkpoint `7386ce34cf624d54eed2a9e21246646d3a84f3ba` passed the
**full unchanged `.husky/pre-push`** against the publication base: process exit
0, completion banner observed, **TypeScript zero errors (tsc exit 0)**, elapsed
89.754 seconds. Transcript and process verdict:
`prepush-qualification.txt` and `prepush-qualification.json`. The final local
evidence commit adds documentation only; the published tree combines that
evidence with the qualified source. No compiler diagnostic, lint rule, suppression, baseline,
hook or CI configuration was weakened. A temporary complexity warning was
resolved by a synchronous helper extraction while retaining the timing guards.

## Verification boundaries and delivery

The mounted HTTP route, loop, checkpoint, hold and recorder execute for real;
model responses, tool handlers, context and run-row persistence are scripted
at the existing harness seams. Direct tests also check live query failure,
late rejection, listener cleanup, stopped held-time accounting and isolation
of a cancelled waiter while another resumes. Controlled completion before a
blocked read/wake is released establishes ordering, not a production latency
benchmark or SLA.

The underlying database read may still settle in the background. This repair
does not cancel PostgreSQL queries, undo writes or interrupt a drain/writer
already started. PGlite qualifies local writers; these tests do not establish
live provider behavior, external database operation or cross-instance control
notification delivery. Existing approval/control/audit boundaries remain in
force.

Publication uses the connected GitHub Git-data API on the sole canonical
branch, after all local gates. Every blob and the complete Git tree are compared
with local Git; the non-force update requires the expected remote SHA. The
published commit and its exact remote workflows are verified after the update
and reported separately. Source publication is not a production deployment,
and pending remote CI is not reported as successful.

Lint JSON retains every diagnostic/count and omits duplicate source echoes
only, with hashes in the evidence. Text transcripts trim trailing whitespace
only, preserving commands and verdicts.
