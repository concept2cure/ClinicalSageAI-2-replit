/**
 * Per-section review of a CSR build's saved output (2026-10-29, slice 3 of
 * docs/design/CSR_END_TO_END_2026-10-29.md).
 *
 * The only writer of csr_section_outputs.review_status, reviewer_id,
 * review_decided_at, review_reason and reviewed_content_hash
 * (migrations/20260628_csr_job_state.sql, amended in place 2026-10-29).
 *
 *   draft ──submit──▶ in_review ──approve──▶ approved
 *     ▲                  │                      │
 *     └──── send_back (reason required) ◀───────┘
 *
 * A decision names the exact text it was made on (expectedContentHash), and
 * that text must still verify against its stored SHA-256. An approval binds
 * reviewed_content_hash; once a redraft changes content_hash the approval is
 * stale and the section reads as a draft again. The person who requested the
 * build may not approve its sections (the drafting is done on their behalf).
 *
 * This is the pre-import review on the build board. The governed approval of
 * the CSR is still the Authoring document's own review, attestation and
 * signature after workflow-source-import; nothing here changes those gates.
 */
import { createHash } from 'node:crypto';

export interface CsrReviewQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export const CSR_SECTION_REVIEW_STATES = ['draft', 'in_review', 'approved'] as const;
export type CsrSectionReviewState = (typeof CSR_SECTION_REVIEW_STATES)[number];
export const CSR_REVIEW_DECISIONS = ['submit', 'approve', 'send_back'] as const;
export type CsrReviewDecision = (typeof CSR_REVIEW_DECISIONS)[number];

export interface CsrSectionReviewView {
  sectionNumber: string;
  state: CsrSectionReviewState;
  contentHash: string;
  reviewerId: number | null;
  decidedAt: string | null;
  reason: string | null;
  /** An approval recorded on text that has since been redrafted. */
  staleApproval: boolean;
}

export class CsrSectionReviewError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = 'CsrSectionReviewError';
  }
}

export interface CsrSectionReviewInput {
  organizationId: number;
  jobId: number;
  sectionNumber: string;
  reviewerId: number;
  decision: CsrReviewDecision;
  expectedContentHash: string;
  reason?: string;
}

const HASH = /^[a-f0-9]{64}$/;
const MAX_REASON = 2000;

function iso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value ? new Date(value).toISOString() : null;
}

/** The state a reader should see: an approval of other text is not current. */
export function effectiveReviewState(row: {
  reviewStatus?: unknown; contentHash?: unknown; reviewedContentHash?: unknown;
}): { state: CsrSectionReviewState; staleApproval: boolean } {
  const recorded = (CSR_SECTION_REVIEW_STATES as readonly unknown[]).includes(row.reviewStatus)
    ? row.reviewStatus as CsrSectionReviewState : 'draft';
  if (recorded === 'draft') return { state: 'draft', staleApproval: false };
  const current = typeof row.contentHash === 'string' && row.reviewedContentHash === row.contentHash;
  if (current) return { state: recorded, staleApproval: false };
  return { state: 'draft', staleApproval: recorded === 'approved' };
}

export function csrSectionReviewView(row: Record<string, unknown>): CsrSectionReviewView {
  const { state, staleApproval } = effectiveReviewState({
    reviewStatus: row.review_status, contentHash: row.content_hash, reviewedContentHash: row.reviewed_content_hash,
  });
  const reviewer = Number(row.reviewer_id);
  return {
    sectionNumber: String(row.section_number),
    state,
    contentHash: String(row.content_hash ?? ''),
    reviewerId: Number.isSafeInteger(reviewer) && reviewer > 0 ? reviewer : null,
    decidedAt: iso(row.review_decided_at),
    reason: typeof row.review_reason === 'string' ? row.review_reason : null,
    staleApproval,
  };
}

/** The next recorded state, or a refusal naming why the move is not allowed. */
function nextState(decision: CsrReviewDecision, from: CsrSectionReviewState): CsrSectionReviewState {
  if (decision === 'submit' && from === 'draft') return 'in_review';
  if (decision === 'approve' && from === 'in_review') return 'approved';
  if (decision === 'send_back' && from !== 'draft') return 'draft';
  const wording: Record<CsrReviewDecision, string> = {
    submit: 'Only a draft section can be sent for review.',
    approve: 'Only a section in review can be approved.',
    send_back: 'This section is already a draft.',
  };
  throw new CsrSectionReviewError('CSR_REVIEW_TRANSITION_REFUSED', 409, `${wording[decision]} It is ${from.replace('_', ' ')}.`);
}

function validReason(decision: CsrReviewDecision, reason: unknown): string | null {
  if (decision !== 'send_back') return null;
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (!text || text.length > MAX_REASON) {
    throw new CsrSectionReviewError('CSR_REVIEW_REASON_REQUIRED', 400,
      `State why the section is sent back (1 to ${MAX_REASON} characters). Nothing was recorded.`);
  }
  return text;
}

function validInput(input: CsrSectionReviewInput): void {
  if (!(CSR_REVIEW_DECISIONS as readonly string[]).includes(input.decision)) {
    throw new CsrSectionReviewError('CSR_REVIEW_DECISION_INVALID', 400, 'Choose submit, approve or send back. Nothing was recorded.');
  }
  if (typeof input.expectedContentHash !== 'string' || !HASH.test(input.expectedContentHash)) {
    throw new CsrSectionReviewError('CSR_REVIEW_CONTENT_REQUIRED', 400, 'Name the exact section text being reviewed. Nothing was recorded.');
  }
  if (!Number.isSafeInteger(input.reviewerId) || input.reviewerId <= 0) {
    throw new CsrSectionReviewError('CSR_REVIEWER_REQUIRED', 401, 'A signed-in reviewer is required. Nothing was recorded.');
  }
}

async function readSection(q: CsrReviewQueryable, input: CsrSectionReviewInput) {
  const { rows } = await q.query(
    `SELECT o.id, o.section_number, o.content, o.content_hash, o.review_status, o.reviewer_id,
            o.review_decided_at, o.review_reason, o.reviewed_content_hash, j.requested_by
       FROM csr_section_outputs o
       JOIN csr_build_jobs j ON j.id = o.job_id AND j.organization_id = o.organization_id
      WHERE o.organization_id = $1 AND o.job_id = $2 AND o.section_number = $3`,
    [input.organizationId, input.jobId, input.sectionNumber],
  );
  if (rows.length !== 1) {
    throw new CsrSectionReviewError('CSR_SECTION_NOT_FOUND', 404, `No saved output exists for CSR section ${input.sectionNumber}.`);
  }
  return rows[0];
}

function assertReviewable(row: Record<string, unknown>, input: CsrSectionReviewInput): void {
  const content = typeof row.content === 'string' ? row.content : '';
  const sha = createHash('sha256').update(content, 'utf8').digest('hex');
  if (!content.trim() || row.content_hash !== sha) {
    throw new CsrSectionReviewError('CSR_SECTION_HASH_MISMATCH', 409,
      `Saved CSR section ${input.sectionNumber} does not match its recorded content hash. Nothing was recorded.`);
  }
  if (row.content_hash !== input.expectedContentHash) {
    throw new CsrSectionReviewError('CSR_SECTION_CHANGED', 409,
      `CSR section ${input.sectionNumber} was redrafted since it was opened. Reload it and review the current text.`);
  }
  if (input.decision === 'approve' && Number(row.requested_by) === input.reviewerId) {
    throw new CsrSectionReviewError('CSR_REVIEWER_IS_REQUESTER', 409,
      'The person who requested this build cannot approve its sections. Ask another reviewer.');
  }
}

/** Record one review decision on one saved section; returns the section's new view. */
export async function decideCsrSectionReview(q: CsrReviewQueryable, input: CsrSectionReviewInput): Promise<CsrSectionReviewView> {
  validInput(input);
  const reason = validReason(input.decision, input.reason);
  const row = await readSection(q, input);
  assertReviewable(row, input);
  const from = csrSectionReviewView(row).state;
  const to = nextState(input.decision, from);
  // Optimistic write: the row must still hold the text and recorded state read above.
  const { rows } = await q.query(
    `UPDATE csr_section_outputs
        SET review_status = $1, reviewer_id = $2, review_decided_at = now(), review_reason = $3,
            reviewed_content_hash = content_hash
      WHERE id = $4 AND organization_id = $5 AND content_hash = $6
        AND review_status = $7 AND reviewed_content_hash IS NOT DISTINCT FROM $8
      RETURNING section_number, content_hash, review_status, reviewer_id, review_decided_at,
                review_reason, reviewed_content_hash`,
    [to, input.reviewerId, reason, row.id, input.organizationId, input.expectedContentHash,
      row.review_status, row.reviewed_content_hash ?? null],
  );
  if (rows.length !== 1) {
    throw new CsrSectionReviewError('CSR_SECTION_CHANGED', 409,
      `CSR section ${input.sectionNumber} changed while the decision was being recorded. Reload it and decide again.`);
  }
  return csrSectionReviewView(rows[0]);
}
