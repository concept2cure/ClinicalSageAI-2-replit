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
 * controls for the selected build. §14.3.3's review state is read from the
 * build's own sections (GET /api/csr/jobs/:jobId/sections), not the board.
 * Every path is under /api/csr/jobs, which eCTD Compile claims at launch.
 * A failed read is an alert, never an empty list. While a build is still
 * running (queued through cross_linking) the list is re-read every
 * BUILD_POLL_MS, so its status and progress are not left at the value first
 * read; the re-reads stop once every build has ended.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { apiCall, apiErrorText } from '../apiCall';
import { I } from '../icons';
import { CsrNarrativeBuild, type CsrBoardHeading } from './CsrBuildProgress';
import { CsrAssemblyControl } from './CsrAssemblyControl';

const JOBS = '/api/csr/jobs';
/** How often the list is re-read while a build of the run is still running. */
export const BUILD_POLL_MS = 5_000;
/** The csr_build_jobs statuses that end a build (migrations/20260628_csr_job_state.sql). */
const ENDED = new Set(['complete', 'failed', 'cancelled']);

/** One row of GET /api/csr/jobs?programId&runId (csr-jobs.ts). */
interface RunBuild { jobId: number; studyId: string; status: string; progress: number; updatedAt: string }
interface SectionRow { sectionNumber: string; review?: { state?: CsrBoardHeading['state']; staleApproval?: boolean } }

const REVIEW_STATES: ReadonlyArray<CsrBoardHeading['state']> = ['draft', 'in_review', 'approved'];

function isBuild(value: unknown): value is RunBuild {
  const row = value as Partial<RunBuild> | null;
  return !!row && Number.isSafeInteger(row.jobId) && Number(row.jobId) > 0 && typeof row.status === 'string';
}

/** The drafted headings with their review state, as CsrNarrativeBuild reads them. */
function headingsOf(sections: SectionRow[]): CsrBoardHeading[] {
  return sections.map(section => {
    const state = section.review?.state && REVIEW_STATES.includes(section.review.state) ? section.review.state : 'draft';
    return { num: section.sectionNumber, label: '', depth: section.sectionNumber.split('.').length, manual: false, state,
      ...(section.review?.staleApproval ? { staleApproval: true } : {}) };
  });
}

/** The builds bound to the run, newest first; re-read when `focus` changes and while a build is running. */
function useRunBuilds(programId: string, runId: string, focus: number | null) {
  const [state, setState] = useState<{ builds: RunBuild[] | null; error: string | null }>({ builds: null, error: null });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState(current => ({ builds: current.builds, error: null }));
    void apiCall<{ jobs?: unknown[] }>('GET', `${JOBS}?programId=${encodeURIComponent(programId)}&runId=${encodeURIComponent(runId)}`).then(result => {
      if (!live) return;
      const jobs = result.body?.jobs;
      if (result.ok && Array.isArray(jobs) && jobs.every(isBuild)) {
        setState({ builds: jobs, error: null });
        if (jobs.some(job => !ENDED.has(job.status))) timer = setTimeout(() => setReload(value => value + 1), BUILD_POLL_MS);
      } else setState({ builds: null, error: apiErrorText(result, 'The CSR builds of this run could not be listed.') });
    });
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [programId, runId, focus, reload]);
  return { ...state, retry: useCallback(() => setReload(value => value + 1), []) };
}

/** The builds of the saved run, and the narrative and assembly controls for the selected one. */
export function CsrRunBuilds({ programId, runId, focus }: { programId: string; runId: string; focus: number | null }) {
  const { builds, error, retry } = useRunBuilds(programId, runId, focus);
  const [chosen, setChosen] = useState<number | null>(null);
  useEffect(() => { if (focus !== null) setChosen(focus); }, [focus]);
  const selected = builds?.find(b => b.jobId === chosen) ?? builds?.[0] ?? null;
  return <section aria-label="CSR builds from this run" style={{ display: 'grid', gap: 6 }}>
    <BuildPicker builds={builds} selected={selected} onChoose={setChosen} onReload={retry} />
    {error && <p role="alert">{error}</p>}
    {!error && builds === null && <p role="status">Loading the CSR builds of this run…</p>}
    {!error && builds?.length === 0 && <p>No CSR build has been started from this run.</p>}
    {!error && selected && <BuildOnCard key={selected.jobId} build={selected} />}
  </section>;
}

function BuildPicker({ builds, selected, onChoose, onReload }: {
  builds: RunBuild[] | null; selected: RunBuild | null; onChoose: (jobId: number) => void; onReload: () => void;
}) {
  return <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
    <strong>CSR builds from this run</strong>
    {builds && builds.length > 1 && <select aria-label="CSR build" value={selected?.jobId ?? ''} onChange={e => onChoose(Number(e.target.value))}>
      {builds.map(b => <option key={b.jobId} value={b.jobId}>CSR build {b.jobId} · {b.status}</option>)}
    </select>}
    <button type="button" className="btn" onClick={onReload}>{I.rotateCw} Reload builds</button>
  </div>;
}

function BuildOnCard({ build }: { build: RunBuild }) {
  const [sections, setSections] = useState<{ headings: CsrBoardHeading[]; error: string | null }>({ headings: [], error: null });
  const loadSections = useCallback(async () => {
    const result = await apiCall<{ sections?: SectionRow[] }>('GET', `${JOBS}/${build.jobId}/sections`);
    if (result.ok && Array.isArray(result.body?.sections)) setSections({ headings: headingsOf(result.body!.sections!), error: null });
    else setSections({ headings: [], error: apiErrorText(result, 'The build’s sections could not be read.') });
  }, [build.jobId]);
  // Re-read the drafted sections each time the polled build moves.
  useEffect(() => { void loadSections(); }, [loadSections, build.updatedAt]);
  const changed = useCallback(() => { void loadSections(); }, [loadSections]);
  return <div style={{ display: 'grid', gap: 4 }}>
    <p role="status">CSR build {build.jobId} · {build.status} · {build.progress}% · last updated {new Date(build.updatedAt).toLocaleString()}</p>
    {sections.error && <p role="alert">{sections.error}</p>}
    <CsrNarrativeBuild jobId={build.jobId} headings={sections.headings} onChanged={changed} />
    <CsrAssemblyControl jobId={build.jobId} />
  </div>;
}
