# W1 / D2 reporting group tenancy and CI closure

The current-tree gate reproductions found one newly read unkeyed membership
table, four optional-workspace SQL findings, and two stale PDF creator approvals.
The proof-surface inventory itself passed. The unkeyed selftest initially
refused its already failing starting tree, so no probe was written in that run.

The existing foundation now records the exact group/project organization on
membership rows, rejects inconsistent retained links, backfills only null keys
whose parents agree and installs validated composite parent keys. It has an
explicit final COMMIT because the canonical applier detects its BEGIN and does
not add a wrapper transaction. Both group writers supply the session org; child
deletion and the three membership readers carry tenant scope. The canonical
parent-derived FORCE RLS installer remains authoritative.

Ownership queries select fixed complete statements for workspace-filtered and
organization-wide reads. All organization predicates are mandatory, all values
are bound, and no suppression or baseline change admits these statements.
The deliberately corrupt legacy group/project fixture is retained to prove
defensive read refusal; the new database keys prevent creating it after the
migration.

Six application scope/access/history/write-boundary files passed 73 tests.
After the final fixed-statement refinement, the ownership file passed its full
14 tests again. Those 14 overlap the 73 and must not be added to them. Independent
native replay, actual session-bound HTTP and runtime-role/RLS proof are recorded
separately by the database test lead.

The unkeyed gate and its four red/green selftest cases now pass. Raw SQL reports
zero current findings against the existing eight-entry baseline; interpolation,
model/migration agreement, integer tenant-column types, migration order and
migration drop-safety checks pass. Scoped lint has zero errors and five existing
report-os warnings. No static baseline was increased or rewritten.

The PDF gate is green after removing only the run/bundle wrapper creator
approvals; the canonical writer retains its approval and the gate's internal
probes still execute. The dependency ledger was mechanically resealed after
live npm audit confirmed the same three reviewed High advisory occurrences;
no finding disposition or exception changed. Its live gate and all 32 gate
selftests pass. The reseal matches the already approved direct `bidi-js`
declaration, without adding another dependency.

Logs in this folder retain the failing and passing gate results, focused
application tests, lint, dependency verification and migration checks. No
compiler, production build, commit or push was run by this implementation lead.
