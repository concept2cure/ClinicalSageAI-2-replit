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
