/**
 * Declare the US sequences a submission's application filed outside the
 * platform, and which of them opened its Original Application (D7, W5,
 * 2026-10-29; docs/design/FILED_ELSEWHERE_BASELINE_2026-10-29.md).
 *
 * An IND that already holds sequences filed with another tool could not
 * continue here: the Submission Center's first sequence was 0000, an Original
 * Application, and an amendment with no Original Application held on the
 * platform is refused (sequence-spine-fda-identity.ts). MR-10 Stage 9 allows
 * a submission to continue "from a declared baseline the user signs as
 * cumulative". This is that declaration. The import of the sequences
 * themselves (their leaves, for replace, append and delete) is still Stage 9's.
 *
 * The act runs inside the platform's signing ceremony
 * (routes/governed-signed-act.ts signGovernedAct). The signature binds the
 * declaration and its evidence (filedBaselineDigest), and the database refuses
 * a row without that signature at COMMIT. Refused by name, with nothing
 * written:
 *   - another organization's submission, one that is not for the US, or one
 *     with no project (NOT_FOUND, NOT_US_SUBMISSION, UNANCHORED_SUBMISSION);
 *   - a signer who is not the project's lead or an organization manager, the
 *     market application number's gate (FORBIDDEN);
 *   - a malformed number, or an original after the last sequence (VALIDATION);
 *   - evidence that is not a retained Vault document of this organization
 *     (EVIDENCE_NOT_FOUND);
 *   - a US sequence of this submission that is frozen or dispatched: its
 *     number and submission-id were signed under the declaration in force,
 *     and the sequence signature does not bind it (BASELINE_FIXED);
 *   - a US sequence numbered at or below the last one, or typed 'original',
 *     that holds content (PLATFORM_SEQUENCE_WITHIN_BASELINE). An empty draft
 *     of that kind (a "Start sequence 0000" that was never used) is removed by
 *     the act, and the signed record names it;
 *   - a declaration the same as the current one (BASELINE_UNCHANGED).
 *
 * @module server/services/submission-service/filed-sequence-baseline
 */
import { canonicalRegionOf } from '../../../shared/regulatory/region-identity';
import { canMutateProgram } from '../c2c/program-access';
import { resolveSignerOrgRole } from '../part11/resolve-signer-role';
import { readVaultSource } from '../regulatory/lifecycle-signature';
import {
  FILED_BASELINE_REGION,
  FILED_BASELINE_TARGET_PREFIX,
  readCurrentFiledBaseline,
  type BaselineQueryable,
  type FiledBaseline,
} from './filed-sequence-baseline-content';

export const FILED_BASELINE_CODE_STATUS = {
  NOT_FOUND: 404,
  NOT_US_SUBMISSION: 422,
  UNANCHORED_SUBMISSION: 422,
  FORBIDDEN: 403,
  VALIDATION: 422,
  EVIDENCE_NOT_FOUND: 422,
  BASELINE_FIXED: 409,
  PLATFORM_SEQUENCE_WITHIN_BASELINE: 409,
  BASELINE_UNCHANGED: 409,
} as const;
export type FiledBaselineRefusalCode = keyof typeof FILED_BASELINE_CODE_STATUS;

export class FiledBaselineRefusal extends Error {
  constructor(readonly code: FiledBaselineRefusalCode, message: string) {
    super(message);
    this.name = 'FiledBaselineRefusal';
  }
}

const SEQUENCE_RE = /^\d{4}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;

export interface FiledBaselineDeclaration {
  /** The new row's id, minted by the caller: the signature's target names it. */
  id: string;
  submissionId: number;
  lastFiledSequence: string;
  originalSequence: string;
  evidenceDocumentId: string;
  reason: string;
}

const SUBMISSION = 'SELECT program_id, primary_region FROM submissions WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL';
const SUBMISSION_LOCKED = 'SELECT program_id, primary_region FROM submissions WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR UPDATE';

/**
 * The submission, its market and the signer's standing on its project. Asked
 * before the password (precheck) and again under the submission's row lock.
 */
export async function assertMayDeclare(
  q: BaselineQueryable, orgId: number, userId: number, submissionId: number, lock = false,
): Promise<void> {
  const row = (await q.query(lock ? SUBMISSION_LOCKED : SUBMISSION, [submissionId, orgId])).rows[0] as { program_id?: string | null; primary_region?: string } | undefined;
  if (!row) throw new FiledBaselineRefusal('NOT_FOUND', 'Submission not found for this organization. Nothing was signed.');
  if (canonicalRegionOf(row.primary_region) !== FILED_BASELINE_REGION) {
    throw new FiledBaselineRefusal('NOT_US_SUBMISSION',
      'Sequences filed outside the platform can be declared only for a US (FDA) submission. Nothing was signed.');
  }
  if (!row.program_id) {
    throw new FiledBaselineRefusal('UNANCHORED_SUBMISSION',
      'This submission is not anchored to a project. Anchor it first. Nothing was signed.');
  }
  const program = (await q.query(
    `SELECT lead_user_id FROM regulatory_programs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [row.program_id, orgId],
  )).rows[0] as { lead_user_id?: unknown } | undefined;
  if (!program) throw new FiledBaselineRefusal('NOT_FOUND', 'Project not found for this organization. Nothing was signed.');
  const orgRole = await resolveSignerOrgRole(userId, orgId, q);
  const leadUserId = program.lead_user_id == null ? null : Number(program.lead_user_id);
  if (!canMutateProgram({ actor: { userId, orgRole }, program: { leadUserId } })) {
    throw new FiledBaselineRefusal('FORBIDDEN',
      "Only the project's lead or an organization manager can declare the sequences filed outside the platform. Nothing was signed.");
  }
}

function assertNumbers(d: FiledBaselineDeclaration): void {
  if (!SEQUENCE_RE.test(d.lastFiledSequence) || !SEQUENCE_RE.test(d.originalSequence)) {
    throw new FiledBaselineRefusal('VALIDATION', 'Sequence numbers are four digits, for example 0000 or 0041. Nothing was signed.');
  }
  if (d.originalSequence > d.lastFiledSequence) {
    throw new FiledBaselineRefusal('VALIDATION',
      `The Original Application's sequence (${d.originalSequence}) is after the last sequence filed (${d.lastFiledSequence}). Nothing was signed.`);
  }
}

interface PlatformSequence { id: number; sequence_number: string; type: string; fixed: boolean; leaves: number }

/** The submission's US sequences, locked to COMMIT so a freeze waits for the declaration, or the declaration for it. */
async function lockUsSequences(q: BaselineQueryable, orgId: number, submissionId: number): Promise<PlatformSequence[]> {
  const { rows } = await q.query(
    `SELECT s.id, s.sequence_number, s.type, s.region,
            (s.status IN ('frozen', 'dispatched') OR s.frozen_at IS NOT NULL OR s.dispatch_status IS NOT NULL) AS fixed,
            (SELECT COUNT(*)::int FROM submission_leaves l WHERE l.sequence_id = s.id) AS leaves
       FROM ectd_sequences s
      WHERE s.organization_id = $1 AND s.submission_id = $2 AND s.deleted_at IS NULL
      ORDER BY s.sequence_number
      FOR UPDATE OF s`,
    [orgId, submissionId],
  );
  return rows
    .filter((r) => canonicalRegionOf(String(r.region)) === FILED_BASELINE_REGION)
    .map((r) => ({ id: Number(r.id), sequence_number: String(r.sequence_number), type: String(r.type ?? ''),
      fixed: r.fixed === true, leaves: Number(r.leaves ?? 0) }));
}

/** The empty drafts the declaration replaces; refuses one that is fixed or holds content. */
function draftsReplaced(sequences: PlatformSequence[], last: string): PlatformSequence[] {
  const fixed = sequences.find((s) => s.fixed);
  if (fixed) {
    throw new FiledBaselineRefusal('BASELINE_FIXED',
      `Sequence ${fixed.sequence_number} of this submission is frozen or dispatched under the sequences declared when it was, ` +
      'so they are not changed here. Nothing was signed.');
  }
  const covered = sequences.filter((s) => s.sequence_number <= last || s.type.toLowerCase() === 'original');
  const used = covered.find((s) => s.leaves > 0);
  if (used) {
    throw new FiledBaselineRefusal('PLATFORM_SEQUENCE_WITHIN_BASELINE',
      `Sequence ${used.sequence_number} on the platform holds content and is ` +
      (used.sequence_number <= last ? `numbered within the sequences filed elsewhere (0000–${last})` : "typed as the Original Application") +
      '. Move its content to a sequence after them, and remove it, first. Nothing was signed.');
  }
  return covered;
}

/**
 * The declaration, on the signing transaction. Returns what the ceremony signs:
 * the target, the attested facts (they reach the ledger payload and the
 * signature manifest's act, which the database checks against the row), and
 * the response body.
 */
export async function declareFiledBaseline(q: BaselineQueryable, orgId: number, userId: number, d: FiledBaselineDeclaration) {
  assertNumbers(d);
  await assertMayDeclare(q, orgId, userId, d.submissionId, true);
  const evidence = UUID_RE.test(d.evidenceDocumentId)
    ? await readVaultSource(q as never, orgId, d.evidenceDocumentId, { lock: true })
    : null;
  const evidenceSha256 = evidence?.contentHash.toLowerCase() ?? '';
  if (!evidence || !SHA256_RE.test(evidenceSha256)) {
    throw new FiledBaselineRefusal('EVIDENCE_NOT_FOUND',
      "The evidence is not a retained document in your organization's Vault. Upload the agency's acknowledgment of the last " +
      'sequence filed to the Vault, and name that document. Nothing was signed.');
  }
  const replaced = draftsReplaced(await lockUsSequences(q, orgId, d.submissionId), d.lastFiledSequence);
  const previous = await readCurrentFiledBaseline(q, orgId, d.submissionId);
  if (previous && previous.lastFiledSequence === d.lastFiledSequence && previous.originalSequence === d.originalSequence
      && previous.evidenceSha256 === evidenceSha256) {
    throw new FiledBaselineRefusal('BASELINE_UNCHANGED', 'That is the declaration already in force. Nothing was signed.');
  }
  await q.query(
    `INSERT INTO public.submission_filed_baselines
       (id, organization_id, submission_id, region, last_filed_sequence, original_sequence,
        evidence_vault_document_id, evidence_sha256, reason, declared_by)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8, $9, $10)`,
    [d.id, orgId, d.submissionId, FILED_BASELINE_REGION, d.lastFiledSequence, d.originalSequence,
      evidence.id, evidenceSha256, d.reason, userId],
  );
  if (replaced.length > 0) {
    await q.query(
      `UPDATE ectd_sequences SET deleted_at = NOW(), updated_at = NOW() WHERE organization_id = $1 AND id = ANY($2::int[])`,
      [orgId, replaced.map((s) => s.id)],
    );
  }
  const facts = {
    submissionId: String(d.submissionId),
    region: FILED_BASELINE_REGION,
    lastFiledSequence: d.lastFiledSequence,
    originalSequence: d.originalSequence,
    evidenceDocumentId: evidence.id,
    evidenceSha256,
    previous: previous ? { lastFiledSequence: previous.lastFiledSequence, originalSequence: previous.originalSequence } : null,
    removedDraftSequences: replaced.map((s) => s.sequence_number),
  };
  return {
    target: `${FILED_BASELINE_TARGET_PREFIX}:${d.id}`,
    payload: facts,
    body: { baseline: { id: d.id, ...facts, submissionId: d.submissionId } },
  };
}

/**
 * Why a new sequence may not be created under a declaration, or null.
 * createSequence asks it for both creators (the Submission Center and IND
 * Lifecycle). `type` is as the caller sent it: omitted means 'original'.
 */
export function sequenceCreationRefusal(
  baseline: FiledBaseline | null, region: string, seq: { sequenceNumber: string; type?: string | null },
): string | null {
  if (!baseline || canonicalRegionOf(region) !== FILED_BASELINE_REGION) return null;
  if (seq.sequenceNumber <= baseline.lastFiledSequence) {
    return `Sequences 0000–${baseline.lastFiledSequence} of this application were filed outside the platform, so ` +
      `sequence ${seq.sequenceNumber} is taken. The next is ${nextAfter(baseline.lastFiledSequence)}. Nothing was created.`;
  }
  if ((seq.type ?? 'original').toLowerCase() === 'original') {
    return `Sequence ${baseline.originalSequence}, filed outside the platform, opened this application's Original Application. ` +
      'A later sequence is an amendment, a response, an annual report or a withdrawal: name its type. Nothing was created.';
  }
  return null;
}

/** The number after `sequence`, four digits. */
export function nextAfter(sequence: string): string {
  return String(Number.parseInt(sequence, 10) + 1).padStart(4, '0');
}
