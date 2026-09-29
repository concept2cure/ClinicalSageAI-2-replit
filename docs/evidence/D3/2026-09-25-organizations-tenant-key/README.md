# D3 — any tenant could move any organization's tenant key

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-25. Claimed before the fix was written (`a8527e41`).
**Database:** `c2c_d3b`, PostgreSQL 16, provisioned from empty by
`scripts/db/provision-test-db.sh`. The runtime connects as `app_service` (not
superuser, no BYPASSRLS) with `RLS_ENFORCE=on`. See `posture.txt`.

**What this is not:** the row's closing evidence, which is the contract against
staging with the production image, owed with D1.

## How it was found

The two vault holes closed the day before
(`../2026-09-24-vault-program-ownership/`) shared one shape. The policy was
sound, but a table it consulted could be written by any tenant. So this lane
swept the whole catalog for that shape:

- follow every RLS policy expression into the functions it calls, recursively;
- collect every relation a policy subquery or one of those functions reads;
- keep those with no RLS that `app_service` may INSERT, UPDATE or DELETE.

There was one hit: **`public.organizations`, read by
`core.get_program_org_id`.**

The integer tenant sweep never reached this table. It polices tables that
**have** an `organization_id` / `org_id` / `tenant_id` column, and this is the
table those columns point at.

## The defect

`core.get_program_org_id` maps a program to
`regulatory_programs.organization_id` → **`organizations.uuid`**, and vault RLS
compares that with the session's `app.current_org_id`. The same uuid is the
tenant key of every non-public schema. As `app_service` with RLS enforcing, in
tenant A's scope:

```sql
UPDATE organizations SET uuid = gen_random_uuid() WHERE id = <A>;
UPDATE organizations SET uuid = <A's old uuid>     WHERE id = <B>;
```

After that, B's programs resolved to A's uuid, and **A read B's vault**. A had
also moved its own key away, so A lost its own documents. Nothing about the
statements looks like an attack to a policy: each one is a plain UPDATE.
(`red/psql-org-uuid-swap-before-after.txt`)

**Reach.** Nothing in the application changes an organization's uuid or id
(searched 2026-09-25). So this takes SQL running as the runtime role, the same
standard as the two vault findings.

## The fix, and what it deliberately leaves

**`id` and `uuid` are immutable once set, for every role and scope.** A new
`migrations/20260925_organizations_tenant_key_immutable.sql` adds a
`BEFORE UPDATE OF id, uuid` trigger that refuses the change with
`insufficient_privilege`. It sits in `C2C_MIGRATION_FILES` above the final
isolation pair, and it converges on every run with nothing dropped.

The fix is a trigger and not a policy because A moving **its own** uuid is the
first half of the attack. A policy that lets an organization write its own row
cannot stop that.

**Writes to the other columns are not narrowed. Any tenant scope can still
UPDATE any organization's tier, seats, settings, Stripe ids and API key at the
database.** An own-org-or-platform write policy was built and measured first:
red, then green, 12 of 12. It was withdrawn because it would break five
platform-staff override paths. Each writes **another** organization's row from
the staff member's **own** request scope, where the role is `super_admin`, not
`app_super_admin`:

| Path                                                             | What the policy would have done                                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `organizations-routes.ts` `PATCH /:id/profile` (:299)            | 500 (reads a row that did not come back)                                                     |
| `organizations-routes.ts` `PATCH /:id/settings` (:500)           | **Silently nothing.** It reports success and writes an audit row without checking the update |
| `tenant-config.ts` :203, :303, :404 (the `super_admin` branches) | 500                                                                                          |

Every other writer runs as the session's own org, or in the system scope
(`/api/admin/master`, `/api/tenants`, and the Stripe webhook's explicit
`runWithSystemTenantScope`), and would have been unaffected. Those five move to
the system scope first; that is handed on in `docs/work-orders/README.md`.
`:500`'s unchecked update is a defect whatever happens to the policy.

Reads were never in scope: pre-auth lookups (slug, domain, API key) and signup
use this table before any tenant exists.

## The contracts

**`tests/db/rls-policy-inputs.dbtest.ts`** is new. It is the sweep, run against
the catalog of the provisioned database.

- **Self-test 1:** with `identity.org_relationships`' RLS removed inside a
  rolled-back transaction, the sweep must report it. This is the 2026-09-24
  finding, so a green run cannot be vacuous.
- **Reviewed exceptions:** each carries a reason and a **guard query**, and the
  exception holds only while the guard returns true. `public.organizations` is
  the only one, and its guard is the immutability trigger.
- **Self-test 2:** with the trigger disabled inside a rolled-back transaction,
  `organizations` must be reported again.
- **The assertion:** no unguarded relation remains.

**`tests/db/vault-program-ownership.dbtest.ts`** gains two cases:

- A cannot hand B's organization its uuid, and B's vault stays B's.
- An organization can still update its own row and the platform scope can
  still update any organization's row (positive controls: the trigger breaks
  no writer), but neither can move a key.

| File                                      | Shows                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `red/unfixed.txt`                         | Trigger absent, as before this change: **4 fail, 9 pass**. The swap lands (_"B's document reached A"_), the platform scope moves a key, the guard self-test fails, and the sweep reports `organizations`.                                                                                                                   |
| `green/fixed.txt`                         | **13 of 13.**                                                                                                                                                                                                                                                                                                               |
| `red/psql-org-uuid-swap-before-after.txt` | The attack in plain SQL as `app_service`, rolled back. Before: A reads `B-CONFIDENTIAL-STABILITY`. After: the first UPDATE is refused, _"organizations.id and organizations.uuid are immutable once set"_. The after run stops at that refusal, so the second statement is shown refused by the contract, not by this file. |
| `green/tests-db-tier.txt`                 | The whole `tests/db` tier on the same database with this change, compared with the same tier without it.                                                                                                                                                                                                                    |
| `posture.txt`                             | Role flags, the table's RLS state and the runtime's write grants (unchanged, by design), the triggers, and the resolver that reads the uuid.                                                                                                                                                                                |

The fixture organizations' uuids were read before and after every run and never
changed. The red run moves them, and the cases restore them in `finally`.

## Still asserted, not proven

- **Writes to `organizations`' other columns** are unguarded at the database,
  as above.
- **Reads of `organizations`** are unguarded: any tenant scope can list every
  organization, including `api_key` and the Stripe ids. No route is known to
  expose that. It is a database-level fact, recorded rather than changed,
  because every pre-auth reader has to be found first.
- **`tenants-simple.ts`** (`PATCH /api/tenants/:id`, `POST /:id/api-key`) uses
  its own `postgres()` connection that bypasses the instrumented pool, so it
  runs with no tenant scope at all. It works today because it is platform-admin
  only; it is recorded here because it sidesteps every scope rule this row
  relies on.
- The sweep reads function source statically (`FROM` / `JOIN`). Dynamic SQL
  (`EXECUTE format(...)`) inside a policy function would not be followed. None
  of the eight functions it reaches today uses `EXECUTE`: `core.can_access_program`,
  `core.can_write_program`, `core.get_program_org_id`, `identity.can_access_program`,
  `identity.can_write_program`, `identity.can_access_org`, `identity.can_write_org`,
  `identity.current_org_id`.
- **Staging.** The row closes there, with the production image, owed with D1.
