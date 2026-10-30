// @vitest-environment jsdom
/**
 * Reach of a CSR build from Submission Center's CSR card (D2/W1, 2026-10-30;
 * docs/evidence/D2-CSR/2026-10-30-csr-card-reach/). Production refuses
 * /api/csr-workflow/board, so the build board is not a launch screen. The card
 * lists the builds bound to the saved run (GET /api/csr/jobs?programId&runId)
 * and carries, for the selected build, the narrative build and the assembly
 * with its placement. No control on the card navigates to the board. SYNTHETIC.
 */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { CsrSourceInputControls } from '../surfaces/CsrSourceInputControls';
import { BUILD_POLL_MS } from '../surfaces/CsrRunBuilds';

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
const nav = vi.fn();

function routes(method: string, path: string) {
  if (path.includes('/csr/sources?')) return ok({ format: 'concept2cure.csr-source.v1', limitReached: false, sources: [] });
  if (path.includes('/clinical-tables?')) return ok({ runId: RUN, programId: PROGRAM, historical: true, studies: [{ source: receipt, tables }] });
  if (method === 'GET' && path === BUILDS) return ok({ jobs: builds });
  if (method === 'POST' && path === '/api/csr/jobs') { builds = [build(42, 'queued'), ...builds]; return ok({ jobId: 42, status: 'queued' }, 202); }
  if (/\/api\/csr\/jobs\/\d+\/sections$/.test(path)) return ok({ sections: [{ sectionNumber: '14.3.3', review: { state: 'in_review', staleApproval: false } }] });
  if (/\/narratives\/status$/.test(path)) return ok({ run: null });
  if (/\/narratives$/.test(path)) return ok({ subjects: [] });
  if (/\/assembly$/.test(path)) return ok({ assembly: null });
  return ok({});
}

beforeEach(() => { builds = [build(41)]; apiRequest.mockImplementation(async (method: string, path: string) => routes(method, path)); });
afterEach(() => { cleanup(); apiRequest.mockReset(); nav.mockReset(); });
const card = () => render(<CsrSourceInputControls programId={PROGRAM} runId={RUN} interactionBusy={false}
  onSelectionChange={() => {}} onBusyChange={() => {}} onNav={nav} />);

it('carries the narrative build and the assembly for a build of the saved run, on the card', async () => {
  card();
  const region = await screen.findByLabelText('CSR builds from this run');
  expect(await within(region).findByLabelText('Patient safety narratives')).toBeTruthy();
  expect(within(region).getByLabelText('CSR assembly')).toBeTruthy();
  expect(within(region).getByRole('button', { name: /Build narratives/ })).toBeTruthy();
  expect(await within(region).findByRole('button', { name: /Assemble CSR files/ })).toBeTruthy();
  // §14.3.3's review state comes from the build's own sections, not the board.
  expect(await within(region).findByText(/§14\.3\.3 is in review/)).toBeTruthy();
  expect(apiRequest.mock.calls.some(([, p]) => String(p).startsWith('/api/csr-workflow/board'))).toBe(false);
});

it('a newly queued build is selected on the card; nothing navigates to the board', async () => {
  card();
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
  card();
  expect(await screen.findByText('No CSR build has been started from this run.')).toBeTruthy();
  cleanup();
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === BUILDS) throw refusal(403, { code: 'CSR_PROJECT_ACCESS_DENIED', error: 'The CSR actor does not have access to this project.' });
    return routes(method, path);
  });
  card();
  const alert = await screen.findByText(/does not have access to this project/);
  expect(alert.getAttribute('role')).toBe('alert');
  expect(screen.queryByText('No CSR build has been started from this run.')).toBeNull();
});

it('follows a drafting build until it ends, then stops re-reading the list', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    builds = [{ ...build(43, 'drafting'), progress: 40 }];
    card();
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
