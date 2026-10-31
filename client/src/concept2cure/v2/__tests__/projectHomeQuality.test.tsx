// @vitest-environment jsdom
/**
 * A project's quality records, from its Review step (QP2 of
 * docs/design/QMS_IN_PROJECTS_2026-10-30.md; founder, 2026-10-30: "a selection
 * from within Projects"). CAPAs belong to a project; change controls,
 * nonconforming product and controlled documents name the project they were
 * filed under or authored in. Each is read by the project (`program_id`) and
 * shown as a count with its own failure: a read that failed is said, never 0.
 * The door opens Quality. Rendered through the real ProjectHome, as the RBM
 * door's test does (projectHomeRbmDoor.test.tsx).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { seedCompanySession, endCompanySession } from './_company-session-fixture';

const h = vi.hoisted(() => ({ request: vi.fn(), available: true, fail: new Set<string>() }));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: h.request }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuth: () => ({ user: actual.authService.getUser() }), useAuthUser: () => actual.authService.getUser() };
});
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ currentOrganization: null, currentClientWorkspace: null }) }));
vi.mock('../surfaceAvailable', () => ({ useSurfaceAvailable: () => (id: string) => id !== 'quality' || h.available }));
vi.mock('../editor/ProjectFilesPanel', () => ({ ProjectFilesPanel: () => <p>Existing project files</p> }));

import { ProjectHome } from '../surfaces/ProjectHome';
import { clearShellProject, publishShellProject } from '../shellProject';
import { clearNavParams } from '../navParams';
import { __resetSurfaceActionBus } from '../surfaceActions';
import { STEP_DOORS } from '../projectDoors';

const A = '11111111-1111-4111-8111-111111111111';
const props = { surface: { id: 'project-home', label: 'Project home' } as never, segment: 'pharma', onAsk: vi.fn() };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const READS: Record<string, unknown> = {
  [`/api/capa-mdr/capa?program_id=${A}&open_only=true`]: { rows: [{ id: 'c1' }, { id: 'c2' }], count: 2 },
  [`/api/mdx/qms/changes?program_id=${A}`]: { data: [{ id: 1, status: 'proposed' }, { id: 2, status: 'in_implementation' }, { id: 3, status: 'closed' }, { id: 4, status: 'rejected' }] },
  [`/api/mdx/qms/nonconforming?program_id=${A}`]: { data: [{ id: 1, disposition: null }, { id: 2, disposition: 'scrap' }] },
  [`/api/mdx/qms/documents?program_id=${A}`]: { data: [{ id: 1, status: 'effective' }, { id: 2, status: 'in_review' }, { id: 3, status: 'draft' }, { id: 4, status: 'draft' }] },
};
beforeEach(() => {
  seedCompanySession({ organizationId: '7' }); h.available = true; h.fail = new Set();
  clearNavParams(); __resetSurfaceActionBus(); clearShellProject(); publishShellProject({ id: A, title: 'Actual project', step: 'review' });
  h.request.mockReset().mockImplementation(async (_method: string, path: string) => {
    if (path === `/api/c2c/projects/${A}`) return json({ id: A, name: 'Actual project', program_type: 'IND', product_type: 'drug', primary_agency: 'FDA', status: 'active' });
    if (h.fail.has(path)) throw new Error('The quality service did not answer.');
    if (path in READS) return json(READS[path]);
    if (path.startsWith('/api/authoring/docs')) return json({ documents: [] });
    if (path.startsWith('/api/chat/threads')) return json({ threads: [] });
    return json({});
  });
});
afterEach(() => { cleanup(); endCompanySession(); clearShellProject(); clearNavParams(); __resetSurfaceActionBus(); });

const section = async () => screen.findByRole('region', { name: 'Quality' });
const valueOf = async (label: string) => {
  const term = await within(await section()).findByText(label);
  return term.closest('div')?.querySelector('dd')?.textContent;
};

describe("a project's quality records on its Review step", () => {
  it("counts this project's open CAPAs, open change controls, undispositioned product and its documents by status", async () => {
    render(<ProjectHome {...props} onNav={vi.fn()} />);
    expect(await valueOf('Open CAPAs')).toBe('2');
    expect(await valueOf('Open change controls')).toBe('2');
    expect(await valueOf('Nonconforming product awaiting disposition')).toBe('1');
    expect(await valueOf('Controlled documents authored here')).toBe('1 effective · 1 in review · 2 draft');
    for (const path of Object.keys(READS)) expect(h.request).toHaveBeenCalledWith('GET', path);
  });

  it('says a read failed, for that record only, and never shows it as 0', async () => {
    h.fail.add(`/api/mdx/qms/changes?program_id=${A}`);
    render(<ProjectHome {...props} onNav={vi.fn()} />);
    expect(await valueOf('Open CAPAs')).toBe('2');
    expect(await valueOf('Open change controls')).toBe('Could not be read');
    h.fail.clear();
    fireEvent.click(within(await section()).getByRole('button', { name: 'Try again' }));
    await waitFor(async () => expect(await valueOf('Open change controls')).toBe('2'));
  });

  it('opens Quality from its door', async () => {
    const onNav = vi.fn();
    render(<ProjectHome {...props} onNav={onNav} />);
    fireEvent.click(within(await section()).getByRole('button', { name: new RegExp(STEP_DOORS.quality) }));
    expect(onNav).toHaveBeenCalledExactlyOnceWith('quality');
  });

  it('is not offered when Quality is not in this release', async () => {
    h.available = false;
    render(<ProjectHome {...props} onNav={vi.fn()} />);
    await screen.findByRole('heading', { level: 2, name: 'Reviews' });
    expect(screen.queryByRole('region', { name: 'Quality' })).toBeNull();
    expect(h.request.mock.calls.filter(([, path]) => String(path) in READS), 'and nothing of Quality is read').toEqual([]);
  });
});
