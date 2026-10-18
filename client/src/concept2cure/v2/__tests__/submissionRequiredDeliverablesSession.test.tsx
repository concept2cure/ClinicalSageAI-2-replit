// @vitest-environment jsdom
/** Real coverage transport and auth revisions: no late source metadata or editor target. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest }));
import { authService } from '@/services/portal/authService';
import { clearEditorTarget, peekEditorTarget } from '../editorTarget';
import { publishShellProject } from '../shellProject';
import { PROGRAM_A, fixtureRoute, manifest, response, deferred, openRequired } from './_submission-deliverables-fixture';

beforeEach(() => {
  authService.setToken('fixture-coverage-a', { id: '7', organizationId: '1' }, 'fixture-coverage-refresh', 3600);
  publishShellProject({ id: PROGRAM_A, title: 'Program A' });
  clearEditorTarget();
  apiRequest.mockReset();
});
afterEach(() => { cleanup(); authService.endSession(null); clearEditorTarget(); delete window.C2C_PROJECT; vi.unstubAllGlobals(); });

async function transport(read: () => Promise<Response>) {
  const original = await vi.importActual<typeof import('@/lib/queryClient')>('@/lib/queryClient');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: Parameters<typeof fetch>[1]) => {
    if (url.endsWith('/api/v1/auth/session')) return response({ authenticated: true, user: { id: '7', organizationId: '2' }, session: { idleMinutes: 30, lifetimeHours: 12 } });
    if (url.endsWith('/api/v1/auth/logout')) return response({ success: true });
    if (url.endsWith('/api/v1/auth/refresh')) return response({ accessToken: 'fixture-coverage-refreshed', refreshToken: 'fixture-refresh-new', expiresIn: 3600 });
    if (url.includes('/pathway-manifest')) return new Headers(init?.headers).get('Authorization') === 'Bearer fixture-coverage-a'
      ? read() : response({ error: { code: 'FORBIDDEN', message: 'The current session cannot read this coverage.' } }, 403);
    throw new Error('Unexpected fixture transport');
  }));
  apiRequest.mockImplementation(async (_method: string, url: string) => url.includes('/pathway-manifest') ? original.apiRequest('GET', url) : fixtureRoute(url));
}
async function change(change: 'logout' | 'organization-adoption' | 'replacement-account') {
  if (change === 'logout') await authService.logout();
  else if (change === 'organization-adoption') expect(await authService.adoptSession('fixture-coverage-org-two')).toMatchObject({ organizationId: '2' });
  else authService.setToken('fixture-coverage-account-two', { id: '8', organizationId: '1' }, 'fixture-refresh-two', 3600);
}
async function expectQuiet() {
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByText('Retained protocol evidence')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Open saved document' })).toBeNull();
  expect(peekEditorTarget()).toBeNull();
}

describe('required deliverables — actual transport session ownership', () => {
  it.each(['logout', 'organization-adoption', 'replacement-account'] as const)('discards a delayed manifest after %s', async transition => {
    const pending = deferred<Response>();
    await transport(() => pending.promise);
    const guard = authService.captureSessionReadGuard();
    await openRequired();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(call => String(call[0]).includes('/pathway-manifest'))).toBe(true));
    await act(async () => { await change(transition); });
    expect(guard.sameRevision()).toBe(false);
    await act(async () => { pending.resolve(response(manifest())); await pending.promise; });
    await expectQuiet();
  });

  it('discards a success body that resolves after organization adoption', async () => {
    const body = deferred<unknown>();
    const readJson = vi.fn(() => body.promise);
    await transport(async () => ({ ok: true, status: 200, json: readJson }) as unknown as Response);
    await openRequired();
    await waitFor(() => expect(readJson).toHaveBeenCalledOnce());
    await act(async () => { await change('organization-adoption'); });
    await act(async () => { body.resolve(manifest()); await body.promise; });
    await expectQuiet();
  });

  it('suppresses an error body that resolves after replacement account adoption', async () => {
    const body = deferred<unknown>();
    const readJson = vi.fn(() => body.promise);
    await transport(async () => Object.assign(new Response(null, { status: 403, headers: { 'Content-Type': 'application/json' } }), { json: readJson }));
    await openRequired();
    await waitFor(() => expect(readJson).toHaveBeenCalledOnce());
    await act(async () => { await change('replacement-account'); });
    await act(async () => { body.resolve({ error: { code: 'FORBIDDEN', message: 'Private old-session coverage refusal.' } }); await body.promise; });
    await expectQuiet();
    expect(document.body.textContent).not.toContain('Private old-session coverage refusal.');
  });

  it('suppresses a transport rejection after the old session ends', async () => {
    const pending = deferred<Response>();
    await transport(() => pending.promise);
    await openRequired();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(call => String(call[0]).includes('/pathway-manifest'))).toBe(true));
    await act(async () => { await change('logout'); });
    await act(async () => { pending.reject(new Error('Private old-session transport failure')); await Promise.resolve(); });
    await expectQuiet();
    expect(document.body.textContent).not.toContain('Private old-session transport failure');
  });

  it('keeps a genuine same-revision refresh eligible for the saved coverage read', async () => {
    const body = deferred<unknown>();
    const readJson = vi.fn(() => body.promise);
    await transport(async () => ({ ok: true, status: 200, json: readJson }) as unknown as Response);
    const guard = authService.captureSessionReadGuard();
    await openRequired();
    await waitFor(() => expect(readJson).toHaveBeenCalledOnce());
    let refreshed = false;
    await act(async () => { refreshed = await authService.refreshToken(); });
    expect(refreshed).toBe(true);
    expect(guard.sameRevision()).toBe(true);
    expect(guard.credentialsCurrent()).toBe(false);
    await act(async () => { body.resolve(manifest()); await body.promise; });
    expect(await screen.findByText('Retained protocol evidence')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open saved document' })).toBeTruthy();
  });
});
