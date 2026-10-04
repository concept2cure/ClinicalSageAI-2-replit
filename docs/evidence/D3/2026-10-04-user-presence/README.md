# D3: `user_presence` gets row security before its first writer

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-10-04. The hand-on recorded 2026-09-28: "`user_presence` has no
reader or writer … its first writer brings a policy."
**Database:** `c2c_d3x`, provisioned from empty, as `app_service` with
`RLS_ENFORCE=on`.

## The defect

`public.user_presence` holds a person's IP address, user agent, current page and
current document. It had no row-level security, so any scope read and wrote
every row. It has no reader or writer yet, but leaving the policy to "its first
writer" means that writer can ship without one.

## The change

`migrations/20261004_user_presence_rls.sql` is in `C2C_MIGRATION_FILES` after
the actor-names entry, ahead of the isolation tail. RLS is enabled and FORCEd,
following the `users` policy:

- **Read:** the platform role; the row's person being a member of the scope's
  organization (presence is for colleagues); or the account a pre-auth scope is
  bound to.
- **Write:** the platform role, or the bound account only. A colleague may see
  where you are, not write it, so a future tenant-scope writer must bind to the
  person it writes for or fail closed.

`scripts/db/rls-coverage-check.sql`'s note moves the table from "recorded, not
policied" to policied.

## The contract

`tests/db/user-presence-rls.dbtest.ts`. Red is trunk's state: the table without
row security.

| # | Case | Trunk | After |
| - | --- | --- | --- |
| 1 | A's member sees a colleague's presence (positive control) | pass | pass |
| 2 | A's scope does not see B's member, by id or by scanning | **fail**: B's member's IP read | pass |
| 3 | A's member cannot rewrite a colleague's presence, nor B's | **fail**: both rewritten | pass |
| 4 | An unbound pre-auth scope reads none | **fail**: every row | pass |
| 5 | The person, bound, writes their own presence | pass | pass |

`red/before.txt`: 3 of 5 fail. `green/after.txt`: 5 of 5 pass. The migration
applied twice converges.
