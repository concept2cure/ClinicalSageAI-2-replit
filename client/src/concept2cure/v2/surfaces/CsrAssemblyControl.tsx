/**
 * "Assemble CSR files" on the CSR build board (2026-10-30, reach of slice 8 of
 * docs/design/CSR_END_TO_END_2026-10-29.md). Sits under the section review and
 * the narratives (CsrWorkflowBoard in BiopharmaProject.tsx).
 *
 * - Queues an assembly of the build (POST /api/csr/jobs/:jobId/assembly). It
 *   runs off the request thread; the control polls and shows its stage and
 *   progress.
 * - Shows the result: every leaf (body, §14, each §16.2 listing, each supplied
 *   §16.1 / §16.3 document) with its page count and SHA-256, and every missing
 *   appendix with whether it blocks placement. A blocking appendix is supplied
 *   from the project's Vault, or declared not applicable with a reason, and the
 *   build is assembled again with those choices.
 * - Places the leaves into an open sequence of the program
 *   (POST …/assembly/:id/place). The server refuses a frozen or transmitted
 *   sequence and a missing blocking appendix; its refusal is shown as stated.
 * A failed read or a refusal is an alert, never an empty list.
 * - Lifecycle (2026-10-30, CsrPlacementLifecycle.tsx): for the chosen sequence,
 *   each file's operation (new, or replace of the study's earlier file) and the
 *   earlier files the assembly no longer has, each chosen to stay on file or
 *   to be withdrawn in this sequence; and, after a placement refused part-way,
 *   "Withdraw the partly placed CSR files".
 */
import { redactInternals } from '@/lib/queryClient';
import React, { useCallback, useEffect, useState } from 'react';
import { apiCall, apiErrorText } from '../apiCall';
import { I } from '../icons';
import { lifecycleOpen, NO_DECISIONS, PlacementLifecycle, useLifecyclePlan, WithdrawPartialPlacement, type LifecycleDecisions } from './CsrPlacementLifecycle';

interface Leaf { appendix: string; title: string; fileName: string; fileTag: string; origin: 'generated' | 'supplied'; ctdSection: string; pages: number | null; sha256: string }
interface Missing { number: string; title: string; fileTag: string; blocking: boolean; reason: string }
interface Summary {
  status: 'complete' | 'incomplete'; leaves: Leaf[]; missing: Missing[]; bodyGaps: string[];
  structure: { ok: boolean; findings: Array<{ file: string; message: string }>; bodyOutlineDepth: number; linksChecked: number };
  listings: Array<{ number: string; rows: number; pages: number; verified: boolean; findings: string[] }>;
  unresolvedReferences: Array<{ reference: string }>; pdfa: string;
  /** Drafted sections still holding a data placeholder; each blocks placement. */
  placeholderSections?: string[];
}
interface Declaration { reason: string; declaredBy: number; declaredAt: string }
/** 'interrupted': a placement whose worker stopped (no progress for 15 minutes); it is placed again into the same sequence, as a 'partial' one is. */
interface Placement {
  state: 'placing' | 'placed' | 'partial' | 'interrupted' | 'withdrawn'; sequenceId?: number; sequenceNumber: string; leaves?: Array<{ fileName: string }>; error?: string; placedAt?: string;
  /** Set when the partly placed files were withdrawn (csr-placement-withdraw.ts). */
  withdrawal?: { withdrawnBy: number; withdrawnAt: string; reason: string; sequenceNumber: string; removed: Array<{ fileName: string }>; notRemoved: Array<{ fileName: string; why: string }> };
}
export interface CsrAssemblyRun {
  id: number; status: 'queued' | 'assembling' | 'assembled' | 'failed'; progress: number; stage: string | null; updatedAt: string;
  notApplicable: Record<string, Declaration>; supplied: Record<string, { documentId: string; sha256: string }>;
  result: Summary | null; error: { code: string; message: string } | null; placement: Placement | null;
}
interface VaultPdf { documentId: string; title: string; version: string; sha256: string }
interface Target { sequenceId: number; sequenceNumber: string; status: string; submissionTitle: string }
type Message = { alert: boolean; text: string } | null;

const SUPPLIED = /^16\.(1\.\d+|3)$/;
const running = (a: CsrAssemblyRun | null | undefined) => a?.status === 'queued' || a?.status === 'assembling';

/** The build's newest assembly, polled while it runs. `undefined` until first read. */
function useAssembly(base: string) {
  const [assembly, setAssembly] = useState<CsrAssemblyRun | null | undefined>(undefined);
  const [readError, setReadError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const result = await apiCall<{ assembly?: CsrAssemblyRun | null }>('GET', base);
    if (result.ok && result.body && 'assembly' in result.body) { setAssembly(result.body.assembly ?? null); setReadError(null); return; }
    setReadError(apiErrorText(result, 'The CSR assembly could not be read.'));
  }, [base]);
  useEffect(() => { void load(); }, [load]);
  const active = running(assembly);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => { void load(); }, 2000);
    return () => clearInterval(timer);
  }, [active, load]);
  return { assembly, readError, load };
}

/** "Assemble CSR files": queue, progress, leaves, missing appendices, placement. */
export function CsrAssemblyControl({ jobId }: { jobId: number }) {
  const base = `/api/csr/jobs/${jobId}/assembly`;
  const { assembly, readError, load } = useAssembly(base);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [declared, setDeclared] = useState<Record<string, string>>({});
  const [supplied, setSupplied] = useState<Record<string, VaultPdf>>({});
  const assemble = async () => {
    if (busy || running(assembly)) return;
    setBusy(true); setMessage(null);
    const carried = Object.fromEntries(Object.entries(assembly?.notApplicable ?? {}).map(([n, d]) => [n, d.reason]));
    const notApplicable = { ...carried, ...Object.fromEntries(Object.entries(declared).filter(([, r]) => r.trim())) };
    const chosen = { ...(assembly?.supplied ?? {}), ...Object.fromEntries(Object.entries(supplied).map(([n, d]) => [n, { documentId: d.documentId, sha256: d.sha256 }])) };
    const result = await apiCall('POST', base, { notApplicable, supplied: chosen });
    setBusy(false);
    if (!result.ok) { setMessage({ alert: true, text: apiErrorText(result, 'The CSR assembly was not started.') }); return; }
    setDeclared({}); setSupplied({});
    setMessage({ alert: false, text: 'The CSR assembly is queued.' });
    await load();
  };
  return <section aria-label="CSR assembly" style={{ marginTop: 16, maxWidth: 900 }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <strong>CSR files</strong>
      <span>The body, the Section 14 tables and the §16 appendices as separate Module 5.3.5.1 files, each with its study tagging role</span>
      <button type="button" className="btn" disabled={busy || running(assembly) || assembly === undefined} onClick={() => void assemble()}>
        {I.layers} {busy ? 'Queueing…' : 'Assemble CSR files'}
      </button>
    </div>
    {message && <p role={message.alert ? 'alert' : 'status'}>{message.text}</p>}
    {readError && <p role="alert">{readError}</p>}
    {assembly === null && !readError && <p>This build has not been assembled.</p>}
    {assembly && <AssemblyState assembly={assembly} base={base} jobId={jobId} declared={declared} setDeclared={setDeclared}
      supplied={supplied} setSupplied={setSupplied} onPlaced={load} />}
  </section>;
}

function AssemblyState({ assembly, base, jobId, declared, setDeclared, supplied, setSupplied, onPlaced }: {
  assembly: CsrAssemblyRun; base: string; jobId: number; declared: Record<string, string>; setDeclared: (f: (d: Record<string, string>) => Record<string, string>) => void;
  supplied: Record<string, VaultPdf>; setSupplied: (f: (d: Record<string, VaultPdf>) => Record<string, VaultPdf>) => void; onPlaced: () => Promise<void>;
}) {
  if (running(assembly)) {
    return <div>
      <progress aria-label="Assembly progress" max={100} value={assembly.progress} />
      <p role="status">Assembling: {assembly.stage ?? 'queued'} ({assembly.progress}%). Last progress {new Date(assembly.updatedAt).toLocaleString()}.</p>
    </div>;
  }
  if (assembly.status === 'failed' || !assembly.result) {
    return <p role="alert">The assembly did not finish: {assembly.error?.message ?? 'no reason was recorded.'}</p>;
  }
  const result = assembly.result;
  return <div style={{ display: 'grid', gap: 8 }}>
    <AssemblyVerdict result={result} />
    <LeafTable leaves={result.leaves} />
    <MissingAppendices missing={result.missing} jobId={jobId} declared={declared} setDeclared={setDeclared} supplied={supplied} setSupplied={setSupplied} />
    <Declarations declarations={assembly.notApplicable} />
    <PlacementControl assembly={assembly} base={base} onPlaced={onPlaced} />
  </div>;
}

function AssemblyVerdict({ result }: { result: Summary }) {
  const unverified = result.listings.filter(l => !l.verified);
  return <div>
    <p role="status">{result.status === 'complete' ? 'Assembled; every check passed.' : 'Assembled, incomplete: see the gaps below.'}{' '}
      Contents to {result.structure.bodyOutlineDepth} level(s), {result.structure.linksChecked} link(s) checked
      {result.structure.ok ? ', all resolved.' : `, ${result.structure.findings.length} failed.`}</p>
    {result.structure.findings.map((f, i) => <p key={i} role="alert">{f.file}: {f.message}</p>)}
    {unverified.map(l => <p key={l.number} role="alert">Listing {l.number} does not agree with its source: {l.findings.join(' ')}</p>)}
    {(result.placeholderSections ?? []).map(c => <p key={c} role="alert">Section {c} still holds a data placeholder (text in square brackets). Blocks placement.</p>)}
    {result.bodyGaps.map(g => <p key={g}>Gap: {g}</p>)}
    {result.unresolvedReferences.length > 0 && <p>Unlinked references: {result.unresolvedReferences.map(r => r.reference).join(', ')}</p>}
    <p>{result.pdfa}</p>
  </div>;
}

function LeafTable({ leaves }: { leaves: Leaf[] }) {
  return <div style={{ overflowX: 'auto' }}><table aria-label="Assembled CSR files">
    <thead><tr><th scope="col">File</th><th scope="col">Content</th><th scope="col">Section</th><th scope="col">Pages</th><th scope="col">SHA-256</th></tr></thead>
    <tbody>{leaves.map(l => <tr key={l.fileName}>
      <td className="mono">{l.fileName}</td>
      <td>{l.title}{l.origin === 'supplied' ? ' (supplied)' : ''}</td>
      <td>{l.ctdSection} · {l.fileTag}</td>
      <td>{l.pages ?? 'Not counted (supplied PDF)'}</td>
      <td className="mono" style={{ overflowWrap: 'anywhere' }}>{l.sha256}</td>
    </tr>)}</tbody>
  </table></div>;
}

function MissingAppendices({ missing, jobId, declared, setDeclared, supplied, setSupplied }: {
  missing: Missing[]; jobId: number; declared: Record<string, string>; setDeclared: (f: (d: Record<string, string>) => Record<string, string>) => void;
  supplied: Record<string, VaultPdf>; setSupplied: (f: (d: Record<string, VaultPdf>) => Record<string, VaultPdf>) => void;
}) {
  const candidates = useVaultPdfs(jobId, missing.some(m => SUPPLIED.test(m.number)));
  if (!missing.length) return <p>No appendix is missing.</p>;
  return <div>
    <strong>Missing appendices</strong>
    {candidates.error && <p role="alert">{candidates.error}</p>}
    <ul aria-label="Missing appendices" style={{ listStyle: 'none', padding: 0, margin: '4px 0 0' }}>
      {missing.map(m => <li key={m.number} style={{ display: 'grid', gap: 4, padding: '4px 0' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="mono">{m.number}</span><span>{m.title}</span>
          <span className={`rd-chip tone-${m.blocking ? 'warn' : 'idle'}`}>{m.blocking ? 'Blocks placement' : 'Include if it applies'}</span>
        </div>
        <span>{m.reason}</span>
        {SUPPLIED.test(m.number) && <SupplyChoice number={m.number} documents={candidates.documents} chosen={supplied[m.number]}
          onChoose={doc => setSupplied(s => { const next = { ...s }; if (doc) next[m.number] = doc; else delete next[m.number]; return next; })} />}
        <label>Not applicable because{' '}
          <input className="c2c-input" value={declared[m.number] ?? ''} maxLength={2000}
            onChange={e => { const value = e.target.value; setDeclared(d => ({ ...d, [m.number]: value })); }} />
        </label>
      </li>)}
    </ul>
    <p>Supply or declare, then choose “Assemble CSR files” again: the report’s §16 list states each choice.</p>
  </div>;
}

function useVaultPdfs(jobId: number, wanted: boolean) {
  const [state, setState] = useState<{ documents: VaultPdf[] | null; error: string | null }>({ documents: null, error: null });
  useEffect(() => {
    if (!wanted) return;
    void apiCall<{ documents?: VaultPdf[] }>('GET', `/api/csr/jobs/${jobId}/assembly/supply-candidates`).then(result => {
      if (result.ok && Array.isArray(result.body?.documents)) setState({ documents: result.body!.documents!, error: null });
      else setState({ documents: null, error: apiErrorText(result, 'The project’s Vault documents could not be listed.') });
    });
  }, [jobId, wanted]);
  return state;
}

function SupplyChoice({ number, documents, chosen, onChoose }: { number: string; documents: VaultPdf[] | null; chosen?: VaultPdf; onChoose: (doc: VaultPdf | null) => void }) {
  if (documents === null) return null;
  if (!documents.length) return <span>No current PDF in this project’s Vault can be supplied.</span>;
  return <label>Supply from the Vault{' '}
    <select aria-label={`Supply appendix ${number}`} value={chosen?.documentId ?? ''} onChange={e => onChoose(documents.find(d => d.documentId === e.target.value) ?? null)}>
      <option value="">Choose a document</option>
      {documents.map(d => <option key={d.documentId} value={d.documentId}>{d.title} (version {d.version || 'unnumbered'})</option>)}
    </select>
  </label>;
}

function Declarations({ declarations }: { declarations: Record<string, Declaration> }) {
  const entries = Object.entries(declarations);
  if (!entries.length) return null;
  return <div>
    <strong>Declared not applicable</strong>
    <ul aria-label="Declared not applicable">{entries.map(([n, d]) => <li key={n}>
      <span className="mono">{n}</span> {d.reason} (user {d.declaredBy}, {new Date(d.declaredAt).toLocaleString()})
    </li>)}</ul>
  </div>;
}

function placementText(p: Placement): string {
  const files = p.leaves?.length ?? 0;
  if (p.state === 'placed') return `Placed in sequence ${p.sequenceNumber}: ${files} file(s).`;
  if (p.state === 'partial') return `Partly placed in sequence ${p.sequenceNumber}: ${files} file(s) before ${redactInternals(p.error, 'a refusal')}. Place again into sequence ${p.sequenceNumber} to finish.`;
  if (p.state === 'interrupted') return `Placement in sequence ${p.sequenceNumber} stopped before it finished: ${files} file(s) placed. Place again into sequence ${p.sequenceNumber} to finish.`;
  if (p.state === 'withdrawn' && p.withdrawal) {
    const w = p.withdrawal;
    const left = w.notRemoved.length ? ` ${w.notRemoved.length} recorded file(s) were not removed: ${w.notRemoved.map(n => `${n.fileName} (${n.why})`).join('; ')}.` : '';
    return `The partly placed files in sequence ${w.sequenceNumber} were withdrawn (${w.removed.length} file(s)) by user ${w.withdrawnBy}, ${new Date(w.withdrawnAt).toLocaleString()}: ${w.reason}.${left}`;
  }
  return `Being placed in sequence ${p.sequenceNumber}.`;
}

const isResumable = (p: Placement | null) => p?.state === 'partial' || p?.state === 'interrupted';
/** A placement whose partly placed files were withdrawn may be placed afresh. */
const isOpen = (p: Placement | null) => !p || isResumable(p) || p.state === 'withdrawn';

/** The program's open sequences, read unless the assembly is placed or being placed. */
function usePlacementTargets(base: string, wanted: boolean, setMessage: (m: Message) => void) {
  const [targets, setTargets] = useState<Target[] | null>(null);
  useEffect(() => {
    if (!wanted) return;
    void apiCall<{ sequences?: Target[] }>('GET', `${base}/targets`).then(result => {
      if (result.ok && Array.isArray(result.body?.sequences)) setTargets(result.body!.sequences!);
      else setMessage({ alert: true, text: apiErrorText(result, 'The program’s sequences could not be listed.') });
    });
  }, [base, wanted, setMessage]);
  return targets;
}

function PlacementControl({ assembly, base, onPlaced }: { assembly: CsrAssemblyRun; base: string; onPlaced: () => Promise<void> }) {
  const resumable = isResumable(assembly.placement);
  const [message, setMessage] = useState<Message>(null);
  const targets = usePlacementTargets(base, isOpen(assembly.placement), setMessage);
  if (!isOpen(assembly.placement)) return <p role="status">{placementText(assembly.placement!)}</p>;
  return <div style={{ display: 'grid', gap: 4 }}>
    <strong>Place into a sequence (Module 5.3.5.1)</strong>
    {assembly.placement && <p role={resumable ? 'alert' : 'status'}>{placementText(assembly.placement)}</p>}
    {resumable && <WithdrawPartialPlacement base={base} assemblyId={assembly.id} sequenceNumber={assembly.placement!.sequenceNumber} onDone={onPlaced} />}
    {targets !== null && targets.length === 0 && <p>This program has no open sequence. Create one in Submission Center first.</p>}
    {targets !== null && targets.length > 0 && <PlacementForm assembly={assembly} base={base} targets={targets} setMessage={setMessage} onPlaced={onPlaced} />}
    {message && <p role={message.alert ? 'alert' : 'status'}>{message.text}</p>}
  </div>;
}

function PlacementForm({ assembly, base, targets, setMessage, onPlaced }: {
  assembly: CsrAssemblyRun; base: string; targets: Target[]; setMessage: (m: Message) => void; onPlaced: () => Promise<void>;
}) {
  // A placement refused part-way, or interrupted, is finished in the sequence it started in.
  const [sequenceId, setSequenceId] = useState(isResumable(assembly.placement) && assembly.placement?.sequenceId ? String(assembly.placement.sequenceId) : '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [decisions, setDecisions] = useState<LifecycleDecisions>(NO_DECISIONS);
  const lifecycle = useLifecyclePlan(base, assembly.id, sequenceId);
  const place = async () => {
    setBusy(true); setMessage(null);
    const result = await apiCall('POST', `${base}/${assembly.id}/place`, { sequenceId: Number(sequenceId), reason,
      ...(decisions.keepOnFile.length ? { keepOnFile: decisions.keepOnFile } : {}), ...(decisions.withdraw.length ? { withdraw: decisions.withdraw } : {}) });
    setBusy(false);
    if (!result.ok) { setMessage({ alert: true, text: apiErrorText(result, 'The CSR files were not placed.') }); return; }
    await onPlaced();
  };
  return <div style={{ display: 'grid', gap: 4 }}><div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
    <select aria-label="Sequence" value={sequenceId} onChange={e => { setSequenceId(e.target.value); setDecisions(NO_DECISIONS); }}>
      <option value="">Choose a sequence</option>
      {targets.map(t => <option key={t.sequenceId} value={t.sequenceId}>{t.submissionTitle} · sequence {t.sequenceNumber} ({t.status})</option>)}
    </select>
    <label>Reason <input className="c2c-input" value={reason} maxLength={2000} onChange={e => setReason(e.target.value)} /></label>
    <button type="button" className="btn" disabled={busy || !sequenceId || reason.trim().length < 8 || lifecycleOpen(lifecycle.plan, decisions)} onClick={() => void place()}>
      {I.send} {busy ? 'Placing…' : 'Place CSR files'}
    </button>
  </div>
  <PlacementLifecycle plan={lifecycle.plan} error={lifecycle.error} decisions={decisions} setDecisions={setDecisions} />
  </div>;
}
