# Exact-source compiler and SQL-inventory follow-through

Only `concept2cure-v2`, W3 / D4. The preceding publication is
`d46df5e1c406b0e8347385bcc0963dc02fd3e513`; its health-report-only child
`bd886f5d3a766ba35179f98ecb053f61420f69f6` is this repair's starting head.
The approved scope is [REMOTE-GATES-PLAN.md](REMOTE-GATES-PLAN.md).

## Actual remote failures and bounded repair

The preceding exact-source full compiler measured three `TS2322` errors,
compiler exit 2, zero-error baseline, in job 112920552724 of run 37658757090.
[REMOTE-TYPECHECK-RED.txt](REMOTE-TYPECHECK-RED.txt) preserves its diagnostic
excerpt and full job link. Two are intentionally blank `projectRef` fixtures;
one is a UUID-inferred loop variable subsequently holding ordinary recorded
upload IDs. The repaired fixture annotations use the existing input contract
and string identity domain. Original blank projects, upload identities, all
65 hops and every assertion remain. Emitted JavaScript is byte-identical for
both files. This is a fixture type correction, not a production-policy change.

[REMOTE-TYPE-FIX-RESULTS.md](REMOTE-TYPE-FIX-RESULTS.md) and the exact manifest
record **two suites / 35 cases passed**, zero skips, exit 0, plus scoped lint
exit 0. The emission receipt pins source and emitted-JavaScript hashes against
the preceding publication and starting head. The preceding 80-file / 1470-case
execution is preserved. The SQL assembly extension below requires a fresh
complete execution on its final source; type erasure applies only to the two
fixture files. Neither erasure nor local tests establish whole-tree semantic
TypeScript success; the final GitHub compiler remains an independent gate.

The main CI SQL inventory reported `rl_walk` as an uncreated table. Its exact
command reproduced exit 1 on current source
([REMOTE-SQL-INVENTORY-RED.txt](REMOTE-SQL-INVENTORY-RED.txt)). The existing
recursive query declares `rl_walk` with output columns; the parser only knew
declarations without column lists. All ancestry/refusal predicates remain
unchanged.

Before the parser edit, the new fixture controls reproduced **three failures /
seven passes** in ten cases
([REMOTE-SQL-CTE-CONTROLS-RED.txt](REMOTE-SQL-CTE-CONTROLS-RED.txt)). The fix
shares a bounded identifier-list declaration grammar between SQL-statement
admission and CTE extraction. Query-local aliases cease to look like persisted
storage, while missing-table reads inside a leading or later CTE are still
reported. A declaration never qualifies another statement's same-named table.
All original runtime-DDL and comment-stripping controls remain.

After the edit, all **ten controls pass**, zero skips, exit 0
([REMOTE-SQL-CTE-CONTROLS-GREEN.txt](REMOTE-SQL-CTE-CONTROLS-GREEN.txt)). The
whole repository inventory also passes: 1488 created relations, 734 referenced
names, 22 pre-existing unbacked relations and the same 22 baseline entries.
The baseline's original Git blob remains `a32c74c5072a2c3c57cd814a697ad67fa5f8f73e`.
No phantom migration, per-name ignore, new storage or baseline change is added.

Both original MJS files pass `node --check`, and the Node controls execute the
actual guard in an isolated fixture. The existing ESLint configuration ignores
MJS files; its ignored-file warnings are explicitly not script lint proof.
[REMOTE-SQL-NODE-SYNTAX.txt](REMOTE-SQL-NODE-SYNTAX.txt) and
[REMOTE-SQL-GUARD-LINT.json](REMOTE-SQL-GUARD-LINT.json) preserve that distinction.

## Live-schema statement composition

The preceding exact publication's blank-database job 112929193093 completed
provision, deploy, replay, RLS coverage, readiness and post-deploy invariants.
Its sole failed step was `ci:tables-live-schema`: 1297 live relations, 759
referenced names, 13 functions, 40 absent names, and one new name, `rl_walk`.
[REMOTE-LIVE-SCHEMA-RED.txt](REMOTE-LIVE-SCHEMA-RED.txt) preserves that failed
step and its job link. Expected provisioning retry errors elsewhere in the
container logs are not this failure's cause.

The live scanner's existing shared reachability parser already recognizes
column-list CTEs. Its remaining mismatch was SQL assembled across separately
inspected template literals. Before production edits, the real-scanner binding
control failed: **one failed / two passed**, exit 1
([REMOTE-LIVE-BINDINGS-RED.txt](REMOTE-LIVE-BINDINGS-RED.txt)). A first wrapper
still failed when its seed used a nested template literal; that execution is
preserved separately in
[REMOTE-LIVE-BINDINGS-INTERMEDIATE-RED.txt](REMOTE-LIVE-BINDINGS-INTERMEDIATE-RED.txt).

The existing inner recursive query now returns its walk rows. Each consuming
statement binds that complete query as its own `rl_walk` CTE, with the seed
prepared before the outer query literal. The two existing production files
change only statement assembly: all recursive edges, same-tenant checks,
identity predicates, seeds, parameters, output fields, aliases, depth bounds,
refusals and fingerprint inputs remain. The live-schema/reachability scanners
and their baselines are unchanged. No global name exception or persisted
`rl_walk` table is added.

All **13 Node controls pass**, zero skips, exit 0
([REMOTE-LIVE-BINDINGS-GREEN.txt](REMOTE-LIVE-BINDINGS-GREEN.txt)). They include
all ten guard controls, actual whole-source binding inspection, a missing-store
read within a column-list CTE, and a standalone same-named table that remains
subject to storage qualification. The shared live scanner now sees 758
referenced names and no unbound walk. Final unbacked-table and migration
reachability commands both pass, with their original baselines
([REMOTE-INVENTORIES-FINAL.txt](REMOTE-INVENTORIES-FINAL.txt)). This static
binding result does not substitute for the final live provisioned-schema job.

[REMOTE-INTEGRATED-NODE-SYNTAX.txt](REMOTE-INTEGRATED-NODE-SYNTAX.txt) records
syntax checks for all three changed MJS files.
[REMOTE-INTEGRATED-SCOPED-LINT.json](REMOTE-INTEGRATED-SCOPED-LINT.json) records
all five final changed TypeScript files: **zero errors and zero warnings**, exit 0.

## Adoption fixture and complete integration

The first complete assembly regression executed **80 physical files / 1470
cases: 1466 passed, four failed, zero pending/skipped/todo, exit 1, 292.45
seconds**. [REMOTE-INTEGRATED-RED.txt](REMOTE-INTEGRATED-RED.txt) and its
[manifest](REMOTE-INTEGRATED-RED-MANIFEST.json) preserve the entire execution,
all statuses and the unchanged source hashes. All four failures are in the
existing adoption unit fixture, which dispatched the ordinary no-parent
lineage row only for the former SQL prefix. Actual database-backed lineage,
impact, cached reader and route controls passed.

The fixture now recognizes the same admission query in its complete-statement
wrapper and returns the same no-parent row. All original inputs and assertions
remain; the three injected rollback cases additionally prove they reached the
capture seam. [REMOTE-ADOPTION-FIX-GREEN.txt](REMOTE-ADOPTION-FIX-GREEN.txt)
records **21/21 cases passed**, zero pending/skipped/todo, exit 0. The first
failed integration is not a qualification of the final fixture; a fresh full
execution on all eight frozen code blobs supplies that evidence.

The final complete execution passed **80 physical files / 1470 cases**, zero
failed/pending/skipped/todo, exit 0, **299.97 seconds**
([REMOTE-INTEGRATED-GREEN.txt](REMOTE-INTEGRATED-GREEN.txt)). The
[final execution manifest](REMOTE-INTEGRATED-GREEN-MANIFEST.json) verifies all
requested files executed, with no missing/additional files, all actual case
statuses passed, and all eight source hashes unchanged during the run. The
final source also passes all **13 Node controls**, zero skips, exit 0
([REMOTE-FINAL-NODE-CONTROLS.txt](REMOTE-FINAL-NODE-CONTROLS.txt)).

The changed production source also builds successfully with the existing
server build command ([REMOTE-SERVER-BUILD.txt](REMOTE-SERVER-BUILD.txt)).
The client source is unchanged. A server build is not semantic compiler proof.

The same descriptive dataset and original `40697292` predicate were rerun:
203 atoms, 201 RAG rows, 201 artifacts, 800 unrelated same-tenant audit events
and 800 foreign events, one warm-up and three measured repetitions per
projection, existing identity index only. All ordinary positive rows remained
eligible. [REMOTE-DOWNSTREAM-PERFORMANCE.txt](REMOTE-DOWNSTREAM-PERFORMANCE.txt)
and its [manifest](REMOTE-DOWNSTREAM-PERFORMANCE-MANIFEST.json) record current
medians of **524.03 ms atoms, 159.71 ms RAG, 137.96 ms artifacts**, versus
paired original medians of 5.84, 2.97 and 4.58 ms. The earlier qualified-source
run measured 312.32, 110.12 and 92.64 ms on that dataset. Separate runs do not
isolate the assembly wrapper's cost; both their samples and the paired original
timings varied. Relative overhead remains material. No latency acceptance,
planner equivalence, production load, RLS or independent-connection proof is
claimed. The initial CLI failed before executing any timing because its local
IPC pipe was unavailable; that runner failure is preserved separately. Direct
Node loading then completed the timing without changing any assertion or data.

## Publication and remaining gates

Eight code files change: two fixture type annotations, the SQL inventory guard,
its existing test file, two existing production SQL assembly files, the new
Node statement-binding control, and the existing adoption mock fixture.
Migrations, dependencies and scientific/runtime
refusal policies are unchanged. The control tower verifies their source blobs,
normal pre-commit, unchanged pre-push prefix and warning ratchet before the
canonical update; actual gate output is filed as `REMOTE-BRANCH-GATES.txt`.

The preceding exact publication's Semgrep, full-history secret scan, security
contracts, security scan, both CodeQL languages and authenticated browser smoke
completed successfully. Its TypeScript and main lint failed on the named
diagnostics; broad tests, integration and coverage were still running at filing.
Those prior-source verdicts do not supply the new commit's compiler or full CI
result. The 24-GiB exact-source GitHub compiler is required after publication;
no full local compiler is run on the 8-GiB host.

The exact code publication is `a5dc3f3d84ba62a06806f8455897fe0554ae654d`.
[REMOTE-PUBLICATION-RESULTS.md](REMOTE-PUBLICATION-RESULTS.md) supplies its
verified GitHub verdicts: both full compilers measured zero errors and exit 0;
the live-schema gate reports zero new missing relations against its unchanged
baseline; all 214 Node CI controls, security scans, authenticated browser,
RLS boot and production image sign-in passed. Broad tests, integration and
coverage still have no final verdict at that snapshot. The preceding-source
failures and earlier pending statements above remain preserved as history.

D4 and D1–D10 remain open. Production volume/plans/RLS/races, complete intended
use, live provider/transport PQ and signed human/scientific validation remain
owed. Software fixture and parser repairs do not establish those qualifications.
