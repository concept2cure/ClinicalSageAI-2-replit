# Exact-source remote gate follow-through

Only `concept2cure-v2`, W3 / D4. Published qualified source is
`d46df5e1c406b0e8347385bcc0963dc02fd3e513`. The canonical current head is
`bd886f5d3a766ba35179f98ecb053f61420f69f6`, its automatic health-report-only
child; all 37 preceding qualified source/test blobs remain identical.

GitHub's actual full TypeScript job 112920552724 measured three errors, compiler
exit 2, baseline 0. `REMOTE-TYPECHECK-RED.txt` records its exact diagnostics:
two intentionally blank project bindings and a 65-hop upload loop are
incorrectly constrained by fixtures' inferred `randomUUID()` template types.
The original blank `projectRef` inputs and depth exhaustion assertions must remain. The
source-lineage session owns only their two existing test files and may widen
fixture annotations to the actual string identity domain. No production type,
value, assertion, cast to `any`, suppression or baseline changes are approved.
It runs both affected existing suites and scoped lint, recording
`REMOTE-TYPE-FIX-*` evidence. It does not run full local TypeScript or publish.

The main CI SQL-inventory step also failed. Its exact command reproduces exit 1
on current source (`REMOTE-SQL-INVENTORY-RED.txt`), naming only `rl_walk` in
`recorded-lineage.ts`. That name is a real recursive query-local CTE with an
explicit column list, executed successfully by the actual PGlite controls.
The inventory extractor recognizes only CTE declarations with no column list.
Do not add a phantom table, rewrite the valid governed query, add an ignore or
baseline the name. The control tower owns a narrow general recognition fix in
`scripts/ci/check-unbacked-tables.mjs` and the existing
`scripts/ci/__tests__/unbacked-tables-strings.test.mjs`. First execute new
controls against the old guard: column-list CTE names must be query-local,
while real missing tables within and outside those CTEs must still be reported.
Both SQL-statement admission and CTE extraction must share the declaration
grammar so a leading column-list CTE cannot hide its missing-table reads.
All existing unbacked-storage controls, baseline and SQL production code remain
unchanged. This fixes a proved CI parser mismatch without broadening storage
or ancestry eligibility.

The control tower owns integrated verification, normal branch gates and
publication on the current canonical head. Test annotation edits must preserve
the same emitted JavaScript and all inputs/assertions; the SQL guard and its
negative controls must pass both the fixture run and the whole repository
inventory. The exact final GitHub full compiler remains required; builds or
type erasure checks are not semantic proof. D4 and D1–D10 remain open.

## Proved live-schema composition extension

The preceding publication's blank-database job 112929193093 completed provision,
deploy, replay, RLS coverage, readiness and post-deploy invariants successfully,
then failed `ci:tables-live-schema` on the single new name `rl_walk`.
`REMOTE-LIVE-SCHEMA-RED.txt` preserves that actual job excerpt. Inspection shows
its imported reachability parser already understands column-list CTEs. The
remaining mismatch is statement composition: two SQL literals use `rl_walk`
after interpolating the separate CTE builder. The static scanner cannot bind
a declaration outside the literal it inspects.

Do not ignore the name across a file or module: that would hide an actual
same-named table queried in another statement. Preserve both table parsers,
their storage-negative controls and all baselines. The control tower extends
its scope only to existing `recorded-lineage.ts` and `derived-impact.ts` plus
a Node parser-binding control. Before editing SQL assembly, execute the new
control against the real shared scanner on current source. Then make the
existing inner recursive query return its walk rows, and bind that complete
query as a local CTE in each consuming statement. Every seed, edge, predicate,
alias, parameter, output field, depth limit, refusal and fingerprint remains.
This is an approved complete-statement assembly repair; the earlier injunction
against rewriting the valid governed query still protects its actual logic.
No arbitrary dynamic table name or phantom storage is introduced.

Execute the new binding controls, both existing parser/inventory gates and the
entire 80-file workflow regression on the frozen assembled source, including
existing fixed-volume downstream timing controls. Updated timings are descriptive,
not a production latency acceptance. Normal branch gates and the exact final
GitHub compiler/live-schema gate remain required. No production schema,
dependency, statistical engine or scientific policy change is approved.

## Executed adoption-fixture follow-through

The first complete run on the assembly repair executed all 80 files and 1470
cases: 1466 passed, four failed, no skipped/pending/todo, exit 1. Its exact
source hashes remained unchanged during execution. The failed cases all belong
to the existing `projects-adoption.test.ts` mock fixture: it admits the ordinary
no-parent lineage row only when the SQL starts with the former CTE prefix.
The complete-statement wrapper no longer matches that fixture, so admission
correctly refuses its missing row before the positive capture path. Actual
PGlite lineage, impact, cached reader and route controls pass.

Preserve that complete execution as RED. The control tower extends scope only
to this existing adoption test fixture: update its query-shape dispatch for the
same ordinary no-parent row, preserve all existing inputs and assertions, and
assert that injected rollback cases actually reach the capture seam. No
production admission/refusal or transaction sequencing change is approved.
Run the affected route suite, then rerun the same complete 80-file regression
on frozen final source. The eight changed code files, including this fixture,
must pass scoped lint, unchanged branch gates and exact-source GitHub CI.
