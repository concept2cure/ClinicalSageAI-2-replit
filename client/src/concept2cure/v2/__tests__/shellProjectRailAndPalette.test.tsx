// @vitest-environment jsdom
/**
 * Inside a project the shell says where the person is, and ⌘K finds a project
 * (2026-10-31 client demo).
 *
 *   - The rail marked nothing on a project's page: `current` was the rail entry
 *     whose id equals the screen's, and the project's page, its work areas
 *     reached from it and its features have no rail entry. They now mark
 *     Projects (Shell.tsx railTargetOf). A screen with its own entry keeps it.
 *   - ⌘K searched screens, steps and AnA actions, never a project. It now lists
 *     the organization's projects matching a search by title or code, and opens
 *     one on its page. A list it could not read is said, never "no results".
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { firstName: 'Ada', lastName: 'Rowe', displayName: 'Ada Rowe', roles: ['member'] }, logout: vi.fn() }),
}));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ tenant: null, organizationId: 7 }) }));

import { NavEntitlementsProvider } from '../navEntitlements';
import { CmdK, Rail, railTargetOf } from '../Shell';
import { clearShellProject, readShellProject } from '../shellProject';
import { PALETTE_PROJECTS_URL } from '../paletteProjects';

const NAV_URL = '/api/module-subscriptions/navigation';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const NAV = { organizationId: 7, tier: 'standard', industryMode: 'biotech', masterAdmin: false, resolved: true, surfaces: [] };
const PROJECTS = [
  { id: '42d5dcc0-65c1-4581-9e28-dd3c30469312', title: '[Demo · Biotech] C2C-101 anti-IL-23p19 mAb', code: 'CAMA', ws: 'Biotech', status: 'active' },
  { id: 'bee25821-0fc6-4bdc-8b39-dd45c0f23326', title: 'AUD-301 — IND (audit)', code: 'AUD-301', ws: 'Biotech', status: 'active' },
];

function serve(projects: () => Response) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === NAV_URL) return ok(NAV);
    if (method === 'GET' && url === PALETTE_PROJECTS_URL) return projects();
    throw new Error(`unexpected ${method} ${url}`);
  });
}

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  clearShellProject();
});

describe('the rail inside a project', () => {
  it.each([
    ['project-home', 'projects'], ['dossier', 'projects'], ['dossier-map', 'projects'],
    ['device-510k', 'projects'], ['biostatistics', 'biostatistics'], ['protocol-dev', 'projects'],
    ['vault', 'vault'], ['tasks', 'tasks'], ['cmc', 'cmc'], ['rbm', 'rbm'], ['home', 'home'],
  ])('%s is shown under %s', (screenId, entry) => {
    expect(railTargetOf(screenId)).toBe(entry);
  });

  it('marks Projects as the current place on a project’s page', async () => {
    serve(() => ok({ data: PROJECTS, meta: {} }));
    render(<NavEntitlementsProvider><Rail activeId="project-home" onNav={vi.fn()} collapsed={false}
      setCollapsed={() => {}} segment="biotech" setSegment={() => {}} /></NavEntitlementsProvider>);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const rail = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(rail).getByRole('button', { name: 'Projects' }).getAttribute('aria-current')).toBe('page');
    expect(rail.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });
});

describe('⌘K finds a project', () => {
  function Harness({ onNav }: { onNav: (id: string) => void }) {
    const [open, setOpen] = React.useState(true);
    return <NavEntitlementsProvider><CmdK open={open} onClose={() => setOpen(false)} onNav={onNav} onAsk={vi.fn()} onAct={vi.fn()} /></NavEntitlementsProvider>;
  }
  const search = (term: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value: term } });

  it('by title or code, under Projects, and opens it on its page', async () => {
    serve(() => ok({ data: PROJECTS, meta: {} }));
    const onNav = vi.fn();
    render(<Harness onNav={onNav} />);
    search('c2c-101');
    const row = await screen.findByRole('button', { name: /\[Demo · Biotech\] C2C-101/ });
    expect(screen.getByText('Projects', { selector: '.cmdk-hdr' })).toBeTruthy();
    search('aud-301');
    await screen.findByRole('button', { name: /AUD-301 — IND \(audit\)/ });
    search('cama');
    fireEvent.click(await screen.findByRole('button', { name: /C2C-101/ }));
    expect(onNav).toHaveBeenCalledExactlyOnceWith('project-home');
    expect(readShellProject()).toMatchObject({ id: PROJECTS[0].id, title: PROJECTS[0].title, code: 'CAMA' });
    expect(row).toBeTruthy();
  });

  it('says a failed project read, and never reads it as no match', async () => {
    serve(() => ({ ok: false, status: 500, json: async () => ({ error: 'down' }) }) as Response);
    render(<Harness onNav={vi.fn()} />);
    search('c2c');
    await waitFor(() => expect(document.body.textContent).toContain('Projects could not be read, so none are listed here.'));
  });

  it('asks AnA in words a person knows', async () => {
    serve(() => ok({ data: [], meta: {} }));
    render(<Harness onNav={vi.fn()} />);
    search('what blocks dispatch');
    const ask = await screen.findByRole('button', { name: /Ask AnA: "what blocks dispatch"/ });
    expect(ask.textContent).not.toMatch(/gateway/i);
  });
});
