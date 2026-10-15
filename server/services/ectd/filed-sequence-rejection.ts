/**
 * An agency TECHNICAL REJECTION of a filed eCTD sequence — the one governed act
 * that takes a sequence off a package's filed history.
 *
 * Governed transmit records a sequence filed when the gateway accepts the bytes
 * (for FDA, the MDN — long before the agency loads them). When the agency then
 * does not load it (a technical rejection: for FDA, a failed Ack3), the history
 * still said it was on file: its number could never be reused, and the next
 * sequence was planned as `replace` against content the agency does not hold
 * (2026-10-01, W5/D7, sweep F19). A rollback is NOT this act: the agency still
 * holds rolled-back bytes, so a rollback never un-files (fda-esg.ts).
 *
 * There is no Ack3 ingestion, so this is an operator's signed act carrying the
 * agency's own evidence, and every rule below is what keeps it from being a way
 * to rewrite what is on file:
 *
 *   - keyed on the TRANSMITTAL: the entry it filed is found by its id (by the
 *     bundle digest only for an entry that names no transmittal). A second send
 *     under a sequence on file was never recorded, so its rejection un-files
 *     nothing — the agency may have loaded the first;
 *   - the latest sequence on file only: a later one was planned against this
 *     one, its number could never be filled again, and a notice about 0001 is
 *     not evidence about 0002;
 *   - refused when the transmittal's status records the agency ACCEPTING it;
 *   - the evidence is a document of this organization's Vault, not deleted,
 *     read FOR SHARE in the signing transaction, and the e-signature binds its
 *     content hash (VAULT_DOCUMENT_VERSION) — an operator uploads the notice
 *     through Vault ingest first; there is no other upload path;
 *   - ONE transaction under the package row lock: the governed `sign` ledger
 *     row, the electronic signature, the transmittal row and the filed history
 *     commit together, or nothing does. recordPackageGovernedAction is not used
 *     because it keeps the mutation when the audit write fails — right after an
 *     irreversible send, wrong for an act whose only record is its audit.
 *
 * The entry is never deleted: it is marked `state: 'rejected'` with its
 * rejection record (isRejectedFiling), and a stored bundle planned on top of it
 * is cleared with its preflight. There is no reinstate action — re-auth, the
 * signature over the notice, latest-only and the acceptance refusal are what
 * stand between a mistake and the record.
 *
 * @module server/services/ectd/filed-sequence-rejection
 */
import { pool } from '../../db';
import { recordGovernedAction } from '../../routes/c2c/actions';
import { BINDING_BASIS, persistGovernedActionSignature } from '../part11/signature-persistence';
import { readVaultSource } from '../regulatory/lifecycle-signature';
import type { SubmissionStatus } from '../submission-gateways/types';
import { withPackageMetadataLock, type LockClient } from './package-content-change';
import { isRejectedFiling, type FiledSequenceRejection, type FiledSequenceState } from './package-sequence-lifecycle';

export type FiledSequenceRejectionRefusalCode =
  | 'TRANSMITTAL_NOT_FOUND'
  | 'NOT_A_PACKAGE_TRANSMITTAL'
  | 'TRANSMITTAL_NOT_ON_FILE'
  | 'NOT_LATEST_FILED_SEQUENCE'
  | 'TRANSMITTAL_RECORDS_ACCEPTANCE'
  | 'EVIDENCE_NOT_FOUND';

const REFUSAL_HTTP_STATUS: Record<FiledSequenceRejectionRefusalCode, 404 | 409 | 422> = {
  TRANSMITTAL_NOT_FOUND: 404,
  NOT_A_PACKAGE_TRANSMITTAL: 422,
  TRANSMITTAL_NOT_ON_FILE: 409,
  NOT_LATEST_FILED_SEQUENCE: 409,
  TRANSMITTAL_RECORDS_ACCEPTANCE: 409,
  EVIDENCE_NOT_FOUND: 422,
};

/** A rejection this action will not record. Nothing was written when it is thrown. */
export class FiledSequenceRejectionRefusal extends Error {
  readonly name = 'FiledSequenceRejectionRefusal';
  readonly httpStatus: 404 | 409 | 422;
  constructor(
    readonly code: FiledSequenceRejectionRefusalCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.httpStatus = REFUSAL_HTTP_STATUS[code];
  }
}

/** Transmittal statuses that record the agency ACCEPTING the delivery: a notice
 *  does not outweigh them, and this act refuses them. */
const ACCEPTANCE_STATUSES: ReadonlySet<string> = new Set<SubmissionStatus>([
  'ack3_received', 'validation_passed', 'review_started', 'response_required', 'completed',
]);
/** Statuses of a delivery still with the agency. They move to the status every
 *  gateway's poll writes for an agency rejection (which also frees the same-bytes
 *  transmit lock); any other status is kept as it is. */
const AWAITING_AGENCY_STATUSES: ReadonlySet<string> = new Set<SubmissionStatus>([
  'in_transit', 'received', 'ack1_received', 'ack2_received',
]);
const REJECTED_BY_AGENCY: SubmissionStatus = 'validation_failed';

const SEQUENCE_RE = /^\d{4}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;

export interface FiledSequenceRejectionParams {
  orgId: number;
  transmittalId: number;
  actorUserId: number;
  /** The operator's reason (at least 8 characters, route-enforced). */
  reason: string;
  /** The §11.50 meaning the signer declares; the signature writer refuses any outside its vocabulary. */
  meaning: string;
  /** The Vault document holding the agency's notice. */
  evidenceDocumentId: string;
  /** What verifyReauth actually verified for this request. */
  authenticationMethod: string;
  secondFactorVerified: boolean;
  ipAddress?: string | null;
  /**
   * When the signer's re-authentication was VERIFIED, by the caller that
   * verified it (the HTTP route runs verifyReauth before anything is read).
   * The proof crosses this function boundary by contract, as governed
   * transmit's does: without it nothing is read, written or signed. Never
   * synthesised here — a made-up time would be a fabricated governance record.
   */
  reauthVerifiedAt: Date;
}

export interface FiledSequenceRejectionOutcome {
  packageDbId: number;
  sequence: string;
  transmittalId: number;
  bundleSha256: string;
  transmittalStatus: { previous: string; current: string };
  evidence: { vaultDocumentId: string; contentSha256: string };
  /** A stored bundle planned on top of the rejected sequence, cleared with its preflight. */
  staleBundleCleared: { sequence: string; sha256: string } | null;
  actionId: string;
  signatureId: number;
  recordedAt: string;
}

type HistoryEntry = Record<string, unknown> & { sequence: string };

const refuse = (code: FiledSequenceRejectionRefusalCode, message: string, details?: Record<string, unknown>) =>
  new FiledSequenceRejectionRefusal(code, message, details);

/**
 * The package the transmittal sent, read BEFORE the row lock: the lock is taken
 * by package id and does not scope by organization, so the tenant check is
 * here, on both sides (the transmittal's org and the package's).
 */
async function packageOfTransmittal(orgId: number, transmittalId: number): Promise<number> {
  const { rows } = await pool.query(
    `SELECT t.package_id, p.id AS package_db_id
       FROM submission_transmittals t
       LEFT JOIN c2c_submission_packages p ON p.id = t.package_id AND p.org_id = t.organization_id
      WHERE t.id = $1 AND t.organization_id = $2`,
    [transmittalId, orgId],
  );
  if (rows.length === 0) throw refuse('TRANSMITTAL_NOT_FOUND', 'Transmittal not found.', { transmittalId });
  const packageDbId = Number(rows[0].package_db_id);
  if (rows[0].package_db_id == null || !Number.isSafeInteger(packageDbId)) {
    throw refuse(
      'NOT_A_PACKAGE_TRANSMITTAL',
      `Transmittal ${transmittalId} did not send a submission package, so it has no filed sequence to take off file.`,
      { transmittalId },
    );
  }
  return packageDbId;
}

/** The transmittal row, locked after the package row (the one lock order). */
async function lockTransmittal(client: LockClient, p: FiledSequenceRejectionParams, packageDbId: number) {
  const { rows } = await client.query(
    `SELECT status, package_id, bundle_sha256 FROM submission_transmittals
      WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [p.transmittalId, p.orgId],
  );
  if (rows.length === 0) throw refuse('TRANSMITTAL_NOT_FOUND', 'Transmittal not found.', { transmittalId: p.transmittalId });
  if (Number(rows[0].package_id) !== packageDbId) {
    throw refuse('NOT_A_PACKAGE_TRANSMITTAL', `Transmittal ${p.transmittalId} did not send this package.`, { transmittalId: p.transmittalId });
  }
  const sha = rows[0].bundle_sha256;
  return { status: String(rows[0].status ?? ''), bundleSha256: typeof sha === 'string' ? sha.toLowerCase() : null };
}

/**
 * The history entry this transmittal filed, among those on file (`rejected`
 * false) or those already taken off it (`rejected` true): by transmittal id,
 * and by bundle digest only for an entry that names no transmittal (histories
 * written before entries carried one). Never by sequence number.
 */
function entryIndex(history: unknown[], transmittalId: number, bundleSha256: string | null, rejected: boolean): number {
  return history.findIndex((raw) => {
    const e = raw as Record<string, unknown> | null;
    if (!e || typeof e !== 'object' || isRejectedFiling(e) !== rejected) return false;
    if (typeof e.sequence !== 'string' || !SEQUENCE_RE.test(e.sequence)) return false;
    if (typeof e.transmittalId === 'number') return e.transmittalId === transmittalId;
    return bundleSha256 !== null && typeof e.sha256 === 'string' && e.sha256.toLowerCase() === bundleSha256;
  });
}

function onFileEntry(history: unknown[], transmittalId: number, bundleSha256: string | null): number {
  const index = entryIndex(history, transmittalId, bundleSha256, false);
  if (index >= 0) return index;
  const already = entryIndex(history, transmittalId, bundleSha256, true);
  throw refuse(
    'TRANSMITTAL_NOT_ON_FILE',
    already >= 0
      ? `The agency's technical rejection of transmittal ${transmittalId} is already recorded; its sequence is not on file.`
      : `No sequence on this package's filed history was filed by transmittal ${transmittalId}, so there is nothing to take off file.`,
    { transmittalId, alreadyRecorded: already >= 0 },
  );
}

/** Sequences on file above `sequence`, oldest first. */
function laterOnFile(history: unknown[], sequence: string): Array<{ sequence: string; transmittalId: number | null }> {
  const later: Array<{ sequence: string; transmittalId: number | null }> = [];
  for (const raw of history) {
    const e = raw as Record<string, unknown> | null;
    if (!e || typeof e !== 'object' || isRejectedFiling(e)) continue;
    if (typeof e.sequence !== 'string' || !SEQUENCE_RE.test(e.sequence) || e.sequence <= sequence) continue;
    later.push({ sequence: e.sequence, transmittalId: typeof e.transmittalId === 'number' ? e.transmittalId : null });
  }
  return later.sort((a, b) => a.sequence.localeCompare(b.sequence));
}

/** The refusals that need the locked rows: latest-only, then acceptance. */
function assertRejectable(history: unknown[], entry: HistoryEntry, transmittalId: number, status: string): void {
  const later = laterOnFile(history, entry.sequence);
  if (later.length > 0) {
    const next = later[0];
    throw refuse(
      'NOT_LATEST_FILED_SEQUENCE',
      `Only the latest sequence on file can be recorded as rejected. Sequence ${next.sequence}` +
        `${next.transmittalId == null ? '' : ` (transmittal ${next.transmittalId})`} is on file after ${entry.sequence} ` +
        `and was planned against it; its rejection must be recorded first, with its own notice.`,
      { transmittalId, sequence: entry.sequence, later },
    );
  }
  if (ACCEPTANCE_STATUSES.has(status)) {
    throw refuse(
      'TRANSMITTAL_RECORDS_ACCEPTANCE',
      `Transmittal ${transmittalId} records that the agency accepted the delivery (status ${status}). ` +
        'A technical rejection cannot be recorded over an acceptance.',
      { transmittalId, status },
    );
  }
}

/** The agency's notice: this organization's, not deleted, held FOR SHARE until commit. */
async function readEvidence(client: LockClient, p: FiledSequenceRejectionParams) {
  const doc = UUID_RE.test(p.evidenceDocumentId)
    ? await readVaultSource(client, p.orgId, p.evidenceDocumentId, { lock: true })
    : null;
  if (!doc || !SHA256_RE.test(doc.contentHash)) {
    throw refuse(
      'EVIDENCE_NOT_FOUND',
      "The evidence is not a retained document in your organization's Vault. Upload the agency's notice to the Vault and name that document.",
      { evidenceDocumentId: p.evidenceDocumentId },
    );
  }
  return { vaultDocumentId: doc.id, contentSha256: doc.contentHash };
}

/** The bundle stored on the package when it was planned on top of `sequence`. */
function staleBundleAbove(current: Record<string, unknown>, sequence: string): { sequence: string; sha256: string } | null {
  const b = current.bundle as { sequence?: unknown; sha256?: unknown } | null | undefined;
  if (!b || typeof b !== 'object' || typeof b.sequence !== 'string' || b.sequence <= sequence) return null;
  return { sequence: b.sequence, sha256: typeof b.sha256 === 'string' ? b.sha256 : '' };
}

/** The governed `sign` and its electronic signature, bound to the notice's hash, on the locked client. */
async function signRejection(
  client: LockClient,
  p: FiledSequenceRejectionParams,
  facts: { packageDbId: number; sequence: string; bundleSha256: string; occurredAt: Date } & Pick<
    FiledSequenceRejectionOutcome, 'evidence' | 'transmittalStatus' | 'staleBundleCleared'
  >,
): Promise<{ actionId: string; signatureId: number }> {
  const target = `submission:${facts.packageDbId}`;
  const governed = await recordGovernedAction(client, {
    orgId: p.orgId,
    userId: p.actorUserId,
    command: 'sign',
    target,
    reason: p.reason,
    payload: {
      meaning: p.meaning,
      change: 'filed-sequence-rejected',
      sequence: facts.sequence,
      transmittalId: p.transmittalId,
      bundleSha256: facts.bundleSha256,
      evidence: facts.evidence,
      transmittalStatus: facts.transmittalStatus,
      staleBundleCleared: facts.staleBundleCleared,
    },
    domain: 'mdx',
    surface: 'submission-gateway',
  });
  const signature = await persistGovernedActionSignature(client, {
    orgId: p.orgId,
    userId: p.actorUserId,
    target,
    reason: p.reason,
    payload: { meaning: p.meaning },
    actionId: governed.actionId,
    auditId: governed.auditId,
    sha256Chain: governed.sha256Chain,
    authenticationMethod: p.authenticationMethod,
    secondFactorVerified: p.secondFactorVerified,
    ipAddress: p.ipAddress ?? null,
    occurredAt: facts.occurredAt,
    binding: {
      digest: facts.evidence.contentSha256,
      basis: BINDING_BASIS.VAULT_DOCUMENT_VERSION,
      note:
        `sha256 of the agency's notice (vault.documents ${facts.evidence.vaultDocumentId}), ` +
        'read from the stored row FOR SHARE in the signing transaction.',
    },
    extraManifest: {
      sequence: facts.sequence,
      transmittalId: p.transmittalId,
      evidenceDocumentId: facts.evidence.vaultDocumentId,
      reauthVerifiedAt: p.reauthVerifiedAt.toISOString(),
    },
    manifestKind: 'governed-filed-sequence-rejection',
    command: 'sign',
  });
  // The reader honours a rejection only with a numeric signature id; one it
  // would not honour must not be written.
  const signatureId = Number(signature.id);
  if (!Number.isSafeInteger(signatureId)) throw new Error('The electronic signature id could not be read; nothing was recorded.');
  return { actionId: governed.actionId, signatureId };
}

/** The transmittal row: moved to the agency-rejection status when still awaiting
 *  the agency, and the rejection merged into its metadata either way. */
async function markTransmittal(client: LockClient, p: FiledSequenceRejectionParams, sequence: string, rejection: FiledSequenceRejection) {
  const moved = rejection.transmittalStatus.current !== rejection.transmittalStatus.previous;
  await client.query(
    `UPDATE submission_transmittals
        SET status = $3::text,
            error_class = COALESCE($4::text, error_class),
            error_message = COALESCE($5::text, error_message),
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('technicalRejection', $6::jsonb),
            updated_at = NOW()
      WHERE id = $1 AND organization_id = $2`,
    [
      p.transmittalId,
      p.orgId,
      rejection.transmittalStatus.current,
      moved ? 'validation' : null,
      moved ? `Technical rejection recorded: the agency did not load sequence ${sequence}.` : null,
      JSON.stringify({ sequence, ...rejection }),
    ],
  );
}

/**
 * Record that the agency did not load the sequence a transmittal filed, and take
 * it off the package's filed history. Throws FiledSequenceRejectionRefusal for
 * every refusal (nothing written); any other error has rolled everything back.
 */
export async function recordFiledSequenceRejection(p: FiledSequenceRejectionParams): Promise<FiledSequenceRejectionOutcome> {
  if (!(p.reauthVerifiedAt instanceof Date) || Number.isNaN(p.reauthVerifiedAt.getTime())) {
    throw new Error('A technical rejection is signed only after the signer’s re-authentication is verified; none was handed in.');
  }
  const packageDbId = await packageOfTransmittal(p.orgId, p.transmittalId);
  return withPackageMetadataLock<FiledSequenceRejectionOutcome>(packageDbId, async (current, client) => {
    const transmittal = await lockTransmittal(client, p, packageDbId);
    const history = Array.isArray(current.filedSequences) ? [...(current.filedSequences as unknown[])] : [];
    const index = onFileEntry(history, p.transmittalId, transmittal.bundleSha256);
    const entry = history[index] as HistoryEntry;
    assertRejectable(history, entry, p.transmittalId, transmittal.status);
    const evidence = await readEvidence(client, p);

    const occurredAt = new Date();
    const sequence = entry.sequence;
    const bundleSha256 = typeof entry.sha256 === 'string' ? entry.sha256 : '';
    const transmittalStatus = {
      previous: transmittal.status,
      current: AWAITING_AGENCY_STATUSES.has(transmittal.status) ? REJECTED_BY_AGENCY : transmittal.status,
    };
    const staleBundleCleared = staleBundleAbove(current, sequence);
    const { actionId, signatureId } = await signRejection(client, p, {
      packageDbId, sequence, bundleSha256, occurredAt, evidence, transmittalStatus, staleBundleCleared,
    });

    const rejection: FiledSequenceRejection = {
      recordedAt: occurredAt.toISOString(), recordedBy: p.actorUserId, reason: p.reason,
      evidence, transmittalStatus, actionId, signatureId,
    };
    await markTransmittal(client, p, sequence, rejection);

    const state: FiledSequenceState = 'rejected';
    history[index] = { ...entry, state, rejection };
    const metadata: Record<string, unknown> = { ...current, filedSequences: history };
    if (staleBundleCleared) {
      delete metadata.bundle;
      delete metadata.preflight;
    }
    return {
      metadata,
      result: {
        packageDbId, sequence, transmittalId: p.transmittalId, bundleSha256, transmittalStatus, evidence,
        staleBundleCleared, actionId, signatureId, recordedAt: rejection.recordedAt,
      },
    };
  });
}
