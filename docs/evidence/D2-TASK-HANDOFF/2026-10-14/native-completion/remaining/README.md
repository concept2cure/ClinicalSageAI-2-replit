# Nine remaining native fixture prerequisites

These nine test harnesses now use fresh invocation namespaces, real current
memberships and unique project anchors through the existing canonical helpers.
HTTP tenant middleware remains. AnA placement receives the actual restricted
request SQL client. Viewer/member controls use distinct real identities, and
lifecycle retains its original four actors and roles. Earlier rows, audit and
stored bytes are retained; prefix-based teardown deletion is removed. No
production, shared-helper or approval policy changed.

The root-owned merged baseline observed 23 passes, 44 failures and 12
setup-blocked cases among the original 79 cases. The first repaired native
replay, recorded in `first-native.json` and `first-native.log`, observed
**78 passed, 1 failed, 0 skipped** under the real restricted runtime.
`source-pins-before.json` retains that exact source snapshot. Source manifests
use `{path, sha256}` records; their digests were preserved when their formatting
was changed to avoid treating an `access` filename as a credential key.

The remaining failure supplied an actual current administrator/owner but removed
only the cached scope role. The current writer intentionally rereads the actor's
database membership and project access; that actor was allowed. The reconciled
negative uses a fresh active actor with no organization membership or project
grant, and no cached role. Its seven-field filing-state equality and
zero-filing-audit assertions run before the refusal-code assertion.

`missing-current-role-before.json` and `.log` retain a focused failing-first
observation: **403 PROJECT_ACTOR_ACCESS_DENIED**, with no row/audit mutation,
while the old expected code was still VAULT_WRITE_ROLE_REQUIRED. One selected
case failed only at the old code assertion; the other 18 cases were intentionally
filtered from this focused observation. The approved repair changes only that
negative's expected code, preserving 403 and all no-write checks. This is the
one original refusal-code expectation changed; the other original refusal
expectations are preserved. The source snapshot is retained in
`missing-current-role-source-pins.json`.

A distinct positive regression now states the complementary rule: a verified
current administrator can file with a missing cached role, and the filing/audit
must name that actual actor. All original 79 cases remain, with the negative's
name clarified, plus this one new case: **80 cases** across the nine suites.
Vault placement increases from 18 to 19 cases. Targeted Node 22 ESLint and diff
checks pass.

The root-owned [merged combined native run](../final/combined-32-after.json) at
`6bc0027fe3733ae6ccd08a72adf126ed0ee71c15` passed **292/292 cases across 32
physical files**, with zero failures or pending cases, in 233.76 seconds.
These nine suites passed **80/80**, including the new current-administrator
positive. All 43 test/helper/server source pins still matched after execution.
The [verbose log](../final/combined-32-after.log),
[source pins](../final/combined-32-source-pins.json) and
[summary](../final/summary.json) retain that final proof. This covers the
previously failing 32-file set; it does not claim the entire native suite or
production qualification.
