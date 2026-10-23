// @vitest-environment jsdom
/** Current reporting reads and downloads belong to the session that requested them. */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
const downloadBlob = vi.hoisted(() => vi.fn(() => true));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('../download', async original => ({ ...(await original<typeof import('../download')>()), downloadBlob }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuthUser: () => actual.authService.getUser() };
});

import { authService, type AuthUser } from '@/services/portal/authService';
import { InsightsCanvas } from '../surfaces/Insights';
import { publishShellProject } from '../shellProject';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const TYPE = { typeId: 'readiness.executive_digest', label: 'Executive Readiness Digest', family: 'readiness', allowedScopes: ['project'], computedScopes: ['project'], runnable: true, allowedClientSegments: [], runScopeType: 'project', runScopeId: '11' };
const ACTOR = { id: '7', organizationId: '1', displayName: 'Original Reader', email: 'original@example.test', permissions: ['governed:write', 'report:finalize'], mfaEnabled: false };
const NEXT = { ...ACTOR, id: '8', displayName: 'Current Reader', email: 'current@example.test' };
const props = { surface: { id: 'insights', label: 'Reporting' } as OwnedSurfaceViewProps['surface'], segment: 'pharma', onNav: vi.fn() };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const overview = (label = 'CURRENT-PROGRAM') => ({ data: { organizationId: 1, tier: 'enterprise', segments: ['pharma'], reportTypes: [TYPE], leadProgram: { projectId: 11, code: label, label, scope: 'project', scopeId: '11', filing: null, readiness: 50, criticalBlockerCount: 1 }, portfolio: { programs: null } } });
const reportDocument = (text = 'Original private report') => ({ data: { reportTypeId: TYPE.typeId, scopeType: 'project', scopeId: '11', scopeLabel: 'Stored program', generatedAt: '2026-10-23T08:00:00Z', status: 'partial', truthfulness: { reasons: [] }, sections: [{ id: 'source', title: 'Retained evidence', blocks: [{ kind: 'summary', text }] }] } });
const row = { id: 41, runUuid: 'retained-run', reportTypeId: TYPE.typeId, reportTypeLabel: TYPE.label, scopeType: 'project', scopeId: '11', status: 'partial', confidence: null, createdAt: '2026-10-23T08:00:00Z' };
const pdf = new Blob(['%PDF-governed-report'], { type: 'application/pdf' });
const pdfResponse = () => ({ ok: true, status: 200, blob: async () => pdf }) as Response;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
type RouteOverride = (method: string, url: string, body?: unknown) => Response | Promise<Response> | undefined;
function wire(override?: RouteOverride) {
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    const supplied = override?.(method, url, body);
    if (supplied) return supplied;
    if (url.startsWith('/api/insights-canvas/overview')) return ok(overview());
    if (method === 'POST' && url === '/api/report-os/runs') return ok({ data: { run: { id: 41 } } });
    if (url === '/api/report-os/runs/41/rendered') return ok(reportDocument());
    if (url === '/api/report-os/runs/41/export.pdf') return pdfResponse();
    if (url.startsWith('/api/report-os/runs?')) return ok({ data: [row] });
    return ok({ data: [] });
  });
}
function renderCanvas() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><InsightsCanvas {...props} /></QueryClientProvider>);
}
async function run() {
  fireEvent.click(await screen.findByRole('tab', { name: 'Report catalog' }));
  fireEvent.click(await screen.findByRole('button', { name: /^Run$/ }));
  await screen.findByText('Original private report');
}
function replace(user: Partial<AuthUser> = NEXT) {
  authService.setToken('fixture-replacement-session', user, 'fixture-replacement-refresh', 3600);
}
const calls = (method: string, prefix: string) => apiRequest.mock.calls.filter(([m, u]) => m === method && String(u).startsWith(prefix));
beforeEach(() => {
  apiRequest.mockReset(); downloadBlob.mockReset().mockReturnValue(true);
  authService.setToken('fixture-original-session', ACTOR, 'fixture-original-refresh', 3600);
  window.history.replaceState({}, '', '/');
  delete window.C2C_PROJECT;
  wire();
});
afterEach(() => { cleanup(); authService.endSession(null); vi.unstubAllGlobals(); delete window.C2C_PROJECT; });

describe('reporting current session — private canvas reads', () => {
  it('withdraws an open report and rereads the overview for a replacement account in the same organization', async () => {
    renderCanvas(); await run();
    const before = calls('GET', '/api/insights-canvas/overview').length;
    await act(async () => replace());
    await waitFor(() => expect(screen.queryByText('Original private report')).toBeNull());
    await waitFor(() => expect(calls('GET', '/api/insights-canvas/overview')).toHaveLength(before + 1));
    expect(screen.queryByRole('button', { name: 'Export PDF' })).toBeNull();
  });

  it('withdraws private data on a current account-role replacement even when its ids stay the same', async () => {
    renderCanvas(); await run();
    await act(async () => replace({ ...ACTOR, permissions: [] }));
    await waitFor(() => expect(screen.queryByText('Original private report')).toBeNull());
    fireEvent.click(await screen.findByRole('tab', { name: 'Report catalog' }));
    expect((screen.getByRole('button', { name: /^Run$/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('withdraws private results when the server refreshes the current role without rotating the session revision', async () => {
    renderCanvas(); await run();
    const session = authService.captureSessionReadGuard();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ authenticated: true, user: { ...ACTOR, permissions: [] } }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await act(async () => { expect((await authService.refreshUser()).success).toBe(true); });
    expect(session.sameRevision()).toBe(true);
    expect(screen.queryByText('Original private report')).toBeNull();
    fireEvent.click(await screen.findByRole('tab', { name: 'Report catalog' }));
    expect((screen.getByRole('button', { name: /^Run$/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('discards an earlier overview that resolves after a replacement account has started its read', async () => {
    const original = deferred<Response>();
    wire((_method, url) => url.startsWith('/api/insights-canvas/overview')
      ? authService.getUser()?.id === ACTOR.id ? original.promise : ok(overview('NEW-OWNER-PROGRAM')) : undefined);
    renderCanvas();
    await waitFor(() => expect(calls('GET', '/api/insights-canvas/overview')).toHaveLength(1));
    await act(async () => replace());
    await act(async () => original.resolve(ok(overview('OLD-PRIVATE-PROGRAM'))));
    await waitFor(() => expect(screen.queryByText('OLD-PRIVATE-PROGRAM')).toBeNull());
    expect(calls('GET', '/api/insights-canvas/overview')).toHaveLength(2);
  });

  it('does not continue a sent run under replacement credentials or imply that it was rolled back', async () => {
    const creation = deferred<Response>();
    wire((method, url) => method === 'POST' && url === '/api/report-os/runs' ? creation.promise : undefined);
    renderCanvas();
    fireEvent.click(await screen.findByRole('tab', { name: 'Report catalog' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Run$/ }));
    await waitFor(() => expect(calls('POST', '/api/report-os/runs')).toHaveLength(1));
    await act(async () => replace());
    await act(async () => creation.resolve(ok({ data: { run: { id: 41 } } })));
    expect(calls('GET', '/api/report-os/runs/41/rendered')).toHaveLength(0);
    expect(screen.queryByText('Original private report')).toBeNull();
    expect(screen.getByText(/Requests sent before the change may have completed/).getAttribute('role')).toBe('status');
    expect(calls('POST', '/api/report-os/runs')).toHaveLength(1);
  });

  it('refuses a stale Run click in the same frame that the current actor changes', async () => {
    renderCanvas();
    fireEvent.click(await screen.findByRole('tab', { name: 'Report catalog' }));
    const oldRun = await screen.findByRole('button', { name: /^Run$/ });
    act(() => { replace(); fireEvent.click(oldRun); });
    expect(calls('POST', '/api/report-os/runs')).toHaveLength(0);
  });

  it('discards rendered JSON that finishes after a session ends', async () => {
    const body = deferred<ReturnType<typeof reportDocument>>();
    const readBody = vi.fn(() => body.promise);
    wire((_method, url) => url === '/api/report-os/runs/41/rendered' ? { ok: true, status: 200, json: readBody } as unknown as Response : undefined);
    renderCanvas();
    fireEvent.click(await screen.findByRole('tab', { name: 'Report catalog' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Run$/ }));
    await waitFor(() => expect(readBody).toHaveBeenCalledOnce());
    await act(async () => authService.endSession(null));
    await act(async () => body.resolve(reportDocument()));
    expect(screen.queryByText('Original private report')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export PDF' })).toBeNull();
  });

  it('discards a saved-history document that returns after account replacement', async () => {
    const response = deferred<Response>();
    wire((_method, url) => url === '/api/report-os/runs/41/rendered' ? response.promise : undefined);
    renderCanvas();
    fireEvent.click(await screen.findByRole('tab', { name: 'Run history' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    await waitFor(() => expect(calls('GET', '/api/report-os/runs/41/rendered')).toHaveLength(1));
    await act(async () => replace());
    await act(async () => response.resolve(ok(reportDocument())));
    expect(screen.queryByText('Original private report')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export PDF' })).toBeNull();
  });
});

describe('old reporting forms and signature callbacks', () => {
  it('blocks a stale Finalize click in the same frame as replacement credentials', async () => {
    renderCanvas(); await run();
    const oldFinalize = screen.getByRole('button', { name: /Finalize/ });
    act(() => { replace(); fireEvent.click(oldFinalize); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls('POST', '/api/report-os/runs/41/finalize')).toHaveLength(0);
  });
  it('blocks a stale schedule save in the same frame as replacement credentials', async () => {
    renderCanvas();
    fireEvent.click(await screen.findByRole('tab', { name: 'Schedules' }));
    fireEvent.click(await screen.findByRole('button', { name: 'New schedule' }));
    fireEvent.change(screen.getByLabelText('Report'), { target: { value: TYPE.typeId } });
    const oldSave = screen.getByRole('button', { name: 'Save schedule' });
    act(() => { replace(); fireEvent.click(oldSave); });
    expect(calls('POST', '/api/insights/subscriptions')).toHaveLength(0);
  });

  it('blocks a stale schedule PATCH in the same frame as replacement credentials', async () => {
    wire((_method, url) => url === '/api/insights/subscriptions' ? ok({ data: [{ id: 7, reportTypeId: TYPE.typeId, scopeType: 'project', scopeId: '11', schedule: { cadence: 'daily', hour: 8 }, enabled: true, recipients: [], channel: 'platform', format: 'in_app' }] }) : undefined);
    renderCanvas();
    fireEvent.click(await screen.findByRole('tab', { name: 'Schedules' }));
    const oldPause = await screen.findByRole('button', { name: 'Pause' });
    act(() => { replace(); fireEvent.click(oldPause); });
    expect(calls('PATCH', '/api/insights/subscriptions')).toHaveLength(0);
  });

  it.each(['network', 'missing-id', 'boolean-id', 'status-zero', 'server-error', 'returned-unavailable'] as const)('does not describe an uncertain %s creation outcome as a failed write', async kind => {
    wire((method, url) => {
      if (method === 'POST' && url === '/api/report-os/runs') {
        if (kind === 'network') return Promise.reject(new Error('Connection ended before its receipt arrived.'));
        if (kind === 'status-zero' || kind === 'server-error') return Promise.reject(Object.assign(new Error('The request receipt is unavailable.'), { status: kind === 'status-zero' ? 0 : 500, payload: { error: 'The request receipt is unavailable.' } }));
        if (kind === 'returned-unavailable') return { ok: false, status: 503, json: async () => ({ error: 'The request receipt is unavailable.' }) } as Response;
        return ok({ data: { run: kind === 'boolean-id' ? { id: true } : {} } });
      }
      return undefined;
    });
    renderCanvas();
    fireEvent.click(await screen.findByRole('tab', { name: 'Report catalog' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Run$/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/may have completed.*Check Run history/i);
    expect(calls('POST', '/api/report-os/runs')).toHaveLength(1);
    expect(calls('GET', '/api/report-os/runs/41/rendered')).toHaveLength(0);
  });

  it.each(['nested', 'root'] as const)('preserves a known recorded rollback in the %s error code', async placement => {
    const message = 'The report could not be recorded. Nothing was saved.';
    const payload = placement === 'nested' ? { error: { code: 'REPORT_RUN_NOT_RECORDED', message } } : { code: 'REPORT_RUN_NOT_RECORDED', message };
    wire((method, url) => method === 'POST' && url === '/api/report-os/runs' ? { ok: false, status: 503, json: async () => payload } as Response : undefined);
    renderCanvas();
    fireEvent.click(await screen.findByRole('tab', { name: 'Report catalog' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Run$/ }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(message);
    expect(alert.textContent).not.toMatch(/may have completed/);
    expect(calls('POST', '/api/report-os/runs')).toHaveLength(1);
    expect(calls('GET', '/api/report-os/runs/41/rendered')).toHaveLength(0);
  });

  it('does not finalize after the account changes during password verification', async () => {
    const verification = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(async () => verification.promise));
    renderCanvas(); await run();
    fireEvent.click(screen.getByRole('button', { name: /Finalize/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: 'Prepared for a regulated review' } });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'fixture-password' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining('/verify-password'), expect.any(Object)));
    await act(async () => replace());
    await act(async () => verification.resolve(ok({ valid: true })));
    expect(calls('POST', '/api/report-os/runs/41/finalize')).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('ro-seal')).toBeNull();
  });

  it('withdraws a sent finalization without attributing its delayed seal to a replacement account', async () => {
    const finalization = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(async () => ok({ valid: true })));
    wire((_method, url) => url.endsWith('/finalize') ? finalization.promise : undefined);
    renderCanvas(); await run();
    fireEvent.click(screen.getByRole('button', { name: /Finalize/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: 'Prepared for a regulated review' } });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'fixture-password' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
    await waitFor(() => expect(calls('POST', '/api/report-os/runs/41/finalize')).toHaveLength(1));
    await act(async () => replace());
    await act(async () => finalization.resolve(ok({ data: { seal: { algorithm: 'sha256', contentHash: 'original-private-seal', atomCount: 3 }, signature: { signedAt: '2026-10-23T09:00:00Z', meaning: 'authorship' } } })));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('ro-seal')).toBeNull();
    expect(document.body.textContent).not.toContain('original-private-seal');
    expect(screen.getByText(/Requests sent before the change may have completed/)).toBeTruthy();
    expect(calls('POST', '/api/report-os/runs/41/finalize')).toHaveLength(1);
  });
});

describe('single report export — current session and pending request', () => {
  it.each(['logout', 'replacement', 'organization'] as const)('discards a PDF response after %s', async change => {
    const response = deferred<Response>();
    wire((_method, url) => url.endsWith('/export.pdf') ? response.promise : undefined);
    renderCanvas(); await run();
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    await waitFor(() => expect(calls('GET', '/api/report-os/runs/41/export.pdf')).toHaveLength(1));
    await act(async () => change === 'logout' ? authService.endSession(null) : replace(change === 'organization' ? { ...ACTOR, organizationId: '2' } : NEXT));
    await act(async () => response.resolve(pdfResponse()));
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(document.querySelector('.de-toast')).toBeNull();
  });

  it('discards a PDF body that finishes after the current account changes', async () => {
    const body = deferred<Blob>();
    const readBody = vi.fn(() => body.promise);
    wire((_method, url) => url.endsWith('/export.pdf') ? { ok: true, status: 200, blob: readBody } as unknown as Response : undefined);
    renderCanvas(); await run();
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    await waitFor(() => expect(readBody).toHaveBeenCalledOnce());
    await act(async () => replace());
    await act(async () => body.resolve(pdf));
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(document.querySelector('.de-toast')).toBeNull();
  });

  it('discards an earlier report PDF body when the selected program changes', async () => {
    const body = deferred<Blob>();
    const readBody = vi.fn(() => body.promise);
    wire((_method, url) => url.endsWith('/export.pdf') ? { ok: true, status: 200, blob: readBody } as unknown as Response : undefined);
    renderCanvas(); await run();
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    await waitFor(() => expect(readBody).toHaveBeenCalledOnce());
    await act(async () => publishShellProject({ id: '22222222-2222-4222-8222-222222222222', code: 'NEW-PROGRAM' }));
    await act(async () => body.resolve(pdf));
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(document.querySelector('.de-toast')).toBeNull();
  });

  it('suppresses an old export refusal that arrives after a current-session change', async () => {
    const error = deferred<{ error: string }>();
    const readError = vi.fn(() => error.promise);
    wire((_method, url) => url.endsWith('/export.pdf') ? { ok: false, status: 403, json: readError } as unknown as Response : undefined);
    renderCanvas(); await run();
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    await waitFor(() => expect(readError).toHaveBeenCalledOnce());
    await act(async () => replace());
    await act(async () => error.resolve({ error: 'Previous private export refused.' }));
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(screen.queryByText(/Previous private export refused/)).toBeNull();
  });

  it('dispatches one PDF read for duplicate clicks and disables its export while pending', async () => {
    const response = deferred<Response>();
    wire((_method, url) => url.endsWith('/export.pdf') ? response.promise : undefined);
    renderCanvas(); await run();
    const button = screen.getByRole('button', { name: 'Export PDF' }) as HTMLButtonElement;
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(calls('GET', '/api/report-os/runs/41/export.pdf')).toHaveLength(1);
    expect(button.disabled).toBe(true);
    await act(async () => response.resolve(pdfResponse()));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
    expect(button.disabled).toBe(false);
  });

  it('allows a pending PDF body and retains the report across normal bearer refresh in the same session', async () => {
    const body = deferred<Blob>();
    const readBody = vi.fn(() => body.promise);
    wire((_method, url) => url.endsWith('/export.pdf') ? { ok: true, status: 200, blob: readBody } as unknown as Response : undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ accessToken: 'fixture-rotated-bearer', refreshToken: 'fixture-rotated-refresh', expiresIn: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    renderCanvas(); await run();
    const before = calls('GET', '/api/insights-canvas/overview').length;
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    await waitFor(() => expect(readBody).toHaveBeenCalledOnce());
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    expect(screen.getByText('Original private report')).toBeTruthy();
    expect(calls('GET', '/api/insights-canvas/overview')).toHaveLength(before);
    await act(async () => body.resolve(pdf));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
  });
});
