// @vitest-environment jsdom
/** Protocol-level selection must preserve pending work just as the internal guide does. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({
  ...await original<typeof import('@/lib/queryClient')>(), apiRequest,
}));

import { ProtocolWorkspace } from '../surfaces/ProtocolDev';
import { __resetSurfaceActionBus } from '../surfaceActions';
import { clearNavParams, stashNavParamsForTarget, surfaceLeaveRefusal } from '../navParams';

const PID = '5b2d7c11-2222-4333-8444-555566667777';
const REFUSAL = 'Save the pending section changes before switching work.';
const DOC = {
  id: '41', programId: PID, title: 'Dose-ranging study', shortTitle: 'BX-410-201', kind: 'clinical',
  version: '0.7', status: 'draft', sponsor: 'Sponsor', pi: 'PI', updated: '2026-10-30',
  completeness: 50, openSection: '101',
  sections: [{ id: '101', num: '1', title: 'Synopsis', status: 'draft', required: true, updatedAt: '2026-10-30T10:00:00.000Z' }],
  content: { 101: [{ p: 'A randomised, double-blind study.' }] },
  objectives: [], eligibility: { inclusion: [], exclusion: [] },
  soa: { visits: [], assessments: [], cells: {}, issues: [] }, risks: [], milestones: [],
  budget: { params: null, items: [], summary: null }, amendments: [], deviations: [],
  reviews: [], consent: [], completenessFindings: [], studyDesign: null,
};
const SECOND = { ...DOC, id: '42', title: 'Second protocol', shortTitle: 'BX-410-202', openSection: '201',
  sections: [{ ...DOC.sections[0], id: '201' }], content: { 201: [{ p: 'The second protocol synopsis.' }] } };
let firstDocument: Record<string, unknown> = DOC;
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value }) as Response;

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>
    <ProtocolWorkspace surface={{ id: 'protocol-dev', label: 'Protocol' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" />
  </QueryClientProvider>);
}
async function makePending() {
  const canvas = await screen.findByRole('textbox', { name: /Section 1 — Synopsis/ });
  fireEvent.change(screen.getByLabelText(/Section status/), { target: { value: 'complete' } });
  expect(surfaceLeaveRefusal()).toBe(REFUSAL);
  return canvas;
}
function expectFirstProtocolRetained(canvas: HTMLElement) {
  expect(screen.getByRole('textbox', { name: /Section 1 — Synopsis/ })).toBe(canvas);
  expect(canvas.textContent).toContain('A randomised, double-blind study.');
  expect(screen.getByRole('heading', { level: 1, name: 'Dose-ranging study' })).toBeTruthy();
  expect((screen.getByRole('combobox', { name: 'Protocol document' }) as HTMLSelectElement).value).toBe('41');
  expect(new URL(window.location.href).searchParams.get('protocol')).toBe('41');
  expect(screen.getByText(REFUSAL)).toBeTruthy();
}

beforeEach(() => {
  clearNavParams();
  window.history.replaceState({}, '', `/concept2cure/protocol-dev?program=${PID}&protocol=41`);
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-410' };
  apiRequest.mockReset();
  firstDocument = DOC;
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    if (url.startsWith('/api/protocol-dev?view=index')) return ok({ success: true, data: [firstDocument, SECOND] });
    if (url.startsWith('/api/protocol-dev?documentId=41')) return ok({ success: true, data: [firstDocument] });
    if (url.startsWith('/api/protocol-dev?documentId=42')) return ok({ success: true, data: [SECOND] });
    return ok({});
  });
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  clearNavParams();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  window.history.replaceState({}, '', '/');
});

describe('protocol selection shares the pending-work guard', () => {
  it('refuses to select another protocol while the current section has pending changes', async () => {
    mount();
    const canvas = await makePending();
    fireEvent.change(screen.getByRole('combobox', { name: 'Protocol document' }), { target: { value: '42' } });
    expectFirstProtocolRetained(canvas);
    expect(apiRequest.mock.calls.some(([, url]) => String(url).includes('documentId=42'))).toBe(false);
  });

  it.each(['all', 'unfiled'])('refuses the %s protocol scope while pending work belongs to the current project', async scope => {
    mount();
    const canvas = await makePending();
    fireEvent.change(screen.getByRole('combobox', { name: 'Protocol scope' }), { target: { value: scope } });
    expectFirstProtocolRetained(canvas);
    expect((screen.getByRole('combobox', { name: 'Protocol scope' }) as HTMLSelectElement).value).toBe(PID);
    expect(new URL(window.location.href).searchParams.has('protocolScope')).toBe(false);
  });

  it('refuses to start another protocol while the current section has pending changes', async () => {
    mount();
    const canvas = await makePending();
    fireEvent.click(screen.getByRole('button', { name: 'Start a protocol' }));
    expectFirstProtocolRetained(canvas);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it('consumes a refused incoming handoff, preserves the editor, and waits for a fresh request after pending changes are reverted', async () => {
    mount();
    const canvas = await makePending();
    act(() => stashNavParamsForTarget('protocol-dev', { protocol: '42', protocolScope: 'all' }));
    expectFirstProtocolRetained(canvas);
    expect(window.C2C_NAV_PARAMS).toBeUndefined();
    fireEvent.change(screen.getByLabelText(/Section status/), { target: { value: 'draft' } });
    expect(surfaceLeaveRefusal()).toBeNull();
    expect(new URL(window.location.href).searchParams.get('protocol')).toBe('41');
    expect(screen.getByRole('heading', { level: 1, name: 'Dose-ranging study' })).toBeTruthy();
    act(() => stashNavParamsForTarget('protocol-dev', { protocol: '42', protocolScope: 'all' }));
    await screen.findByRole('heading', { level: 1, name: 'Second protocol' });
    expect(new URL(window.location.href).searchParams.get('protocol')).toBe('42');
    expect((screen.getByRole('combobox', { name: 'Protocol scope' }) as HTMLSelectElement).value).toBe('all');
  });

  it('unregisters its leave guard on unmount so a later clean protocol can be selected', async () => {
    const view = mount();
    await makePending();
    view.unmount();
    expect(surfaceLeaveRefusal()).toBeNull();
    mount();
    await screen.findByRole('textbox', { name: /Section 1 — Synopsis/ });
    fireEvent.change(screen.getByRole('combobox', { name: 'Protocol document' }), { target: { value: '42' } });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Second protocol' })).toBeTruthy());
    expect(surfaceLeaveRefusal()).toBeNull();
  });

  it('refuses File protocol in open project while an unfiled protocol has pending section changes', async () => {
    firstDocument = { ...DOC, programId: null };
    mount();
    const canvas = await makePending();
    fireEvent.click(screen.getByRole('button', { name: 'File protocol in open project' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expectFirstProtocolRetained(canvas);
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
});
