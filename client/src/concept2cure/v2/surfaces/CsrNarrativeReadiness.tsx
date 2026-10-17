import React, { useEffect, useState } from 'react';
import { apiCall } from '../apiCall';

interface Readiness {
  programId: string;
  completedSummaryCount: number | null;
  rawTabulation: { status: 'not-linked'; studyCount: null };
  narrative: { available: false; code: 'CSR_NARRATIVE_INPUTS_REQUIRED'; message: string };
  requiredInputs: {
    studyData: { required: string[]; optional: string[] };
    studyInfo: { required: string[]; optional: string[] };
  };
}
function isReadiness(value: unknown, programId: string): value is Readiness {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<Readiness>;
  const fields = (v: unknown): v is { required: string[]; optional: string[] } => {
    if (!v || typeof v !== 'object') return false;
    const field = v as { required?: unknown; optional?: unknown };
    return Array.isArray(field.required) && field.required.every(item => typeof item === 'string')
      && Array.isArray(field.optional) && field.optional.every(item => typeof item === 'string');
  };
  return row.programId === programId
    && isSummaryCount(row.completedSummaryCount)
    && row.rawTabulation?.status === 'not-linked' && row.rawTabulation.studyCount === null
    && row.narrative?.available === false && row.narrative.code === 'CSR_NARRATIVE_INPUTS_REQUIRED'
    && typeof row.narrative.message === 'string'
    && fields(row.requiredInputs?.studyData) && fields(row.requiredInputs?.studyInfo);
}

function isSummaryCount(value: unknown): boolean {
  return value === null || (Number.isInteger(value) && Number(value) >= 0);
}

/** Completed summary reuse is distinct from generation from clinical observations. */
export function CsrNarrativeReadiness({ programId, onNav, interactionBusy }: {
  programId: string | null;
  onNav?: (surface: string) => void;
  interactionBusy: boolean;
}) {
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<{ programId: string; data?: Readiness; error?: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    setState(null);
    if (!programId) return;
    void apiCall<unknown>('GET', `/api/submission-orchestrator/csr/readiness?programId=${encodeURIComponent(programId)}`).then(result => {
      if (!active) return;
      setState(result.ok && isReadiness(result.body, programId) ? { programId, data: result.body } : { programId, error: true });
    }).catch(() => { if (active) setState({ programId, error: true }); });
    return () => { active = false; };
  }, [programId, refresh]);
  if (!programId) return null;
  const current = state?.programId === programId ? state : null;
  const data = current?.data;
  return <div aria-label="CSR narrative inputs">
    <strong>Clinical narrative inputs</strong>
    {!current && <p role="status">Checking CSR inputs…</p>}
    {current?.error && <p role="alert">Couldn’t confirm CSR inputs. <button type="button" onClick={() => setRefresh(value => value + 1)}>Retry CSR readiness</button></p>}
    {data && <>
      <p>{data.completedSummaryCount === null ? 'Completed CSR summary count is unavailable for this program.' : `${data.completedSummaryCount} completed CSR ${data.completedSummaryCount === 1 ? 'summary is' : 'summaries are'} available for package reuse.`}</p>
      <p>Raw clinical observations are not linked to the narrative generator. First-study AI narrative generation remains unavailable. The separate source-table controls can prepare deterministic tables for an explicitly selected source.</p>
      <p>Retain original source material in Vault and prepare governed narrative content in Authoring. A source-table preview does not generate a clinical narrative.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="nda-open" disabled={!onNav || interactionBusy} onClick={() => onNav?.('vault')}>Open Vault</button>
        <button type="button" className="nda-open" disabled={!onNav || interactionBusy} onClick={() => onNav?.('document-authoring')}>Open Authoring</button>
      </div>
      <details>
        <summary>Required clinical inputs</summary>
        <p>Clinical data: <span>{data.requiredInputs.studyData.required.join(', ')}</span></p>
        <p>Study details: <span>{data.requiredInputs.studyInfo.required.join(', ')}</span></p>
      </details>
    </>}
  </div>;
}
