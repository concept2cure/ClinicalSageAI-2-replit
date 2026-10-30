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
 * claims at launch.
 * A failed read is an alert, never an empty list. While a build is still
 * running (queued through cross_linking) the list is re-read every
 * BUILD_POLL_MS, so its status and progress are not left at the value first
 * read; the re-reads stop once every build has ended.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { apiCall, apiErrorText } from '../apiCall';
import { I } from '../icons';
import { CsrHeadingReview, CsrNarrativeBuild, type CsrBoardHeading } from './CsrBuildProgress';
import { CsrAssemblyControl } from './CsrAssemblyControl';
import { SourceImportDialog, openImportedDocument, type ImportSource } from '../editor/SourceImportDialog';

const JOBS = '/api/csr/jobs';
/** How often the list is re-read while a build of the run is still running. */
export const BUILD_POLL_MS = 5_000;
/** The csr_build_jobs statuses that end a build (migrations/20260628_csr_job_state.sql). */
const ENDED = new Set(['complete', 'failed', 'cancelled']);

/** One row of GET /api/csr/jobs?programId&runId (csr-jobs.ts). */
interface RunBuild { jobId: number; studyId: string; status: string; progress: number; updatedAt: string }

const HEADING_STATES: ReadonlyArray<CsrBoardHeading['state']> = ['not_drafted', 'draft', 'in_review', 'approved'];

function isBuild(value: unknown): value is RunBuild {
  const row = value as Partial<RunBuild> | null;
  return !!row && Number.isSafeInteger(row.jobId) && Number(row.jobId) > 0 && typeof row.status === 'string';
}

/** One heading of GET /api/csr/jobs/:jobId/headings; a malformed row refuses the whole read. */
function isHeading(value: unknown): value is CsrBoardHeading {
  const row = value as Partial<CsrBoardHeading> | null;
  return !!row && typeof row.num === 'string' && typeof row.label === 'string' && Number.isSafeInteger(row.depth)
    && typeof row.manual === 'boolean' && HEADING_STATES.includes(row.state as CsrBoardHeading['state'])
    && (row.contentHash === undefined || typeof row.contentHash === 'string');
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
export function CsrRunBuilds({ programId, runId, focus, onNav }: {
  programId: string; runId: string; focus: number | null; onNav?: (surface: string) => void;
}) {
  const { builds, error, retry } = useRunBuilds(programId, runId, focus);
  const [chosen, setChosen] = useState<number | null>(null);
  useEffect(() => { if (focus !== null) setChosen(focus); }, [focus]);
  const selected = builds?.find(b => b.jobId === chosen) ?? builds?.[0] ?? null;
  return <section aria-label="CSR builds from this run" style={{ display: 'grid', gap: 6 }}>
    <BuildPicker builds={builds} selected={selected} onChoose={setChosen} onReload={retry} />
    {error && <p role="alert">{error}</p>}
    {!error && builds === null && <p role="status">Loading the CSR builds of this run…</p>}
    {!error && builds?.length === 0 && <p>No CSR build has been started from this run.</p>}
    {!error && selected && <BuildOnCard key={selected.jobId} build={selected} programId={programId} onNav={onNav} />}
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

/** The build's ICH E3 headings, re-read when the polled build moves and after each review decision. `null` until read. */
function useBuildHeadings(jobId: number, updatedAt: string) {
  const [state, setState] = useState<{ headings: CsrBoardHeading[] | null; error: string | null }>({ headings: null, error: null });
  const load = useCallback(async () => {
    const result = await apiCall<{ headings?: unknown }>('GET', `${JOBS}/${jobId}/headings`);
    const headings = result.body?.headings;
    if (result.ok && Array.isArray(headings) && headings.every(isHeading)) setState({ headings, error: null });
    else setState({ headings: null, error: apiErrorText(result, 'The build’s sections could not be read for review.') });
  }, [jobId]);
  useEffect(() => { void load(); }, [load, updatedAt]);
  return { ...state, reload: useCallback(() => { void load(); }, [load]) };
}

function BuildOnCard({ build, programId, onNav }: { build: RunBuild; programId: string; onNav?: (surface: string) => void }) {
  const { headings, error, reload } = useBuildHeadings(build.jobId, build.updatedAt);
  const [importSource, setImportSource] = useState<ImportSource | null>(null);
  return <div style={{ display: 'grid', gap: 4 }}>
    <p role="status">CSR build {build.jobId} · {build.status} · {build.progress}% · last updated {new Date(build.updatedAt).toLocaleString()}</p>
    {error && <p role="alert">{error}</p>}
    {!error && headings === null && <p role="status">Reading the build’s sections…</p>}
    {headings && <CsrHeadingReview jobId={build.jobId} headings={headings} onChanged={reload}
      onImport={sectionNumbers => setImportSource({ kind: 'csr', jobId: build.jobId, sectionNumbers })} />}
    <CsrNarrativeBuild jobId={build.jobId} headings={headings ?? []} onChanged={reload} />
    <CsrAssemblyControl jobId={build.jobId} />
    {/* The card has no project name in hand; the dialog names the target project by its id. */}
    {importSource && <SourceImportDialog programId={programId} source={importSource} title={`CSR build ${build.jobId} · ${build.studyId}`}
      onClose={() => setImportSource(null)}
      onOpenDocument={onNav ? (docId, code) => openImportedDocument(docId, programId, onNav, code) : undefined} />}
  </div>;
}
