// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { ProtocolWorkspace } from '../surfaces/ProtocolDev';
import { initialStudyDesign } from '../surfaces/ProtocolDevCreateDesign';
import { clearShellProject, publishShellProject } from '../shellProject';
import { clearNavParams, stashNavParamsForTarget } from '../navParams';
import { validateDesign } from '../../../../../server/services/study-design/design-validation';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const REASON = 'Establishing the initial governed study design';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const fail = () => ({ ok: false, status: 503, json: async () => ({ error: { message: 'Link service unavailable' } }) }) as Response;
function document(id = '41', programId: string | null = PROGRAM) {
  return { id, programId, title: `Protocol ${id}`, shortTitle: `P-${id}`, kind: 'clinical', version: '0.1', status: 'draft',
    sponsor: '', pi: '', updated: '2026-10-14', completeness: 0, openSection: '', sections: [], content: {}, objectives: [],
    eligibility: { inclusion: [], exclusion: [] }, soa: { visits: [], assessments: [], cells: {}, issues: [] },
    risks: [], milestones: [], budget: { params: null, items: [], summary: null }, amendments: [], deviations: [], reviews: [], consent: [],
    completenessFindings: [], studyDesign: null };
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ProtocolWorkspace surface={{ id: 'protocol-dev' } as never}
    onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" /></QueryClientProvider>);
}
function routeProtocol(rows: ReturnType<typeof document>[], post?: (url: string, body: Record<string, unknown>) => Response) {
  apiRequest.mockImplementation(async (method: string, url: string, body: Record<string, unknown>) => {
    if (method === 'GET' && url.startsWith('/api/protocol-dev')) {
      const query = new URL(url, 'http://localhost').searchParams;
      const scope = query.get('programId');
      const scoped = rows.filter((row) => !scope || (scope === 'unfiled' ? row.programId === null : row.programId === scope));
      return ok({ data: query.has('documentId') ? scoped.filter((row) => row.id === query.get('documentId')) : scoped });
    }
    return post?.(url, body) || ok({});
  });
}
const values = { title: 'Initial dose-ranging design', phase: '2', indication: 'Psoriasis', objective: 'Assess efficacy',
  endpointName: 'PASI change', endpointType: 'continuous', endpointDefinition: 'Change from baseline in PASI',
  timepoint: 'Week 12', population: 'Adults with plaque psoriasis', inferentialFrame: 'superiority',
  structuralDesign: 'parallel_group', controlType: 'placebo', intervention: 'Drug X', reason: REASON };
async function completeDesign() {
  const form = within(await screen.findByRole('dialog'));
  for (const [label, value] of Object.entries({ 'Study design title': values.title, Phase: values.phase, Indication: values.indication,
    'Primary objective': values.objective, 'Primary endpoint name': values.endpointName, 'Endpoint type': values.endpointType,
    'Endpoint definition': values.endpointDefinition, 'Endpoint timepoint': values.timepoint, 'Target population': values.population,
    'Inferential framework': values.inferentialFrame, 'Study structure': values.structuralDesign, 'Control type': values.controlType,
    'Investigational intervention': values.intervention, 'Reason for change': REASON })) {
    fireEvent.change(form.getByLabelText(new RegExp(label)), { target: { value } });
  }
  fireEvent.click(form.getByRole('button', { name: 'Create and bind design' }));
}
beforeEach(() => {
  apiRequest.mockReset(); window.history.replaceState({}, '', '/concept2cure/protocol-dev');
  publishShellProject({ id: PROGRAM, title: 'Open program' });
});
afterEach(() => { cleanup(); clearNavParams(); clearShellProject(); window.history.replaceState({}, '', '/'); });

describe('Protocol F09/F11 completion', () => {
  it('selects an older document by id and stays there when another document becomes newest after a write', async () => {
    const rows = [document(), document('1')];
    routeProtocol(rows, () => { rows.reverse(); return ok({ id: 1 }); });
    const { container } = mount();
    const selector = await screen.findByRole('combobox', { name: 'Protocol document' });
    fireEvent.change(selector, { target: { value: '1' } });
    await waitFor(() => expect(container.querySelector('.pd-title')?.textContent).toBe('Protocol 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit sponsor and principal investigator' }));
    const form = within(await screen.findByRole('dialog'));
    fireEvent.change(form.getByLabelText(/Sponsor/), { target: { value: 'Sponsor A' } });
    fireEvent.change(form.getByLabelText(/Reason for change/), { target: { value: REASON } });
    fireEvent.click(form.getByRole('button', { name: 'Save cover page' }));
    await waitFor(() => expect(apiRequest.mock.calls.filter(([method]) => method === 'POST' || method === 'PATCH')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(container.querySelector('.pd-title')?.textContent).toBe('Protocol 1');
    expect((screen.getByRole('combobox', { name: 'Protocol document' }) as HTMLSelectElement).value).toBe('1');
    expect(apiRequest.mock.calls.some(([, url]) => String(url).includes('documentId=1'))).toBe(true);
  });

  it('keeps an always-create affordance, creates under the actual program UUID and opens its returned id', async () => {
    const rows = [document()];
    routeProtocol(rows, (url, body) => {
      expect(url).toBe('/api/protocol-development/documents');
      expect(body).toMatchObject({ programId: PROGRAM, title: 'New protocol', reason: REASON });
      rows.push({ ...document('99'), title: 'New protocol' }); return ok({ id: 99, sectionsSeeded: 12 });
    });
    const { container } = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a protocol' }));
    const form = within(await screen.findByRole('dialog'));
    fireEvent.change(form.getByLabelText(/Protocol title/), { target: { value: 'New protocol' } });
    fireEvent.change(form.getByLabelText(/Reason for change/), { target: { value: REASON } });
    fireEvent.click(form.getByRole('button', { name: 'Start protocol' }));
    await waitFor(() => expect(container.querySelector('.pd-title')?.textContent).toBe('New protocol'));
    expect(new URLSearchParams(window.location.search).get('protocol')).toBe('99');
  });

  it('filters open program protocols and makes legacy unfiled protocols explicitly selectable', async () => {
    routeProtocol([document(), document('42', OTHER), document('1', null)]);
    const { container } = mount();
    const selector = await screen.findByRole('combobox', { name: 'Protocol document' });
    expect(within(selector).getAllByRole('option')).toHaveLength(1);
    fireEvent.change(screen.getByRole('combobox', { name: 'Protocol scope' }), { target: { value: 'unfiled' } });
    await waitFor(() => expect(container.querySelector('.pd-title')?.textContent).toBe('Protocol 1'));
    expect(screen.getByText(/It has no recorded program association/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Study design/ }));
    expect((screen.getByRole('button', { name: 'Create a study design' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('restores an explicitly unfiled notification/deep link without switching to the open program newest protocol', async () => {
    window.history.replaceState({}, '', '/concept2cure/protocol-dev?protocol=1&protocolScope=unfiled');
    routeProtocol([document(), document('1', null)]);
    const { container } = mount();
    await waitFor(() => expect(container.querySelector('.pd-title')?.textContent).toBe('Protocol 1'));
    expect((screen.getByRole('combobox', { name: 'Protocol scope' }) as HTMLSelectElement).value).toBe('unfiled');
  });

  it('consumes a notification for another protocol while already mounted, and keeps an unavailable exact id honest', async () => {
    routeProtocol([document(), document('1', null)]); const { container } = mount();
    await waitFor(() => expect(container.querySelector('.pd-title')?.textContent).toBe('Protocol 41'));
    stashNavParamsForTarget('protocol-dev', { protocol: '1', protocolScope: 'unfiled' });
    await waitFor(() => expect(container.querySelector('.pd-title')?.textContent).toBe('Protocol 1'));
    stashNavParamsForTarget('protocol-dev', { protocol: '999', protocolScope: 'unfiled' });
    expect(await screen.findByText(/selected protocol is unavailable/)).toBeTruthy();
    expect(container.querySelector('.pd-title')).toBeNull();
  });

  it('explicitly files an unfiled protocol in the open program, consumes confirmation and reopens its id in program scope', async () => {
    const rows = [document('1', null)];
    routeProtocol(rows, (url, body) => {
      expect(url).toBe('/api/protocol-development/documents/1/program');
      expect(body).toEqual({ programId: PROGRAM, reason: REASON });
      rows[0].programId = PROGRAM; return ok({ id: 1, programId: PROGRAM });
    });
    const { container } = mount();
    fireEvent.change(await screen.findByRole('combobox', { name: 'Protocol scope' }), { target: { value: 'unfiled' } });
    fireEvent.click(await screen.findByRole('button', { name: 'File protocol in open program' }));
    const form = within(await screen.findByRole('dialog'));
    fireEvent.change(form.getByLabelText(/Reason for change/), { target: { value: REASON } });
    fireEvent.click(form.getByRole('button', { name: 'File protocol' }));
    await waitFor(() => expect(container.querySelector('.pd-title')?.textContent).toBe('Protocol 1'));
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Protocol scope' }) as HTMLSelectElement).value).toBe(PROGRAM));
    expect(screen.queryByText(/It has no recorded program association/)).toBeNull();
  });

  it('requires a program for new protocols and leaves existing organization protocols readable', async () => {
    clearShellProject(); routeProtocol([document('1', null)]); mount();
    const start = await screen.findByRole('button', { name: 'Start a protocol' });
    expect((start as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('combobox', { name: 'Protocol document' })).toBeTruthy();
    fireEvent.click(start); expect(screen.queryByRole('dialog')).toBeNull();
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(0);
  });
});

describe("Protocol F09/F11 completion — recovery", () => {

  it('persists the first design through the canonical API, then binds its server id with the governed reason', async () => {
    routeProtocol([document()]); mount();
    fireEvent.click(await screen.findByRole('tab', { name: /Study design/ }));
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET') return ok({ data: [document()] });
      return ok(url === '/api/study-design/persist' ? { studyId: 'sd_first', validation: { blocksApproval: true } } : { studyDesignId: 'sd_first' });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create a study design' })); await completeDesign();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const writes = apiRequest.mock.calls.filter(([method]) => method === 'POST');
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual(['POST', '/api/study-design/persist', { design: initialStudyDesign(values, PROGRAM), reason: REASON }]);
    expect(writes[1]).toEqual(['POST', '/api/protocol-development/documents/41/study-design', { studyDesignId: 'sd_first', reason: REASON }]);
    const report = validateDesign(initialStudyDesign(values, PROGRAM));
    expect(report.blocksApproval).toBe(true);
    expect(report.findings.some((finding) => finding.code === 'EST-001')).toBe(true);
    expect(initialStudyDesign(values, PROGRAM).statisticalPlan).toEqual({ plannedAnalyses: [] });
  });

  it('reports persisted-but-unbound failure and retries the link without a duplicate persist', async () => {
    routeProtocol([document()]); mount();
    fireEvent.click(await screen.findByRole('tab', { name: /Study design/ }));
    let bindings = 0;
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET') return ok({ data: [document()] });
      if (url === '/api/study-design/persist') return ok({ studyId: 'sd_saved' });
      return ++bindings === 1 ? fail() : ok({ studyDesignId: 'sd_saved' });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create a study design' })); await completeDesign();
    const form = within(await screen.findByRole('dialog', { name: 'Bind saved study design' }));
    expect(await form.findByText(/sd_saved was saved.*Binding to this protocol failed/)).toBeTruthy();
    fireEvent.click(form.getByRole('button', { name: 'Retry binding' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(apiRequest.mock.calls.filter(([method, url]) => method === 'POST' && url === '/api/study-design/persist')).toHaveLength(1);
    expect(apiRequest.mock.calls.filter(([method, url]) => method === 'POST' && url.endsWith('/41/study-design'))).toHaveLength(2);
  });

  it('does not offer blind creation retry when the save outcome cannot be confirmed', async () => {
    routeProtocol([document()]); mount(); fireEvent.click(await screen.findByRole('tab', { name: /Study design/ }));
    apiRequest.mockImplementation(async (method: string) => method === 'GET' ? ok({ data: [document()] }) : ok({ validation: {} }));
    fireEvent.click(screen.getByRole('button', { name: 'Create a study design' })); await completeDesign();
    const form = within(await screen.findByRole('dialog', { name: 'Check persisted study designs' }));
    expect(form.queryByRole('button', { name: 'Create and bind design' })).toBeNull();
    expect(form.getByText(/The save outcome is unknown/)).toBeTruthy();
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1);
  });

  it.each(['response', 'thrown'] as const)('uses canonical user copy for a confirmed creation refusal (%s)', async (mode) => {
    routeProtocol([document()]); mount(); fireEvent.click(await screen.findByRole('tab', { name: /Study design/ }));
    apiRequest.mockImplementation(async (method: string) => {
      if (method === 'GET') return ok({ data: [document()] });
      const payload = { error: 'PROGRAM_ACCESS_DENIED', message: 'Current program management permission is required.' };
      if (mode === 'thrown') throw Object.assign(new Error('PROGRAM_ACCESS_DENIED'), { name: 'ApiRequestError', status: 403, payload });
      return { ok: false, status: 403, json: async () => payload } as Response;
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create a study design' })); await completeDesign();
    const form = within(await screen.findByRole('dialog', { name: 'Create a study design' }));
    expect(await form.findByText(/Current program management permission is required/)).toBeTruthy();
    expect(form.queryByText(/PROGRAM_ACCESS_DENIED/)).toBeNull();
    expect(form.getByRole('button', { name: 'Create and bind design' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Check persisted study designs' })).toBeNull();
  });

  it('keeps persisted-only binding recovery while suppressing driver details and enum error codes', async () => {
    routeProtocol([document()]); mount(); fireEvent.click(await screen.findByRole('tab', { name: /Study design/ }));
    let bindings = 0;
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET') return ok({ data: [document()] });
      if (url === '/api/study-design/persist') return ok({ studyId: 'sd_saved' });
      if (++bindings > 1) return ok({ studyDesignId: 'sd_saved' });
      return { ok: false, status: 500, json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'relation "protocol_documents" does not exist' } }) } as Response;
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create a study design' })); await completeDesign();
    const form = within(await screen.findByRole('dialog', { name: 'Bind saved study design' }));
    expect(await form.findByText(/sd_saved was saved.*Binding to this protocol failed/)).toBeTruthy();
    expect(form.queryByText(/relation "protocol_documents"/)).toBeNull(); expect(form.queryByText(/INTERNAL_ERROR/)).toBeNull();
    fireEvent.click(form.getByRole('button', { name: 'Retry binding' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(apiRequest.mock.calls.filter(([method, url]) => method === 'POST' && url === '/api/study-design/persist')).toHaveLength(1);
  });

  it('shows canonical program filing refusal copy and retains the drawer for a safe retry', async () => {
    routeProtocol([document('1', null)], () => ({ ok: false, status: 403, json: async () => ({ error: 'PROGRAM_ACCESS_DENIED', message: 'Current program management permission is required.' }) }) as Response);
    mount();
    fireEvent.change(await screen.findByRole('combobox', { name: 'Protocol scope' }), { target: { value: 'unfiled' } });
    fireEvent.click(await screen.findByRole('button', { name: 'File protocol in open program' }));
    const form = within(await screen.findByRole('dialog'));
    fireEvent.change(form.getByLabelText(/Reason for change/), { target: { value: REASON } });
    fireEvent.click(form.getByRole('button', { name: 'File protocol' }));
    expect(await form.findByText('Current program management permission is required.')).toBeTruthy();
    expect(form.queryByText(/PROGRAM_ACCESS_DENIED/)).toBeNull();
    expect(form.getByRole('button', { name: 'File protocol' })).toBeTruthy();
  });
});
