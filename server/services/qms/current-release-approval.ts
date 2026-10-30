/** Read the exact retained approval signature, never infer it from a stamp. */
import { isSignatureWithdrawn, manifestSignatureHash } from '../part11/signature-persistence';
import { computeQmsDocumentContentDigest, QMS_DOCUMENT_BINDING_BASIS, type QmsDocumentRow } from './document-approval-signature';
import type { TrainingSqlClient } from './training';
import { describeQmsTrainingDocument } from './training-content';

type ApprovalState = 'valid' | 'withdrawn' | 'changed' | 'unverified' | 'unavailable';
/** §11.50: the printed name, the time (UTC, ISO 8601) and the meaning of the exact signature row. */
export interface QmsSignatureManifestation { signerName: string | null; signedAt: string; meaning: string }
export interface CurrentQmsReleaseApproval {
  state: ApprovalState; signatureId: number | null; reason: string | null;
  /** Present when the exact row was found (valid, withdrawn or changed): who signed it, when, and as what. */
  signer?: QmsSignatureManifestation;
}
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

/**
 * CAT2-19: an approval signed since 2026-10-29 binds the effective date in its
 * manifest, and the row must still carry it. One signed before carries none,
 * and is read as it was.
 */
function effectiveDateHolds(manifest: Record<string, unknown>, document: QmsDocumentRow): boolean {
  if (manifest.effectiveDate === undefined) return true;
  const stored = document.effective_date instanceof Date ? document.effective_date.toISOString() : String(document.effective_date ?? '');
  return manifest.effectiveDate === stored.slice(0, 10);
}

function exactManifest(row: Record<string, unknown>, document: QmsDocumentRow, at: string): boolean {
  const manifest = record(row.signature_manifest);
  if (!manifest || !effectiveDateHolds(manifest, document)) return false;
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

function manifestationOf(row: Record<string, unknown>): QmsSignatureManifestation {
  return { signerName: row.signer_name == null ? null : String(row.signer_name), signedAt: instant(row.signed_at) ?? '',
    meaning: String(row.signature_meaning) };
}

/** The verdict on the rows found for one release: exactly one, exact, standing, and still binding its content. */
function judgeApproval(rows: Array<Record<string, unknown>>, document: QmsDocumentRow, at: string): CurrentQmsReleaseApproval {
  if (rows.length !== 1) return unverified();
  const row = rows[0];
  if (!exactSignatureRow(row, document, at)) return unverified();
  const signatureId = Number(row.id);
  const signer = manifestationOf(row);
  if (isSignatureWithdrawn(row)) return { state: 'withdrawn', signatureId, signer,
    reason: 'The approval signature for this release has been withdrawn. This revision cannot be acknowledged as a current release.' };
  if (row.bound_payload_digest !== computeQmsDocumentContentDigest(document)) return { state: 'changed', signatureId, signer,
    reason: 'This controlled text no longer matches its recorded approval signature.' };
  return { state: 'valid', signatureId, reason: null, signer };
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
    return judgeApproval(rows, document, at);
  } catch (error) {
    console.error('[qms-training] release approval unavailable:', error instanceof Error ? error.message : error);
    return unavailable();
  }
}

function retainedReleaseMatches(retained: Record<string, unknown> | null, snapshot: QmsDocumentRow | null,
  document: QmsDocumentRow, approval: CurrentQmsReleaseApproval, digest: string | null): snapshot is QmsDocumentRow {
  if (!retained || !snapshot) return false;
  const captured = record(record(snapshot.metadata)?.authoringContent);
  return retained.authoring_document_id === document.authoring_document_id
    && Number(retained.signature_id) === approval.signatureId && retained.content_digest === digest
    && snapshot.id === document.id && snapshot.organization_id === document.organization_id && snapshot.version === document.version
    && snapshot.authoring_document_id === document.authoring_document_id && computeQmsDocumentContentDigest(snapshot) === digest
    && JSON.stringify(retained.sections) === JSON.stringify(captured?.sections);
}

export async function readQmsTrainingReleaseContext(client: TrainingSqlClient, document: QmsDocumentRow,
  now = new Date(), options: { lock?: boolean } = {}) {
  let context = describeQmsTrainingDocument(document, now);
  if (!context.eligible) return { context: document.authoring_document_id ? { ...context, sections: [] } : context, approval: null };
  const approval = await readCurrentQmsReleaseApproval(client, document, options);
  if (approval.state !== 'valid') return { context: { ...context, eligible: false, sections: document.authoring_document_id ? [] : context.sections, unavailableReason: approval.reason }, approval };
  if (document.authoring_document_id) {
    // An authored release is read from its immutable version, never from today's editing copy.
    try {
      const { rows } = await client.query(
        `SELECT * FROM qms_document_versions WHERE organization_id = $1 AND document_id = $2 AND version = $3 AND record_kind = 'signed'`,
        [document.organization_id, document.id, document.version],
      );
      const retained = rows.length === 1 ? rows[0] : null;
      const snapshot = record(retained?.controlled_document) as QmsDocumentRow | null;
      if (!snapshot || !retainedReleaseMatches(retained, snapshot, document, approval, context.contentDigest)) {
        return { context: { ...context, eligible: false, sections: [], unavailableReason: 'The immutable signed content for this released revision could not be verified.' }, approval };
      }
      context = describeQmsTrainingDocument(snapshot, now);
    } catch (error) {
      console.error('[qms-training] immutable release unavailable:', error instanceof Error ? error.message : error);
      return { context: { ...context, eligible: false, sections: [], unavailableReason: 'The immutable signed content could not be read. Reload this record before trying again.' }, approval: unavailable() };
    }
  }
  return { context, approval };
}

/**
 * The register's read (MR-12 Stage 5 step 4, §11.50): each release in force
 * with its approval, judged exactly as the single read judges it, in one query.
 * A read that fails is `unavailable` on every release, never unsigned.
 */
export async function readQmsReleaseApprovals(client: TrainingSqlClient, organizationId: number,
  releases: readonly QmsDocumentRow[]): Promise<Map<number, CurrentQmsReleaseApproval>> {
  const result = new Map<number, CurrentQmsReleaseApproval>();
  const dated = releases.map((release) => ({ release, at: recordedApprovalInstant(release) }));
  for (const { release, at } of dated) if (!at) result.set(release.id, unverified());
  const pending = dated.filter((d): d is { release: QmsDocumentRow; at: string } => d.at !== null);
  if (!pending.length) return result;
  try {
    const { rows } = await client.query(
      `SELECT id,organization_id,signed_target,signature_type,signer_id,signer_name,signer_email,signed_at,
          signature_meaning,signature_purpose,signature_manifest,signature_hash,binding_basis,bound_payload_digest,
          is_valid,superseded_by,verification_status
         FROM electronic_signatures
        WHERE organization_id=$1 AND signature_type='qms-document-approval' AND signed_target = ANY($2::text[]) ORDER BY id`,
      [organizationId, pending.map(({ release }) => `qms-document:${release.id}`)]);
    for (const { release, at } of pending) {
      const found = rows.filter((row) => row.signed_target === `qms-document:${release.id}`
        && row.signer_id === release.approver_id && instant(row.signed_at) === at);
      result.set(release.id, judgeApproval(found, release, at));
    }
  } catch (error) {
    console.error('[qms-register] release approvals unavailable:', error instanceof Error ? error.message : error);
    for (const { release } of pending) result.set(release.id, unavailable());
  }
  return result;
}

/** A retired document's retirement signature, as the register shows it. */
export type QmsRetirementSignature =
  | { state: 'signed' | 'withdrawn'; signatureId: number; signer: QmsSignatureManifestation }
  | { state: 'unsigned' | 'unavailable' };

/**
 * Each retired document's newest retirement signature (21 CFR 820.40, §11.50).
 * `unsigned` is a retirement recorded before retirement was signed
 * (2026-09-26); `withdrawn` is one whose every signature is out of force.
 */
export async function readQmsRetirementSignatures(client: TrainingSqlClient, organizationId: number,
  documentIds: readonly number[]): Promise<Map<number, QmsRetirementSignature>> {
  const result = new Map<number, QmsRetirementSignature>();
  if (!documentIds.length) return result;
  try {
    const { rows } = await client.query(
      `SELECT id, signed_target, signer_name, signed_at, signature_meaning, is_valid, superseded_by, verification_status
         FROM electronic_signatures
        WHERE organization_id=$1 AND signature_type='qms-document-retirement' AND signed_target = ANY($2::text[])
        ORDER BY signed_at DESC, id DESC`,
      [organizationId, documentIds.map((id) => `qms-document:${id}`)]);
    for (const id of documentIds) {
      const own = rows.filter((row) => row.signed_target === `qms-document:${id}`);
      const standing = own.find((row) => !isSignatureWithdrawn(row));
      const shown = standing ?? own[0];
      result.set(id, shown
        ? { state: standing ? 'signed' : 'withdrawn', signatureId: Number(shown.id), signer: manifestationOf(shown) }
        : { state: 'unsigned' });
    }
  } catch (error) {
    console.error('[qms-register] retirement signatures unavailable:', error instanceof Error ? error.message : error);
    for (const id of documentIds) result.set(id, { state: 'unavailable' });
  }
  return result;
}
