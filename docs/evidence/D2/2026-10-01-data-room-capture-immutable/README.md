# VR-16: the data room's capture record is append-only, and "filed" names the Vault version (rows D2, D5)

**Plan item:** VR-16, `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`. **Date:** 2026-10-01.
**Depends on:** VR-07, VR-08 and VR-10 (all done; VR-10 was delivered under PF-07, `824f699cf`).
**Founder decision:** none.

## The finding

`cre_evidence_sources` is the data room's intake record: what was captured, with which bytes, and which
capture each one revises. Its checksum was "written once" only by convention
(`migrations/20260829_cre_source_versioning.sql`). Any UPDATE could rewrite the checksum, re-point a
revision, move a capture to another project or organization, or make a retired capture current again, and
any role could delete one. "Filed" (a checksum join against the Vault) and "changed since cited" could
then be falsified after the fact. And "filed" said only that, not which version the bytes became, so a
file whose Vault version had been replaced still read as filed.

## The change

| Piece | File |
|---|---|
| Triggers on `cre_evidence_sources`, for every role but the table's owner. Frozen: `id`, `organization_id`, `source_type`, `created_at`. Write-once (NULL → value only): `checksum`, `previous_version_id`, `client_program_id`, `client_workspace_id`, `deleted_at`. One-way: `is_current` TRUE → FALSE. TRUNCATE is refused for everyone, and DELETE for anyone but the owner. Replayable: functions are CREATE OR REPLACE, triggers are created when absent, and there is no DROP. | `migrations/20261001_cre_evidence_sources_capture_immutability.sql`, `scripts/db/migration-set.mjs` (after `20260829_cre_source_versioning.sql`) |
| The writers were enumerated before the guard landed: `createSource` (INSERT) and `createSupersedingSource` (`UPDATE … SET is_current = FALSE`), both in `evidence-spine.service.ts`. The data room's adopt creates a new source, no migration UPDATEs the table, and the tenant purge does not reach it. | — |
| Boot requires the three triggers, like VR-06's. | `server/services/audit/audit-immutability-triggers.ts` |
| The data room's "filed" match also returns the version the bytes are and, when a later version replaced it, the family's current version. It uses the VR-08 link rule (`currentVersionLateral`). Each source carries `filedAs: { version, supersededBy }`. | `server/services/vault/vault-version-family.ts`, `server/routes/c2c/project-vault.ts` |
| The data room's chip reads "Filed as v1.0, superseded by v2.0", or "Filed as v3.0". On a server that predates this it still reads "Filed". | `client/src/concept2cure/v2/surfaces/Vault.tsx` (`roomStageLabel`) |

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| `tests/db/cre-capture-immutability.dbtest.ts`, run on PostgreSQL as `app_service` with RLS on | `red/db-capture-immutability.txt`: 4 of 6 fail without the guard. A checksum is rewritten and cleared, a revision link and a project scope change, a superseded capture becomes current again, a DELETE succeeds. The two controls pass. | `green/db-capture-immutability.txt`: 6/6 after `deploy-migrate` applied the file twice (replay). The controls are that `createSupersedingSource` still retires its predecessor and a mutable column still changes. TRUNCATE is tested with CASCADE inside a rolled-back transaction, because without CASCADE the table's foreign keys refuse first, which says nothing about the guard. |
| "Filed" names the version: the route test (`vault-data-room-counts.test.ts`), the client label (`vaultDataRoomFiledAs.test.ts`), and on PostgreSQL a captured file holding v1.0's bytes (`vault-versions.dbtest.ts`) | `red/filed-as.txt`: with trunk's `project-vault.ts` and `Vault.tsx`, 3 unit cases and the DB case fail. The window and classified controls pass. | 7/7 unit; the DB case reads `{ version: '1.0', supersededBy: '2.0' }` |
| The capture table's writers and readers | — | 186 files, 1594 tests: evidence, sources, data room, Vault, capture, upload, lineage and citations |
| Boot trigger list | — | 5 files, 76 tests. The PGlite list test gained a `cre_evidence_sources` stub table, so the migration installs its triggers there. |

Also green: `ci:migration-set-order`, `ci:migration-drop-safety`, `ci:migration-deploy-path`,
`ci:tenant-isolation:no-regression`, `ci:runtime-ddl`, `ci:column-reachability`, `tsc`. Lint counts match
trunk on every changed file. The full DB tier result is in `green/db-tier.txt`.

## Limits, stated

- **The project scope is now write-once too.** That is beyond the plan's list. No writer changes it, and
  a source moving between projects would falsify "filed in this project".
- **A future purge of this table** must delete as the owner. It would extend VR-07's owner-run function,
  amended in place (CLAUDE.md, Rule 1).
