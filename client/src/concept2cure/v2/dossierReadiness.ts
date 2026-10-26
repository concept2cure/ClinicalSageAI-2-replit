/**
 * Dossier readiness — the one readiness the server computes for a program.
 *
 * server/services/c2c/dossier-read.ts measures it as the share of the
 * program's home filing sections that are approved or locked; a market added
 * to the project is measured on its own line and cannot move it (FILING_SPINE
 * F23). The Projects list (`readiness` and `readinessState` on each row),
 * Project home's card (GET …/dossier) and the detail read all carry that one
 * figure. They print it through here, so the screens cannot name it
 * differently or turn "not measured" or "unavailable" into 0.
 *
 * QA 2026-10-08 (j1): one program read "Readiness not measured" on its card, no
 * figure at all on its project home, and three other numbers on three screens
 * outside the launch catalog.
 */

export const DOSSIER_READINESS_LABEL = 'Dossier readiness';

/** What the figure measures, for a tooltip or a hint. */
export const DOSSIER_READINESS_MEANS =
  'The share of this project’s own filing sections that are approved or locked. Empty headings that hold other sections are not counted. A market added to the project is measured on its own line.';

/** The state of a figure, as the server states it: measured, nothing to
 *  count, or not read. */
export type DossierFigureState = 'measured' | 'no_sections' | 'unavailable';

/** Whether there is a figure to draw: a number the server measured. A server
 *  that sends no state (before F23) is read by its number alone. */
export function isMeasuredReadiness(pct: number | null | undefined, state?: DossierFigureState | null): pct is number {
  return (state == null || state === 'measured') && typeof pct === 'number' && Number.isFinite(pct);
}

/** The figure as the screens print it: "62%", "not measured" or
 *  "unavailable", never a 0 for no figure. */
export function dossierReadinessValue(pct: number | null | undefined, state?: DossierFigureState | null): string {
  if (state === 'unavailable') return 'unavailable';
  return isMeasuredReadiness(pct, state) ? `${pct}%` : 'not measured';
}

/** When the server measured the figure, as a sentence; null with no usable time
 *  (the figure is measured on each read: filing-spine design review, item 9). */
export function dossierReadinessAsOf(iso: string | null | undefined): string | null {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return `Measured ${d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.`;
}
