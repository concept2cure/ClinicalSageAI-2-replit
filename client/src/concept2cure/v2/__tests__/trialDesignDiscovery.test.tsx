// @vitest-environment jsdom
/** Trial/study design must reach the existing combined owner through the real palette. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const account = vi.hoisted(() => ({ user: { id: '12', organizationId: 7, displayName: 'Fictional author', roles: ['member'] }, logout: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
vi.mock('@/services/portal/authService', async original => ({
  ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => account,
}));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ tenant: null, organizationId: 7 }) }));

import { APP_REGISTRY } from '@shared/regulatory/app-registry';
import { UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { CmdK } from '../Shell';
import { NavEntitlementsProvider, useNavEntitlements, type NavSurfaceEntitlement } from '../navEntitlements';
import { clearShellProject, publishShellProject, readShellProject } from '../shellProject';
import { clearNavParams, registerSurfaceLeaveGuard } from '../navParams';
import { __resetCeremonies } from '../ceremony';
import { PALETTE_PROJECTS_URL } from '../paletteProjects';

const PROJECT = { id: '5b2d7c11-2222-4333-8444-555566667777', title: 'Fictional Phase 2 trial', code: 'TRIAL-201' };
const NAV_URL = '/api/module-subscriptions/navigation';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const currentLabel = () => UI_SURFACES.find(surface => surface.id === 'protocol-dev')!.label;
const release: Array<() => void> = [];

function serve(over: Partial<NavSurfaceEntitlement> = {}, unreadable = false) {
  const verdict: NavSurfaceEntitlement = { id: 'protocol-dev', label: APP_REGISTRY.study_protocol_design.label,
    entitled: true, source: 'included', requiredTier: null, ...over };
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method !== 'GET') throw new Error('Discovery must not write a record');
    if (url === NAV_URL) {
      if (unreadable) return { ok: false, status: 503, json: async () => ({ error: 'Navigation unavailable' }) } as Response;
      return ok({ organizationId: 7, tier: 'enterprise', industryMode: 'biotech', masterAdmin: false,
        resolved: true, launchScope: { enforced: true }, surfaces: [verdict] });
    }
    if (url === PALETTE_PROJECTS_URL) return ok({ success: true, data: [], meta: {} });
    if (url === '/api/chat/threads?limit=5') return ok({ threads: [] });
    if (url === '/api/module-access-requests/mine') return ok({ requests: [] });
    throw new Error(`Unexpected discovery read: ${url}`);
  });
}

function mount() {
  const onNav = vi.fn(), onClose = vi.fn();
  function Palette() {
    const [open, setOpen] = React.useState(true);
    const { resolved } = useNavEntitlements();
    return <>
      <span data-testid="discovery-verdict">{resolved ? 'ready' : 'unresolved'}</span>
      <CmdK open={open} onClose={() => { onClose(); setOpen(false); }} onNav={onNav} onAsk={vi.fn()} onAct={vi.fn()} />
    </>;
  }
  render(<NavEntitlementsProvider><Palette /></NavEntitlementsProvider>);
  return { onNav, onClose };
}

const palette = () => screen.getByRole('dialog', { name: 'Command palette' });
const search = (value: string) => fireEvent.change(within(palette()).getByPlaceholderText(/^Search projects, conversations and pages/), { target: { value } });
const destination = () => within(palette()).getAllByRole('button').find(button => button.querySelector('.lbl')?.textContent === currentLabel());
const ready = () => waitFor(() => expect(screen.getByTestId('discovery-verdict').textContent).toBe('ready'));

beforeEach(() => {
  apiRequest.mockReset(); __resetCeremonies(); clearNavParams(); localStorage.clear(); sessionStorage.clear();
  window.history.replaceState({}, '', '/concept2cure/project-home');
  publishShellProject(PROJECT);
});
afterEach(() => {
  cleanup(); release.splice(0).forEach(unregister => unregister()); __resetCeremonies();
  clearNavParams(); clearShellProject(); localStorage.clear(); sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('existing study and protocol design is discoverable by the user’s words', () => {
  it.each(['Trial design', 'Study design'])('%s finds the combined workflow and preserves the current project', async term => {
    serve(); const callbacks = mount(); await ready(); const project = readShellProject();
    search(term);
    const button = await within(palette()).findByRole('button', { name: new RegExp(APP_REGISTRY.study_protocol_design.label.replace('&', '\\&')) });
    expect(button.querySelector('.lbl')?.textContent).toBe(APP_REGISTRY.study_protocol_design.label);
    expect(within(palette()).getAllByRole('button').filter(row => row.querySelector('.lbl')?.textContent === APP_REGISTRY.study_protocol_design.label)).toHaveLength(1);
    fireEvent.click(button);
    expect(callbacks.onNav).toHaveBeenCalledExactlyOnceWith('protocol-dev'); expect(callbacks.onClose).toHaveBeenCalledOnce();
    expect(readShellProject()).toBe(project); expect(readShellProject()).toMatchObject(PROJECT);
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it.each(['protocol workspace', 'protocol authoring', 'protocol dev'])('retains the existing %s discovery path', async term => {
    serve(); const callbacks = mount(); await ready(); search(term);
    const button = destination(); expect(button).toBeTruthy(); fireEvent.click(button!);
    expect(callbacks.onNav).toHaveBeenCalledExactlyOnceWith('protocol-dev'); expect(readShellProject()).toMatchObject(PROJECT);
  });

  it('keeps a genuine licence lock as its existing explanation, without navigation or a write', async () => {
    serve({ entitled: false, source: 'tier', requiredTier: 'professional' });
    const callbacks = mount(); await ready(); search('protocol workspace');
    const button = destination(); expect(button).toBeTruthy(); fireEvent.click(button!);
    expect(callbacks.onNav).not.toHaveBeenCalled(); expect(callbacks.onClose).toHaveBeenCalledOnce();
    const notice = await screen.findByRole('dialog', { name: APP_REGISTRY.study_protocol_design.label });
    expect(notice.getAttribute('data-lock-source')).toBe('tier');
    expect(readShellProject()).toMatchObject(PROJECT); expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it('does not list this workflow when its existing launch-scope verdict refuses it', async () => {
    serve({ entitled: false, source: 'launch-scope' }); const callbacks = mount(); await ready();
    for (const term of ['Trial design', 'Study design', 'protocol workspace']) {
      search(term); expect(destination()).toBeUndefined();
    }
    expect(callbacks.onNav).not.toHaveBeenCalled(); expect(readShellProject()).toMatchObject(PROJECT);
  });

  it('does not invent a lock when navigation entitlements cannot be read', async () => {
    serve({}, true); const callbacks = mount();
    await waitFor(() => expect(apiRequest.mock.calls.some(([, url]) => url === NAV_URL)).toBe(true));
    search('protocol workspace'); const button = destination(); expect(button).toBeTruthy(); fireEvent.click(button!);
    expect(callbacks.onNav).toHaveBeenCalledExactlyOnceWith('protocol-dev');
    expect(screen.queryByRole('dialog', { name: APP_REGISTRY.study_protocol_design.label })).toBeNull();
  });

  it('retains pending-work protection before activating the existing destination', async () => {
    serve(); const callbacks = mount(); await ready();
    release.push(registerSurfaceLeaveGuard(() => 'Save the current trial rationale before switching work.'));
    search('protocol workspace'); const button = destination(); expect(button).toBeTruthy(); fireEvent.click(button!);
    expect(callbacks.onNav).not.toHaveBeenCalled(); expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(readShellProject()).toMatchObject(PROJECT);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Save the current trial rationale before switching work.');
  });
});
