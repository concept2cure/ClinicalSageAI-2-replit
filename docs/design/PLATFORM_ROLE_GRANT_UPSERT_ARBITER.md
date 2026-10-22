# Platform role grant upsert identity

Workstream: W1, launch evidence D2/D3. The Access Management grant writer uses
the existing unique `(user_id, role)` identity declared in `shared/schema.ts`.
Deployment must create and verify that identity before the writer can perform
its existing atomic grant and chained-audit transaction.

On 2026-10-14, owner-side READ ONLY REPEATABLE READ inspection of the owned
fresh strict QA database `platform_ci_fresh_verify_20261014_beb73055` found
only `platform_role_grants_pkey`. EXPLAIN **without ANALYZE** of the exact grant
INSERT returned SQLSTATE **42P10**, because ON CONFLICT had no matching unique
arbiter. There were zero duplicate groups and zero excess rows. The older
owned `platform_ci_native_recheck_20261013` database contained the valid,
ready, nonpartial `platform_role_grants_user_role_idx`, and the identical
statement planned using that explicit conflict arbiter.

This is local fresh-provisioning qualification, not hosted CI database
inspection or proof of actual runtime grant success. The four hosted HTTP
grant failures are consistent with this local defect; their private database
was not inspected. No grant or other DML was executed during this diagnosis.

## Durable convergence contract

The existing replayed migration
`migrations/20260928_platform_role_grants_platform_writes.sql` converges the
canonical unique index after its existing table-presence guard. Its existing
canonical migration-set entry is retained. The migration then verifies the
named index is unique, valid, ready, immediate, nonpartial and nonexpression, with exactly
the ordered `user_id, role` keys. IF NOT EXISTS alone must not claim success
for a malformed object using the canonical name.

The index covers revoked rows as well, matching the existing schema and
upsert's reinstatement of the one retained grant record. An active-only partial
index cannot satisfy this unqualified ON CONFLICT contract. Existing duplicate
grants or an unrelated/invalid named index refuse deployment and require an
explicit reconciliation decision. The migration removes no rows or indexes,
grants no role, and preserves all existing RLS policies and history.

## Qualification boundaries

Focused static checks pin the existing schema/writer/migration relationship,
canonical deployment reachability, index verification and unchanged platform
write boundary. They do not establish SQL execution or native RLS behavior.
The original read-only 42P10 observation and source pins are preserved in the
dated evidence directory.

Native follow-up must apply the actual migration in the owned fresh QA
database, show repeated replay is idempotent, repeat exact EXPLAIN planning,
and establish malformed-name/duplicate refusal without deleting history.
Actual authenticated system-scoped grant plus chained audit, denied tenant
writes and audit-refusal rollback require their own restricted runtime proof.
Those native checks remain pending until the coordinated database slot is
available. Compiler, release gates and publication are control-tower owned.
