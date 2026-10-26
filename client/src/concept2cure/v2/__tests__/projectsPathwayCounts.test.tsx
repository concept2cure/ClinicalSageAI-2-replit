// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: { id: 7, firstName: 'Ada' } }) }));
vi.mock('@/utils/authToken', async original => ({
  ...(await original<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 't', getAuthHeaders: () => ({ Authorization: 'Bearer t', 'x-organization-id': '1' }),
}));
import { Projects } from '../surfaces/Projects';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import { __resetSurfaceActionBus, applySurfaceAction } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const clients = [{ id: 11, name: 'Alpha' }, { id: 12, name: 'Beta' }];
const row = (id: string, pathway: string, readiness: number | null = null) => ({
  id, title: `Project ${id}`, code: id, ws: 'MDX', pathway, stage: 'Planning',
  status: 'active', readiness, readinessState: readiness === null ? 'no_sections' : 'measured',
  lead: 'Ada', blocker: null, due: '—',
});
const counts = { total: 60, byWorkstream: { MDX: 58, Pharma: 2 }, byPathway: { pma: 20, ide: 20, other: 20 }, filingWithin60Days: 17 };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const props = () => ({ surface: { id: 'projects', label: 'Projects' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });
const figure = (label: RegExp) => Array.from(document.querySelectorAll('.pj-summary-i'))
  .find(el => label.test(el.textContent ?? ''))?.querySelector('strong')?.textContent;
function Probe({ seen }: { seen: { ctx: SurfaceContext | null } }) { seen.ctx = useActiveSurfaceContext('projects'); return null; }
beforeEach(() => {
  apiRequest.mockReset().mockImplementation(async (_method: string, path: string) => {
    const params = new URL(path, 'http://local').searchParams;
    const filtered = params.get('pathway') === 'pma';
    return ok({ data: filtered ? [row('PMA', 'pma', 40)] : [row('IDE', 'ide', 40), row('Other', 'other')],
      meta: { count: filtered ? 1 : 2, hasMore: true, clients,
        counts: { ...counts, total: filtered ? 20 : 60, filingWithin60Days: filtered ? 9 : 17 } } });
  });
});
afterEach(() => { cleanup(); __resetSurfaceActionBus(); });

describe('Projects full-portfolio counts and server pathway filters', () => {
  it('uses server totals beyond the page and keeps readiness and search page bounded', async () => {
    const seen = { ctx: null as SurfaceContext | null };
    render(<><Projects {...props()} /><Probe seen={seen} /></>);
    await screen.findByText('Project IDE');
    expect(figure(/active projects/i)).toBe('60');
    expect(figure(/filing < 60 days/i)).toBe('17');
    expect(figure(/average readiness/i)).toBe('40%');
    expect(screen.getByRole('button', { name: 'MDX 58' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'PMA 20' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Other 20' })).toBeTruthy();
    expect(screen.getByText(/Showing the first 2 projects/).textContent).toMatch(/readiness.*search.*these only/i);
    await waitFor(() => expect(seen.ctx?.facts?.totalPrograms).toBe(60));
    expect(seen.ctx?.summary).not.toMatch(/every figure.*first 2/);
    expect(seen.ctx?.facts?.readinessPageCount).toBe(2);
  });

  it('requests workstream and pathway on the server, retaining the Client filter', async () => {
    render(<Projects {...props()} />);
    fireEvent.change(await screen.findByRole('combobox', { name: 'Client' }), { target: { value: '11' } });
    fireEvent.click(await screen.findByRole('button', { name: 'MDX 58' }));
    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith('GET', '/api/c2c/projects?clientWorkspaceId=11&ws=MDX'));
    fireEvent.click(screen.getByRole('button', { name: 'PMA 20' }));
    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith('GET', '/api/c2c/projects?clientWorkspaceId=11&ws=MDX&pathway=pma'));
    expect(await screen.findByText('Project PMA')).toBeTruthy();
    expect(screen.queryByText('Project IDE')).toBeNull();
    expect(figure(/active projects/i)).toBe('20');
    fireEvent.click(screen.getByRole('button', { name: 'All pathways 60' }));
    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith('GET', '/api/c2c/projects?clientWorkspaceId=11&ws=MDX'));
  });

  it('applies the same pathway through the existing surface action and rejects unknown keys', async () => {
    render(<Projects {...props()} />);
    await screen.findByText('Project IDE');
    const action = resolveSurfaceAction('projects.filter', { workstream: 'MDX', pathway: 'pma' });
    expect(action.ok).toBe(true);
    if (!action.ok) throw new Error(action.error);
    act(() => { expect(applySurfaceAction(action.directive, vi.fn()).status).toBe('applied'); });
    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith('GET', '/api/c2c/projects?ws=MDX&pathway=pma'));
    expect(resolveSurfaceAction('projects.filter', { pathway: 'made_up' }).ok).toBe(false);
  });

  it('keeps a failed filtered read distinct from an empty portfolio and allows clearing', async () => {
    render(<Projects {...props()} />);
    await screen.findByText('Project IDE');
    apiRequest.mockImplementation(async () => ({ ok: false, status: 503, json: async () => ({ error: 'Read failed' }) }));
    fireEvent.click(screen.getByRole('button', { name: 'PMA 20' }));
    expect(await screen.findByText("Couldn't load the project portfolio")).toBeTruthy();
    expect(figure(/active projects/i)).toBe('—');
    expect(screen.queryByText('No projects yet')).toBeNull();
    expect(screen.getByRole('button', { name: /^All pathways/ })).toBeTruthy();
  });

  it('does not call an empty pathway result a new organization', async () => {
    render(<Projects {...props()} />);
    await screen.findByText('Project IDE');
    apiRequest.mockImplementation(async () => ok({ data: [], meta: { counts: { ...counts, total: 0 }, clients } }));
    fireEvent.click(screen.getByRole('button', { name: 'PMA 20' }));
    expect(await screen.findByText('No projects match these filters')).toBeTruthy();
    expect(screen.queryByText('No projects yet')).toBeNull();
  });

  it('keeps a selected page status clearable when a server filter returns different statuses', async () => {
    apiRequest.mockImplementation(async (_method: string, path: string) => ok({
      data: path.includes('pathway=pma') ? [row('PMA', 'pma')] : [row('IDE', 'ide'), { ...row('Blocked', 'pma'), status: 'blocked' }],
      meta: { counts },
    }));
    render(<Projects {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Blocked' }));
    fireEvent.click(screen.getByRole('button', { name: 'PMA 20' }));
    await screen.findByText('No projects match these filters');
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(await screen.findByText('Project PMA')).toBeTruthy();
  });
});
