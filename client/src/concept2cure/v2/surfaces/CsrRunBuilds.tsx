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
 * read; the re-reads stop once every build has ended. A failed build says why
 * it stopped (the list's `failure`, F10 of the 2026-11-02 demo walk).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { apiCall, apiErrorText } from '../apiCall';
import { I } from '../icons';
import { CsrHeadingReview, CsrNarrativeBuild, type CsrBoardHeading } from './CsrBuildProgress';
import { CsrAssemblyControl } from './CsrAssemblyControl';
import { SourceImportDialog, openImportedDocument, type ImportSource } from '../editor/SourceImportDialog';
import { useShellProject } from '../shellProject';

const JOBS = '/api/csr/jobs';
/** How often the list is re-read while a build of the run is still running. */
export const BUILD_POLL_MS = 5_000;
/** The csr_build_jobs statuses that end a build (migrations/20260628_csr_job_state.sql). */
const ENDED = new Set(['complete', 'failed', 'cancelled']);
/** Matches the persisted csr_build_jobs.status check constraint. */
const BUILD_STATUSES = new Set(['queued', 'loading_data', 'drafting', 'tabulating',
  'cross_linking', 'complete', 'failed', 'cancelled']);

/** One row of GET /api/csr/jobs?programId&runId (csr-jobs.ts). `failure` is why a failed build stopped, in plain
 * words the server chose from its recorded receipt (csr-job-runner.ts csrBuildFailureText); null otherwise. */
interface RunBuild { jobId: number; studyId: string; status: string; progress: number; updatedAt: string; failure?: string | null }

const HEADING_STATES: ReadonlyArray<CsrBoardHeading['state']> = ['not_drafted', 'draft', 'in_review', 'approved'];

function isBuild(value: unknown): value is RunBuild {
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

/** The builds bound to the run, newest first; re-read when `focus` changes and while a build is running. */
function useRunBuilds(programId: string, runId: string, focus: number | null) {
  // The same mounted editor may change its project or frozen clinical-source
  // run. A previous run's data must disappear during the very FIRST render
  // of the new scope, before useEffect cleanup or the new HTTP read.
  const scope = `${programId}::${runId}`;
  const [state, setState] = useState<{ scope: string; builds: RunBuild[] | null; error: string | null }>({
    scope, builds: null, error: null,
  });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState(current => current.scope === scope
      ? { ...current, error: null }
      : { scope, builds: null, error: null });
    void apiCall<{ jobs?: unknown[] }>('GET', `${JOBS}?programId=${encodeURIComponent(programId)}&runId=${encodeURIComponent(runId)}`).then(result => {
      if (!live) return;
      const jobs = result.body?.jobs;
      if (result.ok && Array.isArray(jobs) && jobs.every(isBuild)) {
        setState({ scope, builds: jobs, error: null });
        if (jobs.some(job => !ENDED.has(job.status))) timer = setTimeout(() => setReload(value => value + 1), BUILD_POLL_MS);
      } else setState({ scope, builds: null, error: apiErrorText(result, 'The CSR builds of this run could not be listed.') });
    });
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [programId, runId, focus, reload, scope]);
  const current = state.scope === scope;
  return {
    builds: current ? state.builds : null,
    error: current ? state.error : null,
    retry: useCallback(() => setReload(value => value + 1), []),
  };
}

/** The builds of the saved run, and the narrative and assembly controls for the selected one. */
export function CsrRunBuilds({ programId, runId, focus, onNav }: {
  programId: string; runId: string; focus: number | null; onNav?: (surface: string) => void;
}) {
  const { builds, error, retry } = useRunBuilds(programId, runId, focus);
  const [chosen, setChosen] = useState<number | null>(null);
  useEffect(() => { if (focus !== null) setChosen(focus); }, [focus]);
  const selected = builds?.find(b => b.jobId === chosen) ?? builds?.[0] ?? null;
  return <section aria-label="CSR builds from this study data" style={{ display: 'grid', gap: 6 }}>
    <BuildPicker builds={builds} selected={selected} onChoose={setChosen} onReload={retry} />
    {error && <p role="alert">{error}</p>}
    {!error && builds === null && <p role="status">Loading the CSR builds of this run…</p>}
    {!error && builds?.length === 0 && <p>No CSR build has been started from this study data.</p>}
    {!error && selected && <BuildOnCard key={selected.jobId} build={selected} programId={programId} onNav={onNav} />}
  </section>;
}

function BuildPicker({ builds, selected, onChoose, onReload }: {
  builds: RunBuild[] | null; selected: RunBuild | null; onChoose: (jobId: number) => void; onReload: () => void;
}) {
  return <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
    <strong>CSR builds from this study data</strong>
    {builds && builds.length > 1 && <select aria-label="CSR build" value={selected?.jobId ?? ''} onChange={e => onChoose(Number(e.target.value))}>
      {builds.map(b => <option key={b.jobId} value={b.jobId}>CSR build {b.jobId} · {b.status}</option>)}
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
  const [state, setState] = useState<{ scope: string; headings: CsrBoardHeading[] | null; error: string | null }>({
    scope, headings: null, error: null,
  });
  useEffect(() => {
    let active = true;
    setState({ scope, headings: null, error: null });
    void apiCall<{ headings?: unknown }>('GET', `${JOBS}/${jobId}/headings`).then(result => {
      if (!active) return;
      const headings = result.body?.headings;
      if (result.ok && Array.isArray(headings) && headings.every(isHeading)) {
        setState({ scope, headings, error: null });
      } else {
        setState({ scope, headings: null, error: apiErrorText(result, 'The build’s sections could not be read for review.') });
      }
    }).catch(() => {
      if (active) setState({ scope, headings: null, error: 'The build’s sections could not be read for review.' });
    });
    return () => { active = false; };
  }, [jobId, scope]);
  const current = state.scope === scope;
  return {
    headings: current ? state.headings : null,
    error: current ? state.error : null,
    reload: useCallback(() => setRefresh(value => value + 1), []),
  };
}

/** The open project's name, only when the open project is this program; otherwise the dialog names it by id. */
function useProgramName(programId: string): string | undefined {
  const shell = useShellProject();
  if (!shell || String(shell.id).trim().toLowerCase() !== programId.toLowerCase()) return undefined;
  return shell.title?.trim() || undefined;
}

function BuildOnCard({ build, programId, onNav }: { build: RunBuild; programId: string; onNav?: (surface: string) => void }) {
  const { headings, error, reload } = useBuildHeadings(build.jobId, build.updatedAt);
  const programName = useProgramName(programId);
  const [importSource, setImportSource] = useState<ImportSource | null>(null);
  return <div style={{ display: 'grid', gap: 4 }}>
    <p role="status">CSR build {build.jobId} · {build.status} · {build.progress}% · last updated {new Date(build.updatedAt).toLocaleString()}</p>
    {build.status === 'failed' && <p role="alert">{build.failure?.trim() || 'This build stopped before it finished. No reason was recorded.'}</p>}
    {error && <p role="alert">{error}{' '}
      <button type="button" className="btn ghost" onClick={reload}>Retry reading sections</button>
    </p>}
    {!error && headings === null && <p role="status">Reading the build’s sections…</p>}
    {/* If section provenance cannot be read, the next governed action must
        not appear as though it is ready. The server enforces admission too. */}
    {headings && <>
      <CsrHeadingReview jobId={build.jobId} headings={headings} onChanged={reload}
        onImport={sectionNumbers => setImportSource({ kind: 'csr', jobId: build.jobId, sectionNumbers, approvedOnly: true })} />
      <CsrNarrativeBuild jobId={build.jobId} headings={headings} onChanged={reload} />
      <CsrAssemblyControl jobId={build.jobId} />
    </>}
    {importSource && <SourceImportDialog programId={programId} programName={programName} source={importSource} title={`CSR build ${build.jobId} · ${build.studyId}`}
      onClose={() => setImportSource(null)}
      onOpenDocument={onNav ? (docId, code) => openImportedDocument(docId, programId, onNav, code) : undefined} />}
  </div>;
}
