// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { screenCerLiterature, useCerLiteratureScreening } from '../useCerLiterature';

vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'synthetic-test-token', getOrgId: () => '7' }));
const fetchMock = vi.fn();
const PAYLOAD = { pmid: '38012345', stage: 'title_abstract' as const, decision: 'included' as const };
const RECORD = { id: 'synthetic-decision', ...PAYLOAD, title: 'Synthetic article', literatureEntryId: 'synthetic-entry',
  exclusionReason: null, programId: null, decidedBy: 42, decidedAt: '2026-10-14T12:00:00.000Z' };
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const receipt = (programId: string | null = null) => response({ screened: true, outcome: 'created', decision: { ...RECORD, programId } });
const postCalls = () => fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
};
beforeEach(() => {
  fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (_url: string, options?: RequestInit) => options?.method === 'POST'
    ? receipt() : response({ available: true, decisions: [] }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('screening outcomes retain uncertainty', () => {
  it('preserves a server commit uncertainty and bounds its error', async () => {
    fetchMock.mockResolvedValueOnce(response({ screened: false, outcome: 'unconfirmed', code: 'SCREENING_COMMIT_UNCONFIRMED',
      error: 'Read the stored screening trail before retrying.' }, 503));
    expect(await screenCerLiterature(PAYLOAD)).toMatchObject({ screened: false, outcome: 'unconfirmed', code: 'SCREENING_COMMIT_UNCONFIRMED' });
  });
  it.each([null, { screened: true }, { screened: true, decision: { ...RECORD, pmid: '999' } }])('does not accept a missing or wrong receipt %j', async (body) => {
    fetchMock.mockResolvedValueOnce(response(body));
    expect(await screenCerLiterature(PAYLOAD)).toMatchObject({ screened: false, outcome: 'unconfirmed' });
  });
  it('keeps a network failure unconfirmed instead of claiming the decision was not written', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Synthetic connection closed'));
    const result = await screenCerLiterature(PAYLOAD);
    expect(result).toMatchObject({ screened: false, outcome: 'unconfirmed' });
    expect(result.error).toMatch(/refresh.*before retrying/);
  });
});

describe('screening hook recovery is scoped to a fresh authoritative read', () => {
  it('blocks repeat POSTs until a successful explicit PMID read, preserves failure, then allows a reviewed new attempt', async () => {
    const view = renderHook(() => useCerLiteratureScreening(null));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    fetchMock.mockResolvedValueOnce(response({ screened: false, outcome: 'unconfirmed', code: 'SCREENING_COMMIT_UNCONFIRMED' }, 503));
    await act(async () => { await view.result.current.screen(PAYLOAD); });
    await act(async () => { await view.result.current.screen(PAYLOAD); });
    expect(postCalls()).toHaveLength(1);
    expect(view.result.current.screenError).toMatch(/Refresh.*before retrying/);
    fetchMock.mockResolvedValueOnce(response({ available: false, error: 'Synthetic read failure' }, 503));
    await act(async () => { await view.result.current.reload([PAYLOAD.pmid]); });
    await act(async () => { await view.result.current.screen(PAYLOAD); });
    expect(postCalls()).toHaveLength(1);
    fetchMock.mockResolvedValueOnce(response({ available: true, decisions: [RECORD] }));
    await act(async () => { await view.result.current.reload([PAYLOAD.pmid]); });
    expect(view.result.current.decisions[`${PAYLOAD.pmid}::${PAYLOAD.stage}`]).toEqual(RECORD);
    await act(async () => { await view.result.current.screen(PAYLOAD); });
    expect(postCalls()).toHaveLength(2);
    expect(view.result.current.screenError).toBeNull();
  });

  it('does not clear an uncertain attempt merely because a capped full trail was reread', async () => {
    const view = renderHook(() => useCerLiteratureScreening(null));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    fetchMock.mockResolvedValueOnce(response({ screened: false, outcome: 'unconfirmed' }, 503));
    await act(async () => { await view.result.current.screen(PAYLOAD); });
    await act(async () => { await view.result.current.reload(); });
    await act(async () => { await view.result.current.screen(PAYLOAD); });
    expect(postCalls()).toHaveLength(1);
  });

  it('prevents an immediate duplicate POST while the first write is pending', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    const view = renderHook(() => useCerLiteratureScreening(null));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    fetchMock.mockReturnValueOnce(pending.promise);
    let first!: Promise<unknown>;
    act(() => { first = view.result.current.screen(PAYLOAD); });
    let second: unknown;
    await act(async () => { second = await view.result.current.screen(PAYLOAD); });
    expect(second).toMatchObject({ screened: false, code: 'SCREENING_IN_PROGRESS' });
    expect(postCalls()).toHaveLength(1);
    await act(async () => { pending.resolve(receipt()); await first; });
  });

  it('does not adopt a late old-program write after switching away and back', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    const view = renderHook(({ programId }) => useCerLiteratureScreening(programId), { initialProps: { programId: 'programme-a' } });
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    fetchMock.mockReturnValueOnce(pending.promise);
    let old!: Promise<unknown>;
    act(() => { old = view.result.current.screen(PAYLOAD); });
    view.rerender({ programId: 'programme-b' });
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    view.rerender({ programId: 'programme-a' });
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    await act(async () => { pending.resolve(receipt('programme-a')); await old; });
    expect(view.result.current.decisions).toEqual({});
    expect(view.result.current.screenError).toBeNull();
  });
});
