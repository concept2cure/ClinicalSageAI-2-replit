/** Read the exact retained approval signature, never infer it from a stamp. */
import { isSignatureWithdrawn, manifestSignatureHash } from '../part11/signature-persistence';
import { computeQmsDocumentContentDigest, QMS_DOCUMENT_BINDING_BASIS, type QmsDocumentRow } from './document-approval-signature';
import type { TrainingSqlClient } from './training';
import { describeQmsTrainingDocument } from './training-content';

type ApprovalState = 'valid' | 'withdrawn' | 'changed' | 'unverified' | 'unavailable';
export interface CurrentQmsReleaseApproval { state: ApprovalState; signatureId: number | null; reason: string | null }
const unverified = (): CurrentQmsReleaseApproval => ({ state: 'unverified', signatureId: null,
  reason: 'The exact recorded approval signature for this release could not be verified.' });
const unavailable = (): CurrentQmsReleaseApproval => ({ state: 'unavailable', signatureId: null,
  reason: 'The current approval signature could not be checked. Training is unavailable until it can be verified.' });

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function instant(value: unknown): string | null {
  if (!(typeof value === 'string' || value instanceof Date)) return null;
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

function recordedApprovalInstant(document: QmsDocumentRow): string | null {
  const at = instant(document.approved_at);
  const approval = record(record(document.metadata)?.approval);
  return at && approval && Number.isSafeInteger(document.approver_id) && Number(document.approver_id) > 0
    && approval.by === document.approver_id && instant(approval.at) === at ? at : null;
}

function exactManifest(row: Record<string, unknown>, document: QmsDocumentRow, at: string): boolean {
  const manifest = record(row.signature_manifest);
  if (!manifest) return false;
  const matches = [[manifest.kind, 'governed-sign'], [manifest.command, 'approve'],
    [manifest.target, `qms-document:${document.id}`], [manifest.organizationId, document.organization_id],
    [manifest.signerId, document.approver_id], [row.signer_id, document.approver_id],
    [manifest.signerName, row.signer_name], [manifest.signerEmail, row.signer_email],
    [manifest.meaning, 'APPROVED'], [row.signature_meaning, manifest.meaning],
    [manifest.reason, row.signature_purpose], [manifest.bindingBasis, QMS_DOCUMENT_BINDING_BASIS],
    [row.binding_basis, manifest.bindingBasis], [row.bound_payload_digest, manifest.boundPayloadDigest],
    [manifest.docNumber, document.doc_number], [manifest.version, document.version],
    [instant(manifest.signedAt), at], [instant(row.signed_at), at],
  ].every(([actual, expected]) => actual === expected);
  return matches && typeof row.signature_hash === 'string'
    && manifestSignatureHash(manifest) === row.signature_hash
    && typeof row.bound_payload_digest === 'string' && /^[a-f0-9]{64}$/.test(row.bound_payload_digest);
}

function exactSignatureRow(row: Record<string, unknown>, document: QmsDocumentRow, at: string): boolean {
  return Number.isSafeInteger(row.id) && Number(row.id) > 0
    && row.organization_id === document.organization_id && row.signed_target === `qms-document:${document.id}`
    && row.signature_type === 'qms-document-approval' && exactManifest(row, document, at);
}

/** `lock` holds the exact signature through the caller's receipt transaction. */
export async function readCurrentQmsReleaseApproval(client: TrainingSqlClient, document: QmsDocumentRow,
  options: { lock?: boolean } = {}): Promise<CurrentQmsReleaseApproval> {
  const at = recordedApprovalInstant(document);
  if (!at) return unverified();
  try {
    const statement = options.lock
      ? `SELECT id,organization_id,signed_target,signature_type,signer_id,signer_name,signer_email,signed_at,
          signature_meaning,signature_purpose,signature_manifest,signature_hash,binding_basis,bound_payload_digest,
          is_valid,superseded_by,verification_status
         FROM electronic_signatures WHERE organization_id=$1 AND signed_target=$2
          AND signature_type='qms-document-approval' AND signer_id=$3 AND signed_at=$4::timestamptz
         ORDER BY id FOR SHARE`
      : `SELECT id,organization_id,signed_target,signature_type,signer_id,signer_name,signer_email,signed_at,
          signature_meaning,signature_purpose,signature_manifest,signature_hash,binding_basis,bound_payload_digest,
          is_valid,superseded_by,verification_status
         FROM electronic_signatures WHERE organization_id=$1 AND signed_target=$2
          AND signature_type='qms-document-approval' AND signer_id=$3 AND signed_at=$4::timestamptz ORDER BY id`;
    const { rows } = await client.query(statement,
      [document.organization_id, `qms-document:${document.id}`, document.approver_id, at]);
    if (rows.length !== 1) return unverified();
    const row = rows[0];
    if (!exactSignatureRow(row, document, at)) return unverified();
    const signatureId = Number(row.id);
    if (isSignatureWithdrawn(row)) return { state: 'withdrawn', signatureId,
      reason: 'The approval signature for this release has been withdrawn. This revision cannot be acknowledged as a current release.' };
    if (row.bound_payload_digest !== computeQmsDocumentContentDigest(document)) return { state: 'changed', signatureId,
      reason: 'This controlled text no longer matches its recorded approval signature.' };
    return { state: 'valid', signatureId, reason: null };
  } catch (error) {
    console.error('[qms-training] release approval unavailable:', error instanceof Error ? error.message : error);
    return unavailable();
  }
}

export async function readQmsTrainingReleaseContext(client: TrainingSqlClient, document: QmsDocumentRow,
  now = new Date(), options: { lock?: boolean } = {}) {
  const context = describeQmsTrainingDocument(document, now);
  if (!context.eligible) return { context, approval: null };
  const approval = await readCurrentQmsReleaseApproval(client, document, options);
  return { context: approval.state === 'valid' ? context : { ...context, eligible: false, unavailableReason: approval.reason }, approval };
}
