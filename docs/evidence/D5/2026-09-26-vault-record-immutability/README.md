# VR-06 — a recorded Vault version cannot be rewritten (row D5)

**Plan item:** VR-06, `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`.
**Row:** D5 (governed records). **Date:** 2026-09-26, rebuilt and verified 2026-09-29.

## The finding

Nothing below the application stopped the runtime role running
`UPDATE vault.documents` on a recorded version's `content_hash`, `version`,
`program_id`, `organization_id`, storage pointer or lineage. The Vault's RLS
grants UPDATE to program writers, and `app_service` has full DML on the schema.
The owner could TRUNCATE the table. The hash a submission leaf pins, the one a
download is verified against, and the program and tenant a version belongs to
all depended on every code path behaving correctly.

## The change

| Piece | File |
|---|---|
| Row guard + TRUNCATE guard | `migrations/20260926_vault_documents_record_immutability.sql` (registered in `scripts/db/migration-set.mjs` after every file in the set that writes `vault.documents`) |
| Required at boot, in the security health check and in the daily integrity sweep | `server/services/audit/audit-immutability-triggers.ts` (two entries) |
| The code that may still UPDATE the table is named | `scripts/ci/check-vault-document-writers.mjs` + `.selftest.mjs`, `npm run ci:vault-document-writers`, CI step "Guardrails — only named writers change a recorded Vault version (Part 11)" |
| Compensation soft delete does not touch an already-deleted row | `server/services/authoring/authoring-file-to-vault.ts` (`AND deleted_at IS NULL`) |
| Policy row | `docs/compliance/part11-immutability-record-class-policy.md` |

Column rules:

- **Frozen** (never change): `id`, `program_id`, `version`, `content_hash`,
  `file_size`, `mime_type`, `created_by`, `created_at`.
- **Write-once** (NULL → value only): `organization_id`, `document_code`,
  `file_name`, `filename`, `s3_key`, `s3_bucket`, `storage_version_id`,
  `storage_provider`, `s3_version_id`, `retention_policy`, `supersedes_id`,
  `parent_document_id`, `deleted_at`.
- **Storage adoption:** `s3_key`, `s3_bucket` and `storage_provider` may change
  only in the UPDATE that sets `storage_version_id` from NULL to a value. The
  hash is frozen, so it stays the same.
- **Mutable, through a named writer:** title, type, classification, filing,
  processing state, `retention_until`, `updated_at`.

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| `tests/db/vault-record-immutability.dbtest.ts`, as `app_service` in a request tenant scope with `RLS_ENFORCE=on` | `red/db-vault-record-immutability.txt`: **5 failed, 1 passed**. Same database, both triggers dropped: every rewrite and the TRUNCATE succeed. The one passing case is the positive control (named-writer updates still apply). | `green/db-vault-record-immutability.txt`: 6/6 |
| Replay re-installs the guard | Both triggers dropped | `deploy-migrate` re-created both, enabled (`green/triggers-after-deploy-migrate.txt`) |
| Boot check names a disabled Vault guard (`audit-immutability-triggers.pglite.test.ts`) | `red/boot-check-without-vault-entries.txt`: without the two entries, a disabled guard is reported ok (1 failed, 6 passed) | `green/boot-check-with-vault-entries.txt`: 75/75 across the five suites that use the list |
| Writers gate | The selftest shows the gate failing on an unnamed writer and on a stale entry | `green/ci-vault-document-writers.txt`: 6 writers, 6 named. On its first run the gate flagged a comment in `migration-set.mjs` that quoted the statement; the comment was reworded. |

Database built as CI builds it: blank database, then `install-fresh.mjs`, then
`deploy-migrate.mjs`.

## The full database tier, with the guard in force

`green/test-db-full-tier-summary.txt`: 804 passed, 13 failed in 5 files. None of
the 13 failures mentions `IMMUTABILITY_VIOLATION`. With both triggers dropped
from the same database, the same 13 fail, so they predate this change. They are
triaged separately:
`document-catalog*.dbtest.ts` and `vault-placement.dbtest.ts` get the new
editor-role refusal from AnA's tool dispatch, and
`run-control-cross-instance.dbtest.ts` fails on its own.

Also green: 77 unit and pglite files (1150 tests), covering every suite that
reads `C2C_MIGRATION_FILES`, `server/services/vault`, the authoring suites, and
the ingest ON CONFLICT pglite test. Also green: `ci:migration-set-order`,
`ci:migration-drop-safety` (+ selftest), `ci:workflow-targets`,
`check:compliance-claims`.
