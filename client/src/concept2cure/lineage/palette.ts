/**
 * The one palette the Data Origins surfaces share.
 *
 * These values were inline in DataOriginsPanel.tsx. They moved here when the
 * document-level attribution bar needed the same ink, rule and status colours:
 * two copies of a palette drift, and two lineage surfaces disagreeing about
 * what "attributed" looks like is worse than most drift, because a reader
 * learns the colours on one and carries that reading to the other.
 *
 * ── THE STATUS COLOURS WERE HEX, AND THAT FAILED IN DARK MODE ────────────────
 * They were `#047857` and `#b45309`, and this header said both were "AA against
 * --bg-000 for normal text (OK 5.4:1, WARN 4.6:1)". Those ratios are real and
 * they are LIGHT-mode ratios. A fixed hex does not change when the theme does,
 * and `--bg-000` goes to #262624, so in dark mode the same two colours land at
 * 2.5:1 and 3.02:1. The claim was not wrong about what it measured; it was
 * silent about the half of the product it had not measured.
 *
 * Measured, not inferred: `scripts/visual-qa/dump-insert-gate.spec.tsx` captures
 * a conversation that contains the attribution bar, and `visual-qa:contrast`
 * puts it under the shipped stylesheets in Chromium. It reported WARN at
 * 3.02:1 on the `role="alert"` sentence "Attribution could not be read, so none
 * is shown." — a failure no gate had ever seen, because no capture had ever
 * included this surface (AnA reasoning round 13, 2026-10-11).
 *
 * The header's other claim has also expired. `--success` and `--warning` are
 * canonical now, declared on `:root` and redeclared for `.dark,
 * [data-theme="dark"]` (design-system/colors_and_type.css:181, 183, 452, 454),
 * each with its own measured ratios. So the reason for naming colours outright
 * is gone. The hex fallbacks are kept — a var() that resolved to nothing would
 * render an invisible bar, which is the failure the old note rightly feared —
 * and they are the canonical LIGHT values, so a surface outside the token scope
 * degrades to the design system's colour rather than to a third one.
 */

export const INK = 'var(--text-100)';
export const MUTED = 'var(--text-400)';
export const RULE = 'var(--border)';
export const PANEL_BG = 'var(--bg-000)';

/** Attributed, and backed by something checkable. */
export const OK = 'var(--success, #5e6d49)';
/** Needs a human's attention — not an error, but not clean either. */
export const WARN = 'var(--warning, #955d22)';
