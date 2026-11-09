# Ordinary task creation repair

The preceding workflow-template repair is published on canonical
`concept2cure-v2` as `3c1c6a70378d6a85e60b996287031cea7137c1a8`.
Its actual push completed with all pre-push gates enabled and passing.

The subsequent native PostgreSQL reproduction demonstrated three ordinary
creation defects against that code: a same-organization private-project
outsider created one task and one action/audit pair; a permitted project task
omitted its actual workspace; and an unfiled task accepted a stale claimed
write role despite the actor's current viewer membership. Each case is captured
in `native/red-before.txt.gz`, with the exact input source snapshots and hashes.

The published contract in README.md preserves optional projects, explicit
project precedence, named and automatic assignment, actual reasons, RR1
restrictions, the shared task/audit writer and the legacy response envelope.
The repair extends existing production files only.

The native fixture supplies authenticated test identity. Current actor and
project permissions, the restricted runtime role, FORCE RLS, task writes and
canonical action/audit records use actual PostgreSQL. This does not qualify
deployed authentication, the full migration database or a browser workflow.

An independent read-only review of the production/helper/unit-fixture diff
found no blocking issue in explicit-project precedence, unfiled admission,
assignment ordering, typed refusals, request-transaction use, RR1 or uncertain
COMMIT handling. Runtime qualification remains separately recorded below.

Aggregate verification passed 335 unit/route/PGlite/client cases in 28 files
and 119 native PostgreSQL cases in two files (100 creation cases plus 19
existing assignment cases). Each run captured identical before/after hashes
for 10,518 source/configuration files; manifests and logs are compressed under
`green/`.

Before integration checks, the canonical branch advanced through five commits
to `57b13c599df7fa957809a4764963734b02522545`. These changed project-page UI,
its tests and founder plan progress. They did not overlap this repair. A clean
fast-forward preserved every frozen production/native-test hash. Typecheck,
build and final push gates run on that integrated tree.

The integrated full TypeScript check passed with zero errors across 15,425
inputs, including the native fixture. The client, server and audit-chain
verifier builds passed. Scoped ESLint passed with zero errors; the route's
nine existing warnings remain unchanged and all other changed files are clean.
The before/after manifests confirm that verification did not change source.
This repair adds no screen, service, route file or mount. It changes no plan,
ledger, dependency or production schema.

A final four-commit upstream advance to `c73ac5a2e` contained billing repairs
only. It fast-forwarded without conflicts or a changed repair hash. The build
was repeated on that tree; the earlier build evidence is retained under
`green/before-billing-sync-*`. The actual push hook typechecks the final
committed tree again.

Publication uses a direct commit and normal push to `concept2cure-v2`, with
hooks enabled. This document records the pre-commit verification snapshot;
the canonical Git history records publication, rather than a speculative
success flag written before the push finishes.

The first actual push passed every pre-push gate, including a zero-error full
typecheck, then Git refused a stale remote reference: another session advanced
canonical from c73ac5a2e to c44a21268 during checks. Its saved-conversation
changes did not overlap any of this repair's six source/test paths. The sole
unpublished repair commit rebased without conflicts; all frozen repair hashes
remain identical. The complete passed gate log and ref-race result are retained
in publication-gates-before-ref-race.log.gz. Publication retries use normal
fetch/rebase/push with hooks, preserving the concurrent work.
