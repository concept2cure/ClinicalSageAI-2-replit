// Shared loading / empty / error states + status chip for CMC surfaces.
// Status chips never rely on color alone (text + icon).

import * as React from 'react';
import { CmcIcon } from '../icons';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="cmc-state" role="status">{label}</div>;
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="cmc-state cmc-state-err" role="alert">
      {message ?? 'Could not load this data. Try again.'}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="cmc-state">{children}</div>;
}

export function NoProject() {
  return (
    <div className="cmc-state">
      Select a project to load Module 3 data.
    </div>
  );
}

type Tone = 'ok' | 'warn' | 'err' | 'dim';

const TONE_ICON: Record<Tone, string> = {
  ok: 'checkCircle',
  warn: 'warning',
  err: 'xCircle',
  dim: 'alertCircle',
};

/** Status chip — pairs a tone with a text label and a matching icon so the
 *  state is never conveyed by color alone. */
export function StatusChip({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`cmc-chip cmc-chip-${tone}`}>
      <CmcIcon name={TONE_ICON[tone]} />
      {label}
    </span>
  );
}

// ── Readable result rendering ───────────────────────────────────────────────
// AI / service endpoints return heterogeneous shapes (free-text narratives,
// region maps, attribute arrays). These helpers render them as readable prose,
// tables, or key/value lists — never a raw JSON dump to the user.

function humanizeKey(k: string): string {
  const s = k.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Format a single cell without emitting raw JSON. */
function formatCell(v: unknown): string {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.map(formatCell).join(', ');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const named = o.name ?? o.label ?? o.title ?? o.id;
    if (typeof named === 'string') return named;
    const firstStr = Object.values(o).find(x => typeof x === 'string');
    return (firstStr as string | undefined) ?? '—';
  }
  return String(v);
}

/** Free-text / narrative result, rendered as readable prose. */
export function ProseResult({ text }: { text: string }) {
  return <div className="cmc-prose">{text}</div>;
}

/** Array of records → table. Columns are the union of scalar keys (capped). */
export function DataTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (!rows.length) return <Empty>No rows returned.</Empty>;
  const cols: string[] = [];
  for (const row of rows) {
    for (const k of Object.keys(row)) if (!cols.includes(k)) cols.push(k);
  }
  const shown = cols.slice(0, 6);
  return (
    <table className="bp-table">
      <thead>
        <tr>{shown.map(c => <th key={c}>{humanizeKey(c)}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>{shown.map(c => <td key={c}>{formatCell(row[c])}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

/** Object → key/value list. */
export function KeyValues({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([k]) => k !== 'success' && k !== 'downloadUrl');
  return (
    <dl className="cmc-kv">
      {entries.map(([k, v]) => (
        <div className="cmc-kv-row" key={k}>
          <dt>{humanizeKey(k)}</dt>
          <dd>{formatCell(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Resilient dispatch: string → prose, array → table, object → key/values. */
export function ResultView({ value }: { value: unknown }) {
  if (value == null) return null;
  if (typeof value === 'string') return <ProseResult text={value} />;
  if (Array.isArray(value)) return <DataTable rows={value as Array<Record<string, unknown>>} />;
  if (typeof value === 'object') return <KeyValues data={value as Record<string, unknown>} />;
  return <ProseResult text={String(value)} />;
}
