/**
 * The CSR builds of one saved run, on Submission Center's CSR card (D2/W1,
 * 2026-10-30; docs/evidence/D2-CSR/2026-10-30-csr-card-reach/).
 *
 * The narrative build (CsrNarrativeBuild) and the assembly with its placement
 * (CsrAssemblyControl) were mounted only on the csr-workflow board
 * (CsrWorkflow in BiopharmaProject.tsx), and production refuses
 * /api/csr-workflow/board. So a CSR built in production could not be given
 * narratives, assembled or placed from a screen. The card now lists the builds
 * bound to the run (GET /api/csr/jobs?programId&runId) and carries those same
 * controls for the selected build. Since 2026-10-30
 * (docs/evidence/D2-CSR/2026-10-30-csr-card-review/) the card also carries the
 * board's section review (CsrHeadingReview: send for review, approve, send
 * back) and its import of the approved sections into Authoring through the
 * canonical intake (SourceImportDialog, then openImportedDocument). The review
 * and the narrative build read one source: the build's ICH E3 headings with
 * their labels, content hashes and review state
 * (GET /api/csr/jobs/:jobId/headings, server csr-headings.ts, the same tree the
 * board publishes). Every path is under /api/csr/jobs, which eCTD Compile
 * claims at launch. Since 2026-11-05 (F6) the approved sections are imported
 * into this CSR document itself (ImportIntoDocument), never into a new copy.
 * A failed read is an alert, never an empty list. While a build is still
 * running (queued through cross_linking) the list is re-read every
 * BUILD_POLL_MS, so its status and progress are not left at the value first
 * read; the re-reads stop once every build has ended. A failed build says why
 * it stopped (the list's `failure`, F10 of the 2026-11-02 demo walk).
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { CsrIntoDocumentOutcome, CsrIntoDocumentReceipt } from '@shared/authoring/source-import';
import { GOVERNED_REASON_MAX, GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { apiCall, apiErrorText, type ApiResult } from '../apiCall';
import { I } from '../icons';
import { CSR_PROSE_STYLE, CsrHeadingReview, CsrNarrativeBuild, type CsrBoardHeading, type CsrSendNotice } from './CsrBuildProgress';
import { CsrNotApplicable } from './CsrNotApplicable';
import { CsrAssemblyControl } from './CsrAssemblyControl';

const JOBS = '/api/csr/jobs';
/** How often the list is re-read while a build of the run is still running. */
export const BUILD_POLL_MS = 5_000;
/** How often it is re-read while a build says what it is writing: the text on screen should move as it is written. */
export const LIVE_POLL_MS = 2_000;
/** The csr_build_jobs statuses that end a build (migrations/20260628_csr_job_state.sql). */
const ENDED = new Set(['complete', 'failed', 'cancelled']);
/** Matches the persisted csr_build_jobs.status check constraint. */
const BUILD_STATUSES = new Set(['queued', 'loading_data', 'drafting', 'tabulating',
  'cross_linking', 'complete', 'failed', 'cancelled']);

/** One row of GET /api/csr/jobs?programId&runId (csr-jobs.ts). `failure` is why a failed build stopped, in plain
 * words the server chose from its recorded receipt (csr-job-runner.ts csrBuildFailureText); null otherwise. */
interface RunBuild { jobId: number; studyId: string; status: string; progress: number; updatedAt: string; failure?: string | null; writing?: LiveWriting | null }

/** What a drafting build is writing now (server csr-job-runner.ts csrLiveBuild): the heading, how many headings are
 * written, and the prose so far. Work in progress: not yet checked against the study's tables, and not saved. */
interface LiveWriting { number: string; title: string; text: string; written: number; total: number }

function isLiveWriting(value: unknown): value is LiveWriting {
  const row = value as Partial<LiveWriting> | null;
  return !!row && typeof row === 'object' && typeof row.number === 'string' && /^\d+(?:\.\d+)*$/.test(row.number)
    && typeof row.title === 'string' && typeof row.text === 'string'
    && Number.isInteger(row.written) && Number.isInteger(row.total) && Number(row.written) >= 0 && Number(row.total) >= Number(row.written);
}

const HEADING_STATES: ReadonlyArray<CsrBoardHeading['state']> = ['not_drafted', 'draft', 'in_review', 'approved'];

/** A build row as the list has always sent it; its live writing, when it has one, is checked by isBuild. */
function isBuildRow(value: unknown): value is RunBuild {
  const row = value as Partial<RunBuild> | null;
  // The whole response controls clinical review/import/assembly navigation.
  // Reject a partial or malformed record rather than presenting an invented
  // percentage, "Invalid Date", or an unknown state as a valid saved build.
  return !!row && Number.isSafeInteger(row.jobId) && Number(row.jobId) > 0
    && typeof row.studyId === 'string' && !!row.studyId.trim()
    && typeof row.status === 'string' && BUILD_STATUSES.has(row.status)
    && Number.isInteger(row.progress) && Number(row.progress) >= 0 && Number(row.progress) <= 100
    && typeof row.updatedAt === 'string' && Number.isFinite(Date.parse(row.updatedAt))
    && (row.failure === undefined || row.failure === null || typeof row.failure === 'string');
}

function isBuild(value: unknown): value is RunBuild {
  if (!isBuildRow(value)) return false;
  return value.writing == null || isLiveWriting(value.writing);
}

/** One heading of GET /api/csr/jobs/:jobId/headings; a malformed row refuses the whole read. */
function isHeading(value: unknown): value is CsrBoardHeading {
  const row = value as Partial<CsrBoardHeading> | null;
  return !!row && typeof row.num === 'string' && typeof row.label === 'string' && Number.isSafeInteger(row.depth)
    && typeof row.manual === 'boolean' && HEADING_STATES.includes(row.state as CsrBoardHeading['state'])
    && (row.contentHash === undefined || typeof row.contentHash === 'string')
    && (row.integrityFailure === undefined || row.integrityFailure === true)
    // Whether a row is template text decides whether it is counted as drafted and offered for review (F2).
    && (row.placeholder === undefined || typeof row.placeholder === 'boolean');
}

/** The build this document holds imported sections from, as the list names it: a build number, or none. */
const documentBuildOf = (value: unknown): number | null | undefined =>
  (value == null ? null : Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : undefined);

/** The builds bound to the run, newest first; re-read when `focus` changes and while a build is running. Asked with
 * the document, the list also names the build that document holds imported sections from (`documentBuild`). */
function useRunBuilds(programId: string, runId: string, documentId: string, focus: number | null) {
  // The same mounted editor may change its project or frozen clinical-source
  // run. A previous run's data must disappear during the very FIRST render
  // of the new scope, before useEffect cleanup or the new HTTP read.
  const scope = `${programId}::${runId}::${documentId}`;
  const [state, setState] = useState<{ scope: string; builds: RunBuild[] | null; documentBuild: number | null; error: string | null }>({
    scope, builds: null, documentBuild: null, error: null,
  });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState(current => current.scope === scope
      ? { ...current, error: null }
      : { scope, builds: null, documentBuild: null, error: null });
    void apiCall<{ jobs?: unknown[]; documentBuild?: unknown }>('GET',
      `${JOBS}?programId=${encodeURIComponent(programId)}&runId=${encodeURIComponent(runId)}&documentId=${encodeURIComponent(documentId)}`).then(result => {
      if (!live) return;
      const jobs = result.body?.jobs;
      // Which build opens decides whose headings a person reviews: a document build that is not a build number
      // refuses the read, as a malformed build row does.
      const documentBuild = documentBuildOf(result.body?.documentBuild);
      if (result.ok && Array.isArray(jobs) && jobs.every(isBuild) && documentBuild !== undefined) {
        setState({ scope, builds: jobs, documentBuild, error: null });
        if (jobs.some(job => !ENDED.has(job.status))) {
          timer = setTimeout(() => setReload(value => value + 1), jobs.some(job => job.writing) ? LIVE_POLL_MS : BUILD_POLL_MS);
        }
      } else setState({ scope, builds: null, documentBuild: null, error: apiErrorText(result, 'The CSR builds of this run could not be listed.') });
    });
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [programId, runId, documentId, focus, reload, scope]);
  const current = state.scope === scope;
  return {
    builds: current ? state.builds : null,
    documentBuild: current ? state.documentBuild : null,
    error: current ? state.error : null,
    retry: useCallback(() => setReload(value => value + 1), []),
  };
}

/** The builds of the saved run, and the narrative and assembly controls for the selected one, in the CSR document
 * `documentId` (StudyDataBuild.tsx). `onDocumentChanged` re-reads that document's sections after an import. */
export function CsrRunBuilds({ programId, runId, documentId, focus, onDocumentChanged }: {
  programId: string; runId: string; documentId: string; focus: number | null; onDocumentChanged?: () => void;
}) {
  const { builds, documentBuild, error, retry } = useRunBuilds(programId, runId, documentId, focus);
  const [chosen, setChosen] = useState<number | null>(null);
  useEffect(() => { if (focus !== null) setChosen(focus); }, [focus]);
  const selected = openBuild(builds, chosen, documentBuild);
  return <section aria-label="CSR builds from this study data" style={{ display: 'grid', gap: 6 }}>
    <BuildPicker builds={builds} selected={selected} documentBuild={documentBuild} onChoose={setChosen} onReload={retry} />
    {!error && <DocumentBuildLine documentBuild={documentBuild} selected={selected} builds={builds} />}
    {error && <p role="alert">{error}</p>}
    {!error && builds === null && <p role="status">Loading the CSR builds of this run…</p>}
    {!error && builds?.length === 0 && <p>No CSR build has been started from this study data.</p>}
    {!error && selected && <BuildOnCard key={selected.jobId} build={selected} programId={programId} documentId={documentId} onBuildChanged={retry} onDocumentChanged={onDocumentChanged} />}
  </section>;
}

/**
 * The build the section opens on: the one a person chose; otherwise the one this document holds imported sections
 * from, because a document takes its imported sections from one build (2026-11-12: the section opened on the
 * newest, and a person reviewed headings the import then refused); otherwise the newest.
 */
function openBuild(builds: RunBuild[] | null, chosen: number | null, documentBuild: number | null): RunBuild | null {
  if (!builds) return null;
  return builds.find(b => b.jobId === chosen) ?? builds.find(b => b.jobId === documentBuild) ?? builds[0] ?? null;
}

/** Whether the open build is the one this document's imported sections come from, said before any review work. */
function DocumentBuildLine({ documentBuild, selected, builds }: { documentBuild: number | null; selected: RunBuild | null; builds: RunBuild[] | null }) {
  if (documentBuild === null || !selected || !builds) return null;
  if (documentBuild === selected.jobId) return builds.length > 1 ? <p>This document’s imported sections come from this build.</p> : null;
  return <p role="note">This document holds sections imported from CSR build {documentBuild}. A document takes its imported sections from one
    build, so sections approved in build {selected.jobId} cannot be imported into it.</p>;
}

function BuildPicker({ builds, selected, documentBuild, onChoose, onReload }: {
  builds: RunBuild[] | null; selected: RunBuild | null; documentBuild: number | null; onChoose: (jobId: number) => void; onReload: () => void;
}) {
  return <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
    <strong>CSR builds from this study data</strong>
    {builds && builds.length > 1 && <select aria-label="CSR build" value={selected?.jobId ?? ''} onChange={e => onChoose(Number(e.target.value))}>
      {builds.map(b => <option key={b.jobId} value={b.jobId}>CSR build {b.jobId} · {buildStateWord(b)}{b.jobId === documentBuild ? ' · this document’s sections' : ''}</option>)}
    </select>}
    <button type="button" className="btn" onClick={onReload}>{I.rotateCw} Reload builds</button>
  </div>;
}

/** The build's ICH E3 headings, re-read when the build changes or a review decision is saved.
 * A response from an older revision must never restore superseded approval state.
 */
function useBuildHeadings(jobId: number, updatedAt: string) {
  const [refresh, setRefresh] = useState(0);
  const scope = `${jobId}::${updatedAt}::${refresh}`;
  // `decided` is the job and the count of review decisions the headings on screen were read for.
  const decided = `${jobId}::${refresh}`;
  const [state, setState] = useState<{ scope: string; decided: string; headings: CsrBoardHeading[] | null; error: string | null }>({
    scope, decided, headings: null, error: null,
  });
  useEffect(() => {
    let active = true;
    // While a build drafts, its row changes each time a heading is saved. The list stays on screen while it is read
    // again: emptied each time, it blinked out every few seconds and closed any saved text a person had opened
    // (2026-11-10). After a review decision it is still emptied, so no superseded approval state is shown.
    setState(current => current.decided === decided && current.headings
      ? { ...current, scope, error: null }
      : { scope, decided, headings: null, error: null });
    void apiCall<{ headings?: unknown }>('GET', `${JOBS}/${jobId}/headings`).then(result => {
      if (!active) return;
      const headings = result.body?.headings;
      if (result.ok && Array.isArray(headings) && headings.every(isHeading)) {
        setState({ scope, decided, headings, error: null });
      } else {
        setState({ scope, decided, headings: null, error: apiErrorText(result, 'The build’s sections could not be read for review.') });
      }
    }).catch(() => {
      if (active) setState({ scope, decided, headings: null, error: 'The build’s sections could not be read for review.' });
    });
    return () => { active = false; };
  }, [jobId, scope, decided]);
  const current = state.scope === scope;
  return {
    // The headings read for this job and these decisions stay through the render in which the build's row has
    // moved on and the effect above has not yet run: without them the list is taken down for that render, and
    // every heading a person had opened closes.
    headings: current || state.decided === decided ? state.headings : null,
    error: current ? state.error : null,
    reload: useCallback(() => setRefresh(value => value + 1), []),
  };
}

const IMPORT = '/api/authoring/import/source';
const OUTCOME: Record<CsrIntoDocumentOutcome, string> = {
  'will-write': 'Will be written', written: 'Written', unchanged: 'Already holds this approved text',
  edited: 'Edited here since; not replaced', 'no-heading': 'No matching heading in this document; not added',
  'by-reference': 'Held by reference to the build’s narratives; not copied',
};

/** POST /api/authoring/import/source with targetDocumentId (server csr-import-into-document.ts); a malformed reply is refused. */
function readReceipt(body: unknown, documentId: string, preview: boolean): CsrIntoDocumentReceipt | null {
  const r = (body as { data?: unknown } | null)?.data as Partial<CsrIntoDocumentReceipt> | undefined;
  if (!r || r.preview !== preview || r.into?.documentId !== documentId || typeof r.into.title !== 'string') return null;
  if (typeof r.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(r.fingerprint) || !Array.isArray(r.gaps) || !Array.isArray(r.warnings)) return null;
  const sections = Array.isArray(r.sections) ? r.sections : [];
  return sections.length && sections.every(s => !!s && typeof s.code === 'string' && typeof s.title === 'string'
    && Object.prototype.hasOwnProperty.call(OUTCOME, s.outcome) && typeof s.placeholder === 'boolean') ? r as CsrIntoDocumentReceipt : null;
}

/** Keep the recorded refusal, with the existing project/document route for a different cut. */
function importFailure(result: ApiResult, fallback: string): string {
  const message = apiErrorText(result, fallback);
  const code = (result.body as { error?: unknown } | null)?.error;
  if (!result.ok && result.status === 409
    && (code === 'IMPORT_TARGET_BOUND_TO_OTHER_BUILD' || code === 'IMPORT_TARGET_STUDY_DATA_MISMATCH')) {
    return `${message} For a different data cut, go to Project → New document → Clinical Study Report. ` +
      'Freeze that cut for the new document, then build and import there. Collaborators should open this existing CSR.';
  }
  return message;
}

/** The preview read on opening, then the write against that preview's fingerprint. */
function useImportIntoDocument(programId: string, documentId: string, jobId: number, sectionNumbers: string[]) {
  const [preview, setPreview] = useState<CsrIntoDocumentReceipt | null>(null);
  const [done, setDone] = useState<CsrIntoDocumentReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const source = { kind: 'csr', jobId, sectionNumbers, approvedOnly: true };
  const key = sectionNumbers.join(',');
  useEffect(() => {
    let live = true;
    void apiCall('POST', IMPORT, { programId, source: { kind: 'csr', jobId, sectionNumbers: key.split(','), approvedOnly: true }, targetDocumentId: documentId, previewOnly: true })
      .then(result => {
        if (!live) return;
        const read = result.ok ? readReceipt(result.body, documentId, true) : null;
        if (read) setPreview(read); else setError(importFailure(result, 'What this import would write could not be read. Nothing was imported.'));
      });
    return () => { live = false; };
  }, [programId, documentId, jobId, key]);
  const write = async (reason: string) => {
    if (!preview || busy) return null;
    setBusy(true); setError(null);
    const result = await apiCall('POST', IMPORT, { programId, source, targetDocumentId: documentId, expectedFingerprint: preview.fingerprint, reason });
    setBusy(false);
    const read = result.ok ? readReceipt(result.body, documentId, false) : null;
    if (read) setDone(read); else setError(importFailure(result, 'The import was not confirmed. Reload the document before importing again.'));
    return read;
  };
  return { preview, done, error, busy, write };
}

function ReceiptList({ receipt }: { receipt: CsrIntoDocumentReceipt }) {
  return <>
    <ul aria-label={receipt.preview ? 'What the import will do' : 'What the import did'} style={{ margin: '4px 0', paddingLeft: 18 }}>
      {receipt.sections.map(s => <li key={s.code}>§{s.code} {s.title} · {OUTCOME[s.outcome]}{s.placeholder ? ' · still holds a data placeholder' : ''}</li>)}
    </ul>
    {receipt.gaps.length > 0 && <ul aria-label="Recorded gaps" style={{ margin: '4px 0', paddingLeft: 18 }}>{receipt.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul>}
    {receipt.warnings.map((warning, i) => <p key={i}>{warning}</p>)}
  </>;
}

/** The stated reason and the import, while the preview stands; Close once it is done. */
function ImportControls({ open, busy, reason, setReason, ready, done, onImport, onClose, reasonRef }: {
  open: boolean; busy: boolean; reason: string; setReason: (value: string) => void; ready: boolean; done: boolean;
  onImport: () => void; onClose: () => void; reasonRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const reasonId = useId();
  return <>
    {open && <div>
      <label htmlFor={reasonId}>Reason for importing ({GOVERNED_REASON_MIN}–{GOVERNED_REASON_MAX} characters, recorded with each section)</label>
      <textarea id={reasonId} ref={reasonRef} className="c2c-input" rows={2} style={{ width: '100%' }} maxLength={GOVERNED_REASON_MAX}
        value={reason} disabled={busy} onChange={e => setReason(e.target.value)} />
    </div>}
    <div style={{ display: 'flex', gap: 8 }}>
      {open && <button type="button" className="btn primary" disabled={!ready} onClick={onImport}>{busy ? 'Importing…' : 'Import into this document'}</button>}
      <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>{done ? 'Close' : 'Cancel'}</button>
    </div>
  </>;
}

/** The CSR document's own import (F6): the approved headings are written into this document, never a copy. */
function ImportIntoDocument({ programId, documentId, jobId, sectionNumbers, onClose, onImported }: {
  programId: string; documentId: string; jobId: number; sectionNumbers: string[]; onClose: () => void; onImported?: () => void;
}) {
  const [reason, setReason] = useState('');
  const { preview, done, error, busy, write } = useImportIntoDocument(programId, documentId, jobId, sectionNumbers);
  const trimmed = reason.trim().length;
  const ready = !!preview && !done && !busy && trimmed >= GOVERNED_REASON_MIN && trimmed <= GOVERNED_REASON_MAX;
  const submit = async () => { if (ready && await write(reason.trim())) onImported?.(); };
  const shown = done ?? preview;
  /* The panel opens below the build's section list (119 headings), so it is brought to the person: into view when
     it opens, and the reason field focused once the preview is shown (R-1, rehearsal 2026-11-05: on stage the click
     looked as though it did nothing). Focus moves only once per preview, never while the person is typing. */
  const box = useRef<HTMLElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { box.current?.scrollIntoView?.({ block: 'start' }); }, []);
  useEffect(() => { if (preview) reasonRef.current?.focus(); }, [preview]);
  return <section ref={box} aria-label="Import into this document" style={{ display: 'grid', gap: 6, marginTop: 8 }}>
    <strong>Import approved sections into this document</strong>
    {shown && <p>Into “{shown.into.title}”, by ICH E3 section number. No other document is created.</p>}
    {!shown && !error && <p role="status">Reading what the import would write…</p>}
    {shown && <ReceiptList receipt={shown} />}
    {error && <p role="alert">{error}</p>}
    {done && <p role="status">Imported. {done.sections.filter(s => s.outcome === 'written').length} section(s) written into this document.</p>}
    <ImportControls open={!!preview && !done} busy={busy} reason={reason} setReason={setReason} ready={ready} done={!!done}
      onImport={() => void submit()} onClose={onClose} reasonRef={reasonRef} />
  </section>;
}

/**
 * The heading a drafting build is writing now, in the build's own place in the CSR document (RULE 4): which heading,
 * how many are written, and its prose as the model writes it. The founder, 2026-11-10: "I want to see it happening,
 * or in the background, I want to see that it's progressing, and then I want to see the result." The result is the
 * heading's row in the section review below, once its figures are checked and it is saved.
 */
function LiveDraft({ writing }: { writing: LiveWriting }) {
  const text = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);
  // Follow the newest line, as a person reading along would.
  useEffect(() => { if (text.current) text.current.scrollTop = text.current.scrollHeight; }, [writing.text]);
  return <div style={{ display: 'grid', gap: 4 }}>
    <p role="status">Writing §{writing.number} {writing.title} · {writing.written} of {writing.total} headings written</p>
    {/* A thin ink bar on a quiet track. The native element draws an empty bar as a mid-grey slab that reads as full. */}
    <div role="progressbar" aria-label="Headings written" aria-valuemin={0} aria-valuemax={writing.total} aria-valuenow={writing.written}
      style={{ height: 4, borderRadius: 'var(--radius-sm)', background: 'var(--bg-200)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${writing.total > 0 ? (100 * writing.written) / writing.total : 0}%`, background: 'var(--text-100)' }} />
    </div>
    <pre ref={element => { text.current = element; }} aria-label={`Text being written for §${writing.number}`} style={CSR_PROSE_STYLE}>
      {writing.text || 'Reading the study’s tables and what ICH E3 asks of this heading…'}
    </pre>
    <p style={{ margin: 0, fontSize: 'var(--fs-small)', color: 'var(--text-300)' }}>This text is being written now. It is saved only after every figure in it is checked against the study’s tables.</p>
  </div>;
}

/**
 * A failed build is resumed, not replaced (POST /api/csr/jobs/:jobId/resume): the same build drafts the headings
 * that have no saved text and keeps the rest. A CSR document takes its imported sections from one build, so a new
 * build's sections would be refused by a document that already holds this one's (2026-11-10).
 */
function ResumeBuild({ jobId, onResumed }: { jobId: number; onResumed: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resume = async () => {
    setBusy(true); setError(null);
    const result = await apiCall('POST', `${JOBS}/${jobId}/resume`, {});
    setBusy(false);
    if (result.ok) onResumed();
    else setError(apiErrorText(result, 'This build could not be resumed.'));
  };
  return <>
    <p style={{ margin: 0 }}>
      <button type="button" className="btn" disabled={busy} onClick={() => void resume()}>{busy ? 'Resuming…' : `Resume build ${jobId}`}</button>
      {' '}It drafts the headings that have no saved text and keeps the rest.
    </p>
    {error && <p role="alert">{error}</p>}
  </>;
}

/**
 * Stop a build that is queued or drafting (POST /api/csr/jobs/:jobId/cancel; reach R1, 2026-11-11: the server stopped
 * a build and no screen asked it to). The runner looks after each model call and saves nothing more; the headings
 * already saved are kept. A build that ended before the request arrived is reported as ended, and the list is read
 * again either way.
 */
function StopBuild({ jobId, onEnded }: { jobId: number; onEnded: (note: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = async () => {
    setBusy(true); setError(null);
    const result = await apiCall('POST', `${JOBS}/${jobId}/cancel`, {});
    setBusy(false);
    if (result?.ok) onEnded(null);
    else if (result?.status === 409) onEnded(`Build ${jobId} had already ended, so there was nothing to stop.`);
    else setError(apiErrorText(result, 'This build could not be stopped.'));
  };
  return <>
    <p style={{ margin: 0 }}>
      <button type="button" className="btn ghost" disabled={busy} onClick={() => void stop()}>{busy ? 'Stopping…' : `Stop build ${jobId}`}</button>
      {' '}The headings already saved are kept, and the build can be resumed.
    </p>
    {error && <p role="alert">{error}</p>}
  </>;
}

const RUNNING = new Set(['queued', 'drafting']);

/**
 * How a build's state reads. The server records `failed` for three different ends, and says which in `failure`
 * (csr-job-runner.ts csrBuildFailureText): a build that ran to its end and left a heading without text ("Not
 * complete: …"), a build a provider refusal stopped ("… The build stopped at §N."), and a failure it cannot name.
 * "failed · 98%" stood beside a build that had drafted 68 of 69 headings (showcase walk, 2026-11-10). Only the word
 * changes: the recorded state, the reason and "Resume build" are as before.
 */
export function buildStateWord(build: Pick<RunBuild, 'status' | 'failure'>): string {
  // A build a person stopped is recorded `cancelled`; it reads "stopped", as one a provider refusal stopped does.
  if (build.status === 'cancelled') return 'stopped';
  if (build.status !== 'failed') return build.status;
  const why = build.failure?.trim() ?? '';
  if (why.startsWith('Not complete:')) return 'not complete';
  return /The build stopped at §/.test(why) ? 'stopped' : 'failed';
}

/** What a person can do about a build's state: stop one that is running; read why one ended; resume one that
 * stopped, whether a refusal or a person stopped it. */
function BuildActs({ build, onBuildChanged }: { build: RunBuild; onBuildChanged: () => void }) {
  const [stopNote, setStopNote] = useState<string | null>(null);
  const running = RUNNING.has(build.status);
  const stopped = build.status === 'cancelled';
  const failed = build.status === 'failed';
  return <>
    {running && <StopBuild jobId={build.jobId} onEnded={note => { setStopNote(note); onBuildChanged(); }} />}
    {stopNote && !running && <p role="status">{stopNote}</p>}
    {failed && <p role="alert">{build.failure?.trim() || 'This build stopped before it finished. No reason was recorded.'}</p>}
    {stopped && <p role="status">This build was stopped. The sections already saved are kept.</p>}
    {(failed || stopped) && <ResumeBuild jobId={build.jobId} onResumed={onBuildChanged} />}
  </>;
}

function BuildOnCard({ build, programId, documentId, onBuildChanged, onDocumentChanged }: {
  build: RunBuild; programId: string; documentId: string; onBuildChanged: () => void; onDocumentChanged?: () => void;
}) {
  const { headings, error, reload } = useBuildHeadings(build.jobId, build.updatedAt);
  const [importing, setImporting] = useState<string[] | null>(null);
  // Held here, not in the review: the list is emptied and read again after a decision, and the review with it.
  const [sendNotice, setSendNotice] = useState<CsrSendNotice | null>(null);
  return <div style={{ display: 'grid', gap: 4 }}>
    <p role="status">CSR build {build.jobId} · {buildStateWord(build)} · {build.progress}% · last updated {new Date(build.updatedAt).toLocaleString()}</p>
    {build.writing && <LiveDraft writing={build.writing} />}
    <BuildActs build={build} onBuildChanged={onBuildChanged} />
    {error && <p role="alert">{error}{' '}
      <button type="button" className="btn ghost" onClick={reload}>Retry reading sections</button>
    </p>}
    {!error && headings === null && <p role="status">Reading the build’s sections…</p>}
    {sendNotice && <p role={sendNotice.alert ? 'alert' : 'status'}>{sendNotice.text}</p>}
    {/* If section provenance cannot be read, the next governed action must
        not appear as though it is ready. The server enforces admission too. */}
    {headings && <>
      <CsrHeadingReview jobId={build.jobId} headings={headings} onChanged={reload} importLabel="Import approved sections into this document" onSendNotice={setSendNotice}
        onImport={sectionNumbers => setImporting(sectionNumbers)} />
      {importing && <ImportIntoDocument key={importing.join(',')} programId={programId} documentId={documentId} jobId={build.jobId}
        sectionNumbers={importing} onClose={() => setImporting(null)} onImported={onDocumentChanged} />}
      <CsrNotApplicable documentId={documentId} jobId={build.jobId} headings={headings} onDocumentChanged={onDocumentChanged} />
      <CsrNarrativeBuild jobId={build.jobId} headings={headings} onChanged={reload} />
      <CsrAssemblyControl jobId={build.jobId} />
    </>}
  </div>;
}
