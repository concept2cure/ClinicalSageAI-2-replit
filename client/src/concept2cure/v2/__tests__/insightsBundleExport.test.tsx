// @vitest-environment jsdom
/** Retained report-pack export interactions; no PDF assembly, finalization or scientific readiness claim. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const downloadBlob = vi.hoisted(() => vi.fn(() => true));
vi.mock('../download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../download')>()),
  downloadBlob,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { BUNDLES, ok, route, renderCanvas, openTab, requestCalls } from './_insights-library-fixture';

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_method: string, url: string) => route(url));
  downloadBlob.mockReset().mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  authService.endSession(null);
  vi.unstubAllGlobals();
});
const calls = (method: string, prefix: string) => requestCalls(apiRequest, method, prefix);

const bundleId = BUNDLES[0].bundleId;
const exportButtonName = { reports: /Export reports PDF/, manifest: /Export manifest PDF/ } as const;
const exportPath = `/api/report-os/bundles/${bundleId}/export.pdf`;
const pdf = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], { type: 'application/pdf' });
const pdfResponse = () => ({ ok: true, status: 200, blob: async () => pdf }) as Response;

function wireExport(exportResponse: () => Response | Promise<Response>) {
  apiRequest.mockImplementation(async (_method: string, url: string) =>
    url.startsWith(exportPath) ? exportResponse() : route(url),
  );
}

async function openBundles() {
  await renderCanvas();
  await openTab(/Bundles/);
  await screen.findByText('Pre-approval inspection pack');
}

describe('retained bundle PDF downloads — server-byte exports', () => {
  it('downloads the exact server report-pack blob once through the reports selector', async () => {
    wireExport(pdfResponse);
    await openBundles();
    fireEvent.click(screen.getByRole('button', { name: /Export reports PDF/ }));

    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    expect(calls('GET', exportPath)).toHaveLength(1);
    expect(calls('GET', exportPath)[0][1]).toBe(`${exportPath}?content=reports`);
    expect(downloadBlob).toHaveBeenCalledWith('report-pack-bbbbbbbb.pdf', pdf);
    expect(screen.getByText('Saved report-pack-bbbbbbbb.pdf.').getAttribute('role')).toBe('status');
    expect(document.querySelector('.de-toast')?.getAttribute('data-tone')).toBeNull();
    expect(apiRequest.mock.calls.some(([method]) => method !== 'GET')).toBe(false);
  });

  it('preserves the default manifest URL and its existing download filename', async () => {
    wireExport(pdfResponse);
    await openBundles();
    fireEvent.click(screen.getByRole('button', { name: /Export manifest PDF/ }));

    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    expect(calls('GET', exportPath)).toHaveLength(1);
    expect(calls('GET', exportPath)[0][1]).toBe(exportPath);
    expect(downloadBlob).toHaveBeenCalledWith('Pre-approval_inspection_pack_bbbbbbbb.pdf', pdf);
  });
});

describe('retained bundle PDF downloads — pending requests', () => {
  it.each(['reports', 'manifest'] as const)('disables both controls during a pending %s export and suppresses duplicate dispatch', async (content) => {
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    wireExport(() => pending);
    await openBundles();
    const reports = screen.getByRole('button', { name: /Export reports PDF/ }) as HTMLButtonElement;
    const manifest = screen.getByRole('button', { name: /Export manifest PDF/ }) as HTMLButtonElement;
    act(() => {
      fireEvent.click(content === 'reports' ? reports : manifest);
      fireEvent.click(reports);
      fireEvent.click(manifest);
    });

    expect(reports.disabled).toBe(true);
    expect(manifest.disabled).toBe(true);
    expect(screen.getByText('Preparing PDF…').getAttribute('role')).toBe('status');
    expect(calls('GET', exportPath)).toHaveLength(1);
    expect(downloadBlob).not.toHaveBeenCalled();

    release(pdfResponse());
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(reports.disabled || manifest.disabled).toBe(false));
  });

  it('allows a different bundle to export while this bundle is pending', async () => {
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    const second = { ...BUNDLES[0], bundleId: 'cccccccc-0000-4000-8000-000000000001', name: 'Follow-up pack' };
    const secondPath = `/api/report-os/bundles/${second.bundleId}/export.pdf`;
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url.startsWith(exportPath)) return pending;
      if (url.startsWith(secondPath)) return pdfResponse();
      if (url === '/api/report-os/bundles') return ok({ data: [BUNDLES[0], second] });
      return route(url);
    });
    await openBundles();
    const firstCard = screen.getByText(BUNDLES[0].name).closest('.rl-card') as HTMLElement;
    const secondCard = screen.getByText(second.name).closest('.rl-card') as HTMLElement;
    fireEvent.click(within(firstCard).getByRole('button', { name: /Export reports PDF/ }));
    expect((within(firstCard).getByRole('button', { name: /Export manifest PDF/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(secondCard).getByRole('button', { name: /Export reports PDF/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(secondCard).getByRole('button', { name: /Export manifest PDF/ }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(secondCard).getByRole('button', { name: /Export reports PDF/ }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    expect(downloadBlob).toHaveBeenCalledWith('report-pack-cccccccc.pdf', pdf);
    expect(calls('GET', secondPath)).toHaveLength(1);
    expect((within(firstCard).getByRole('button', { name: /Export reports PDF/ }) as HTMLButtonElement).disabled).toBe(true);
    release(pdfResponse());
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(2));
  });

  it('keeps a pending export disabled when the reader leaves and returns to Bundles', async () => {
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    wireExport(() => pending);
    await openBundles();
    fireEvent.click(screen.getByRole('button', { name: /Export reports PDF/ }));
    await openTab(/Run history/);
    await screen.findByRole('table');
    await openTab(/Bundles/);
    await screen.findByText('Pre-approval inspection pack');
    const reports = screen.getByRole('button', { name: /Export reports PDF/ }) as HTMLButtonElement;
    const manifest = screen.getByRole('button', { name: /Export manifest PDF/ }) as HTMLButtonElement;
    expect(reports.disabled && manifest.disabled).toBe(true);
    fireEvent.click(reports);
    expect(calls('GET', exportPath)).toHaveLength(1);
    release(pdfResponse());
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
  });
});

describe('retained bundle PDF downloads — failures', () => {
  it.each(['response', 'typed-error'] as const)('shows a backend %s refusal without downloading, then re-enables both controls', async (kind) => {
    const reason = 'Exporting this bundle requires the enterprise plan.';
    wireExport(() => {
      if (kind === 'typed-error') throw new ApiRequestError(reason, 403, { error: reason });
      return { ok: false, status: 403, json: async () => ({ error: reason }) } as Response;
    });
    await openBundles();
    fireEvent.click(screen.getByRole('button', { name: /Export reports PDF/ }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/No file saved — Exporting this bundle requires the enterprise plan/);
    expect(document.querySelector('.de-toast')?.getAttribute('data-tone')).toBe('error');
    expect(downloadBlob).not.toHaveBeenCalled();
    await waitFor(() => expect((screen.getByRole('button', { name: /Export reports PDF/ }) as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByRole('button', { name: /Export manifest PDF/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('reports a refused browser download without a success toast', async () => {
    wireExport(pdfResponse);
    downloadBlob.mockReturnValue(false);
    await openBundles();
    fireEvent.click(screen.getByRole('button', { name: /Export reports PDF/ }));

    expect((await screen.findByRole('alert')).textContent).toBe('No file saved — this browser refused the download.');
    expect(document.querySelector('.de-toast')?.getAttribute('data-tone')).toBe('error');
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('Saved report-pack-');
  });

  it('reports a transport failure and permits a retry', async () => {
    wireExport(() => Promise.reject(new Error('Network unavailable')));
    await openBundles();
    fireEvent.click(screen.getByRole('button', { name: /Export reports PDF/ }));

    expect((await screen.findByRole('alert')).textContent).toBe('No file saved — Network unavailable.');
    expect(downloadBlob).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /Export reports PDF/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});

type SessionChange = 'logout' | 'organization-adoption' | 'replacement-account';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, refuse) => { resolve = accept; reject = refuse; });
  return { promise, resolve: (value: T) => resolve(value), reject: (reason: Error) => reject(reason) };
}

async function installSessionTransport(exportResponse: () => Response | Promise<Response>) {
  authService.setToken('fixture-session-one', { id: '7', organizationId: '1' }, 'fixture-refresh-one', 3600);
  const original = await vi.importActual<typeof import('@/lib/queryClient')>('@/lib/queryClient');
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith(exportPath)) return exportResponse();
    if (url.endsWith('/api/v1/auth/session')) return json({ authenticated: true, user: { id: '7', organizationId: '2' }, session: { idleMinutes: 30, lifetimeHours: 12 } });
    if (url.endsWith('/api/v1/auth/refresh')) return json({ accessToken: 'fixture-session-refreshed', refreshToken: 'fixture-refresh-rotated', expiresIn: 3600 });
    if (url.endsWith('/api/v1/auth/logout')) return json({ success: true });
    throw new Error('Unexpected transport route');
  }));
  apiRequest.mockImplementation(async (_method: string, url: string) =>
    url.startsWith(exportPath) ? original.apiRequest('GET', url) : route(url),
  );
}

async function changeSession(change: SessionChange) {
  if (change === 'logout') await authService.logout();
  else if (change === 'organization-adoption') {
    expect(await authService.adoptSession('fixture-session-organization-two')).toMatchObject({ id: '7', organizationId: '2' });
  } else authService.setToken('fixture-session-account-two', { id: '8', organizationId: '1' }, 'fixture-refresh-two', 3600);
}

async function expectQuietExportCompletion() {
  // Retirement withdraws the whole prior-owner library. The stale export must
  // not restore it; a current account explicitly reopens a fresh library read.
  await waitFor(() => expect(screen.queryByRole('button', { name: /Export reports PDF/ })).toBeNull());
  expect(downloadBlob).not.toHaveBeenCalled();
  expect(document.querySelector('.de-toast')).toBeNull();
  if (authService.getUser()) {
    await openTab(/Bundles/);
    expect((await screen.findByRole('button', { name: /Export reports PDF/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: /Export manifest PDF/ }) as HTMLButtonElement).disabled).toBe(false);
  } else {
    expect(screen.getByText('Sign in to read reporting')).toBeTruthy();
  }
}

describe('bundle export session revisions — delayed transport', () => {
  it.each([
    ['reports', 'logout'], ['manifest', 'logout'],
    ['reports', 'organization-adoption'], ['manifest', 'organization-adoption'],
    ['reports', 'replacement-account'], ['manifest', 'replacement-account'],
  ] as const)('discards a delayed %s response after %s', async (content, change) => {
    const response = deferred<Response>();
    await installSessionTransport(() => response.promise);
    const session = authService.captureSessionReadGuard();
    await openBundles();
    fireEvent.click(screen.getByRole('button', { name: exportButtonName[content] }));
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining(exportPath), expect.any(Object)));
    await changeSession(change);
    expect(session.sameRevision()).toBe(false);
    response.resolve(pdfResponse());
    await expectQuietExportCompletion();
  });
});

describe('bundle export session revisions — body reads and failures', () => {
  it('discards a body read that completes after organization adoption', async () => {
    const body = deferred<Blob>();
    const readBlob = vi.fn(() => body.promise);
    await installSessionTransport(() => ({ ok: true, status: 200, blob: readBlob }) as unknown as Response);
    await openBundles();
    fireEvent.click(screen.getByRole('button', { name: /Export reports PDF/ }));
    await waitFor(() => expect(readBlob).toHaveBeenCalledOnce());
    await changeSession('organization-adoption');
    body.resolve(pdf);
    await expectQuietExportCompletion();
  });

  it('suppresses a delayed error JSON response after logout', async () => {
    const body = deferred<{ error: string }>();
    const readError = vi.fn(() => body.promise);
    await installSessionTransport(pdfResponse);
    wireExport(() => ({ ok: false, status: 401, json: readError }) as unknown as Response);
    await openBundles();
    fireEvent.click(screen.getByRole('button', { name: /Export reports PDF/ }));
    await waitFor(() => expect(readError).toHaveBeenCalledOnce());
    await changeSession('logout');
    body.resolve({ error: 'Previous workspace export refused.' });
    await expectQuietExportCompletion();
  });

  it('suppresses a delayed transport rejection after account replacement', async () => {
    const response = deferred<Response>();
    await installSessionTransport(() => response.promise);
    await openBundles();
    fireEvent.click(screen.getByRole('button', { name: /Export reports PDF/ }));
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining(exportPath), expect.any(Object)));
    await changeSession('replacement-account');
    response.reject(new Error('Previous workspace transport refused.'));
    await expectQuietExportCompletion();
  });

  it.each(['reports', 'manifest'] as const)('continues a delayed %s body after automatic bearer refresh in the same revision', async (content) => {
    const body = deferred<Blob>();
    const readBlob = vi.fn(() => body.promise);
    await installSessionTransport(() => ({ ok: true, status: 200, blob: readBlob }) as unknown as Response);
    const session = authService.captureSessionReadGuard();
    await openBundles();
    fireEvent.click(screen.getByRole('button', { name: exportButtonName[content] }));
    await waitFor(() => expect(readBlob).toHaveBeenCalledOnce());
    expect(await authService.refreshToken()).toBe(true);
    expect(session.sameRevision()).toBe(true);
    expect(session.credentialsCurrent()).toBe(false);
    body.resolve(pdf);
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    expect(document.querySelector('.de-toast')?.textContent).toMatch(/^Saved /);
    expect(document.querySelector('.de-toast')?.getAttribute('data-tone')).toBeNull();
  });
});
