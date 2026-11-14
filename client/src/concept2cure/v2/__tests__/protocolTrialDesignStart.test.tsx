// @vitest-environment jsdom
/** The existing governed protocol start continues once into its clinical trial design UI. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ api: vi.fn(), session: 0 }));
vi.mock('@/lib/queryClient', async original => ({
  ...await original<typeof import('@/lib/queryClient')>(), apiRequest: h.api,
}));
vi.mock('../editor/authoringCurrentRead', async original => ({
  ...await original<typeof import('../editor/authoringCurrentRead')>(),
  captureAuthoringSession: () => { const session = h.session; return { sameRevision: () => session === h.session }; },
}));

import { ProtocolWorkspace } from '../surfaces/ProtocolDev';
import { clearShellProject, publishShellProject } from '../shellProject';
import { clearNavParams, stashNavParamsForTarget } from '../navParams';
import { __resetSurfaceActionBus } from '../surfaceActions';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const REASON = 'Establish the governed clinical trial design';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const refused = () => ({ ok: false, status: 503, json: async () => ({ error: { message: 'Protocol service unavailable' } }) }) as Response;
function document(id = '99', kind = 'clinical', programId: string | null = PROGRAM) {
  return { id, programId, title: `Protocol ${id}`, shortTitle: `P-${id}`, kind, version: '0.1', status: 'draft',
    sponsor: '', pi: '', updated: '2026-11-14', completeness: 0, openSection: '', sections: [], content: {}, objectives: [],
    eligibility: { inclusion: [], exclusion: [] }, soa: { visits: [], assessments: [], cells: {}, issues: [] },
    risks: [], milestones: [], budget: { params: null, items: [], summary: null }, amendments: [], deviations: [],
    reviews: [], reviewComments: [], consent: [], completenessFindings: [], studyDesign: null };
}
let rows: ReturnType<typeof document>[];
let created: ReturnType<typeof document>;
let post: () => Promise<Response>;
let readProgram: string | null | undefined;
let readGate: ReturnType<typeof deferred> | null;

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ProtocolWorkspace surface={{ id: 'protocol-dev' } as never}
    onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" /></QueryClientProvider>);
}
async function start(kind?: string) {
  fireEvent.click(await screen.findByRole('button', { name: /^Start (?:a protocol|study & protocol design)$/i }));
  const form = within(await screen.findByRole('region', { name: 'Start a protocol' }));
  fireEvent.change(form.getByLabelText(/Protocol title/), { target: { value: 'New trial protocol' } });
  if (kind) fireEvent.click(form.getByRole('radio', { name: kind }));
  fireEvent.change(form.getByLabelText(/Reason for change/), { target: { value: REASON } });
  fireEvent.click(form.getByRole('button', { name: 'Start protocol' }));
}
const designTab = () => screen.getByRole('tab', { name: /Study design/ });
const documentTab = () => screen.getByRole('tab', { name: /^Document$/ });
async function expectDesign() {
  await waitFor(() => expect(designTab().getAttribute('aria-selected')).toBe('true'));
  expect(screen.getByRole('button', { name: 'Create a study design' })).toBeTruthy();
}
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  clearNavParams(); h.session = 0; rows = []; created = document(); readProgram = undefined; readGate = null;
  window.history.replaceState({}, '', '/concept2cure/protocol-dev');
  publishShellProject({ id: PROGRAM, title: 'Synthetic trial project' });
  post = async () => ok({ id: 99, sectionsSeeded: 12 });
  h.api.mockReset().mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (method === 'GET' && url.startsWith('/api/protocol-dev?')) {
      const query = new URL(url, 'http://localhost').searchParams;
      const scope = query.get('programId');
      const scoped = rows.filter(row => !scope || (scope === 'unfiled' ? row.programId === null : row.programId === scope));
      const selected = query.get('documentId');
      const data = (selected ? scoped.filter(row => row.id === selected) : scoped).map(row => ({ ...row,
        ...(selected && readProgram !== undefined ? { programId: readProgram } : {}) }));
      if (selected === '99' && data.length && readGate) return readGate.promise;
      return ok({ data });
    }
    if (method === 'POST' && url === '/api/protocol-development/documents') {
      expect(body).toMatchObject({ programId: PROGRAM, reason: REASON, title: 'New trial protocol' });
      const response = await post();
      if (response.ok) rows.push(created);
      return response;
    }
    return ok({});
  });
});
afterEach(() => { cleanup(); clearNavParams(); clearShellProject(); __resetSurfaceActionBus(); window.history.replaceState({}, '', '/'); });

describe('clinical trial design begins in the existing combined workflow', () => {
  it('names the combined start and describes the clinical trial inputs before a protocol exists', async () => {
    mount();
    expect(await screen.findByRole('button', { name: 'Start study & protocol design' })).toBeTruthy();
    expect(screen.getByText(/clinical trial design/i)).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Study design/ })).toBeNull();
    expect(h.api.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
  it.each(['project', 'all', 'unfiled'])('continues a confirmed new clinical protocol into Study design from %s scope', async scope => {
    if (scope !== 'project') window.history.replaceState({}, '', `/concept2cure/protocol-dev?protocolScope=${scope}`);
    mount(); await start(); await expectDesign();
    expect(new URL(window.location.href).searchParams.get('protocol')).toBe('99');
    expect((screen.getByRole('combobox', { name: 'Protocol scope' }) as HTMLSelectElement).value).toBe(PROGRAM);
    expect(h.api.mock.calls.filter(([method]) => method !== 'GET')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Create a study design' }));
    const form = within(await screen.findByRole('region', { name: 'Create a study design' }));
    expect(form.getByLabelText(/Primary objective/)).toBeTruthy();
    expect(form.getByLabelText(/Primary endpoint name/)).toBeTruthy();
    expect(form.getByLabelText(/Target population/)).toBeTruthy();
  });
  it('consumes the start once; manual tab choice, refetch and later protocol selection do not replay it', async () => {
    rows = [document('41')]; mount(); await start(); await expectDesign();
    fireEvent.click(documentTab());
    expect(documentTab().getAttribute('aria-selected')).toBe('true');
    fireEvent.change(screen.getByRole('combobox', { name: 'Protocol document' }), { target: { value: '41' } });
    await screen.findByRole('heading', { name: 'Protocol 41' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Protocol document' }), { target: { value: '99' } });
    await screen.findByRole('heading', { name: 'Protocol 99' });
    expect(documentTab().getAttribute('aria-selected')).toBe('true');
  });
  it('keeps existing clinical protocols on their established Document default', async () => {
    rows = [document('41')]; mount(); await screen.findByRole('heading', { name: 'Protocol 41' });
    expect(documentTab().getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: 'Start a protocol' })).toBeTruthy();
  });
  it('does not treat a newly created nonclinical protocol as a clinical study start', async () => {
    created = document('99', 'iacuc'); mount(); await start('iacuc'); await screen.findByRole('heading', { name: 'Protocol 99' });
    expect(documentTab().getAttribute('aria-selected')).toBe('true');
    expect(h.api.mock.calls.find(([method]) => method === 'POST')?.[2]).toMatchObject({ protocolKind: 'iacuc' });
  });
  it('does not auto-open design for a read-back whose recorded project differs', async () => {
    readProgram = OTHER; mount(); await start(); await screen.findByRole('heading', { name: 'Protocol 99' });
    expect(documentTab().getAttribute('aria-selected')).toBe('true');
  });
});

describe('a protocol creation continuation belongs to its initiating visit', () => {
  it.each(['account change', 'project A to B to A', 'unmount'])('ignores a late success after %s before changing URL or selection', async change => {
    const pending = deferred(); post = () => pending.promise;
    const view = mount(); await start();
    await waitFor(() => expect(h.api.mock.calls.some(([method]) => method === 'POST')).toBe(true));
    if (change === 'account change') h.session += 1;
    if (change === 'project A to B to A') act(() => { publishShellProject({ id: OTHER }); publishShellProject({ id: PROGRAM }); });
    if (change === 'unmount') view.unmount();
    await act(async () => { pending.resolve(ok({ id: 99 })); await pending.promise; });
    expect(new URL(window.location.href).searchParams.get('protocol')).toBeNull();
    expect(h.api.mock.calls.some(([, url]) => String(url).includes('documentId=99'))).toBe(false);
  });
  it('does not arm a design continuation when protocol creation is refused', async () => {
    post = async () => refused(); mount(); await start();
    expect(await screen.findByText(/Protocol service unavailable/)).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull(); expect(new URL(window.location.href).searchParams.get('protocol')).toBeNull();
  });
  it.each([{}, { id: 0 }, { id: '99' }, { id: Number.MAX_SAFE_INTEGER + 1 }])('keeps an unconfirmed receipt %j from selecting a protocol', async receipt => {
    post = async () => ok(receipt); mount(); await start();
    expect(await screen.findByText(/server did not confirm a protocol id/)).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull(); expect(new URL(window.location.href).searchParams.get('protocol')).toBeNull();
  });
  it('does not substitute an indexed document when the confirmed id cannot be read', async () => {
    created = document('100'); mount(); await start();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('selected protocol is unavailable'));
    expect(screen.queryByRole('tab')).toBeNull();
  });
  it('keeps an accepted incoming protocol handoff authoritative after the clinical start', async () => {
    rows = [document('41')]; mount(); await start(); await expectDesign();
    act(() => stashNavParamsForTarget('protocol-dev', { protocol: '41' }));
    await screen.findByRole('heading', { name: 'Protocol 41' });
    expect(documentTab().getAttribute('aria-selected')).toBe('true');
  });
  it.each(['unchanged visit', 'account change', 'project A to B to A', 'manual protocol handoff'])('checks %s again between POST confirmation and selected-document read-back', async change => {
    rows = [document('41')]; const pending = deferred(); readGate = pending;
    mount(); await start();
    await waitFor(() => expect(h.api.mock.calls.some(([, url]) => String(url).includes('documentId=99'))).toBe(true));
    if (change === 'account change') h.session += 1;
    if (change === 'project A to B to A') act(() => { publishShellProject({ id: OTHER }); publishShellProject({ id: PROGRAM }); });
    if (change === 'manual protocol handoff') {
      act(() => stashNavParamsForTarget('protocol-dev', { protocol: '41', protocolScope: 'all' }));
      await screen.findByRole('heading', { name: 'Protocol 41' });
    }
    await act(async () => { pending.resolve(ok({ data: [created] })); await pending.promise; });
    if (change === 'unchanged visit') { await expectDesign(); return; }
    if (change === 'manual protocol handoff') {
      fireEvent.change(screen.getByRole('combobox', { name: 'Protocol document' }), { target: { value: '99' } });
    }
    await screen.findByRole('heading', { name: 'Protocol 99' });
    expect(documentTab().getAttribute('aria-selected')).toBe('true');
  });
});
