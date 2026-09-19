/**
 * The one palette the Data Origins surfaces share.
 *
 * These values were inline in DataOriginsPanel.tsx. They moved here when the
 * document-level attribution bar needed the same ink, rule and status colours:
 * two copies of a palette drift, and two lineage surfaces disagreeing about
 * what "attributed" looks like is worse than most drift, because a reader
 * learns the colours on one and carries that reading to the other.
 *
 * ── WHY TWO OF THESE ARE HEX AND THE REST ARE TOKENS ─────────────────────────
 * `--text-100`, `--text-400`, `--border` and `--bg-000` are global. `--success`
 * is NOT: it is declared only on the pdev module's scoped root
 * (concept2cure/pdev/app.css), so `var(--success)` resolves to nothing on these
 * surfaces, and `--ok: var(--success)` in index.css inherits that gap. Until
 * there is a global status token, naming the colour outright is honest, whereas
 * a var() that silently resolves to nothing would render an invisible bar.
 *
 * Both hexes are AA against `--bg-000` for normal text (OK 5.4:1, WARN 4.6:1),
 * which is why they are safe as label colours and not only as fills.
 */

export const INK = 'var(--text-100)';
export const MUTED = 'var(--text-400)';
export const RULE = 'var(--border)';
export const PANEL_BG = 'var(--bg-000)';

/** Attributed, and backed by something checkable. */
export const OK = '#047857';
/** Needs a human's attention — not an error, but not clean either. */
export const WARN = '#b45309';
