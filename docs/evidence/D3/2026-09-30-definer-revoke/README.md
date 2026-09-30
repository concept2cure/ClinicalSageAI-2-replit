# D3 — an unreviewed SECURITY DEFINER function is not callable by the runtime role

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-30. Claimed before the change (`667beb4ee`). This refines
`../2026-09-29-definer-functions/`.
**Databases:**

- `c2c_d3c`, provisioned from empty at `8b9d18c6d` with the old grant recipe,
  with trunk's later migrations re-applied;
- `c2c_d3d`, provisioned from empty at this change (`green/from-empty.txt`).

Both are PostgreSQL 16. The runtime role is `app_service` (not superuser, no
BYPASSRLS).

**What this is not:** the row's closing evidence, which is the contract against
staging with the production image, owed with D1.

## From "reviewed before it ships" to "not callable unless reviewed"

Yesterday's gate listed every `SECURITY DEFINER` function the runtime role can
call. It failed on a new one until someone reviewed it. It worked the first
time it was tested: `c59ebc813` (VR-07) added
`public.purge_tenant_vault_records`, with a reason and a platform-scope check
in its body. But the gate left **47 functions grandfathered as "unreviewed"**,
plus `ectd.seed_project_hierarchy`, whose entry said it should be revoked
before anything called it. That is 48 functions the runtime role could call
although nothing in `server/` calls them. Each one runs as its owner, past
every tenant policy.

**Why a migration could not revoke them.** `scripts/db/provision-app-role.mjs`
runs after the migration set on every deploy (`deploy-migrate.mjs`, and
`install-fresh.mjs` the same way). It GRANTs `EXECUTE` on every function in
every application schema. Functions are also created executable by `PUBLIC`,
and three old migrations GRANT whole schemas to `PUBLIC`. So a revoke placed
anywhere earlier would be undone on the next deploy.

## The change

- **The grant recipe ends with a revoke.** `revokeUnreviewedDefinerExecute`, in
  `provision-app-role.mjs`, runs last in `grantRuntimeRolePrivileges`. It
  revokes `EXECUTE`, from `PUBLIC` and from the runtime role, on every
  `SECURITY DEFINER` function that is not on the reviewed allowlist.
  - An unreviewed definer function therefore **fails closed** for the runtime
    role: "permission denied for function".
  - Functions the owner calls are unaffected, because those run with their
    owner's privileges. That covers the policy helpers, the trigger functions,
    and the other definer functions that call these.
- **The list moves to `scripts/db/security-definer-allowlist.json`**, because
  the production image ships `scripts/db` and not `scripts/ci`. It keeps the
  **26 reviewed entries**: 20 `reviewed` and 6 `reviewed-risk`, including
  VR-07's purge function. The 48 unreviewed entries are gone. There is no
  "unreviewed" status any more: an entry is a reviewed function or it is not
  there.
- **The contract** (`tests/db/security-definer-functions.dbtest.ts`) reads the
  new list and accepts only reviewed statuses. It gains a second self-test,
  which runs the real revoke step in a rolled-back transaction. A planted
  tenant-by-argument definer function loses `EXECUTE`, and a listed one
  (`identity.current_org_id()`) keeps it.

**Before revoking, it was confirmed that nothing needs the 48** (on
`c2c_d3c`):

- **Code.** No real caller anywhere in `server/`, `scripts/`, `shared/`,
  `agents/` or `client/src/`. The name matches that did turn up are unrelated:
  a command called `detect_drift`, a Python script, and `vault.hybrid_search`,
  which is not `ai.hybrid_search`.
- **Database.** No view, column default, constraint or policy depends on any of
  them (`pg_depend`).
- **Other functions.** Every function whose body calls one of them is itself
  `SECURITY DEFINER`, so it runs as its owner.

## The evidence

| File                           | Shows                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `red/before-grant-recipe.txt`  | `c2c_d3c` under the old recipe's grants: the final case **fails**, naming the **48** callable definer functions not on the allowlist. Both self-tests pass.                          |
| `green/after-grant-recipe.txt` | The recipe run on the same database, as the next deploy runs it (`refreshRuntimeRoleGrants`, logging _"EXECUTE revoked on 48 unreviewed SECURITY DEFINER function(s)"_): **5 of 5**. |
| `green/tests-db-tier.txt`      | The **whole `tests/db` tier** on that database after the revoke: **843 of 843, 84 files**. No "permission denied for function" anywhere.                                             |
| `green/from-empty.txt`         | A database provisioned from empty at this change: the install path revokes the 48 itself, and the contract passes.                                                                   |

The unit files that exercise the provisioning script
(`provision-app-role.test.ts`, `provision-app-role-scram.test.ts`,
`readiness-contract.test.ts`, the audit archive door) pass: 4 files, 64 tests.

## For other lanes

A new `SECURITY DEFINER` function is **not executable by the runtime role**
until it has an entry in `scripts/db/security-definer-allowlist.json`, with a
reason saying why it cannot cross a tenant, or what its caller must guarantee.
Before this change an unlisted function failed the `tests/db` tier. Now the
deploy also withholds it, so application code that calls it gets "permission
denied for function" until it is reviewed. An explicit
`GRANT … TO app_service` in a migration does not get around this, because the
recipe runs after the migrations.

## Still asserted, not proven

- **The 6 `reviewed-risk` functions** are safe only because of who calls them.
  Each entry states that condition.
- **Staging.** The row closes there, with the production image, owed with D1.
  There is no production estate yet, so no deployed code path can have
  depended on the 48.
