import { CsrSourceEnvelopeSchema, CSR_SOURCE_FORMAT, type CsrSourceEnvelope, type CsrSourceReceipt, type CsrSourceSelection } from '../../../shared/csr-source-input.js';
import type { RequestConnectable, RequestSqlClient } from '../../db/requestDb.js';
import { authorizeCsrSourceProgram, CsrSourceInputError, type CsrSourceScope } from './source-access.js';
import { vaultBinaryAvailableSql, vaultDataEligibleSql } from '../document-data-disposition/eligibility.js';
import { lockDocumentDispositionProgram } from '../document-data-disposition/program-lock.js';
import { supersededSql } from '../vault/vault-version-family.js';
import { STEADY_STAGES } from '../vault/vault-lifecycle.js';
import { setTenantContextTx } from '../tenant/governed-tenant-context.js';
import { buildCSRTables, type CSRTables } from '../csr-tabulation-builders.js';
import { createHash } from 'node:crypto';

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
// Defined in source-access.ts (no Vault byte reader behind it); re-exported for existing importers.
export { authorizeCsrSourceProgram, CsrSourceInputError, type CsrSourceScope };
type SourceRow = Record<string, unknown> & {
  id: string; document_title: string; version: string; content_hash: string; file_name: string; mime_type: string;
  storage_version_id: string | null; storage_provider: string | null; s3_key: string | null; file_size: number | string;
};
export interface LoadedCsrSource { source: CsrSourceReceipt; approved: boolean; tables: CSRTables; envelope: CsrSourceEnvelope }
export interface CsrSourceInputDeps { readBytes: (row: SourceRow, organizationId: number) => Promise<Buffer> }

/** Candidate metadata, not a declaration that file contents have been parsed. */
export async function listCsrVaultSources(q: RequestSqlClient, scope: CsrSourceScope) {
  await authorizeCsrSourceProgram(q, scope);
  const { rows } = await q.query(`SELECT d.id::text AS document_id, d.document_title, d.version, d.content_hash,
      c.stage, c.content_hash AS approved_hash
    FROM vault.documents d LEFT JOIN LATERAL (
      SELECT stage, content_hash FROM canonical_documents WHERE organization_id = $1
        AND source_refs->'vault_documents'->>'nativeId' = d.id::text ORDER BY created_at, canonical_id LIMIT 1
    ) c ON TRUE
    WHERE d.organization_id = $1 AND d.program_id = $2 AND d.deleted_at IS NULL
      AND lower(d.file_name) LIKE '%.json' AND d.mime_type IN ('application/json', 'text/plain')
      AND NOT ${supersededSql('d')} AND ${vaultDataEligibleSql('d')} AND ${vaultBinaryAvailableSql('d')}
    ORDER BY d.created_at DESC, d.id LIMIT 101`, [scope.organizationId, scope.programId]);
  return { format: CSR_SOURCE_FORMAT, limitReached: rows.length > 100, sources: rows.slice(0, 100).map(row => ({
    documentId: String(row.document_id), documentTitle: String(row.document_title), version: String(row.version ?? ''),
    sha256: String(row.content_hash ?? ''), approved: typeof row.stage === 'string' && (STEADY_STAGES as readonly string[]).includes(row.stage)
      && typeof row.content_hash === 'string' && row.approved_hash === row.content_hash,
  })) };
}

async function defaultReadBytes(row: SourceRow, organizationId: number): Promise<Buffer> {
  const { readVerifiedVaultBytes } = await import('../../routes/c2c/project-vault.js');
  const result = await readVerifiedVaultBytes({ organizationId, storageVersionId: row.storage_version_id,
    storageProvider: row.storage_provider, storageKey: row.s3_key }, row.content_hash, row.id);
  if (!result.ok) throw new CsrSourceInputError(409, result.error, 'The exact source bytes are unavailable or failed their integrity check. Choose an intact current Vault source.');
  return result.bytes;
}

function parseSourceEnvelope(bytes: Buffer, expectedHash: string): CsrSourceEnvelope {
  if (bytes.length > MAX_SOURCE_BYTES) throw new CsrSourceInputError(413, 'CSR_SOURCE_TOO_LARGE', 'CSR supporting-source JSON is limited to 5 MiB.');
  if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw new CsrSourceInputError(409, 'CSR_SOURCE_INTEGRITY_FAILED', 'The stored source bytes no longer match their recorded digest. No tables were saved.');
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new CsrSourceInputError(422, 'CSR_SOURCE_JSON_INVALID', 'The source is not valid UTF-8 JSON.'); }
  const parsed = CsrSourceEnvelopeSchema.safeParse(raw);
  if (!parsed.success) throw new CsrSourceInputError(422, 'CSR_SOURCE_INPUTS_INVALID', 'The source does not meet the documented CSR input contract. No tables were saved.',
    parsed.error.issues.slice(0, 30).map(issue => ({ path: issue.path.join('.'),
      // Zod enum/unknown-key messages include uploaded values. Only our fixed
      // cross-record messages and canonical field/index paths may leave here.
      message: issue.code === 'custom' ? issue.message : issue.code === 'unrecognized_keys'
        ? 'Unexpected source fields. Use only documented field names.'
        : 'Invalid or missing source value. Check the documented field type and bounds.',
    })));
  return parsed.data;
}

function hasCanonicalSourceApproval(record: Record<string, unknown> | undefined, contentHash: string): boolean {
  return !!record && typeof record.stage === 'string' && (STEADY_STAGES as readonly string[]).includes(record.stage)
    && record.content_hash === contentHash;
}

async function load(q: RequestSqlClient, scope: CsrSourceScope, selection: CsrSourceSelection, requireApproval: boolean,
  deps: CsrSourceInputDeps): Promise<LoadedCsrSource> {
  await authorizeCsrSourceProgram(q, scope, requireApproval);
  await lockDocumentDispositionProgram(q, scope.organizationId, scope.programId);
  const { rows } = await q.query(`SELECT d.id::text, d.document_title, d.version, d.content_hash, d.file_name, d.mime_type,
      d.storage_version_id, d.storage_provider, d.s3_key, d.file_size
    FROM vault.documents d WHERE d.id = $1 AND d.organization_id = $2 AND d.program_id = $3 AND d.deleted_at IS NULL
      AND ${vaultDataEligibleSql('d')} AND ${vaultBinaryAvailableSql('d')} FOR SHARE OF d`,
  [selection.documentId, scope.organizationId, scope.programId]);
  if (rows.length !== 1) throw new CsrSourceInputError(404, 'CSR_SOURCE_NOT_FOUND', 'This source is not available in the selected project.');
  const row = rows[0] as SourceRow;
  if (!/^[a-f0-9]{64}$/.test(row.content_hash) || row.content_hash !== selection.expectedSha256) {
    throw new CsrSourceInputError(409, 'CSR_SOURCE_CHANGED', 'The selected source no longer matches its preview. Refresh and preview its current version.');
  }
  // A separate statement after acquiring the predecessor share lock sees a
  // check-in which committed while this request waited for that lock.
  const current = await q.query(`SELECT NOT ${supersededSql('d')} AS current FROM vault.documents d
    WHERE d.id=$1 AND d.organization_id=$2 AND d.program_id=$3 AND d.deleted_at IS NULL`, [selection.documentId, scope.organizationId, scope.programId]);
  if (current.rows[0]?.current !== true) throw new CsrSourceInputError(409, 'CSR_SOURCE_SUPERSEDED', 'Choose the current Vault version and preview it again.');
  if (!/\.json$/i.test(row.file_name) || !['application/json', 'text/plain'].includes(row.mime_type)) {
    throw new CsrSourceInputError(422, 'CSR_SOURCE_FORMAT_REQUIRED', 'Choose a JSON file using the documented CSR supporting-source contract.');
  }
  if (Number(row.file_size) > MAX_SOURCE_BYTES) throw new CsrSourceInputError(413, 'CSR_SOURCE_TOO_LARGE', 'CSR supporting-source JSON is limited to 5 MiB.');
  const lifecycle = await q.query(`SELECT canonical_id, stage, content_hash FROM canonical_documents WHERE organization_id=$1
    AND source_refs->'vault_documents'->>'nativeId'=$2 ORDER BY created_at, canonical_id LIMIT 1 FOR SHARE`, [scope.organizationId, row.id]);
  const record = lifecycle.rows[0];
  const approved = hasCanonicalSourceApproval(record, row.content_hash);
  if (requireApproval && !approved) throw new CsrSourceInputError(409, 'CSR_SOURCE_APPROVAL_REQUIRED', 'Approve this exact current source version through the Vault lifecycle before including its tables in a package run.');
  const bytes = await deps.readBytes(row, scope.organizationId);
  const envelope = parseSourceEnvelope(bytes, row.content_hash);
  return { approved, envelope, tables: buildCSRTables(envelope.studyData), source: {
    adapter: CSR_SOURCE_FORMAT, documentId: row.id, documentTitle: row.document_title, version: row.version ?? '', sha256: row.content_hash,
    dataCutDate: envelope.dataCutDate, studyId: envelope.studyData.studyId, protocolNumber: envelope.studyData.protocolNumber,
    studyInfo: envelope.studyInfo, clinicalVerification: 'not-established', sourceApproval: approved ? 'canonical-lifecycle' : 'not-approved',
  } };
}

/** The callback releases source/disposition locks only after the orchestrator
 * has durably captured its sealed original inputs, before unrelated build work.
 * A failed capture releases nothing until rollback, and cannot start composers. */
export interface CsrVaultSourceConsumption<T> {
  requireApproval: boolean;
  consume: (loaded: LoadedCsrSource, inputsCaptured: () => Promise<void>) => Promise<T>;
  deps?: CsrSourceInputDeps;
}

export async function withCsrVaultSource<T>(connectable: RequestConnectable, scope: CsrSourceScope, selection: CsrSourceSelection,
  options: CsrVaultSourceConsumption<T>): Promise<T> {
  const { requireApproval, consume, deps = { readBytes: defaultReadBytes } } = options;
  const client = await connectable.connect();
  let open = false;
  try {
    await client.query('BEGIN'); open = true;
    await setTenantContextTx(client, scope.organizationId);
    const loaded = await load(client, scope, selection, requireApproval, deps);
    const inputsCaptured = async () => { if (open) { await client.query('COMMIT'); open = false; } };
    const result = await consume(loaded, inputsCaptured);
    await inputsCaptured();
    return result;
  } catch (error) {
    if (open) { try { await client.query('ROLLBACK'); } catch { /* preserve original refusal */ } }
    throw error;
  } finally { client.release(); }
}

export const previewCsrVaultSource = (connectable: RequestConnectable, scope: CsrSourceScope, selection: CsrSourceSelection, deps?: CsrSourceInputDeps) =>
  withCsrVaultSource(connectable, scope, selection, { requireApproval: false,
    consume: async loaded => ({ source: loaded.source, approved: loaded.approved, tables: loaded.tables }), deps });
