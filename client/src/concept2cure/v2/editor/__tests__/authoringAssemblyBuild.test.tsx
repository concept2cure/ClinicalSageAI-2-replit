// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssemblyPlan, AssemblySection } from '@shared/authoring/assembly';
import { authService } from '@/services/portal/authService';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import { ApiRequestError } from '@/lib/queryClient';
import { surfaceLeaveRefusal } from '../../navParams';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { useAuthoringAssemblyBuild } from '../useAuthoringAssemblyBuild';
import { readAssemblyCommit, readAssemblyPlan } from '../assemblyBuildTransport';
import { publishShellProject } from '../../shellProject';
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DOC = '33333333-3333-4333-8333-333333333333';
const SECTION = '44444444-4444-4444-8444-444444444444';
const SECOND = '55555555-5555-4555-8555-555555555555';
const row = (code = '3.2.S.1') => ({ code, title: `Section ${code}`, content: '', ordering: 0, disposition: 'append' as const, aiDraftable: true, aiDraftableReason: 'Narrative', gaps: ['Scientific evidence is required.'] });
const plan = (rows: AssemblyPlan['rows'] = [row()]): AssemblyPlan => ({ version: 1, docId: DOC, programId: PROGRAM, templateId: 'builtin:example', selection: { target: 'document' }, targetSnapshot: 'target', templateSnapshot: 'template', fingerprint: 'fingerprint', templateName: 'Reference outline', draftRegion: 'FDA', limitations: ['Reference only'], gaps: ['Evidence required'], rows });
const saved = (id = SECTION, code = '3.2.S.1', content = ''): AssemblySection => ({ id, doc_id: DOC, code, title: `Section ${code}`, content, order_index: 0, updated_at: null });
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const actor = (id = 7) => ({ id: String(id), organizationId: '12', roles: ['admin'], permissions: ['governed:write'] });
const bearer = (userId = 7, visit = 'original') => `fixture.${btoa(JSON.stringify({ userId, organizationId: 12, visit }))}.synthetic`;
function mount(initial: { editorDirty: boolean; docId: string; programId?: string } = { editorDirty: false, docId: DOC }, recovery = true) {
  const onStructureBuilt = vi.fn(); const onReviewSection = vi.fn();
  const onRecoveryChecked = vi.fn<(current: () => boolean, headers: Record<string, string>) => boolean | Promise<boolean>>(() => true);
  const view = renderHook(props => useAuthoringAssemblyBuild({ ...props, programId: props.programId ?? PROGRAM, docSealed: false, onStructureBuilt, onReviewSection,
    ...(recovery ? { onRecoveryChecked } : {}) }), { initialProps: initial });
  return { ...view, onStructureBuilt, onReviewSection, onRecoveryChecked };
}
function configure(planned: AssemblyPlan, sections: AssemblySection[], generate?: (path: string) => Promise<Response>) {
  const base = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation(async (method: string, path: string, input: unknown) => {
    if (path.endsWith('/assembly/preview')) return reply({ success: true, data: planned });
    if (path.endsWith('/assembly/commit')) return reply({ success: true, data: { docId: DOC, programId: PROGRAM, plan: planned, sections } });
    if (path.endsWith('/sections')) return reply({ success: true, sections });
    if (generate && path.endsWith('/ai/draft')) return generate(path);
    return base(method, path, input);
  });
}
async function preview(view: ReturnType<typeof mount>) {
  await act(async () => { await view.result.current.loadTemplates(); });
  await waitFor(() => expect(view.result.current.templates.length).toBe(1));
  await act(async () => { await view.result.current.chooseTemplate('builtin:example'); });
  await act(async () => { await view.result.current.preview(); });
}
beforeEach(() => {
  clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(bearer(), actor(), 'fixture-refresh', 3600); publishShellProject({ id: PROGRAM });
  apiRequest.mockReset().mockImplementation(async (_method: string, path: string) => {
    if (path === '/api/authoring/templates') return reply({ success: true, templates: [{ id: 'builtin:example', name: 'Reference outline' }], globalCatalog: 'ok' });
    if (path.endsWith('/assembly/preview')) return reply({ success: true, data: plan() });
    if (path.endsWith('/assembly/commit')) return reply({ success: true, data: { docId: DOC, programId: PROGRAM, plan: plan(), sections: [saved()] } });
    if (path.endsWith('/ai/draft')) return reply({ success: true, draft: { content: 'Review candidate', draftId: 'candidate', metadata: {} } });
    if (path.includes('/docs?')) return reply({ success: true, documents: [{ id: DOC, program_id: PROGRAM }] });
    if (path === `/api/authoring/docs/${DOC}`) return reply({ success: true, document: { id: DOC, client_program_id: PROGRAM } });
    if (path.endsWith('/sections')) return reply({ success: true, sections: [saved()] });
    throw new Error(`Unexpected request ${path}`);
  });
});
afterEach(() => { cleanup(); authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear(); delete window.C2C_PROJECT; vi.unstubAllGlobals(); });
async function unknown(view: ReturnType<typeof mount>) {
  await preview(view); act(() => view.result.current.setReason('Append missing sections.'));
  apiRequest.mockRejectedValueOnce(new Error('Response lost'));
  await act(async () => { await view.result.current.build(); });
  expect(view.result.current.phase).toBe('unknown');
}
describe('assembly structural ownership and recovery release', () => {
  it('retains all same-owner document and project holds through round trips', async () => {
    const view = mount(); await unknown(view);
    expect(surfaceLeaveRefusal()).toMatch(/unconfirmed/i);
    view.rerender({ editorDirty: false, docId: SECOND });
    expect(view.result.current.phase).toBe('idle'); expect(view.result.current.leaveRefusal()).toMatch(/unconfirmed/i);
    act(() => { publishShellProject({ id: OTHER }); view.rerender({ editorDirty: false, docId: SECOND, programId: OTHER }); });
    expect(surfaceLeaveRefusal()).toMatch(/unconfirmed/i);
    act(() => { publishShellProject({ id: PROGRAM }); view.rerender({ editorDirty: false, docId: DOC }); });
    expect(view.result.current.phase).toBe('unknown');
    await act(async () => { await view.result.current.check(); });
    expect(view.onRecoveryChecked).toHaveBeenCalledOnce(); expect(surfaceLeaveRefusal()).toBeNull();
  });
  it('holds synchronously pending and host-refreshing checks, then releases only on explicit true', async () => {
    const view = mount(); await preview(view); act(() => view.result.current.setReason('Append missing sections.'));
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise);
    let build!: Promise<void>; act(() => { build = view.result.current.build(); expect(surfaceLeaveRefusal()).toMatch(/still being built/i); });
    await act(async () => { pending.resolve(reply({ message: 'Timed out' }, 503)); await build; });
    const host = deferred<boolean>(); view.onRecoveryChecked.mockReturnValueOnce(host.promise);
    let check!: Promise<void>; act(() => { check = view.result.current.check(); });
    await waitFor(() => expect(view.onRecoveryChecked).toHaveBeenCalledOnce());
    expect(view.result.current.phase).toBe('checking'); expect(surfaceLeaveRefusal()).toMatch(/still being checked/i);
    await act(async () => { host.resolve(true); await check; });
    expect(view.result.current.phase).toBe('checked'); expect(surfaceLeaveRefusal()).toBeNull();
  });
  it.each(['missing', 'false', 'throws'] as const)('keeps an unknown build when actual-host acknowledgement is %s', async failure => {
    const view = mount(undefined, failure !== 'missing'); await unknown(view);
    if (failure === 'false') view.onRecoveryChecked.mockReturnValueOnce(false);
    if (failure === 'throws') view.onRecoveryChecked.mockRejectedValueOnce(new Error('Host refresh failed'));
    await act(async () => { await view.result.current.check(); });
    expect(view.result.current.phase).toBe('unknown'); expect(surfaceLeaveRefusal()).toMatch(/unconfirmed/i);
  });
  it('rejects wrong-program detail despite correctly scoped inventory', async () => {
    const view = mount(); await unknown(view); const base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method, path, input, headers) => path === `/api/authoring/docs/${DOC}`
      ? Promise.resolve(reply({ success: true, document: { id: DOC, client_program_id: OTHER } })) : base(method, path, input, headers));
    await act(async () => { await view.result.current.check(); });
    expect(view.result.current.phase).toBe('unknown'); expect(view.onRecoveryChecked).not.toHaveBeenCalled();
    expect(apiRequest.mock.calls.some(call => String(call[1]).endsWith('/sections'))).toBe(false);
  });
  it.each(['account', 'session', 'bearer'] as const)('retires pending structural ownership synchronously on %s replacement', async transition => {
    const view = mount(); await preview(view); act(() => view.result.current.setReason('Append missing sections.'));
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise);
    let build!: Promise<void>; act(() => { build = view.result.current.build(); });
    const previous = view.result.current;
    act(() => {
      if (transition === 'bearer') setAuthToken(bearer(8));
      else authService.setToken(bearer(transition === 'account' ? 8 : 7, 'replacement'), actor(transition === 'account' ? 8 : 7), 'replacement-refresh', 3600);
      expect(surfaceLeaveRefusal()).toBeNull(); expect(previous.leaveRefusal()).toBeNull();
    });
    await act(async () => { pending.resolve(reply({ success: true, data: { docId: DOC, programId: PROGRAM, plan: plan(), sections: [saved()] } })); await build; });
    expect(view.onStructureBuilt).not.toHaveBeenCalled(); expect(view.onReviewSection).not.toHaveBeenCalled();
    expect(view.result.current.receipt).toBeNull(); expect(surfaceLeaveRefusal()).toBeNull();
  });
  it('never revives unknown state after a retired bearer is repaired', async () => {
    const view = mount(); await unknown(view);
    setAuthToken(bearer(8)); expect(surfaceLeaveRefusal()).toBeNull();
    setAuthToken(bearer()); view.rerender({ editorDirty: false, docId: DOC });
    expect(view.result.current.phase).toBe('idle'); expect(surfaceLeaveRefusal()).toBeNull();
  });
  it('retains uncertainty across genuine same-revision refresh and pins every structural request', async () => {
    const view = mount(); await unknown(view); const session = authService.captureSessionReadGuard();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ accessToken: bearer(7, 'refreshed'), refreshToken: 'next-refresh', expiresIn: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    expect(session.sameRevision()).toBe(true); expect(view.result.current.phase).toBe('unknown'); expect(surfaceLeaveRefusal()).toMatch(/unconfirmed/i);
    await act(async () => { await view.result.current.check(); });
    for (const call of apiRequest.mock.calls) expect(call[3]).toEqual({ Authorization: `Bearer ${String(call[1]).includes('/docs?') || (call[0] === 'GET' && String(call[1]) !== '/api/authoring/templates') ? bearer(7, 'refreshed') : bearer()}`, 'x-organization-id': '12' });
  });
});
describe('assembly ownership boundary responses', () => {
  it.each([408, 403])('classifies HTTP %s without losing structural uncertainty', async status => {
    const view = mount(); await preview(view); act(() => view.result.current.setReason('Append missing sections.'));
    apiRequest.mockResolvedValueOnce(reply({ message: 'Server refusal' }, status));
    await act(async () => { await view.result.current.build(); });
    expect(view.result.current.phase).toBe(status === 408 ? 'unknown' : 'idle');
    expect(Boolean(surfaceLeaveRefusal())).toBe(status === 408);
  });
  it.each([408, 403])('preserves thrown API HTTP %s semantics', async status => {
    const view = mount(); await preview(view); act(() => view.result.current.setReason('Append missing sections.'));
    apiRequest.mockRejectedValueOnce(new ApiRequestError('Server refusal', status));
    await act(async () => { await view.result.current.build(); });
    expect(view.result.current.phase).toBe(status === 408 ? 'unknown' : 'idle');
    expect(Boolean(surfaceLeaveRefusal())).toBe(status === 408);
  });
  it('rejects absent or mismatched native credentials before any assembly request', async () => {
    setAuthToken(bearer(8)); const view = mount();
    expect(view.result.current.disabledReason).toMatch(/signed-in account|sign in/i);
    await act(async () => { await view.result.current.loadTemplates(); await view.result.current.chooseTemplate('builtin:example'); await view.result.current.build(); });
    expect(apiRequest).not.toHaveBeenCalled();
    act(() => { authService.endSession(null); });
    expect(view.result.current.disabledReason).toMatch(/signed-in account|sign in/i);
  });
  it('suppresses a late host acknowledgement after the account is replaced', async () => {
    const view = mount(); await unknown(view); const host = deferred<boolean>(); view.onRecoveryChecked.mockReturnValueOnce(host.promise);
    let check!: Promise<void>; act(() => { check = view.result.current.check(); });
    await waitFor(() => expect(view.onRecoveryChecked).toHaveBeenCalledOnce());
    const [current, headers] = view.onRecoveryChecked.mock.calls[0];
    expect(current()).toBe(true); expect(headers).toEqual({ Authorization: `Bearer ${bearer()}`, 'x-organization-id': '12' });
    act(() => { authService.setToken(bearer(8), actor(8), 'other-refresh', 3600); expect(current()).toBe(false); expect(surfaceLeaveRefusal()).toBeNull(); });
    await act(async () => { host.resolve(true); await check; });
    expect(view.result.current.phase).toBe('idle'); expect(view.result.current.receipt).toBeNull();
  });
});
describe('one editor assembly orchestration', () => {
  it('accepts normalized single-section selection while preserving exact saved code identity', () => {
    const expected = { programId: PROGRAM, templateId: 'builtin:example', selection: { target: 'section' as const, code: ' 3.2.s.1 ' } };
    const preserved = { ...row(' 3.2.S.1 '), disposition: 'preserve' as const, existingSectionId: SECTION };
    const selected = { ...plan([preserved]), selection: { target: 'section' as const, code: '3.2.s.1' } };
    const section = { ...saved(), code: preserved.code, title: preserved.title };
    expect(readAssemblyPlan(selected, DOC, expected)).toEqual(selected);
    const receipt = { docId: DOC, programId: PROGRAM, plan: selected, sections: [section] };
    expect(readAssemblyCommit(receipt, DOC, expected, selected.fingerprint)).not.toBeNull();
    expect(readAssemblyCommit({ ...receipt, sections: [{ ...section, code: '3.2.S.1' }] }, DOC, expected, selected.fingerprint)).toBeNull();
  });
  it('previews and assembles the exact document without any AnA generation or acceptance', async () => {
    const view = mount(); await preview(view);
    act(() => view.result.current.setReason('Append the reference outline.'));
    await act(async () => { await view.result.current.build(); });
    expect(view.onStructureBuilt).toHaveBeenCalledWith(expect.objectContaining({ docId: DOC, programId: PROGRAM, sections: [saved()] }));
    expect(apiRequest.mock.calls.filter(call => String(call[1]).includes('/ai/'))).toHaveLength(0);
  });
  it('admits only one synchronous structural write', async () => {
    const view = mount(); await preview(view); const pending = deferred<Response>();
    apiRequest.mockImplementationOnce(() => pending.promise);
    act(() => view.result.current.setReason('Append missing sections.'));
    let operation!: Promise<void>;
    act(() => { operation = view.result.current.build(); void view.result.current.build(); });
    expect(apiRequest.mock.calls.filter(call => String(call[1]).endsWith('/assembly/commit'))).toHaveLength(1);
    await act(async () => { pending.resolve(reply({ success: true, data: { docId: DOC, programId: PROGRAM, plan: plan(), sections: [saved()] } })); await operation; });
  });
  it('holds a lost commit response until an explicit exact-parent check, without automatic retry', async () => {
    const view = mount(); await preview(view); act(() => view.result.current.setReason('Append missing sections.'));
    apiRequest.mockRejectedValueOnce(new Error('response lost'));
    await act(async () => { await view.result.current.build(); await view.result.current.build(); await view.result.current.preview(); });
    expect(view.result.current.phase).toBe('unknown');
    expect(apiRequest.mock.calls.filter(call => String(call[1]).endsWith('/assembly/commit'))).toHaveLength(1);
    await act(async () => { await view.result.current.check(); });
    expect(view.result.current.phase).toBe('checked');
    expect(view.result.current.message).toMatch(/cannot identify|cannot prove/i);
  });
  it('generates retained section candidates sequentially and never accepts them automatically', async () => {
    const two = plan([row(), { ...row('3.2.S.2'), ordering: 1 }]);
    apiRequest.mockImplementation(async (_method: string, path: string) => {
      if (path === '/api/authoring/templates') return reply({ success: true, templates: [{ id: 'builtin:example', name: 'Reference outline' }] });
      if (path.endsWith('/assembly/preview')) return reply({ success: true, data: two });
      if (path.endsWith('/assembly/commit')) return reply({ success: true, data: { docId: DOC, programId: PROGRAM, plan: two, sections: [saved(), { ...saved(SECOND, '3.2.S.2'), order_index: 1 }] } });
      if (path.includes('/docs?')) return reply({ success: true, documents: [{ id: DOC, program_id: PROGRAM }] });
      if (path === `/api/authoring/docs/${DOC}`) return reply({ success: true, document: { id: DOC, client_program_id: PROGRAM } });
      if (path.endsWith('/sections')) return reply({ success: true, sections: [saved(), saved(SECOND, '3.2.S.2')] });
      return reply({ success: true, draft: { content: `Candidate ${path}`, draftId: path, metadata: {} } });
    });
    const view = mount(); await preview(view);
    act(() => { view.result.current.setReason('Prepare missing narrative sections.'); view.result.current.setWithAna(true); });
    await act(async () => { await view.result.current.build(); });
    expect(Object.keys(view.result.current.reviewSessions)).toEqual([SECTION, SECOND]);
    expect(view.result.current.slots.map(slot => slot.status)).toEqual(['ready', 'ready']);
    expect(apiRequest.mock.calls.filter(call => String(call[1]).endsWith('/ai/draft'))).toHaveLength(2);
    expect(apiRequest.mock.calls.some(call => String(call[1]).endsWith('/accept'))).toBe(false);
  });
});
describe('retained assembly candidates and recovery', () => {
  it('passes recorded template guidance as bounded reference data separately from user requirements', async () => {
    configure(plan([{ ...row(), draftingGuidance: 'Summarize recorded scientific support; identify gaps.' }]), [saved()]);
    const view = mount(); await preview(view);
    act(() => { view.result.current.setReason('Prepare missing narratives.'); view.result.current.setWithAna(true); view.result.current.setRequirements('Use plain prose.'); });
    await act(async () => { await view.result.current.build(); });
    const request = apiRequest.mock.calls.find(call => String(call[1]).endsWith('/ai/draft'))?.[2];
    expect(request.requirements).toBe('Use plain prose.');
    expect(request.context).toContain('BEGIN_TEMPLATE_REFERENCE_JSON');
    const reference = JSON.parse(request.context.split('\n')[1]);
    expect(reference).toMatchObject({ kind: 'template-reference', use: expect.stringContaining('not instructions or project evidence'), guidance: 'Summarize recorded scientific support; identify gaps.', limitations: ['Reference only'] });
    expect(request.context.length).toBeLessThan(8000);
  });
  it('retains the in-flight candidate when stopped and does not start the next section', async () => {
    const first = deferred<Response>();
    configure(plan([row(), { ...row('3.2.S.2'), ordering: 1 }]), [saved(), { ...saved(SECOND, '3.2.S.2'), order_index: 1 }], () => first.promise);
    const view = mount(); await preview(view);
    act(() => { view.result.current.setReason('Prepare missing narratives.'); view.result.current.setWithAna(true); });
    let operation!: Promise<void>; act(() => { operation = view.result.current.build(); });
    await waitFor(() => expect(apiRequest.mock.calls.filter(call => String(call[1]).endsWith('/ai/draft'))).toHaveLength(1));
    act(() => view.result.current.stop());
    await act(async () => { first.resolve(reply({ success: true, draft: { content: 'First retained candidate', draftId: 'first' } })); await operation; });
    expect(view.result.current.slots.map(slot => slot.status)).toEqual(['ready', 'not-started']);
    expect(view.result.current.reviewSessions[SECTION].state.body).toBe('First retained candidate');
    expect(apiRequest.mock.calls.filter(call => String(call[1]).endsWith('/ai/draft'))).toHaveLength(1);
  });
  it('retries only failed or not-started slots and keeps completed review edits and reason', async () => {
    let secondAttempts = 0;
    configure(plan([row(), { ...row('3.2.S.2'), ordering: 1 }]), [saved(), { ...saved(SECOND, '3.2.S.2'), order_index: 1 }], async path => {
      if (path.includes(SECOND) && secondAttempts++ === 0) return reply({ message: 'Provider refused' }, 503);
      return reply({ success: true, draft: { content: `Candidate ${path}`, draftId: path } });
    });
    const view = mount(); await preview(view);
    act(() => { view.result.current.setReason('Prepare missing narratives.'); view.result.current.setWithAna(true); });
    await act(async () => { await view.result.current.build(); });
    act(() => { const session = view.result.current.reviewSessions[SECTION]; session.update({ ...session.state, body: 'Reviewed edits', changeReason: 'Scientific review' }); });
    await act(async () => { await view.result.current.retryDrafts(); });
    expect(view.result.current.reviewSessions[SECTION].state).toMatchObject({ body: 'Reviewed edits', changeReason: 'Scientific review' });
    expect(view.result.current.slots.map(slot => slot.status)).toEqual(['ready', 'ready']);
    expect(apiRequest.mock.calls.filter(call => String(call[1]).includes(SECTION) && String(call[1]).endsWith('/ai/draft'))).toHaveLength(1);
    act(() => { const session = view.result.current.reviewSessions[SECTION]; session.update({ ...session.state, draft: null, body: '', refusal: 'Explicitly discarded' }); });
    expect(view.result.current.reviewSessions[SECTION].state).toMatchObject({ draft: null, body: '', refusal: 'Explicitly discarded' });
  });
  it('holds a correct-parent but wrong-content or wrong-order receipt without drafting or refreshing', async () => {
    configure(plan(), [{ ...saved(), content: 'Unexpected text', order_index: 6 }]);
    const view = mount(); await preview(view);
    act(() => { view.result.current.setReason('Prepare missing narratives.'); view.result.current.setWithAna(true); });
    await act(async () => { await view.result.current.build(); });
    expect(view.result.current.phase).toBe('unknown'); expect(view.onStructureBuilt).not.toHaveBeenCalled();
    expect(apiRequest.mock.calls.some(call => String(call[1]).endsWith('/ai/draft'))).toBe(false);
  });
  it('retains a confirmed late structure receipt while dirty, and resumes drafting only explicitly', async () => {
    const view = mount(); await preview(view);
    act(() => { view.result.current.setReason('Prepare missing narratives.'); view.result.current.setWithAna(true); });
    const pending = deferred<Response>(); apiRequest.mockImplementationOnce(() => pending.promise);
    let operation!: Promise<void>; act(() => { operation = view.result.current.build(); });
    view.rerender({ editorDirty: true, docId: DOC });
    await act(async () => { pending.resolve(reply({ success: true, data: { docId: DOC, programId: PROGRAM, plan: plan(), sections: [saved()] } })); await operation; });
    expect(view.result.current.phase).toBe('stopped'); expect(view.result.current.receipt?.docId).toBe(DOC); expect(view.onStructureBuilt).not.toHaveBeenCalled();
    expect(apiRequest.mock.calls.some(call => String(call[1]).endsWith('/ai/draft'))).toBe(false);
    view.rerender({ editorDirty: false, docId: DOC });
    await act(async () => { await view.result.current.retryDrafts(); });
    expect(view.result.current.reviewSessions[SECTION].state.body).toBe('Review candidate');
  });
  it('keeps review edits while dirty and explicitly rechecks candidate ownership after a project round trip', async () => {
    const view = mount(); await preview(view);
    act(() => { view.result.current.setReason('Prepare missing narratives.'); view.result.current.setWithAna(true); });
    await act(async () => { await view.result.current.build(); });
    view.rerender({ editorDirty: true, docId: DOC });
    act(() => { const session = view.result.current.reviewSessions[SECTION]; session.update({ ...session.state, body: 'Retained edits while dirty', changeReason: 'Review reason' }); });
    expect(view.result.current.reviewSessions[SECTION].state.body).toBe('Retained edits while dirty');
    act(() => { publishShellProject({ id: OTHER }); publishShellProject({ id: PROGRAM }); });
    expect(view.result.current.reviewSessions[SECTION].isCurrent()).toBe(false);
    act(() => view.result.current.review(SECTION));
    await waitFor(() => expect(view.onReviewSection).toHaveBeenCalledWith(SECTION));
    expect(view.result.current.reviewSessions[SECTION].isCurrent()).toBe(true);
    expect(view.result.current.reviewSessions[SECTION].state).toMatchObject({ body: 'Retained edits while dirty', changeReason: 'Review reason' });
  });
  it('refuses a batch above 20 and makes its exact-section retry remedy reachable', async () => {
    const rows = Array.from({ length: 21 }, (_, index) => ({ ...row(`3.2.S.${index + 1}`), ordering: index }));
    const sections = rows.map((item, index) => ({ ...saved(`section-${index}`, item.code), order_index: index }));
    configure(plan(rows), sections);
    const view = mount(); await preview(view);
    act(() => { view.result.current.setReason('Prepare missing narratives.'); view.result.current.setWithAna(true); });
    await act(async () => { await view.result.current.build(); });
    expect(view.result.current.message).toContain('exceeds 20');
    expect(apiRequest.mock.calls.some(call => String(call[1]).endsWith('/ai/draft'))).toBe(false);
    act(() => view.result.current.chooseTarget('3.2.S.1'));
    await act(async () => { await view.result.current.retryDrafts(); });
    expect(view.result.current.slots.filter(slot => slot.status === 'ready')).toHaveLength(1);
    expect(apiRequest.mock.calls.filter(call => String(call[1]).endsWith('/ai/draft'))).toHaveLength(1);
  });
});
