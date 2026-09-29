# D3: the audit trail lost the name of anyone who had left the organization

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-29. This is the hand-on "actor names outside the
organization render null", recorded with `../2026-09-28-users-rls/`.
**Database:** `c2c_d3u`, PostgreSQL 16, provisioned from empty. The runtime
connects as `app_service`, which is not a superuser and has no BYPASSRLS, with
`RLS_ENFORCE=on`.

**What this is not:** the row's closing evidence. That is the contract run
against staging with the production image, owed with D1.

## The defect

`audit_logs` keeps the actor's id and no name. `audit_events` stores
`user_name` when each row is written, but `audit_logs` does not. The audit-trail
ledger (`server/routes/audit-trail-ledger.routes.ts`) looked the name up by
joining `users`. Since `public.users` took row-level security on 2026-09-28, a
tenant scope sees only its current members, so that join finds nothing for
anyone who has left.

The test wrote an entry through the production audit writer
(`auditService.logAction`) while the person was a member, removed their
membership, and read the entry back through the production ledger reader
(`readRecordAuditHistory`) in the organization's own scope. The entry read
**`user 951`**, not the person's name (`red/before.txt`).

The id stayed, so the entry was never misattributed. But an audit trail that
shows a number where a person's name belongs is harder to review (Part 11
§11.10(e): an audit trail should record who acted).

## The decision

There were two options on the board: a name stored on each audit row, or a
limited name lookup. I chose the lookup.

- `audit_logs` is hash-chained and append-only, and it belongs to the D5
  lane, so adding a column to it is a larger change.
- A lookup also fixes every entry already written, including those from
  before this change.

**`migrations/20260929_actor_names.sql`** adds `public.actor_name(user_id)`:

- It returns **name and email only**, never another column.
- It answers only for a user who is **a member of the calling scope's
  organization**, or **an actor in its own audit trail**
  (`audit_logs.tenant_id` = that organization).
- As with `users` itself, the tenant-less scopes see everyone, and so do
  connections with enforcement off.
- For anyone else it returns no row.

So an organization learns the names of people who worked in it and nothing
about anyone else. Password hashes, MFA secrets and tokens stay behind the
`users` policy.

How it is built:

- It is SECURITY DEFINER, and its body runs with the platform role. EXECUTE is
  revoked from PUBLIC and granted to `app_service`.
- `audit_logs_tenant_actor_idx (tenant_id, actor_id)` serves the "acted here"
  test (see the index-only plan in `posture.txt`). It is created only when it
  is missing, so a replay takes no lock on `audit_logs`. The one build, on the
  first deploy that carries this file, holds `audit_logs`' SHARE lock for the
  length of the build.
- If a table it needs is absent, the file is skipped with a NOTICE.
- It is in `C2C_MIGRATION_FILES` after the invitations file.

**The ledger:** both queries (the tenant ledger and one record's history) now
use `LEFT JOIN LATERAL public.actor_name(actor_id)` instead of joining `users`.
Their two PGlite suites create the real function from the real migration file.

## The contract

`tests/db/actor-names.dbtest.ts`:

| # | Case | Before | After |
| - | --- | --- | --- |
| 1 | After the person leaves, the organization's audit trail names them | **fail**: `user 951` | pass |
| 2 | The lookup answers nothing about an account that never belonged to or acted in the organization | fail (no function) | pass |
| 3 | It returns name and email only | fail (no function) | pass |
| 4 | `users` itself still refuses the leaver's row to the organization | pass | pass |

**Each safeguard was made to fail:**

| File | Mutation | Fails |
| --- | --- | --- |
| `red/M1-no-past-actor-arm.txt` | lookup without the "acted in this organization" test | case 1 (`user 961`) and case 3 |
| `red/M2-no-scope-restriction.txt` | lookup with no restriction | case 2: another tenant's user resolved |

**Results:**

- `green/after.txt`: this contract plus `users-rls`, 15/15.
- `green/ledger-suites.txt`: the ledger's route test, the vault document
  history route and PGlite tests, and the client's signed-row test, 24/24.

## Still open on this row

The other display joins on `users` are being triaged, one by one, into:

- **actor-of-record displays**, where the person may have left. These convert
  to `actor_name`.
- **membership listings and authorization lookups**, which stay as they are.

Converting a join needs a real-database case for its surface, so the triage
and the conversions follow as their own commits under this row.
