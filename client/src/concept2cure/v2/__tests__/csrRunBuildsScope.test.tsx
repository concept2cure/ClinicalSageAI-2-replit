// @vitest-environment jsdom
/** CSR editor: a project/source switch or delayed response must never expose
 * another run's build, review or import controls. All test data is synthetic. */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({
  ...(await original<typeof import('@/lib/queryClient')>()), apiRequest,
}));
vi.mock('../surfaces/CsrBuildProgress', () => ({
  CsrHeadingReview: ({ jobId, headings }: { jobId: number; headings: { label: string }[] }) =>
    <div data-testid="scoped-section-review">Review {jobId}: {headings.map(x => x.label).join(', ')}</div>,
  CsrNarrativeBuild: ({ jobId }: { jobId: number }) =>
    <div data-testid="scoped-narrative">Narratives {jobId}</div>,
}));
vi.mock('../surfaces/CsrAssemblyControl', () => ({
  CsrAssemblyControl: ({ jobId }: { jobId: number }) =>
    <div data-testid="scoped-assembly">Assembly {jobId}</div>,
}));
vi.mock('../editor/SourceImportDialog', () => ({
  SourceImportDialog: () => null,
  openImportedDocument: () => undefined,
}));

import { CsrRunBuilds } from '../surfaces/CsrRunBuilds';

const PROGRAM_A = '11111111-2222-4333-8444-000000000001';
const PROGRAM_B = '11111111-2222-4333-8444-000000000002';
const RUN_A = '8c9530a6-2a76-4189-a74d-2dbd4860a001';
const RUN_B = '8c9530a6-2a76-4189-a74d-2dbd4860a002';
const pathFor = (program: string, run: string) =>
  `/api/csr/jobs?programId=${program}&runId=${run}&documentId=11111111-2222-4333-8444-000000000009`;
const job = (id: number, updatedAt = '2026-10-30T09:00:00.000Z') =>
  ({ jobId: id, studyId: `SYN-${id}`, status: 'complete', progress: 100, updatedAt });
const heading = (label: string) =>
  ({ num: '11.4.1', label, depth: 3, manual: false, state: 'draft' });
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
// The panel is mounted in a CSR document's editor, which it imports into (F6, 2026-11-05).
const view = (programId: string, runId: string) =>
  <CsrRunBuilds programId={programId} runId={runId} documentId="11111111-2222-4333-8444-000000000009" focus={null} />;

beforeEach(() => apiRequest.mockReset());
afterEach(() => { cleanup(); apiRequest.mockReset(); });

it('clears old build, review and assembly immediately on a project/run switch', async () => {
  const second = deferred<ReturnType<typeof ok>>();
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === pathFor(PROGRAM_A, RUN_A))
      return ok({ jobs: [job(41)] });
    if (method === 'GET' && path === pathFor(PROGRAM_B, RUN_B))
      return second.promise;
    if (method === 'GET' && path === '/api/csr/jobs/41/headings')
      return ok({ headings: [heading('Old project heading')] });
    if (method === 'GET' && path === '/api/csr/jobs/42/headings')
      return ok({ headings: [heading('New project heading')] });
    throw new Error(`Unexpected API call: ${method} ${path}`);
  });
  const rendered = render(view(PROGRAM_A, RUN_A));
  expect(await screen.findByText(/CSR build 41 · complete/)).toBeTruthy();
  expect(await screen.findByText(/Old project heading/)).toBeTruthy();
  expect(screen.getByTestId('scoped-assembly').textContent).toContain('41');

  rendered.rerender(view(PROGRAM_B, RUN_B));
  expect(screen.queryByText(/CSR build 41 · complete/)).toBeNull();
  expect(screen.queryByText(/Old project heading/)).toBeNull();
  expect(screen.queryByTestId('scoped-section-review')).toBeNull();
  expect(screen.queryByTestId('scoped-assembly')).toBeNull();
  expect(screen.getByText('Loading the CSR builds of this run…')).toBeTruthy();

  await act(async () => { second.resolve(ok({ jobs: [job(42)] })); await second.promise; });
  expect(await screen.findByText(/CSR build 42 · complete/)).toBeTruthy();
  expect(await screen.findByText(/New project heading/)).toBeTruthy();
  expect(screen.queryByText(/Old project heading/)).toBeNull();
});

it('ignores a late reply from the previously selected project after the new project loads', async () => {
  const old = deferred<ReturnType<typeof ok>>();
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === pathFor(PROGRAM_A, RUN_A)) return old.promise;
    if (method === 'GET' && path === pathFor(PROGRAM_B, RUN_B))
      return ok({ jobs: [job(52)] });
    if (method === 'GET' && path === '/api/csr/jobs/52/headings')
      return ok({ headings: [heading('Current review')] });
    throw new Error(`Unexpected API call: ${method} ${path}`);
  });
  const rendered = render(view(PROGRAM_A, RUN_A));
  rendered.rerender(view(PROGRAM_B, RUN_B));
  expect(await screen.findByText(/CSR build 52 · complete/)).toBeTruthy();
  expect(await screen.findByText(/Current review/)).toBeTruthy();
  await act(async () => { old.resolve(ok({ jobs: [job(51)] })); await old.promise; });
  expect(screen.getByText(/CSR build 52 · complete/)).toBeTruthy();
  expect(screen.queryByText(/CSR build 51/)).toBeNull();
});

it('does not let an older headings reply restore superseded review state', async () => {
  const oldHeadings = deferred<ReturnType<typeof ok>>();
  let jobReads = 0;
  let headingReads = 0;
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === pathFor(PROGRAM_A, RUN_A)) {
      jobReads += 1;
      return ok({ jobs: [job(61, jobReads === 1
        ? '2026-10-30T09:00:00.000Z' : '2026-10-30T09:01:00.000Z')] });
    }
    if (method === 'GET' && path === '/api/csr/jobs/61/headings') {
      headingReads += 1;
      return headingReads === 1 ? oldHeadings.promise
        : ok({ headings: [heading('Revised current heading')] });
    }
    throw new Error(`Unexpected API call: ${method} ${path}`);
  });
  render(view(PROGRAM_A, RUN_A));
  expect(await screen.findByText(/CSR build 61 · complete/)).toBeTruthy();
  await vi.waitFor(() => expect(headingReads).toBe(1));
  fireEvent.click(screen.getByRole('button', { name: /Reload builds/ }));
  expect(await screen.findByText(/Revised current heading/)).toBeTruthy();
  await act(async () => {
    oldHeadings.resolve(ok({ headings: [heading('Superseded approval')] }));
    await oldHeadings.promise;
  });
  expect(screen.queryByText(/Superseded approval/)).toBeNull();
  expect(screen.getByText(/Revised current heading/)).toBeTruthy();
});

it('withholds narrative and assembly actions on a failed section read, then retries into the current headings', async () => {
  let headingsReads = 0;
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === pathFor(PROGRAM_A, RUN_A))
      return ok({ jobs: [job(81)] });
    if (method === 'GET' && path === '/api/csr/jobs/81/headings') {
      headingsReads += 1;
      return headingsReads === 1
        ? { ok: false, status: 503, json: async () => ({ error: 'Cannot read the current CSR headings.' }) }
        : ok({ headings: [heading('Current source-approved heading')] });
    }
    throw new Error(`Unexpected API call: ${method} ${path}`);
  });
  render(view(PROGRAM_A, RUN_A));
  const retry = await screen.findByRole('button', { name: 'Retry reading sections' });
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.queryByTestId('scoped-section-review')).toBeNull();
  expect(screen.queryByTestId('scoped-narrative')).toBeNull();
  expect(screen.queryByTestId('scoped-assembly')).toBeNull();

  fireEvent.click(retry);
  expect(await screen.findByText(/Current source-approved heading/)).toBeTruthy();
  expect(headingsReads).toBe(2);
  expect(screen.getByTestId('scoped-section-review')).toBeTruthy();
  expect(screen.getByTestId('scoped-narrative').textContent).toContain('81');
  expect(screen.getByTestId('scoped-assembly').textContent).toContain('81');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('rejects malformed or unrecognized saved build records without exposing review controls', async () => {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === pathFor(PROGRAM_A, RUN_A))
      return ok({ jobs: [{ ...job(71), progress: 999, updatedAt: 'bad-date' }] });
    throw new Error(`Unexpected API call: ${method} ${path}`);
  });
  render(view(PROGRAM_A, RUN_A));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByText(/CSR build 71 · complete/)).toBeNull();
  expect(screen.queryByTestId('scoped-section-review')).toBeNull();
  expect(screen.queryByTestId('scoped-narrative')).toBeNull();
  expect(screen.queryByTestId('scoped-assembly')).toBeNull();
});
