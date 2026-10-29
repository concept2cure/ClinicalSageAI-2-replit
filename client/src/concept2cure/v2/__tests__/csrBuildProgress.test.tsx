// @vitest-environment jsdom
/**
 * CSR slice 3: "Build CSR draft" sits on the CSR card only when a saved run
 * holds retained tables, binds that run, and shows a server refusal as stated;
 * the board's section review records decisions and imports the approved set.
 */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { CsrSourceInputControls } from '../surfaces/CsrSourceInputControls';
import { CsrHeadingReview, type CsrBoardHeading } from '../surfaces/CsrBuildProgress';
import { CsrWorkflow } from '../surfaces/BiopharmaProject';
import { publishShellProject } from '../shellProject';
import { getSurface } from '@shared/constants/ui-surface-registry';
vi.mock('../clinicalRegulatoryGraphFlag', () => ({ isClinicalRegulatoryGraphEnabled: () => false }));

const PROGRAM = '11111111-2222-4333-8444-000000000001';
const RUN = '0b9f3c1e-6a4d-4b7e-9c2a-5d1e8f7a6b31';
const HASH = 'a'.repeat(64);
const receipt = { documentId: '11111111-2222-4333-8444-000000000003', documentTitle: 'LMN-201 source', version: '2', sha256: HASH,
  adapter: 'concept2cure.csr-source.v1', dataCutDate: '2026-10-01', studyId: 'LMN-201-201', protocolNumber: 'NCT05330182',
  clinicalVerification: 'not-established', sourceApproval: 'canonical-lifecycle', studyInfo: {
    title: 'LMN-201 Phase 2/3', protocolNumber: 'NCT05330182', phase: 'Phase 2/3', indication: 'Recurrent CDI', sponsor: 'Sponsor',
    investigationalProduct: 'LMN-201', studyDesign: 'Randomized 1:1', primaryEndpoint: 'Global cure',
  } };
const tables = Object.fromEntries(['disposition', 'analysisPopulations', 'demographics', 'primaryEfficacy', 'aeOverallSummary', 'aeBySOC', 'aeTopPT', 'deathsSAEsDiscontinuations']
  .map(key => [key, { title: `${key} table`, headers: ['Measure', 'Result'], rows: [['Randomized', '23']] }]));
const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });
const refusal = (status: number, payload: unknown) => Object.assign(new Error('refused'), { name: 'ApiRequestError', status, payload });
let studies: unknown[] = [{ source: receipt, tables }];
const nav = vi.fn();

beforeEach(() => {
  studies = [{ source: receipt, tables }];
  apiRequest.mockImplementation(async (_method: string, path: string) => {
    if (path.includes('/csr/sources?')) return ok({ format: 'concept2cure.csr-source.v1', limitReached: false, sources: [] });
    if (path.includes('/clinical-tables?')) return ok({ runId: RUN, programId: PROGRAM, historical: true, studies });
    if (path === '/api/csr/jobs') return ok({ jobId: 41, status: 'queued' }, 202);
    return ok({});
  });
});
afterEach(() => { cleanup(); apiRequest.mockReset(); nav.mockReset(); });
const card = () => render(<CsrSourceInputControls programId={PROGRAM} runId={RUN} interactionBusy={false}
  onSelectionChange={() => {}} onBusyChange={() => {}} onNav={nav} />);

it('offers "Build CSR draft" only for a saved run that holds retained tables, and binds that run', async () => {
  card();
  const button = await screen.findByRole('button', { name: /Build CSR draft · NCT05330182/ });
  fireEvent.click(button);
  await screen.findByText(/CSR build 41 is queued/);
  expect(apiRequest).toHaveBeenCalledWith('POST', '/api/csr/jobs', {
    programId: PROGRAM, studyInfo: receipt.studyInfo, evidenceSource: { programId: PROGRAM, runId: RUN, studyId: 'LMN-201-201' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Open build progress/ }));
  expect(nav).toHaveBeenCalledWith('csr-workflow');
});

it('renders no build control for a run with no retained tables', async () => {
  studies = [];
  card();
  await screen.findByText('This run has no linked clinical source tables.');
  expect(screen.queryByRole('button', { name: /Build CSR draft/ })).toBeNull();
});

it('shows the server refusal as stated, never a silent empty or a queued build', async () => {
  apiRequest.mockImplementation(async (_method: string, path: string) => {
    if (path.includes('/clinical-tables?')) return ok({ runId: RUN, programId: PROGRAM, historical: true, studies });
    if (path === '/api/csr/jobs') throw refusal(404, { code: 'CSR_RUN_INPUTS_NOT_FOUND',
      error: 'This saved run has no retained source inputs in the selected project. No job was created.' });
    return ok({ format: 'concept2cure.csr-source.v1', limitReached: false, sources: [] });
  });
  card();
  fireEvent.click(await screen.findByRole('button', { name: /Build CSR draft/ }));
  const alert = await screen.findByText(/no retained source inputs in the selected project\. No job was created\./);
  expect(alert.getAttribute('role')).toBe('alert');
  expect(screen.queryByText(/is queued/)).toBeNull();
});

const headings: CsrBoardHeading[] = [
  { num: '11', label: 'Efficacy evaluation', depth: 1, manual: false, state: 'not_drafted' },
  { num: '11.4.1', label: 'Analysis of efficacy', depth: 3, manual: false, state: 'in_review', contentHash: HASH, reviewerId: 5 },
  { num: '10.1', label: 'Disposition of patients', depth: 2, manual: false, state: 'approved', contentHash: 'b'.repeat(64), reviewerId: 6 },
  { num: '16.1.1', label: 'Protocol and amendments', depth: 3, manual: true, state: 'not_drafted' },
];

it('records a review decision on the exact text, and shows a refused decision', async () => {
  const changed = vi.fn();
  const onImport = vi.fn();
  render(<CsrHeadingReview jobId={41} headings={headings} onChanged={changed} onImport={onImport} />);
  expect(screen.getByText('2 of 4 ICH E3 headings drafted · 1 approved')).toBeTruthy();
  expect(screen.getByText('Prepared from records, not drafted by the build')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Approve/ }));
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(apiRequest).toHaveBeenCalledWith('POST', '/api/csr/jobs/41/sections/11.4.1/review', { decision: 'approve', expectedContentHash: HASH });
  apiRequest.mockRejectedValueOnce(refusal(409, { code: 'CSR_REVIEWER_IS_REQUESTER',
    error: 'The person who requested this build cannot approve its sections. Ask another reviewer.' }));
  fireEvent.click(screen.getByRole('button', { name: /Approve/ }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/cannot approve its sections/);
  fireEvent.click(screen.getByRole('button', { name: /Import approved sections/ }));
  expect(onImport).toHaveBeenCalledWith(['10.1']);
});

it('requires a stated reason to send a section back', async () => {
  render(<CsrHeadingReview jobId={41} headings={headings} onChanged={() => {}} onImport={() => {}} />);
  const row = screen.getByText('Disposition of patients').closest('li')!;
  fireEvent.click(within(row).getByRole('button', { name: /Send back/ }));
  const record = within(row).getByRole('button', { name: 'Record send-back' }) as HTMLButtonElement;
  expect(record.disabled).toBe(true);
  fireEvent.change(within(row).getByLabelText(/Reason for sending §10.1 back/), { target: { value: 'Death count differs from FDA review.' } });
  fireEvent.click(record);
  await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/csr/jobs/41/sections/10.1/review',
    { decision: 'send_back', expectedContentHash: 'b'.repeat(64), reason: 'Death count differs from FDA review.' }));
});

it('the csr-workflow board shows the build headings with review state and re-reads after a decision', async () => {
  const board = { success: true, data: { program: { title: 'LMN-201 Phase 2/3', code: 'ICH E3', readiness: 100 },
    sections: [{ num: '11', label: 'Efficacy evaluation', status: 'draft' }], headings, meta: { jobId: 41, sourceRunId: RUN } } };
  apiRequest.mockImplementation(async (method: string) => (method === 'GET' ? ok(board) : ok({ review: {} })));
  publishShellProject({ id: PROGRAM, title: 'LMN-201' });
  try {
    render(<CsrWorkflow surface={getSurface('csr-workflow')!} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />);
    const region = await screen.findByLabelText('Section review');
    expect(within(region).getByText('In review')).toBeTruthy();
    fireEvent.click(within(region).getByRole('button', { name: /Approve/ }));
    await vi.waitFor(() => expect(apiRequest.mock.calls.filter(([m, p]) => m === 'GET' && String(p).startsWith('/api/csr-workflow/board')).length).toBe(2));
  } finally { publishShellProject({ id: '' }); }
});
