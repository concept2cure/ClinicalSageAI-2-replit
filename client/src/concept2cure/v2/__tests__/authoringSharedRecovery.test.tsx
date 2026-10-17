// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ revision: 0, account: { id: '7', organizationId: '12' }, listeners: new Map<string, Set<() => void>>() }));
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({ authService: {
  getUser: () => auth.account,
  on: (event: string, listener: () => void) => {
    const listeners = auth.listeners.get(event) ?? new Set<() => void>(); listeners.add(listener); auth.listeners.set(event, listeners);
    return () => { listeners.delete(listener); };
  },
  captureSessionReadGuard: () => { const revision = auth.revision; return { sameRevision: () => auth.revision === revision }; },
} }));
import { ApiRequestError } from '@/lib/queryClient';
import { useAuthoringHandoff } from '../authoringHandoff';
import { publishShellProject } from '../shellProject';
import { clearEditorTarget, peekEditorTarget, setEditorTarget } from '../editorTarget';
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DOC = '33333333-3333-4333-8333-333333333333';
const input = { title: 'Study analysis', module: 'M5', code: 'study.analysis', content: '<p>Original result</p>', subject: 'the analysis' };
const document = { id: DOC, title: input.title, client_program_id: PROGRAM, module: 'M5' };
const section = { id: '44444444-4444-4444-8444-444444444444', doc_id: DOC, code: input.code, title: input.title, content: input.content };
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const docReply = () => reply({ success: true, document, governance: { bound: false } }, 201);
const sectionReply = () => reply({ success: true, section }, 201);
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { resolve, promise }; }
// Before the controller exists, exercise the old callable writer to capture
// actual duplicate POSTs rather than only an interface-shape failure.
function controller(value: ReturnType<typeof useAuthoringHandoff>) {
  return typeof value === 'function' ? { save: value } as unknown as ReturnType<typeof useAuthoringHandoff> : value;
}
beforeEach(() => { clearEditorTarget(); auth.listeners.clear(); apiRequest.mockReset(); auth.revision = 0; auth.account = { id: '7', organizationId: '12' }; publishShellProject({ id: PROGRAM }); });
function setup() { const hook = renderHook(() => useAuthoringHandoff()); return { ...hook, current: () => controller(hook.result.current) }; }
function scopedRead(sections: unknown[] = []) {
  apiRequest.mockResolvedValueOnce(reply({ success: true, documents: [{ id: DOC, title: input.title, program_id: PROGRAM }] }))
    .mockResolvedValueOnce(reply({ success: true, document: { id: DOC, title: input.title } }))
    .mockResolvedValueOnce(reply({ success: true, sections }));
}
describe('one specialist creation lane and explicit recovery', () => {
  it('blocks synchronous overlapping Open and Attach without sharing a success result', async () => {
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise).mockResolvedValue(sectionReply());
    const hook = setup(); let first!: ReturnType<ReturnType<typeof useAuthoringHandoff>['save']>;
    await act(async () => { first = hook.current().save(input); const second = await hook.current().save(input); expect(second).toMatchObject({ ok: false, phase: 'blocked' }); });
    expect(apiRequest).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(docReply()); await first; });
  });
  it('retains unknown outcome and refuses another document POST', async () => {
    apiRequest.mockRejectedValue(new Error('response lost')); const hook = setup();
    await act(async () => { await hook.current().save(input); await hook.current().save(input); });
    expect(apiRequest).toHaveBeenCalledTimes(1); expect(hook.current().state?.phase).toBe('unknown');
  });
  it('reuses a confirmed complete payload only for a later deliberate action', async () => {
    apiRequest.mockResolvedValueOnce(docReply()).mockResolvedValueOnce(sectionReply()); const hook = setup();
    await act(async () => { await hook.current().save(input); });
    scopedRead([{ ...section, content: '<p>Later edits</p>' }]);
    let reused; await act(async () => { reused = await hook.current().save({ ...input }); });
    expect(apiRequest).toHaveBeenCalledTimes(5); expect(reused).toMatchObject({ ok: true, reused: true, docId: DOC });
  });
  it('does not release uncertainty after a wrong-project inventory', async () => {
    apiRequest.mockRejectedValueOnce(new Error('lost')); const hook = setup(); await act(async () => { await hook.current().save(input); });
    apiRequest.mockResolvedValueOnce(reply({ success: true, documents: [{ id: DOC, title: input.title, program_id: OTHER }] }));
    await act(async () => { await hook.current().check(); await hook.current().save(input); });
    expect(apiRequest).toHaveBeenCalledTimes(2); expect(hook.current().blocked).toBe(true);
  });
  it('a scoped no-ID check exposes inventory without attributing a document', async () => {
    apiRequest.mockRejectedValueOnce(new Error('lost')); const hook = setup(); await act(async () => { await hook.current().save(input); });
    apiRequest.mockResolvedValueOnce(reply({ success: true, documents: [{ id: DOC, title: input.title, program_id: PROGRAM }] }));
    await act(async () => { await hook.current().check(); });
    expect(hook.current().state).toMatchObject({ phase: 'checked', inventory: [{ id: DOC, title: input.title }] });
    expect(hook.current().state?.docId).toBeUndefined(); expect(hook.current().blocked).toBe(false);
  });
  it('continues only original text into a confirmed empty document after an explicit scoped check', async () => {
    apiRequest.mockResolvedValueOnce(docReply()).mockResolvedValueOnce(reply({ success: false, error: 'denied' }, 403));
    const hook = setup(); await act(async () => { await hook.current().save(input); await hook.current().save({ ...input, content: '<p>Changed result</p>' }); });
    expect(apiRequest).toHaveBeenCalledTimes(2); scopedRead();
    await act(async () => { await hook.current().check(); });
    expect(hook.current().state?.canContinue).toBe(true); expect(apiRequest).toHaveBeenCalledTimes(5);
    scopedRead(); apiRequest.mockResolvedValueOnce(sectionReply()); await act(async () => { await hook.current().continueSaving(); });
    expect(apiRequest).toHaveBeenLastCalledWith('POST', '/api/authoring/sections', { doc_id: DOC, code: input.code, title: input.title, content: input.content });
    expect(apiRequest.mock.calls.filter(([method, path]) => method === 'POST' && path === '/api/authoring/docs')).toHaveLength(1);
  });
  it('an existing normalized section is inspection only and never overwritten', async () => {
    apiRequest.mockResolvedValueOnce(docReply()).mockRejectedValueOnce(new Error('lost')); const hook = setup();
    await act(async () => { await hook.current().save(input); }); scopedRead([{ ...section, code: ' STUDY.ANALYSIS ', content: '<p>Other work</p>' }]);
    await act(async () => { await hook.current().check(); await hook.current().continueSaving(); });
    expect(hook.current().state?.canContinue).toBe(false); expect(hook.current().state?.phase).toBe('partial'); expect(apiRequest).toHaveBeenCalledTimes(5);
  });
});


async function unknown() {
    apiRequest.mockRejectedValueOnce(new Error('lost'));
    const hook = setup(); await act(async () => { await hook.current().save(input); }); return hook;
}
async function partial() {
    apiRequest.mockResolvedValueOnce(docReply()).mockRejectedValueOnce(new Error('lost'));
    const hook = setup(); await act(async () => { await hook.current().save(input); }); return hook;
}
describe('strict recovery reads and preserved current server text', () => {
  it.each([
    { success: false, documents: [] },
    { documents: [] },
    { success: true, documents: null },
    { success: true, documents: [{ id: DOC, title: input.title }] },
    { success: true, documents: [{ id: DOC, title: input.title, program_id: OTHER }] },
    { success: true, documents: [{ id: '', title: input.title, program_id: PROGRAM }] },
    { success: true, documents: [{ id: DOC, title: null, program_id: PROGRAM }] },
  ])('keeps unknown held after malformed inventory %#', async body => {
    const hook = await unknown(); apiRequest.mockResolvedValueOnce(reply(body));
    await act(async () => { await hook.current().check(); await hook.current().save(input); });
    expect(hook.current().blocked).toBe(true); expect(apiRequest).toHaveBeenCalledTimes(2);
  });
  it('a definite document refusal permits a separate explicit retry', async () => {
    apiRequest.mockResolvedValueOnce(reply({ success: false, error: 'denied' }, 403)); const hook = setup();
    await act(async () => { await hook.current().save(input); }); expect(hook.current().blocked).toBe(false);
    apiRequest.mockResolvedValueOnce(docReply()).mockResolvedValueOnce(sectionReply());
    await act(async () => { await hook.current().save(input); }); expect(hook.current().state?.phase).toBe('saved');
  });
  it('a lost document check never adopts a plausible inventory ID', async () => {
    const hook = await unknown(); apiRequest.mockResolvedValueOnce(reply({ success: true, documents: [{ id: DOC, title: input.title, program_id: PROGRAM }] }));
    await act(async () => { await hook.current().check(); }); const nav = vi.fn();
    expect(hook.current().open(nav)).toBe(false); expect(peekEditorTarget()).toBeNull();
    setEditorTarget({ docType: null, docId: DOC, programId: OTHER });
    expect(hook.current().openWorkingDocuments(nav)).toBe(true); expect(peekEditorTarget()).toBeNull(); expect(nav).toHaveBeenCalledOnce();
  });
  it('a verified empty document opens by exact ID without an absent section target', async () => {
    const hook = await partial(); scopedRead(); await act(async () => { await hook.current().check(); });
    const nav = vi.fn(); expect(hook.current().open(nav)).toBe(true);
    expect(peekEditorTarget()).toMatchObject({ docId: DOC, programId: PROGRAM }); expect(peekEditorTarget()?.sectionCode).toBeNull();
    expect(apiRequest).toHaveBeenCalledTimes(5);
  });
  it('a malformed exact parent keeps the confirmed ID held', async () => {
    const hook = await partial(); apiRequest.mockResolvedValueOnce(reply({ success: true, documents: [{ id: DOC, title: input.title, program_id: PROGRAM }] }))
      .mockResolvedValueOnce(reply({ success: true, document: { id: OTHER, title: input.title } }));
    await act(async () => { await hook.current().check(); });
    expect(hook.current().state).toMatchObject({ phase: 'partial', docId: DOC, canOpen: false, canContinue: false });
  });
  it('a foreign section row cannot authorize continuation or inspection', async () => {
    const hook = await partial(); scopedRead([{ ...section, doc_id: OTHER }]);
    await act(async () => { await hook.current().check(); await hook.current().continueSaving(); });
    expect(hook.current().state).toMatchObject({ canOpen: false, canContinue: false }); expect(apiRequest).toHaveBeenCalledTimes(5);
  });
  it('rechecks after Check and preserves text another actor saved before Continue', async () => {
    const hook = await partial(); scopedRead(); await act(async () => { await hook.current().check(); });
    scopedRead([{ ...section, content: '<p>Another actor saved this</p>' }]);
    await act(async () => { await hook.current().continueSaving(); });
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(2);
    expect(hook.current().state).toMatchObject({ phase: 'partial', canOpen: true, canContinue: false });
  });
});
describe('continuation and context ownership', () => {
  it('a continuation conflict requires another check and never creates another document', async () => {
    const hook = await partial(); scopedRead(); await act(async () => { await hook.current().check(); });
    scopedRead(); apiRequest.mockResolvedValueOnce(reply({ success: false, code: 'SECTION_CODE_EXISTS', error: 'Section code exists' }, 409));
    await act(async () => { await hook.current().continueSaving(); await hook.current().continueSaving(); await hook.current().save(input); });
    expect(hook.current().state).toMatchObject({ phase: 'partial', canContinue: false }); expect(apiRequest).toHaveBeenCalledTimes(9);
    expect(apiRequest.mock.calls.filter(([method, path]) => method === 'POST' && path === '/api/authoring/docs')).toHaveLength(1);
  });
  it('does not falsely reuse a deleted saved document or create a replacement', async () => {
    apiRequest.mockResolvedValueOnce(docReply()).mockResolvedValueOnce(sectionReply()); const hook = setup();
    await act(async () => { await hook.current().save(input); }); apiRequest.mockResolvedValueOnce(reply({ success: true, documents: [] }));
    let result; await act(async () => { result = await hook.current().save(input); });
    expect(result).toMatchObject({ ok: false, phase: 'unknown', docId: DOC }); expect(hook.current().blocked).toBe(true);
    expect(apiRequest).toHaveBeenCalledTimes(3);
  });
  it('blocks a second check synchronously while the first read is pending', async () => {
    const hook = await unknown(); const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise);
    let first!: Promise<void>; await act(async () => { first = hook.current().check(); await hook.current().check(); });
    expect(apiRequest).toHaveBeenCalledTimes(2);
    await act(async () => { pending.resolve(reply({ success: true, documents: [] })); await first; });
    expect(hook.current().state?.phase).toBe('checked');
  });
  it('retains an old project uncertainty but accepts a fresh check when returning', async () => {
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise); const hook = setup();
    let operation!: ReturnType<ReturnType<typeof useAuthoringHandoff>['save']>;
    await act(async () => { operation = hook.current().save(input); });
    act(() => { publishShellProject({ id: OTHER }); }); expect(hook.current().state).toBeUndefined();
    act(() => { publishShellProject({ id: PROGRAM }); });
    await act(async () => { pending.resolve(docReply()); await operation; });
    expect(hook.current().state?.phase).toBe('unknown'); apiRequest.mockResolvedValueOnce(reply({ success: true, documents: [] }));
    await act(async () => { await hook.current().check(); }); expect(hook.current().state?.phase).toBe('checked');
  });
  it('auth events isolate the visible account without an unrelated render', async () => {
    const hook = await partial(); expect(hook.current().state?.docId).toBe(DOC);
    act(() => { auth.account = { id: '8', organizationId: '12' }; auth.revision++; auth.listeners.get('login')?.forEach(listener => listener()); });
    expect(hook.current().state).toBeUndefined(); expect(hook.current().blocked).toBe(false);
  });
  it('an unmounted completion cannot open or continue into the editor', async () => {
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise); const hook = setup();
    let operation!: ReturnType<ReturnType<typeof useAuthoringHandoff>['save']>;
    await act(async () => { operation = hook.current().save(input); }); hook.unmount();
    pending.resolve(docReply()); const result = await operation; expect(result).toMatchObject({ ok: false, phase: 'stale' });
    const nav = vi.fn(); expect(hook.current().open(nav)).toBe(false); expect(nav).not.toHaveBeenCalled(); expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});


describe('effect ownership outlives a response but not its attempt', () => {
  it('a later attempt invalidates an earlier confirmed result in the same context', async () => {
    apiRequest.mockResolvedValueOnce(docReply()).mockResolvedValueOnce(sectionReply()); const hook = setup();
    let first!: Awaited<ReturnType<ReturnType<typeof useAuthoringHandoff>['save']>>;
    await act(async () => { first = await hook.current().save(input); }); expect(first.isCurrent()).toBe(true);
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise);
    let newer!: ReturnType<ReturnType<typeof useAuthoringHandoff>['save']>;
    await act(async () => { newer = hook.current().save({ ...input, content: '<p>New result</p>' }); });
    expect(first.isCurrent()).toBe(false);
    await act(async () => { pending.resolve(reply({ success: false, error: 'refused' }, 403)); await newer; });
    expect(first.isCurrent()).toBe(false);
  });
  it('a stale reuse read settles into recoverable partial state after a project round trip', async () => {
    apiRequest.mockResolvedValueOnce(docReply()).mockResolvedValueOnce(sectionReply()); const hook = setup();
    await act(async () => { await hook.current().save(input); });
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise);
    let reuse!: ReturnType<ReturnType<typeof useAuthoringHandoff>['save']>;
    await act(async () => { reuse = hook.current().save(input); });
    act(() => { publishShellProject({ id: OTHER }); }); act(() => { publishShellProject({ id: PROGRAM }); });
    await act(async () => { pending.resolve(reply({ success: true, documents: [] })); await reuse; });
    expect(hook.current().state).toMatchObject({ phase: 'partial', checking: false });
    scopedRead([]); await act(async () => { await hook.current().check(); });
    expect(hook.current().state?.canContinue).toBe(true);
  });
});

describe('canonical backend creation recovery identifiers', () => {
  const payload = (creationOutcome: 'unconfirmed' | 'committed', programId = PROGRAM) => ({
    success: false, ok: false, retryAllowed: false, creationOutcome,
    code: creationOutcome === 'unconfirmed' ? 'AUTHORING_CREATE_COMMIT_UNCONFIRMED' : 'AUTHORING_CREATE_HANDOFF_UNAVAILABLE',
    recovery: { documentId: DOC, organizationId: 12, programId },
  });
  it.each(['unconfirmed', 'committed'] as const)('retains the exact %s identity without a saved receipt or blind retry', async outcome => {
    apiRequest.mockRejectedValueOnce(new ApiRequestError('outcome unavailable', 503, payload(outcome)));
    const hook = setup(); let result;
    await act(async () => { result = await hook.current().save(input); await hook.current().save(input); });
    expect(result).toMatchObject({ ok: false, phase: 'unknown', docId: DOC });
    expect(hook.current().state).toMatchObject({ phase: 'partial', docId: DOC, canOpen: false });
    expect(hook.current().state?.message).not.toMatch(/Nothing was saved|Nothing was created/);
    expect(peekEditorTarget()).toBeNull(); expect(apiRequest).toHaveBeenCalledTimes(1);
    scopedRead(); await act(async () => { await hook.current().check(); });
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/authoring/docs/${DOC}`);
    expect(hook.current().state?.canOpen).toBe(true);
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1);
  });
  it('keeps a foreign recovery identity unresolved without exposing or adopting its ID', async () => {
    apiRequest.mockResolvedValueOnce(reply(payload('committed', OTHER), 403));
    const hook = setup(); await act(async () => { await hook.current().save(input); await hook.current().save(input); });
    expect(hook.current().state).toMatchObject({ phase: 'unknown' });
    expect(hook.current().state?.docId).toBeUndefined();
    expect(hook.current().blocked).toBe(true); expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
