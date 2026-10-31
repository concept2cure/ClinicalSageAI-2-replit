// @vitest-environment jsdom
/**
 * Reach of a CSR build from Submission Center's CSR card (D2/W1, 2026-10-30;
 * docs/evidence/D2-CSR/2026-10-30-csr-card-reach/). Production refuses
 * /api/csr-workflow/board, so the build board is not a launch screen. The card
 * lists the builds bound to the saved run (GET /api/csr/jobs?programId&runId)
 * and carries, for the selected build, the narrative build and the assembly
 * with its placement. No control on the card navigates to the board. Since
 * 2026-10-30 (docs/evidence/D2-CSR/2026-10-30-csr-card-review/) the card also
 * reviews the build's sections against the ICH E3 tree read from
 * GET /api/csr/jobs/:jobId/headings, and imports the approved ones into
 * Authoring through the canonical intake (SourceImportDialog). SYNTHETIC.
 */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
vi.mock('../editor/SourceImportDialog', async original => ({ ...(await original<typeof import('../editor/SourceImportDialog')>()),
  SourceImportDialog: ({ programId, programName, source, onOpenDocument }: { programId: string; programName?: string; source: unknown; onOpenDocument?: (id: string, code?: string) => void }) =>
    <div data-testid="csr-import">{JSON.stringify({ programId, programName, source })}
      {onOpenDocument && <button type="button" onClick={() => onOpenDocument('saved-csr-copy', '11.4.1')}>Open confirmed copy</button>}</div> }));
import { CsrSourceInputControls } from '../surfaces/CsrSourceInputControls';
import { StudyDataBuild } from '../editor/StudyDataBuild';
import { BUILD_POLL_MS } from '../surfaces/CsrRunBuilds';
import { clearEditorTarget, peekEditorTarget } from '../editorTarget';
import { clearShellProject, publishShellProject } from '../shellProject';

const PROGRAM = '11111111-2222-4333-8444-000000000001';
const RUN = '0b9f3c1e-6a4d-4b7e-9c2a-5d1e8f7a6b31';
const HASH = 'a'.repeat(64);
const receipt = { documentId: '11111111-2222-4333-8444-000000000003', documentTitle: 'SYN source', version: '2', sha256: HASH,
  adapter: 'concept2cure.csr-source.v1', dataCutDate: '2026-10-01', studyId: 'SYN-201', protocolNumber: 'SYN-201-P',
  clinicalVerification: 'not-established', sourceApproval: 'canonical-lifecycle', studyInfo: {
    title: 'SYN Phase 2', protocolNumber: 'SYN-201-P', phase: 'Phase 2', indication: 'Synthetic', sponsor: 'Sponsor',
    investigationalProduct: 'SYN', studyDesign: 'Randomized 1:1', primaryEndpoint: 'Cure',
  } };
const tables = Object.fromEntries(['disposition', 'analysisPopulations', 'demographics', 'primaryEfficacy', 'aeOverallSummary', 'aeBySOC', 'aeTopPT', 'deathsSAEsDiscontinuations']
  .map(key => [key, { title: `${key} table`, headers: ['Measure', 'Result'], rows: [['Randomized', '23']] }]));
const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });
const refusal = (status: number, payload: unknown) => Object.assign(new Error('refused'), { name: 'ApiRequestError', status, payload });
const BUILDS = `/api/csr/jobs?programId=${PROGRAM}&runId=${RUN}`;
const build = (jobId: number, status = 'complete') => ({ jobId, studyId: 'SYN-201-P', status, progress: status === 'complete' ? 100 : 0, updatedAt: '2026-10-30T09:00:00Z' });
let builds: unknown[] = [];
const HASH_10 = 'b'.repeat(64);
/** GET /api/csr/jobs/:jobId/headings (server csr-headings.ts): the E3 tree with each output's review state. */
const headings = [
  { num: '9', label: 'Investigational plan', depth: 1, manual: false, state: 'not_drafted' },
  { num: '10.1', label: 'Disposition of patients', depth: 2, manual: false, state: 'in_review', contentHash: HASH_10, reviewerId: 5, decidedAt: null, reason: null },
  { num: '11.4.1', label: 'Analysis of efficacy', depth: 3, manual: false, state: 'approved', contentHash: 'c'.repeat(64), reviewerId: 6, decidedAt: '2026-10-30T09:00:00Z', reason: null },
  { num: '12.2', label: 'Adverse events', depth: 2, manual: false, state: 'approved', contentHash: 'd'.repeat(64), reviewerId: 6, decidedAt: '2026-10-30T09:00:00Z', reason: null },
  { num: '14.3.3', label: 'Narratives of deaths, other serious and certain other significant adverse events', depth: 3, manual: true, state: 'in_review', contentHash: 'e'.repeat(64), reviewerId: 5, decidedAt: null, reason: null },
];
const nav = vi.fn();

const RUNS_LIST = `/api/submission-orchestrator/runs?programId=${PROGRAM}`;
function routes(method: string, path: string) {
  if (path === RUNS_LIST) return ok({ runs: [{ runId: RUN, status: 'completed', startedAt: '2026-10-30T08:00:00Z' }] });
  return jobRoutes(method, path);
}

function jobRoutes(method: string, path: string) {
  if (path.includes('/csr/sources?')) return ok({ format: 'concept2cure.csr-source.v1', limitReached: false, sources: [] });
  if (path.includes('/clinical-tables?')) return ok({ runId: RUN, programId: PROGRAM, historical: true, studies: [{ source: receipt, tables }] });
  if (method === 'GET' && path === BUILDS) return ok({ jobs: builds });
  if (method === 'POST' && path === '/api/csr/jobs') { builds = [build(42, 'queued'), ...builds]; return ok({ jobId: 42, status: 'queued' }, 202); }
  if (method === 'GET' && /\/api\/csr\/jobs\/\d+\/headings$/.test(path)) return ok({ headings });
  if (method === 'POST' && /\/sections\/[\d.]+\/review$/.test(path)) return ok({ review: { state: 'approved' } });
  if (/\/narratives\/status$/.test(path)) return ok({ run: null });
  if (/\/narratives$/.test(path)) return ok({ subjects: [] });
  if (/\/assembly$/.test(path)) return ok({ assembly: null });
  return ok({});
}

beforeEach(() => { builds = [build(41)]; apiRequest.mockImplementation(async (method: string, path: string) => routes(method, path)); });
afterEach(() => { cleanup(); apiRequest.mockReset(); nav.mockReset(); clearEditorTarget(); });
/* 2026-10-31 (CLAUDE.md RULE 4): the build lives in the CSR document's editor, not on Submission Center's card.
   These cases are the card's, moved: mount the editor's build and choose the saved run. */
const card = async () => {
  render(<StudyDataBuild programId={PROGRAM} onNav={nav} />);
  fireEvent.change(await screen.findByLabelText(/Saved run with the study’s data/), { target: { value: RUN } });
};

it('Submission Center keeps the study data and points to the document; it carries no CSR build', async () => {
  render(<CsrSourceInputControls programId={PROGRAM} runId={RUN} interactionBusy={false}
    onSelectionChange={() => {}} onBusyChange={() => {}} onNav={nav} />);
  expect(await screen.findByLabelText('Frozen run clinical tables')).toBeTruthy();
  expect(await screen.findByText(/open the project’s Clinical Study Report document in the editor/)).toBeTruthy();
  expect(screen.queryByLabelText('CSR builds from this run')).toBeNull();
  expect(screen.queryByRole('button', { name: /Build CSR draft/ })).toBeNull();
});

it('carries the narrative build and the assembly for a build of the saved run, in the CSR document’s editor', async () => {
  await card();
  const region = await screen.findByLabelText('CSR builds from this run');
  expect(await within(region).findByLabelText('Patient safety narratives')).toBeTruthy();
  expect(within(region).getByLabelText('CSR assembly')).toBeTruthy();
  expect(within(region).getByRole('button', { name: /Build narratives/ })).toBeTruthy();
  expect(await within(region).findByRole('button', { name: /Assemble CSR files/ })).toBeTruthy();
  // §14.3.3's review state comes from the build's own headings, not the board.
  expect(await within(region).findByText(/§14\.3\.3 is in review/)).toBeTruthy();
  expect(apiRequest.mock.calls.some(([, p]) => String(p).startsWith('/api/csr-workflow/board'))).toBe(false);
});

it('a newly queued build is selected in the editor; nothing navigates to the board', async () => {
  await card();
  fireEvent.click(await screen.findByRole('button', { name: /Build CSR draft · SYN-201-P/ }));
  await screen.findByText(/CSR build 42 is queued/);
  const region = screen.getByLabelText('CSR builds from this run');
  expect(await within(region).findByText(/CSR build 42 · queued · 0%/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Open build progress/ })).toBeNull();
  expect(nav).not.toHaveBeenCalledWith('csr-workflow');
  await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', '/api/csr/jobs/42/assembly', undefined));
});

it('states that no build exists for the run, and a refused build list as an alert, never an empty list', async () => {
  builds = [];
  await card();
  expect(await screen.findByText('No CSR build has been started from this run.')).toBeTruthy();
  cleanup();
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === BUILDS) throw refusal(403, { code: 'CSR_PROJECT_ACCESS_DENIED', error: 'The CSR actor does not have access to this project.' });
    return routes(method, path);
  });
  await card();
  const alert = await screen.findByText(/does not have access to this project/);
  expect(alert.getAttribute('role')).toBe('alert');
  expect(screen.queryByText('No CSR build has been started from this run.')).toBeNull();
});

it('follows a drafting build until it ends, then stops re-reading the list', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    builds = [{ ...build(43, 'drafting'), progress: 40 }];
    await card();
    const region = await screen.findByLabelText('CSR builds from this run');
    expect(await within(region).findByText(/CSR build 43 · drafting · 40%/)).toBeTruthy();
    builds = [{ ...build(43), updatedAt: '2026-10-30T09:05:00Z' }];
    await act(async () => { await vi.advanceTimersByTimeAsync(BUILD_POLL_MS); });
    expect(await within(region).findByText(/CSR build 43 · complete · 100%/)).toBeTruthy();
    const reads = () => apiRequest.mock.calls.filter(([m, p]) => m === 'GET' && p === BUILDS).length;
    const settled = reads();
    // Three poll intervals, each flushed through React, so a re-read that was scheduled would have run.
    for (let i = 0; i < 3; i += 1) await act(async () => { await vi.advanceTimersByTimeAsync(BUILD_POLL_MS); });
    expect(reads()).toBe(settled);
  } finally { vi.useRealTimers(); }
});

const headingReads = (jobId: number) => apiRequest.mock.calls.filter(([m, p]) => m === 'GET' && p === `/api/csr/jobs/${jobId}/headings`).length;

it('reviews the selected build section by section, with the ICH E3 labels, and approves against the content hash', async () => {
  await card();
  const region = await screen.findByLabelText('CSR builds from this run');
  const review = await within(region).findByLabelText('Section review');
  expect(within(review).getByText('4 of 5 ICH E3 headings drafted · 2 approved')).toBeTruthy();
  const row = within(review).getByText('Disposition of patients').closest('li')!;
  const before = headingReads(41);
  fireEvent.click(within(row).getByRole('button', { name: /Approve/ }));
  await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/csr/jobs/41/sections/10.1/review',
    { decision: 'approve', expectedContentHash: HASH_10 }));
  // The decision is re-read from the server, never assumed.
  await vi.waitFor(() => expect(headingReads(41)).toBeGreaterThan(before));
  expect(apiRequest.mock.calls.some(([, p]) => String(p).startsWith('/api/csr-workflow/board'))).toBe(false);
});

it('imports exactly the approved sections into Authoring and opens the saved copy there', async () => {
  await card();
  const region = await screen.findByLabelText('CSR builds from this run');
  fireEvent.click(await within(region).findByRole('button', { name: /Import approved sections into Authoring/ }));
  const dialog = await screen.findByTestId('csr-import');
  // No open project in the shell: the dialog names the target by its id (programName absent).
  expect(JSON.parse(dialog.firstChild!.textContent!)).toEqual({ programId: PROGRAM, source: { kind: 'csr', jobId: 41, sectionNumbers: ['11.4.1', '12.2'] } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Open confirmed copy' }));
  expect(nav).toHaveBeenCalledWith('document-authoring');
  expect(peekEditorTarget()).toMatchObject({ docId: 'saved-csr-copy', programId: PROGRAM, sectionCode: '11.4.1' });
});

it('names the target project in the import dialog when the open project is this program, and only then', async () => {
  publishShellProject({ id: PROGRAM.toUpperCase(), title: 'SYN-201 IND' });
  try {
    await card();
    const region = await screen.findByLabelText('CSR builds from this run');
    fireEvent.click(await within(region).findByRole('button', { name: /Import approved sections into Authoring/ }));
    expect(JSON.parse((await screen.findByTestId('csr-import')).firstChild!.textContent!)).toMatchObject({ programId: PROGRAM, programName: 'SYN-201 IND' });
    cleanup();
    publishShellProject({ id: '11111111-2222-4333-8444-0000000000ff', title: 'Another program' });
    await card();
    const other = await screen.findByLabelText('CSR builds from this run');
    fireEvent.click(await within(other).findByRole('button', { name: /Import approved sections into Authoring/ }));
    expect(JSON.parse((await screen.findByTestId('csr-import')).firstChild!.textContent!).programName).toBeUndefined();
  } finally { clearShellProject(); }
});

it('states a refused headings read as an alert, never an empty review', async () => {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === '/api/csr/jobs/41/headings') throw refusal(403, { code: 'CSR_PROJECT_ACCESS_DENIED', error: 'The CSR actor does not have access to this project.' });
    return routes(method, path);
  });
  await card();
  const region = await screen.findByLabelText('CSR builds from this run');
  const alert = await within(region).findByText(/does not have access to this project/);
  expect(alert.getAttribute('role')).toBe('alert');
  expect(within(region).queryByLabelText('Section review')).toBeNull();
  expect(within(region).queryByText(/ICH E3 headings drafted/)).toBeNull();
});
