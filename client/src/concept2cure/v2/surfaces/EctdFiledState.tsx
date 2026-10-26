/**
 * On file at the agency: the application as the agency holds it now (gap 6.1;
 * docs/design/ECTD_FILED_STATE_VIEW_2026-10-22.md).
 *
 * Reads GET /api/ectd-compile/:ident/filed-state: every sent or acknowledged
 * sequence of the submission this surface compiles, folded by the same fold
 * compile and transmit use (server/services/ectd/prior-sequence-loader.ts).
 * Each document names the sequence that holds it and the act that put it
 * there. The sequences the view does not include are named with the reason.
 *
 * A failed read is said, never shown as an empty dossier, and "nothing is on
 * file" is said only when the read succeeded and no sequence was filed.
 *
 * @module client/src/concept2cure/v2/surfaces/EctdFiledState
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';

export interface FiledLeaf {
  ctdSection: string;
  fileName: string;
  title: string | null;
  href: string | null;
  sequenceNumber: string | null;
  operation: string | null;
  md5: string;
}
export interface FiledSequenceState { sequenceNumber: string; dispatchStatus: string | null; filed: boolean }
export interface FiledStateView {
  submissionId: number | null;
  throughSequence: string | null;
  sequences: FiledSequenceState[];
  leaves: FiledLeaf[];
}

function isFiledStateView(body: unknown): body is FiledStateView {
  const b = body as Partial<FiledStateView> | null;
  return !!b && Array.isArray(b.leaves) && Array.isArray(b.sequences) && 'submissionId' in b;
}

/** Module 1–5 from the CTD section ("3.2.S.1" → "3"); anything else is listed as other. */
function moduleOf(section: string): string {
  const m = /^m?([1-5])(?:[.\s]|$)/i.exec(section.trim());
  return m ? m[1] : 'other';
}

/** Why a sequence is not in the view. */
function notFoldedReason(s: FiledSequenceState): string {
  if (s.dispatchStatus === 'sent' || s.dispatchStatus === 'acknowledged') {
    return `${s.dispatchStatus}, but no filed compile with a leaf manifest is on record`;
  }
  return s.dispatchStatus ? `${s.dispatchStatus}, not filed` : 'not sent';
}

/** "Folds 0000 (acknowledged), 0001 (sent). Not included: 0002 (not sent)." */
export function sequencesLine(sequences: FiledSequenceState[]): string {
  const folded = sequences.filter((s) => s.filed).map((s) => `${s.sequenceNumber} (${s.dispatchStatus})`);
  const left = sequences.filter((s) => !s.filed).map((s) => `${s.sequenceNumber} (${notFoldedReason(s)})`);
  return [folded.length ? `Folds ${folded.join(', ')}.` : '', left.length ? `Not included: ${left.join(', ')}.` : ''].filter(Boolean).join(' ');
}

const ACT_LABEL: Record<string, string> = { new: 'new', replace: 'replaced', append: 'appended' };

function ModuleTable({ module, leaves }: { module: string; leaves: FiledLeaf[] }) {
  const label = module === 'other' ? 'Other sections' : `Module ${module}`;
  return (
    <table className="reg-tbl" aria-label={`${label}: ${leaves.length} ${leaves.length === 1 ? 'document' : 'documents'} on file`}>
      <caption style={{ textAlign: 'left', fontWeight: 600, fontSize: 12.5, padding: '8px 10px 4px' }}>{label}</caption>
      <thead><tr><th>Section</th><th>Document</th><th>Held in sequence</th><th>Act</th></tr></thead>
      <tbody>
        {leaves.map((l) => (
          <tr key={`${l.ctdSection}:${l.sequenceNumber}:${l.fileName}`}>
            <td className="mono">{l.ctdSection}</td>
            <td>
              {l.title ?? l.fileName}
              <div className="mono" style={{ color: 'var(--text-400)', fontSize: 11.5 }}>{l.href ?? l.fileName}</div>
            </td>
            <td className="mono">{l.sequenceNumber ?? '—'}</td>
            <td>{l.operation ? ACT_LABEL[l.operation] ?? l.operation : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The view, or null when the read failed or answered something that is not one. */
async function readFiledState(identPath: string, seqQuery: string): Promise<FiledStateView | null> {
  try {
    const res = await apiRequest('GET', `/api/ectd-compile/${identPath}/filed-state${seqQuery}`);
    const body: unknown = await res.json().catch(() => null);
    return res.ok && isFiledStateView(body) ? body : null;
  } catch {
    return null;
  }
}

function headline(state: 'loading' | 'error' | 'ready', view: FiledStateView | null): string {
  if (state === 'error') return 'not loaded';
  if (state === 'loading' || !view) return '…';
  return view.throughSequence ? `through sequence ${view.throughSequence}` : 'nothing on file';
}

function FiledStateBody({ view }: { view: FiledStateView }) {
  const modules = new Map<string, FiledLeaf[]>();
  for (const l of view.leaves) {
    const m = moduleOf(l.ctdSection);
    modules.set(m, [...(modules.get(m) ?? []), l]);
  }
  const count = view.leaves.length;
  return (
    <>
      <p style={{ fontSize: 12, margin: 0, padding: '10px 10px 0' }}>
        {count === 0
          ? 'Nothing is on file: no sequence of this submission has been sent or acknowledged with a filed compile on record.'
          : `${count} ${count === 1 ? 'document is' : 'documents are'} on file, read from the leaf manifests of the filed sequences.`}
        {view.sequences.length > 0 ? ` ${sequencesLine(view.sequences)}` : ''}
      </p>
      {[...modules.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, leaves]) => <ModuleTable key={m} module={m} leaves={leaves} />)}
    </>
  );
}

export function EctdFiledState({ identPath, seqQuery, isScopeCurrent }: { identPath: string | null; seqQuery: string; isScopeCurrent: () => boolean }) {
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [view, setView] = useState<FiledStateView | null>(null);
  const revision = useRef(0);
  const load = useCallback(async () => {
    if (identPath == null || !isScopeCurrent()) return;
    const request = ++revision.current;
    setState('loading');
    const read = await readFiledState(identPath, seqQuery);
    if (!isScopeCurrent() || revision.current !== request) return;
    setView(read); setState(read ? 'ready' : 'error');
  }, [identPath, seqQuery, isScopeCurrent]);
  useEffect(() => { void load(); }, [load]);

  let body: React.ReactNode;
  if (state === 'loading') body = <EmptyState icon={I.clock} title="Loading what is on file…" busy />;
  else if (state === 'error' || !view) {
    body = <EmptyState tone="error" icon={I.alertTriangle} title="What is on file didn’t respond." hint="It is not shown as empty until it loads." retry={load} />;
  } else if (view.submissionId == null) {
    body = <EmptyState icon={I.fileText} title="No submission yet" hint="This project has no submission, so nothing is on file at the agency." />;
  }
  return (
    <div className="pj-card" data-testid="ectd-filed-state">
      <div className="pj-card-h"><span className="t">On file at the agency</span><span className="s">{headline(state, view)}</span></div>
      <div className="pj-card-b" style={{ padding: 0 }}>
        {body ? <div style={{ padding: 16 }}>{body}</div> : <FiledStateBody view={view!} />}
      </div>
    </div>
  );
}
