// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest,
}));
import { useFilingTarget } from '../surfaces/filingTarget';
import { publishShellProject } from '../shellProject';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const sub = (id: number, programId = A) => ({ id, programId, title: `IND ${id}`, applicationType: 'ind', primaryRegion: 'us', status: 'draft' });
const seq = (id: number) => ({ id, sequenceNumber: '0000', type: 'original', status: 'draft', region: 'us' });
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  apiRequest.mockReset();
  publishShellProject({ id: A });
});
afterEach(() => { cleanup(); delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT; });

describe('filing target request isolation', () => {
  it('keeps the latest submission sequences when an earlier read finishes last', async () => {
    const old = deferred();
    apiRequest.mockImplementation((_method: string, url: string) => url.includes('/1/sequences') ? old.promise : Promise.resolve(ok([seq(22)])));
    const { result } = renderHook(() => useFilingTarget());
    act(() => result.current.pickSubmission(1));
    act(() => result.current.pickSubmission(2));
    await waitFor(() => expect(result.current.seqId).toBe(22));
    await act(async () => old.resolve(ok([seq(11)])));
    expect(result.current.subId).toBe(2);
    expect(result.current.seqId).toBe(22);
    expect(result.current.seqs.rows.map((row) => row.id)).toEqual([22]);
  });

  it('does not restore sequences after the submission is cleared', async () => {
    const old = deferred(); apiRequest.mockReturnValue(old.promise);
    const { result } = renderHook(() => useFilingTarget());
    act(() => result.current.pickSubmission(1));
    act(() => result.current.pickSubmission(null));
    await act(async () => old.resolve(ok([seq(11)])));
    expect(result.current.seqs.state).toBe('idle');
    expect(result.current.seqId).toBeNull();
  });

  it('does not restore either read after reset', async () => {
    const old = deferred(); apiRequest.mockReturnValue(old.promise);
    const { result } = renderHook(() => useFilingTarget());
    act(() => { result.current.load(); result.current.pickSubmission(1); });
    act(() => result.current.reset());
    await act(async () => old.resolve(ok([])));
    expect(result.current.subs.state).toBe('idle');
    expect(result.current.seqs.state).toBe('idle');
  });

  it('ignores an earlier submission-list error after a successful reload', async () => {
    const old = deferred(); apiRequest.mockReturnValueOnce(old.promise).mockResolvedValue(ok([sub(2)]));
    const { result } = renderHook(() => useFilingTarget());
    act(() => result.current.load()); act(() => result.current.load());
    await waitFor(() => expect(result.current.subs.state).toBe('ready'));
    await act(async () => old.resolve({ ok: false, status: 503 } as Response));
    expect(result.current.subs.rows.map((row) => row.id)).toEqual([2]);
  });

  it('invalidates a selected target and reloads when the explicit project changes', async () => {
    const old = deferred();
    apiRequest.mockImplementation((_method: string, url: string) => url.endsWith('/sequences') ? old.promise : Promise.resolve(ok([sub(1), sub(2, B)])));
    const { result, rerender } = renderHook(({ project }) => useFilingTarget(undefined, project), { initialProps: { project: A } });
    act(() => result.current.load());
    await waitFor(() => expect(result.current.subs.state).toBe('ready'));
    act(() => result.current.pickSubmission(1));
    rerender({ project: B });
    await waitFor(() => expect(result.current.subs.rows.map((row) => row.id)).toEqual([2]));
    await act(async () => old.resolve(ok([seq(11)])));
    expect(result.current.subId).toBeNull(); expect(result.current.seqId).toBeNull();
    expect(result.current.seqs.state).toBe('idle');
  });

  it('reloads an active picker on a published shell-project change', async () => {
    apiRequest.mockResolvedValue(ok([sub(1), sub(2, B)]));
    const { result } = renderHook(() => useFilingTarget());
    act(() => result.current.load());
    await waitFor(() => expect(result.current.subs.rows.map((row) => row.id)).toEqual([1]));
    act(() => publishShellProject({ id: B }));
    await waitFor(() => expect(result.current.subs.rows.map((row) => row.id)).toEqual([2]));
    expect(result.current.subId).toBeNull();
  });

  it('keeps an explicit document project when the shell project changes', async () => {
    apiRequest.mockResolvedValue(ok([sub(1), sub(2, B)]));
    const { result } = renderHook(() => useFilingTarget(undefined, A));
    act(() => result.current.load());
    await waitFor(() => expect(result.current.subs.rows.map((row) => row.id)).toEqual([1]));
    act(() => publishShellProject({ id: B }));
    expect(result.current.subs.rows.map((row) => row.id)).toEqual([1]);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
