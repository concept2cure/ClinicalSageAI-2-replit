# g-vault-facts-shared-query — facts relied on

This step changes no regulatory statement. It relies on no regulator text and
on no recall about a regulator. The facts it relies on are facts about this
repository, each checked against the working tree on 2026-10-05.

| Fact | Basis |
|---|---|
| `vault.documents.placement_status` takes `unfiled`, `suggested` or `confirmed`. There is no `filed` value. | repository: `migrations/20260823_vault_document_placement.sql:52` (default `'unfiled'`); `server/services/vault/vault-coverage.ts:11` names "confirmed" the strongest state a filing has |
| `loadDocumentForOrg(documentId: string, organizationId, { includeText })` opens a Vault document by `vault.documents.id`. That is why the shared read returns `d.id` as a string. | repository: `server/services/vault/document-catalog.service.ts:159` |
| Before this change, `readVaultFacts` was the only Vault read behind `plan_submission_from_database_lock`, and nothing else in the codebase exported a query that returns document ids for the same scope. | repository: `grep -rn readVaultFacts server scripts shared client` |

## What the change guarantees

- `readVaultDocuments` (`server/services/ana/regulatory-knowledge-tools.ts`) holds
  the single statement. It is scoped by organization (`rp.organization_id = $1`)
  and program (`d.program_id = $2`), excludes deleted documents
  (`d.deleted_at IS NULL`), and is capped at `VAULT_FACTS_MAX + 1`.
- `readVaultFacts` calls `readVaultDocuments` and drops the id. It issues the
  identical SQL text and parameters. The test pins this by comparing the SQL
  text and parameters each one sends.
- Behaviour is unchanged. The plan's facts have the same fields and values as
  before, truncation is reported the same way, and a failed read still throws,
  so it is never reported as an empty Vault.
