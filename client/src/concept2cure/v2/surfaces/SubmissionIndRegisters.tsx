/**
 * The IND's registers on the IND screen (P-122, 2026-11-10): what the IND relies on and what it has filed since.
 * The IND screen (`IndLifecycle.tsx`, the `ind-checklist` surface) is a feature of Submission Center (P-32).
 *
 * The registers were built on the server and had no screen (P-122 inventory, vault-authoring-submission.md §3.1,
 * §4 #6). Each is a quiet section with its list and the actions its routes already offer
 * (`server/routes/ind-lifecycle/registers.routes.ts`):
 *   - Cross-references and letters of authorization (eCTD m1.4): every DMF, IND, NDA or BLA the IND relies on, the
 *     server's LOA-coverage QC over them, recording one, filing its letter as the m1.4.1 leaf of a new sequence,
 *     marking a letter on file, and removing one.
 *   - Annual reports (21 CFR 312.33): each tracked report with the due date and open sections the server computed, its
 *     state from the server's overdue feed (overdue, or no due date because no IND effective date was recorded), and
 *     tracking one. A tracked report is filed from the annual report on the Lifecycle tab.
 * Production serves exactly these paths (the `ind-checklist` claim in ui-surface-registry.ts), and each route admits
 * the submission's project for the person first. Counts and verdicts are the server's; this only shows them. A read
 * that fails says so, never "none recorded".
 *
 * The IND safety-report and ICSR registers beside them stay shut (P-32), and nothing here calls them.
 *
 * @module client/src/concept2cure/v2/surfaces/SubmissionIndRegisters
 */
import React, { useState } from 'react';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { useLiveData } from '../dataConnect';

interface CrossReference {
  id: string; referencedFileType: string; referencedFileNumber: string; subjectName: string;
  authorizedSections: string[]; loaOnFile: boolean; loaLeafSection: string | null;
}
interface CrossReferenceRegister {
  ready: boolean;
  findings: Array<{ fileLabel: string; severity: 'error' | 'warning'; code: string; message: string }>;
  counts: { total: number; withLoa: number; missingLoa: number };
}

interface AnnualReport {
  id: string; indNumber: string; reportingPeriodStart: string | null; reportingPeriodEnd: string | null;
  dueDate: string | null; status: string; gapCount: number; filedAt: string | null;
}
type OverdueReport = AnnualReport & { overdueState: 'overdue' | 'deadline_unknown' };

const isList = <T,>(v: unknown): v is T[] => Array.isArray(v);
/** A stored calendar date (UTC midnight), as the date it is. */
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Not known');
const isRegister = (v: unknown): v is CrossReferenceRegister =>
  !!v && typeof v === 'object' && Array.isArray((v as CrossReferenceRegister).findings) && !!(v as CrossReferenceRegister).counts;
const FILE_TYPES = ['DMF', 'IND', 'NDA', 'BLA'];
const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const linesOf = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);

/** Send one register change; the server's own sentence on a refusal, never a code. */
async function send(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: object): Promise<{ ok: true; json: any } | { ok: false; message: string }> {
  try {
    const res = await apiRequest(method, path, body);
    const json = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.ok) return { ok: true, json };
    return { ok: false, message: serverMessage(json) ?? `The server could not complete it (HTTP ${res.status}).` };
  } catch {
    return { ok: false, message: 'The server could not be reached. Nothing was changed.' };
  }
}

/** A labelled field in the register forms. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>{label}{children}</label>;
}

function RecordCrossReference({ submissionId, onDone }: { submissionId: number; onDone: (note: string | null) => void }) {
  const [f, setF] = useState({ type: '', number: '', subject: '', sections: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await send('POST', `/api/ind-lifecycle/submission/${submissionId}/cross-references`, {
      referencedFileType: f.type, referencedFileNumber: f.number.trim(), subjectName: f.subject.trim(), authorizedSections: linesOf(f.sections),
    });
    setBusy(false);
    if (r.ok) onDone(`${f.type} ${f.number.trim()} is recorded.`); else setError(r.message);
  };
  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: 'grid', gap: 8, margin: '8px 0 12px', maxWidth: 520 }} data-testid="indl-xref-form">
      <Field label="Referenced file type">
        <select className="c2c-input" value={f.type} onChange={set('type')} required>
          <option value="">Choose</option>
          {FILE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="File number"><input className="c2c-input" value={f.number} onChange={set('number')} required /></Field>
      <Field label="Subject (drug substance or product)"><input className="c2c-input" value={f.subject} onChange={set('subject')} required /></Field>
      <Field label="Sections relied on, one per line">
        <textarea className="c2c-input" value={f.sections} onChange={set('sections')} placeholder="e.g. 3.2.S Drug substance" style={{ minHeight: 56 }} />
      </Field>
      {error && <p role="alert" className="sec-sub">{error}</p>}
      <span className="pj-sec-acts">
        <button type="submit" className="btn primary sm" disabled={busy}>{busy ? 'Recording…' : 'Record'}</button>
        <button type="button" className="btn ghost sm" onClick={() => onDone(null)}>Cancel</button>
      </span>
    </form>
  );
}

function FileLetter({ submissionId, row, sponsorName, onDone }: {
  submissionId: number; row: CrossReference; sponsorName: string | null; onDone: (note: string | null) => void;
}) {
  const [f, setF] = useState({ sequence: '', holder: '', party: sponsorName ?? '', signatory: '', title: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await send('POST', `/api/ind-lifecycle/submission/${submissionId}/cross-references/${row.id}/file-loa`, {
      sequenceNumber: f.sequence.trim(), holderName: f.holder.trim(), authorizedPartyName: f.party.trim(),
      signatoryName: f.signatory.trim(), ...(f.title.trim() ? { signatoryTitle: f.title.trim() } : {}),
    });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    onDone(`The letter for ${row.referencedFileType} ${row.referencedFileNumber} is filed in sequence ${r.json?.sequence?.sequenceNumber ?? f.sequence.trim()} as the m1.4.1 leaf.`);
  };
  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: 'grid', gap: 8, margin: '8px 0 12px', maxWidth: 520 }} data-testid="indl-xref-file-loa">
      <p className="sec-sub">File the letter of authorization for {row.referencedFileType} {row.referencedFileNumber} as the m1.4.1 leaf of a new sequence.</p>
      <Field label="eCTD sequence number (4 digits)"><input className="c2c-input" inputMode="numeric" placeholder="e.g. 0003" value={f.sequence} onChange={set('sequence')} required /></Field>
      <Field label="File holder (grantor)"><input className="c2c-input" value={f.holder} onChange={set('holder')} required /></Field>
      <Field label="Authorized party (the sponsor)"><input className="c2c-input" value={f.party} onChange={set('party')} required /></Field>
      <Field label="Signatory (for the holder)"><input className="c2c-input" value={f.signatory} onChange={set('signatory')} required /></Field>
      <Field label="Signatory title (optional)"><input className="c2c-input" value={f.title} onChange={set('title')} /></Field>
      {error && <p role="alert" className="sec-sub">{error}</p>}
      <span className="pj-sec-acts">
        <button type="submit" className="btn primary sm" disabled={busy}>{busy ? 'Filing…' : 'File the letter'}</button>
        <button type="button" className="btn ghost sm" onClick={() => onDone(null)}>Cancel</button>
      </span>
    </form>
  );
}

/** One row's actions: file the letter, mark it on file or not, remove the row (asked once more first). */
function CrossReferenceActions({ row, busy, onFile, onMark, onRemove }: {
  row: CrossReference; busy: boolean; onFile: () => void; onMark: (onFile: boolean) => void; onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <span className="pj-sec-acts">
        <button type="button" className="btn ghost sm" disabled={busy} onClick={onRemove}>Remove {row.referencedFileType} {row.referencedFileNumber}</button>
        <button type="button" className="btn ghost sm" onClick={() => setConfirming(false)}>Keep</button>
      </span>
    );
  }
  return (
    <span className="pj-sec-acts">
      {!row.loaOnFile && <button type="button" className="btn ghost sm" disabled={busy} onClick={onFile}>File the letter</button>}
      <button type="button" className="btn ghost sm" disabled={busy} onClick={() => onMark(!row.loaOnFile)}>
        {row.loaOnFile ? 'Mark letter not on file' : 'Mark letter on file'}
      </button>
      <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setConfirming(true)}>Remove</button>
    </span>
  );
}

function CrossReferenceTable({ rows, busy, onFile, onMark, onRemove }: {
  rows: CrossReference[]; busy: boolean; onFile: (r: CrossReference) => void; onMark: (r: CrossReference, onFile: boolean) => void; onRemove: (r: CrossReference) => void;
}) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 12 }}>
      <table className="reg-tbl">
        <thead><tr><th scope="col">File</th><th scope="col">Subject</th><th scope="col">Sections relied on</th><th scope="col">Letter of authorization</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="mono">{r.referencedFileType} {r.referencedFileNumber}</td>
              <td>{r.subjectName}</td>
              <td>{r.authorizedSections.length > 0 ? r.authorizedSections.join('; ') : 'Not recorded'}</td>
              <td>{r.loaOnFile ? `On file${r.loaLeafSection ? ` (${r.loaLeafSection})` : ''}` : 'Not on file'}</td>
              <td><CrossReferenceActions row={r} busy={busy} onFile={() => onFile(r)} onMark={(v) => onMark(r, v)} onRemove={() => onRemove(r)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The server's LOA-coverage verdict, in its own counts and words. */
function CoverageVerdict({ register }: { register: CrossReferenceRegister }) {
  const { counts, findings, ready } = register;
  return (
    <>
      <p className="sec-sub" data-testid="indl-xref-verdict">
        {ready
          ? `Every file relied on has a letter of authorization on file (${plural(counts.total, 'file', 'files')}).`
          : `${plural(counts.total, 'file', 'files')} relied on; ${counts.withLoa.toLocaleString()} with a letter of authorization on file, ${counts.missingLoa.toLocaleString()} without.`}
      </p>
      {findings.length > 0 && (
        <ul className="sec-sub" style={{ margin: '0 0 12px', paddingLeft: 18 }}>
          {findings.map((f, i) => <li key={`${f.code}:${f.fileLabel}:${i}`}>{f.message}</li>)}
        </ul>
      )}
    </>
  );
}

/** What the register shows under its heading: reading, failed, empty, or the verdict and the list. */
function CrossReferenceBody({ rows, register, recording, retry, children }: {
  rows: { data: CrossReference[] | null; loading: boolean; error?: string };
  register: { data: CrossReferenceRegister | null; loading: boolean; error?: string };
  recording: boolean; retry: () => void; children: (rows: CrossReference[], register: CrossReferenceRegister) => React.ReactNode;
}) {
  if ((rows.loading && !rows.data) || (register.loading && !register.data)) return <p role="status" className="sec-sub">Reading the cross-reference register…</p>;
  if (rows.error || register.error || !rows.data || !register.data) {
    return <p role="alert" className="sec-sub">The cross-reference register could not be read, so nothing is shown. <button type="button" className="btn ghost sm" onClick={retry}>Retry</button></p>;
  }
  if (rows.data.length === 0) return recording ? null : <p className="sec-sub">No file this IND relies on is recorded yet.</p>;
  return <>{children(rows.data, register.data)}</>;
}

function CrossReferences({ submissionId, sponsorName }: { submissionId: number; sponsorName: string | null }) {
  const [version, setVersion] = useState(0);
  const [mode, setMode] = useState<{ kind: 'none' } | { kind: 'record' } | { kind: 'file'; row: CrossReference }>({ kind: 'none' });
  const [note, setNote] = useState<{ text: string; failed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = useLiveData<CrossReference[]>(`/api/ind-lifecycle/submission/${submissionId}/cross-references`, [submissionId, version], isList<CrossReference>);
  const register = useLiveData<CrossReferenceRegister>(`/api/ind-lifecycle/submission/${submissionId}/cross-reference-register`,
    [submissionId, version], isRegister);
  const finish = (text: string | null) => { setMode({ kind: 'none' }); if (text) { setNote({ text, failed: false }); setVersion((v) => v + 1); } };
  const change = async (method: 'PATCH' | 'DELETE', row: CrossReference, body: object | undefined, done: string) => {
    setBusy(true); setNote(null);
    const r = await send(method, `/api/ind-lifecycle/cross-references/${row.id}`, body);
    setBusy(false);
    setNote(r.ok ? { text: done, failed: false } : { text: r.message, failed: true });
    if (r.ok) setVersion((v) => v + 1);
  };
  const label = (r: CrossReference) => `${r.referencedFileType} ${r.referencedFileNumber}`;
  return (
    <div data-testid="indl-xref-register">
      <div className="pj-sec-h">
        <h3>Cross-references and letters of authorization</h3>
        {mode.kind === 'none' && (
          <span className="pj-sec-acts"><button type="button" className="btn ghost sm" onClick={() => { setNote(null); setMode({ kind: 'record' }); }}>Record a cross-reference</button></span>
        )}
      </div>
      {note && <p role={note.failed ? 'alert' : 'status'} className="sec-sub">{note.text}</p>}
      {mode.kind === 'record' && <RecordCrossReference submissionId={submissionId} onDone={finish} />}
      {mode.kind === 'file' && <FileLetter submissionId={submissionId} row={mode.row} sponsorName={sponsorName} onDone={finish} />}
      <CrossReferenceBody rows={rows} register={register} recording={mode.kind === 'record'} retry={() => setVersion((v) => v + 1)}>
        {(list, verdict) => (
          <>
            <CoverageVerdict register={verdict} />
            <CrossReferenceTable rows={list} busy={busy} onFile={(r) => setMode({ kind: 'file', row: r })}
              onMark={(r, v) => void change('PATCH', r, { loaOnFile: v }, `${label(r)}: the letter is marked ${v ? 'on file' : 'not on file'}.`)}
              onRemove={(r) => void change('DELETE', r, undefined, `${label(r)} is removed from the register.`)} />
          </>
        )}
      </CrossReferenceBody>
    </div>
  );
}

function TrackAnnualReport({ submissionId, productName, onDone }: { submissionId: number; productName: string | null; onDone: (note: string | null) => void }) {
  const [f, setF] = useState({ ind: '', product: productName ?? '', start: '', end: '', effective: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await send('POST', `/api/ind-lifecycle/submission/${submissionId}/annual-reports`, {
      report: { indNumber: f.ind.trim(), productName: f.product.trim(), reportingPeriodStart: f.start, reportingPeriodEnd: f.end },
      ...(f.effective ? { indEffectiveDate: f.effective } : {}),
    });
    setBusy(false);
    if (r.ok) onDone(`The report for ${f.start} to ${f.end} is tracked.`); else setError(r.message);
  };
  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: 'grid', gap: 8, margin: '8px 0 12px', maxWidth: 520 }} data-testid="indl-annual-form">
      <Field label="IND number"><input className="c2c-input" value={f.ind} onChange={set('ind')} required /></Field>
      <Field label="Product name"><input className="c2c-input" value={f.product} onChange={set('product')} required /></Field>
      <Field label="Reporting period start"><input className="c2c-input" type="date" value={f.start} onChange={set('start')} required /></Field>
      <Field label="Reporting period end"><input className="c2c-input" type="date" value={f.end} onChange={set('end')} required /></Field>
      <Field label="IND effective date (sets the due date)"><input className="c2c-input" type="date" value={f.effective} onChange={set('effective')} /></Field>
      {error && <p role="alert" className="sec-sub">{error}</p>}
      <span className="pj-sec-acts">
        <button type="submit" className="btn primary sm" disabled={busy}>{busy ? 'Tracking…' : 'Track'}</button>
        <button type="button" className="btn ghost sm" onClick={() => onDone(null)}>Cancel</button>
      </span>
    </form>
  );
}

/** The server's overdue feed, in its own words: what is overdue, and what cannot be known. */
function overdueSentence(feed: OverdueReport[]): string {
  const overdue = feed.filter((r) => r.overdueState === 'overdue').length;
  const unknown = feed.filter((r) => r.overdueState === 'deadline_unknown').length;
  if (overdue === 0 && unknown === 0) return 'No tracked report is overdue.';
  const parts = [
    ...(overdue > 0 ? [`${overdue.toLocaleString()} overdue`] : []),
    ...(unknown > 0 ? [`${unknown.toLocaleString()} with no due date, because no IND effective date was recorded`] : []),
  ];
  return `${parts.join('; ')}.`;
}

function annualState(r: AnnualReport, feed: OverdueReport[]): string {
  if (r.status === 'filed') return r.filedAt ? `Filed ${day(r.filedAt)}` : 'Filed';
  const state = feed.find((o) => o.id === r.id)?.overdueState;
  return state === 'overdue' ? 'Draft, overdue' : state === 'deadline_unknown' ? 'Draft, due date not known' : 'Draft';
}

function AnnualReportTable({ rows, feed }: { rows: AnnualReport[]; feed: OverdueReport[] }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 12 }}>
      <table className="reg-tbl">
        <thead><tr><th scope="col">Reporting period</th><th scope="col">IND</th><th scope="col">Due</th><th scope="col">Open sections</th><th scope="col">State</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{day(r.reportingPeriodStart)} to {day(r.reportingPeriodEnd)}</td>
              <td className="mono">{r.indNumber}</td>
              <td>{day(r.dueDate)}</td>
              <td>{r.gapCount.toLocaleString()}</td>
              <td>{annualState(r, feed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnnualReports({ submissionId, productName }: { submissionId: number; productName: string | null }) {
  const [version, setVersion] = useState(0);
  const [tracking, setTracking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const rows = useLiveData<AnnualReport[]>(`/api/ind-lifecycle/submission/${submissionId}/annual-reports`, [submissionId, version], isList<AnnualReport>);
  const feed = useLiveData<OverdueReport[]>(`/api/ind-lifecycle/submission/${submissionId}/annual-reports/overdue`,
    [submissionId, version], isList<OverdueReport>);
  const done = (text: string | null) => { setTracking(false); if (text) { setNote(text); setVersion((v) => v + 1); } };
  let body: React.ReactNode;
  if ((rows.loading && !rows.data) || (feed.loading && !feed.data)) body = <p role="status" className="sec-sub">Reading the annual-report tracker…</p>;
  else if (rows.error || feed.error || !rows.data || !feed.data) {
    body = <p role="alert" className="sec-sub">The annual-report tracker could not be read, so nothing is shown. <button type="button" className="btn ghost sm" onClick={() => setVersion((v) => v + 1)}>Retry</button></p>;
  } else if (rows.data.length === 0) body = tracking ? null : <p className="sec-sub">No annual report is tracked for this IND yet.</p>;
  else {
    body = (
      <>
        <p className="sec-sub" data-testid="indl-annual-verdict">{overdueSentence(feed.data)}</p>
        <AnnualReportTable rows={rows.data} feed={feed.data} />
      </>
    );
  }
  return (
    <div data-testid="indl-annual-register" style={{ marginTop: 16 }}>
      <div className="pj-sec-h">
        <h3>Annual reports (21 CFR 312.33)</h3>
        {!tracking && <span className="pj-sec-acts"><button type="button" className="btn ghost sm" onClick={() => { setNote(null); setTracking(true); }}>Track an annual report</button></span>}
      </div>
      {note && <p role="status" className="sec-sub">{note}</p>}
      {tracking && <TrackAnnualReport submissionId={submissionId} productName={productName} onDone={done} />}
      {body}
    </div>
  );
}

export function SubmissionIndRegisters({ submissionId, sponsorName, productName }: {
  submissionId: number | null; sponsorName: string | null; productName: string | null;
}) {
  return (
    <section className="pj-card" data-testid="indl-registers" aria-labelledby="indl-registers-h" style={{ marginTop: 16 }}>
      <div className="pj-card-h"><h2 className="t" id="indl-registers-h">Registers</h2><span className="s">what this IND relies on and what it has filed since</span></div>
      <div className="pj-card-b">
        {submissionId == null
          ? <p className="sec-sub">This checklist carries no submission, so there is no register to show.</p>
          : (
            <>
              <CrossReferences submissionId={submissionId} sponsorName={sponsorName} />
              <AnnualReports submissionId={submissionId} productName={productName} />
            </>
          )}
      </div>
    </section>
  );
}
