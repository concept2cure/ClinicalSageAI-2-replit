/**
 * §11.50(a)(3) — the meanings a governed sign-off may carry: an approval-gated
 * task's checkpoint, and a QMS controlled document's approval.
 *
 * Moved here from pin-verification.ts when the signing PIN was retired
 * (2026-09-23); the enum was never about the PIN.
 *
 * @module server/services/part11/signature-meanings
 */
export const TASK_SIGNATURE_MEANINGS = [
  'APPROVED',
  'REVIEWED',
  'RESPONSIBILITY',
  'AUTHORSHIP',
] as const;
export type TaskSignatureMeaning = (typeof TASK_SIGNATURE_MEANINGS)[number];

/**
 * The closed vocabulary a governed `sign` may carry (§11.50(a)(3); security
 * audit 2026-09-24, DP-17). It is the union of the two spellings the product
 * already uses — the task board's upper-case meanings above and the sign
 * dialog's lower-case ids (EsignModal; the transmit, Module 3 and protocol
 * routes validate the same lower-case set) — kept exactly as declared, because
 * readers compare the stored value case-sensitively (protocol reviews, the
 * document lifecycle). Nothing outside this list is a meaning: the shared
 * writer refuses it before anything is written.
 */
export const GOVERNED_SIGN_MEANINGS = [
  ...TASK_SIGNATURE_MEANINGS,
  'authorship',
  'review',
  'approval',
  'responsibility',
  'release',
] as const;
export type GovernedSignMeaning = (typeof GOVERNED_SIGN_MEANINGS)[number];

/*
 * The meanings each kind of signed act can carry (§11.50(a)(3); plan P1-51,
 * DP-64). A meaning is what the signer declares the signature to mean, and it
 * has to be true of the act. Until 2026-10-01 every domain route that signs
 * through routes/governed-signed-act.ts accepted the whole vocabulary, so a
 * biosketch was finalized "as review" and an IRB approval could be signed "as
 * release". Each of those routes now declares one of these sets, and the
 * ceremony refuses any other meaning before it asks for the password. The ids
 * are the sign dialog's (client/src/concept2cure/_shared/esignMeanings.ts).
 */
/** A decision on a record (approving, certifying, executing, determining, finalizing it): the signer approves it or answers for it. */
export const DECISION_ACT_MEANINGS = ['approval', 'responsibility'] as const satisfies readonly GovernedSignMeaning[];
/** Finalizing a record the signer may have written (a biosketch, a data management plan): authorship too. */
export const AUTHORED_RECORD_ACT_MEANINGS = ['authorship', 'approval', 'responsibility'] as const satisfies readonly GovernedSignMeaning[];
/** Signing off a review's own record (an audit-trail or access review): the signer reviewed. */
export const REVIEW_ACT_MEANINGS = ['review'] as const satisfies readonly GovernedSignMeaning[];
/** Signing off an assessment, or closing a deviation: the signer reviewed it, approves its outcome, or answers for it. */
export const SIGN_OFF_ACT_MEANINGS = ['review', 'approval', 'responsibility'] as const satisfies readonly GovernedSignMeaning[];

/** True only for a string that is exactly one of GOVERNED_SIGN_MEANINGS. */
export function isGovernedSignMeaning(value: unknown): value is GovernedSignMeaning {
  return typeof value === 'string' && (GOVERNED_SIGN_MEANINGS as readonly string[]).includes(value);
}

/**
 * Why a declared meaning is refused, or null when it is one of
 * GOVERNED_SIGN_MEANINGS. Every route that takes a signer's meaning checks it
 * BEFORE re-authentication, so no one is asked for a password for a request the
 * shared writer (persistGovernedActionSignature) would refuse anyway.
 */
export function signMeaningRefusal(
  meaning: unknown,
): { error: 'SIGNATURE_MEANING_REQUIRED' | 'SIGNATURE_MEANING_UNKNOWN'; detail: string } | null {
  const detail = `One of: ${GOVERNED_SIGN_MEANINGS.join(', ')}.`;
  if (typeof meaning !== 'string' || meaning.length === 0) return { error: 'SIGNATURE_MEANING_REQUIRED', detail };
  if (!isGovernedSignMeaning(meaning)) return { error: 'SIGNATURE_MEANING_UNKNOWN', detail };
  return null;
}
