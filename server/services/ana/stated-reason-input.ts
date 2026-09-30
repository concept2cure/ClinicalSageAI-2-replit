/**
 * The `reason` input of a governed AnA tool, and the one rule for reading it.
 *
 * The handler records it as the reason for change on the audit trail
 * (recordGovernedAction -> audit_logs.reason), so it must be the person's, in
 * their words. A governed tool sent without one refuses and tells the model to
 * ask (AnaToolExecutor.ts reasonNotStated); this description says the same
 * before the call, so the model asks first instead of writing one.
 *
 * The reading lives here, not in AnaToolExecutor.ts, because not every handler
 * that records a reason is in that file: commit_document_revision is
 * registered from document-spine.ts, which cannot import the executor without
 * an import cycle. One module, so there is one minimum, one error the
 * registration wrapper recognises, and no second copy to drift.
 *
 * @compliance 21 CFR Part 11 §11.10(e)
 */
import { GOVERNED_REASON_MIN } from '../../../shared/constants/governed-reason';

export const STATED_REASON_INPUT = {
  type: 'string',
  description:
    "The person's reason for this change, in their words (at least 8 characters). It is recorded as the " +
    'reason for change on the audit trail. If they have not given one, ask them; never write one yourself.',
} as const;

/**
 * The shortest reason recorded — the rule every other path that writes these
 * rows applies (protocol-reviews.ts and financial-disclosures.ts
 * `reasonSchema`; /api/c2c/actions REASON_REQUIRED; governed-qms-write.ts
 * governedQmsReason). One value, shared/constants/governed-reason.ts.
 */
export { GOVERNED_REASON_MIN };

/**
 * The input a governed tool's reason arrives in. `reason` for every tool but
 * those whose definition names it `reason_for_change` (reasonFieldOf). A field
 * name, never a sentence: there is no parameter here a fallback reason could be
 * passed through.
 */
export type StatedReasonField = 'reason' | 'reason_for_change';

/** Governed tools whose reason input is `reason_for_change`; every other one's is `reason`. */
const REASON_FOR_CHANGE_TOOLS: ReadonlySet<string> = new Set(['commit_document_revision']);

/** The input `tool` carries the person's reason in. */
export function reasonFieldOf(tool: string): StatedReasonField {
  return REASON_FOR_CHANGE_TOOLS.has(tool) ? 'reason_for_change' : 'reason';
}

/** A stated reason, trimmed, or null when none of at least GOVERNED_REASON_MIN characters was given. */
function statedReasonText(value: unknown): string | null {
  const r = typeof value === 'string' ? value.trim() : '';
  return r.length >= GOVERNED_REASON_MIN ? r : null;
}

/** The person's stated reason in `input[field]`, trimmed, or null when none was given. */
export function statedReason(input: Record<string, unknown>, field: StatedReasonField = 'reason'): string | null {
  return statedReasonText(input[field]);
}

/** A governed write without the person's reason; the registration wrapper answers it with reasonNotStated. */
export class ReasonNotStatedError extends Error {
  constructor(readonly field: StatedReasonField = 'reason') {
    super('No reason was stated for a governed write. Nothing was recorded or changed.');
    this.name = 'ReasonNotStatedError';
  }
}

/**
 * `value` as the person's stated reason, or ReasonNotStatedError. For a core
 * that records a reason it was handed (document-spine.ts
 * commitCanonicalRevision), so a caller that is not a tool handler cannot
 * reach the ledger without one either.
 */
export function requireStatedReason(value: unknown, field: StatedReasonField = 'reason'): string {
  const reason = statedReasonText(value);
  if (!reason) throw new ReasonNotStatedError(field);
  return reason;
}

/**
 * The person's stated reason, read where a handler resolves its inputs —
 * after its own input checks, before it opens a connection or calls the
 * service that writes. Without one it throws ReasonNotStatedError, which
 * registerToolHandler's wrapper turns into the refusal (reasonNotStated): the
 * handler never reaches a write, and needs no branch of its own for it.
 */
export function gatedReason(input: Record<string, unknown>, field: StatedReasonField = 'reason'): string {
  return requireStatedReason(input[field], field);
}
