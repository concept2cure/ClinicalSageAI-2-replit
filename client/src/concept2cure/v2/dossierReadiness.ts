/**
 * Dossier readiness — the one readiness the server computes for a program.
 *
 * `readinessByProject` (server/routes/c2c/projects.ts) measures it as the share
 * of the program's governed document sections that are approved or locked, and
 * answers null when there is nothing to measure or the read failed. The
 * Projects list (`readiness` on each row) and Project home (`readiness` on the
 * detail read) both carry that one figure. They print it through here, so the
 * two screens cannot name it differently or turn "not measured" into 0.
 *
 * QA 2026-10-08 (j1): one program read "Readiness not measured" on its card, no
 * figure at all on its project home, and three other numbers on three screens
 * outside the launch catalog.
 */

export const DOSSIER_READINESS_LABEL = 'Dossier readiness';

/** What the figure measures, for a tooltip or a hint. */
export const DOSSIER_READINESS_MEANS =
  'The share of this program’s governed document sections that are approved or locked.';

/** The figure as the screens print it: "62%", or "not measured" — never a 0 for no figure. */
export function dossierReadinessValue(readiness: number | null | undefined): string {
  return typeof readiness === 'number' && Number.isFinite(readiness) ? `${readiness}%` : 'not measured';
}

/** When the server measured the figure, as a sentence; null with no usable time
 *  (the figure is measured on each read: filing-spine design review, item 9). */
export function dossierReadinessAsOf(iso: string | null | undefined): string | null {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return `Measured ${d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.`;
}
