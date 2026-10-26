// @vitest-environment jsdom
/** Actual chooser/channel/auth owners; HTTP, users and stored records are synthetic. */
import React from 'react';
import { flushSync } from 'react-dom';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '@/services/portal/authService';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { SourceAssemblyAction, SourceAssemblyDialog } from '../SourceAssemblyDialog';
import { useSourceAssemblyTarget } from '../useSourceAssemblyTarget';
import { clearShellProject, publishShellProject } from '../../shellProject';
import { clearEditorTarget, EDITOR_TARGET_EVENT, peekEditorTarget, setEditorTarget } from '../../editorTarget';
import { __resetCeremonies, registerCeremonyOpen } from '../../ceremony';

const PROGRAM = '11111111-1111-4111-8111-111111111861';
const OTHER = '11111111-1111-4111-8111-111111111862';
const DOC = '22222222-2222-4222-8222-222222222861';
const VAULT = '33333333-3333-4333-8333-333333333861';
const ACTOR = { id: '7', organizationId: '12', roles: ['admin'], permissions: ['governed:write'] };
const bearer = (visit = 'initial', id = 7) => `fixture.${btoa(JSON.stringify({ userId: id, organizationId: 12, visit }))}.synthetic`;
const sources = () => [{ kind: 'data-room' as const, sourceId: 861, expectedChecksum: 'ab'.repeat(32) },
  { kind: 'vault' as const, documentId: VAULT, expectedChecksum: 'cd'.repeat(32) }];
const row = { id: DOC, title: 'Current laboratory working document', status: 'DRAFT', program_id: PROGRAM,
  tenant_id: 12, created_by: 7, section_count: 1, readScope: 'document' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const inventory = (documents: unknown[] = [row]) => response({ success: true, documents });
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve }; }
function props(overrides: Partial<React.ComponentProps<typeof SourceAssemblyDialog>> = {}) {
  return { programId: PROGRAM, sources: sources(), onClose: vi.fn(), ...overrides };
}
async function selectDocument() {
  await screen.findByRole('option', { name: row.title });
  fireEvent.change(screen.getByLabelText('Working document'), { target: { value: DOC } });
}
function changeOwner(change: string) {
  if (change === 'account') authService.setToken(bearer('other-account', 8), { ...ACTOR, id: '8' }, 'other-refresh', 3600);
  if (change === 'session') authService.setToken(bearer('replacement'), ACTOR, 'replacement-refresh', 3600);
  if (change === 'bearer') setAuthToken(bearer('unadopted'));
  if (change === 'project') { publishShellProject({ id: OTHER }); publishShellProject({ id: PROGRAM }); }
}
async function refresh() {
  vi.stubGlobal('fetch', vi.fn(async () => response({ accessToken: bearer('refreshed'), refreshToken: 'rotated', expiresIn: 3600 })));
  await act(async () => { expect(await authService.refreshToken()).toBe(true); });
}
beforeEach(() => {
  authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear(); clearEditorTarget(); __resetCeremonies();
  authService.setToken(bearer(), ACTOR, 'fixture-refresh', 3600); publishShellProject({ id: PROGRAM, title: 'Original project' });
  apiRequest.mockReset().mockImplementation(async () => inventory());
});
afterEach(() => {
  cleanup(); authService.endSession(null); clearAuthToken(); clearShellProject(); clearEditorTarget(); __resetCeremonies();
  localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals();
});

describe('selected-source reads belong to an adopted account and one project visit', () => {
  it.each(['anonymous', 'storage-only'])('refuses an %s read before dispatch', change => {
    authService.endSession(null); if (change === 'storage-only') setAuthToken(bearer());
    render(<SourceAssemblyDialog {...props()} />);
    expect(apiRequest).not.toHaveBeenCalled(); expect(screen.queryByLabelText('Working document')).toBeNull();
  });
  it.each(['account', 'session', 'bearer', 'project'])('masks a delayed inventory after %s replacement', async change => {
    const pending = deferred<Response>(); apiRequest.mockReturnValue(pending.promise); render(<SourceAssemblyDialog {...props()} />);
    act(() => changeOwner(change)); await act(async () => { pending.resolve(inventory()); await pending.promise; });
    expect(screen.queryByRole('option', { name: row.title })).toBeNull(); expect(screen.queryByLabelText('Working document')).toBeNull();
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('checks adopted credentials again after an inventory body is delayed', async () => {
    const body = deferred<unknown>(); apiRequest.mockResolvedValue({ ok: true, status: 200, json: () => body.promise });
    render(<SourceAssemblyDialog {...props()} />); await act(async () => { await Promise.resolve(); }); act(() => changeOwner('bearer'));
    await act(async () => { body.resolve({ success: true, documents: [row] }); await body.promise; });
    expect(screen.queryByRole('option', { name: row.title })).toBeNull();
  });
  it('pins initial read headers through refresh and uses the adopted bearer for revalidation', async () => {
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise).mockResolvedValue(inventory());
    const onNav = vi.fn(); render(<SourceAssemblyDialog {...props({ onNav })} />); await refresh();
    await act(async () => { pending.resolve(inventory()); await pending.promise; }); await selectDocument();
    expect(apiRequest.mock.calls[0][3]).toEqual({ Authorization: `Bearer ${bearer()}`, 'x-organization-id': '12' });
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' })); await waitFor(() => expect(onNav).toHaveBeenCalledWith('document-authoring'));
    expect(apiRequest.mock.calls[1][3]).toEqual({ Authorization: `Bearer ${bearer('refreshed')}`, 'x-organization-id': '12' });
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
  it.each(['missing', 'unknown'])('refuses a %s inventory projection instead of admitting a whole-document target', async kind => {
    const document: Record<string, unknown> = { ...row }; if (kind === 'missing') delete document.readScope; else document.readScope = 'unknown';
    apiRequest.mockResolvedValue(inventory([document])); render(<SourceAssemblyDialog {...props()} />);
    await waitFor(() => expect(screen.queryByText('Loading working documents…')).toBeNull());
    expect(screen.queryByRole('option', { name: row.title })).toBeNull(); expect(screen.queryByRole('alert')).toBeTruthy();
  });
  it('filters an explicit section-only record and keeps a read failure retryable', async () => {
    apiRequest.mockResolvedValueOnce(response({ success: false }, 503)).mockResolvedValueOnce(inventory([{ ...row, readScope: 'sections' }]));
    render(<SourceAssemblyDialog {...props()} />); fireEvent.click(await screen.findByRole('button', { name: 'Retry document list' }));
    await screen.findByText('No working documents are available in this project.'); expect(screen.queryByRole('option', { name: row.title })).toBeNull();
  });
});

function CloseChangesHost({ change, original, latest }: { change: string; original: (id: string) => void; latest: (id: string) => void }) {
  const [closed, setClosed] = React.useState(false);
  return <SourceAssemblyDialog {...props({ isCurrent: () => !(closed && change === 'predicate'), onNav: closed && change === 'callback' ? latest : original,
    onClose: () => {
      if (['account', 'session', 'project'].includes(change)) changeOwner(change);
      if (change === 'ceremony') registerCeremonyOpen();
      flushSync(() => setClosed(true));
    } })} />;
}
describe('both editor continuations recheck the original owner after Close', () => {
  it.each(['account', 'session', 'project', 'ceremony', 'predicate'])('does not open an existing document after Close changes %s', async change => {
    const original = vi.fn(), latest = vi.fn(); render(<CloseChangesHost change={change} original={original} latest={latest} />);
    await selectDocument(); fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2)); await act(async () => { await Promise.resolve(); });
    expect(original).not.toHaveBeenCalled(); expect(latest).not.toHaveBeenCalled(); expect(peekEditorTarget()).toBeNull();
  });
  it.each(['ceremony', 'predicate'])('does not start a document after Close changes %s', async change => {
    const original = vi.fn(), latest = vi.fn(); render(<CloseChangesHost change={change} original={original} latest={latest} />);
    await selectDocument(); fireEvent.click(screen.getByRole('button', { name: 'New document' }));
    expect(original).not.toHaveBeenCalled(); expect(latest).not.toHaveBeenCalled(); expect(peekEditorTarget()).toBeNull();
  });
  it.each(['open', 'new'])('uses the latest navigation callback after an intentional %s Close', async mode => {
    const original = vi.fn(), latest = vi.fn(); render(<CloseChangesHost change="callback" original={original} latest={latest} />);
    await selectDocument(); fireEvent.click(screen.getByRole('button', { name: mode === 'open' ? 'Open in editor' : 'New document' }));
    await waitFor(() => expect(latest).toHaveBeenCalledWith('document-authoring')); expect(original).not.toHaveBeenCalled();
    expect(peekEditorTarget()).toMatchObject({ programId: PROGRAM, docId: mode === 'open' ? DOC : null });
  });
  it('keeps an intentional close/unmount handoff current without any write', async () => {
    function Host() { const [open, setOpen] = React.useState(true); return open ? <SourceAssemblyDialog {...props({ onClose: () => flushSync(() => setOpen(false)) })} /> : null; }
    render(<Host />); await selectDocument(); fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    await waitFor(() => expect(peekEditorTarget()?.docId).toBe(DOC)); expect(screen.queryByTestId('source-assembly-dialog')).toBeNull();
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
  it.each(['project', 'ceremony', 'predicate'])('checks %s changes raised by target publication before navigation', async change => {
    let admitted = true; const onNav = vi.fn();
    render(<SourceAssemblyDialog {...props({ onNav, isCurrent: () => admitted })} />); await selectDocument();
    const changed = () => {
      if (change === 'project') changeOwner('project');
      if (change === 'ceremony') registerCeremonyOpen();
      if (change === 'predicate') admitted = false;
    };
    window.addEventListener(EDITOR_TARGET_EVENT, changed);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
      await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2)); await act(async () => { await Promise.resolve(); });
      expect(onNav).not.toHaveBeenCalled(); if (change !== 'ceremony') expect(peekEditorTarget()).toBeNull();
    } finally { window.removeEventListener(EDITOR_TARGET_EVENT, changed); }
  });
});

describe('published assembly source intent retains its original sender', () => {
  it('retires a source handoff when its sender predicate becomes false', () => {
    let current = true; setEditorTarget({ docType: null, docId: DOC, programId: PROGRAM, assemblySources: { version: 1, sources: sources() } }, () => current);
    expect(peekEditorTarget()?.assemblySources?.sources).toEqual(sources()); current = false; expect(peekEditorTarget()).toBeNull();
  });
  it('does not replace an unrelated valid target when its sender is already retired', () => {
    setEditorTarget({ docType: null, docId: DOC, programId: PROGRAM });
    setEditorTarget({ docType: null, docId: DOC, programId: PROGRAM, assemblySources: { version: 1, sources: sources() } }, () => false);
    expect(peekEditorTarget()).toMatchObject({ docId: DOC, programId: PROGRAM }); expect(peekEditorTarget()?.assemblySources).toBeUndefined();
  });
  it('rechecks sender ownership before delivering source intent to synchronous event readers', () => {
    let current = true; const onTarget = () => { current = false; };
    window.addEventListener(EDITOR_TARGET_EVENT, onTarget);
    try { setEditorTarget({ docType: null, docId: DOC, programId: PROGRAM, assemblySources: { version: 1, sources: sources() } }, () => current); }
    finally { window.removeEventListener(EDITOR_TARGET_EVENT, onTarget); }
    expect(peekEditorTarget()).toBeNull();
  });
  it('refuses mutation of an already-published raw source payload', () => {
    setEditorTarget({ docType: null, docId: DOC, programId: PROGRAM, assemblySources: { version: 1, sources: sources() } }, () => true);
    const source = window.C2C_EDITOR_TARGET!.assemblySources!.sources[0]; if (source.kind === 'data-room') source.sourceId = 999;
    expect(peekEditorTarget()).toBeNull();
  });
});

describe('retained chooser controls do not borrow a replacement scope', () => {
  it.each(['account', 'session', 'bearer', 'project'])('refuses retained choose/reload/open after %s replacement', async change => {
    const onNav = vi.fn(); const { result } = renderHook(() => useSourceAssemblyTarget(props({ onNav })));
    await waitFor(() => expect(result.current.loading).toBe(false)); const retained = result.current;
    act(() => changeOwner(change)); const before = apiRequest.mock.calls.length;
    await act(async () => { retained.choose(DOC); await retained.reload(); await retained.open(); });
    expect(result.current.selected).toBe(''); expect(result.current.documents).toEqual([]); expect(apiRequest).toHaveBeenCalledTimes(before); expect(onNav).not.toHaveBeenCalled();
  });
  it('does not revalidate an obsolete selected document after the selection is cleared', async () => {
    const { result } = renderHook(() => useSourceAssemblyTarget(props())); await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.choose(DOC)); const oldOpen = result.current.open; act(() => result.current.choose('')); const before = apiRequest.mock.calls.length;
    await act(async () => { await oldOpen(); }); expect(apiRequest).toHaveBeenCalledTimes(before); expect(peekEditorTarget()).toBeNull();
  });
  it('serializes duplicate revalidation without choosing another document', async () => {
    const pending = deferred<Response>(); const onNav = vi.fn(); const { result } = renderHook(() => useSourceAssemblyTarget(props({ onNav })));
    await waitFor(() => expect(result.current.loading).toBe(false)); act(() => result.current.choose(DOC)); apiRequest.mockReturnValueOnce(pending.promise);
    let first!: Promise<void>, second!: Promise<void>; act(() => { first = result.current.open(); second = result.current.open(); });
    expect(apiRequest).toHaveBeenCalledTimes(2); await act(async () => { pending.resolve(inventory()); await Promise.all([first, second]); });
    expect(onNav).toHaveBeenCalledExactlyOnceWith('document-authoring'); expect(peekEditorTarget()?.docId).toBe(DOC);
  });
  it('retires a pending handoff when a source payload changes in place', async () => {
    const selected = sources(), onNav = vi.fn(); const { result } = renderHook(() => useSourceAssemblyTarget(props({ sources: selected, onNav })));
    await waitFor(() => expect(result.current.loading).toBe(false)); act(() => result.current.choose(DOC));
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise); let opening!: Promise<void>;
    act(() => { opening = result.current.open(); });
    const source = selected[0]; if (source.kind === 'data-room') source.sourceId = 999;
    await act(async () => { pending.resolve(inventory()); await opening; });
    expect(onNav).not.toHaveBeenCalled(); expect(peekEditorTarget()).toBeNull(); expect(result.current.documents).toEqual([]);
  });
  it('does not deliver a delayed open after its mounted chooser unmounts', async () => {
    const onNav = vi.fn(); const { result, unmount } = renderHook(() => useSourceAssemblyTarget(props({ onNav })));
    await waitFor(() => expect(result.current.loading).toBe(false)); act(() => result.current.choose(DOC));
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise); let opening!: Promise<void>;
    act(() => { opening = result.current.open(); }); unmount();
    await act(async () => { pending.resolve(inventory()); await opening; });
    expect(onNav).not.toHaveBeenCalled(); expect(peekEditorTarget()).toBeNull();
  });
  it('does not revive retained actions after source A→B→A', async () => {
    const initial = sources(); const view = renderHook(({ selected }) => useSourceAssemblyTarget(props({ sources: selected })), { initialProps: { selected: initial } });
    await waitFor(() => expect(view.result.current.loading).toBe(false)); const retained = view.result.current;
    view.rerender({ selected: [{ kind: 'data-room', sourceId: 999, expectedChecksum: 'ab'.repeat(32) }, initial[1]] }); view.rerender({ selected: initial }); const before = apiRequest.mock.calls.length;
    await act(async () => { retained.choose(DOC); await retained.reload(); await retained.open(); });
    expect(view.result.current.documents).toEqual([]); expect(view.result.current.selected).toBe(''); expect(apiRequest).toHaveBeenCalledTimes(before);
  });
});

function launchButton(element: React.ReactElement): React.ReactElement<{ onClick: () => void }> {
  const children = React.Children.toArray((element.props as { children: React.ReactNode }).children);
  return children.find(child => React.isValidElement(child) && child.type === 'button') as React.ReactElement<{ onClick: () => void }>;
}
function hasChooser(element: React.ReactElement): boolean {
  return React.Children.toArray((element.props as { children: React.ReactNode }).children)
    .some(child => React.isValidElement(child) && child.type === SourceAssemblyDialog);
}
describe('retained launch callbacks keep their original rendered source scope', () => {
  it.each(['source', 'disabled', 'project'])('cannot launch a replacement chooser after %s changes', change => {
    const initial = { selected: sources(), disabled: false, programId: PROGRAM };
    const view = renderHook(({ selected, disabled, programId }) => SourceAssemblyAction({ programId, sources: selected, disabled }), { initialProps: initial });
    const retained = launchButton(view.result.current).props.onClick;
    if (change === 'source') view.rerender({ ...initial, selected: [{ kind: 'data-room', sourceId: 999, expectedChecksum: 'ab'.repeat(32) }, initial.selected[1]] });
    if (change === 'disabled') view.rerender({ ...initial, disabled: true });
    if (change === 'project') view.rerender({ ...initial, programId: OTHER });
    act(() => retained()); expect(hasChooser(view.result.current)).toBe(false); expect(apiRequest).not.toHaveBeenCalled();
  });
  it.each(['account', 'session', 'bearer', 'project'])('refuses a retained launch after %s replacement', change => {
    const view = renderHook(() => SourceAssemblyAction({ programId: PROGRAM, sources: sources() }));
    const retained = launchButton(view.result.current).props.onClick; act(() => changeOwner(change));
    act(() => retained()); expect(hasChooser(view.result.current)).toBe(false); expect(apiRequest).not.toHaveBeenCalled();
  });
  it('keeps a current deliberate launch reachable through the same action', () => {
    const view = renderHook(() => SourceAssemblyAction({ programId: PROGRAM, sources: sources() }));
    act(() => launchButton(view.result.current).props.onClick()); expect(hasChooser(view.result.current)).toBe(true);
  });
  it('does not revive a retained source-A launch after rendering source B then A', () => {
    const initial = sources(); const view = renderHook(({ selected }) => SourceAssemblyAction({ programId: PROGRAM, sources: selected }), { initialProps: { selected: initial } });
    const retained = launchButton(view.result.current).props.onClick;
    view.rerender({ selected: [{ kind: 'data-room', sourceId: 999, expectedChecksum: 'ab'.repeat(32) }, initial[1]] }); view.rerender({ selected: initial });
    act(() => retained()); expect(hasChooser(view.result.current)).toBe(false);
  });
});
