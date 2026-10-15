/**
 * Compare two versions of a Vault document (plan critique 15, row D2).
 *
 * Opened from an earlier version in the versions list. Reads
 * GET /api/c2c/project-vault/:id/documents/:documentId/compare?against=…, where
 * the server diffs the two versions' extracted text and recorded details
 * (vault-version-compare.ts). It shows what the server compared and nothing
 * more:
 *   - whether the bytes are the same, from the recorded SHA-256s;
 *   - each recorded detail that differs;
 *   - the changed lines, marked + and − as well as by colour, with unchanged
 *     runs collapsed to a count;
 *   - when the text could not be compared, why;
 *   - when the comparison was capped, that it was.
 * A comparison that could not be read is an error, never an empty difference.
 */
import React from 'react';
import { I } from '../icons';
import { useLiveData, type ShapeGuard } from '../dataConnect';

type Hunk = { kind: 'same' | 'added' | 'removed'; lines: string[] } | { kind: 'skipped'; count: number };

interface Side { id: string; version: string | null; contentHash: string | null; current: boolean }

export interface CompareShape {
  from: Side;
  to: Side;
  sameBytes: boolean;
  details: Array<{ field: 'title' | 'type' | 'classification' | 'fileName'; from: string | null; to: string | null }>;
  text:
    | { available: true; identical: boolean; truncated: boolean; counts: { added: number; removed: number; unchanged: number }; hunks: Hunk[] }
    | { available: false; reason: string };
}

const isCompareShape: ShapeGuard<CompareShape> = (v): v is CompareShape =>
  !!v && typeof v === 'object' && !!(v as CompareShape).from && !!(v as CompareShape).to && !!(v as CompareShape).text;

const FIELD: Record<CompareShape['details'][number]['field'], string> = {
  title: 'Title', type: 'Type', classification: 'Classification', fileName: 'File name',
};

const vLabel = (s: Side) => (s.version ? `v${s.version}` : 'version not recorded');
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The text comparison's headline, in words. */
export function textSummary(text: CompareShape['text']): string {
  if (!text.available) return text.reason;
  if (text.identical) return 'The text is the same in both versions.';
  const { added, removed, unchanged } = text.counts;
  const base = `${plural(added, 'line')} added, ${plural(removed, 'line')} removed, ${plural(unchanged, 'line')} unchanged.`;
  return text.truncated ? `${base} The comparison was capped; download both versions to see all of it.` : base;
}

const MARK: Record<'same' | 'added' | 'removed', string> = { same: '  ', added: '+ ', removed: '− ' };

function Hunks({ hunks }: { hunks: Hunk[] }) {
  return (
    <div className="vd-cmp-lines" role="list" aria-label="Changed lines">
      {hunks.map((h, i) =>
        h.kind === 'skipped' ? (
          <div key={i} className="vd-cmp-skip" role="listitem">… {plural(h.count, 'unchanged line')} …</div>
        ) : (
          h.lines.map((line, j) => (
            <div key={`${i}-${j}`} className={`vd-cmp-line vd-cmp-${h.kind}`} role="listitem">
              <span className="vd-cmp-mark" aria-label={h.kind === 'same' ? undefined : h.kind}>{MARK[h.kind]}</span>
              {line || ' '}
            </div>
          ))
        ),
      )}
    </div>
  );
}

export function VaultVersionCompare({
  projectId, documentId, againstId, onClose,
}: { projectId: string; documentId: string; againstId: string; onClose: () => void }) {
  const path =
    `/api/c2c/project-vault/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}` +
    `/compare?against=${encodeURIComponent(againstId)}`;
  const st = useLiveData<CompareShape>(path, [path], isCompareShape);
  const close = <button className="vd-dr-toggle" onClick={onClose}>Close comparison</button>;

  if (st.loading) return <div className="vd-cmp" data-testid="vault-version-compare"><div className="vd-d-idx">Comparing…</div></div>;
  if (st.error || !st.data) {
    return (
      <div className="vd-cmp" data-testid="vault-version-compare">
        <div className="vd-dr-err" role="alert">
          {I.alertTriangle} The two versions could not be compared. Nothing is shown rather than a partial comparison.
        </div>
        {close}
      </div>
    );
  }
  const d = st.data;
  return (
    <div className="vd-cmp" data-testid="vault-version-compare">
      <div className="vd-cmp-head">
        <b>{vLabel(d.from)} → {vLabel(d.to)}{d.to.current ? ' (current)' : ''}</b>
        <span className="vd-dr-meta">
          {d.sameBytes ? 'Same bytes: the SHA-256 is identical.' : 'Different bytes: the SHA-256 differs.'}
        </span>
        {close}
      </div>
      {d.details.length > 0 ? (
        <ul className="vd-cmp-details">
          {d.details.map((c) => (
            <li key={c.field}>{FIELD[c.field]}: “{c.from ?? '—'}” → “{c.to ?? '—'}”</li>
          ))}
        </ul>
      ) : (
        <div className="vd-dr-meta">The recorded title, type, classification and file name are the same.</div>
      )}
      <div className={d.text.available ? 'vd-dr-meta' : 'vd-d-idx'} role="status">{textSummary(d.text)}</div>
      {d.text.available && !d.text.identical ? <Hunks hunks={d.text.hunks} /> : null}
    </div>
  );
}
