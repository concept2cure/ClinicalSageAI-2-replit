/**
 * The §11.50(a)(3) meaning of an electronic signature, in words.
 *
 * Signature stores hold the meaning as a token: the authoring store as
 * `AUTHOR` / `REVIEWER` / `APPROVER`, a package release as `approval` (OQ-8), a
 * QMS approval as `APPROVED`. Rendering the token raw puts a database enum
 * where the regulation asks for the meaning. Lifted out of
 * AuthoringSignatures.tsx (2026-09-24) so the eCTD release-signature panel
 * renders meanings the same way instead of keeping a second copy.
 *
 * An unrecognised meaning renders verbatim rather than being mapped to a guess;
 * a missing one says so.
 */
const MEANING_LABEL: Record<string, string> = {
  AUTHOR: 'Authorship',
  AUTHORSHIP: 'Authorship',
  REVIEWER: 'Review',
  REVIEW: 'Review',
  APPROVER: 'Approval',
  APPROVAL: 'Approval',
  APPROVED: 'Approval',
};

export function signatureMeaningLabel(m: string | null | undefined): string {
  if (!m) return 'Not recorded';
  return MEANING_LABEL[m.toUpperCase()] ?? m;
}
