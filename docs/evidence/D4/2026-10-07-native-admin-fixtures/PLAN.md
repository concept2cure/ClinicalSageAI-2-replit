# W3 / D4 — restore the platform standing required by native fixtures

Base: `4d1252fde561c663ef6b018f65c918bd087ce91e`, only `concept2cure-v2`.

The earlier native CI lane produced artifact 11511776693 in run 37683490033:
150 physical test files, 1,582 cases, 1,544 passed and 38 failed, none pending.
Thirty-six failures across four files trace to missing fixture standing after
the production guard intentionally stopped accepting tenant membership roles
as platform authority. Missing list/audit results cascade from refused requests.
No production auth defect has been established.

Scope: update only licensing-trials, master-enterprise-requests,
module-access-requests and organizations-writes native fixtures. The existing
identity stub in licensing-trials receives a saved/restored exact local owner
allowlist. The three real-user fixtures receive an active `super_admin`
platform grant, with teardown before user deletion. Keep all test assertions,
refusal cases, native configuration, runtime roles, RLS, routes and production
guards unchanged. Preserve the two unrelated registry/export inventory failures.

Before edits, preserve actual failed native assertions and current-source CI
compiler/control evidence. After edits, run existing platform-standing/security
controls, database isolation and scoped lint, and verify that the diff changes
only setup/teardown and explanatory comments. Do not add mirrored fixture tests
or claim native PostgreSQL GREEN without a real execution. This host has no
native PostgreSQL and only 8 GiB memory: full semantic compilation remains the
exact-source remote 24-GiB gate. Run normal commit checks and every unchanged
pre-push gate before that deferred compiler stage; no baselines or hooks change.
Publish this bounded correction with the native rerun explicitly pending.
