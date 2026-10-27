// @vitest-environment jsdom
/** The existing object reader optionally belongs to one caller-supplied current visit. */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveData } from '../dataConnect';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
const ok = (name: string) => ({ ok: true, status: 200, json: async () => ({ name }) }) as Response;
function deferred() { let resolve!: (value: Response) => void; const promise = new Promise<Response>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => apiRequest.mockReset());
afterEach(cleanup);

describe('optional current owner on the canonical object reader', () => {
  it('masks the previous owner during the render before the replacement read resolves', async () => {
    const next = deferred(); apiRequest.mockResolvedValueOnce(ok('Earlier owner')).mockReturnValue(next.promise);
    const rendered: Array<string | null> = [];
    const { result, rerender } = renderHook(({ key }) => {
      const read = useLiveData<{ name: string }>('/api/owned', ['/api/owned'], undefined, { key, current: () => true });
      rendered.push(read.data?.name ?? null); return read;
    }, { initialProps: { key: 'first' } });
    await waitFor(() => expect(result.current.data?.name).toBe('Earlier owner'));
    rendered.length = 0; rerender({ key: 'replacement' });
    expect(rendered).not.toContain('Earlier owner'); expect(result.current.data).toBeNull();
    await act(async () => next.resolve(ok('Replacement owner')));
    await waitFor(() => expect(result.current.data?.name).toBe('Replacement owner'));
  });
  it('never revives an earlier visit on a key round trip or its delayed completion', async () => {
    const first = deferred(), second = deferred(), returned = deferred();
    apiRequest.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(returned.promise);
    const { result, rerender } = renderHook(({ key }) => useLiveData<{ name: string }>('/api/owned', ['/api/owned'], undefined,
      { key, current: () => true }), { initialProps: { key: 'A' } });
    rerender({ key: 'B' }); rerender({ key: 'A' });
    await act(async () => { first.resolve(ok('Old A')); second.resolve(ok('Old B')); });
    expect(result.current.data).toBeNull();
    await act(async () => returned.resolve(ok('Current A')));
    await waitFor(() => expect(result.current.data?.name).toBe('Current A'));
  });
  it('masks an invalid captured owner even when its key remains unchanged', async () => {
    let current = true; apiRequest.mockResolvedValue(ok('Readable only before retirement'));
    const { result, rerender } = renderHook(() => useLiveData<{ name: string }>('/api/owned', ['/api/owned'], undefined,
      { key: 'same-key', current: () => current }));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    current = false; rerender(); expect(result.current.data).toBeNull();
    const next = deferred(); apiRequest.mockReturnValue(next.promise);
    current = true; rerender(); expect(result.current.data).toBeNull();
    await act(async () => next.resolve(ok('Fresh read after retirement')));
    await waitFor(() => expect(result.current.data?.name).toBe('Fresh read after retirement'));
  });
});
