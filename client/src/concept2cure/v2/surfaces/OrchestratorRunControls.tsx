import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CsrSourceSelection } from '@shared/csr-source-input';
import { apiCall, apiErrorText } from '../apiCall';
import { EsignModal } from '../../_shared/components/EsignModal';
import { CsrNarrativeReadiness } from './CsrNarrativeReadiness';
import { CsrSourceInputControls } from './CsrSourceInputControls';

export interface PackageRunControlView {
  runId: string;
  submissionId: string;
  status: string;
  startedAt: string;
  steps: Array<{ key: string; status: string; outputRef?: string }>;
}
interface SavedRun { runId: string; status: string; startedAt: string }
interface Props {
  programId: string | null;
  sequenceId: number | null;
  run: PackageRunControlView | null;
  onLoad: (runId: string) => Promise<void>;
  selectedRunId: string | null;
  onBusyChange: (busy: boolean) => void;
  onNav?: (surface: string) => void;
}
async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const result = await apiCall<T>(method, path, body);
  if (!result.ok || !result.body) throw new Error(apiErrorText(result, 'The package request did not complete.'));
  return result.body;
}
/** Writes use the server's governed program inputs; credentials exist only in the shared ceremony. */
export function OrchestratorRunControls({ programId, sequenceId, run, onLoad, selectedRunId, onBusyChange, onNav }: Props) {
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [readState, setReadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [clinicalSource, setClinicalSource] = useState<{ programId: string; selection: CsrSourceSelection } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inputGaps, setInputGaps] = useState<string[]>([]);
  const [signedRunId, setSignedRunId] = useState<string | null>(null);
  const signatureRecorded = Boolean(run && signedRunId === run.runId);
  const [signOpen, setSignOpen] = useState(false);
  const [signTarget, setSignTarget] = useState<{ runId: string; submissionId: string } | null>(null);
  const blocked = busy || signOpen || sourceBusy;
  const selected = useRef(selectedRunId);
  selected.current = selectedRunId;
  const mounted = useRef(true);
  const scope = useRef(programId);
  const scopeRevision = useRef(0);
  if (scope.current !== programId) { scope.current = programId; ++scopeRevision.current; }
  const selectClinicalSource = useCallback((selection: CsrSourceSelection | null) => {
    if (scope.current !== programId) return;
    setClinicalSource(programId && selection ? { programId, selection } : null);
  }, [programId]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    setError(null); setNotice(null); setInputGaps([]); setSignOpen(false); setSignTarget(null); setSignedRunId(null); setBusy(false); setSourceBusy(false); setClinicalSource(null);
  }, [programId]);
  useSavedPackageRuns({ programId, refresh, setRuns, setReadState });
  useEffect(() => {
    if (run?.status !== 'awaiting-async') return;
    const timer = window.setInterval(() => { void onLoad(run.runId); }, 20_000);
    return () => window.clearInterval(timer);
  }, [run?.runId, run?.status, onLoad]);
  useEffect(() => { onBusyChange(blocked); return () => onBusyChange(false); }, [blocked, onBusyChange]);
  const scopeSnapshot = () => ({ programId, revision: scopeRevision.current });
  const current = (expected: ReturnType<typeof scopeSnapshot>) => mounted.current && scope.current === expected.programId && scopeRevision.current === expected.revision;
  const start = async () => {
    if (!programId || blocked) return;
    const expected = scopeSnapshot();
    const expectedSelection = selected.current;
    setBusy(true); setError(null); setNotice(null);
    try {
      const data = await request<PackageRunControlView & { inputGaps?: string[]; m3Refusal?: string | null; continuationError?: string | null }>('POST', '/api/submission-orchestrator/runs/for-program', { programId, ...(sequenceId ? { sequenceId } : {}), ...(clinicalSource?.programId === programId ? { clinicalSource: clinicalSource.selection } : {}) });
      if (!current(expected)) return;
      if (!data.runId) throw new Error('The server did not return a saved run identifier.');
      setRuns(items => [{ runId: data.runId, status: data.status, startedAt: data.startedAt }, ...items.filter(item => item.runId !== data.runId)]);
      setInputGaps(packageInputGaps(data));
      if (selected.current === expectedSelection) await onLoad(data.runId);
      else setNotice(`Run ${data.runId} is saved. The current selection was retained.`);
      if (data.continuationError) setNotice('The run is saved; continuation could not advance. Check / resume the saved run to retry.');
    } catch (cause) { if (current(expected)) setError((cause as Error).message); }
    finally { if (current(expected)) setBusy(false); }
  };
  const resume = async () => {
    if (!run || blocked) return;
    const expected = scopeSnapshot();
    setBusy(true); setError(null);
    try {
      const data = await request<{ continuation: string }>('POST', `/api/submission-orchestrator/runs/${encodeURIComponent(run.runId)}/resume`, {});
      if (!current(expected)) return;
      setNotice(data.continuation === 'busy' ? 'Another continuation is running. Check the run again.' : data.continuation === 'waiting' ? 'The run is still waiting for its required input or completed job.' : 'Continuation checked. The saved run below shows its current outcome.');
      if (selected.current === run.runId) await onLoad(run.runId);
    } catch (cause) { if (current(expected)) setError((cause as Error).message); }
    finally { if (current(expected)) setBusy(false); }
  };
  const { canSign, canResume } = runReleaseAvailability(run, signatureRecorded);
  return <div className="pj-card-b" style={{ display: 'grid', gap: 10 }}>
    <PackageRunToolbar programId={programId} blocked={blocked} busy={busy} runs={runs} run={run} readState={readState} canSign={canSign} canResume={Boolean(canResume)} signatureRecorded={signatureRecorded} start={start} resume={resume} onLoad={onLoad} openSign={() => { if (run) { setSignTarget({ runId: run.runId, submissionId: run.submissionId }); setSignOpen(true); } }} />
    <PackageRunMessages programId={programId} readState={readState} runs={runs} error={error} notice={notice} inputGaps={inputGaps} blocked={blocked} onRetry={() => { if (!blocked) setRefresh(value => value + 1); }} />
    <CsrSourceInputControls programId={programId} runId={run && run.runId === selectedRunId ? run.runId : null} interactionBusy={busy || signOpen} onSelectionChange={selectClinicalSource} onBusyChange={setSourceBusy} onNav={onNav} />
    <CsrNarrativeReadiness programId={programId} onNav={onNav} interactionBusy={blocked} />
    {signOpen && <EsignModal open={signOpen} action="Sign package release" target={signTarget?.runId ?? ''} targetMeta="Approval binds the frozen package digest. It does not transmit to an agency." meanings={['approval']} onClose={() => setSignOpen(false)} onSign={async input => {
      if (!signTarget || selected.current !== signTarget.runId) throw new Error('Reload the frozen run before signing.');
      const target = signTarget;
      const expectedProgram = scopeSnapshot();
      setBusy(true);
      try {
        const data = await request<{ signatureId: number; signedAt?: string | null; continuation?: string; already_signed?: boolean }>('POST', `/api/submissions/${encodeURIComponent(target.submissionId)}/sign-release`, { runId: target.runId, password: input.password, ...(input.totp ? { mfaToken: input.totp } : {}), signatureMeaning: 'approval', reason: input.reason });
        if (current(expectedProgram)) {
          const stillSelected = selected.current === target.runId;
          if (stillSelected) setSignedRunId(target.runId);
          // An idempotent response can name another original signer. Read the
          // stored manifestation below rather than print a new ceremony for it.
          if (data.already_signed) setSignOpen(false);
          setNotice(data.continuation === 'retry-required' ? `Signature #${data.signatureId} is recorded for run ${target.runId}; continuation needs retry.` : `Signature #${data.signatureId} is recorded for run ${target.runId}.`);
          if (stillSelected) await onLoad(target.runId);
        }
        return { meaning: input.meaning, reason: input.reason, signedAt: data.signedAt ?? '' };
      } finally { if (current(expectedProgram)) setBusy(false); }
    }} />}
  </div>;
}

function packageInputGaps(data: { inputGaps?: string[]; m3Refusal?: string | null }): string[] {
  return [...(data.inputGaps ?? []), ...(data.m3Refusal ? [data.m3Refusal] : [])];
}

function PackageRunToolbar({ programId, blocked, busy, runs, run, readState, canSign, canResume, signatureRecorded, start, resume, onLoad, openSign }: {
  programId: string | null; blocked: boolean; busy: boolean; runs: SavedRun[]; run: PackageRunControlView | null;
  readState: 'loading' | 'ready' | 'error'; canSign: boolean; canResume: boolean; signatureRecorded: boolean;
  start: () => Promise<void>; resume: () => Promise<void>; onLoad: Props['onLoad']; openSign: () => void;
}) { return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <button className="nda-open" disabled={!programId || blocked} onClick={() => void start()}>{busy ? 'Working…' : 'Build package run'}</button>
      <label>Saved package runs <select aria-label="Saved package runs" className="c2c-input" disabled={blocked || readState === 'loading'} value={runs.some(item => item.runId === run?.runId) ? run!.runId : ''} onChange={event => { if (!blocked && event.target.value) void onLoad(event.target.value); }}>
        <option value="">Choose a saved run</option>
        {runs.map(item => <option key={item.runId} value={item.runId}>{item.runId} · {item.status}</option>)}
      </select></label>
      {canSign && <button className="nda-open" disabled={blocked} onClick={openSign}>Sign package release</button>}
      {canResume && <button className="nda-open" disabled={blocked} onClick={() => void resume()}>{signatureRecorded ? 'Retry continuation' : 'Check / resume run'}</button>}
    </div>
  ); }

function runReleaseAvailability(run: PackageRunControlView | null, signatureRecorded: boolean) {
  return { canSign: run?.status === 'awaiting-signature' && !signatureRecorded,
    canResume: Boolean(run && (run.status === 'awaiting-signature' || run.status === 'awaiting-async' || signatureRecorded)) };
}
function PackageRunMessages({ programId, readState, runs, error, notice, inputGaps, blocked, onRetry }: {
  programId: string | null; readState: 'loading' | 'ready' | 'error'; runs: SavedRun[]; error: string | null;
  notice: string | null; inputGaps: string[]; blocked: boolean; onRetry: () => void;
}) { return <>
    {!programId && <p>Open a project with its canonical UUID to start or discover package runs.</p>}
    {readState === 'error' && <p role="alert">Couldn’t load saved package runs. Use Load run below or <button disabled={blocked} onClick={onRetry}>Retry saved runs</button>.</p>}
    {readState === 'ready' && programId && runs.length === 0 && <p>No saved package runs</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {inputGaps.map(gap => <p key={gap}>{gap}</p>)}
  </>; }

function useSavedPackageRuns({ programId, refresh, setRuns, setReadState }: {
  programId: string | null; refresh: number; setRuns: React.Dispatch<React.SetStateAction<SavedRun[]>>;
  setReadState: React.Dispatch<React.SetStateAction<'loading' | 'ready' | 'error'>>;
}) {
  useEffect(() => {
    let active = true;
    setRuns([]);
    if (!programId) { setReadState('ready'); return; }
    setReadState('loading');
    void request<{ runs: SavedRun[] }>('GET', `/api/submission-orchestrator/runs?programId=${encodeURIComponent(programId)}`).then(data => {
      if (!active) return;
      if (!Array.isArray(data.runs)) throw new Error('The saved-run response was incomplete.');
      setRuns(data.runs); setReadState('ready');
    }).catch(() => { if (active) setReadState('error'); });
    return () => { active = false; };
  }, [programId, refresh, setRuns, setReadState]);
}
