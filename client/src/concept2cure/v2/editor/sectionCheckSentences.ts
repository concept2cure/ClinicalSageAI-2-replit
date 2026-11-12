/**
 * The section check's summary sentences, split out of DocumentWorkbench.tsx
 * (2026-11-12, F1).
 *
 * The panel said "No flags. The section passed all N mechanical checks
 * (length, module keywords, CTD elements where defined, tables, placeholders,
 * structure)" whatever ran, and never showed the checks the server skipped
 * (`checks_skipped`). On an informed-consent form, where the CTD-shaped checks
 * are not run, that named five checks that never looked at the text. These
 * say what ran, and what did not and why, in the server's words.
 */
export interface SkippedCheck { id: string; reason: string }

const LABEL: Record<string, string> = {
  content_length: 'length',
  module_keywords: 'module keywords',
  ctd_required_elements: 'CTD elements',
  data_presence: 'tables',
  placeholder_text: 'placeholders',
  structure: 'structure',
};

/** The sentence when nothing was flagged. Names the checks only when every one of them ran. */
export function noFlagsSentence(run: number | undefined, skipped: readonly SkippedCheck[] | undefined): string {
  const counted = typeof run === 'number' && run > 0;
  if (!skipped?.length) {
    return (counted ? `No flags. The section passed all ${run} mechanical checks ` : 'No flags. The section passed the mechanical checks ') +
      '(length, module keywords, CTD elements where defined, tables, placeholders, structure) — this is not a review.';
  }
  return counted
    ? `No flags from the ${run} mechanical check${run === 1 ? '' : 's'} that ran — this is not a review.`
    : 'No mechanical check ran on this section.';
}

/** "Not run: length, tables, structure. <why>" — or null when everything ran. */
export function notRunSentence(skipped: readonly SkippedCheck[] | undefined): string | null {
  if (!skipped?.length) return null;
  const names = skipped.map((s) => LABEL[s.id] ?? s.id.replace(/_/g, ' '));
  const reasons = [...new Set(skipped.map((s) => s.reason.trim()).filter(Boolean))];
  return `Not run: ${names.join(', ')}. ${reasons.join(' ')}`.trim();
}
