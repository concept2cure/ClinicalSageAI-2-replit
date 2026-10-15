// @vitest-environment jsdom
/** Current selector provenance through real parent controls and actual auth revisions. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest }));
import { authService } from '@/services/portal/authService';
import { publishShellProject } from '../shellProject';
import { SubmissionCenter } from '../surfaces/SubmissionCenter';
import { PROGRAM_A, PROGRAM_B, SUB_A, SEQ_A, fixtureRoute, response, deferred } from './_submission-deliverables-fixture';

beforeEach(() => {
  authService.setToken('fixture-selector-a', { id: '7', organizationId: '1' }, 'fixture-selector-refresh', 3600);
  publishShellProject({ id: PROGRAM_A, title: 'Program A' });
  apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => fixtureRoute(url));
});
afterEach(() => { cleanup(); authService.endSession(null); delete window.C2C_PROJECT; vi.unstubAllGlobals(); });
const mount = (onRender?: React.ProfilerOnRenderCallback) => render(<React.Profiler id="selector" onRender={onRender ?? (() => {})}><SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} /></React.Profiler>);
const submissionPath = `/api/submissions?programId=${PROGRAM_A}`;

describe('SubmissionCenter selector read ownership', () => {
  it('reacts to the canonical program store without requiring an unrelated user interaction', async () => {
    mount();
    await screen.findByRole('button', { name: 'Open Recorded trial dossier A' });
    act(() => publishShellProject({ id: PROGRAM_B, title: 'Program B' }));
    await screen.findByRole('button', { name: 'Open Recorded trial dossier B' });
    expect(screen.queryByRole('button', { name: 'Open Recorded trial dossier A' })).toBeNull();
    expect(apiRequest.mock.calls.filter(c => c[1] === `/api/submissions?programId=${PROGRAM_B}`)).toHaveLength(1);
  });

  it('never commits the previous submission sequence picker under the new selected submission', async () => {
    delete window.C2C_PROJECT;
    const pending = deferred<Response>();
    apiRequest.mockImplementation(async (_method: string, url: string) => url === '/api/submissions/42/sequences' ? pending.promise : fixtureRoute(url));
    const staleCommits: string[] = [];
    mount(() => {
      const submission = document.querySelector<HTMLSelectElement>('[aria-label="Submission to work on"]');
      const sequence = document.querySelector<HTMLSelectElement>('#sc-seq-picker');
      if (submission?.value === '42' && sequence?.value === '21') staleCommits.push('old sequence under new submission');
    });
    await screen.findByRole('combobox', { name: 'Submission to work on' });
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));
    await screen.findByText('Retained A leaf');
    fireEvent.change(screen.getByRole('combobox', { name: 'Submission to work on' }), { target: { value: '42' } });
    expect(staleCommits).toEqual([]);
    expect(screen.queryByText('Retained A leaf')).toBeNull();
    await act(async () => { pending.resolve(response([{ ...SEQ_A, id: 22 }])); await pending.promise; });
    await screen.findByText('Retained B leaf');
  });

  it('refuses an old scoped portfolio result after program A→B→A starts a fresh read', async () => {
    const oldA = deferred<Response>();
    let reads = 0;
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url === submissionPath) return ++reads === 1 ? oldA.promise : response([{ ...SUB_A, title: 'Fresh current A dossier' }]);
      return fixtureRoute(url);
    });
    mount();
    await waitFor(() => expect(reads).toBe(1));
    act(() => publishShellProject({ id: PROGRAM_B, title: 'Program B' }));
    await screen.findByRole('button', { name: 'Open Recorded trial dossier B' });
    act(() => publishShellProject({ id: PROGRAM_A, title: 'Program A' }));
    await screen.findByRole('button', { name: 'Open Fresh current A dossier' });
    await act(async () => { oldA.resolve(response([SUB_A])); await oldA.promise; });
    expect(screen.queryByRole('button', { name: 'Open Recorded trial dossier A' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open Fresh current A dossier' })).toBeTruthy();
  });

  it('preserves the current sequence selection across existing workspace navigation', async () => {
    apiRequest.mockImplementation(async (_method: string, url: string) => url === '/api/submissions/41/sequences'
      ? response([SEQ_A, { ...SEQ_A, id: 22, sequenceNumber: '0001' }]) : fixtureRoute(url));
    mount();
    await screen.findByRole('combobox', { name: 'Submission to work on' });
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));
    fireEvent.change(await screen.findByRole('combobox', { name: 'Working sequence' }), { target: { value: '22' } });
    await screen.findByText('Retained B leaf');
    fireEvent.click(screen.getByRole('tab', { name: 'Validation' }));
    expect((screen.getByRole('combobox', { name: 'Working sequence' }) as HTMLSelectElement).value).toBe('22');
    await screen.findByText("Couldn't load the validation findings");
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));
    expect((screen.getByRole('combobox', { name: 'Working sequence' }) as HTMLSelectElement).value).toBe('22');
    await screen.findByText('Retained B leaf');
  });

  it.each(['sequence-away-and-back', 'replacement-account'] as const)('does not promote a late source-write verdict after %s', async transition => {
    const write = deferred<Response>();
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url === '/api/submissions/41/sequences') return response([SEQ_A, { ...SEQ_A, id: 22, sequenceNumber: '0001' }]);
      if (method === 'DELETE' && url === '/api/submissions/sequences/21/leaves/301') return write.promise;
      return fixtureRoute(url);
    });
    mount();
    await screen.findByRole('combobox', { name: 'Submission to work on' });
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove leaf FILING-LEAF Retained A leaf' }));
    fireEvent.change(screen.getByLabelText(/^Reason for this placement/), { target: { value: 'Remove this duplicate retained placement' } });
    fireEvent.click(screen.getByRole('button', { name: /^Remove leaf$/ }));
    await waitFor(() => expect(apiRequest.mock.calls.some(call => call[0] === 'DELETE')).toBe(true));
    if (transition === 'sequence-away-and-back') {
      fireEvent.change(screen.getByRole('combobox', { name: 'Working sequence' }), { target: { value: '22' } });
      await screen.findByText('Retained B leaf');
      fireEvent.change(screen.getByRole('combobox', { name: 'Working sequence' }), { target: { value: '21' } });
      await screen.findByText('Retained A leaf');
    } else {
      act(() => authService.setToken('fixture-selector-account-two', { id: '8', organizationId: '1' }, 'fixture-refresh-two', 3600));
      await screen.findByText('Retained A leaf');
    }
    await act(async () => {
      write.resolve(new Response(null, { status: 204, headers: { 'X-Sequence-Status-Changed': 'validated->assembling' } }));
      await write.promise;
    });
    expect(document.body.textContent).not.toContain('removed — server-confirmed');
    expect(document.body.textContent).not.toContain('returned it to Assembling');
  });
});

type SessionChange = 'logout' | 'organization-adoption' | 'replacement-account';
async function sessionTransport(read: () => Promise<Response>) {
  const original = await vi.importActual<typeof import('@/lib/queryClient')>('@/lib/queryClient');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: Parameters<typeof fetch>[1]) => {
    if (String(url).endsWith('/api/v1/auth/session')) return response({ authenticated: true, user: { id: '7', organizationId: '2' }, session: { idleMinutes: 30, lifetimeHours: 12 } });
    if (String(url).endsWith('/api/v1/auth/logout')) return response({ success: true });
    if (String(url).endsWith('/api/v1/auth/refresh')) return response({ accessToken: 'fixture-selector-refreshed', refreshToken: 'fixture-refresh-new', expiresIn: 3600 });
    if (url === submissionPath) {
      const bearer = new Headers(init?.headers).get('Authorization');
      return bearer === 'Bearer fixture-selector-a' ? read() : response({ error: { code: 'FORBIDDEN', message: 'This session cannot read that record.' } }, 403);
    }
    throw new Error('Unexpected fixture route');
  }));
  apiRequest.mockImplementation(async (_method: string, url: string) => url === submissionPath ? original.apiRequest('GET', url) : fixtureRoute(url));
}

async function changeSession(change: SessionChange) {
  if (change === 'logout') await authService.logout();
  else if (change === 'organization-adoption') expect(await authService.adoptSession('fixture-selector-org-two')).toMatchObject({ organizationId: '2' });
  else authService.setToken('fixture-selector-account-two', { id: '8', organizationId: '1' }, 'fixture-refresh-two', 3600);
}

describe('SubmissionCenter selectors — actual session revision changes', () => {
  it.each(['logout', 'organization-adoption', 'replacement-account'] as const)('does not render a delayed old-session portfolio after %s', async change => {
    const pending = deferred<Response>();
    await sessionTransport(() => pending.promise);
    const revision = authService.captureSessionReadGuard();
    mount();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(c => c[0] === submissionPath)).toBe(true));
    await act(async () => { await changeSession(change); });
    expect(revision.sameRevision()).toBe(false);
    await act(async () => { pending.resolve(response([{ ...SUB_A, title: 'Private old session dossier' }])); await pending.promise; });
    await waitFor(() => expect(document.body.textContent).not.toContain('Private old session dossier'));
    expect(screen.queryByRole('combobox', { name: 'Submission to work on' })).toBeNull();
  });

  it('suppresses a delayed JSON body after the session is replaced', async () => {
    const body = deferred<unknown>();
    const readJson = vi.fn(() => body.promise);
    await sessionTransport(async () => ({ ok: true, status: 200, json: readJson }) as unknown as Response);
    mount();
    await waitFor(() => expect(readJson).toHaveBeenCalledOnce());
    act(() => authService.setToken('fixture-selector-account-two', { id: '8', organizationId: '1' }, 'fixture-refresh-two', 3600));
    await act(async () => { body.resolve([{ ...SUB_A, title: 'Private delayed body dossier' }]); await body.promise; });
    expect(document.body.textContent).not.toContain('Private delayed body dossier');
    expect(screen.queryByRole('combobox', { name: 'Submission to work on' })).toBeNull();
  });

  it('permits a delayed body during a genuine same-revision bearer refresh', async () => {
    const body = deferred<unknown>();
    const readJson = vi.fn(() => body.promise);
    await sessionTransport(async () => ({ ok: true, status: 200, json: readJson }) as unknown as Response);
    const guard = authService.captureSessionReadGuard();
    mount();
    await waitFor(() => expect(readJson).toHaveBeenCalledOnce());
    let refreshed = false;
    await act(async () => { refreshed = await authService.refreshToken(); });
    expect(refreshed).toBe(true);
    expect(guard.sameRevision()).toBe(true);
    expect(guard.credentialsCurrent()).toBe(false);
    await act(async () => { body.resolve([SUB_A]); await body.promise; });
    expect(await screen.findByRole('button', { name: 'Open Recorded trial dossier A' })).toBeTruthy();
    await screen.findByRole('button', { name: 'Open the sequences' });
  });
});
