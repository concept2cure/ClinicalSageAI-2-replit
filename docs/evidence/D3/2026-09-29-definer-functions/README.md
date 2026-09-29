# D3 — a new way around RLS is reviewed before it ships

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-29. Claimed before the change (`95b7e5f71`).
**Database:** `c2c_d3c`, PostgreSQL 16, provisioned from empty by
`scripts/db/provision-test-db.sh` at `8b9d18c6d` (exit 0). The runtime role is
`app_service` (not superuser, no BYPASSRLS).

**What this is not:** the row's closing evidence, which is the contract against
staging with the production image, owed with D1.

## The class

A `SECURITY DEFINER` function runs as its owner. Everything it reads or writes
bypasses the tenant policies, whatever scope the caller is in. So every such
function the runtime role may `EXECUTE` is a way around RLS. Whether it stays
inside a tenant depends entirely on its body and its callers. The shape to fear
is one this row has already met in application code
(`../2026-09-24-rag-pipeline-tenant/`): a tenant key taken from an argument.

Earlier sweeps in this row covered tables: what a policy reads
(`tests/db/rls-policy-inputs.dbtest.ts`), and tables with no policy at all.
Nothing covered functions.

## The sweep

On a database provisioned from empty, **73** `SECURITY DEFINER` functions are
callable by `app_service`. For each, `server/` was searched for a caller, and
every function with a caller was read. `scripts/ci/security-definer-baseline.json`
gives each one a status and a reason:

| Status          | Count | Meaning                                                                                                                                                                                                                                                                                                                 |
| --------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reviewed`      | 20    | Cannot cross a tenant by its own body. These are the RLS policy helpers, trigger functions, the audit archive door (which refuses any role but `audit_archiver`), and the three `…01YZFCXR` functions (`actor_name`, `user_id_for_email`, `invitations_for_member`), each of which checks the tenant scope in its body. |
| `reviewed-risk` | 6     | Trusts a caller-supplied tenant or target, so it is safe only because of who calls it. The condition is written into the entry.                                                                                                                                                                                         |
| `unreviewed`    | 47    | No caller in `server/` today. Grandfathered, honestly labelled, not individually read.                                                                                                                                                                                                                                  |

**The six `reviewed-risk` functions, and why none is reachable on a launch
path today:**

- **`ectd.seed_project_hierarchy`** deletes and reseeds `ectd.project_folders`
  for a caller-supplied project id, as its owner. If anything passed another
  tenant's id, that would **destroy another tenant's folder tree**. Nothing
  can today:

  - `server/api/ectd/routes.ts` is not registered;
  - `ECTDScaffoldingService` has no live caller;
  - `core.programs` (its foreign-key parent) and `ectd.project_folders` are
    both empty.

  The entry says what must happen before anything calls it: revoke `EXECUTE`,
  or check the project's tenant in the body.

- **`compliance.write_audit_entry`**, **`verify_audit_chain`** and
  **`create_electronic_signature`** each take a caller-supplied organization,
  or a schema and table to hash past RLS. Only `cortexComplianceService` calls
  them, and Cortex is outside the launch catalog. The canonical Part 11 signer
  is `services/part11`.
- **`regulatory_harmonization.validate_data_region`** and
  **`create_export_job`** each take a caller-supplied tenant. Only
  `services/grdhe` calls them, and it is outside the launch catalog.

So the sweep found **no reachable bypass on a launch path**. It found one
destructive function with no caller, which is now labelled with what must
happen first.

## The gate

`tests/db/security-definer-functions.dbtest.ts` reads the catalog and fails on
any callable definer function missing from the baseline. It also asserts that
every entry has a known status and a real reason, and that the runtime role
exists without superuser or bypass. Listed functions that are absent are not a
failure, because a partial schema is not a bypass.

| File                           | Shows                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `green/baseline-complete.txt`  | **4 of 4** on `c2c_d3c`.                                                                             |
| `red/M1-unlisted-function.txt` | One reviewed entry removed, which is the state of any new function: the gate **fails** and names it. |

The self-test is part of every run. It creates
`public.wo03_planted_definer(p_org integer)` in a rolled-back transaction
(the shape to fear: `count(*)` of `projects` for an argument's organization),
grants it to `app_service`, and requires the sweep to report it.

**For other lanes:** a new `SECURITY DEFINER` function callable by the runtime
role now needs an entry in `scripts/ci/security-definer-baseline.json`, with a
reason saying why it cannot cross a tenant, or what its caller must guarantee.
Otherwise the `tests/db` tier fails. That failure is the point.

## Still asserted, not proven

- **47 functions are unreviewed.** Each one needs a read before any code calls
  it; the baseline says so per entry.
- **`EXECUTE` is granted to the runtime role on all 73**, largely through
  PostgreSQL's default grant to `PUBLIC`. Revoking it from functions nothing
  calls would shrink the surface. That is a separate change, and it needs each
  function's callers confirmed across every applier, not only `server/`.
- **Staging.** The row closes there, with the production image, owed with D1.
