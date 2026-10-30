// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '@/services/portal/authService';
import { GOVERNED_WRITE_PERMISSION } from '@shared/constants/permissions';
import { clearShellProject, publishShellProject } from '../shellProject';
import { RiskRegister, useRiskRegister } from '../surfaces/RiskRegister';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuthUser: () => actual.authService.getUser() };
});
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const options = (programId: string | null = A) => ({ programId, requireProject: true, surfaceId: 'device-engineering' as const });
const item = (programId = A, id = 1, more: Record<string, unknown> = {}) => ({ id, program_id: programId, ref_code: `HZ-${id}`,
  hazard: `Hazard ${programId === A ? 'A' : 'B'} ${id}`, harm: 'Patient injury', severity: 3, probability: 2,
  status: 'open', acceptable: null, ...more });
const control = { id: 9, risk_item_id: 1, description: 'Independent sensor check', control_type: 'inherent_safety', status: 'verified' };
const reply = (data: unknown, status = 200, extra = {}) => ({ ok: status < 400, status, json: async () => ({ data, ...extra }) }) as Response;
const list = (id = A) => `/api/mdx/risk-items?program_id=${id}`;
const detail = (id = A, riskId = 1) => `/api/mdx/risk-items/${riskId}?program_id=${id}`;
const keyed = (id: string, rows: unknown[]) => reply(rows, 200, { meta: { scope: 'program', programId: id } });
const hazardInput = { hazard: 'New hazard', harm: 'Injury', sev: 'Serious', prob: 'Occasional' };
const signatureInput = { meaning: 'approval' as const, reason: 'Reviewed', password: 'fixture-password' };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function account(id = 7, org = 12, visit = 'original') {
  authService.setToken(`fixture.${btoa(JSON.stringify({ userId: id, organizationId: org, visit }))}.synthetic`,
    { id: String(id), organizationId: String(org), roles: ['admin'], permissions: [GOVERNED_WRITE_PERMISSION] }, 'fixture-refresh', 3600);
}
function wire() {
  apiRequest.mockImplementation(async (method: string, path: string, body?: Record<string, unknown>) => {
    if (method === 'GET' && path === list(A)) return keyed(A, [item()]);
    if (method === 'GET' && path === list(B)) return keyed(B, [item(B, 2)]);
    if (method === 'GET' && path === detail()) return reply({ ...item(), controls: [control] });
    if (method === 'GET' && path === detail(B, 2)) return reply({ ...item(B, 2), controls: [] });
    if (method === 'POST' && path === list()) return reply(item(A, 3, { hazard: body?.hazard }), 201);
    throw new Error('Unexpected fixture request: ' + method + ' ' + path);
  });
}
function Panel({ id = A }: { id?: string }) {
  const r = useRiskRegister(options(id));
  return <RiskRegister register={r} onAsk={() => {}} />;
}
beforeEach(() => { clearShellProject(); account(); publishShellProject({ id: A }); apiRequest.mockReset(); wire(); });
afterEach(() => { cleanup(); clearShellProject(); authService.endSession(null); localStorage.clear(); sessionStorage.clear(); });

describe('the canonical risk register retains its project and account owner', () => {
  it('hydrates the selected persisted controls through one scoped detail read', async () => {
    render(<Panel />);
    await screen.findByText(control.description);
    expect(apiRequest.mock.calls.filter(([method, path]) => method === 'GET' && path === detail())).toHaveLength(1);
  });

  it.each(['another-project', 'missing-project'] as const)('withholds a whole list containing %s rows despite matching envelope metadata', async kind => {
    const wrong = item(B);
    if (kind === 'missing-project') delete (wrong as { program_id?: string }).program_id;
    apiRequest.mockResolvedValue(keyed(A, [item(), wrong]));
    render(<Panel />);
    await screen.findByText("Couldn't load this project's risk file");
    expect(screen.queryByText('Hazard A 1')).toBeNull(); expect(screen.queryByText('Hazard B 1')).toBeNull();
    expect(screen.queryByText('No hazards in the risk file yet')).toBeNull();
  });

  it.each(['different-project', 'different-item', 'missing-program'] as const)('refuses %s detail without inventing an empty control chain', async kind => {
    const wrong = { ...item(kind === 'different-project' ? B : A, kind === 'different-item' ? 8 : 1), controls: [control] };
    if (kind === 'missing-program') delete (wrong as { program_id?: string }).program_id;
    apiRequest.mockImplementation(async (_method: string, path: string) => path === list() ? keyed(A, [item()]) : reply(wrong));
    render(<Panel />);
    await screen.findByText(/Couldn't load the risk controls/);
    expect(screen.queryByText(control.description)).toBeNull();
    expect(screen.queryByText(/No controls yet/)).toBeNull();
  });

  it('distinguishes recorded no-controls from an unreadable detail', async () => {
    apiRequest.mockImplementation(async (_method: string, path: string) => path === list() ? keyed(A, [item()]) : reply({ ...item(), controls: [] }));
    render(<Panel />);
    await screen.findByText('No controls yet — add the first risk control.');
  });

  it('does not report an access refusal as an empty control chain', async () => {
    apiRequest.mockImplementation(async (_method: string, path: string) => path === list() ? keyed(A, [item()]) : reply(null, 403));
    render(<Panel />);
    await screen.findByText(/risk controls.*not.*read|risk controls.*refused/i);
    expect(screen.queryByText(/No controls yet/)).toBeNull();
  });

});

describe('risk reads and mutations belong to one project/account visit', () => {
  it('drops the old project rows and closes its forms synchronously on a new project', async () => {
    const h = renderHook(({ id }) => useRiskRegister(options(id)), { initialProps: { id: A } });
    await waitFor(() => expect(h.result.current.row?.hazard).toBe('Hazard A 1'));
    act(() => { h.result.current.setForm(true); h.result.current.setCtrlForm(true); });
    h.rerender({ id: B });
    expect(h.result.current.rows).toEqual([]);
    expect(h.result.current.form).toBe(false); expect(h.result.current.ctrlForm).toBe(false);
    await waitFor(() => expect(h.result.current.row?.hazard).toBe('Hazard B 2'));
  });

  it('does not adopt a delayed hazard receipt after A → B → A', async () => {
    const pending = deferred<Response>(), base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, path: string, body?: unknown) => method === 'POST' ? pending.promise : base(method, path, body));
    const h = renderHook(({ id }) => useRiskRegister(options(id)), { initialProps: { id: A } });
    await waitFor(() => expect(h.result.current.row).toBeTruthy());
    let saving!: Promise<void>; act(() => { saving = h.result.current.writes.addHazard(hazardInput); });
    expect(apiRequest).toHaveBeenCalledWith('POST', list(), expect.objectContaining({ programId: A }));
    h.rerender({ id: B }); h.rerender({ id: A });
    await waitFor(() => expect(h.result.current.row?.hazard).toBe('Hazard A 1'));
    await act(async () => { pending.resolve(reply(item(A, 8, { hazard: 'Old visit hazard' }), 201)); await saving; });
    expect(h.result.current.rows.map(r => r.hazard)).toEqual(['Hazard A 1']);
    expect(h.result.current.toast.msg).toBe('');
  });

  it('retires a pending list across a same-project account replacement', async () => {
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise);
    const h = renderHook(() => useRiskRegister(options()));
    act(() => account(8));
    await waitFor(() => expect(h.result.current.row?.hazard).toBe('Hazard A 1'));
    await act(async () => { pending.resolve(keyed(A, [item(A, 8, { hazard: 'Previous account hazard' })])); });
    expect(h.result.current.rows.map(r => r.hazard)).toEqual(['Hazard A 1']);
  });

  it('retires a pending control receipt on a project change', async () => {
    const pending = deferred<Response>(), base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, path: string, body?: unknown) => method === 'POST' ? pending.promise : base(method, path, body));
    const h = renderHook(({ id }) => useRiskRegister(options(id)), { initialProps: { id: A } });
    await waitFor(() => expect(h.result.current.controlRead.ready).toBe(true));
    let saving!: Promise<void>; act(() => { saving = h.result.current.writes.addControl({ desc: 'New control', type: 'inherent_safety' }); });
    expect(apiRequest).toHaveBeenCalledWith('POST', `/api/mdx/risk-items/1/controls?program_id=${A}`, expect.objectContaining({ description: 'New control' }));
    h.rerender({ id: B });
    await waitFor(() => expect(h.result.current.row?.hazard).toBe('Hazard B 2'));
    await act(async () => { pending.resolve(reply({ ...control, id: 18, description: 'Retired control' }, 201)); await saving; });
    expect(h.result.current.row?.controls).toEqual([]); expect(h.result.current.toast.msg).toBe('');
  });

  it('retires an earlier shell visit even when A → B → A happens before React redraws', async () => {
    const pending = deferred<Response>(), base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, path: string, body?: unknown) => method === 'POST' ? pending.promise : base(method, path, body));
    const h = renderHook(() => useRiskRegister(options()));
    await waitFor(() => expect(h.result.current.row).toBeTruthy());
    let saving!: Promise<void>; act(() => { saving = h.result.current.writes.addHazard(hazardInput); });
    act(() => { publishShellProject({ id: B }); publishShellProject({ id: A }); });
    await waitFor(() => expect(h.result.current.row?.hazard).toBe('Hazard A 1'));
    await act(async () => { pending.resolve(reply(item(A, 9, { hazard: 'Retired shell visit' }), 201)); await saving; });
    expect(h.result.current.rows.map(r => r.hazard)).toEqual(['Hazard A 1']); expect(h.result.current.toast.msg).toBe('');
  });

  it('cannot run a retained write callback after unmount', async () => {
    const h = renderHook(() => useRiskRegister(options()));
    await waitFor(() => expect(h.result.current.row).toBeTruthy());
    const old = h.result.current.writes; h.unmount(); apiRequest.mockClear();
    await old.addHazard(hazardInput);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('rejects a malformed or mismatched signed row without locally accepting the hazard', async () => {
    const base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, path: string, body?: unknown) => method === 'PATCH'
      ? Promise.resolve(reply({ ...item(B, 8), status: 'accepted' }, 200, { signedAt: '2026-10-30T12:00:00Z' })) : base(method, path, body));
    const h = renderHook(() => useRiskRegister(options()));
    await waitFor(() => expect(h.result.current.row).toBeTruthy());
    await act(async () => { await expect(h.result.current.writes.signAcceptance(h.result.current.row!, signatureInput)).rejects.toThrow(/confirm|record|reload/i); });
    expect(h.result.current.row?.status).toBe('open');
    expect(apiRequest).toHaveBeenCalledWith('PATCH', detail(), expect.objectContaining({ status: 'accepted', password: 'fixture-password' }));
  });

  it('keeps a signed response from a retired visit out of the current risk file', async () => {
    const pending = deferred<Response>(), base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, path: string, body?: unknown) => method === 'PATCH' ? pending.promise : base(method, path, body));
    const h = renderHook(({ id }) => useRiskRegister(options(id)), { initialProps: { id: A } });
    await waitFor(() => expect(h.result.current.row).toBeTruthy());
    const signed = h.result.current.writes.signAcceptance(h.result.current.row!, signatureInput).catch(e => e);
    h.rerender({ id: B });
    await waitFor(() => expect(h.result.current.row?.hazard).toBe('Hazard B 2'));
    await act(async () => { pending.resolve(reply(item(A, 1, { status: 'accepted' }), 200, { signedAt: '2026-10-30T12:00:00Z' })); await signed; });
    expect(h.result.current.row?.status).toBe('open'); expect(h.result.current.toast.msg).toBe('');
  });
});
