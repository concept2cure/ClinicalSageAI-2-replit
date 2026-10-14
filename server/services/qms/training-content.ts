import {
  QMS_TRAINABLE_DOCUMENT_TYPES, QMS_TRAINING_DECLARATION,
  qmsTrainingAcknowledgementSchema, qmsTrainingContextSchema,
  type QmsTrainingAcknowledgement, type QmsTrainingContext, type QmsTrainingSection,
} from '../../../shared/qms/training';
import { computeQmsDocumentContentDigest, type QmsDocumentRow } from './document-approval-signature';

export function trainingObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function releasedSections(value: unknown): QmsTrainingSection[] {
  if (!Array.isArray(value) || !value.length) return [];
  const result: QmsTrainingSection[] = [];
  const keys = new Set<string>();
  for (const candidate of value) {
    const section = trainingObject(candidate);
    if (typeof section.key !== 'string' || !section.key.trim() || keys.has(section.key)) return [];
    if (typeof section.body !== 'string' || !section.body.trim()) return [];
    keys.add(section.key);
    result.push({ key: section.key, label: typeof section.label === 'string' && section.label.trim() ? section.label : section.key, body: section.body });
  }
  return result;
}

function verifiedApproval(document: QmsDocumentRow, approval: Record<string, unknown>, now: Date): boolean {
  if (!Number.isSafeInteger(document.approver_id) || Number(document.approver_id) <= 0 || !document.approved_at) return false;
  const approvedAt = new Date(document.approved_at).getTime();
  return Number.isFinite(approvedAt) && approvedAt <= now.getTime() &&
    approval.meaning === 'APPROVED' && approval.bindingBasis === 'qms-document-version-content-sha256';
}

/** Only recorded, digest-bound inline text is a readable released procedure. */
export function describeQmsTrainingDocument(document: QmsDocumentRow, now = new Date()): QmsTrainingContext {
  const metadata = trainingObject(document.metadata);
  const sections = releasedSections(metadata.sections);
  const approval = trainingObject(metadata.approval);
  const digest = computeQmsDocumentContentDigest(document);
  let reason: string | null = null;
  if (document.deleted_at || document.status !== 'effective') reason = 'Only an effective controlled document can be acknowledged.';
  else if (!(QMS_TRAINABLE_DOCUMENT_TYPES as readonly string[]).includes(document.doc_type)) reason = 'This document type is not controlled read-and-understood training.';
  else if (document.effective_date && String(document.effective_date instanceof Date ? document.effective_date.toISOString() : document.effective_date).slice(0, 10) > now.toISOString().slice(0, 10)) reason = 'This revision is not effective yet.';
  else if (!sections.length) reason = 'Released procedure text is unavailable. An outline, hint or artifact link cannot be acknowledged.';
  else if (!verifiedApproval(document, approval, now)) reason = 'The released revision does not carry a verifiable approval record.';
  else if (approval.contentDigest !== digest) reason = 'The released content could not be verified against its approval.';
  return qmsTrainingContextSchema.parse({
    documentId: document.id, docNumber: document.doc_number, title: document.title,
    documentVersion: document.version, status: document.status, contentDigest: digest,
    eligible: reason === null, unavailableReason: reason, sections, acknowledgement: null,
  });
}

function iso(value: unknown): string {
  return new Date(value as string | Date).toISOString();
}

/** Legacy/unbound, expired, trainer and quiz records stay history, not current receipts. */
export function verifiedTrainingReceipt(row: Record<string, unknown>, now = new Date()): QmsTrainingAcknowledgement | null {
  const metadata = trainingObject(row.metadata);
  const snapshot = receiptSnapshot(row, metadata);
  if (!snapshot) return null;
  try {
    const context = describeQmsTrainingDocument(snapshot as QmsDocumentRow, now);
    if (!context.eligible || context.contentDigest !== metadata.contentDigest) return null;
    const result = qmsTrainingAcknowledgementSchema.safeParse({
      id: row.id, documentId: row.document_id, userId: row.user_id,
      documentVersion: row.document_version, contentDigest: metadata.contentDigest,
      acknowledgedAt: iso(row.acknowledged_at), expiresAt: row.expires_at == null ? null : iso(row.expires_at), method: row.acknowledgment_method,
    });
    if (!result.success || new Date(result.data.acknowledgedAt) > now || (result.data.expiresAt && new Date(result.data.expiresAt) <= now)) return null;
    return result.data;
  } catch { return null; }
}

function receiptSnapshot(row: Record<string, unknown>, metadata: Record<string, unknown>) {
  if (metadata.declaration !== QMS_TRAINING_DECLARATION || metadata.bindingBasis !== 'qms-document-version-content-sha256') return null;
  if (row.acknowledgment_method !== 'attestation' || row.trainer_id != null || row.quiz_score != null) return null;
  const snapshot = trainingObject(metadata.documentSnapshot);
  return snapshot.id === row.document_id && snapshot.organization_id === row.organization_id && snapshot.version === row.document_version ? snapshot : null;
}
