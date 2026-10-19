/** Immutable V2 metadata append. Caller owns canonical source/actor admission,
 * the transaction and COMMIT; this helper acknowledges no provider delivery. */
import {
  validateSourceAdmissionReceiptV2, fingerprintSourceAdmissionReceiptV2, canonicalSourceAdmissionReceiptV2,
  type SourceAdmissionReceiptV2,
} from '../../../shared/ana/source-admission-receipts.js';

export interface SourceAdmissionReceiptQueryable {
  query(sql: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
}
export interface SourceAdmissionReceiptAppendResult {
  readonly receiptId: string;
  readonly outcome: 'recorded' | 'already_recorded';
}
export class SourceAdmissionReceiptStoreError extends Error {
  constructor(readonly status: 400 | 409 | 503, readonly code: string, message: string) {
    super(message); this.name = 'SourceAdmissionReceiptStoreError';
  }
}
const COLUMNS = `id, organization_id, receipt_version, checkpoint, actor_user_id, admitted_role,
  program_id, document_id, original_sha256, extraction_sha256, total_chars, ranges,
  payload_sha256, tool_use_id, thread_id, receipt_sha256`;
const INSERT = `INSERT INTO public.ana_source_read_receipts (${COLUMNS})
  VALUES ($1::uuid,$2,$3,$4,$5,$6,$7::uuid,$8::uuid,$9,$10,$11,$12::jsonb,$13,$14,$15,$16)
  ON CONFLICT (id) DO NOTHING RETURNING ${COLUMNS}`;
function invalid(): never {
  throw new SourceAdmissionReceiptStoreError(400, 'ANA_ADMISSION_RECEIPT_INVALID', 'The source admission receipt metadata is invalid. No receipt was acknowledged.');
}
function unconfirmed(): never {
  throw new SourceAdmissionReceiptStoreError(503, 'ANA_ADMISSION_RECEIPT_UNCONFIRMED', 'Source admission receipt persistence could not be confirmed. No new receipt was acknowledged.');
}
function conflict(): never {
  throw new SourceAdmissionReceiptStoreError(409, 'ANA_ADMISSION_RECEIPT_CONFLICT', 'This source admission identity cannot be reused for the supplied metadata. No new receipt was acknowledged.');
}
function copyDescriptor(input: unknown): SourceAdmissionReceiptV2 {
  try { return validateSourceAdmissionReceiptV2(input); } catch { return invalid(); }
}
function descriptorFromRow(row: Record<string, unknown>): SourceAdmissionReceiptV2 {
  return validateSourceAdmissionReceiptV2({ version: row.receipt_version, receiptId: row.id,
    checkpoint: row.checkpoint, organizationId: row.organization_id, actorId: row.actor_user_id,
    admittedRole: row.admitted_role, programId: row.program_id, documentId: row.document_id,
    originalSha256: row.original_sha256, extractionSha256: row.extraction_sha256, totalChars: row.total_chars,
    ranges: row.ranges, payloadSha256: row.payload_sha256, toolUseId: row.tool_use_id, threadId: row.thread_id });
}
/** Strict projection used by append confirmation and actor-only history.
 * Fields are copied before Web Crypto awaits; a mutated returned row cannot
 * rewrite an admitted descriptor. Source/range hashes are metadata, not text. */
export async function readSourceAdmissionReceiptRow(row: Record<string, unknown>): Promise<{
  readonly descriptor: SourceAdmissionReceiptV2; readonly receiptSha256: string;
}> {
  try {
    const descriptor = descriptorFromRow(row);
    const storedFingerprint = row.receipt_sha256;
    if (typeof storedFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(storedFingerprint)) return unconfirmed();
    const fingerprint = await fingerprintSourceAdmissionReceiptV2(descriptor);
    if (fingerprint !== storedFingerprint) return unconfirmed();
    return Object.freeze({ descriptor, receiptSha256: storedFingerprint });
  } catch (error) {
    if (error instanceof SourceAdmissionReceiptStoreError) throw error;
    return unconfirmed();
  }
}
function valuesOf(d: SourceAdmissionReceiptV2, fingerprint: string): unknown[] {
  return [d.receiptId, d.organizationId, d.version, d.checkpoint, d.actorId, d.admittedRole,
    d.programId, d.documentId, d.originalSha256, d.extractionSha256, d.totalChars, JSON.stringify(d.ranges),
    d.payloadSha256, d.toolUseId, d.threadId, fingerprint];
}
async function confirmRow(row: Record<string, unknown>, descriptor: SourceAdmissionReceiptV2,
  fingerprint: string, idempotent: boolean): Promise<void> {
  const stored = await readSourceAdmissionReceiptRow(row);
  if (stored.receiptSha256 !== fingerprint ||
      canonicalSourceAdmissionReceiptV2(stored.descriptor) !== canonicalSourceAdmissionReceiptV2(descriptor)) {
    if (idempotent) conflict();
    unconfirmed();
  }
}
/** Stable identity retry never updates an existing row. Exactly one real
 * INSERT RETURNING is required for 'recorded'; identical visible lookup is
 * required for 'already_recorded'. Caller must still confirm COMMIT. */
export async function appendSourceAdmissionReceipt(q: SourceAdmissionReceiptQueryable, input: unknown): Promise<SourceAdmissionReceiptAppendResult> {
  const descriptor = copyDescriptor(input);
  try {
    const fingerprint = await fingerprintSourceAdmissionReceiptV2(descriptor);
    const saved = await q.query(INSERT, valuesOf(descriptor, fingerprint));
    if (saved.rowCount === 1 && saved.rows.length === 1) {
      await confirmRow(saved.rows[0], descriptor, fingerprint, false);
      return Object.freeze({ receiptId: descriptor.receiptId, outcome: 'recorded' as const });
    }
    if (saved.rowCount !== 0 || saved.rows.length !== 0) return unconfirmed();
    // Tenant+actor predicates prevent an inaccessible ID conflict from
    // disclosing another actor's serving context, source or fingerprint.
    const existing = await q.query(`SELECT ${COLUMNS} FROM public.ana_source_read_receipts
      WHERE id=$1::uuid AND organization_id=$2 AND actor_user_id=$3`,
    [descriptor.receiptId, descriptor.organizationId, descriptor.actorId]);
    if (existing.rows.length === 0) return conflict();
    if (existing.rows.length !== 1 || (existing.rowCount != null && existing.rowCount !== 1)) return unconfirmed();
    await confirmRow(existing.rows[0], descriptor, fingerprint, true);
    return Object.freeze({ receiptId: descriptor.receiptId, outcome: 'already_recorded' as const });
  } catch (error) {
    if (error instanceof SourceAdmissionReceiptStoreError) throw error;
    return unconfirmed();
  }
}
