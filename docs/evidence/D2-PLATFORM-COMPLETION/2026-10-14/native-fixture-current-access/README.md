# Five native fixtures: current tenant and project admission

The exact four native suites using five fixture files pass **46/46**, with zero
skips, in **34.53 seconds**. Forced scoped ESLint reports zero errors and the one
inherited persistence-suite warning; there is no warning growth. This is bounded
fixture verification, not a full native or platform verdict.

The initial source-pinned invocation deliberately retained every original
assertion and observed **44 passes / 2 failures**, zero skips, in **37.32 seconds**.
The admitted foreign-target request returned 404 instead of the older expected
403. The genuinely missing organization membership returned
`403 PROJECT_ACTOR_ACCESS_DENIED` instead of the writer-role code. The original
raw failures remain in `original-native-red.txt`; the original foreign status
assertion stopped before its no-write tail and did not verify the body code.

After the separate observed-contract design addendum, the final actual invocation
verified `404 PROJECT_NOT_FOUND` through the foreign request's real response and
`403 PROJECT_ACTOR_ACCESS_DENIED` for the missing membership. Every existing
no-write and no-disclosure assertion remains. Both denials additionally compare
exact fresh-tenant document and ingest-audit counts and the actual storage
provider's version listings before and after refusal. Those checks pass. A real
viewer is refused at the governed write-role gate; a real member with an actual
project edit membership is admitted.

All HTTP requests use genuine signed tokens for explicit fresh QA actors and
canonical `requireTenantContext`. Users have actual recorded organization roles;
programs have canonical default workspaces and project anchors. No fake principal,
permission allowlist, provider response, or production admission rule was added.
The shared annotation fixtures explicitly record their intended public-in-org
project visibility. The original annotation mutation, tenant-purge and unaffected
tenant controls remain; purge is an explicit test subject on that invocation's
fresh `gone` tenant, not teardown.

The isolated target is `platform_ci_fixture_reconcile_20261014_4e18c6a9`.
Canonical `install-fresh.mjs`, `deploy-migrate.mjs` and the runtime grant audit all
completed with exit zero. Both native phases verified the actual `app_service`
login, NOSUPERUSER, NOBYPASSRLS, RLS enforcement and relevant FORCE RLS tables.
Global role, role-membership and global-setting fingerprints are unchanged
before and after installation and both executions. Remote AI keys and endpoints
were explicitly blanked; the declared local embedding lane had both endpoints
blank and other gateways disabled, so the canonical resolver refused provider
construction. The prepared and actually executed launcher hashes are retained
separately in `launcher-source-pins.json`.

The real quota undefined-table control renamed only `regulatory_programs` inside
this exclusively allocated database and restored it in `finally`. No shared QA
database was subjected to this DDL. No schema repair, policy change, global role
grant, history erasure or immutability-trigger disabling occurred. Teardown
retains the fresh fixtures and stored bytes. A read-only owner inspection after
both invocations' `afterAll` confirms all 18 QA organizations, their admitted
program/project records, positive Vault records and audit history remain; see
`retained-after-all.json`.

`manifest.json` hashes the 14 raw/structured artifacts. The original and final
fixture source pins are separate; final context pins identify the exact canonical
middleware, access and installation sources. Artifact copying passed a private
credential-literal and bearer/JWT scan. Earlier regional evidence manifests were
not rewritten.

Designs: `docs/design/NATIVE_FIXTURE_CURRENT_ACCESS_RECONCILIATION.md` and
`docs/design/NATIVE_FIXTURE_CURRENT_ACCESS_RECONCILIATION_OBSERVED.md`.
