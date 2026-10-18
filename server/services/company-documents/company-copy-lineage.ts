/** Immutable ingest provenance follows explicit copied originals, including a
 * Vault copy whose later, separate library registration was refused. */
import { z } from 'zod';
import type { CompanyLegalDocument } from '../../../shared/company-documents';
import type { CompanyLegalOriginalSource } from '../../../shared/company-legal-workflows';
import type { RequestSqlClient } from '../../db/requestDb';
import { readCompanyLegalRegistryForVault } from './legal-registry';
import { CompanyDocumentsError } from './validation';

interface CopyIdentity { organizationId: number; vaultDocumentId: string; contentHash: string }
interface ResolvedSource { ref: CompanyLegalOriginalSource; records: CompanyLegalDocument[] }
const sourceSchema = z.object({ registryId: z.string().min(1).max(200), vaultDocumentId: z.string().uuid(), contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  programId: z.string().uuid().nullable(), version: z.string().min(1).max(100).nullable(), copiedHash: z.string().regex(/^[a-f0-9]{64}$/i) }).strict();
const UNKNOWN = 'The immutable source of this copied company legal document could not be verified. Review its original before filing.';
const WITHDRAWN = 'A source original for this company legal copy was revoked or has an invalid signature finding. Review a new original before filing.';
function unverified(): never { throw new CompanyDocumentsError(409, 'COMPANY_LEGAL_COPY_SOURCE_UNVERIFIED', UNKNOWN); }
function sourceKey(ref: CompanyLegalOriginalSource): string {
  return JSON.stringify([ref.registryId, ref.vaultDocumentId.toLowerCase(), ref.programId.toLowerCase(), ref.version, ref.contentHash.toLowerCase()]);
}
function exactSource(row: Record<string, unknown>, records: CompanyLegalDocument[], copiedHash: string): ResolvedSource {
  const parsed = sourceSchema.safeParse(row);
  if (!parsed.success) return unverified();
  const claimed = parsed.data;
  if (claimed.copiedHash.toLowerCase() !== copiedHash.toLowerCase() || claimed.contentHash.toLowerCase() !== copiedHash.toLowerCase()) return unverified();
  const document = records.find(item => item.id === claimed.registryId && item.vaultDocumentId.toLowerCase() === claimed.vaultDocumentId.toLowerCase() && item.contentHash.toLowerCase() === claimed.contentHash.toLowerCase());
  if (!document) return unverified();
  if (claimed.programId && claimed.programId.toLowerCase() !== document.programId.toLowerCase()) return unverified();
  if (claimed.version && claimed.version !== document.version) return unverified();
  return { ref: { registryId: document.id, vaultDocumentId: document.vaultDocumentId, programId: document.programId, version: document.version, contentHash: document.contentHash }, records };
}
async function resolvedCopySources(q: RequestSqlClient, input: CopyIdentity): Promise<ResolvedSource[]> {
  const currentRecords = await readCompanyLegalRegistryForVault(q, input.organizationId, input.vaultDocumentId);
  const knownParents = currentRecords.flatMap(document => document.sourceOriginal ? [document.sourceOriginal] : []);
  const { rows } = await q.query(`SELECT DISTINCT
      new_values::jsonb->'companyLegalSource'->>'registryId' AS "registryId",
      new_values::jsonb->'companyLegalSource'->>'vaultDocumentId' AS "vaultDocumentId",
      new_values::jsonb->'companyLegalSource'->>'contentHash' AS "contentHash",
      new_values::jsonb->'companyLegalSource'->>'programId' AS "programId",
      new_values::jsonb->'companyLegalSource'->>'version' AS version,
      new_values::jsonb->>'contentHash' AS "copiedHash"
    FROM audit_logs WHERE tenant_id=$1 AND table_name='vault_document' AND record_id=$2
      AND action IN ('vault.document.ingest','vault.document.reupload') AND new_values::jsonb ? 'companyLegalSource'`, [input.organizationId, input.vaultDocumentId.toLowerCase()]);
  const refs = new Map<string, ResolvedSource>();
  for (const row of rows) {
    if (typeof row.vaultDocumentId !== 'string') return unverified();
    const records = await readCompanyLegalRegistryForVault(q, input.organizationId, row.vaultDocumentId);
    const source = exactSource(row, records, input.contentHash);
    const original = await q.query(`SELECT program_id::text AS program_id,content_hash,version FROM vault.documents
      WHERE id=$1::uuid AND organization_id=$2 AND deleted_at IS NULL`, [source.ref.vaultDocumentId, input.organizationId]);
    const identity = original.rows[0];
    if (!identity || String(identity.program_id).toLowerCase() !== source.ref.programId.toLowerCase() ||
      String(identity.content_hash).toLowerCase() !== source.ref.contentHash.toLowerCase() || identity.version !== source.ref.version) return unverified();
    refs.set(sourceKey(source.ref), source);
  }
  if (refs.size > 1) return unverified();
  for (const known of knownParents) {
    const resolved = [...refs.values()][0]?.ref;
    if (!resolved || sourceKey(known) !== sourceKey(resolved)) return unverified();
  }
  return [...refs.values()];
}
/** Zero or one unique, verified parent. Conflicting parent claims fail closed. */
export async function readCompanyLegalCopySources(q: RequestSqlClient, input: CopyIdentity): Promise<CompanyLegalOriginalSource[]> {
  return (await resolvedCopySources(q, input)).map(source => source.ref);
}
function sourceWithdrawn(records: CompanyLegalDocument[]): boolean {
  return records.some(document => Boolean(document.workflow?.revokedAt) || document.workflow?.signatureEvidence?.result === 'invalid');
}
/** Only source withdrawal/invalidity propagates. Approval never travels with a
 * copy: the canonical Vault gate still requires this copy's own approval. */
export async function companyLegalCopySourceRefusal(q: RequestSqlClient, input: CopyIdentity): Promise<string | null> {
  try {
    const seen = new Set<string>();
    let current = input;
    for (let depth = 0; depth < 32; depth++) {
      const key = current.vaultDocumentId.toLowerCase();
      if (seen.has(key)) return UNKNOWN;
      seen.add(key);
      const sources = await resolvedCopySources(q, current);
      if (!sources.length) return null;
      const source = sources[0];
      if (sourceWithdrawn(source.records)) return WITHDRAWN;
      current = { organizationId: input.organizationId, vaultDocumentId: source.ref.vaultDocumentId, contentHash: source.ref.contentHash };
    }
    return UNKNOWN;
  } catch { return UNKNOWN; }
}
