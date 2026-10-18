import { CsrSourceReceiptSchema, type CsrSourceReceipt } from '../../../shared/csr-source-input.js';
import type { RequestSqlClient } from '../../db/requestDb.js';
import { vaultDataEligibleSql } from '../document-data-disposition/eligibility.js';
import { lockDocumentDispositionProgram } from '../document-data-disposition/program-lock.js';
import { STEADY_STAGES } from '../vault/vault-lifecycle.js';
import { supersededSql } from '../vault/vault-version-family.js';
import { CsrSourceInputError, type CsrSourceScope } from './vault-source-input.js';

function parseRetainedSourceReceipts(raw: unknown): CsrSourceReceipt[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 100) throw new CsrSourceInputError(409, 'CSR_RUN_INPUTS_INVALID', 'The retained clinical source receipts are malformed.');
  const receipts: CsrSourceReceipt[] = [];
  for (const item of raw) {
    const parsed = CsrSourceReceiptSchema.safeParse(item);
    if (!parsed.success || parsed.data.sourceApproval !== 'canonical-lifecycle') throw new CsrSourceInputError(409, 'CSR_RUN_INPUTS_INVALID', 'The retained clinical source receipt is malformed or not platform-approved.');
    receipts.push(parsed.data);
  }
  return receipts;
}

/** Fresh source eligibility never replaces the original frozen observations.
 * Historical table reconstruction can use retained data after check-in or
 * keep_data, but explicit remove_data/supersede remains a consumption refusal.
 * Release/continuation callers pass lock=true inside their effect transaction. */
export async function validateCsrSourceReceipts(q: RequestSqlClient, scope: CsrSourceScope, raw: unknown,
  options: { historical?: boolean; lock?: boolean } = {}): Promise<CsrSourceReceipt[]> {
  const receipts = parseRetainedSourceReceipts(raw);
  if (!receipts.length) return [];
  if (options.lock) await lockDocumentDispositionProgram(q, scope.organizationId, scope.programId);
  for (const receipt of receipts) {
    const values = [receipt.documentId, scope.organizationId, scope.programId, receipt.sha256];
    const { rows } = options.lock
      ? await q.query(`SELECT d.id::text, d.content_hash FROM vault.documents d
        WHERE d.id=$1 AND d.organization_id=$2 AND d.program_id=$3 AND d.deleted_at IS NULL
          AND d.content_hash=$4 AND ${vaultDataEligibleSql('d')} FOR SHARE OF d`, values)
      : await q.query(`SELECT d.id::text, d.content_hash FROM vault.documents d
        WHERE d.id=$1 AND d.organization_id=$2 AND d.program_id=$3 AND d.deleted_at IS NULL
          AND d.content_hash=$4 AND ${vaultDataEligibleSql('d')}`, values);
    if (rows.length !== 1) throw new CsrSourceInputError(409, 'CSR_SOURCE_DATA_UNAVAILABLE', 'This retained source is no longer eligible for data consumption. Its historical record remains retained; tables were not regenerated.');
    if (options.historical) continue;
    // Fresh statement after any predecessor lock wait: do not authorize an
    // earlier version using a snapshot acquired before its check-in committed.
    const current = await q.query(`SELECT NOT ${supersededSql('d')} AS current FROM vault.documents d
      WHERE d.id=$1 AND d.organization_id=$2 AND d.program_id=$3 AND d.content_hash=$4`,
    [receipt.documentId, scope.organizationId, scope.programId, receipt.sha256]);
    if (current.rows[0]?.current !== true) throw new CsrSourceInputError(409, 'CSR_SOURCE_CHANGED', 'A retained clinical source was superseded. Regenerate the run with the current approved version.');
    const lifecycle = options.lock
      ? await q.query(`SELECT stage, content_hash FROM canonical_documents WHERE organization_id=$1
        AND source_refs->'vault_documents'->>'nativeId'=$2 ORDER BY created_at, canonical_id LIMIT 1 FOR SHARE`, [scope.organizationId, receipt.documentId])
      : await q.query(`SELECT stage, content_hash FROM canonical_documents WHERE organization_id=$1
        AND source_refs->'vault_documents'->>'nativeId'=$2 ORDER BY created_at, canonical_id LIMIT 1`, [scope.organizationId, receipt.documentId]);
    const record = lifecycle.rows[0];
    if (!record || typeof record.stage !== 'string' || !(STEADY_STAGES as readonly string[]).includes(record.stage) || record.content_hash !== receipt.sha256) {
      throw new CsrSourceInputError(409, 'CSR_SOURCE_APPROVAL_REQUIRED', 'A retained clinical source is no longer the exact current approved version. Regenerate the run after source review.');
    }
  }
  return receipts;
}
