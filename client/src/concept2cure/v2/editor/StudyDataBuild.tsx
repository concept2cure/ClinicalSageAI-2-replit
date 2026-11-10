/**
 * Build a clinical study report from the study's data, in the one editor (CLAUDE.md RULE 4, 2026-10-31).
 *
 * The founder: one canvas and one document editor for every document type; a document is started from its
 * project. The CSR is started there (Project → New document → Clinical Study Report) and opens here, and its
 * study's data enters here too: choose the study's clinical source in the project's Vault, preview it, and freeze
 * it as this document's study data (StudyDataSource). No Submission Center package run and no filing are needed
 * first. Then the build, its section review and import, the patient narratives, and the assembly with eCTD
 * placement (CsrBuildDraftControl, CsrRunBuilds) run on that frozen data. The approved sections are imported into
 * this document itself (F6, 2026-11-05). Builds already made on an earlier
 * package run's tables stay reachable here. The study's pivotal declarations are kept with its data.
 * A failed read is an alert, never an empty list.
 */
import React, { useCallback, useEffect, useId, useState } from 'react';
import { apiCall, apiErrorText } from '../apiCall';
import { CsrBuildDraftControl } from '../surfaces/CsrBuildProgress';
import { CsrRunBuilds } from '../surfaces/CsrRunBuilds';
import { StudyPivotalDeclarations } from '../surfaces/StudyPivotalDeclarations';
import { readDocumentStudyData, readSavedClinicalTables, StudyDataSource, type SavedTables, type StudyDataEntry } from './StudyDataSource';

/** The recorded template entry of a clinical study report (document-template-library.ts `clinical_study_report`). */
export const CSR_TEMPLATE_ENTRY = 'component:clinical_study_report';

interface SavedRun { runId: string; status: string; startedAt: string }
const isRun = (v: unknown): v is SavedRun => {
  const r = v as Partial<SavedRun> | null;
  return !!r && typeof r.runId === 'string' && typeof r.status === 'string' && typeof r.startedAt === 'string';
};

/** The document's frozen study data, and the project's earlier package runs (whose tables may hold a study). */
function useStudyDataChoices(programId: string, documentId: string, refresh: number) {
  const [state, setState] = useState<{
    studyData: StudyDataEntry[] | null;
    runs: SavedRun[] | null;
    error: string | null;
    runsError: string | null;
  }>({ studyData: null, runs: null, error: null, runsError: null });
  useEffect(() => {
    let live = true;
    setState({ studyData: null, runs: null, error: null, runsError: null });
    // A CSR document belongs to the project; it does NOT require a submission
    // package run. Failure to read optional older package history must not
    // hide the document's own source selector or frozen study data.
    void Promise.allSettled([
      readDocumentStudyData(programId, documentId),
      apiCall<{ runs?: unknown[] }>('GET', `/api/submission-orchestrator/runs?programId=${encodeURIComponent(programId)}`),
    ]).then(([documentResult, historyResult]) => {
      if (!live) return;
      if (documentResult.status !== 'fulfilled') {
        const cause = documentResult.reason;
        setState({ studyData: null, runs: null,
          error: cause instanceof Error ? cause.message : 'The document’s study data could not be read.',
          runsError: null });
        return;
      }

      let runs: SavedRun[] = [];
      let runsError: string | null = null;
      if (historyResult.status === 'rejected') {
        runsError = historyResult.reason instanceof Error
          ? historyResult.reason.message : 'Earlier package-run history could not be read.';
      } else {
        const response = historyResult.value;
        const rows = response.body?.runs;
        if (!response.ok) {
          runsError = apiErrorText(response, 'Earlier package-run history could not be read.');
        } else if (!Array.isArray(rows) || !rows.every(isRun)) {
          runsError = 'Earlier package-run history returned an incomplete response.';
        } else {
          runs = rows;
        }
      }
      // No historical runs is valid ONLY on a successful history read.
      // On failure we still display its error and keep this document's
      // independent, project-scoped clinical-source path available.
      setState({ studyData: documentResult.value, runs, error: null, runsError });
    });
    return () => { live = false; };
  }, [programId, documentId, refresh]);
  return state;
}

function useRetainedTables(programId: string, retainedId: string) {
  const [state, setState] = useState<{ tables: SavedTables | null; error: string | null }>({ tables: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ tables: null, error: null });
    if (retainedId) void readSavedClinicalTables(programId, retainedId).then(
      tables => { if (live) setState({ tables, error: null }); },
      (e: unknown) => { if (live) setState({ tables: null, error: e instanceof Error ? e.message : 'The study’s frozen tables could not be read.' }); });
    return () => { live = false; };
  }, [programId, retainedId]);
  return state;
}

/** The build on one frozen study data (a document's, or an earlier package run's: the same id field). */
function RetainedBuild({ programId, documentId, retainedId, onDocumentChanged }: {
  programId: string; documentId: string; retainedId: string; onDocumentChanged?: () => void;
}) {
  const { tables, error } = useRetainedTables(programId, retainedId);
  const [queued, setQueued] = useState<number | null>(null);
  if (error) return <p role="alert">{error}</p>;
  if (!tables) return <p role="status">Reading the study’s frozen tables…</p>;
  if (!tables.studies.length) return <p>This earlier package run holds no study data. Freeze the study’s clinical source for this document instead.</p>;
  return <>
    <CsrBuildDraftControl programId={programId} runId={retainedId} studies={tables.studies} blocked={false} onQueued={setQueued} />
    <CsrRunBuilds programId={programId} runId={retainedId} documentId={documentId} focus={queued} onDocumentChanged={onDocumentChanged} />
  </>;
}

const describe = (entry: StudyDataEntry) =>
  `${entry.sources.map(source => `${source.protocolNumber} · ${source.documentTitle} v${source.version}`).join('; ')} · frozen ${new Date(entry.createdAt).toLocaleString()}`;

/** The document's clinical source, frozen tables and CSR operations are one
 * context-bound session. A project or document switch must destroy that
 * session synchronously during render, not after a useEffect reset. Otherwise
 * the old project's source picker, preview, or selected build could briefly
 * remain actionable in the new project's editor.
 */
export function StudyDataBuild(props: { programId: string; documentId: string; onNav?: (surface: string) => void;
  /** The editor re-reads this document's sections after the build's approved sections are imported into it (F6). */
  onDocumentChanged?: () => void }) {
  return <StudyDataBuildScoped key={`${props.programId}::${props.documentId}`} {...props} />;
}

/** Shown only for the recorded clinical-study-report template entry. */
function StudyDataBuildScoped({ programId, documentId, onNav, onDocumentChanged }: {
  programId: string; documentId: string; onNav?: (surface: string) => void; onDocumentChanged?: () => void;
}) {
  const [refresh, setRefresh] = useState(0);
  const { studyData, runs, error, runsError } = useStudyDataChoices(programId, documentId, refresh);
  const [retainedId, setRetainedId] = useState('');
  const [adding, setAdding] = useState(false);
  useEffect(() => { setRetainedId(''); setAdding(false); }, [programId, documentId]);
  useEffect(() => { if (!retainedId && studyData?.length) setRetainedId(studyData[0].studyDataId); }, [studyData, retainedId]);
  const frozen = useCallback((entry: StudyDataEntry) => { setAdding(false); setRetainedId(entry.studyDataId); setRefresh(value => value + 1); }, []);
  const none = studyData?.length === 0;
  return <details className="authoring-oversight" aria-label="Build from the study’s data">
    <summary className="authoring-oversight-toggle">Build from the study’s data</summary>
    <div className="ed-source-detail">
      <p>Freeze the study’s clinical source as this document’s study data, then draft this clinical study report from its engine tables, review each section, compose the patient narratives, and assemble and place the report.</p>
      {error && <p role="alert">{error}</p>}
      {runsError && <p role="alert">Earlier submission-package history is unavailable: {runsError} This document’s own study data remains accessible.</p>}
      {!error && studyData === null && <p role="status">Reading this document’s study data…</p>}
      {studyData && runs && <StudyDataChooser studyData={studyData} runs={runs} value={retainedId} onChange={setRetainedId} />}
      {studyData && (none || adding)
        ? <>
          {adding && <button type="button" className="btn ghost" onClick={() => setAdding(false)}>
            Return to current frozen study data and CSR build
          </button>}
          <StudyDataSource programId={programId} documentId={documentId} onFrozen={frozen} onNav={onNav} />
        </>
        : studyData && <button type="button" className="btn ghost" onClick={() => setAdding(true)}>Freeze newer study data</button>}
      {retainedId && <RetainedBuild key={retainedId} programId={programId} documentId={documentId} retainedId={retainedId} onDocumentChanged={onDocumentChanged} />}
      <StudyPivotalDeclarations scope={{ programId }} />
    </div>
  </details>;
}

/** The document's frozen study data first, then earlier package runs, whose builds stay reachable. */
function StudyDataChooser({ studyData, runs, value, onChange }: {
  studyData: StudyDataEntry[]; runs: SavedRun[]; value: string; onChange: (id: string) => void;
}) {
  const pickId = useId();
  if (studyData.length === 0 && runs.length === 0) return null;
  return <label htmlFor={pickId}>Study data{' '}
    <select id={pickId} className="c2c-input" value={value} onChange={event => onChange(event.target.value)}>
      <option value="">Choose the study data</option>
      {studyData.length > 0 && <optgroup label="Frozen for this document">
        {studyData.map(entry => <option key={entry.studyDataId} value={entry.studyDataId}>{describe(entry)}</option>)}
      </optgroup>}
      {runs.length > 0 && <optgroup label="From an earlier package run">
        {runs.map(run => <option key={run.runId} value={run.runId}>{new Date(run.startedAt).toLocaleString()} · {run.status}</option>)}
      </optgroup>}
    </select></label>;
}
