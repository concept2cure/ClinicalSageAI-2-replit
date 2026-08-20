/**
 * Engine result → authored-section HTML (BP-W2-4).
 *
 * Biostat and PV results carry a reproducibility stamp
 * (`c2c-stats 1.0.0 · inputs <sha256> · reproducible`) and are exactly the
 * content a statistical analysis plan or signal-detection report needs — but
 * they could not leave the screen. This module renders a computed result as
 * the HTML a governed authoring section stores, so `saveToAuthoring` can file
 * it and the Word/PDF export renders it as a real table with the stamp intact.
 *
 * Two contracts hold here:
 *  1. Only tags the export parser's allowlist knows (`p`, `b`, `i`, `table`,
 *    `thead`, `tbody`, `tr`, `th`, `td`) — an unrecognised tag would drop the
 *    stamp at export time, which is the silent-loss failure this exists to
 *    avoid.
 *  2. The stamp carries the FULL inputs hash, not the 12-character display
 *    truncation: the hash is the reproducibility claim, and a truncated hash
 *    cannot be re-verified.
 */

export interface EngineProvenance {
  engine?: string;
  engineVersion?: string;
  method?: string;
  seed?: number;
  inputsSha256?: string;
  reproducible?: boolean;
  generatedAt?: string;
}

function esc(v: unknown): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** The stamp line as authored-section HTML. Exported for reuse in tests. */
export function provenanceStampHtml(p: EngineProvenance): string {
  const bits: string[] = [];
  if (p.method) bits.push(esc(p.method));
  bits.push(`${esc(p.engine ?? 'c2c-stats')} ${esc(p.engineVersion ?? '')}`.trim());
  if (typeof p.seed === 'number') bits.push(`seed ${esc(p.seed)}`);
  if (p.inputsSha256) bits.push(`inputs ${esc(p.inputsSha256)}`);
  if (p.reproducible) bits.push('reproducible');
  if (p.generatedAt) bits.push(esc(p.generatedAt));
  return `<p><i>${bits.join(' · ')}</i></p>`;
}

/**
 * Render a computed result as a titled key/value table plus the stamp.
 * `rows` is the same [label, value] list the calculator surface tabulates —
 * what the user saw is what is filed.
 */
export function engineResultToHtml(args: {
  title: string;
  rows: Array<[string, unknown]>;
  provenance: EngineProvenance | null | undefined;
}): string {
  const body = args.rows
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join('');
  const table =
    `<table><thead><tr><th>Quantity</th><th>Value</th></tr></thead>` +
    `<tbody>${body}</tbody></table>`;
  const stamp = args.provenance ? provenanceStampHtml(args.provenance) : '';
  return `<p><b>${esc(args.title)}</b></p>${table}${stamp}`;
}
