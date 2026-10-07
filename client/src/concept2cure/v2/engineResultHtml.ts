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

export interface EngineResultTable {
  label: string;
  /** Optional display labels; unlisted keys are still carried, never dropped. */
  columns?: ReadonlyArray<{ key: string; label: string }>;
  rows: ReadonlyArray<Record<string, unknown> | null>;
}

/** Stable union across ALL rows, not just the first row's schema. */
export function engineResultTableColumns(table: EngineResultTable): Array<{ key: string; label: string }> {
  const columns: Array<{ key: string; label: string }> = [];
  const seen = new Set<string>();
  const add = (key: string, label: string) => {
    if (!seen.has(key)) { seen.add(key); columns.push({ key, label }); }
  };
  for (const column of table.columns ?? []) add(column.key, column.label);
  for (const row of table.rows) {
    if (row !== null) for (const key of Object.keys(row)) add(key, key);
  }
  return columns;
}

/** Shared screen/file table text. No rounding of the engine's numeric values. */
export function engineResultCellText(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
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
 * Render a computed result as titled scalar/structured tables plus the stamp.
 * `rows` is the same [label, value] list the calculator surface tabulates —
 * what the user saw is what is filed.
 */
export function engineResultToHtml(args: {
  title: string;
  rows: Array<[string, unknown]>;
  tables?: ReadonlyArray<EngineResultTable>;
  provenance: EngineProvenance | null | undefined;
}): string {
  const body = args.rows
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join('');
  const table =
    `<table><thead><tr><th>Quantity</th><th>Value</th></tr></thead>` +
    `<tbody>${body}</tbody></table>`;
  const structuredTables = (args.tables ?? []).map((result) => {
    const columns = engineResultTableColumns(result);
    const head = columns.length > 0
      ? columns.map((column) => `<th>${esc(column.label)}</th>`).join('')
      : '<th>Record</th>';
    const records = result.rows.map((row) => {
      const cells = columns.length > 0
        ? columns.map(({ key }) => `<td>${esc(engineResultCellText(
          row !== null && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : null,
        ))}</td>`).join('')
        : `<td>${esc(engineResultCellText(row))}</td>`;
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<p><b>${esc(result.label)}</b></p><table><thead><tr>${head}</tr></thead><tbody>${records}</tbody></table>`;
  }).join('');
  const stamp = args.provenance ? provenanceStampHtml(args.provenance) : '';
  return `<p><b>${esc(args.title)}</b></p>${table}${structuredTables}${stamp}`;
}
