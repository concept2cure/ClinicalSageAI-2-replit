/**
 * Reach a CSR build from the retained run that holds its engine tables, and
 * review it section by section (slice 3 of docs/design/CSR_END_TO_END_2026-10-29.md).
 *
 * - CsrBuildDraftControl sits on Submission Center's CSR card, under the
 *   frozen clinical tables of a saved run. It renders only when that run holds
 *   retained tables, and starts POST /api/csr/jobs bound to the run
 *   (evidenceSource). A refusal is shown as the server stated it.
 * - CsrHeadingReview sits on the csr-workflow board (CsrWorkflow in
 *   BiopharmaProject.tsx), the build's progress view, reached from the card.
 *   It lists the job's headings against the canonical ICH E3 tree with their
 *   review state, records a decision as the signed-in reviewer, and hands the
 *   approved set to the existing Authoring import (workflow-source-import).
 * - CsrNarrativeBuild sits under the section review on the same board (slice
 *   7): "Build narratives" composes the build's patient safety narratives from
 *   its bound run's ADaM data into §14.3.3 and §12.3.2, and the QC list shows
 *   each subject's qualifying events, missing fields, how the prose was written,
 *   any refusal, and whether §14.3.3 still awaits review.
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { CsrSourceReceipt } from '@shared/csr-source-input';
import { apiCall, apiErrorText } from '../apiCall';
import { I } from '../icons';

const JOBS = '/api/csr/jobs';

/** One heading of GET /api/csr-workflow/board `headings`. */
export interface CsrBoardHeading {
  num: string;
  label: string;
  depth: number;
  manual: boolean;
  state: 'not_drafted' | 'draft' | 'in_review' | 'approved';
  staleApproval?: boolean;
  contentHash?: string;
  reviewerId?: number | null;
  decidedAt?: string | null;
  reason?: string | null;
}

const STATE_LABEL: Record<CsrBoardHeading['state'], string> = {
  not_drafted: 'Not drafted', draft: 'Draft', in_review: 'In review', approved: 'Approved',
};
const STATE_TONE: Record<CsrBoardHeading['state'], string> = {
  not_drafted: 'idle', draft: 'idle', in_review: 'warn', approved: 'ok',
};

type Outcome = { kind: 'queued'; jobId: number } | { kind: 'refused'; text: string };

/** Start a CSR draft from one study's retained tables in a saved run. */
export function CsrBuildDraftControl({ programId, runId, studies, blocked, onNav }: {
  programId: string; runId: string; studies: Array<{ source: CsrSourceReceipt }>;
  blocked: boolean; onNav?: (surface: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Record<string, Outcome>>({});
  if (studies.length === 0) return null;
  const start = async (source: CsrSourceReceipt) => {
    if (busy || blocked) return;
    setBusy(true);
    const result = await apiCall<{ jobId?: number }>('POST', JOBS, {
      programId, studyInfo: source.studyInfo,
      evidenceSource: { programId, runId, studyId: source.studyId },
    });
    const jobId = Number(result.body?.jobId);
    setOutcome(current => ({ ...current, [source.sha256]: result.ok && Number.isSafeInteger(jobId) && jobId > 0
      ? { kind: 'queued', jobId }
      : { kind: 'refused', text: apiErrorText(result, 'The CSR draft was not started.') } }));
    setBusy(false);
  };
  return <div aria-label="CSR draft from this run" style={{ display: 'grid', gap: 6 }}>
    <p>Draft the clinical study report from these retained tables. Results sections are written over the tables; every figure is checked against them.</p>
    {studies.map(({ source }) => <StudyBuildRow key={source.sha256} source={source} outcome={outcome[source.sha256]}
      disabled={busy || blocked} busy={busy} onStart={() => void start(source)} onNav={onNav} />)}
  </div>;
}

function StudyBuildRow({ source, outcome, disabled, busy, onStart, onNav }: {
  source: CsrSourceReceipt; outcome: Outcome | undefined; disabled: boolean; busy: boolean;
  onStart: () => void; onNav?: (surface: string) => void;
}) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
    <button type="button" className="nda-open" disabled={disabled} onClick={onStart}>
      {I.fileText} {busy ? 'Starting…' : `Build CSR draft · ${source.protocolNumber}`}
    </button>
    {outcome?.kind === 'queued' && <span role="status">
      CSR build {outcome.jobId} is queued.{' '}
      {onNav && <button type="button" className="nda-open" onClick={() => onNav('csr-workflow')}>{I.arrowRight} Open build progress</button>}
    </span>}
    {outcome?.kind === 'refused' && <p role="alert">{outcome.text}</p>}
  </div>;
}

type Decision = 'submit' | 'approve' | 'send_back';

/** The job's headings with their review state, and the review actions. */
export function CsrHeadingReview({ jobId, headings, onChanged, onImport }: {
  jobId: number; headings: CsrBoardHeading[]; onChanged: () => void;
  onImport: (sectionNumbers: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approved = headings.filter(h => h.state === 'approved').map(h => h.num);
  const drafted = headings.filter(h => h.state !== 'not_drafted').length;
  const decide = async (heading: CsrBoardHeading, decision: Decision, reason?: string) => {
    if (busy || !heading.contentHash) return;
    setBusy(true); setError(null);
    const result = await apiCall('POST', `${JOBS}/${jobId}/sections/${encodeURIComponent(heading.num)}/review`,
      { decision, expectedContentHash: heading.contentHash, ...(reason !== undefined ? { reason } : {}) });
    setBusy(false);
    if (!result.ok) { setError(apiErrorText(result, 'The review decision was not recorded.')); return; }
    onChanged();
  };
  return <section aria-label="Section review" style={{ marginTop: 16, maxWidth: 900 }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <strong>Section review</strong>
      <span>{drafted} of {headings.length} ICH E3 headings drafted · {approved.length} approved</span>
      <button type="button" className="btn" disabled={busy || approved.length === 0} onClick={() => onImport(approved)}>
        {I.fileCheck} Import approved sections into Authoring
      </button>
    </div>
    {error && <p role="alert">{error}</p>}
    <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
      {headings.map(h => <HeadingRow key={h.num} heading={h} busy={busy} onDecide={(d, r) => void decide(h, d, r)} />)}
    </ul>
  </section>;
}

function HeadingRow({ heading, busy, onDecide }: {
  heading: CsrBoardHeading; busy: boolean; onDecide: (decision: Decision, reason?: string) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  return <li style={{ display: 'grid', gap: 4, padding: `4px 0 4px ${(heading.depth - 1) * 16}px` }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className="mono" style={{ color: 'var(--accent-200)' }}>{heading.num}</span>
      <span>{heading.label}</span>
      <span className={`rd-chip tone-${STATE_TONE[heading.state]}`}>{STATE_LABEL[heading.state]}</span>
      {heading.manual && heading.state === 'not_drafted' && <span>Prepared from records, not drafted by the build</span>}
      {heading.staleApproval && <span>Redrafted after approval; review again</span>}
      {heading.state === 'draft' && heading.reason && <span>Sent back: {heading.reason}</span>}
      {heading.state === 'draft' && <button type="button" className="btn" disabled={busy} onClick={() => onDecide('submit')}>{I.send} Send for review</button>}
      {heading.state === 'in_review' && <button type="button" className="btn" disabled={busy} onClick={() => onDecide('approve')}>{I.check} Approve</button>}
      {(heading.state === 'in_review' || heading.state === 'approved') && reason === null &&
        <button type="button" className="btn" disabled={busy} onClick={() => setReason('')}>{I.undo} Send back</button>}
    </div>
    {reason !== null && <SendBackForm reason={reason} setReason={setReason} busy={busy} num={heading.num}
      onConfirm={() => { onDecide('send_back', reason); setReason(null); }} />}
  </li>;
}

function SendBackForm({ reason, setReason, busy, num, onConfirm }: {
  reason: string; setReason: (value: string | null) => void; busy: boolean; num: string; onConfirm: () => void;
}) {
  return <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
    <label>Reason for sending §{num} back{' '}
      <input className="c2c-input" value={reason} maxLength={2000} onChange={event => setReason(event.target.value)} />
    </label>
    <button type="button" className="btn" disabled={busy || !reason.trim()} onClick={onConfirm}>Record send-back</button>
    <button type="button" className="btn" disabled={busy} onClick={() => setReason(null)}>Cancel</button>
  </div>;
}

/** One row of GET /api/csr/jobs/:jobId/narratives (csr-narrative-store.ts readCsrNarrativeQc). */
export interface CsrNarrativeQcRow {
  subjectId: string; sequence: number; status: 'composed' | 'refused'; contentHash: string | null;
  qc: { armName: string; categories: string[]; events: string[]; missingFields: string[]; prose: 'template' | 'model' | null;
    model?: string; modelProseRefused?: Array<{ code: string; detail: string }>; refusal?: { reason: string } };
}
interface NarrativeBuildResult { status: 'complete' | 'incomplete' | 'failed' | 'stopped'; selected: number; composed: number; refused: number;
  sections: { written: string[]; kept: string[] } }

const CATEGORY: Record<string, string> = { death: 'Death', serious: 'SAE', discontinuation: 'Withdrawn for AE', aesi: 'AESI' };

function narrativeOutcome(r: NarrativeBuildResult): string {
  if (r.status === 'incomplete') return `${r.composed} of ${r.selected} narratives composed. ${r.refused} subject(s) could not be narrated from the source rows, so §14.3.3 was not written.`;
  const kept = r.sections.kept.length ? ` §${r.sections.kept.join(', §')} already held drafted text and was kept.` : '';
  return `${r.composed} of ${r.selected} narratives composed from the ADaM rows; §${r.sections.written.join(' and §')} written.${kept}`;
}

/** "Build narratives" and the per-subject narrative QC list, on the build board. */
export function CsrNarrativeBuild({ jobId, headings, onChanged }: { jobId: number; headings: CsrBoardHeading[]; onChanged: () => void }) {
  const [rows, setRows] = useState<CsrNarrativeQcRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ alert: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    const result = await apiCall<{ subjects?: CsrNarrativeQcRow[] }>('GET', `${JOBS}/${jobId}/narratives`);
    if (result.ok && Array.isArray(result.body?.subjects)) { setRows(result.body!.subjects!); return; }
    setMessage({ alert: true, text: apiErrorText(result, 'The narrative QC list could not be read.') });
  }, [jobId]);
  useEffect(() => { void load(); }, [load]);
  const build = async () => {
    if (busy) return;
    setBusy(true); setMessage(null);
    const result = await apiCall<NarrativeBuildResult>('POST', `${JOBS}/${jobId}/narratives`);
    setBusy(false);
    if (result.ok && result.body) { setMessage({ alert: result.body.status !== 'complete', text: narrativeOutcome(result.body) }); onChanged(); }
    else setMessage({ alert: true, text: apiErrorText(result, 'The narratives were not composed.') });
    await load();
  };
  const section = headings.find(h => h.num === '14.3.3');
  return <section aria-label="Patient safety narratives" style={{ marginTop: 16, maxWidth: 900 }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <strong>Patient safety narratives</strong>
      <span>Deaths, other serious adverse events, withdrawals for an adverse event and protocol-defined AESIs, from the run’s ADaM data</span>
      <button type="button" className="btn" disabled={busy} onClick={() => void build()}>{I.fileText} {busy ? 'Building…' : 'Build narratives'}</button>
    </div>
    {section && section.state !== 'not_drafted' && <p>§14.3.3 is {STATE_LABEL[section.state].toLowerCase()}{section.state !== 'approved' ? '; each narrative below awaits that review' : ''}.</p>}
    {message && <p role={message.alert ? 'alert' : 'status'}>{message.text}</p>}
    {rows === null ? null : rows.length === 0
      ? <p>No narratives have been composed for this build.</p>
      : <ul aria-label="Narrative QC" style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>{rows.map(r => <NarrativeQcItem key={r.subjectId} row={r} />)}</ul>}
  </section>;
}

function NarrativeQcItem({ row }: { row: CsrNarrativeQcRow }) {
  const { qc } = row;
  const prose = qc.prose === 'model' ? `Prose: ${qc.model ?? 'model'}` : qc.prose === 'template' ? 'Prose: template (facts only)' : null;
  return <li style={{ display: 'grid', gap: 2, padding: '4px 0' }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className="mono">{row.subjectId}</span>
      <span>{qc.armName}</span>
      <span>{qc.events.join('; ')}</span>
      {qc.categories.map(c => <span key={c} className="rd-chip tone-idle">{CATEGORY[c] ?? c}</span>)}
      <span className={`rd-chip tone-${row.status === 'composed' ? 'ok' : 'warn'}`}>{row.status === 'composed' ? 'Composed' : 'Not composed'}</span>
      {prose && <span>{prose}</span>}
    </div>
    {qc.refusal && <span>{qc.refusal.reason}</span>}
    {qc.missingFields.length > 0 && <span>Not recorded in the source: {qc.missingFields.join(', ')}</span>}
    {qc.modelProseRefused?.length ? <span>Model prose refused: {qc.modelProseRefused.map(i => i.detail).join(' ')}</span> : null}
  </li>;
}
