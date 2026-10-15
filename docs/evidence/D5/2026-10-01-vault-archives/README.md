# The Vault's deletion archive is deployed, append-only, tenant-scoped and purged (rows D5, D6)

**Plan item:** critique 13 of `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` §4. **Date:** 2026-10-01.
**Founder decision:** none. Whether retention may ever destroy a version stays FD3; this change destroys
nothing.

## The finding

`vault.document_archives` holds the snapshot the retention job takes of a document before disposing of
it: the full record, extracted text included (`server/jobs/retentionCron.ts`). The critique found
"nothing makes it immutable". Reading it on PostgreSQL found more:

- **Not deployed.** Its creating file, `migrations/20260608_vault_retention.sql`, was on no applier
  (`ci:migration-deploy-path` carried it in its baseline). A database built by `deploy-migrate` had no
  archive for the job to write to.
- **No row security.** Any tenant's runtime-role query could read every organisation's archived
  snapshots.
- **No guard.** The runtime role could rewrite or delete an archive, and anyone could truncate the
  table.
- **The tenant purge left it behind.** A purged organisation's archived snapshots outlived the
  organisation.

## The change

| Piece | File |
|---|---|
| The creating file joins the deploy set, just before the VR-06 file that guards it. CREATE … IF NOT EXISTS only: replayable, no DROP. The deploy-path baseline shrinks by that one line. | `scripts/db/migration-set.mjs`, `scripts/ci/migration-deploy-path-baseline.json` |
| VR-06's file is amended in place, with a dated header note (Rule 1). It adds three guards: `vault_document_archives_guard` refuses every UPDATE, even the owner's; `vault_document_archives_delete_guard` refuses DELETE from anyone but the table owner; `vault_document_archives_truncate_guard` refuses TRUNCATE. Row security mirrors `vault.documents`: SELECT through `core.can_access_program`, INSERT, UPDATE and DELETE through `core.can_write_program`, so a change attempted in the organisation's scope gets the guards' explicit refusal rather than a silent no-op. It is not FORCEd, as `vault.documents` is not, so the owner-run purge reaches it. `purge_tenant_vault_records` now also deletes the organisation's archives. Policies and triggers are created only when absent, and nothing is dropped. `deploy-migrate` applied it twice. | `migrations/20260926_vault_documents_record_immutability.sql` |

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| `tests/db/vault-document-archives.dbtest.ts`: PostgreSQL as `app_service` with RLS on | `red/db-archives.txt`: 4 of 5 fail on trunk. The file is not in the set. An archive is rewritten and deleted, another organisation reads it, and the purge leaves it. The control passes. | `green/db-archives.txt`: 5 of 5, with VR-06/07's suite (17 of 17) after a double migrate. The creating file is in the set. The job's INSERT works in the organisation's scope. UPDATE and DELETE are refused in that scope; the owner's UPDATE is refused; TRUNCATE is refused. Another organisation reads nothing, while its own organisation reads the row. The purge erases this organisation's archive and keeps the other's. |
| A mutant: the purge function without its archive delete | `red/mutation-purge-misses-archives.txt`: the purge case fails | as above |
| Suites over archives and the purge: compliance reports, tenant purge, retention, every Vault DB suite | — | 25 files, 187 tests |

Also green:
- Migration gates: `ci:migration-set-order`, `ci:migration-drop-safety` and its selftest,
  `ci:migration-deploy-path` (after the baseline shrank).
- Other gates: `ci:runtime-ddl`, `ci:column-reachability`, `ci:tenant-isolation:no-regression`,
  `ci:vault-document-writers`.
- The boot-trigger and grant-recipe suites are unchanged and green.

The full DB tier is in `green/db-tier.txt`: 1313 of 1313.

## Handed on (`docs/work-orders/README.md`)

- **To the P0-8 grants lane:** add the archive to `APPEND_ONLY_TABLES` and its three triggers to the
  boot's `EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS`, together. Their pairing test makes them move as a set,
  and both files are inside that lane's window.
- **To the scheduled-jobs lane:** the retention sweep runs in the system scope, where `vault.documents`'
  row security, and now the archive's, admits nothing under enforced RLS. It is inert today, since
  nothing writes `retention_until`. Before it is switched on, it must run per organisation.

## Limits, stated

- **The snapshot still carries the extracted text.** That is the archive's purpose: what was disposed
  of, as it was. It is now readable only by its own organisation, and erased with it.
- **Archives already written stay as they were.** The guards apply from this deploy on.
