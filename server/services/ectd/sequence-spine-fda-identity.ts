/**
 * The FDA submission-id a Submission Center sequence declares, by the
 * platform's one rule (fda-sequence-identity.ts resolveFdaSequenceIdentity).
 *
 * 2026-10-29 (W5/D7, CSR path review). fda-sequence-identity.ts enforced the
 * rule on the package spine and left "the other spine's callers" to the shared
 * packager's default, the sequence's own number. This spine passed nothing, so
 * every IND amendment it built said Amendment and, in the same element, opened
 * a regulatory activity of its own. An IND amendment is submission type
 * Original Application, sub-type Amendment, submission-id = the IND's first
 * sequence (0000). That is the case LMN-201's CSR is filed under.
 *
 * On this spine the activity an amendment continues is the submission's
 * Original Application: its earlier sequence, in the same region (numbering
 * restarts per region), typed 'original' that the agency
 * has not rejected. One not yet sent counts: the filing-order guard sends it
 * first (submission-service.ts filingOrderRefusal), so a follow-up can be
 * built and frozen while it is in flight. The submission type and sub-type come
 * from the sequence's type (core-to-packager.ts fdaSubmissionTypeFor); this
 * module decides only the submission-id, through the resolver, and refuses what
 * the resolver refuses.
 *
 * 2026-10-29 (slice 2, docs/design/FILED_ELSEWHERE_BASELINE_2026-10-29.md). An
 * application whose earlier sequences were filed outside the platform names
 * its Original Application by the sponsor's signed declaration
 * (submission-service/filed-sequence-baseline.ts): the declared opener joins
 * the platform's, and a sequence numbered within the declared ones is refused.
 *
 * @module server/services/ectd/sequence-spine-fda-identity
 */
import { resolveSubmissionSubTypeCode, resolveSubmissionTypeCode } from './controlled-vocab';
import { resolveFdaSequenceIdentity } from './fda-sequence-identity';
import { SequenceLifecycleRefusal, type FiledSequence } from './package-sequence-lifecycle';
import { readCurrentFiledBaseline } from '../submission-service/filed-sequence-baseline-content';

export interface SpineQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** The submission-id cannot be declared truthfully, so nothing was packaged. */
export class FdaSubmissionIdentityRefusal extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'FdaSubmissionIdentityRefusal';
  }
}

export async function sequenceSpineFdaSubmissionId(q: SpineQueryable, args: {
  organizationId: number;
  submissionId: number;
  /** Numbering, and so the activity, is per region within a submission. */
  region: string;
  sequenceNumber: string;
  /** The packager terms fdaSubmissionTypeFor returns, e.g. 'original' and 'amendment'. */
  submissionType: string;
  submissionSubType: string;
}): Promise<string> {
  const typeCode = resolveSubmissionTypeCode(args.submissionType);
  const subTypeCode = resolveSubmissionSubTypeCode(args.submissionSubType);
  if (!typeCode || !subTypeCode) {
    throw new FdaSubmissionIdentityRefusal('SUBMISSION_TYPE_UNKNOWN',
      `Sequence ${args.sequenceNumber}'s FDA submission type (${args.submissionType}, ${args.submissionSubType}) has no code. Nothing was packaged.`);
  }
  const { rows } = await q.query(
    `SELECT sequence_number FROM ectd_sequences
      WHERE organization_id = $1 AND submission_id = $2 AND deleted_at IS NULL
        AND region = $4 AND sequence_number < $3 AND lower(type) = 'original'
        AND dispatch_status IS DISTINCT FROM 'rejected'
      ORDER BY sequence_number`,
    [args.organizationId, args.submissionId, args.sequenceNumber, args.region],
  );
  // Sequences filed outside the platform, as the sponsor declared and signed
  // them (filed-sequence-baseline.ts): their numbers are taken, and one of
  // them opened the Original Application.
  const baseline = await readCurrentFiledBaseline(q, args.organizationId, args.submissionId);
  if (baseline && args.sequenceNumber <= baseline.lastFiledSequence) {
    throw new FdaSubmissionIdentityRefusal('SEQUENCE_FILED_ELSEWHERE',
      `Sequences 0000–${baseline.lastFiledSequence} of this application were filed outside the platform, so sequence ` +
      `${args.sequenceNumber} is taken. Nothing was packaged.`);
  }
  // Each is the opening sequence of the Original Application.
  const openers = [...(baseline ? [baseline.originalSequence] : []), ...rows.map(r => String(r.sequence_number))];
  const filed: FiledSequence[] = openers.map(sequence => (
    { sequence, submissionType: 'Original Application', submissionTypeCode: 'fdast1', submissionSubTypeCode: 'fdasst1',
      submissionId: sequence, sha256: '', filedAt: '', leaves: [] }));
  // A sub-type that continues an activity continues this one: the submission's
  // Original Application, when exactly one is on file. Otherwise the resolver
  // refuses, and says which.
  const continues = subTypeCode === 'fdasst4' || subTypeCode === 'fdasst5';
  const named = continues && filed.length === 1 ? filed[0].sequence : null;
  try {
    return resolveFdaSequenceIdentity({
      sequence: args.sequenceNumber, applicationTypeCode: null,
      submissionType: typeCode, submissionSubType: subTypeCode, submissionId: named, filed,
    }).submissionId;
  } catch (err) {
    if (!(err instanceof SequenceLifecycleRefusal)) throw err;
    if (err.code === 'SUBMISSION_ID_REQUIRED' && filed.length === 0) {
      throw new FdaSubmissionIdentityRefusal(err.code,
        `Sequence ${args.sequenceNumber} is an amendment to this application's Original Application, and this submission ` +
        'holds no Original Application sequence the agency has not rejected. Its submission-id would have to be guessed. ' +
        "If the application's earlier sequences were filed outside the platform, declare them on the submission first. " +
        'Nothing was packaged.');
    }
    throw new FdaSubmissionIdentityRefusal(err.code, `${err.message} Nothing was packaged.`);
  }
}
