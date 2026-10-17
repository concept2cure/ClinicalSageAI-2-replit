import React, { useEffect, useId, useState } from 'react';
import { ApiRequestError, apiRequest } from '@/lib/queryClient';
import { isTaskFilingHome, type TaskFilingHome } from '@shared/types/task-filing-home';

interface Props {
  filingId: string;
  onClose: () => void;
}

type DetailState =
  | { id: string; kind: 'loading' }
  | { id: string; kind: 'error'; message: string }
  | { id: string; kind: 'ready'; data: TaskFilingHome };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readFailure(status?: number): string {
  if (status === 401) return 'Your session has expired. Sign in again, then retry this tracked filing.';
  if (status === 403) return 'You do not have access to this tracked filing.';
  if (status === 404) return 'This tracked filing was not found or is not available to you.';
  if (status === 503) return 'The tracked filing could not be read because the service is unavailable. Retry this record.';
  return 'The tracked filing could not be read. Retry this record.';
}

function RecordedDate({ value }: { value: string | null }) {
  return value ? <time dateTime={value}>{new Date(value).toLocaleString()}</time> : <>Not recorded</>;
}

function RecordedFiling({ data }: { data: TaskFilingHome }) {
  const { filing, home } = data;
  return <>
    <h3>{filing.title || filing.catalogKey}</h3>
    <p className="sp-state">Recorded filing details. Status and dates are the tracker’s saved values.</p>
    <table className="ub-inv" aria-label="Recorded filing details">
      <tbody>
        <tr><th scope="row">Catalog</th><td>{filing.catalogKey}</td></tr>
        <tr><th scope="row">Program type</th><td>{filing.programType} · {filing.variant}</td></tr>
        <tr><th scope="row">Status</th><td>{filing.status}</td></tr>
        <tr><th scope="row">Decision</th><td>{filing.decision || 'Not recorded'}</td></tr>
        <tr><th scope="row">FDA tracking number</th><td>{filing.fdaTrackingNumber || 'Not recorded'}</td></tr>
        <tr><th scope="row">Filed at</th><td><RecordedDate value={filing.filedAt} /></td></tr>
        <tr><th scope="row">Review goal</th><td>{filing.reviewGoalDays === null ? 'Not recorded' : `${filing.reviewGoalDays} days`}</td></tr>
        <tr><th scope="row">Decision due</th><td><RecordedDate value={filing.decisionDueAt} /></td></tr>
        <tr><th scope="row">Recorded document</th><td style={{ overflowWrap: 'anywhere' }}>{filing.filedArtifactDocumentId || 'No filed artifact document recorded'}</td></tr>
        <tr><th scope="row">Recorded SHA-256</th><td style={{ overflowWrap: 'anywhere' }}>{filing.filedArtifactSha256 || 'No filed artifact hash recorded'}</td></tr>
        <tr><th scope="row">Filing record ID</th><td>{filing.id}</td></tr>
        <tr><th scope="row">Project ID</th><td>{home.projectId ?? 'No project binding recorded'}</td></tr>
        <tr><th scope="row">Programme</th><td>{home.programId
          ? <>{home.programTitle || 'Untitled programme'} <span className="sp-row-s">· {home.programId}</span></>
          : 'No programme binding recorded'}</td></tr>
        <tr><th scope="row">Created</th><td><RecordedDate value={filing.createdAt} /></td></tr>
        <tr><th scope="row">Last updated</th><td><RecordedDate value={filing.updatedAt} /></td></tr>
        <tr><th scope="row">Notes</th><td style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{filing.notes || 'No notes recorded'}</td></tr>
      </tbody>
    </table>
    <p className="sp-state">Recorded artifact bindings do not establish that file bytes or an agency receipt have been verified.</p>
  </>;
}

/** Read-only native filing detail inside Submission Center; never changes the shell programme. */
export function TrackedFilingDetail({ filingId, onClose }: Props) {
  const headingId = useId();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DetailState>({ id: filingId, kind: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ id: filingId, kind: 'loading' });
    const load = async () => {
      try {
        const response = await apiRequest('GET', `/api/task-management/filings/${encodeURIComponent(filingId)}`);
        if (!response.ok) {
          if (active) setState({ id: filingId, kind: 'error', message: readFailure(response.status) });
          return;
        }
        const body: unknown = await response.json().catch(() => null);
        if (!isRecord(body) || body.success !== true || !isTaskFilingHome(body.data, filingId)) {
          if (active) setState({ id: filingId, kind: 'error', message: 'The tracked filing response was incomplete or did not match this record. Retry this record.' });
          return;
        }
        if (active) setState({ id: filingId, kind: 'ready', data: body.data });
      } catch (error) {
        if (active) setState({ id: filingId, kind: 'error', message: readFailure(error instanceof ApiRequestError ? error.status : undefined) });
      }
    };
    void load();
    return () => { active = false; };
  }, [filingId, attempt]);

  // Props can change before the effect runs: never paint another filing's saved data or failure.
  const current: DetailState = state.id === filingId ? state : { id: filingId, kind: 'loading' };
  return <section className="pj-card" aria-labelledby={headingId} data-testid="tracked-filing-detail">
    <div className="pj-card-h">
      <h2 className="t" id={headingId}>Tracked filing</h2>
      <button type="button" className="pj-card-h-go" onClick={onClose}>Close tracked filing</button>
    </div>
    <div className="pj-card-b">
      {current.kind === 'loading' ? <p role="status">Loading tracked filing…</p>
        : current.kind === 'error' ? <div>
          <p role="alert">{current.message}</p>
          <button type="button" className="pj-card-h-go" onClick={() => setAttempt((value) => value + 1)}>Retry tracked filing</button>
        </div>
          : <RecordedFiling data={current.data} />}
    </div>
  </section>;
}
