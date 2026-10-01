# Where-used lists the official eSTAR exports that attached a Vault version (VR-14c, rows D2 and D7)

**Plan item:** critique 15's "where-used beyond eCTD" in `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`. **Date:** 2026-10-01.
**Founder decision:** none.

## The finding

VR-14a's where-used lists the submission leaves that carry a version. An official eSTAR export also
carries Vault versions, as attachments inside the form. Until today its record named each attachment
only by file name and SHA-256. The earlier change of today (`../2026-10-01-estar-source/`) made the
record name its source, the Vault version. Nothing read that source back for the Vault.

## The change

| Piece | File |
|---|---|
| `readVaultEstarUses(q, organizationId, versionIds)`. It reads both places an official eSTAR's record is kept: the artifact registry's metadata (`concept2cure_artifacts`, when the export was placed) and the export's `EXPORT_GENERATED` audit row (`audit_logs`, when it was not). Only attachments whose `source` names a Vault version are used; nothing is matched by hash. Each use gives the store, the export time, the slot, the chapter, the file name, and the Vault version the exported eSTAR itself was retained as. Both halves are filtered to the organisation in the SQL. | `server/services/vault/vault-where-used.ts` |
| The versions read gives each version `estarUses`, beside `placements`. A failed read fails the list, as before. | `server/routes/c2c/project-vault.ts` |
| **The Vault.** A version that was attached reads "attached to the official eSTAR exported 2026-10-01 18:05 UTC, retained as eSTAR-510k-device v1.0 (/CHAPTER 1/CH1.01/)". A version with none shows nothing: exports made before their records named a source cannot be known, so "attached to no eSTAR" would claim more than was read. | `client/src/concept2cure/v2/surfaces/VaultVersions.tsx` |
| URS-VAULT-020 extended (URS-002 v0.12), RA-001 v0.19, TM-001 rebuilt. OQ-VAULT-21 is unchanged. | `docs/validation/` |

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| `tests/db/vault-where-used.dbtest.ts`, "official eSTAR exports that attached a version": PostgreSQL as `app_service` with RLS on. The exports are written by the two real writers, `createAuditedUnplacedExport` and `createGovernedExportConsequence`, and read through the versions route. | `red/db-where-used.txt`: both new cases fail with trunk's service and route. VR-14a's four still pass. | `green/db-where-used.txt`: 6 of 6. v1, attached by an unplaced export, lists one `audit` use. v2, attached by a placed export, lists one `artifact` use. Both name the eSTAR's retained version. A record naming no source (as every export before today does) is not inferred. Another organisation's record naming v1 is not listed, even when the read runs as the owner, where row security does not apply. |
| Mutant: the artifact-registry half removed | `red/mutation-no-artifact-store.txt`: v2's use is lost | as above |
| Mutant: the audit-row half removed | `red/mutation-no-audit-store.txt`: v1's use is lost | as above |
| Mutant: the audit half without its tenant filter | `red/mutation-no-tenant-filter.txt`: the owner-run case counts the other organisation's export | as above |
| `client/src/concept2cure/v2/__tests__/vaultWhereUsed.test.tsx` | `red/client.txt`: the eSTAR case fails with trunk's `VaultVersions.tsx`. The three VR-14a cases pass. | `green/client.txt`: 4 of 4 |

Gates (`green/gates.txt`):
- tenant-isolation:no-regression, launch-scope-api, check-client-api-calls, internals-in-copy
- action-overclaim, success-before-ok, server-error-leaks, column-reachability, runtime-ddl
- unkeyed-request-tables, validation-traceability and its self-test, and `tsc`

Every one of them passes. The regression suites pass: every Vault client suite (22 files, 129 tests),
Vault services and project routes (55 files, 428 tests). Lint shows no new warning, and the changed new
code has none.

The full DB tier is in `green/db-tier.txt`: 1344 of 1344.

## Limits, stated

- **From today on.** An export made before its record named a source is not listed, and is not guessed
  from its hash.
- **Official eSTAR exports only.** The eSTAR content package (`POST /api/510k/estar/package`) zips
  uploaded files, not Vault versions, so it has no Vault source to name.
- **The JSON is scanned in the database.** `audit_logs.new_values` and `concept2cure_artifacts.metadata`
  are `json`, with no index on the attachment source. The scan is bounded by the organisation, the action
  and the source type. If an organisation's export count makes it slow, the remedy is an expression index
  owned by the audit lane.
