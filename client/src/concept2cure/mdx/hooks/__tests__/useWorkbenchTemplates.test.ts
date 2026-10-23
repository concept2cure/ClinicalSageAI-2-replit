// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useWorkbenchTemplates } from '../useWorkbenchTemplates';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('optional workbench template adapter', () => {
  it('preserves grouped live templates in its isolated module', async () => {
    const fetch = vi.fn(async (_url: unknown) => ({ ok: true, json: async () => ({
      ind: [{ id: 7, name: 'Protocol outline', source: 'ind' }], document: [], ectd: [],
    }) }));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useWorkbenchTemplates());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.templates).toEqual([
      expect.objectContaining({ id: '7', name: 'Protocol outline', owner: 'Reg Affairs', updated: '—' }),
    ]);
    expect(String(fetch.mock.calls[0]?.[0])).toBe('/api/templates');
  });

  it('keeps a malformed live response as a failure, rather than an empty library', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ unexpected: true }) })));
    const { result } = renderHook(() => useWorkbenchTemplates());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.templates).toBeNull();
  });
});
