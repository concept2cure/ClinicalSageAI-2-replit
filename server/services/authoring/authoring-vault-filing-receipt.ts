/** Read the retained Authoring → Vault derivation without aliasing identities
 * or reading today's editable source. The caller supplies verified Vault bytes. */
import { isCanonicalId } from '../../../shared/regulatory/canonical-document';
import { hashPayload, type PoolClient } from '../audit/chain';
import { verifySequencedRow, type SequencedRowInput } from '../audit/chain-row';

export type VaultFilingDerivation =
  | { status: 'recorded'; vaultDocumentId: string; programId: string; artifactSha256: string;
      source: { store: 'authoring_documents'; nativeId: string; version: string | null; sectionsSha256: string | null };
      receipt: { id: string; exportCorrelationId: string | null; occurredAt: string; chain: 'linked'; seal: 'valid' | 'no-key' } }
  | { status: 'not-recorded' }
  | { status: 'unverified'; reason: 'context_invalid' | 'candidate_ambiguous' | 'receipt_malformed' |
      'scope_mismatch' | 'artifact_mismatch' | 'payload_mismatch' | 'chain_unverified' | 'seal_unverified' }
  | { status: 'unavailable'; reason: 'relation_absent' | 'read_failed' };

interface FilingContext { organizationId: number; programId: string; vaultDocumentId: string; artifactSha256: string }
interface ReceiptHeader { id: string; sourceId: string; occurredAt: string; chain: SequencedRowInput }
const ACTION = 'authoring.document.file_to_vault';
const SHA256 = /^[a-f0-9]{64}$/i;
const unverified = (reason: Extract<VaultFilingDerivation, { status: 'unverified' }>['reason']): VaultFilingDerivation =>
  ({ status: 'unverified', reason });

function matchesId(value: unknown, expected: string): boolean {
  return typeof value === 'string' && isCanonicalId(value) && value.toLowerCase() === expected.toLowerCase();
}

function timestamp(value: unknown): string | null {
  if (!(value instanceof Date) && typeof value !== 'string') return null;
  const at = new Date(value);
  return Number.isFinite(at.getTime()) ? at.toISOString() : null;
}

function sequence(value: unknown): SequencedRowInput['chain_seq'] | undefined {
  if (value == null) return null;
  if (typeof value === 'bigint') return value > 0n ? value : undefined;
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) ? value : undefined;
}

function receiptHeader(row: Record<string, unknown>, context: FilingContext): ReceiptHeader | null {
  const ids = [row.id, row.record_id];
  if (!ids.every((id): id is string => typeof id === 'string' && isCanonicalId(id))) return null;
  const [id, sourceId] = ids;
  const occurredAt = timestamp(row.occurred_at);
  const chainSeq = sequence(row.chain_seq);
  const actor = row.actor_id == null ? null : Number(row.actor_id);
  if (actor !== null && (!Number.isSafeInteger(actor) || actor <= 0)) return null;
  if (Number(row.tenant_id) !== context.organizationId || row.action !== ACTION ||
      row.table_name !== 'authoring_document' || row.target !== `authoring_document:${sourceId}` ||
      !occurredAt || chainSeq === undefined) return null;
  const hashes = [row.payload_hash, row.sha256_chain];
  if (!hashes.every((hash): hash is string => typeof hash === 'string' && SHA256.test(hash))) return null;
  if (row.hmac_seal != null && typeof row.hmac_seal !== 'string') return null;
  return { id, sourceId, occurredAt, chain: { action: ACTION, actor_id: actor, target: String(row.target),
    payload_hash: hashes[0], sha256_chain: hashes[1], occurred_at: occurredAt,
    tenant_id: context.organizationId, chain_seq: chainSeq, hmac_seal: row.hmac_seal as string | null } };
}

/** These values were not in older filing receipts. Missing stays unknown;
 * sectionsSha256 is the existing section recipe, not a full header snapshot.
 * exportId in the retained payload is a correlation UUID, not an export-history row ID. */
function sourceSnapshot(payload: Record<string, unknown>) {
  const { sourceVersion: version, sourceSectionsSha256: digest, exportId } = payload;
  if (version != null && (typeof version !== 'string' || !version.trim())) return null;
  if (digest != null && (typeof digest !== 'string' || !SHA256.test(digest))) return null;
  if (exportId != null && (typeof exportId !== 'string' || !isCanonicalId(exportId))) return null;
  return { version: version as string | null | undefined ?? null,
    sectionsSha256: digest as string | null | undefined ?? null,
    exportId: exportId as string | null | undefined ?? null };
}

async function projectReceipt(q: PoolClient, row: Record<string, unknown>, context: FilingContext): Promise<VaultFilingDerivation> {
  const header = receiptHeader(row, context);
  if (!header || !row.new_values || typeof row.new_values !== 'object' || Array.isArray(row.new_values)) return unverified('receipt_malformed');
  const payload = row.new_values as Record<string, unknown>;
  if (hashPayload(payload) !== header.chain.payload_hash) return unverified('payload_mismatch');
  if (!matchesId(payload.vaultDocumentId, context.vaultDocumentId) || !matchesId(payload.programId, context.programId)) return unverified('scope_mismatch');
  if (typeof payload.artifactSha256 !== 'string' || payload.artifactSha256.toLowerCase() !== context.artifactSha256.toLowerCase()) return unverified('artifact_mismatch');
  const snapshot = sourceSnapshot(payload);
  if (!snapshot) return unverified('receipt_malformed');
  const verdict = await verifySequencedRow(q, header.chain);
  if (verdict.link !== 'linked') return unverified('chain_unverified');
  if (verdict.seal !== 'valid' && verdict.seal !== 'no-key') return unverified('seal_unverified');
  return { status: 'recorded', vaultDocumentId: context.vaultDocumentId.toLowerCase(),
    programId: context.programId.toLowerCase(), artifactSha256: context.artifactSha256.toLowerCase(),
    source: { store: 'authoring_documents', nativeId: header.sourceId.toLowerCase(),
      version: snapshot.version, sectionsSha256: snapshot.sectionsSha256 },
    receipt: { id: header.id, exportCorrelationId: snapshot.exportId, occurredAt: header.occurredAt, chain: 'linked', seal: verdict.seal } };
}

/** Exactly one scoped candidate is required. Never select a source by date,
 * document-code text or current editable content; never smooth a failed read
 * into an empty source history. No-key is recorded, not called HMAC proof. */
export async function readAuthoringVaultFilingReceipt(q: PoolClient, context: FilingContext): Promise<VaultFilingDerivation> {
  if (!Number.isSafeInteger(context.organizationId) || context.organizationId <= 0 ||
      !isCanonicalId(context.programId) || !isCanonicalId(context.vaultDocumentId) || !SHA256.test(context.artifactSha256)) {
    return unverified('context_invalid');
  }
  try {
    const { rows } = await q.query(
      `SELECT id::text AS id, tenant_id, action, table_name, record_id, actor_id, target,
         payload_hash, sha256_chain, occurred_at, hmac_seal, chain_seq, new_values
         FROM audit_logs WHERE tenant_id = $1 AND action = $2
           AND lower(new_values->>'vaultDocumentId') = $3 LIMIT 2`,
      [context.organizationId, ACTION, context.vaultDocumentId.toLowerCase()],
    );
    if (rows.length === 0) return { status: 'not-recorded' };
    if (rows.length !== 1) return unverified('candidate_ambiguous');
    return await projectReceipt(q, rows[0], context);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    return { status: 'unavailable', reason: code === '42P01' ? 'relation_absent' : 'read_failed' };
  }
}
