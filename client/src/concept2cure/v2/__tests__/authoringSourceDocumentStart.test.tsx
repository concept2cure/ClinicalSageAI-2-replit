// @vitest-environment jsdom
/** Existing native creator/form and ledger; only HTTP is synthetic. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';
import { ApiRequestError } from '@/lib/queryClient';
import { AuthoringCreateExport } from '../surfaces/AuthoringCreateExport';
import { useAuthoringCreation } from '../editor/useAuthoringCreation';
import { publishShellProject } from '../shellProject';
import { startNewDocument } from '../newDocumentAction';
import { registerCeremonyOpen, __resetCeremonies } from '../ceremony';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const CREATED = '33333333-3333-4333-8333-333333333333';
const ACTOR = { id: '7', organizationId: '12', email: 'source-author@example.test', roles: ['admin'], permissions: ['governed:write'] };
const bearer = (visit = 'original') => `fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 12, visit }))}.synthetic`;
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const receipt = { id: CREATED, title: 'Source working document' };
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve }; }
function sourceStart() {
  return { programId: PROGRAM, sourceCount: 2, current: vi.fn(() => true), onCreated: vi.fn() };
}
function options() {
  return { programId: PROGRAM, openProject: PROGRAM, docId: 'existing', docTitle: 'Existing document', docStatus: 'DRAFT', module: 'M2',
    programSwitchHeld: false, fireToast: vi.fn(), onDocCreated: vi.fn(), onSectionCreated: vi.fn(), onCheckCreation: vi.fn(async () => true) };
}
function confirmed(body?: Record<string, unknown>) {
  return ok({ success: true, document: { ...receipt, client_program_id: PROGRAM, template_id: null, ...body } }, 201);
}
function wire(post: (body?: Record<string, unknown>) => Response | Promise<Response> = body => confirmed(body)) {
  apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (method === 'POST') return post(body);
    if (url === '/api/authoring/templates') return ok({ success: true, templates: [] });
    if (url === `/api/authoring/docs/${CREATED}`) return ok({ success: true, document: { ...receipt, client_program_id: PROGRAM } });
    return ok({ success: true, documents: [{ ...receipt, program_id: PROGRAM }] });
  });
}
const posts = () => apiRequest.mock.calls.filter(([method]) => method === 'POST');
beforeEach(() => {
  clearAuthToken(); localStorage.clear(); sessionStorage.clear(); __resetCeremonies();
  authService.setToken(bearer(), ACTOR, 'fixture-refresh', 3600);
  publishShellProject({ id: PROGRAM }); apiRequest.mockReset(); wire();
});
afterEach(() => {
  cleanup(); authService.endSession(null); clearAuthToken(); __resetCeremonies();
  localStorage.clear(); sessionStorage.clear(); delete window.C2C_PROJECT; vi.unstubAllGlobals();
});

describe('each document attempt retains its original selected-source owner', () => {
  it('delivers a confirmed reply and later explicit open through entry A after the host receives B', async () => {
    const pending = deferred<Response>(); wire(() => pending.promise);
    const p = options(); const a = sourceStart(); const b = sourceStart();
    const { result, rerender } = renderHook(({ start }) => useAuthoringCreation({ ...p, documentStart: start }), { initialProps: { start: a } });
    act(() => result.current.create('document', { title: receipt.title }, vi.fn()));
    rerender({ start: b });
    await act(async () => { pending.resolve(confirmed()); await pending.promise; });
    await waitFor(() => expect(a.onCreated).toHaveBeenCalledWith(receipt));
    expect(b.onCreated).not.toHaveBeenCalled(); expect(p.onDocCreated).not.toHaveBeenCalled();
    act(() => result.current.open('document'));
    expect(a.onCreated).toHaveBeenCalledTimes(2); expect(b.onCreated).not.toHaveBeenCalled();
    expect(posts()).toHaveLength(1);
  });

  it.each(['stale source', 'different project'])('refuses a %s before POST', mode => {
    const p = options(); const start = sourceStart();
    if (mode === 'stale source') start.current.mockReturnValue(false);
    else start.programId = OTHER;
    const { result } = renderHook(() => useAuthoringCreation({ ...p, documentStart: start }));
    act(() => result.current.create('document', { title: receipt.title }, vi.fn()));
    expect(posts()).toHaveLength(0); expect(result.current.state('document')).toBeUndefined();
  });

  it('keeps a confirmed creation known when its source owner retires before the reply', async () => {
    const pending = deferred<Response>(); wire(() => pending.promise);
    const p = options(); const start = sourceStart();
    const { result } = renderHook(() => useAuthoringCreation({ ...p, documentStart: start }));
    act(() => result.current.create('document', { title: receipt.title }, vi.fn()));
    start.current.mockReturnValue(false);
    await act(async () => { pending.resolve(confirmed()); await pending.promise; });
    expect(result.current.state('document')).toMatchObject({ phase: 'created', receipt });
    expect(start.onCreated).not.toHaveBeenCalled(); expect(p.onDocCreated).not.toHaveBeenCalled();
    act(() => result.current.open('document'));
    expect(start.onCreated).not.toHaveBeenCalled(); expect(p.onDocCreated).not.toHaveBeenCalled();
    expect(posts()).toHaveLength(1);
  });

  it('retains A through identified recovery even when the current prop is B', async () => {
    wire(() => { throw new ApiRequestError('Current read unavailable', 503, { success: false, ok: false, retryAllowed: false,
      creationOutcome: 'committed', code: 'AUTHORING_CREATE_HANDOFF_UNAVAILABLE', recovery: { documentId: CREATED, organizationId: 12, programId: PROGRAM } }); });
    const p = options(); const a = sourceStart(); const b = sourceStart();
    const { result, rerender } = renderHook(({ start }) => useAuthoringCreation({ ...p, documentStart: start }), { initialProps: { start: a } });
    act(() => result.current.create('document', { title: receipt.title }, vi.fn()));
    await waitFor(() => expect(result.current.state('document')?.phase).toBe('unknown'));
    rerender({ start: b }); act(() => result.current.check('document'));
    await waitFor(() => expect(result.current.state('document')?.canOpenRecovered).toBe(true));
    expect(a.onCreated).not.toHaveBeenCalled(); expect(b.onCreated).not.toHaveBeenCalled();
    act(() => result.current.open('document'));
    expect(a.onCreated).toHaveBeenCalledWith(receipt); expect(b.onCreated).not.toHaveBeenCalled();
    expect(p.onDocCreated).not.toHaveBeenCalled(); expect(posts()).toHaveLength(1);
  });

  it('allows actual-outcome checking after source retirement without adopting a recovered document', async () => {
    wire(() => { throw new ApiRequestError('Commit unknown', 503, { ok: false, retryAllowed: false,
      creationOutcome: 'unconfirmed', code: 'AUTHORING_CREATE_COMMIT_UNCONFIRMED', recovery: { documentId: CREATED, organizationId: 12, programId: PROGRAM } }); });
    const p = options(); const start = sourceStart();
    const { result } = renderHook(() => useAuthoringCreation({ ...p, documentStart: start }));
    act(() => result.current.create('document', { title: receipt.title }, vi.fn()));
    await waitFor(() => expect(result.current.state('document')?.phase).toBe('unknown'));
    start.current.mockReturnValue(false); act(() => result.current.check('document'));
    await waitFor(() => expect(result.current.state('document')?.canOpenRecovered).toBe(true));
    expect(p.onCheckCreation).toHaveBeenCalledWith('document');
    act(() => result.current.open('document'));
    expect(start.onCreated).not.toHaveBeenCalled(); expect(p.onDocCreated).not.toHaveBeenCalled(); expect(posts()).toHaveLength(1);
  });

  it('does not infer a source-linked receipt from a generic inventory reconciliation', async () => {
    wire(() => { throw new TypeError('Lost response'); });
    const p = options(); const start = sourceStart();
    const { result } = renderHook(() => useAuthoringCreation({ ...p, documentStart: start }));
    act(() => result.current.create('document', { title: receipt.title }, vi.fn()));
    await waitFor(() => expect(result.current.state('document')?.phase).toBe('unknown'));
    act(() => result.current.check('document'));
    await waitFor(() => expect(result.current.state('document')?.phase).toBe('failed'));
    act(() => result.current.open('document'));
    expect(start.onCreated).not.toHaveBeenCalled(); expect(p.onDocCreated).not.toHaveBeenCalled(); expect(posts()).toHaveLength(1);
  });

  it('keeps the original source owner after a genuine same-session token refresh', async () => {
    const pending = deferred<Response>(); wire(() => pending.promise);
    const p = options(); const start = sourceStart();
    const { result } = renderHook(() => useAuthoringCreation({ ...p, documentStart: start }));
    act(() => result.current.create('document', { title: receipt.title }, vi.fn()));
    const session = authService.captureSessionReadGuard();
    vi.stubGlobal('fetch', vi.fn(async () => ok({ accessToken: bearer('refreshed'), refreshToken: 'fixture-refreshed', expiresIn: 3600 })));
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    expect(session.sameRevision()).toBe(true);
    await act(async () => { pending.resolve(confirmed()); await pending.promise; });
    expect(start.onCreated).toHaveBeenCalledWith(receipt); expect(p.onDocCreated).not.toHaveBeenCalled();
    expect(posts()[0][3]).toEqual({ Authorization: `Bearer ${bearer()}`, 'x-organization-id': '12' });
  });

  it('keeps ordinary section creation separate from a retired document source start', async () => {
    wire(() => ok({ success: true, section: { id: 'created-section', code: '2.6.6', doc_id: 'existing' } }, 201));
    const p = options(); const start = sourceStart(); start.current.mockReturnValue(false);
    const { result } = renderHook(() => useAuthoringCreation({ ...p, documentStart: start }));
    act(() => result.current.create('section', { code: '2.6.6', title: 'Saved section' }, vi.fn()));
    await waitFor(() => expect(p.onSectionCreated).toHaveBeenCalledWith({ id: 'created-section', code: '2.6.6' }));
    expect(start.onCreated).not.toHaveBeenCalled(); expect(p.onDocCreated).not.toHaveBeenCalled();
    expect(posts()).toHaveLength(1); expect(posts()[0][2]).toMatchObject({ doc_id: 'existing', content: '' });
  });
});

describe('source requests use the same native New document drawer once', () => {
  it('opens the existing form with a count, then Cancel consumes the request and ordinary opening clears it', async () => {
    const p = options(); const start = sourceStart();
    const view = render(<AuthoringCreateExport {...p} documentStart={start} />);
    const dialog = await screen.findByRole('dialog', { name: 'New document' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(dialog.textContent).toMatch(/2 selected sources/i); expect(posts()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    view.rerender(<AuthoringCreateExport {...p} documentStart={start} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => startNewDocument()); await screen.findByRole('dialog', { name: 'New document' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Document title' }), { target: { value: receipt.title } });
    fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    await waitFor(() => expect(p.onDocCreated).toHaveBeenCalledWith(receipt));
    expect(start.onCreated).not.toHaveBeenCalled(); expect(posts()).toHaveLength(1);
  });

  it('consumes a request refused by another ceremony instead of opening it later', async () => {
    const p = options(); const start = sourceStart(); const release = registerCeremonyOpen();
    const view = render(<AuthoringCreateExport {...p} documentStart={start} />);
    expect(screen.queryByRole('dialog')).toBeNull(); release();
    view.rerender(<AuthoringCreateExport {...p} documentStart={start} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    view.rerender(<AuthoringCreateExport {...p} documentStart={sourceStart()} />);
    await screen.findByRole('dialog', { name: 'New document' }); expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(posts()).toHaveLength(0);
  });

  it('does not replace an already open ordinary form with a new source request', async () => {
    const p = options(); const start = sourceStart();
    const view = render(<AuthoringCreateExport {...p} />);
    act(() => startNewDocument()); await screen.findByRole('dialog', { name: 'New document' });
    view.rerender(<AuthoringCreateExport {...p} documentStart={start} />);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.change(screen.getByRole('textbox', { name: 'Document title' }), { target: { value: receipt.title } });
    fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    await waitFor(() => expect(p.onDocCreated).toHaveBeenCalledWith(receipt));
    view.rerender(<AuthoringCreateExport {...p} documentStart={start} />);
    expect(screen.queryByRole('dialog')).toBeNull(); expect(start.onCreated).not.toHaveBeenCalled();
  });

  it.each(['held project', 'stale source'])('consumes a %s request without later reopening it', async mode => {
    const p = options(); const start = sourceStart();
    if (mode === 'stale source') start.current.mockReturnValue(false);
    const view = render(<AuthoringCreateExport {...p} programSwitchHeld={mode === 'held project'} documentStart={start} />);
    expect(screen.queryByRole('dialog')).toBeNull(); start.current.mockReturnValue(true);
    view.rerender(<AuthoringCreateExport {...p} documentStart={start} />);
    expect(screen.queryByRole('dialog')).toBeNull(); expect(posts()).toHaveLength(0);
  });

  it('Cancel closes the form while its pending attempt retains its original source callback', async () => {
    const pending = deferred<Response>(); wire(() => pending.promise);
    const p = options(); const start = sourceStart();
    render(<AuthoringCreateExport {...p} documentStart={start} />);
    await screen.findByRole('dialog', { name: 'New document' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Document title' }), { target: { value: receipt.title } });
    fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getByRole('button', { name: /New document/ }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { pending.resolve(confirmed()); await pending.promise; });
    expect(start.onCreated).toHaveBeenCalledWith(receipt); expect(p.onDocCreated).not.toHaveBeenCalled(); expect(posts()).toHaveLength(1);
  });
});
