// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { seedCompanySession, endCompanySession } from './_company-session-fixture';

const h = vi.hoisted(() => ({ request: vi.fn(), choice: true as unknown, available: true }));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: h.request }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuth: () => ({ user: actual.authService.getUser() }), useAuthUser: () => actual.authService.getUser() };
});
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ currentOrganization: null, currentClientWorkspace: null }) }));
vi.mock('../surfaceAvailable', () => ({ useSurfaceAvailable: () => (id: string) => id !== 'rbm' || h.available }));
vi.mock('../editor/ProjectFilesPanel', () => ({ ProjectFilesPanel: () => <p>Existing project files</p> }));

import { ProjectHome } from '../surfaces/ProjectHome';
import { clearShellProject, publishShellProject, readShellProject } from '../shellProject';
import { clearNavParams } from '../navParams';
import { __resetSurfaceActionBus } from '../surfaceActions';
import { setAuthToken } from '@/utils/authToken';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const props = { surface: { id: 'project-home', label: 'Project home' } as never, segment: 'pharma', onAsk: vi.fn() };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  seedCompanySession({ organizationId: '7' }); h.choice = true; h.available = true;
  clearNavParams(); __resetSurfaceActionBus(); clearShellProject(); publishShellProject({ id: A, title: 'Actual project', step: 'evidence' });
  h.request.mockReset().mockImplementation(async (_method: string, path: string) => {
    if (path === `/api/c2c/projects/${A}` || path === `/api/c2c/projects/${B}`) return json({ id: path.split('/').at(-1), name: 'Actual project',
      program_type: 'IND', product_type: 'drug', primary_agency: 'FDA', status: 'active', riskBasedMonitoring: h.choice });
    if (path.startsWith('/api/authoring/docs')) return json({ documents: [] });
    if (path.startsWith('/api/chat/threads')) return json({ threads: [] });
    return json({});
  });
});
afterEach(() => { cleanup(); endCompanySession(); clearShellProject(); clearNavParams(); __resetSurfaceActionBus(); });

describe('project Evidence monitoring entry', () => {
  it('opens the existing module for the same confirmed opted-in project', async () => {
    const onNav = vi.fn(); render(<ProjectHome {...props} onNav={onNav} />);
    fireEvent.click(await screen.findByRole('button', { name: /Open risk-based monitoring/ }));
    expect(onNav).toHaveBeenCalledExactlyOnceWith('rbm'); expect(readShellProject()?.id).toBe(A);
  });
  it.each([false, undefined, 'true'])('withholds the entry unless the stored choice is exactly true (%j)', async value => {
    h.choice = value; render(<ProjectHome {...props} onNav={vi.fn()} />);
    await screen.findByRole('heading', { level: 2, name: 'Project files' });
    expect(screen.queryByRole('button', { name: /Open risk-based monitoring/ })).toBeNull();
  });
  it('preserves the existing availability verdict', async () => {
    h.available = false; render(<ProjectHome {...props} onNav={vi.fn()} />);
    await screen.findByRole('heading', { level: 2, name: 'Project files' });
    expect(screen.queryByRole('button', { name: /Open risk-based monitoring/ })).toBeNull();
  });
  it('retires a retained entry after project A to B to A', async () => {
    const onNav = vi.fn(); render(<ProjectHome {...props} onNav={onNav} />);
    const button = await screen.findByRole('button', { name: /Open risk-based monitoring/ });
    const key = Object.keys(button).find(name => name.startsWith('__reactProps$'))!;
    const oldOpen = (button as unknown as Record<string, { onClick: () => void }>)[key].onClick;
    await act(async () => { publishShellProject({ id: B, step: 'evidence' }); });
    await screen.findByRole('button', { name: /Open risk-based monitoring/ });
    await act(async () => { publishShellProject({ id: A, step: 'evidence' }); });
    await screen.findByRole('button', { name: /Open risk-based monitoring/ });
    oldOpen(); expect(onNav).not.toHaveBeenCalled();
  });
  it('retires an old entry and admits the fresh entry after a batched project A to B to A', async () => {
    const onNav = vi.fn(); render(<ProjectHome {...props} onNav={onNav} />);
    const button = await screen.findByRole('button', { name: /Open risk-based monitoring/ });
    const key = Object.keys(button).find(name => name.startsWith('__reactProps$'))!;
    const oldOpen = (button as unknown as Record<string, { onClick: () => void }>)[key].onClick;
    await act(async () => { publishShellProject({ id: B }); publishShellProject({ id: A, step: 'evidence' }); });
    const fresh = await screen.findByRole('button', { name: /Open risk-based monitoring/ });
    oldOpen(); expect(onNav).not.toHaveBeenCalled();
    fireEvent.click(fresh); expect(onNav).toHaveBeenCalledExactlyOnceWith('rbm');
  });
  it.each(['browser bearer', 'unmount'])('retires an entry on %s change', async kind => {
    const onNav = vi.fn(), view = render(<ProjectHome {...props} onNav={onNav} />);
    const button = await screen.findByRole('button', { name: /Open risk-based monitoring/ });
    const key = Object.keys(button).find(name => name.startsWith('__reactProps$'))!;
    const oldOpen = (button as unknown as Record<string, { onClick: () => void }>)[key].onClick;
    if (kind === 'unmount') view.unmount(); else setAuthToken('unadopted.browser.bearer');
    oldOpen(); expect(onNav).not.toHaveBeenCalled();
  });
});
