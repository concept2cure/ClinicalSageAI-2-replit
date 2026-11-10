// @vitest-environment jsdom
/** The one CSR editor must never keep another project's/document's frozen
 * sources, source-picker actions or build controls across a scope switch. */
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { apiRequest, readDocumentStudyData, readSavedClinicalTables } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  readDocumentStudyData: vi.fn(),
  readSavedClinicalTables: vi.fn(),
}));
vi.mock('@/lib/queryClient', async original => ({
  ...(await original<typeof import('@/lib/queryClient')>()), apiRequest,
}));
vi.mock('../editor/StudyDataSource', () => ({
  readDocumentStudyData,
  readSavedClinicalTables,
  StudyDataSource: ({ programId, documentId }: { programId: string; documentId: string }) =>
    <div data-testid="clinical-source-picker">Source picker for {programId}:{documentId}</div>,
}));
vi.mock('../surfaces/CsrBuildProgress', () => ({
  CsrBuildDraftControl: ({ programId, runId }: { programId: string; runId: string }) =>
    <div data-testid="csr-draft-control">Draft {programId}:{runId}</div>,
}));
vi.mock('../surfaces/CsrRunBuilds', () => ({
  CsrRunBuilds: ({ programId, runId }: { programId: string; runId: string }) =>
    <div data-testid="csr-build-list">Build list {programId}:{runId}</div>,
}));
vi.mock('../surfaces/StudyPivotalDeclarations', () => ({
  StudyPivotalDeclarations: () => null,
}));

import { StudyDataBuild } from '../editor/StudyDataBuild';

const A = '11111111-2222-4333-8444-000000000001';
const B = '11111111-2222-4333-8444-000000000002';
const DOC1 = '11111111-2222-4333-8444-000000000009';
const DOC2 = '11111111-2222-4333-8444-000000000010';
const ENTRY1 = 'c9d2419a-f70c-4e85-8c0d-a774fe644211';
const ENTRY2 = 'c9d2419a-f70c-4e85-8c0d-a774fe644212';
const entry = (id: string) => [{ studyDataId: id, createdAt: '2026-10-30T09:00:00Z',
  sources: [{ documentTitle: 'Synthetic study', protocolNumber: 'SYN-201', version: '1' }] }];
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const view = (programId: string, documentId: string) =>
  <StudyDataBuild programId={programId} documentId={documentId} />;

beforeEach(() => {
  apiRequest.mockReset();
  readDocumentStudyData.mockReset();
  readSavedClinicalTables.mockReset();
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path.startsWith('/api/submission-orchestrator/runs?programId=')) return ok({ runs: [] });
    throw new Error(`Unexpected API ${method} ${path}`);
  });
  readSavedClinicalTables.mockImplementation(async (_program: string, runId: string) =>
    ({ studies: [{ source: { documentTitle: runId }, tables: {} }] }));
});
afterEach(() => { cleanup(); apiRequest.mockReset(); });

it('immediately removes prior project data and CSR controls while the next project loads', async () => {
  const other = deferred<ReturnType<typeof entry>>();
  readDocumentStudyData.mockImplementation(async (program: string) =>
    program === A ? entry(ENTRY1) : other.promise);
  const mounted = render(view(A, DOC1));
  expect((await screen.findByTestId('csr-draft-control')).textContent).toContain(A + ':' + ENTRY1);
  expect(screen.getByTestId('csr-build-list').textContent).toContain(A);

  mounted.rerender(view(B, DOC2));
  expect(screen.queryByTestId('csr-draft-control')).toBeNull();
  expect(screen.queryByTestId('csr-build-list')).toBeNull();
  expect(screen.getByText('Reading this document’s study data…')).toBeTruthy();

  await act(async () => { other.resolve(entry(ENTRY2)); await other.promise; });
  expect((await screen.findByTestId('csr-draft-control')).textContent).toContain(B + ':' + ENTRY2);
  expect(screen.getByTestId('csr-build-list').textContent).toContain(B);
  expect(screen.queryByText(A + ':' + ENTRY1)).toBeNull();
});

it('ignores a late previous-document source read after switching projects', async () => {
  const old = deferred<ReturnType<typeof entry>>();
  readDocumentStudyData.mockImplementation(async (program: string) =>
    program === A ? old.promise : entry(ENTRY2));
  const mounted = render(view(A, DOC1));
  mounted.rerender(view(B, DOC2));
  expect((await screen.findByTestId('csr-draft-control')).textContent).toContain(B + ':' + ENTRY2);
  await act(async () => { old.resolve(entry(ENTRY1)); await old.promise; });
  expect(screen.getByTestId('csr-draft-control').textContent).toContain(B + ':' + ENTRY2);
  expect(screen.queryByText(/Draft 11111111-2222-4333-8444-000000000001:/)).toBeNull();
});

it('switching documents in one project unmounts the earlier Vault source picker immediately', async () => {
  const next = deferred<ReturnType<typeof entry>>();
  readDocumentStudyData.mockImplementation(async (_program: string, document: string) =>
    document === DOC1 ? [] : next.promise);
  const mounted = render(view(A, DOC1));
  expect((await screen.findByTestId('clinical-source-picker')).textContent).toContain(DOC1);
  mounted.rerender(view(A, DOC2));
  expect(screen.queryByTestId('clinical-source-picker')).toBeNull();
  expect(screen.getByText('Reading this document’s study data…')).toBeTruthy();
  await act(async () => { next.resolve([]); await next.promise; });
  expect((await screen.findByTestId('clinical-source-picker')).textContent).toContain(DOC2);
});
