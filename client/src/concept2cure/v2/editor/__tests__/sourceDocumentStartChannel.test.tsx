// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { authService } from '@/services/portal/authService';
import { clearShellProject, publishShellProject } from '../../shellProject';
import { clearEditorTarget, consumeEditorTarget, EDITOR_TARGET_EVENT, EDITOR_TARGET_TTL_MS,
  editorTargetFromSearch, peekEditorTarget, setEditorTarget, type EditorTarget } from '../../editorTarget';
import { SourceAssemblyAction } from '../SourceAssemblyDialog';
import { captureSourceDocumentStartIntent } from '../assemblySourceIntent';
import { __resetCeremonies, registerCeremonyOpen } from '../../ceremony';
import type { AssemblySourceSelector } from '@shared/authoring/assembly-sources';

const PROGRAM = '11111111-1111-4111-8111-111111111511';
const OTHER = '11111111-1111-4111-8111-111111111512';
const DOCUMENT = '22222222-2222-4222-8222-222222222511';
const VAULT = '33333333-3333-4333-8333-333333333511';
const selections = () => [{ kind: 'data-room' as const, sourceId: 511, expectedChecksum: 'ab'.repeat(32) },
  { kind: 'vault' as const, documentId: VAULT, expectedChecksum: 'cd'.repeat(32) }];
const start = () => ({ docType: null, docId: null, programId: PROGRAM,
  sourceDocumentStart: { version: 1 as const, sources: selections() } });
const invalidSelections: Array<{ name: string; sources: AssemblySourceSelector[] }> = [
  { name: 'empty selection', sources: [] },
  { name: 'invalid identity', sources: [{ kind: 'data-room', sourceId: 0 }] },
  { name: 'duplicate identity', sources: [{ kind: 'data-room', sourceId: 1 }, { kind: 'data-room', sourceId: 1 }] },
];
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const user = (id = '511', organizationId = '51') => ({ id, organizationId, organizationName: null,
  email: 'source-start@example.test', displayName: 'Synthetic author', firstName: 'Synthetic', lastName: 'Author',
  roles: ['author'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false });
const bearer = (visit = 'initial', id = '511', organizationId = '51') => `fixture.${btoa(JSON.stringify({ userId: Number(id), organizationId: Number(organizationId), visit }))}.synthetic`;
beforeEach(async () => {
  localStorage.clear(); sessionStorage.clear(); clearEditorTarget(); __resetCeremonies();
  vi.stubGlobal('fetch', vi.fn(async () => ok({ authenticated: true, user: user() })));
  await authService.adoptSession(bearer());
  publishShellProject({ id: PROGRAM, title: 'Source start project' });
  apiRequest.mockReset().mockImplementation(async () => ok({ success: true, documents: [] }));
});
afterEach(() => {
  cleanup(); clearEditorTarget(); clearShellProject(); __resetCeremonies(); authService.endSession(null);
  localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('source-start ownership after the existing editor receives it', () => {
  it('deep-copies selectors at publication and read, and rejects a copied raw command', () => {
    const request = start(); setEditorTarget(request);
    const original = request.sourceDocumentStart.sources[0];
    if (original.kind === 'data-room') original.sourceId = 999;
    const read = peekEditorTarget()!;
    expect(read.sourceDocumentStart?.sources).toEqual(selections());
    const received = read.sourceDocumentStart!.sources[0];
    if (received.kind === 'data-room') received.sourceId = 998;
    expect(captureSourceDocumentStartIntent(read, () => true)).toBeNull();
    expect(peekEditorTarget()?.sourceDocumentStart?.sources).toEqual(selections());
    window.C2C_EDITOR_TARGET = { ...window.C2C_EDITOR_TARGET! };
    expect(peekEditorTarget()).toBeNull();
  });
  it('refuses a direct copied receiver value instead of assigning it new ownership', () => {
    setEditorTarget(start()); const received = consumeEditorTarget()!;
    expect(captureSourceDocumentStartIntent({ ...received }, () => true)).toBeNull();
    expect(captureSourceDocumentStartIntent(received, () => true)?.current()).toBe(true);
  });
  it('keeps a received form current after channel TTL, but does not admit a fresh capture of the expired command', () => {
    setEditorTarget(start()); const received = consumeEditorTarget()!;
    const intent = captureSourceDocumentStartIntent(received, () => true)!;
    expect(intent.current()).toBe(true);
    vi.spyOn(Date, 'now').mockReturnValue(received.setAt + EDITOR_TARGET_TTL_MS + 10);
    expect(intent.current()).toBe(true);
    expect(captureSourceDocumentStartIntent(received, () => true)).toBeNull();
  });
  it('retires a received intent when its admitted receiver is replaced', () => {
    let admitted = true;
    setEditorTarget(start()); const intent = captureSourceDocumentStartIntent(consumeEditorTarget()!, () => admitted)!;
    expect(intent.current()).toBe(true); admitted = false; expect(intent.current()).toBe(false);
  });
  it('does not let a caller mutate received selectors into a different source selection', () => {
    setEditorTarget(start()); const intent = captureSourceDocumentStartIntent(consumeEditorTarget()!, () => true)!;
    const selected = intent.sources[0];
    if (selected.kind === 'data-room') selected.sourceId = 997;
    expect(intent.current()).toBe(false);
  });
  it('retires raw-payload or timestamp tampering without a plain-target fallback', () => {
    setEditorTarget(start());
    window.C2C_EDITOR_TARGET!.setAt += 1;
    expect(peekEditorTarget()).toBeNull();
    setEditorTarget(start());
    const source = window.C2C_EDITOR_TARGET!.sourceDocumentStart!.sources[0];
    if (source.kind === 'data-room') source.sourceId = 996;
    expect(peekEditorTarget()).toBeNull();
  });
  it.each(['project round trip', 'account change', 'organization change', 'session replacement'])('retires received and pending starts after %s', async change => {
    setEditorTarget(start()); const received = peekEditorTarget()!;
    const intent = captureSourceDocumentStartIntent(received, () => true)!;
    if (change === 'project round trip') { publishShellProject({ id: OTHER }); publishShellProject({ id: PROGRAM }); }
    else {
      vi.stubGlobal('fetch', vi.fn(async () => ok({ authenticated: true,
        user: change === 'account change' ? user('512') : change === 'organization change' ? user('511', '52') : user() })));
      await authService.adoptSession(bearer('replacement', change === 'account change' ? '512' : '511', change === 'organization change' ? '52' : '51'));
    }
    expect(intent.current()).toBe(false); expect(peekEditorTarget()).toBeNull();
  });
  it('keeps the source intent through a real same-session token refresh', async () => {
    authService.setToken(bearer('before-refresh'), user(), 'synthetic-refresh-token', 3600);
    setEditorTarget(start()); const intent = captureSourceDocumentStartIntent(consumeEditorTarget()!, () => true)!;
    vi.stubGlobal('fetch', vi.fn(async () => ok({ accessToken: bearer('after-refresh'),
      refreshToken: 'synthetic-next-refresh', expiresIn: 3600 })));
    expect(await authService.refreshToken()).toBe(true);
    expect(intent.current()).toBe(true);
  });
  it.each(['source changed', 'source withdrawn'])('retires an inline start after %s, including a later return', async change => {
    const props = { programId: PROGRAM, sources: selections(), onNav: vi.fn() };
    const view = render(<SourceAssemblyAction {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Build in editor' }));
    await screen.findByText('No working documents are available in this project.');
    fireEvent.click(screen.getByRole('button', { name: 'New document' }));
    const intent = captureSourceDocumentStartIntent(consumeEditorTarget()!, () => true)!;
    expect(intent.current()).toBe(true);
    view.rerender(<SourceAssemblyAction {...props} sources={change === 'source changed' ? [{ kind: 'data-room', sourceId: 998 }] : props.sources}
      disabled={change === 'source withdrawn'} />);
    expect(intent.current()).toBe(false);
    view.rerender(<SourceAssemblyAction {...props} />);
    expect(intent.current()).toBe(false);
  });
});

describe('owned source-document start through the existing target channel', () => {
  it('preserves both original namespaces and checksums without claiming an existing document', () => {
    setEditorTarget(start());
    expect(peekEditorTarget()).toMatchObject({ docId: null, programId: PROGRAM,
      sourceDocumentStart: { version: 1, sources: selections() } });
    expect(peekEditorTarget()?.assemblySources).toBeUndefined();
    expect(consumeEditorTarget()).toMatchObject({ sourceDocumentStart: { sources: selections() } });
    expect(peekEditorTarget()).toBeNull();
  });
  it('does not turn an unowned raw command into an ordinary editor target', () => {
    window.C2C_EDITOR_TARGET = { ...start(), setAt: Date.now() } as EditorTarget;
    expect(peekEditorTarget()).toBeNull();
  });
  it('rejects a command mixed with an existing document target', () => {
    setEditorTarget({ ...start(), docId: DOCUMENT });
    expect(peekEditorTarget()).toBeNull();
  });
  it('rejects a command mixed with ordinary assembly sources', () => {
    setEditorTarget({ ...start(), docId: DOCUMENT, assemblySources: { version: 1, sources: selections() } });
    expect(peekEditorTarget()).toBeNull();
  });
  it.each(invalidSelections)('refuses $name instead of a plain target fallback', ({ sources }) => {
    const request = { ...start(), sourceDocumentStart: { version: 1 as const, sources } };
    setEditorTarget(request);
    expect(peekEditorTarget()).toBeNull();
  });
  it('keeps the existing UUID requirement for ordinary assembly and does not reconstruct starts from a URL', () => {
    setEditorTarget({ docType: null, programId: PROGRAM, assemblySources: { version: 1, sources: selections() } });
    expect(peekEditorTarget()).toBeNull();
    expect(editorTargetFromSearch(`?program=${PROGRAM}&sourceDocumentStart=untrusted`)).toBeNull();
    expect(editorTargetFromSearch(`?documentId=${DOCUMENT}&program=${PROGRAM}&sourceDocumentStart=untrusted`))
      .not.toHaveProperty('sourceDocumentStart');
  });
  it('keeps channel expiry at admission rather than allowing an old pending command', () => {
    setEditorTarget(start());
    expect(peekEditorTarget(Date.now() + EDITOR_TARGET_TTL_MS + 10)).toBeNull();
  });
});

describe('existing source chooser starts the canonical form through its owned receiver', () => {
  it('retains selected sources after intentional chooser/action unmount without POST or pre-mount form event', async () => {
    const onNav = vi.fn(); const requested = vi.fn();
    window.addEventListener('c2c:new-document', requested);
    const view = render(<SourceAssemblyAction programId={PROGRAM} sources={selections()} onNav={onNav} />);
    fireEvent.click(screen.getByRole('button', { name: 'Build in editor' }));
    await screen.findByText('No working documents are available in this project.');
    fireEvent.click(screen.getByRole('button', { name: 'New document' }));
    expect(onNav).toHaveBeenCalledWith('document-authoring');
    expect(requested).not.toHaveBeenCalled();
    expect(screen.queryByTestId('source-assembly-dialog')).toBeNull();
    view.unmount();
    expect(peekEditorTarget()).toMatchObject({ docId: null, programId: PROGRAM,
      sourceDocumentStart: { version: 1, sources: selections() } });
    expect(apiRequest.mock.calls.filter(([method]) => method !== 'GET')).toHaveLength(0);
    window.removeEventListener('c2c:new-document', requested);
  });
  it('holds the start while another governed form is open', async () => {
    const onNav = vi.fn();
    render(<SourceAssemblyAction programId={PROGRAM} sources={selections()} onNav={onNav} />);
    fireEvent.click(screen.getByRole('button', { name: 'Build in editor' }));
    await screen.findByText('No working documents are available in this project.');
    const release = registerCeremonyOpen();
    fireEvent.click(screen.getByRole('button', { name: 'New document' }));
    expect(peekEditorTarget()).toBeNull(); expect(onNav).not.toHaveBeenCalled(); release();
  });
  it('registers start ownership before delivering the existing editor event', () => {
    const received: Array<EditorTarget | null> = [];
    const listener = () => received.push(peekEditorTarget());
    window.addEventListener(EDITOR_TARGET_EVENT, listener);
    try { setEditorTarget(start()); } finally { window.removeEventListener(EDITOR_TARGET_EVENT, listener); }
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ sourceDocumentStart: { sources: selections() } });
  });
});
