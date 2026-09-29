# VR-07: a recorded Vault version is deleted only by the tenant purge (rows D5, D6)

**Plan item:** VR-07, `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`. **Date:** 2026-09-29.

## The findings

1. **Any runtime-role DELETE of a Vault version succeeded.** VR-06 froze a
   version's identity, hash and lineage, but the row itself could still be
   deleted. The retention job did exactly that whenever a policy said
   `hardDelete` (`retentionCron.ts`, `DELETE FROM vault.documents`).
2. **The tenant purge erased nothing in the Vault, and reported success.** The
   purge route (`tenants-simple.ts`) runs `purgeTenant` on the runtime pool, as
   `app_service`, in the platform scope (`/api/tenants` is a system-scope
   prefix). The Vault's RLS policies key on the caller's organization
   (`core.can_write_program`) and have no platform arm. So the purge's
   `DELETE FROM vault.documents WHERE …` matched no rows, and neither did its
   read of the bytes' addresses. The tenant kept every version and its stored
   bytes, and the organization was marked `purged`. `tests/db/tenant-purge.dbtest.ts`
   runs the purge as the table owner, which RLS does not filter, so it never
   showed this.

## The change

| Piece | File |
|---|---|
| DELETE guard: only the table's owner deletes. It reads no session setting, so no `SET` makes a DELETE pass. | `migrations/20260926_vault_documents_record_immutability.sql` (VR-06's file, amended in place with a dated header, CLAUDE.md Rule 1; nothing dropped) |
| The purge's one door: `public.purge_tenant_vault_records(p_org)`, SECURITY DEFINER, owned by the table's owner, `search_path` pinned, EXECUTE revoked from PUBLIC. It refuses outside the platform scope, for an organization not `pending_deletion`, or under an active legal hold. It then deletes the tenant's chunks and versions with `VAULT_DOCUMENT_TENANCY`'s predicate, and returns each deleted version's storage address. | same file |
| The purge deletes through the door and erases the bytes it reports. A database with the vault but no door refuses the purge (`VAULT_PURGE_UNAVAILABLE`); it does not skip the vault. | `server/services/tenant/tenant-offboarding.ts` (`purgeVaultVersions` replaces the generic delete and the pre-read) |
| A retention policy that asks for destruction leaves the record untouched (no archive, no tombstone) and is reported as `destructionRefused`, until founder decision FD3. | `server/jobs/retentionCron.ts` |
| Required at boot, in the security health check and in the daily sweep | `server/services/audit/audit-immutability-triggers.ts` |
| Reviewed definer entry (`reviewed-risk`: the caller chooses the organization) | `scripts/ci/security-definer-baseline.json` |
| Policy row | `docs/compliance/part11-immutability-record-class-policy.md` |

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| `tests/db/vault-record-immutability.dbtest.ts`, as `app_service`, RLS enforcing | `red/db-vault-record-no-delete.txt`: the six VR-07 cases fail. The runtime role's DELETE is applied, and the door does not exist. | `green/db-vault-record-no-delete.txt`: 12/12 (the VR-06 cases too) |
| The purge on the route's own connection (`tests/db/tenant-purge.dbtest.ts`, new case) | `red/tenant-purge-route-connection.txt`: with trunk's code and database, *"the tenant's vault versions must go: expected 1 to be 0"*. The purge did not throw. | `green/tenant-purge.txt`: 12/12. Versions gone, `storageErasure {objects: 1, deleted: 1}`, bytes gone. |
| The door's copy of the predicate (`tenant-purge-vault-scope.pglite.integration.test.ts`, new describe) | `red/pglite-door-predicate-drift.txt`: the file's DELETE narrowed to `organization_id = p_org` (the pre-2026-09-24 bug) fails, *"org 11: expected … length of 2 but got 1"* | green in `green/related-suites.txt` |
| Retention (`retentionCron.policies.test.ts`, `retentionCron.legal-hold.test.ts`) | `red/retention-destroy-policy.txt`, against trunk's `retentionCron.ts`: 6 failed. The substantive one is the destroy policy, where trunk issues `DELETE FROM vault.documents`; the other five fail on the summary's renamed field. | `green/retention-destroy-policy.txt`: 22/22 |

The retention tests that used a destroy policy to show a hold "is not a
blanket stop" now use a soft-delete policy, so they still show a disposition
happening where no hold applies. The hold cases keep the destroy policy and
assert the hold is counted before any refusal.

## Replay and the full tier

`deploy-migrate` was run twice over a database that already carried the
amendment; both runs were green. The whole `tests/db` tier then ran on that database as `app_service` with RLS enforcing: 830/830 in 81 files (`green/test-db-full-tier-summary.txt`). That includes every suite that deletes `vault.documents` in its cleanup (they do so as the owner), and `security-definer-functions.dbtest.ts` with the door's baseline entry. Related unit and pglite suites: 104/104 (`green/related-suites.txt`).

## Limits, stated

- The guard is inert where the runtime role owns the table (development,
  PGlite). Production refuses to boot with that ownership
  (`server/db/rlsEnforcement.ts`).
- The door's platform-scope check reads session settings, which the runtime
  role can set. The preconditions the database holds regardless are the
  organization's `pending_deletion` status and the absence of an active hold.
  That is why the baseline entry is `reviewed-risk`.
- Rows written before the storage provider existed (a legacy `uploads/` key,
  no `storage_version_id`) come back from the door with no address, so their
  bytes are not reached. This is unchanged from before, and the purge reports
  it the same way.
