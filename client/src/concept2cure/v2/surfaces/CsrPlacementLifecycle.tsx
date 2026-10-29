/**
 * The eCTD lifecycle of a CSR placement, on the build board (2026-10-30, D2).
 * Rendered by CsrAssemblyControl's placement form.
 *
 * - Before placing, for the chosen sequence: each file's operation (new, or a
 *   replace of the study's earlier file for the same part, with that leaf and
 *   its sequence), read from GET …/assembly/:id/lifecycle. An earlier file the
 *   assembly no longer has is listed; the user chooses, for each, that it
 *   stays on file or that it is withdrawn in this sequence (placement then
 *   writes that delete, naming the leaf, with the user's reason). Of two
 *   current files for one part, the user may withdraw the one no longer
 *   current. Nothing is withdrawn that the user did not choose (review fix,
 *   2026-10-30: no Submission Center screen could name the earlier leaf).
 * - After a placement refused part-way: "Withdraw the partly placed CSR files"
 *   (POST …/assembly/:id/withdraw-placement), with a reason. Only the files
 *   that placement wrote are removed, in its still-open sequence.
 * A failed read or a refusal is an alert with the server's words.
 */
import React, { useEffect, useState } from 'react';
import { apiCall, apiErrorText } from '../apiCall';
import { I } from '../icons';

interface Parent { leafId: number; sequenceNumber: string; title: string }
interface PlannedLeaf { appendix: string; fileName: string; title: string; operation: 'new' | 'replace'; parent: Parent | null }
interface Predecessor { leafId: number; sequenceNumber: string; title: string; part: string }
export interface CsrLifecyclePlan {
  studyId: string; leaves: PlannedLeaf[]; undecided: Predecessor[]; keptOnFile: Predecessor[]; withdrawnHere: Predecessor[]; withdrawing?: Predecessor[];
  ambiguous: Array<{ part: string; leaves: Predecessor[] }>;
}

export function partLabel(part: string): string {
  if (part === 'body') return 'Report body';
  if (part === '14') return 'Section 14 tables';
  return part.startsWith('16') ? `Appendix ${part}` : part;
}

/** The plan for one sequence; null until read or when no sequence is chosen. */
export function useLifecyclePlan(base: string, assemblyId: number, sequenceId: string) {
  const [state, setState] = useState<{ plan: CsrLifecyclePlan | null; error: string | null }>({ plan: null, error: null });
  useEffect(() => {
    setState({ plan: null, error: null });
    if (!sequenceId) return;
    let live = true;
    void apiCall<{ lifecycle?: CsrLifecyclePlan }>('GET', `${base}/${assemblyId}/lifecycle?sequenceId=${encodeURIComponent(sequenceId)}`).then(result => {
      if (!live) return;
      if (result.ok && result.body?.lifecycle && Array.isArray(result.body.lifecycle.leaves)) setState({ plan: result.body.lifecycle, error: null });
      else setState({ plan: null, error: apiErrorText(result, 'What these files replace in that sequence could not be read.') });
    });
    return () => { live = false; };
  }, [base, assemblyId, sequenceId]);
  return state;
}

/** The user's choice for each earlier file: it stays on file, or it is withdrawn in this sequence. */
export interface LifecycleDecisions { keepOnFile: number[]; withdraw: number[] }
export const NO_DECISIONS: LifecycleDecisions = { keepOnFile: [], withdraw: [] };

/** Whether the plan still holds something only the user can decide. */
export function lifecycleOpen(plan: CsrLifecyclePlan | null, d: LifecycleDecisions): boolean {
  if (!plan) return false;
  const decided = (id: number) => d.keepOnFile.includes(id) || d.withdraw.includes(id);
  // Of two or more current files for one part, at most one may remain.
  const unresolved = plan.ambiguous.some(a => a.leaves.filter(l => !d.withdraw.includes(l.leafId)).length > 1);
  return unresolved || [...plan.undecided, ...plan.keptOnFile].some(p => !decided(p.leafId));
}

function decide(d: LifecycleDecisions, id: number, choice: 'keep' | 'withdraw' | null): LifecycleDecisions {
  const keepOnFile = d.keepOnFile.filter(k => k !== id);
  const withdraw = d.withdraw.filter(k => k !== id);
  if (choice === 'keep') keepOnFile.push(id);
  if (choice === 'withdraw') withdraw.push(id);
  return { keepOnFile, withdraw };
}

export function PlacementLifecycle({ plan, error, decisions, setDecisions }: {
  plan: CsrLifecyclePlan | null; error: string | null; decisions: LifecycleDecisions; setDecisions: (d: LifecycleDecisions) => void;
}) {
  if (error) return <p role="alert">{error}</p>;
  if (!plan) return null;
  const leftOut = [...plan.undecided, ...plan.keptOnFile];
  const choose = (id: number, choice: 'keep' | 'withdraw' | null) => setDecisions(decide(decisions, id, choice));
  return <div style={{ display: 'grid', gap: 4 }}>
    <ul aria-label="Lifecycle of each file" style={{ margin: 0 }}>
      {plan.leaves.map(l => <li key={l.fileName}>
        <span className="mono">{l.fileName}</span> {partLabel(l.appendix)}:{' '}
        {l.parent ? `replaces leaf ${l.parent.leafId} (${l.parent.title}) in sequence ${l.parent.sequenceNumber}` : `new (study ${plan.studyId} has no earlier file for this part)`}
      </li>)}
    </ul>
    {plan.ambiguous.map(a => <div key={a.part}>
      <p role="alert">
        {partLabel(a.part)} of study {plan.studyId} has more than one current file in earlier sequences ({a.leaves.map(l => `leaf ${l.leafId} in sequence ${l.sequenceNumber}`).join(' and ')}).
        Choose to withdraw, in this sequence, each one that is no longer current.
      </p>
      {a.leaves.map(l => <label key={l.leafId} style={{ display: 'block' }}>
        <input type="checkbox" checked={decisions.withdraw.includes(l.leafId)} onChange={e => choose(l.leafId, e.target.checked ? 'withdraw' : null)} />{' '}
        Withdraw in this sequence: {l.title}, sequence {l.sequenceNumber}, leaf {l.leafId}
      </label>)}
    </div>)}
    {plan.withdrawnHere.map(p => <p key={p.leafId}>{partLabel(p.part)} (leaf {p.leafId}, sequence {p.sequenceNumber}) is withdrawn in this sequence.</p>)}
    {leftOut.length > 0 && <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend><strong>Earlier files this assembly does not have</strong></legend>
      <p>Each stays current at the agency unless it is withdrawn. Choose, for each, that it stays on file or that it is withdrawn in this sequence.</p>
      {leftOut.map(p => <div key={p.leafId} role="radiogroup" aria-label={`Earlier file leaf ${p.leafId}`}>
        <label style={{ display: 'block' }}>
          <input type="radio" name={`earlier-${p.leafId}`} checked={decisions.keepOnFile.includes(p.leafId)} onChange={() => choose(p.leafId, 'keep')} />{' '}
          Stays on file: {partLabel(p.part)} ({p.title}), sequence {p.sequenceNumber}, leaf {p.leafId}
        </label>
        <label style={{ display: 'block' }}>
          <input type="radio" name={`earlier-${p.leafId}`} checked={decisions.withdraw.includes(p.leafId)} onChange={() => choose(p.leafId, 'withdraw')} />{' '}
          Withdraw in this sequence: {partLabel(p.part)} ({p.title}), sequence {p.sequenceNumber}, leaf {p.leafId}
        </label>
      </div>)}
    </fieldset>}
  </div>;
}

/** "Withdraw the partly placed CSR files": only what the part-way placement wrote, in its still-open sequence. */
export function WithdrawPartialPlacement({ base, assemblyId, sequenceNumber, onDone }: { base: string; assemblyId: number; sequenceNumber: string; onDone: () => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withdraw = async () => {
    setBusy(true); setError(null);
    const result = await apiCall('POST', `${base}/${assemblyId}/withdraw-placement`, { reason });
    setBusy(false);
    if (!result.ok) { setError(apiErrorText(result, 'The partly placed CSR files were not withdrawn.')); return; }
    await onDone();
  };
  return <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
    <span>Or remove the files this placement wrote from sequence {sequenceNumber}:</span>
    <label>Reason for withdrawal <input className="c2c-input" value={reason} maxLength={2000} onChange={e => setReason(e.target.value)} /></label>
    <button type="button" className="btn" disabled={busy || reason.trim().length < 8} onClick={() => void withdraw()}>
      {I.archive} {busy ? 'Withdrawing…' : 'Withdraw the partly placed CSR files'}
    </button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
