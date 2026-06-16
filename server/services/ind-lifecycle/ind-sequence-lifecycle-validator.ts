/**
 * eCTD sequence lifecycle validator — is a proposed sequence type legal?
 *
 * An eCTD submission has a lifecycle: it must open with an original, subsequent
 * sequences (amendment / response / variation / annual) presuppose that original,
 * and a withdrawal is terminal. The audit flagged that nothing validated a
 * proposed sequence type against the submission's history — so an amendment
 * could be filed before any original, or a sequence after a withdrawal. This
 * deterministic validator closes that gap.
 *
 * Pure / deterministic — no DB. The caller supplies the existing sequence types
 * (in filing order) and the proposed new type.
 *
 * Sequence types mirror shared/schema/submissions.ts (ectdSequences.type):
 * original | amendment | response | variation | annual | withdrawal.
 *
 * @module server/services/ind-lifecycle/ind-sequence-lifecycle-validator
 */

export type EctdSequenceType = 'original' | 'amendment' | 'response' | 'variation' | 'annual' | 'withdrawal';

export const ECTD_SEQUENCE_TYPES: EctdSequenceType[] = ['original', 'amendment', 'response', 'variation', 'annual', 'withdrawal'];

/** Types that presuppose an existing original sequence. */
const REQUIRES_ORIGINAL: ReadonlySet<EctdSequenceType> = new Set(['amendment', 'response', 'variation', 'annual', 'withdrawal']);

export interface SequenceLifecycleFinding {
  /** NO_ORIGINAL_FIRST / DUPLICATE_ORIGINAL / SUBMISSION_WITHDRAWN / UNKNOWN_TYPE. */
  code: string;
  message: string;
}

export interface SequenceLifecycleResult {
  /** True ⇔ the proposed type is a legal next sequence. */
  allowed: boolean;
  proposedType: string;
  /** True when the submission is in a terminal (withdrawn) state. */
  terminal: boolean;
  /** Reasons the transition is disallowed (empty when allowed). */
  reasons: SequenceLifecycleFinding[];
}

export interface SequenceLifecycleInput {
  /** Existing sequence types in filing order (oldest → newest). */
  existingSequenceTypes: string[];
  /** The proposed new sequence type. */
  proposedType: string;
}

/**
 * Validate a proposed eCTD sequence type against the submission's history.
 * Pure / deterministic.
 *
 * Rules:
 *  - The first sequence must be an `original`.
 *  - amendment/response/variation/annual/withdrawal require a prior `original`.
 *  - A second `original` is not allowed.
 *  - After a `withdrawal` the submission is terminal — nothing further is allowed.
 */
export function validateSequenceTypeTransition(input: SequenceLifecycleInput): SequenceLifecycleResult {
  const existing = (input.existingSequenceTypes ?? []).map((t) => String(t));
  const proposed = String(input.proposedType ?? '') as EctdSequenceType;
  const reasons: SequenceLifecycleFinding[] = [];

  const isWithdrawn = existing.includes('withdrawal');
  const hasOriginal = existing.includes('original');

  if (!ECTD_SEQUENCE_TYPES.includes(proposed)) {
    reasons.push({ code: 'UNKNOWN_TYPE', message: `"${input.proposedType}" is not a known eCTD sequence type.` });
    return { allowed: false, proposedType: String(input.proposedType), terminal: isWithdrawn, reasons };
  }

  // Terminal state: a withdrawn submission accepts no further sequences.
  if (isWithdrawn) {
    reasons.push({ code: 'SUBMISSION_WITHDRAWN', message: 'The submission has been withdrawn (terminal); no further sequences may be filed.' });
    return { allowed: false, proposedType: proposed, terminal: true, reasons };
  }

  if (proposed === 'original') {
    if (hasOriginal) {
      reasons.push({ code: 'DUPLICATE_ORIGINAL', message: 'An original sequence already exists; a submission has exactly one original.' });
    }
  } else if (REQUIRES_ORIGINAL.has(proposed) && !hasOriginal) {
    reasons.push({ code: 'NO_ORIGINAL_FIRST', message: `A "${proposed}" sequence requires a prior original; the first sequence must be the original.` });
  }

  return { allowed: reasons.length === 0, proposedType: proposed, terminal: false, reasons };
}

export interface SequenceHistoryViolation {
  /** 0-based index of the offending sequence in the history. */
  index: number;
  type: string;
  reasons: SequenceLifecycleFinding[];
}

export interface SequenceHistoryAudit {
  /** True ⇔ every sequence was a legal transition at the time it was filed. */
  valid: boolean;
  sequenceCount: number;
  violations: SequenceHistoryViolation[];
}

/**
 * Audit a submission's entire sequence-type history: replay it in order and
 * check that each sequence was a legal next transition given everything filed
 * before it. Surfaces violations like an amendment before any original, a second
 * original, or any sequence after a withdrawal. Pure / deterministic.
 */
export function auditSequenceHistory(sequenceTypes: string[]): SequenceHistoryAudit {
  const types = (sequenceTypes ?? []).map((t) => String(t));
  const violations: SequenceHistoryViolation[] = [];

  for (let i = 0; i < types.length; i++) {
    const verdict = validateSequenceTypeTransition({ existingSequenceTypes: types.slice(0, i), proposedType: types[i] });
    if (!verdict.allowed) {
      violations.push({ index: i, type: types[i], reasons: verdict.reasons });
    }
  }

  return { valid: violations.length === 0, sequenceCount: types.length, violations };
}
