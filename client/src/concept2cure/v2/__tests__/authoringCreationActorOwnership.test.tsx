// @vitest-environment jsdom
/** Native creation keeps its mounted host, while actual auth sessions replace their owner. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { authService } from '@/services/portal/authService';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import { useAuthoringCreation, type CreationKind } from '../editor/useAuthoringCreation';
import { publishShellProject } from '../shellProject';
import { surfaceLeaveRefusal } from '../navParams';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const actor = (id = 7, organizationId = 12) => ({ id: String(id), organizationId: String(organizationId), roles: ['admin'], permissions: ['governed:write'] });
const bearer = (userId = 7, organizationId = 12, visit = 'original') => `fixture.${btoa(JSON.stringify({ userId, organizationId, visit }))}.synthetic`;
const reply = (body: unknown) => ({ ok: true, status: 201, json: async () => body }) as Response;
const receipt = (kind: CreationKind) => kind === 'document'
  ? { success: true, document: { id: 'D-created', title: 'Created document', client_program_id: A, template_id: null } }
  : { success: true, section: { id: 'S-created', code: '2.6.6', doc_id: 'D1' } };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function options(programId = A) {
  return { programId, openProject: programId, docId: 'D1', programSwitchHeld: false,
    fireToast: vi.fn(), onDocCreated: vi.fn(), onSectionCreated: vi.fn(), onCheckCreation: vi.fn(async () => true) };
}
const payload = { title: 'Created document', code: '2.6.6' };
beforeEach(() => {
  clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(bearer(), actor(), 'fixture-refresh', 3600);
  publishShellProject({ id: A }); apiRequest.mockReset();
});
afterEach(() => {
  cleanup(); authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  delete window.C2C_PROJECT; vi.unstubAllGlobals();
});
function replace(transition: 'account' | 'organization' | 'session' | 'bearer') {
  if (transition === 'account') authService.setToken(bearer(8), actor(8), 'fixture-refresh-8', 3600);
  else if (transition === 'organization') authService.setToken(bearer(7, 13), actor(7, 13), 'fixture-refresh-13', 3600);
  else if (transition === 'session') authService.setToken(bearer(7, 12, 'replacement'), actor(), 'fixture-refresh-new', 3600);
  else setAuthToken(bearer(8));
}

describe('native creation belongs to its actual signed-in owner', () => {
  it.each<CreationKind>(['document', 'section'])('retires a pending %s before React renders the replacement account', async kind => {
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise);
    const p = options(); const finished = vi.fn();
    const { result } = renderHook(() => useAuthoringCreation(p));
    act(() => { result.current.create(kind, payload, finished); });
    expect(apiRequest).toHaveBeenCalledOnce(); expect(surfaceLeaveRefusal()).toMatch(/still being created/i);
    const previous = result.current;
    act(() => {
      replace('account');
      expect(surfaceLeaveRefusal()).toBeNull();
      expect(previous.state(kind)).toBeUndefined();
    });
    await act(async () => { pending.resolve(reply(receipt(kind))); await pending.promise; });
    expect(p.fireToast).not.toHaveBeenCalled(); expect(p.onDocCreated).not.toHaveBeenCalled();
    expect(p.onSectionCreated).not.toHaveBeenCalled(); expect(finished).not.toHaveBeenCalled();
    expect(result.current.state(kind)).toBeUndefined(); expect(surfaceLeaveRefusal()).toBeNull();
  });

  it.each(['organization', 'session', 'bearer'] as const)('suppresses a late receipt after same-project %s replacement', async transition => {
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise);
    const p = options(); const finished = vi.fn(); const { result } = renderHook(() => useAuthoringCreation(p));
    act(() => { result.current.create('document', payload, finished); });
    const previous = result.current;
    act(() => { replace(transition); expect(surfaceLeaveRefusal()).toBeNull(); expect(previous.state('document')).toBeUndefined(); });
    await act(async () => { pending.resolve(reply(receipt('document'))); await pending.promise; });
    expect(p.fireToast).not.toHaveBeenCalled(); expect(p.onDocCreated).not.toHaveBeenCalled(); expect(finished).not.toHaveBeenCalled();
    expect(result.current.state('document')).toBeUndefined(); expect(surfaceLeaveRefusal()).toBeNull();
  });

  it('hides old uncertainty and permits a new owner to create with its own captured bearer', async () => {
    apiRequest.mockRejectedValueOnce(new Error('Old-owner response lost'));
    const p = options(); const { result } = renderHook(() => useAuthoringCreation(p));
    await act(async () => { result.current.create('document', payload, vi.fn()); });
    expect(result.current.state('document')?.phase).toBe('unknown'); expect(surfaceLeaveRefusal()).toMatch(/unconfirmed/i);
    const previous = result.current; p.fireToast.mockClear();
    act(() => { replace('account'); expect(surfaceLeaveRefusal()).toBeNull(); });
    expect(result.current.state('document')).toBeUndefined(); expect(result.current.blocked('document')).toBe(false);
    act(() => { previous.create('document', payload, vi.fn()); });
    expect(apiRequest).toHaveBeenCalledOnce();
    apiRequest.mockResolvedValueOnce(reply(receipt('document')));
    await act(async () => { result.current.create('document', payload, vi.fn()); });
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(apiRequest.mock.calls[1][3]).toEqual({ Authorization: `Bearer ${bearer(8)}`, 'x-organization-id': '12' });
    expect(p.onDocCreated).toHaveBeenCalledOnce(); expect(surfaceLeaveRefusal()).toBeNull();
  });

  it('rejects missing or mismatched actor credentials with an actionable creation refusal', () => {
    setAuthToken(bearer(8));
    const { result, rerender } = renderHook(() => useAuthoringCreation(options()));
    expect(result.current.refusal).toMatch(/signed-in account|sign in/i); expect(result.current.blocked('document')).toBe(true);
    act(() => { result.current.create('document', payload, vi.fn()); }); expect(apiRequest).not.toHaveBeenCalled();
    act(() => { authService.endSession(null); }); rerender();
    expect(result.current.refusal).toMatch(/signed-in account|sign in/i); expect(result.current.blocked('document')).toBe(true);
  });

  it('does not revive a retired unknown lane after mismatched bearer claims are repaired', async () => {
    apiRequest.mockRejectedValueOnce(new Error('Response lost'));
    const { result, rerender } = renderHook(() => useAuthoringCreation(options()));
    await act(async () => { result.current.create('document', payload, vi.fn()); });
    expect(surfaceLeaveRefusal()).toMatch(/unconfirmed/i);
    setAuthToken(bearer(8)); expect(surfaceLeaveRefusal()).toBeNull();
    setAuthToken(bearer()); rerender();
    expect(result.current.state('document')).toBeUndefined(); expect(surfaceLeaveRefusal()).toBeNull();
  });

  it('retains a pending project A → B → A attempt within the same owner', async () => {
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise);
    const p = options(); const { result, rerender } = renderHook(({ programId }) => useAuthoringCreation({ ...p, programId, openProject: programId }), { initialProps: { programId: A } });
    act(() => { result.current.create('document', payload, vi.fn()); });
    act(() => { publishShellProject({ id: B }); rerender({ programId: B }); });
    act(() => { publishShellProject({ id: A }); rerender({ programId: A }); });
    await act(async () => { pending.resolve(reply(receipt('document'))); await pending.promise; });
    expect(result.current.state('document')?.phase).toBe('unknown'); expect(surfaceLeaveRefusal()).toMatch(/unconfirmed/i);
    expect(p.onDocCreated).not.toHaveBeenCalled(); expect(p.fireToast).not.toHaveBeenCalled();
  });

  it('retains unknown creation through a genuine same-revision refresh', async () => {
    apiRequest.mockRejectedValueOnce(new Error('Response lost'));
    const p = options(); const { result } = renderHook(() => useAuthoringCreation(p));
    await act(async () => { result.current.create('document', payload, vi.fn()); });
    const session = authService.captureSessionReadGuard();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ accessToken: bearer(7, 12, 'refreshed'), refreshToken: 'fixture-refresh-next', expiresIn: 3600 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    expect(session.sameRevision()).toBe(true); expect(session.credentialsCurrent()).toBe(false);
    expect(result.current.state('document')?.phase).toBe('unknown'); expect(result.current.blocked('document')).toBe(true);
    expect(surfaceLeaveRefusal()).toMatch(/unconfirmed/i); expect(p.onDocCreated).not.toHaveBeenCalled();
    expect(apiRequest).toHaveBeenCalledOnce();
  });
});
