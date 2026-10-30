// @vitest-environment jsdom
/** Filing guidance may use only the exact project reply in the current read session. */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';
import { programFromBody, useProgramRead } from '../programSummary';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuth: () => ({ user: actual.authService.getUser() }) };
});
const PID = 'bbbbbbbb-0000-4000-8000-000000000001';
const OTHER = 'bbbbbbbb-0000-4000-8000-000000000002';
const actor = (id = 7) => ({ id: String(id), organizationId: '12', roles: ['admin'], permissions: ['governed:write'] });
const bearer = (id = 7) => `fixture.${btoa(JSON.stringify({ userId: id, organizationId: 12 }))}.synthetic`;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); clearAuthToken();
  authService.setToken(bearer(), actor(), 'fixture-refresh', 3600); apiRequest.mockReset();
});
afterEach(() => { cleanup(); authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear(); });

describe('project filing context admission', () => {
  it.each([undefined, OTHER])('retains display fallback but refuses registry authority for reply project %s', id => {
    const result = programFromBody({ id, name: 'Legacy project display', registry_id: 'US_BLA' }, PID);
    expect(result?.name).toBe('Legacy project display');
    expect(result?.registryId).toBeNull();
  });

  it('retires the prior primary filing immediately on an account replacement at the same project', async () => {
    const next = deferred();
    apiRequest.mockResolvedValueOnce(ok({ id: PID, name: 'Current project', registry_id: 'US_BLA' })).mockReturnValue(next.promise);
    const { result } = renderHook(() => useProgramRead(PID));
    await waitFor(() => expect(result.current.program?.registryId).toBe('US_BLA'));
    act(() => authService.setToken(bearer(8), actor(8), 'fixture-refresh-8', 3600));
    expect(result.current.program).toBeNull();
    await act(async () => { next.resolve(ok({ id: PID, name: 'Current project', registry_id: 'US_NDA' })); });
    await waitFor(() => expect(result.current.program?.registryId).toBe('US_NDA'));
  });

  it('does not adopt an older account reply after the replacement account has read the project', async () => {
    const old = deferred();
    apiRequest.mockReturnValueOnce(old.promise).mockResolvedValue(ok({ id: PID, registry_id: 'US_NDA' }));
    const { result } = renderHook(() => useProgramRead(PID));
    act(() => authService.setToken(bearer(8), actor(8), 'fixture-refresh-8', 3600));
    await waitFor(() => expect(result.current.program?.registryId).toBe('US_NDA'));
    await act(async () => { old.resolve(ok({ id: PID, registry_id: 'US_BLA' })); });
    expect(result.current.program?.registryId).toBe('US_NDA');
  });
});
