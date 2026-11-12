// @vitest-environment jsdom
/**
 * GA-UI-27 (docs/evidence/GA-READINESS/2026-11-10): Orchestration follows the
 * project the shell has open.
 *
 * The defect: useOrchProgram took the organisation's first-ranked project
 * (portfolio attentionRanked[0]) whatever was open, so with NeuroPanel-Dx open
 * the breadcrumb said NeuroPanel and the screen read and ran workflows on
 * C2C-101. Now the open project's own portfolio row is read; an open project
 * with no row is said for itself and reads no other project's runs; with no
 * project open the lead project is used, as before.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 'test-token',
}));

import { Orchestration } from '../surfaces/Orchestration';
import { clearShellProject, publishShellProject } from '../shellProject';

const LEAD = { projectId: 301, code: 'C2C-101', name: 'C2C-101 mAb', programId: '10000000-0000-4000-8000-000000000101' };
const NEUR = { projectId: 302, code: 'NEUR', name: 'NeuroPanel-Dx 510(k)', programId: '10000000-0000-4000-8000-000000000302' };
const ORPHAN = '10000000-0000-4000-8000-000000000999';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === '/api/report-os/portfolio/org') return ok({ attentionRanked: [LEAD, NEUR] });
    if (url === '/api/orchestration/templates') return ok({ templates: [] });
    if (url.startsWith('/api/orchestration/project/')) return ok({ workflows: [] });
    if (url === '/api/orchestration/checkpoints') return ok({ data: [], meta: { count: 0 } });
    if (url.startsWith('/api/orchestration/projects/')) return ok({ overallScore: 50, status: 'at_risk', blockers: [], assessedAt: '2026-08-04T10:00:00Z' });
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  });
});
afterEach(() => { cleanup(); clearShellProject(); });

const mount = () => render(<Orchestration surface={'orchestration' as never} onAsk={() => {}} onNav={() => {}} segment="" />);
const urls = () => apiRequest.mock.calls.map((c) => String(c[1]));

describe('Orchestration follows the open project (GA-UI-27)', () => {
  it('reads the open project, not the lead one', async () => {
    publishShellProject({ id: NEUR.programId, title: 'NeuroPanel-Dx 510(k)' });
    mount();
    await waitFor(() => expect(urls()).toContain(`/api/orchestration/projects/${NEUR.projectId}/readiness`));
    expect(urls().some((u) => u.includes(`/${LEAD.projectId}`))).toBe(false);
    expect(document.body.textContent).not.toContain('C2C-101');
  });

  it('an open project with no portfolio row reads no other project, and says so', async () => {
    publishShellProject({ id: ORPHAN, title: 'Lane L7-shell orphan' });
    mount();
    // V-L7-3: only "not in the organisation's project list" was checked, so
    // only that is said; "has no orchestration record" was never checked.
    expect((await screen.findAllByText(/This project is not in the organisation's project list for orchestration/)).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('has no orchestration record');
    expect(urls().some((u) => u.startsWith('/api/orchestration/project'))).toBe(false);
  });

  it('a legacy numeric workspace id is not a project: the lead project is used', async () => {
    publishShellProject({ id: 12, title: 'BX-204' });
    mount();
    await waitFor(() => expect(urls()).toContain(`/api/orchestration/projects/${LEAD.projectId}/readiness`));
  });

  it('with no project open, the lead project is used, as before', async () => {
    mount();
    await waitFor(() => expect(urls()).toContain(`/api/orchestration/projects/${LEAD.projectId}/readiness`));
  });
});

describe('a failed project read is said as one (GA-UI-27)', () => {
  it('says the project list could not be read, not that there is no project', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/report-os/portfolio/org') return { ok: false, status: 403, json: async () => ({}), text: async () => '' };
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    });
    publishShellProject({ id: NEUR.programId, title: 'NeuroPanel-Dx 510(k)' });
    mount();
    expect((await screen.findAllByText(/The project list could not be read/)).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('No lead project is identified');
  });
});

describe('an empty project list is said as empty, not as a failed read (V-L7-2)', () => {
  const emptyList = () => apiRequest.mockImplementation(async (_m: string, url: string) => {
    // report-os answers 200 { data: null } for an organisation with no top-level projects.
    if (url === '/api/report-os/portfolio/org') return ok({ data: null });
    if (url === '/api/orchestration/templates') return ok({ templates: [] });
    if (url === '/api/orchestration/checkpoints') return ok({ data: [], meta: { count: 0 } });
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  });

  it('with no project open, keeps the no-lead-project hint', async () => {
    emptyList();
    mount();
    expect((await screen.findAllByText(/No lead project is identified/)).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('could not be read');
  });

  it('with a project open, says it is not in the list, not that the read failed', async () => {
    emptyList();
    publishShellProject({ id: NEUR.programId, title: 'NeuroPanel-Dx 510(k)' });
    mount();
    expect((await screen.findAllByText(/This project is not in the organisation's project list for orchestration/)).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('could not be read');
  });
});
