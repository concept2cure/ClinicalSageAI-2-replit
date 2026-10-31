/**
 * Build a clinical study report from the study's data, in the one editor (CLAUDE.md RULE 4, 2026-10-31).
 *
 * The founder: one canvas and one document editor for every document type; a document is started from
 * its project. The CSR is started there (Project → Clinical Study Report) and opens here. This is where
 * its engine work is done: choose the saved run whose frozen clinical tables the study's data produced
 * (Submission Center keeps that data input: the clinical source and its frozen tables), then the build,
 * its section review and import, the patient narratives, and the assembly with eCTD placement. Those are
 * the existing controls (CsrBuildDraftControl, CsrRunBuilds), moved here from Submission Center's CSR
 * card, not copied. A failed read is an alert, never an empty list.
 */
import React, { useEffect, useId, useState } from 'react';
import { apiCall, apiErrorText } from '../apiCall';
import { CsrBuildDraftControl } from '../surfaces/CsrBuildProgress';
import { CsrRunBuilds } from '../surfaces/CsrRunBuilds';
import { readSavedClinicalTables, type SavedTables } from '../surfaces/CsrSourceInputControls';

/** The recorded template entry of a clinical study report (document-template-library.ts `clinical_study_report`). */
export const CSR_TEMPLATE_ENTRY = 'component:clinical_study_report';

interface SavedRun { runId: string; status: string; startedAt: string }
const isRun = (v: unknown): v is SavedRun => {
  const r = v as Partial<SavedRun> | null;
  return !!r && typeof r.runId === 'string' && typeof r.status === 'string' && typeof r.startedAt === 'string';
};

function useSavedRuns(programId: string) {
  const [state, setState] = useState<{ runs: SavedRun[] | null; error: string | null }>({ runs: null, error: null });
  useEffect(() => {
    let live = true;
    void apiCall<{ runs?: unknown[] }>('GET', `/api/submission-orchestrator/runs?programId=${encodeURIComponent(programId)}`).then(result => {
      if (!live) return;
      const runs = result.body?.runs;
      if (result.ok && Array.isArray(runs) && runs.every(isRun)) setState({ runs, error: null });
      else setState({ runs: null, error: apiErrorText(result, 'The project’s saved runs could not be listed.') });
    });
    return () => { live = false; };
  }, [programId]);
  return state;
}

function useRunTables(programId: string, runId: string) {
  const [state, setState] = useState<{ tables: SavedTables | null; error: string | null }>({ tables: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ tables: null, error: null });
    if (runId) void readSavedClinicalTables(programId, runId).then(
      tables => { if (live) setState({ tables, error: null }); },
      (e: unknown) => { if (live) setState({ tables: null, error: e instanceof Error ? e.message : 'The run’s clinical tables could not be read.' }); });
    return () => { live = false; };
  }, [programId, runId]);
  return state;
}

function RunBuild({ programId, runId, onNav }: { programId: string; runId: string; onNav?: (surface: string) => void }) {
  const { tables, error } = useRunTables(programId, runId);
  const [queued, setQueued] = useState<number | null>(null);
  if (error) return <p role="alert">{error}</p>;
  if (!tables) return <p role="status">Reading the run’s clinical tables…</p>;
  if (!tables.studies.length) return <p>This run holds no clinical source tables. Include the study’s clinical source in a package run in Submission Center first.</p>;
  return <>
    <CsrBuildDraftControl programId={programId} runId={runId} studies={tables.studies} blocked={false} onQueued={setQueued} />
    <CsrRunBuilds programId={programId} runId={runId} focus={queued} onNav={onNav} />
  </>;
}

/** Shown in the editor for a clinical study report only (its recorded template entry). */
export function StudyDataBuild({ programId, onNav }: { programId: string; onNav?: (surface: string) => void }) {
  const { runs, error } = useSavedRuns(programId);
  const [runId, setRunId] = useState('');
  const pickId = useId();
  return <details className="authoring-oversight" aria-label="Build from the study’s data">
    <summary className="authoring-oversight-toggle">Build from the study’s data</summary>
    <div className="ed-source-detail">
      <p>Draft this clinical study report from the study’s engine tables, then review each section, compose the patient narratives, and assemble and place the report.</p>
      {error && <p role="alert">{error}</p>}
      {!error && runs === null && <p role="status">Listing the project’s saved runs…</p>}
      {!error && runs?.length === 0 && <p>No saved run holds this study’s data yet. Include the study’s clinical source in a package run in Submission Center first.</p>}
      {!error && runs && runs.length > 0 && <label htmlFor={pickId}>Saved run with the study’s data{' '}
        <select id={pickId} className="c2c-input" value={runId} onChange={event => setRunId(event.target.value)}>
          <option value="">Choose a saved run</option>
          {runs.map(run => <option key={run.runId} value={run.runId}>{new Date(run.startedAt).toLocaleString()} · {run.status}</option>)}
        </select></label>}
      {runId && <RunBuild key={runId} programId={programId} runId={runId} onNav={onNav} />}
    </div>
  </details>;
}
