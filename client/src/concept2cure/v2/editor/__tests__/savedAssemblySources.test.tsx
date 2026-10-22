// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialAssemblyState, type AssemblyBucket, type AssemblyBuildOptions } from '../assemblyBuildState';
import type { SavedAssemblySources } from '@shared/authoring/saved-assembly-sources';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { authService } from '@/services/portal/authService';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import { captureAssemblyHeaders } from '../assemblyBuildTransport';
import { useAuthoringAssemblyBuild } from '../useAuthoringAssemblyBuild';
import { AuthoringAssemblyBuild } from '../AuthoringAssemblyBuild';
import { publishShellProject } from '../../shellProject';
import { __resetCeremonies, registerCeremonyOpen } from '../../ceremony';
import { getSavedAssemblySources } from '../savedAssemblySourcesTransport';
import { savedAssemblySourcesControls } from '../savedAssemblySourcesController';
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DOC = '33333333-3333-4333-8333-333333333333';
const EVENT = '44444444-4444-4444-8444-444444444444';
const actor = (id = 7) => ({ id: String(id), organizationId: '12', roles: ['author'], permissions: [] });
const bearer = (userId = 7, visit = 'original') => `fixture.${btoa(JSON.stringify({ userId, organizationId: 12, visit }))}.synthetic`;
const headers = (visit = 'original') => ({ Authorization: `Bearer ${bearer(7, visit)}`, 'x-organization-id': '12' });
const saved: SavedAssemblySources = { version: 1, docId: DOC, programId: PROGRAM, record: { eventId: EVENT, recordedAt: '2026-10-18T01:00:00.000Z', manifest: {
  version: 1, programId: PROGRAM, fingerprint: 'f'.repeat(64), limitations: ['A bounded historical reference, not a citation.'], entries: [{ source: { kind: 'data-room', sourceId: 41 }, title: 'Recorded stability report', contentHash: 'a'.repeat(64), extractedTextSha256: 'b'.repeat(64), version: '2', disposition: 'current', originalFileAvailable: false, span: { start: 10, end: 60, totalChars: 100, sha256: 'c'.repeat(64) } }],
} } };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function options(overrides: Partial<AssemblyBuildOptions> = {}): AssemblyBuildOptions { return { docId: DOC, programId: PROGRAM, docSealed: false, editorDirty: false, onStructureBuilt: vi.fn(), onReviewSection: vi.fn(), ...overrides }; }
function mount(initial = options()) { return renderHook(props => useAuthoringAssemblyBuild(props), { initialProps: initial }); }
function Ui() { return <AuthoringAssemblyBuild controller={useAuthoringAssemblyBuild(options())} />; }
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve }; }
function own() {
  const bucket: AssemblyBucket = { state: initialAssemblyState(), token: null, stopRequested: false, sourceRevision: 0, owner: {} };
  return { options: options(), key: 'owner', revision: 0, contextRevision: 0, savedReuseRevision: 0, alive: true, bucket, redraw: vi.fn(),
    authCurrent: () => { try { captureAssemblyHeaders(); return true; } catch { return false; } }, headers: captureAssemblyHeaders };
}
beforeEach(() => {
  clearAuthToken(); localStorage.clear(); sessionStorage.clear(); __resetCeremonies();
  authService.setToken(bearer(), actor(), 'fixture-refresh', 3600); publishShellProject({ id: PROGRAM });
  apiRequest.mockReset().mockImplementation(async (_method: string, path: string) => {
    if (path.includes('/assembly/sources?')) return reply({ success: true, data: saved });
    if (path === '/api/authoring/templates') return reply({ success: true, templates: [] });
    throw new Error(`Unexpected request ${path}`);
  });
});
afterEach(() => { cleanup(); __resetCeremonies(); authService.endSession(null); clearAuthToken();
  localStorage.clear(); sessionStorage.clear(); delete window.C2C_PROJECT; vi.unstubAllGlobals(); });
describe('explicit saved source reference checks', () => {
  it('does not fetch on mount and permits a read-only frozen viewer to inspect historical references', async () => {
    const view = mount(options({ docSealed: true, editRefusal: 'Viewing only', editorDirty: true }));
    expect(apiRequest).not.toHaveBeenCalled();
    await act(async () => { await view.result.current.checkSavedSources(); });
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith('GET', `/api/authoring/docs/${DOC}/assembly/sources?programId=${PROGRAM}`, undefined, headers());
    expect(view.result.current.savedSources).toMatchObject({ phase: 'recorded', data: saved });
    expect(view.result.current.sourceSelection).toBeUndefined();
  });
  it('rechecks the same exact saved record before adopting selectors and never writes or generates', async () => {
    const view = mount(); await act(async () => { await view.result.current.checkSavedSources(); });
    expect(view.result.current.sourceSelection).toBeUndefined();
    await act(async () => { await view.result.current.useSavedSources(); });
    expect(apiRequest.mock.calls.map(call => call[0])).toEqual(['GET', 'GET']);
    expect(view.result.current.sourceSelection).toEqual(saved.record!.manifest.entries.map(entry => entry.source));
    expect(view.result.current.plan).toBeNull(); expect(view.result.current.slots).toEqual([]);
  });
  it('offers the explicit check in the existing build disclosure', () => {
    render(<Ui />);
    expect(screen.getByRole('button', { name: 'Check saved sources' })).not.toBeNull();
    expect(screen.queryByText('Recorded stability report')).toBeNull();
  });
  it('distinguishes admitted empty history from a later failed read without touching editing state', async () => {
    const view = mount(); act(() => { view.result.current.setReason('Keep the existing build reason.'); view.result.current.setWithAna(true); });
    apiRequest.mockResolvedValueOnce(reply({ success: true, data: { ...saved, record: null } }));
    await act(async () => { await view.result.current.checkSavedSources(); });
    expect(view.result.current.savedSources.phase).toBe('empty');
    apiRequest.mockResolvedValueOnce(reply({ success: false, message: 'Current reference validation is unavailable.' }, 503));
    await act(async () => { await view.result.current.checkSavedSources(); });
    expect(view.result.current.savedSources).toMatchObject({ phase: 'failed', message: 'Current reference validation is unavailable.' });
    expect(view.result.current.reason).toBe('Keep the existing build reason.'); expect(view.result.current.withAna).toBe(true);
    expect(view.result.current.sourceSelection).toBeUndefined(); expect(view.result.current.phase).toBe('idle');
  });
  it('adopts no old build preferences and does not invoke editor refresh or review navigation', async () => {
    const props = options(); const view = mount(props);
    act(() => { view.result.current.setReason('My next independent reason.'); view.result.current.setWithAna(true); view.result.current.setRequirements('My next requirements.'); });
    await act(async () => { await view.result.current.checkSavedSources(); await view.result.current.useSavedSources(); });
    expect(view.result.current).toMatchObject({ templateId: '', reason: 'My next independent reason.', requirements: 'My next requirements.', withAna: true, plan: null, receipt: null, phase: 'idle' });
    expect(props.onStructureBuilt).not.toHaveBeenCalled(); expect(props.onReviewSection).not.toHaveBeenCalled();
  });
  it('requires clearing an explicit new selection and checking again before reuse', async () => {
    const view = mount(); await act(async () => { await view.result.current.checkSavedSources(); });
    act(() => view.result.current.adoptSources([{ kind: 'data-room', sourceId: 42 }]));
    expect(view.result.current.savedSources.phase).toBe('idle');
    await act(async () => { await view.result.current.checkSavedSources(); await view.result.current.useSavedSources(); });
    expect(view.result.current.sourceSelection).toEqual([{ kind: 'data-room', sourceId: 42 }]);
    expect(apiRequest).toHaveBeenCalledTimes(2);
    act(() => view.result.current.adoptSources(null));
    expect(view.result.current.savedSources.phase).toBe('idle');
    await act(async () => { await view.result.current.useSavedSources(); }); expect(apiRequest).toHaveBeenCalledTimes(2);
    await act(async () => { await view.result.current.checkSavedSources(); await view.result.current.useSavedSources(); });
    expect(apiRequest).toHaveBeenCalledTimes(4); expect(view.result.current.sourceSelection).toEqual([{ kind: 'data-room', sourceId: 41 }]);
  });
});
describe('exact historical read receipts', () => {
  it.each([
    ['no affirmative envelope', { data: saved }],
    ['wrong document', { success: true, data: { ...saved, docId: OTHER } }],
    ['wrong project', { success: true, data: { ...saved, programId: OTHER } }],
    ['missing record', { success: true, data: { version: 1, docId: DOC, programId: PROGRAM } }],
    ['invalid time', { success: true, data: { ...saved, record: { ...saved.record, recordedAt: 'yesterday' } } }],
    ['invalid manifest', { success: true, data: { ...saved, record: { ...saved.record, manifest: { ...saved.record!.manifest, fingerprint: 'unknown' } } } }],
  ])('refuses %s instead of claiming empty history', async (_label, response) => {
    apiRequest.mockResolvedValueOnce(reply(response)); const view = mount();
    await act(async () => { await view.result.current.checkSavedSources(); });
    expect(view.result.current.savedSources.phase).toBe('failed'); expect(view.result.current.savedSources.data).toBeUndefined();
    await act(async () => { await view.result.current.useSavedSources(); });
    expect(apiRequest).toHaveBeenCalledTimes(1); expect(view.result.current.sourceSelection).toBeUndefined();
  });
  it.each([
    ['new event', { ...saved.record!, eventId: OTHER }],
    ['new event time', { ...saved.record!, recordedAt: '2026-10-18T02:00:00.000Z' }],
    ['new manifest', { ...saved.record!, manifest: { ...saved.record!.manifest, fingerprint: 'd'.repeat(64) } }],
    ['no latest record', null],
  ])('refuses %s between Check and Use without choosing another record', async (_label, record) => {
    const view = mount(); await act(async () => { await view.result.current.checkSavedSources(); });
    apiRequest.mockResolvedValueOnce(reply({ success: true, data: { ...saved, record } }));
    await act(async () => { await view.result.current.useSavedSources(); });
    expect(view.result.current.savedSources).toMatchObject({ phase: 'failed', message: expect.stringContaining('changed') });
    expect(view.result.current.sourceSelection).toBeUndefined(); expect(view.result.current.plan).toBeNull();
  });
  it('checks ownership again after JSON parsing, never publishing a late private result', async () => {
    const parsed = deferred<unknown>(); let current = true;
    apiRequest.mockResolvedValueOnce({ ok: true, status: 200, json: () => parsed.promise });
    const read = getSavedAssemblySources(DOC, PROGRAM, () => current, headers());
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1)); current = false; parsed.resolve({ success: true, data: saved });
    expect(await read).toMatchObject({ ok: false, stale: true });
  });
});
describe('saved-reference ownership and synchronous lanes', () => {
  it('coalesces immediate Check and Use attempts without a second active historical read', async () => {
    const view = mount(); const first = deferred<Response>(); apiRequest.mockReturnValueOnce(first.promise);
    let pending!: Promise<void>; act(() => { pending = view.result.current.checkSavedSources(); });
    await act(async () => { await view.result.current.checkSavedSources(); await view.result.current.useSavedSources(); });
    expect(apiRequest).toHaveBeenCalledTimes(1);
    await act(async () => { first.resolve(reply({ success: true, data: saved })); await pending; });
    const second = deferred<Response>(); apiRequest.mockReturnValueOnce(second.promise);
    act(() => { pending = view.result.current.useSavedSources(); });
    await act(async () => { await view.result.current.useSavedSources(); await view.result.current.checkSavedSources(); });
    expect(apiRequest).toHaveBeenCalledTimes(2);
    await act(async () => { second.resolve(reply({ success: true, data: saved })); await pending; });
    expect(view.result.current.sourceSelection).toEqual([{ kind: 'data-room', sourceId: 41 }]);
  });
  it.each(['project', 'document', 'account', 'session', 'source'] as const)('hides historical metadata after %s ABA and requires a fresh Check', async kind => {
    const view = mount(); await act(async () => { await view.result.current.checkSavedSources(); });
    if (kind === 'project') act(() => { publishShellProject({ id: OTHER }); publishShellProject({ id: PROGRAM }); });
    if (kind === 'document') { view.rerender(options({ docId: OTHER })); view.rerender(options()); }
    if (kind === 'account') act(() => { authService.setToken(bearer(8), actor(8), 'other-refresh', 3600); view.rerender(options()); authService.setToken(bearer(), actor(), 'restored-refresh', 3600); view.rerender(options()); });
    if (kind === 'session') act(() => { authService.setToken(bearer(7, 'replacement'), actor(), 'replacement-refresh', 3600); view.rerender(options()); });
    if (kind === 'source') act(() => { view.result.current.adoptSources([{ kind: 'data-room', sourceId: 42 }]); view.result.current.adoptSources(null); });
    expect(view.result.current.savedSources).toMatchObject({ phase: 'idle', message: '' });
    await act(async () => { await view.result.current.useSavedSources(); }); expect(apiRequest).toHaveBeenCalledTimes(1);
    await act(async () => { await view.result.current.checkSavedSources(); }); expect(view.result.current.savedSources.phase).toBe('recorded');
  });
  it.each(['dirty', 'review'] as const)('does not admit a late reuse after %s opens and closes during its read', async kind => {
    const view = mount(); await act(async () => { await view.result.current.checkSavedSources(); });
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise); let use!: Promise<void>;
    act(() => { use = view.result.current.useSavedSources(); });
    view.rerender(options(kind === 'dirty' ? { editorDirty: true } : { savedSourceReuseRefusal: 'Close the draft review before reusing saved sources.' }));
    view.rerender(options());
    await act(async () => { pending.resolve(reply({ success: true, data: saved })); await use; });
    expect(view.result.current.sourceSelection).toBeUndefined(); expect(view.result.current.savedSources.phase).toBe('failed');
  });
  it('does not let a retired finalizer release a newer Check after a document round trip', async () => {
    const view = mount(); const first = deferred<Response>(); apiRequest.mockReturnValueOnce(first.promise); let old!: Promise<void>;
    act(() => { old = view.result.current.checkSavedSources(); });
    view.rerender(options({ docId: OTHER })); view.rerender(options());
    const second = deferred<Response>(); apiRequest.mockReturnValueOnce(second.promise); let latest!: Promise<void>;
    act(() => { latest = view.result.current.checkSavedSources(); });
    await act(async () => { first.resolve(reply({ success: true, data: saved })); await old; });
    expect(view.result.current.savedSources.phase).toBe('checking');
    await act(async () => { await view.result.current.checkSavedSources(); }); expect(apiRequest).toHaveBeenCalledTimes(2);
    await act(async () => { second.resolve(reply({ success: true, data: saved })); await latest; });
    expect(view.result.current.savedSources.phase).toBe('recorded');
  });
  it('never lets a pending Use replace a new selection or revive after source ABA', async () => {
    const view = mount(); await act(async () => { await view.result.current.checkSavedSources(); });
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise); let use!: Promise<void>;
    act(() => { use = view.result.current.useSavedSources(); });
    act(() => { view.result.current.adoptSources([{ kind: 'data-room', sourceId: 42 }]); view.result.current.adoptSources(null); });
    await act(async () => { pending.resolve(reply({ success: true, data: saved })); await use; });
    expect(view.result.current.sourceSelection).toBeUndefined(); expect(view.result.current.savedSources.phase).toBe('idle');
    await act(async () => { await view.result.current.useSavedSources(); }); expect(apiRequest).toHaveBeenCalledTimes(2);
  });
});
describe('historical reads do not release write or review holds', () => {
  it.each(['dirty', 'sealed', 'view-only', 'ceremony', 'building', 'unknown', 'accept-unknown', 'review-pane'] as const)('allows Check but refuses Use during %s', async kind => {
    const owner = own();
    if (kind === 'dirty') owner.options.editorDirty = true;
    if (kind === 'sealed') owner.options.docSealed = true;
    if (kind === 'view-only') owner.options.editRefusal = 'Viewing only';
    if (kind === 'ceremony') registerCeremonyOpen();
    if (kind === 'building' || kind === 'unknown') owner.bucket.state.phase = kind;
    if (kind === 'review-pane') owner.options.savedSourceReuseRefusal = 'Close the draft review before reusing saved sources.';
    if (kind === 'accept-unknown') owner.bucket.state.slots = [{ section: { id: EVENT, doc_id: DOC, code: '1', title: 'Section', content: '', order_index: 0, updated_at: null }, status: 'ready', review: { draft: null, body: 'Retain my edited review', changeReason: 'Retain review reason', refusal: null, acceptUnknown: true }, draftRegion: 'FDA', referenceContext: '', sourceSelectionKey: '' }];
    const state = owner.bucket.state; const before = JSON.parse(JSON.stringify(state)); const adopt = vi.fn(() => true);
    await savedAssemblySourcesControls(owner, adopt).checkSavedSources();
    expect(savedAssemblySourcesControls(owner, adopt).savedSources.phase).toBe('recorded');
    expect(savedAssemblySourcesControls(owner, adopt).savedSourcesReuseDisabledReason).not.toBeNull();
    await savedAssemblySourcesControls(owner, adopt).useSavedSources();
    expect(apiRequest).toHaveBeenCalledTimes(1); expect(adopt).not.toHaveBeenCalled(); expect(owner.bucket.state).toEqual(before);
  });
  it('ignores a late Use when an ordinary build lane started and ended during the read', async () => {
    const owner = own(); const adopt = vi.fn(() => true); await savedAssemblySourcesControls(owner, adopt).checkSavedSources();
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise);
    const use = savedAssemblySourcesControls(owner, adopt).useSavedSources();
    owner.bucket.token = {}; owner.bucket.state.phase = 'idle';
    pending.resolve(reply({ success: true, data: saved })); await use;
    expect(adopt).not.toHaveBeenCalled(); expect(savedAssemblySourcesControls(owner, adopt).savedSources.phase).toBe('failed');
  });
});

describe('saved reference native credential ownership', () => {
  it('refuses a mismatched bearer before a new Check can start without rerendering', async () => {
    const view = mount(); const previous = view.result.current;
    setAuthToken(bearer(8));
    await act(async () => { await previous.checkSavedSources(); });
    expect(apiRequest).not.toHaveBeenCalled(); expect(view.result.current.savedSources.data).toBeUndefined();
  });
  it.each(['check', 'reuse'] as const)('hides a late %s after bearer claims change before rerendering', async stage => {
    const view = mount();
    if (stage === 'reuse') await act(async () => { await view.result.current.checkSavedSources(); });
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise); let request!: Promise<void>;
    act(() => { request = stage === 'check' ? view.result.current.checkSavedSources() : view.result.current.useSavedSources(); });
    setAuthToken(bearer(8));
    await act(async () => { pending.resolve(reply({ success: true, data: saved })); await request; });
    expect(view.result.current.savedSources.data).toBeUndefined(); expect(view.result.current.sourceSelection).toBeUndefined();
    const count = apiRequest.mock.calls.length;
    await act(async () => { await view.result.current.checkSavedSources(); await view.result.current.useSavedSources(); });
    expect(apiRequest).toHaveBeenCalledTimes(count);
  });
  it.each(['check', 'reuse'] as const)('keeps a pending %s through genuine same-revision refresh with captured credentials', async stage => {
    const view = mount();
    if (stage === 'reuse') await act(async () => { await view.result.current.checkSavedSources(); });
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise); let request!: Promise<void>;
    act(() => { request = stage === 'check' ? view.result.current.checkSavedSources() : view.result.current.useSavedSources(); });
    const session = authService.captureSessionReadGuard();
    vi.stubGlobal('fetch', vi.fn(async () => reply({ accessToken: bearer(7, 'refreshed'), refreshToken: 'next-refresh', expiresIn: 3600 })));
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    expect(session.sameRevision()).toBe(true);
    await act(async () => { pending.resolve(reply({ success: true, data: saved })); await request; });
    for (const call of apiRequest.mock.calls) expect(call[3]).toEqual(headers());
    if (stage === 'check') expect(view.result.current.savedSources).toMatchObject({ phase: 'recorded', data: saved });
    else expect(view.result.current.sourceSelection).toEqual(saved.record!.manifest.entries.map(entry => entry.source));
  });
});
