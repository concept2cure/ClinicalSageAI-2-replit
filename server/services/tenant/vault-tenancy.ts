/**
 * Vault tenancy — ONE predicate, read by the tenant export AND the tenant purge.
 *
 * It lives here, not in either consumer, because they must agree and cannot
 * import each other: the purge verifies the export's receipt, so it already
 * imports the export module. Two copies of the predicate is how they disagreed:
 * the purge reached documents through their programme while the export read
 * `organization_id` alone, so an erasure could destroy documents the customer
 * was never given back (found by the 2026-09-24 re-verification; pinned by
 * server/services/tenant/__tests__/tenant-purge-vault-scope.pglite.integration.test.ts,
 * "the export contains what the purge destroys").
 *
 * `$1` is the organization id as an INTEGER.
 *
 * @module server/services/tenant/vault-tenancy
 */

/**
 * Which vault documents belong to a tenant.
 *
 * The export must return every row this matches: it is the set the purge
 * destroys.
 *
 * NOT `organization_id = $1` alone, which is what both vault entries used and
 * which under-deletes on a GDPR erasure.
 * `vault.documents.organization_id` is NULLABLE by design — the schema records
 * that "NULL = unattributable — the program is missing or SOFT-DELETED"
 * (shared/schema/vault.ts). So a document whose programme has been soft-deleted
 * carries a NULL there, matches no `organization_id = $1`, and SURVIVED the
 * purge with its bytes, which is the precise failure an erasure request exists
 * to prevent. Naming the vault tables correctly fixed the table-level miss; it
 * left this row-level one behind, in the rows most likely to be old.
 *
 * The programme is the authoritative owner — the column is backfilled FROM it
 * (migrations/20260905_vault_documents_organization_id.sql) — so ownership is
 * asked of the programme, and the column is kept as a union rather than
 * replaced: a row the programme cannot attribute but the column can is still
 * this tenant's, and dropping that clause would trade one under-deletion for
 * another.
 *
 * Deliberately NO `deleted_at IS NULL` on regulatory_programs. A purge must
 * reach documents on a soft-deleted programme — that is exactly the population
 * the column cannot attribute, and filtering them out here would reinstate the
 * bug this predicate exists to fix.
 */
export const VAULT_DOCUMENT_TENANCY =
  '(organization_id = $1 OR program_id IN (SELECT id FROM regulatory_programs WHERE organization_id = $1))';
