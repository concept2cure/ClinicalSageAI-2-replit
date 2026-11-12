/**
 * On file at the agency: the application as the agency holds it now (gap 6.1;
 * docs/design/ECTD_FILED_STATE_VIEW_2026-10-22.md).
 *
 * Reads GET /api/ectd-compile/:ident/filed-state: every sent or acknowledged
 * sequence of the submission this surface compiles, folded by the same fold
 * compile and transmit use (server/services/ectd/prior-sequence-loader.ts).
 * Each document names the sequence that holds it and the act that put it
 * there, and its history: every filed act on it, oldest first, including the
 * document a replacement under a new name took off file (gap 6.2). The
 * sequences the view does not include are named with the reason.
 *
 * Each filed sequence is read from what its transmit recorded it sent; one
 * sent before the platform kept that is read from its compiles, and the card
 * names it, because its compiles may list a document its send did not carry,
 * or miss one it did (`basis`, 2026-11-01, F1, rows D7 and D2). A sent sequence
 * with neither record is named as not included: nothing on record says what it
 * carried. Dispatch statuses are said in the words the agency's hold is said in
 * elsewhere (dispatchWords, CommitmentRow.tsx), never as stored values, except
 * an unresolved send ('transmitting'), which is never said to be off file: the
 * platform does not know whether the agency holds it.
 *
 * A failed read is said, never shown as an empty dossier, and "nothing is on
 * file" is said only when the read succeeded, with why: no sequence was filed,
 * or the filed sequences withdrew every document they filed. While a sent
 * sequence has no record, or a send is unresolved, the card claims neither an
 * empty nor a complete dossier (F1 review).
 *
 * @module client/src/concept2cure/v2/surfaces/EctdFiledState
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { dispatchWords } from './CommitmentRow';

/** One filed act on a document: the sequence, what it did, and the file it carried. */
export interface FiledAct { sequenceNumber: string; operation: string; fileName: string }
export interface FiledLeaf {
  ctdSection: string;
  fileName: string;
  title: string | null;
  href: string | null;
  sequenceNumber: string | null;
  operation: string | null;
  md5: string;
  /** Oldest first; absent from a server that predates it. */
  history?: FiledAct[];
}
export interface FiledSequenceState {
  sequenceNumber: string;
  dispatchStatus: string | null;
  filed: boolean;
  /**
   * Where its record of what it put on file is read from: 'transmit', what its
   * transmit recorded it sent; 'compiles', its compiles, for a sequence sent
   * before the platform kept that. Null when not filed; absent from a server
   * that predates it, which read compiles only.
   */
  basis?: 'transmit' | 'compiles' | null;
  /** P-99 C2: a record put on record after the send, read back from the package it sent, and when. */
  restored?: { how: 'read-back'; on: string } | null;
}
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

/** Sent or acknowledged, so the agency holds it, but the view read no record of what it carried. */
const isUnrecorded = (s: FiledSequenceState) => !s.filed && (s.dispatchStatus === 'sent' || s.dispatchStatus === 'acknowledged');
/** A send that was claimed and never settled: the bytes may be at the agency (submission-service resendRefusal). */
const isUnresolved = (s: FiledSequenceState) => !s.filed && s.dispatchStatus === 'transmitting';

/** Why a sequence is not in the view: a sent one has no record of what it carried; an unresolved send is not known. */
function notFoldedReason(s: FiledSequenceState): string {
  if (isUnrecorded(s)) return `${dispatchWords(s.dispatchStatus)}, but nothing on record says what it carried`;
  // Never "not on file": the package may have reached the agency, and the platform does not know (F1 review).
  if (isUnresolved(s)) return 'a send of it is unresolved, so whether the agency holds it is not known; confirm at the agency';
  return dispatchWords(s.dispatchStatus);
}

/** "Includes 0000 (acknowledged by the agency), 0001 (sent to the agency). Not included: 0002 (not on file at the agency)." */
export function sequencesLine(sequences: FiledSequenceState[]): string {
  const folded = sequences.filter((s) => s.filed).map((s) => `${s.sequenceNumber} (${dispatchWords(s.dispatchStatus)})`);
  const left = sequences.filter((s) => !s.filed).map((s) => `${s.sequenceNumber} (${notFoldedReason(s)})`);
  return [folded.length ? `Includes ${folded.join(', ')}.` : '', left.length ? `Not included: ${left.join(', ')}.` : ''].filter(Boolean).join(' ');
}

/** "0000", "0000 and 0001", "0000, 0001 and 0002". */
const andList = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] ?? '');

/** "Sequence 0000 is" / "Sequences 0000 and 0001 are", and the pronouns that follow. */
function named(numbers: string[], capital = true) {
  const one = numbers.length === 1;
  const noun = one ? 'equence' : 'equences';
  return { subject: `${capital ? 'S' : 's'}${noun} ${andList(numbers)}`, is: one ? 'is' : 'are', its: one ? 'its' : 'their', it: one ? 'it' : 'they', obj: one ? 'it' : 'them' };
}

/**
 * The filed sequences read from their compiles, and what that means; null when
 * every filed sequence is read from what it sent. One without a `basis` came
 * from a server that read compiles only, so it is named too. When some are read
 * from what they sent, both are named, so no sentence claims one basis for all
 * (F1 review). A compile is not proof of a send either way: a document may be
 * listed that the send did not carry, or missing that it did.
 */
export function compilesLine(sequences: FiledSequenceState[]): string | null {
  const fromCompiles = sequences.filter((s) => s.filed && s.basis !== 'transmit').map((s) => s.sequenceNumber);
  if (fromCompiles.length === 0) return null;
  const fromSends = sequences.filter((s) => s.filed && s.basis === 'transmit').map((s) => s.sequenceNumber);
  const c = named(fromCompiles, fromSends.length === 0);
  const compiles = `${c.subject} ${c.is} read from ${c.its} compiles, recorded before the platform kept what each send carried, `
    + `so what is listed for ${c.obj} may differ from what ${c.it} sent: a document may be listed that ${c.it} did not carry, `
    + `or be missing that ${c.it} did.`;
  if (fromSends.length === 0) return compiles;
  const s = named(fromSends);
  return `${s.subject} ${s.is} read from what ${s.it} sent; ${compiles}`;
}

/** P-99 C2: the sequences whose record was read back from the package each sent, after the send, and when; or null. */
export function restoredLine(sequences: FiledSequenceState[]): string | null {
  const day = (iso: string) => (Number.isFinite(Date.parse(iso))
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'an unrecorded day');
  const said = sequences.filter((s) => s.filed && s.basis === 'transmit' && s.restored?.how === 'read-back')
    .map((s) => `Sequence ${s.sequenceNumber} is read from what it sent (read back from the package it sent, on ${day(s.restored!.on)}).`);
  return said.length ? said.join(' ') : null;
}

/**
 * What the record cannot say about the agency's hold, or null: a sent sequence
 * no record describes, and a send that never settled. While either stands, the
 * card claims neither an empty nor a complete dossier (F1 review).
 */
function unknownClause(sequences: FiledSequenceState[]): string | null {
  const unrecorded = sequences.filter(isUnrecorded).map((s) => s.sequenceNumber);
  const unresolved = sequences.filter(isUnresolved).map((s) => s.sequenceNumber);
  const parts = [
    unrecorded.length ? `nothing on record says what ${named(unrecorded, false).subject} carried` : '',
    unresolved.length ? `whether the agency received ${named(unresolved, false).subject} is not yet known` : '',
  ].filter(Boolean);
  return parts.length ? parts.join('; ') : null;
}

/** What is on file and what it is read from; "nothing" is said apart from "all withdrawn", and never over an unknown. */
function leadLine(view: FiledStateView): string {
  const count = view.leaves.length;
  const filed = view.sequences.filter((s) => s.filed);
  const documents = `${count} ${count === 1 ? 'document is' : 'documents are'}`;
  // "Each sequence" only when every filed one is: otherwise the compiles note names both.
  const allSent = filed.length > 0 && filed.every((s) => s.basis === 'transmit');
  const unknown = unknownClause(view.sequences);
  if (unknown) {
    const shown = count === 0
      ? 'No document is shown as on file'
      : `${documents} shown as on file${allSent ? ', read from what each included sequence sent' : ''}`;
    return `${shown}, but that is not known in full: ${unknown}, so the agency may hold documents, or versions of them, that are not shown.`;
  }
  if (count === 0) {
    return filed.length > 0
      ? 'Nothing is on file: every document the included sequences filed has been withdrawn.'
      : 'Nothing is on file: no sequence of this submission has been sent or acknowledged with a record of what it carried.';
  }
  return `${documents} on file${allSent ? ', read from what each sequence sent' : ''}.`;
}

const ACT_LABEL: Record<string, string> = { new: 'new', replace: 'replaced', append: 'appended', delete: 'withdrawn' };

/** "Filed 0000 new (general.pdf), 0001 replaced (general-v2.pdf)": only when there is more than the one act shown. */
export function historyLine(history: FiledAct[] | undefined): string | null {
  if (!history || history.length < 2) return null;
  return `Filed ${history.map((a) => `${a.sequenceNumber} ${ACT_LABEL[a.operation] ?? a.operation} (${a.fileName})`).join(', ')}`;
}

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
              {historyLine(l.history) && (
                <div style={{ color: 'var(--text-400)', fontSize: 11.5 }} data-testid="ectd-filed-history">{historyLine(l.history)}</div>
              )}
            </td>
            <td className="mono">{l.sequenceNumber ?? '—'}</td>
            <td>{l.operation ? ACT_LABEL[l.operation] ?? l.operation : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The view; the server's reason when it does not read a filed state for this
 *  project (422 ECTD_NOT_APPLICABLE: not an application, and nothing dispatched,
 *  3b slice 3 (c) under P-97); or null when the read failed or answered
 *  something that is not one. */
async function readFiledState(identPath: string, seqQuery: string): Promise<FiledStateView | { notApplicable: string } | null> {
  try {
    const res = await apiRequest('GET', `/api/ectd-compile/${identPath}/filed-state${seqQuery}`);
    const body: unknown = await res.json().catch(() => null);
    return res.ok && isFiledStateView(body) ? body : null;
  } catch (err) {
    const { status, payload } = (err ?? {}) as { status?: unknown; payload?: unknown };
    const error = (payload as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    if (status === 422 && error?.code === 'ECTD_NOT_APPLICABLE' && typeof error.message === 'string' && error.message.trim()) {
      return { notApplicable: error.message };
    }
    return null;
  }
}

function headline(state: 'loading' | 'error' | 'ready' | 'not_applicable', view: FiledStateView | null): string {
  if (state === 'error') return 'not loaded';
  if (state === 'not_applicable') return 'not an eCTD application';
  if (state === 'loading' || !view) return '…';
  if (view.throughSequence) return `through sequence ${view.throughSequence}`;
  return unknownClause(view.sequences) ? 'not fully known' : 'nothing on file';
}

function FiledStateBody({ view }: { view: FiledStateView }) {
  const modules = new Map<string, FiledLeaf[]>();
  for (const l of view.leaves) {
    const m = moduleOf(l.ctdSection);
    modules.set(m, [...(modules.get(m) ?? []), l]);
  }
  const compiles = compilesLine(view.sequences);
  const restored = restoredLine(view.sequences);
  return (
    <>
      <p style={{ fontSize: 12, margin: 0, padding: '10px 10px 0' }}>
        {leadLine(view)}
        {restored ? ` ${restored}` : ''}
        {compiles ? ` ${compiles}` : ''}
        {view.sequences.length > 0 ? ` ${sequencesLine(view.sequences)}` : ''}
      </p>
      {[...modules.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, leaves]) => <ModuleTable key={m} module={m} leaves={leaves} />)}
    </>
  );
}

export function EctdFiledState({ identPath, seqQuery, isScopeCurrent }: { identPath: string | null; seqQuery: string; isScopeCurrent: () => boolean }) {
  const [state, setState] = useState<'loading' | 'error' | 'ready' | 'not_applicable'>('loading');
  const [view, setView] = useState<FiledStateView | null>(null);
  const [notApplicable, setNotApplicable] = useState<string | null>(null);
  const revision = useRef(0);
  const load = useCallback(async () => {
    if (identPath == null || !isScopeCurrent()) return;
    const request = ++revision.current;
    setState('loading');
    const read = await readFiledState(identPath, seqQuery);
    if (!isScopeCurrent() || revision.current !== request) return;
    if (read && 'notApplicable' in read) { setView(null); setNotApplicable(read.notApplicable); setState('not_applicable'); return; }
    setNotApplicable(null); setView(read); setState(read ? 'ready' : 'error');
  }, [identPath, seqQuery, isScopeCurrent]);
  useEffect(() => { void load(); }, [load]);

  let body: React.ReactNode;
  if (state === 'loading') body = <EmptyState icon={I.clock} title="Loading what is on file…" busy />;
  else if (state === 'not_applicable') body = <EmptyState icon={I.fileText} title="Nothing is on file for this project" hint={notApplicable ?? undefined} />;
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
