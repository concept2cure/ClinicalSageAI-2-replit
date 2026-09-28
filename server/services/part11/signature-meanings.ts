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
