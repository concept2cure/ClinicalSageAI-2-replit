// @vitest-environment jsdom
/**
 * A new organisation's setup on Home (decision 9, CLIENT_JOURNEY_2026-10-25.md pass 5): company details, your
 * team, your first project — for the administrators who can do them. Each step's state is read: the company
 * profile saved with an address (not the signup name), more than one membership, a project in the list Home
 * already reads. A failed read is "Could not be checked", never "To do" or "Done". With all three done the
 * checklist is gone. Each step opens the screen where it is done today. It is offered only to someone the server
 * lets take the steps: the company read's own canManage, not the client's wider administrator-role list.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ user: { id: 7, organizationId: '4', firstName: 'Dana', roles: ['admin'] } as Record<string, unknown> }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => auth }));

import { Home } from '../surfaces/Surfaces';
import { __resetSurfaceActionBus, registerSurfaceActionHandlers } from '../surfaceActions';
import { companyDetailsState } from '../surfaces/HomeSetup';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const fail = () => ({ ok: false, status: 503, json: async () => ({}) }) as Response;
interface Serve { company?: Response; org?: Response; projects?: unknown[] }
function serve({ company = ok({ data: { revision: 0, companyName: 'Acme Bio', address: '' }, canManage: true }),
  org = ok({ success: true, organization: { activeUsers: 1 } }), projects = [] }: Serve = {}) {
  apiRequest.mockImplementation((_m: string, url: string) => {
    if (url.startsWith('/api/client-branding/company-documents')) return Promise.resolve(company);
    if (url === '/api/organizations/4') return Promise.resolve(org);
    if (url.startsWith('/api/c2c/projects')) return Promise.resolve(ok({ data: projects }));
    if (url.startsWith('/api/chat/threads')) return Promise.resolve(ok({ threads: [] }));
    return Promise.resolve(ok({ data: [] }));
  });
}
function mount() {
  const onNav = vi.fn();
  render(<Home onNav={onNav} onAsk={vi.fn()} segment="biotech" />);
  return { onNav };
}
const stateOf = (step: string) => document.querySelector(`[data-testid="home-setup"] li[data-step="${step}"]`)?.getAttribute('data-state');

beforeEach(() => { apiRequest.mockReset(); auth.user = { id: 7, organizationId: '4', firstName: 'Dana', roles: ['admin'] }; serve(); });
afterEach(() => { cleanup(); __resetSurfaceActionBus(); });

describe('Home: set up your organisation', () => {
  it('a new organisation: three steps to do, the company name alone not counted as details', async () => {
    mount();
    const section = await screen.findByTestId('home-setup');
    await waitFor(() => expect(stateOf('company')).toBe('todo'));
    expect(stateOf('team')).toBe('todo');
    expect(stateOf('project')).toBe('todo');
    expect(within(section).getByText('0 of 3 done')).toBeTruthy();
  });

  it('each step opens where it is done', async () => {
    const { onNav } = mount();
    await waitFor(() => expect(stateOf('company')).toBe('todo'));
    const section = screen.getByTestId('home-setup');
    fireEvent.click(within(section).getByRole('button', { name: /Record your company details/ }));
    expect(onNav).toHaveBeenCalledWith('admin-console');
    fireEvent.click(within(section).getByRole('button', { name: /Create your first project/ }));
    expect(onNav).toHaveBeenCalledWith('projects');
    const openWizard = vi.fn(() => ({ ok: true as const }));
    registerSurfaceActionHandlers('projects', { 'projects.new-project': openWizard });
    expect(openWizard).toHaveBeenCalledOnce();
    expect(apiRequest.mock.calls.some(([method]) => method !== 'GET')).toBe(false);
  });

  it('a failed read is "Could not be checked", never to do or done', async () => {
    serve({ org: fail() });
    mount();
    await waitFor(() => expect(stateOf('team')).toBe('unknown'));
    expect(within(screen.getByTestId('home-setup')).getByText('Could not be checked')).toBeTruthy();
  });

  it('with all three done, the checklist is gone', async () => {
    serve({ company: ok({ data: { revision: 2, address: '1 Main St' }, canManage: true }),
      org: ok({ success: true, organization: { activeUsers: 3 } }), projects: [{ id: 'p-1', title: 'BX-401' }] });
    mount();
    await screen.findByText('BX-401');
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', '/api/organizations/4'));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('home-setup')).toBeNull();
  });

  it('is not shown to someone who cannot take the steps', async () => {
    auth.user = { id: 8, organizationId: '4', firstName: 'Sam', roles: ['member'] };
    mount();
    await screen.findByRole('heading', { name: 'Your projects' });
    expect(screen.queryByTestId('home-setup')).toBeNull();
    expect(apiRequest).not.toHaveBeenCalledWith('GET', '/api/organizations/4');
  });

  it('is not offered to an administrator role the server refuses the steps to', async () => {
    // business_admin passes the client's admin check, but company details and
    // invitations need the organisation role owner or admin; the company read
    // says so itself (canManage).
    auth.user = { id: 9, organizationId: '4', firstName: 'Bo', roles: ['business_admin'] };
    serve({ company: ok({ data: { revision: 0, address: '' }, canManage: false }) });
    mount();
    await screen.findByRole('heading', { name: 'Your projects' });
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', '/api/client-branding/company-documents?includeLegal=false'));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('home-setup')).toBeNull();
  });

  it('reads the profile from either response shape, and a saved address is what counts', () => {
    expect(companyDetailsState({ loading: false, data: { data: { revision: 1, address: '1 Main St' } } })).toBe('done');
    expect(companyDetailsState({ loading: false, data: { revision: 1, address: ' ' } })).toBe('todo');
    expect(companyDetailsState({ loading: false, data: { data: {} } })).toBe('unknown');
  });
});
