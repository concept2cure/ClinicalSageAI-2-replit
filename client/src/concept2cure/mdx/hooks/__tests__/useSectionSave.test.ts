/**
 * @vitest-environment jsdom
 */
/**
 * useSectionSave — the contract that replaced the false "saved" badge.
 *
 * The dossier editor used to commit to an in-memory store and render
 * "● saved · edits sync to audit + activity". Nothing was sent anywhere,
 * no audit row was written, and a refresh discarded the work. These
 * tests encode the properties that stop that being possible again.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSectionSave } from '../useSectionSave';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const okResponse = { ok: true, status: 200, text: async () => '{}' };

describe('useSectionSave', () => {
  it('reports "unavailable" — never "saved" — with no governed document', async () => {
    /* The precise regression: a section with nothing behind it must not
       render a success state. */
    const { result } = renderHook(() => useSectionSave(null));
    expect(result.current.state.status).toBe('unavailable');

    let saved: boolean | undefined;
    await act(async () => { saved = await result.current.save('s1', 'text'); });

    expect(saved).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('unavailable');
  });

  it('PATCHes the governed section endpoint with Part-11 attribution', async () => {
    fetchMock.mockResolvedValue(okResponse);
    const { result } = renderHook(() => useSectionSave('doc-42'));

    await act(async () => { await result.current.save('device-description', 'New body'); });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/c2c/documents/doc-42/sections/device-description');
    expect((init as RequestInit).method).toBe('PATCH');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.content).toEqual({ text: 'New body' });
    /* The route rejects a write without a reason — it is what the
       Part-11 version trigger records as the attribution. */
    expect(typeof body.reason).toBe('string');
    expect(body.reason.length).toBeGreaterThan(0);
    expect(body.draftSource).toBe('human');
  });

  it('reports saved only after the server confirms', async () => {
    fetchMock.mockResolvedValue(okResponse);
    const { result } = renderHook(() => useSectionSave('doc-42'));

    expect(result.current.state.status).toBe('idle');
    await act(async () => { await result.current.save('s1', 'body'); });
    expect(result.current.state.status).toBe('saved');
  });

  it('reports an error, not a save, when the server rejects the write', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden' });
    const { result } = renderHook(() => useSectionSave('doc-42'));

    let saved: boolean | undefined;
    await act(async () => { saved = await result.current.save('s1', 'body'); });

    expect(saved).toBe(false);
    expect(result.current.state.status).toBe('error');
    if (result.current.state.status === 'error') {
      expect(result.current.state.message).toMatch(/Not saved/);
      expect(result.current.state.message).toMatch(/403/);
    }
  });

  it('reports an error when the request never reaches the server', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useSectionSave('doc-42'));

    await act(async () => { await result.current.save('s1', 'body'); });

    expect(result.current.state.status).toBe('error');
    if (result.current.state.status === 'error') {
      expect(result.current.state.message).toMatch(/offline/);
    }
  });

  it('does not let a stale in-flight save overwrite a newer outcome', async () => {
    /* Debounced autosave can overlap. An older request resolving late
       must not stamp "saved" over content that has since moved on. */
    let resolveFirst: (v: unknown) => void = () => {};
    const first = new Promise((r) => { resolveFirst = r; });
    fetchMock
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'boom' });

    const { result } = renderHook(() => useSectionSave('doc-42'));

    let firstCall: Promise<boolean>;
    act(() => { firstCall = result.current.save('s1', 'v1'); });
    await act(async () => { await result.current.save('s1', 'v2'); });

    expect(result.current.state.status).toBe('error'); // the newer outcome

    await act(async () => { resolveFirst(okResponse); await firstCall!; });

    /* Still the newer outcome — the superseded save reported nothing. */
    expect(result.current.state.status).toBe('error');
  });

  it('encodes ids so a section key with a slash cannot escape the path', async () => {
    fetchMock.mockResolvedValue(okResponse);
    const { result } = renderHook(() => useSectionSave('doc/42'));

    await act(async () => { await result.current.save('a/b', 'x'); });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/c2c/documents/doc%2F42/sections/a%2Fb');
  });
});
