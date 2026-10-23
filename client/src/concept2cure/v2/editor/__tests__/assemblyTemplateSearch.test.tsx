// @vitest-environment jsdom
/** Canonical assembly controller/picker; catalogue and preview HTTP are synthetic. */
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssemblyBuildOptions } from '../assemblyBuildState';
import type { AssemblyPreviewInput } from '@shared/authoring/assembly';
import type { AssemblySourceManifest, AssemblySourceSelector } from '@shared/authoring/assembly-sources';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { useAuthoringAssemblyBuild } from '../useAuthoringAssemblyBuild';
import { AuthoringAssemblyBuild } from '../AuthoringAssemblyBuild';
import { clearShellProject, publishShellProject } from '../../shellProject';

const PROGRAM = '11111111-1111-4111-8111-111111111691';
const OTHER = '11111111-1111-4111-8111-111111111692';
const DOC = '22222222-2222-4222-8222-222222222691';
const NEXT = '22222222-2222-4222-8222-222222222692';
const ID = 'builtin:jp-device-plan';
const ACTOR = { id: '7', organizationId: '12', roles: ['admin'], permissions: ['governed:write'] };
const bearer = (visit = 'initial') => `fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 12, visit }))}.synthetic`;
const metadata = { id: ID, name: 'Clinical evaluation outline', module: null, description: 'Japanese diagnostics preparation',
  template_type: 'clinical', category: 'device evidence', regions: ['JP'], entryId: 'registry:jp-device-plan',
  kind: 'preparation', authoringMode: 'manual', originalFormat: 'native', families: ['diagnostics'],
  limitations: ['Evidence and specialist review are required.'], filingContext: { registryId: 'jp-device-plan', region: 'JP', agency: 'PMDA' } };
const second = { id: 17, title: 'Internal strategy', description: 'Shared research planning', regions: ['GLOBAL'] };
const selectors: AssemblySourceSelector[] = [{ kind: 'data-room', sourceId: 41 }];
const manifest = (sources: AssemblySourceSelector[]): AssemblySourceManifest => ({ version: 1, programId: PROGRAM,
  fingerprint: 'a'.repeat(64), limitations: ['Recorded excerpts only'], entries: sources.map(source => ({ source,
    title: 'Saved diagnostics evidence', contentHash: 'b'.repeat(64), extractedTextSha256: 'c'.repeat(64), version: 'v1',
    originalFileAvailable: true, disposition: 'current', span: { start: 0, end: 30, totalChars: 100, sha256: 'd'.repeat(64) } })) });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve }; }
const options = (): AssemblyBuildOptions => ({ docId: DOC, programId: PROGRAM, docSealed: false, editorDirty: false,
  onStructureBuilt: vi.fn(), onReviewSection: vi.fn() });
let templates: unknown[];
function mount(overrides: Partial<AssemblyBuildOptions> = {}) {
  const initial = { ...options(), ...overrides };
  return renderHook(props => useAuthoringAssemblyBuild(props), { initialProps: initial });
}
type View = ReturnType<typeof mount>;
type SearchController = View['result']['current'] & { templateQuery?: string; setTemplateQuery?: (query: string) => void };
const query = (view: View) => (view.result.current as SearchController).templateQuery;
const editQuery = (view: View, value: string) => act(() => (view.result.current as SearchController).setTemplateQuery?.(value));
async function loaded(view: View) { await act(async () => { await view.result.current.loadTemplates(); }); }
function Surface({ overrides = {} }: { overrides?: Partial<AssemblyBuildOptions> }) {
  const controller = useAuthoringAssemblyBuild({ ...options(), ...overrides }); return <AuthoringAssemblyBuild controller={controller} />;
}
async function surface(overrides: Partial<AssemblyBuildOptions> = {}) {
  const view = render(<Surface overrides={overrides} />);
  const details = screen.getByText('Build document or section').closest('details')!;
  details.open = true; fireEvent(details, new Event('toggle'));
  await waitFor(() => expect(screen.getByRole('option', { name: metadata.name })).toBeTruthy());
  return view;
}
beforeEach(() => {
  authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(bearer(), ACTOR, 'fixture-refresh', 3600); publishShellProject({ id: PROGRAM });
  templates = [metadata, second];
  apiRequest.mockReset().mockImplementation(async (_method: string, path: string, input: AssemblyPreviewInput) => {
    if (path === '/api/authoring/templates') return response({ success: true, templates });
    if (path.endsWith('/assembly/preview')) return response({ success: true, data: {
      version: 1, docId: DOC, programId: input.programId, templateId: input.templateId, selection: input.selection,
      fingerprint: 'exact-preview', targetSnapshot: 'saved-target', templateSnapshot: 'loaded-template', templateName: metadata.name,
      draftRegion: 'PMDA', limitations: ['Preparation only'], gaps: [], rows: [{ code: 'purpose', title: 'Purpose', content: '',
        ordering: 0, disposition: 'append', aiDraftable: false, aiDraftableReason: 'Manual preparation', gaps: [] }],
      ...(input.sources ? { sources: manifest(input.sources) } : {}),
    } });
    return response({ success: false, message: 'Response unavailable' }, 503);
  });
});
afterEach(() => { cleanup(); authService.endSession(null); clearAuthToken(); clearShellProject(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });

describe('assembly preserves only safe loaded search metadata', () => {
  it('keeps regional/manual/shared display facts and exact string/numeric identities', async () => {
    templates = [{ ...metadata, accidentalPayload: { instruction: 'never copy arbitrary properties' } }, second];
    const view = mount(); await loaded(view);
    expect(view.result.current.templates).toEqual([metadata, { ...second, id: '17', name: second.title }]);
  });
  it('drops malformed optional display facts without dropping a valid template', async () => {
    templates = [{ id: ID, name: metadata.name, description: {}, regions: { JP: true }, families: false,
      limitations: [null, 7], filingContext: { region: 'JP' } }];
    const view = mount(); await loaded(view);
    expect(view.result.current.templates).toEqual([{ id: ID, name: metadata.name }]);
    expect(view.result.current.rosterError).toBeNull();
  });
  it('keeps valid fallback names when earlier aliases are blank', async () => {
    templates = [{ id: ID, name: '', title: ' ', template_name: 'Verified fallback outline' }];
    const view = mount(); await loaded(view);
    expect(view.result.current.templates[0]?.name).toBe('Verified fallback outline');
  });
  it.each([
    [{ id: '', name: 'Empty identity' }], [{ id: ' padded ', name: 'Padded identity' }],
    [{ id: 0, name: 'Zero identity' }], [{ id: 1.5, name: 'Fractional identity' }],
    [{ id: ID, name: '' }], [{ id: ID, name: '   ' }],
    [{ id: ID, name: 'A' }, { id: ID, name: 'B' }], [{ id: 17, name: 'A' }, { id: '17', name: 'B' }],
  ].map(rows => ({ rows })))('refuses an invalid or colliding complete roster $rows', async ({ rows }) => {
    templates = rows;
    const view = mount(); await loaded(view);
    expect(view.result.current.templates).toEqual([]);
    expect(view.result.current.rosterError).toMatch(/roster.*confirmed/i);
  });
});

describe('query changes are local to the current assembly visit', () => {
  it('changes only the query and preserves the selected template, plan, requirements and sources', async () => {
    const view = mount(); await loaded(view);
    act(() => { expect(view.result.current.adoptSources(selectors)).toBe(true); });
    await act(async () => { await view.result.current.chooseTemplate(ID); await view.result.current.preview(); });
    act(() => { view.result.current.setReason('Use this saved source outline'); view.result.current.setRequirements('Compare documented endpoints'); view.result.current.setWithAna(true); });
    const before = view.result.current; const calls = apiRequest.mock.calls.length;
    editQuery(view, 'PMDA');
    expect(query(view)).toBe('PMDA');
    expect(view.result.current.plan).toBe(before.plan); expect(view.result.current.templateId).toBe(ID);
    expect(before.plan?.sources).toEqual(manifest(selectors)); expect(before.sourceSelection).toEqual(selectors);
    expect(view.result.current).toMatchObject({ reason: before.reason, requirements: before.requirements, withAna: before.withAna,
      sourceSelection: before.sourceSelection, slots: before.slots, outline: before.outline, phase: before.phase });
    expect(apiRequest.mock.calls).toHaveLength(calls);
    editQuery(view, ''); expect(query(view)).toBe(''); expect(view.result.current.plan).toBe(before.plan);
  });
  it.each(['document', 'project', 'session', 'account'])('rejects a retained query callback after a %s visit changes', async change => {
    const view = mount(); await loaded(view); editQuery(view, 'Original query');
    const stale = (view.result.current as SearchController).setTemplateQuery;
    if (change === 'document') { view.rerender({ ...options(), docId: NEXT }); view.rerender(options()); }
    if (change === 'project') {
      act(() => publishShellProject({ id: OTHER })); view.rerender({ ...options(), programId: OTHER });
      act(() => publishShellProject({ id: PROGRAM })); view.rerender(options());
    }
    if (change === 'session') act(() => authService.setToken(bearer('replacement'), ACTOR, 'new-session', 3600));
    if (change === 'account') act(() => authService.setToken(`fixture.${btoa(JSON.stringify({ userId: 8, organizationId: 12 }))}.synthetic`, { ...ACTOR, id: '8' }, 'new-account', 3600));
    const before = query(view); act(() => stale?.('Stale callback wrote here'));
    expect(query(view)).toBe(before); expect(query(view)).not.toBe('Stale callback wrote here');
  });
  it('keeps the current query and callback valid after canonical same-session refresh', async () => {
    const view = mount(); await loaded(view); editQuery(view, 'Original query');
    const change = (view.result.current as SearchController).setTemplateQuery;
    vi.stubGlobal('fetch', vi.fn(async () => response({ accessToken: bearer('refreshed'), refreshToken: 'rotated', expiresIn: 3600 })));
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    expect(query(view)).toBe('Original query'); act(() => change?.('Current refreshed query'));
    expect(query(view)).toBe('Current refreshed query');
  });
  it('keeps independent queries across document visits while rejecting the old visit callback', async () => {
    const view = mount(); await loaded(view); editQuery(view, 'Document A query');
    const previous = view.result.current.setTemplateQuery;
    view.rerender({ ...options(), docId: NEXT }); await loaded(view); editQuery(view, 'Document B query');
    view.rerender(options()); expect(query(view)).toBe('Document A query');
    act(() => previous('Previous visit')); expect(query(view)).toBe('Document A query');
    editQuery(view, 'Current A visit'); expect(query(view)).toBe('Current A visit');
  });
  it.each([
    { editorDirty: true }, { docSealed: true }, { editRefusal: 'Read-only role' }, { isCurrent: () => false },
  ])('holds retained query callbacks while the current editor is refused: %j', async refusal => {
    const view = mount(); await loaded(view); editQuery(view, 'Before refusal');
    const change = view.result.current.setTemplateQuery; const calls = apiRequest.mock.calls.length;
    view.rerender({ ...options(), ...refusal }); act(() => change('During refusal'));
    expect(query(view)).toBe('Before refusal'); expect(apiRequest.mock.calls).toHaveLength(calls);
  });
  it('rejects a retained query callback after the assembly owner unmounts', async () => {
    const view = mount(); await loaded(view); editQuery(view, 'Before close');
    const change = view.result.current.setTemplateQuery; const before = view.result.current;
    view.unmount(); act(() => change('After close')); expect(query(view)).toBe(before.templateQuery);
  });
  it('does not change the query while outline preview or an unknown build is held', async () => {
    const view = mount(); await loaded(view); editQuery(view, 'Before request');
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise);
    let choosing!: Promise<void>; act(() => { choosing = view.result.current.chooseTemplate(ID); });
    editQuery(view, 'While busy'); expect(query(view)).toBe('Before request');
    await act(async () => { pending.resolve(response({}, 503)); await choosing; });
    await act(async () => { await view.result.current.preview(); });
    act(() => view.result.current.setReason('Build after confirmed preview'));
    await act(async () => { await view.result.current.build(); });
    expect(view.result.current.phase).toBe('unknown'); editQuery(view, 'While unknown');
    expect(query(view)).toBe('Before request');
  });
});

describe('the existing build disclosure uses the canonical metadata picker', () => {
  it.each([{ editorDirty: true }, { docSealed: true }, { editRefusal: 'Read-only role' }])('holds all picker controls under the existing editor refusal: %j', async refusal => {
    const view = await surface();
    const search = screen.getByRole('searchbox', { name: 'Search templates' });
    fireEvent.change(search, { target: { value: 'PMDA' } });
    view.rerender(<Surface overrides={refusal} />);
    expect((search as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Clear template search' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('combobox', { name: 'Template' }) as HTMLSelectElement).disabled).toBe(true);
    expect((search as HTMLInputElement).value).toBe('PMDA');
  });
  it('finds regional metadata, retains a selected nonmatch and clears back to the same native list', async () => {
    await surface();
    const search = screen.getByRole('searchbox', { name: 'Search templates' });
    const picker = screen.getByRole('combobox', { name: 'Template' });
    const before = apiRequest.mock.calls.length;
    fireEvent.change(search, { target: { value: 'PMDA' } });
    expect(screen.getByRole('status').textContent).toContain('1 of 2'); expect(apiRequest.mock.calls).toHaveLength(before);
    fireEvent.change(picker, { target: { value: ID } });
    await waitFor(() => expect((picker as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(search, { target: { value: 'No matching scientific term' } });
    expect((picker as HTMLSelectElement).value).toBe(ID);
    expect(screen.getByRole('option', { name: metadata.name })).toBeTruthy();
    expect(screen.queryByRole('option', { name: '(blank document)' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear template search' }));
    expect((search as HTMLInputElement).value).toBe(''); expect(document.activeElement).toBe(search);
    expect(screen.getByRole('option', { name: second.title })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Template' })).toBe(picker);
  });
  it.each(['PMDA', 'diagnostics', 'native', 'jp-device-plan', 'Evidence and specialist'])('searches loaded %s metadata without choosing or building', async term => {
    await surface(); const before = apiRequest.mock.calls.length;
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search templates' }), { target: { value: term } });
    expect(screen.getByRole('status').textContent).toContain('1 of 2');
    expect((screen.getByRole('combobox', { name: 'Template' }) as HTMLSelectElement).value).toBe('');
    expect(apiRequest.mock.calls).toHaveLength(before);
  });
});
