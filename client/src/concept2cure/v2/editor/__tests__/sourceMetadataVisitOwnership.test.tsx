// @vitest-environment jsdom
/** Source metadata and retained callbacks belong to their original read visit. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { DataReadOwner } from '../../dataConnect';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({
  ...await original<typeof import('@/lib/queryClient')>(), apiRequest,
}));
import { useProjectSourceCatalog } from '../useProjectSourceCatalog';
import { admittedCitationSources, useDocumentCitationAdmission } from '../citationAdmission';

// Optional-arity compatibility lets unchanged production run these behavioral
// reds: its shorter functions ignore the owner rather than fail compilation.
const useOwnedCatalog: (programId: string | null, owner?: DataReadOwner) => ReturnType<typeof useProjectSourceCatalog>
  = useProjectSourceCatalog;
const useOwnedAdmission: (documentId: string | null, programId: string | null, owner?: DataReadOwner) => ReturnType<typeof useDocumentCitationAdmission>
  = useDocumentCitationAdmission;

const PID = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';
const SECTION = '33333333-3333-4333-8333-333333333333';
const A = 'project/session-A';
const B = 'project/session-B';
let activeOwner: string;
const owner = (key: string): DataReadOwner => ({ key, current: () => activeOwner === key });
const reply = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body }) as Response;
const source = (id: number, label = 'Recorded') => ({ id, title: `${label} source ${id}`, extractionStatus: 'extracted',
  textAvailable: true, isCurrent: true, dataEligible: true, originalFileAvailable: true });
const catalog = (ids: number[], label = 'Recorded', offset = 0, total = ids.length) => ({
  projectId: PID, sources: ids.map(id => source(id, label)), total, currentTotal: total,
  page: { limit: 200, offset }, window: { shown: ids.length, truncated: offset + ids.length < total },
});
const association = (id: number, label = 'Recorded', withheld = false) => ({
  section_id: SECTION, source: 'cre_evidence_source', reference_id: String(id),
  source_details: withheld ? null : { id: String(id), title: `${label} association ${id}` },
});
function deferredBody() {
  let finish!: (body: unknown) => void;
  return { promise: new Promise<unknown>(resolve => { finish = resolve; }), resolve: (body: unknown) => finish(body) };
}
const catalogIds = (read: ReturnType<typeof useProjectSourceCatalog>) => read.sources.map(row => row.id);
const admissionIds = (read: ReturnType<typeof useDocumentCitationAdmission>) => read.admissions.map(row => row.sourceId);

beforeEach(() => { activeOwner = A; apiRequest.mockReset(); });
afterEach(cleanup);

it('masks the prior complete catalog in the replacement-owner render before passive effects', async () => {
  const replacement = deferredBody();
  apiRequest.mockResolvedValueOnce(reply(catalog([5], 'Prior session')))
    .mockResolvedValueOnce({ ...reply(null), json: () => replacement.promise });
  const frames: Array<{ sources: number[]; error: string | null; state: string }> = [];
  const view = renderHook(({ readOwner }) => {
    const read = useOwnedCatalog(PID, readOwner);
    if (readOwner.key === B) frames.push({ sources: catalogIds(read), error: read.error, state: read.state });
    return read;
  }, { initialProps: { readOwner: owner(A) } });
  await waitFor(() => expect(catalogIds(view.result.current)).toEqual([5]));
  activeOwner = B;
  view.rerender({ readOwner: owner(B) });
  expect(frames[0]).toEqual({ sources: [], error: null, state: 'loading' });
  await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
  await act(async () => replacement.resolve(catalog([7], 'Replacement session')));
  await waitFor(() => expect(catalogIds(view.result.current)).toEqual([7]));
  expect(view.result.current.state).toBe('ready');
  expect(view.result.current.sources[0].title).toBe('Replacement session source 7');
});

it('masks old associations before passive effects and keeps authoritative withheld details withheld', async () => {
  const replacement = deferredBody();
  apiRequest.mockResolvedValueOnce(reply([association(5, 'Prior session')]))
    .mockResolvedValueOnce({ ...reply(null), json: () => replacement.promise });
  const frames: Array<{ ids: string[]; error: string | null; state: string }> = [];
  const view = renderHook(({ readOwner }) => {
    const read = useOwnedAdmission(DOC, PID, readOwner);
    if (readOwner.key === B) frames.push({ ids: admissionIds(read), error: read.error, state: read.state });
    return read;
  }, { initialProps: { readOwner: owner(A) } });
  await waitFor(() => expect(admissionIds(view.result.current)).toEqual(['5']));
  activeOwner = B;
  view.rerender({ readOwner: owner(B) });
  expect(frames[0]).toEqual({ ids: [], error: null, state: 'loading' });
  await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
  await act(async () => replacement.resolve([association(7, 'Replacement session', true)]));
  await waitFor(() => expect(admissionIds(view.result.current)).toEqual(['7']));
  expect(admittedCitationSources([source(7, 'Catalog must not replace withheld details')], view.result.current.admissions, SECTION)).toEqual([]);
});

it('a retained catalog retry cannot restart or invalidate the replacement owner’s in-flight read', async () => {
  const replacement = deferredBody();
  apiRequest.mockResolvedValueOnce(reply(catalog([5])))
    .mockResolvedValueOnce({ ...reply(null), json: () => replacement.promise })
    .mockResolvedValue(reply(catalog([8], 'Current retry')));
  const view = renderHook(({ readOwner }) => useOwnedCatalog(PID, readOwner), { initialProps: { readOwner: owner(A) } });
  await waitFor(() => expect(view.result.current.state).toBe('ready'));
  const oldRetry = view.result.current.retry;
  activeOwner = B;
  view.rerender({ readOwner: owner(B) });
  await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
  act(() => oldRetry());
  expect(apiRequest).toHaveBeenCalledTimes(2);
  await act(async () => replacement.resolve(catalog([7], 'Replacement')));
  await waitFor(() => expect(catalogIds(view.result.current)).toEqual([7]));
  act(() => oldRetry());
  expect(catalogIds(view.result.current)).toEqual([7]);
  expect(apiRequest).toHaveBeenCalledTimes(2);
  act(() => view.result.current.retry());
  await waitFor(() => expect(catalogIds(view.result.current)).toEqual([8]));
  expect(apiRequest).toHaveBeenCalledTimes(3);
});

it('old admission retry and admit callbacks cannot erase or extend replacement-session associations', async () => {
  const replacement = deferredBody();
  apiRequest.mockResolvedValueOnce(reply([association(5)]))
    .mockResolvedValueOnce({ ...reply(null), json: () => replacement.promise });
  const view = renderHook(({ readOwner }) => useOwnedAdmission(DOC, PID, readOwner), { initialProps: { readOwner: owner(A) } });
  await waitFor(() => expect(view.result.current.state).toBe('ready'));
  const oldRetry = view.result.current.retry;
  const oldAdmit = view.result.current.admit;
  activeOwner = B;
  view.rerender({ readOwner: owner(B) });
  await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
  act(() => oldRetry());
  expect(apiRequest).toHaveBeenCalledTimes(2);
  await act(async () => replacement.resolve([association(7, 'Replacement', true)]));
  await waitFor(() => expect(admissionIds(view.result.current)).toEqual(['7']));
  act(() => { oldRetry(); oldAdmit(SECTION, 99); });
  expect(admissionIds(view.result.current)).toEqual(['7']);
  expect(apiRequest).toHaveBeenCalledTimes(2);
  act(() => view.result.current.admit(SECTION, 11));
  const currentCatalog = [source(7), source(11, 'Current accepted'), source(99, 'Prior receipt')];
  expect(admittedCitationSources(currentCatalog, view.result.current.admissions, SECTION))
    .toEqual([{ id: '11', title: 'Current accepted source 11' }]);
  expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
});

it('does not resurrect old callbacks after A → B → A even when the original owner key is valid again', async () => {
  let phase = 'first A';
  const id = () => phase === 'first A' ? 5 : phase === 'B' ? 7 : 9;
  apiRequest.mockImplementation(async (_method: string, path: string) =>
    reply(path.endsWith('/citations') ? [association(id(), phase)] : catalog([id(), 99], phase)));
  const view = renderHook(({ readOwner }) => ({
    catalog: useOwnedCatalog(PID, readOwner), admission: useOwnedAdmission(DOC, PID, readOwner),
  }), { initialProps: { readOwner: owner(A) } });
  await waitFor(() => expect(admissionIds(view.result.current.admission)).toEqual(['5']));
  await waitFor(() => expect(catalogIds(view.result.current.catalog)).toEqual([5, 99]));
  const oldCatalogRetry = view.result.current.catalog.retry;
  const oldAdmissionRetry = view.result.current.admission.retry;
  const oldAdmit = view.result.current.admission.admit;
  phase = 'B'; activeOwner = B;
  view.rerender({ readOwner: owner(B) });
  await waitFor(() => expect(admissionIds(view.result.current.admission)).toEqual(['7']));
  phase = 'returned A'; activeOwner = A;
  view.rerender({ readOwner: owner(A) });
  await waitFor(() => expect(admissionIds(view.result.current.admission)).toEqual(['9']));
  await waitFor(() => expect(catalogIds(view.result.current.catalog)).toEqual([9, 99]));
  expect(apiRequest).toHaveBeenCalledTimes(6);
  act(() => { oldCatalogRetry(); oldAdmissionRetry(); oldAdmit(SECTION, 99); });
  expect(apiRequest).toHaveBeenCalledTimes(6);
  expect(admissionIds(view.result.current.admission)).toEqual(['9']);
  expect(catalogIds(view.result.current.catalog)).toEqual([9, 99]);
  act(() => view.result.current.admission.admit(SECTION, 99));
  expect(admissionIds(view.result.current.admission)).toEqual(['9', '99']);
});

it.each([true, false])('ignores a retired catalog JSON body after a replacement read settles (old response ok: %s)', async oldOk => {
  const oldBody = deferredBody();
  const readOldBody = vi.fn(() => oldBody.promise);
  apiRequest.mockResolvedValueOnce({ ...reply(null, oldOk), json: readOldBody })
    .mockResolvedValue(reply(catalog([7], 'Replacement')));
  const view = renderHook(({ readOwner }) => useOwnedCatalog(PID, readOwner), { initialProps: { readOwner: owner(A) } });
  await waitFor(() => expect(readOldBody).toHaveBeenCalledTimes(1));
  activeOwner = B;
  view.rerender({ readOwner: owner(B) });
  await waitFor(() => expect(catalogIds(view.result.current)).toEqual([7]));
  await act(async () => oldBody.resolve(oldOk ? catalog([5], 'Retired') : { message: 'Retired read failed.' }));
  expect(view.result.current.state).toBe('ready');
  expect(view.result.current.error).toBeNull();
  expect(catalogIds(view.result.current)).toEqual([7]);
  expect(apiRequest).toHaveBeenCalledTimes(2);
});

it.each([true, false])('ignores a retired admission JSON body after replacement associations settle (old response ok: %s)', async oldOk => {
  const oldBody = deferredBody();
  const readOldBody = vi.fn(() => oldBody.promise);
  apiRequest.mockResolvedValueOnce({ ...reply(null, oldOk), json: readOldBody })
    .mockResolvedValue(reply([association(7, 'Replacement')]));
  const view = renderHook(({ readOwner }) => useOwnedAdmission(DOC, PID, readOwner), { initialProps: { readOwner: owner(A) } });
  await waitFor(() => expect(readOldBody).toHaveBeenCalledTimes(1));
  activeOwner = B;
  view.rerender({ readOwner: owner(B) });
  await waitFor(() => expect(admissionIds(view.result.current)).toEqual(['7']));
  await act(async () => oldBody.resolve(oldOk ? [association(5, 'Retired')] : { message: 'Retired read failed.' }));
  expect(view.result.current.state).toBe('ready');
  expect(view.result.current.error).toBeNull();
  expect(admissionIds(view.result.current)).toEqual(['7']);
  expect(apiRequest).toHaveBeenCalledTimes(2);
});

it('never treats partial old-owner pages as complete citation authority for a replacement owner', async () => {
  const oldLastPage = deferredBody();
  let reads = 0;
  apiRequest.mockImplementation(async () => {
    reads += 1;
    if (reads === 1) return reply(catalog([1], 'Prior', 0, 2));
    if (reads === 2) return { ...reply(null), json: () => oldLastPage.promise };
    return reply(catalog([7], 'Replacement'));
  });
  const view = renderHook(({ readOwner }) => useOwnedCatalog(PID, readOwner), { initialProps: { readOwner: owner(A) } });
  await waitFor(() => expect(view.result.current.loaded).toBe(1));
  expect(view.result.current.state).toBe('loading');
  expect(view.result.current.sources).toEqual([]);
  await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
  activeOwner = B;
  view.rerender({ readOwner: owner(B) });
  await waitFor(() => expect(catalogIds(view.result.current)).toEqual([7]));
  await act(async () => oldLastPage.resolve(catalog([2], 'Prior', 1, 2)));
  expect(view.result.current.state).toBe('ready');
  expect(view.result.current.loaded).toBe(1);
  expect(view.result.current.total).toBe(1);
  expect(catalogIds(view.result.current)).toEqual([7]);
  expect(apiRequest.mock.calls.map(([, path]) => new URL(String(path), 'https://fixture.test').searchParams.get('offset')))
    .toEqual(['0', '1', '0']);
});

it('keeps rows, associations, callbacks and read counts when the same valid owner is recreated', async () => {
  apiRequest.mockImplementation(async (_method: string, path: string) =>
    reply(path.endsWith('/citations') ? [association(5)] : catalog([5])));
  const view = renderHook(({ readOwner }) => ({
    catalog: useOwnedCatalog(PID, readOwner), admission: useOwnedAdmission(DOC, PID, readOwner),
  }), { initialProps: { readOwner: owner(A) } });
  await waitFor(() => expect(view.result.current.catalog.state).toBe('ready'));
  await waitFor(() => expect(view.result.current.admission.state).toBe('ready'));
  const rows = view.result.current.catalog.sources;
  const associations = view.result.current.admission.admissions;
  const catalogRetry = view.result.current.catalog.retry;
  const admissionRetry = view.result.current.admission.retry;
  const admit = view.result.current.admission.admit;
  for (let index = 0; index < 3; index += 1) view.rerender({ readOwner: owner(A) });
  await act(async () => { await Promise.resolve(); });
  expect(apiRequest).toHaveBeenCalledTimes(2);
  expect(view.result.current.catalog.sources).toBe(rows);
  expect(view.result.current.admission.admissions).toBe(associations);
  expect(view.result.current.catalog.retry).toBe(catalogRetry);
  expect(view.result.current.admission.retry).toBe(admissionRetry);
  expect(view.result.current.admission.admit).toBe(admit);
});

it('an invalid supplied owner exposes no source authority and cannot retry or admit into its retired visit', async () => {
  apiRequest.mockImplementation(async (_method: string, path: string) =>
    reply(path.endsWith('/citations') ? [association(5)] : catalog([5])));
  const view = renderHook(({ readOwner }) => ({
    catalog: useOwnedCatalog(PID, readOwner), admission: useOwnedAdmission(DOC, PID, readOwner),
  }), { initialProps: { readOwner: owner(A) } });
  await waitFor(() => expect(view.result.current.catalog.state).toBe('ready'));
  await waitFor(() => expect(view.result.current.admission.state).toBe('ready'));
  const oldCatalogRetry = view.result.current.catalog.retry;
  const oldAdmissionRetry = view.result.current.admission.retry;
  const oldAdmit = view.result.current.admission.admit;
  activeOwner = 'retired';
  view.rerender({ readOwner: owner(A) });
  expect(view.result.current.catalog.sources).toEqual([]);
  expect(view.result.current.admission.admissions).toEqual([]);
  expect(view.result.current.catalog.error).toBeNull();
  expect(view.result.current.admission.error).toBeNull();
  act(() => { oldCatalogRetry(); oldAdmissionRetry(); oldAdmit(SECTION, 99); });
  expect(apiRequest).toHaveBeenCalledTimes(2);
  expect(view.result.current.catalog.sources).toEqual([]);
  expect(view.result.current.admission.admissions).toEqual([]);
});
