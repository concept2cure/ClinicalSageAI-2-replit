// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { CsrSourceInputControls } from '../surfaces/CsrSourceInputControls';
import { OrchestratorRunControls } from '../surfaces/OrchestratorRunControls';

const PROGRAM = '11111111-2222-4333-8444-000000000001';
const OTHER = '11111111-2222-4333-8444-000000000002';
const DOC = '11111111-2222-4333-8444-000000000003';
const HASH = 'a'.repeat(64);
const SOURCE = { documentId: DOC, documentTitle: 'Approved synthetic study source', version: '2', sha256: HASH, approved: true };
const receipt = { ...SOURCE, adapter: 'concept2cure.csr-source.v1', dataCutDate: '2026-10-01', studyId: 'SYN-001', protocolNumber: 'SYN-P1',
  clinicalVerification: 'not-established', sourceApproval: 'canonical-lifecycle', studyInfo: {
    title: 'Synthetic source study', protocolNumber: 'SYN-P1', phase: 'Phase 2', indication: 'Synthetic condition', sponsor: 'Synthetic sponsor',
    investigationalProduct: 'Synthetic product', studyDesign: 'Parallel randomized', primaryEndpoint: 'Recorded endpoint',
  } };
const tables = Object.fromEntries(['disposition', 'analysisPopulations', 'demographics', 'primaryEfficacy', 'aeOverallSummary', 'aeBySOC', 'aeTopPT', 'deathsSAEsDiscontinuations'].map(key => [key, {
  title: `${key} source table`, headers: ['Measure', 'Recorded result'], rows: [['Synthetic measure', '4']],
}]));
const preview = { source: receipt, approved: true, tables };
const list = { format: 'concept2cure.csr-source.v1', limitReached: false, sources: [SOURCE] };
const response = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const saved = (runId: string, studies: unknown[] = [{ source: receipt, tables }], programId = PROGRAM) => ({ runId, programId, historical: true, studies });
const selection = vi.fn();
const busy = vi.fn();
const props = { programId: PROGRAM, runId: null, interactionBusy: false, onSelectionChange: selection, onBusyChange: busy };
beforeEach(() => {
  apiRequest.mockImplementation(async (method, path) => {
    if (path.includes('/csr/sources?')) return response(list);
    if (path.endsWith('/csr/source-preview')) return response(preview);
    if (path.includes('/clinical-tables?')) return response(saved('run-1'));
    if (path.endsWith('/csr/source-contract')) return response({ format: list.format, requiredFields: ['studyInfo', 'participants', 'studyData'], sourceSchema: { type: 'object' } });
    if (path.includes('/runs?')) return response({ runs: [] });
    if (path.endsWith('/runs/for-program')) return response({ runId: 'created-run', submissionId: 'submission-1', status: 'awaiting-signature', startedAt: '2026-10-14' });
    return response({});
  });
});
afterEach(() => { cleanup(); apiRequest.mockReset(); selection.mockReset(); busy.mockReset(); });
async function chooseAndPreview() {
  await screen.findByRole('option', { name: /Approved synthetic study source/ });
  fireEvent.change(screen.getByLabelText('Clinical source document'), { target: { value: DOC } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview clinical tables' }));
  await screen.findByLabelText('Include these source tables in the next package run');
}

it('previews the exact version/hash and requires explicit inclusion before publishing the source selection', async () => {
  render(<CsrSourceInputControls {...props} />);
  await chooseAndPreview();
  expect(apiRequest).toHaveBeenCalledWith('POST', '/api/submission-orchestrator/csr/source-preview', { programId: PROGRAM, documentId: DOC, expectedSha256: HASH });
  expect(selection.mock.calls.some(([value]) => value !== null)).toBe(false);
  fireEvent.click(screen.getByLabelText('Include these source tables in the next package run'));
  expect(selection).toHaveBeenLastCalledWith({ documentId: DOC, expectedSha256: HASH });
  fireEvent.click(screen.getByLabelText('Include these source tables in the next package run'));
  expect(selection).toHaveBeenLastCalledWith(null);
  expect(screen.getByText(/AI narrative generation remains unavailable/)).toBeTruthy();
});

it('names the study’s ClinicalTrials.gov number from its source, or says the source states none (D5, 2026-10-29)', async () => {
  render(<CsrSourceInputControls {...props} />);
  await chooseAndPreview();
  expect(screen.getByText(/SYN-P1 · no ClinicalTrials\.gov number in the source · data cut 2026-10-01/)).toBeTruthy();
  cleanup();
  apiRequest.mockImplementation(async (method, path) => {
    if (path.includes('/csr/sources?')) return response(list);
    if (path.endsWith('/csr/source-preview')) return response({ ...preview, source: { ...receipt, studyInfo: { ...receipt.studyInfo, nctNumber: 'NCT05330182' } } });
    return response({});
  });
  render(<CsrSourceInputControls {...props} />);
  await chooseAndPreview();
  expect(screen.getByText(/SYN-P1 · NCT05330182 · data cut 2026-10-01/)).toBeTruthy();
});

it('keeps unapproved source previews read-only', async () => {
  apiRequest.mockImplementation(async (_method, path) => response(path.includes('/source-preview')
    ? { ...preview, approved: false, source: { ...receipt, sourceApproval: 'not-approved' } }
    : { ...list, sources: [{ ...SOURCE, approved: false }] }));
  render(<CsrSourceInputControls {...props} />);
  await chooseAndPreview();
  expect((screen.getByLabelText('Include these source tables in the next package run') as HTMLInputElement).disabled).toBe(true);
  expect(screen.getByText(/Approve this exact source version in Vault/)).toBeTruthy();
  expect(selection.mock.calls.some(([value]) => value !== null)).toBe(false);
});

it('separates failed and malformed source lists from a confirmed empty list and supports retry', async () => {
  apiRequest.mockResolvedValueOnce(response({ ...list, sources: [{ ...SOURCE, sha256: 'missing' }] })).mockResolvedValueOnce(response({ ...list, sources: [], limitReached: true }));
  render(<CsrSourceInputControls {...props} />);
  await screen.findByRole('alert');
  expect(screen.queryByText(/No supporting JSON sources/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reload clinical sources' }));
  await screen.findByText('No supporting JSON sources are listed for this project.');
  expect(screen.getByText(/source list reached its limit/)).toBeTruthy();
});

it.each([
  ['another source hash', { ...preview, source: { ...receipt, sha256: 'b'.repeat(64) } }],
  ['missing required table', { ...preview, tables: { disposition: tables.disposition } }],
  ['unrecorded source approval', { ...preview, approved: true, source: { ...receipt, sourceApproval: 'not-approved' } }],
])('refuses a preview with %s instead of including incomplete or changed inputs', async (_name, body) => {
  const original = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation((method, path, requestBody) => path.endsWith('/csr/source-preview') ? Promise.resolve(response(body)) : original(method, path, requestBody));
  render(<CsrSourceInputControls {...props} />);
  await screen.findByRole('option', { name: /Approved synthetic study source/ });
  fireEvent.change(screen.getByLabelText('Clinical source document'), { target: { value: DOC } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview clinical tables' }));
  await screen.findByRole('alert');
  expect(screen.queryByLabelText('Include these source tables in the next package run')).toBeNull();
  expect(selection.mock.calls.some(([value]) => value !== null)).toBe(false);
});

it('discards a late former-program preview and clears busy state on the program change', async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const original = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation(async (method, path, body) => {
    if (path.endsWith('/csr/source-preview')) { await pending; return response(preview); }
    if (path.includes(OTHER)) return response({ ...list, sources: [] });
    return original(method, path, body);
  });
  const view = render(<CsrSourceInputControls {...props} />);
  await screen.findByRole('option', { name: /Approved synthetic study source/ });
  fireEvent.change(screen.getByLabelText('Clinical source document'), { target: { value: DOC } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview clinical tables' }));
  await waitFor(() => expect(busy).toHaveBeenCalledWith(true));
  view.rerender(<CsrSourceInputControls {...props} programId={OTHER} />);
  await screen.findByText('No supporting JSON sources are listed for this project.');
  await act(async () => { finish(); await pending; });
  expect(screen.queryByLabelText('Clinical table preview')).toBeNull();
  expect(selection.mock.calls.some(([value]) => value !== null)).toBe(false);
  expect(busy).toHaveBeenLastCalledWith(false);
});

it('does not adopt a pending package build after switching away from its program and back', async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const original = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation(async (method, path, body) => {
    if (path.endsWith('/runs/for-program')) { await pending; return response({ runId: 'old-build', status: 'awaiting-signature', startedAt: '2026-10-14' }); }
    return original(method, path, body);
  });
  const onLoad = vi.fn(async () => {});
  const controlProps = { programId: PROGRAM, sequenceId: null, run: null, selectedRunId: null, onLoad, onBusyChange: busy };
  const view = render(<OrchestratorRunControls {...controlProps} />);
  fireEvent.click(screen.getByRole('button', { name: 'Build package run' }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/submission-orchestrator/runs/for-program', { programId: PROGRAM }));
  view.rerender(<OrchestratorRunControls {...controlProps} programId={OTHER} />);
  await screen.findByRole('button', { name: 'Build package run' });
  view.rerender(<OrchestratorRunControls {...controlProps} />);
  await screen.findByRole('button', { name: 'Build package run' });
  await act(async () => { finish(); await pending; });
  expect(onLoad).not.toHaveBeenCalled();
  expect(screen.queryByRole('option', { name: /old-build/ })).toBeNull();
});

it('reads frozen tables for the exact saved run and excludes late previous-run data', async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const original = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation(async (method, path, body) => {
    if (path.includes('/runs/run-1/clinical-tables')) { await pending; return response(saved('run-1')); }
    if (path.includes('/runs/run-2/clinical-tables')) return response(saved('run-2', []));
    return original(method, path, body);
  });
  const view = render(<CsrSourceInputControls {...props} runId="run-1" />);
  view.rerender(<CsrSourceInputControls {...props} runId="run-2" />);
  await screen.findByText('This run has no linked clinical source tables.');
  await act(async () => { finish(); await pending; });
  const area = screen.getByLabelText('Frozen run clinical tables');
  expect(area.textContent).toContain('run-2');
  expect(area.textContent).not.toContain('Synthetic source study');
});

it('offers an exact saved-read retry after a wrong run receipt without manufacturing empty history', async () => {
  const original = apiRequest.getMockImplementation()!;
  let reads = 0;
  apiRequest.mockImplementation((method, path, body) => path.includes('/clinical-tables?') ? Promise.resolve(response(saved(++reads === 1 ? 'wrong-run' : 'run-1'))) : original(method, path, body));
  render(<CsrSourceInputControls {...props} runId="run-1" />);
  await screen.findByRole('button', { name: 'Retry frozen clinical tables' });
  expect(screen.queryByText('This run has no linked clinical source tables.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry frozen clinical tables' }));
  await screen.findByText(/Historical source versions are retained/);
  expect(screen.getByLabelText('Frozen run clinical tables').textContent).toContain('Synthetic source study');
});

it('paginates large aggregate tables and fetches the authenticated source contract without changing source selection', async () => {
  const original = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation((method, path, body) => path.endsWith('/csr/source-preview') ? Promise.resolve(response({ ...preview, tables: { ...tables, disposition: {
    ...tables.disposition, rows: Array.from({ length: 55 }, (_, i) => [`Aggregate ${i + 1}`, String(i)]),
  } } })) : original(method, path, body));
  render(<CsrSourceInputControls {...props} />);
  await chooseAndPreview();
  fireEvent.click(screen.getByText('disposition source table', { selector: 'summary' }));
  expect(screen.getByText('Rows 1–50 of 55')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next rows' }));
  expect(screen.getByText('Rows 51–55 of 55')).toBeTruthy();
  expect(screen.queryByText('Aggregate 1')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'View clinical source format' }));
  await screen.findByText(/"sourceSchema"/);
  expect(apiRequest).toHaveBeenCalledWith('GET', '/api/submission-orchestrator/csr/source-contract', undefined);
  expect(selection.mock.calls.some(([value]) => value !== null)).toBe(false);
});

it('includes only an explicitly approved source in the real package-start request', async () => {
  const loaded = vi.fn();
  render(<OrchestratorRunControls programId={PROGRAM} sequenceId={7} run={null} selectedRunId={null} onLoad={loaded} onBusyChange={busy} />);
  await chooseAndPreview();
  fireEvent.click(screen.getByLabelText('Include these source tables in the next package run'));
  fireEvent.click(screen.getByRole('button', { name: 'Build package run' }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/submission-orchestrator/runs/for-program', {
    programId: PROGRAM, sequenceId: 7, clinicalSource: { documentId: DOC, expectedSha256: HASH },
  }));
  expect(loaded).toHaveBeenCalledWith('created-run');
});

it('retains saved run history while fencing source choices during an existing governed ceremony', async () => {
  render(<CsrSourceInputControls {...props} runId="run-1" interactionBusy />);
  await screen.findByRole('option', { name: /Approved synthetic study source/ });
  expect((screen.getByLabelText('Clinical source document') as HTMLSelectElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'View clinical source format' }) as HTMLButtonElement).disabled).toBe(true);
  await within(screen.getByLabelText('Frozen run clinical tables')).findByText(/Historical source versions/);
  expect(selection.mock.calls.some(([value]) => value !== null)).toBe(false);
});
