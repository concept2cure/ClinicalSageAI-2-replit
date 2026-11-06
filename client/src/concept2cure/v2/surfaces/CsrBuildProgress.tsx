/**
 * Reach a CSR build from the retained run that holds its engine tables, and
 * review it section by section (slice 3 of docs/design/CSR_END_TO_END_2026-10-29.md).
 *
 * - CsrBuildDraftControl sits on Submission Center's CSR card, under the
 *   frozen clinical tables of a saved run. It renders only when that run holds
 *   retained tables, and starts POST /api/csr/jobs bound to the run
 *   (evidenceSource). A refusal is shown as the server stated it.
 *   A queued build is handed to the card's build list (CsrRunBuilds.tsx),
 *   which carries its narratives and assembly. Until 2026-10-30 the queued
 *   line offered "Open build progress", a navigation to the csr-workflow
 *   board, which is not a launch surface and is refused in production.
 * - CsrHeadingReview sits on the csr-workflow board (CsrWorkflow in
 *   BiopharmaProject.tsx), not reached at launch, and since 2026-10-30 on the
 *   CSR card for the selected build (CsrRunBuilds.tsx, from
 *   GET /api/csr/jobs/:jobId/headings). It lists the job's headings against the canonical ICH E3 tree with their
 *   review state, records a decision as the signed-in reviewer, and hands the
 *   approved set to the existing Authoring import (workflow-source-import).
 * - CsrNarrativeBuild sits under the section review on the same board (slice
 *   7), and on the card for the selected build (CsrRunBuilds.tsx): "Build narratives" queues the build of the patient safety narratives
 *   from its bound run's ADaM data into §14.3.3 and §12.3.2 (off the request
 *   since 2026-10-30), polls its status (queued, running with subjects done of
 *   total, complete, incomplete with the refused subjects, failed, cancelled,
 *   or stalled, which building again resumes), and the QC list shows each
 *   subject's qualifying events, missing fields, how the prose was written,
 *   any refusal, and whether §14.3.3 still awaits review.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CsrSourceReceipt } from '@shared/csr-source-input';
import { apiCall, apiErrorText } from '../apiCall';
import { I } from '../icons';

const JOBS = '/api/csr/jobs';

/** One heading of GET /api/csr/jobs/:jobId/headings and of the board's `headings` (server csr-headings.ts). */
export interface CsrBoardHeading {
  num: string;
  label: string;
  depth: number;
  manual: boolean;
  placeholder?: boolean;
  state: 'not_drafted' | 'draft' | 'in_review' | 'approved';
  staleApproval?: boolean;
  integrityFailure?: boolean;
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
export function CsrBuildDraftControl({ programId, runId, studies, blocked, onQueued }: {
  programId: string; runId: string; studies: Array<{ source: CsrSourceReceipt }>;
  blocked: boolean; onQueued?: (jobId: number) => void;
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
    const queued = result.ok && Number.isSafeInteger(jobId) && jobId > 0;
    setOutcome(current => ({ ...current, [source.sha256]: queued
      ? { kind: 'queued', jobId }
      : { kind: 'refused', text: apiErrorText(result, 'The CSR draft was not started.') } }));
    setBusy(false);
    if (queued) onQueued?.(jobId);
  };
  return <div aria-label="CSR draft from this study data" style={{ display: 'grid', gap: 6 }}>
    <p>Draft the clinical study report from these retained tables. Results sections are written over the tables; every figure is checked against them.</p>
    {studies.map(({ source }) => <StudyBuildRow key={source.sha256} source={source} outcome={outcome[source.sha256]}
      disabled={busy || blocked} busy={busy} onStart={() => void start(source)} />)}
  </div>;
}

function StudyBuildRow({ source, outcome, disabled, busy, onStart }: {
  source: CsrSourceReceipt; outcome: Outcome | undefined; disabled: boolean; busy: boolean; onStart: () => void;
}) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
    <button type="button" className="nda-open" disabled={disabled} onClick={onStart}>
      {I.fileText} {busy ? 'Starting…' : `Build CSR draft · ${source.protocolNumber}`}
    </button>
    {outcome?.kind === 'queued' && <span role="status">
      CSR build {outcome.jobId} is queued. Its progress, narratives and files are under “CSR builds from this study data”.
    </span>}
    {outcome?.kind === 'refused' && <p role="alert">{outcome.text}</p>}
  </div>;
}

type Decision = 'submit' | 'approve' | 'send_back';

/** The job's headings with their review state, and the review actions. The CSR document's own panel imports the
 * approved headings into that document (CsrRunBuilds.tsx); the csr-workflow board imports them as a working copy. */
export function CsrHeadingReview({ jobId, headings, onChanged, onImport, importLabel = 'Import approved sections into Authoring' }: {
  jobId: number; headings: CsrBoardHeading[]; onChanged: () => void;
  onImport: (sectionNumbers: string[]) => void; importLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approved = headings.filter(h => h.state === 'approved' && !h.integrityFailure).map(h => h.num);
  // A template row (saved text that still holds a data placeholder, the server's `placeholder`) is not drafted (F2).
  const drafted = headings.filter(h => h.state !== 'not_drafted' && !h.placeholder && !h.integrityFailure).length;
  const templates = headings.filter(h => h.placeholder).length;
  const decide = async (heading: CsrBoardHeading, decision: Decision, reason?: string) => {
    if (busy || heading.integrityFailure || !heading.contentHash || (heading.placeholder && decision !== 'send_back')) return;
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
      <span>{drafted} of {headings.length} ICH E3 headings drafted{templates > 0
        ? ` · ${templates} ${templates === 1 ? 'is' : 'are'} template text with data missing` : ''} · {approved.length} approved</span>
      <button type="button" className="btn" disabled={busy || approved.length === 0} onClick={() => onImport(approved)}>
        {I.fileCheck} {importLabel}
      </button>
    </div>
    {error && <p role="alert">{error}</p>}
    <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
      {headings.map(h => <HeadingRow key={`${h.num}:${h.contentHash ?? ''}`} jobId={jobId} heading={h} busy={busy} onDecide={(d, r) => void decide(h, d, r)} />)}
    </ul>
  </section>;
}

/** A reviewer sees the exact persisted body before approving its hash, not just a title.
 * The existing org-scoped sections API accepts a single heading selection. Markup is read as text: a block or a line
 * break ends a line, so the saved lines, lists and paragraphs read as saved (F9); entities are decoded once. */
const BLOCK_TAG = /<\/?(?:p|div|li|ul|ol|h[1-6]|tr|table|thead|tbody|blockquote|section|pre)\b[^>]*>|<br\s*\/?>/gi;
const codePoint = (whole: string, value: number) => (value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : whole);
function readableCsrText(source: string): string {
  return source.replace(/\r\n?/g, '\n').replace(BLOCK_TAG, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d{1,7});/g, (whole, n: string) => codePoint(whole, Number(n)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (whole, n: string) => codePoint(whole, parseInt(n, 16)))
    .replace(/&amp;/gi, '&')
    .replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
/** The exact saved body of one heading, read on request and checked against its recorded content hash. */
function useSavedSectionText(jobId: number, heading: CsrBoardHeading) {
  const [savedText, setSavedText] = useState<{ hash: string; text: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const readSavedText = async () => {
    if (reading || !heading.contentHash) return;
    setReading(true); setReadError(null); setSavedText(null);
    try {
      const result = await apiCall<{ sections?: unknown }>('GET',
        `${JOBS}/${jobId}/sections?sectionNumber=${encodeURIComponent(heading.num)}`);
      const rows = result.body?.sections;
      if (!result.ok || !Array.isArray(rows) || rows.length !== 1) {
        throw new Error(apiErrorText(result, 'The exact saved section could not be read.'));
      }
      const row = rows[0] as { sectionNumber?: unknown; content?: unknown; contentHash?: unknown };
      if (row.sectionNumber !== heading.num || row.contentHash !== heading.contentHash ||
          typeof row.content !== 'string' || !row.content.trim()) {
        throw new Error('The saved section or its content hash changed. Reload the build before review.');
      }
      setSavedText({ hash: heading.contentHash, text: readableCsrText(row.content) });
    } catch (error) {
      setReadError(error instanceof Error ? error.message : 'The saved draft is unavailable.');
    } finally { setReading(false); }
  };
  const inspected = !!savedText && savedText.hash === heading.contentHash && !!savedText.text;
  return { savedText, reading, readError, readSavedText, inspected };
}

/** The heading's number, title, state and the notes that qualify it. */
function HeadingStatus({ heading }: { heading: CsrBoardHeading }) {
  return <>
    <span className="mono" style={{ color: 'var(--accent-200)' }}>{heading.num}</span>
    <span>{heading.label}</span>
    <span className={`rd-chip tone-${STATE_TONE[heading.state]}`}>{heading.integrityFailure
      ? 'Saved text integrity failed' : heading.placeholder ? 'Template · data missing' : STATE_LABEL[heading.state]}</span>
    {heading.integrityFailure && <span role="alert">The saved section no longer matches its recorded SHA-256. Review and import are blocked until the source is repaired.</span>}
    {heading.placeholder && !heading.integrityFailure && <span>The build kept its template text here: the study’s data is still missing, so it is not offered for review.</span>}
    {heading.manual && heading.state === 'not_drafted' && <span>Prepared from records, not drafted by the build</span>}
    {heading.staleApproval && <span>Redrafted after approval; review again</span>}
    {heading.state === 'draft' && heading.reason && <span>Sent back: {heading.reason}</span>}
  </>;
}

/** Send for review, Approve (only once the exact saved text was read) and Send back. A template row is not a draft,
 * so it is offered neither for review nor for approval (the server refuses both, csr-section-review.ts); one sent
 * for review or approved before that rule can still be sent back. */
function HeadingActions({ heading, busy, inspected, sendingBack, onDecide, onSendBack }: {
  heading: CsrBoardHeading; busy: boolean; inspected: boolean; sendingBack: boolean;
  onDecide: (decision: Decision, reason?: string) => void; onSendBack: () => void;
}) {
  const blocked = busy || heading.integrityFailure === true;
  const reviewable = !heading.placeholder;
  return <>
    {reviewable && heading.state === 'draft' && <button type="button" className="btn" disabled={blocked} onClick={() => onDecide('submit')}>{I.send} Send for review</button>}
    {reviewable && heading.state === 'in_review' && <button type="button" className="btn" disabled={blocked || !inspected}
      title={inspected ? undefined : 'Read this exact saved draft before approving its content hash.'}
      onClick={() => onDecide('approve')}>{I.check} Approve</button>}
    {(heading.state === 'in_review' || heading.state === 'approved') && !sendingBack &&
      <button type="button" className="btn" disabled={blocked} onClick={onSendBack}>{I.undo} Send back</button>}
  </>;
}

/** The read button, a failed read, and the saved text once read. */
function SavedSectionText({ heading, busy, read }: {
  heading: CsrBoardHeading; busy: boolean; read: ReturnType<typeof useSavedSectionText>;
}) {
  return <>
    {heading.contentHash && !heading.integrityFailure && <button type="button" className="btn ghost" disabled={busy || read.reading} onClick={() => void read.readSavedText()}>
      {read.reading ? 'Reading saved section…' : 'Read saved section text'}
    </button>}
    {read.readError && <p role="alert">{read.readError}</p>}
    {read.inspected && read.savedText && <pre aria-label={`Saved text for §${heading.num}`}
      style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 360, overflowY: 'auto', padding: 12 }}>
      {read.savedText.text}
    </pre>}
  </>;
}

function HeadingRow({ jobId, heading, busy, onDecide }: {
  jobId: number; heading: CsrBoardHeading; busy: boolean; onDecide: (decision: Decision, reason?: string) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const read = useSavedSectionText(jobId, heading);
  return <li style={{ display: 'grid', gap: 4, padding: `4px 0 4px ${(heading.depth - 1) * 16}px` }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <HeadingStatus heading={heading} />
      <HeadingActions heading={heading} busy={busy} inspected={read.inspected} sendingBack={reason !== null}
        onDecide={onDecide} onSendBack={() => setReason('')} />
    </div>
    <SavedSectionText heading={heading} busy={busy} read={read} />
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
  sections: { written: string[]; kept: string[] }; subjects?: string[] }
/** GET /api/csr/jobs/:jobId/narratives/status `run` (csr-narrative-run.ts readLatestNarrativeRun). */
export interface CsrNarrativeRun {
  id: number; status: 'queued' | 'running' | 'complete' | 'incomplete' | 'failed' | 'cancelled'; subjectsDone: number; subjectsTotal: number | null;
  stalled: boolean; updatedAt: string; result: NarrativeBuildResult | null;
  error: { code: string; message: string; subjects?: string[]; issues?: Array<{ path: string; message: string }> } | null;
}

const CATEGORY: Record<string, string> = { death: 'Death', serious: 'SAE', discontinuation: 'Withdrawn for AE', aesi: 'AESI' };

function narrativeOutcome(r: NarrativeBuildResult): string {
  if (r.status === 'incomplete') return `${r.composed} of ${r.selected} narratives composed. ${r.refused} subject(s) could not be narrated from the source rows, so §14.3.3 was not written.${r.subjects?.length ? ` Not composed: ${r.subjects.join(', ')}.` : ''}`;
  const kept = r.sections.kept.length ? ` §${r.sections.kept.join(', §')} already held drafted text and was kept.` : '';
  return `${r.composed} of ${r.selected} narratives composed from the ADaM rows; §${r.sections.written.join(' and §')} written.${kept}`;
}

const active = (run: CsrNarrativeRun | null | undefined) => !!run && (run.status === 'queued' || run.status === 'running') && !run.stalled;

function runFailure(run: CsrNarrativeRun): string {
  const issues = run.error?.issues?.length ? ` ${run.error.issues.map(i => `${i.path}: ${i.message}`).join(' ')}` : '';
  const subjects = run.error?.subjects?.length ? ` Subjects: ${run.error.subjects.join(', ')}.` : '';
  return `${run.error?.message ?? 'The narrative build did not finish.'}${subjects}${issues}`;
}

/** What the board says about the newest build: its progress while it runs, then its outcome or refusal as the server recorded it. */
function runMessage(run: CsrNarrativeRun): { alert: boolean; text: string } {
  if (run.stalled) return { alert: true, text: `This narrative build stopped making progress at ${new Date(run.updatedAt).toLocaleString()} (${run.subjectsDone} of ${run.subjectsTotal ?? '?'} subjects). Build narratives resumes it; narratives already composed are kept.` };
  if (run.status === 'queued') return { alert: false, text: 'Queued. The narratives are composed off this page; progress appears here.' };
  if (run.status === 'running') return { alert: false, text: run.subjectsTotal == null ? 'Reading the run’s ADaM data.' : `Composing narratives: ${run.subjectsDone} of ${run.subjectsTotal} subjects.` };
  if (run.result && (run.status === 'complete' || run.status === 'incomplete')) return { alert: run.status !== 'complete', text: narrativeOutcome(run.result) };
  return { alert: true, text: runFailure(run) };
}

/** The newest build's progress bar and status line, or nothing before the first build. */
function NarrativeRunStatus({ run }: { run: CsrNarrativeRun | null | undefined }) {
  if (!run) return null;
  const status = runMessage(run);
  return <>
    {active(run) && run.subjectsTotal != null && <progress aria-label="Narrative progress" max={run.subjectsTotal || 1} value={run.subjectsDone} />}
    <p role={status.alert ? 'alert' : 'status'}>{status.text}</p>
  </>;
}

/** The build's newest narrative run, polled while it runs. `undefined` until first read. */
function useNarrativeRun(jobId: number, pollMs: number, onSettled: () => void) {
  const [run, setRun] = useState<CsrNarrativeRun | null | undefined>(undefined);
  const [readError, setReadError] = useState<string | null>(null);
  const reads = useRef<{ jobId: number; sequence: number; applied: number; live: boolean } | null>(null);
  const load = useCallback(async () => {
    const owner = reads.current;
    if (!owner?.live || owner.jobId !== jobId) return;
    const sequence = ++owner.sequence;
    const result = await apiCall<{ run?: CsrNarrativeRun | null }>('GET', `${JOBS}/${jobId}/narratives/status`);
    // Apply arrived progress even while later polls wait; never undo an already applied newer reply.
    if (!owner.live || reads.current !== owner || sequence <= owner.applied) return;
    owner.applied = sequence;
    if (result.ok && result.body && 'run' in result.body) { setRun(result.body.run ?? null); setReadError(null); return; }
    setReadError(apiErrorText(result, 'The narrative build status could not be read.'));
  }, [jobId]);
  useEffect(() => {
    const owner = { jobId, sequence: 0, applied: 0, live: true };
    reads.current = owner;
    void load();
    return () => { owner.live = false; };
  }, [jobId, load]);
  const running = active(run);
  const [wasRunning, setWasRunning] = useState(false);
  useEffect(() => {
    if (running) { setWasRunning(true); const timer = setInterval(() => { void load(); }, pollMs); return () => clearInterval(timer); }
    if (wasRunning) { setWasRunning(false); onSettled(); }
    return undefined;
  }, [running, wasRunning, load, pollMs, onSettled]);
  /** A build was just queued: settle on its outcome even if it finished before the first status read. */
  const watch = useCallback(() => setWasRunning(true), []);
  return { run, readError, load, watch };
}

/** "Build narratives", its progress, and the per-subject narrative QC list, on the build board. */
export function CsrNarrativeBuild({ jobId, headings, onChanged, pollMs = 2000 }: { jobId: number; headings: CsrBoardHeading[]; onChanged: () => void; pollMs?: number }) {
  const [rows, setRows] = useState<CsrNarrativeQcRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ alert: boolean; text: string } | null>(null);
  const loadQc = useCallback(async () => {
    const result = await apiCall<{ subjects?: CsrNarrativeQcRow[] }>('GET', `${JOBS}/${jobId}/narratives`);
    if (result.ok && Array.isArray(result.body?.subjects)) { setRows(result.body!.subjects!); return; }
    setMessage({ alert: true, text: apiErrorText(result, 'The narrative QC list could not be read.') });
  }, [jobId]);
  useEffect(() => { void loadQc(); }, [loadQc]);
  const settled = useCallback(() => { void loadQc(); onChanged(); }, [loadQc, onChanged]);
  const { run, readError, load, watch } = useNarrativeRun(jobId, pollMs, settled);
  const build = async () => {
    if (busy) return;
    setBusy(true); setMessage(null);
    const result = await apiCall<{ runId: number }>('POST', `${JOBS}/${jobId}/narratives`);
    setBusy(false);
    if (!result.ok && (result.body as { code?: string } | null)?.code !== 'CSR_NARRATIVE_BUILD_IN_PROGRESS') setMessage({ alert: true, text: apiErrorText(result, 'The narrative build was not queued.') });
    else watch();
    await load();
  };
  const section = headings.find(h => h.num === '14.3.3');
  const building = busy || active(run);
  return <section aria-label="Patient safety narratives" style={{ marginTop: 16, maxWidth: 900 }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <strong>Patient safety narratives</strong>
      <span>Deaths, other serious adverse events, withdrawals for an adverse event and protocol-defined AESIs, from the run’s ADaM data</span>
      <button type="button" className="btn" disabled={building} onClick={() => void build()}>{I.fileText} {building ? 'Building…' : 'Build narratives'}</button>
    </div>
    {section && section.state !== 'not_drafted' && <p>§14.3.3 is {STATE_LABEL[section.state].toLowerCase()}{section.state !== 'approved' ? '; each narrative below awaits that review' : ''}.</p>}
    <NarrativeRunStatus run={run} />
    {readError && <p role="alert">{readError}</p>}
    {message && <p role={message.alert ? 'alert' : 'status'}>{message.text}</p>}
    {rows === null ? null : rows.length === 0
      ? <p>No narratives have been composed for this build.</p>
      /* Collapsed, as beside §14.3.3 in the editor (CsrNarrativeReferenceView): 95 subjects made the panel about
         9,000 px tall, burying the assembly below it (found re-walking the demo, 2026-11-05). */
      : <details><summary>Narrative QC list · {rows.length} {rows.length === 1 ? 'subject' : 'subjects'}</summary><NarrativeQcList rows={rows} /></details>}
  </section>;
}

/** The per-subject narrative QC list; also shown beside the read-only §14.3.3 in Authoring (editor/CsrNarrativeReferenceView.tsx). */
export function NarrativeQcList({ rows }: { rows: CsrNarrativeQcRow[] }) {
  return <ul aria-label="Narrative QC" style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>{rows.map(r => <NarrativeQcItem key={r.subjectId} row={r} />)}</ul>;
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
