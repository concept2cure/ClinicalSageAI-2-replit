// @vitest-environment jsdom
/** Existing project plan and editor creation; HTTP replies are isolated fixtures. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';
import { publishShellProject } from '../shellProject';
import { ProjectPlan } from '../surfaces/ProjectPlan';
import { ProjectHome } from '../surfaces/ProjectHome';
import { isLaunchSurface } from '../../../../../shared/constants/launch-scope';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/services/portal/authService', async original => { const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuth: () => ({ user: actual.authService.getUser() }) }; });
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
vi.mock('../navEntitlements', async original => ({ ...await original<typeof import('../navEntitlements')>(),
  useNavEntitlements: () => ({ verdictFor: (id: string) => isLaunchSurface(id) ? null : { id, label: id, entitled: false, source: 'launch-scope', requiredTier: null },
    resolved: true, masterAdmin: false, platformAdmin: false, tier: null }) }));
const PID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DOC = '33333333-3333-4333-8333-333333333333';
const TPL = '44444444-4444-4444-8444-444444444444';
const ACTOR = { id: '7', organizationId: '12', email: 'biotech-plan@example.test', roles: ['admin'], permissions: ['governed:write'] };
const TOKEN = `fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 12 }))}.synthetic`;
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
const csr = { id: TPL, title: 'Clinical study report', name: 'Clinical study report', entryId: 'component:clinical_study_report',
  module: null, kind: 'narrative', originalFormat: 'mixed', limitations: ['Retain original appendices'],
  filingContext: { registryId: null, region: 'GLOBAL', agency: 'ICH' }, section_count: 119 };
function props(registryId = 'US_BLA', id = PID) {
  return { pid: id, prog: { id, name: 'Recorded biotech project', program_type: 'bla', primary_agency: 'FDA', registry_id: registryId },
    usInd: false, cmcComposes: false, deviceFiling: false, otherFilings: [], marketsState: 'ready' as const,
    projectId: 51, available: () => true, onNav: vi.fn(), onStage: vi.fn(), onAsk: vi.fn(), onOpenDocument: vi.fn(), team: null, tasks: null };
}
function wire() {
  apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (method === 'POST') return reply({ success: true, document: { id: DOC, ...body }, sections_seeded: 119 }, 201);
    if (url === '/api/authoring/templates') return reply({ templates: [csr], globalCatalog: 'ok' });
    if (url.startsWith('/api/authoring/docs')) return reply({ success: true, documents: [] });
    if (url.startsWith('/api/tasks')) return reply({ success: true, data: [] });
    if (url.startsWith('/api/c2c/documents?')) return reply({ documents: url.includes('scope=market') ? [] : [
      { id: 'filing-bla', doc_type: 'bla', agency: 'fda', title: 'Recorded BLA filing', status: 'draft' }] });
    if (url.endsWith('/outline')) return reply({ document: { id: 'filing-bla', doc_type: 'bla', agency: 'fda', title: 'Recorded BLA filing', status: 'draft' },
      outline: [{ key: '2.7.4', parent_key: null, label: 'Recorded clinical safety summary', mandatory: true, path_order: 1, status: 'todo' }] });
    return reply({});
  });
}
beforeEach(() => {
  clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(TOKEN, ACTOR, 'fixture-refresh', 3600); publishShellProject({ id: PID }); apiRequest.mockReset(); wire();
});
afterEach(() => { cleanup(); authService.endSession(null); clearAuthToken(); publishShellProject({ id: '' }); localStorage.clear(); sessionStorage.clear(); });

describe('US biotech filings use the existing project plan', () => {
  it.each([['US_NDA', 'NDA'], ['US_BLA', 'BLA'], ['US_351K', '351(k)'], ['US_505B2', '505(b)(2)']])('shows exact %s context and the saved filing outline', async (id, label) => {
    render(<ProjectPlan {...props(id)} />);
    await screen.findByRole('heading', { name: `What this ${label} needs` });
    expect(await screen.findByText(/Recorded clinical safety summary/)).toBeTruthy();
    expect(screen.queryByTestId('pj-plan-none')).toBeNull();
    expect(screen.getByText(/guidance.*not.*completeness|not.*legal.*checklist/i)).toBeTruthy();
  });

  it('creates the selected shared CSR template in the recorded project and opens the confirmed saved document', async () => {
    const p = props(); render(<ProjectPlan {...p} />);
    const title = await screen.findByText('Clinical study report');
    const row = title.closest('details')!; fireEvent.click(row.querySelector('summary')!);
    fireEvent.click(within(row).getByRole('button', { name: 'Create from template' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/authoring/docs',
      { title: 'Clinical study report', module: null, template_id: TPL, client_program_id: PID }, expect.any(Object)));
    await waitFor(() => expect(p.onOpenDocument).toHaveBeenCalledWith(DOC));
  });

  it('never opens an earlier project creation reply after the project changes', async () => {
    let finish!: (value: Response) => void;
    const pending = new Promise<Response>(resolve => { finish = resolve; });
    const initial = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method, url, body) => method === 'POST' ? pending : initial(method, url, body));
    const p = props(); const view = render(<ProjectPlan {...p} />);
    const row = (await screen.findByText('Clinical study report')).closest('details')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Create from template' }));
    await waitFor(() => expect(apiRequest.mock.calls.some(call => call[0] === 'POST')).toBe(true));
    act(() => publishShellProject({ id: OTHER }));
    view.rerender(<ProjectPlan {...props('US_NDA', OTHER)} />);
    await act(async () => { finish(reply({ success: true, document: { id: DOC, title: csr.title, template_id: TPL, client_program_id: PID } }, 201)); });
    expect(p.onOpenDocument).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'What this NDA needs' })).toBeTruthy();
  });

  it('retains an uncertain creation while the current working-list host refreshes', async () => {
    const initial = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method, url, body) => method === 'POST' ? Promise.resolve(reply({}, 500)) : initial(method, url, body));
    const p = props(); render(<ProjectPlan {...p} />);
    const row = (await screen.findByText('Clinical study report')).closest('details')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Create from template' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check working documents' }));
    expect(await screen.findByText(/Project working documents were read/)).toBeTruthy();
    expect(apiRequest.mock.calls.filter(call => call[0] === 'POST')).toHaveLength(1);
    expect(p.onOpenDocument).not.toHaveBeenCalled();
  });

  it('offers the exact identified document only after its record and current host are re-read', async () => {
    const initial = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method, url, body) => {
      if (method === 'POST') return Promise.resolve(reply({ ok: false, code: 'AUTHORING_CREATE_HANDOFF_UNAVAILABLE',
        creationOutcome: 'committed', retryAllowed: false, recovery: { documentId: DOC, organizationId: 12, programId: PID } }, 503));
      if (url === `/api/authoring/docs/${DOC}`) return Promise.resolve(reply({ success: true,
        document: { id: DOC, title: csr.title, client_program_id: PID, template_id: TPL } }));
      if (url.startsWith('/api/authoring/docs?')) return Promise.resolve(reply({ success: true,
        documents: [{ id: DOC, title: csr.title, program_id: PID, template_id: TPL }] }));
      return initial(method, url, body);
    });
    const p = props(); render(<ProjectPlan {...p} />);
    const row = (await screen.findByText('Clinical study report')).closest('details')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Create from template' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check working documents' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open identified document' }));
    await waitFor(() => expect(p.onOpenDocument).toHaveBeenCalledWith(DOC));
    expect(apiRequest.mock.calls.filter(call => call[0] === 'POST')).toHaveLength(1);
  });

  it('does not adopt a creation reply after the signed-in account changes', async () => {
    let finish!: (value: Response) => void;
    const pending = new Promise<Response>(resolve => { finish = resolve; });
    const initial = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method, url, body) => method === 'POST' ? pending : initial(method, url, body));
    const p = props(); render(<ProjectPlan {...p} />);
    const row = (await screen.findByText('Clinical study report')).closest('details')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Create from template' }));
    await waitFor(() => expect(apiRequest.mock.calls.some(call => call[0] === 'POST')).toBe(true));
    act(() => authService.setToken(`fixture.${btoa(JSON.stringify({ userId: 8, organizationId: 12 }))}.synthetic`,
      { ...ACTOR, id: '8', email: 'new-account@example.test' }, 'fixture-refresh-2', 3600));
    await act(async () => { finish(reply({ success: true, document: { id: DOC, title: csr.title, template_id: TPL, client_program_id: PID } }, 201)); });
    expect(p.onOpenDocument).not.toHaveBeenCalled();
  });

});

describe('project guidance belongs to the current actor', () => {
  it('retires an earlier organization template catalog immediately at the same project', async () => {
    let finish!: (value: Response) => void;
    const next = new Promise<Response>(resolve => { finish = resolve; });
    const initial = apiRequest.getMockImplementation()!;
    let reads = 0;
    apiRequest.mockImplementation((method, url, body) => url === '/api/authoring/templates'
      ? ++reads === 1 ? Promise.resolve(reply({ templates: [{ ...csr, name: 'Earlier sponsor CSR' }] })) : next : initial(method, url, body));
    render(<ProjectPlan {...props()} />);
    await screen.findByText('Earlier sponsor CSR');
    act(() => authService.setToken(`fixture.${btoa(JSON.stringify({ userId: 8, organizationId: 13 }))}.synthetic`,
      { ...ACTOR, id: '8', organizationId: '13' }, 'fixture-refresh-new-org', 3600));
    expect(screen.queryByText('Earlier sponsor CSR')).toBeNull();
    await act(async () => { finish(reply({ templates: [{ ...csr, name: 'Current sponsor CSR' }] })); });
    await screen.findByText('Current sponsor CSR');
  });

  it('retires the Project home filing before the replacement actor project read resolves', async () => {
    let finish!: (value: Response) => void;
    const next = new Promise<Response>(resolve => { finish = resolve; });
    const initial = apiRequest.getMockImplementation()!;
    let reads = 0;
    apiRequest.mockImplementation((method, url, body) => url === `/api/c2c/projects/${PID}`
      ? ++reads === 1 ? Promise.resolve(reply(props().prog)) : next : initial(method, url, body));
    publishShellProject({ id: PID, step: 'plan' });
    const element = <ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />;
    const view = render(element);
    await screen.findByRole('heading', { name: 'What this BLA needs' });
    act(() => authService.setToken(`fixture.${btoa(JSON.stringify({ userId: 8, organizationId: 12 }))}.synthetic`,
      { ...ACTOR, id: '8' }, 'fixture-refresh-next-member', 3600));
    view.rerender(<ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />);
    expect(screen.queryByRole('heading', { name: 'What this BLA needs' })).toBeNull();
    await act(async () => { finish(reply(props('US_NDA').prog)); });
    await screen.findByRole('heading', { name: 'What this NDA needs' });
  });
});
