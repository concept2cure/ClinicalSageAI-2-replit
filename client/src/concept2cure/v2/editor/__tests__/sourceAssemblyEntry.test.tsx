// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuth: () => ({ user: actual.authService.getUser() }) };
});
import { DataRoomSourcesPanel } from '../DataRoomSourcesPanel';
import { SourceAssemblyAction, SourceAssemblyDialog } from '../SourceAssemblyDialog';
import { authService } from '@/services/portal/authService';
import { publishShellProject, clearShellProject } from '../../shellProject';
import { clearEditorTarget, EDITOR_TARGET_EVENT, editorTargetFromSearch, peekEditorTarget, setEditorTarget, type EditorAssemblySources, type EditorTarget } from '../../editorTarget';
import { registerCeremonyOpen, __resetCeremonies } from '../../ceremony';
import { ProjectHome } from '../../surfaces/ProjectHome';
import { Vault } from '../../surfaces/Vault';
import type { SurfaceViewProps } from '../../surfaceViews';
import type { AssemblySourceSelector } from '@shared/authoring/assembly-sources';

const PROGRAM = '11111111-1111-4111-8111-111111111191';
const OTHER = '11111111-1111-4111-8111-111111111192';
const DOC = '22222222-2222-4222-8222-222222222191';
const VAULT = '33333333-3333-4333-8333-333333333191';
const documentRow = { id: DOC, title: 'Selected working document', program_id: PROGRAM, status: 'DRAFT' };
const source = { id: 12, title: 'Retained study source', checksum: 'ab'.repeat(32), extractionStatus: 'extracted',
  textAvailable: true, isCurrent: true, dataEligible: true, originalFileAvailable: false };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const user = (id = '191', organizationId = '19') => ({ id, organizationId, organizationName: null,
  email: 'source-entry@example.test', displayName: 'Synthetic author', firstName: 'Synthetic', lastName: 'Author',
  roles: ['author'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false });
let sources: typeof source[];
let documents: () => Response | Promise<Response>;
const selectors = () => [{ kind: 'data-room' as const, sourceId: source.id, expectedChecksum: source.checksum }];
const malformedSelections: Array<{ name: string; sources: AssemblySourceSelector[] }> = [
  { name: 'empty selection', sources: [] },
  { name: 'invalid Data Room id', sources: [{ kind: 'data-room', sourceId: 0 }] },
  { name: 'invalid Vault id', sources: [{ kind: 'vault', documentId: '12' }] },
  { name: 'duplicate source', sources: [{ kind: 'data-room', sourceId: 12 }, { kind: 'data-room', sourceId: 12 }] },
  { name: 'six selected sources', sources: Array.from({ length: 6 }, (_, index) => ({ kind: 'data-room', sourceId: index + 1 })) },
];
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }
beforeEach(async () => {
  localStorage.clear(); sessionStorage.clear(); clearEditorTarget(); __resetCeremonies();
  vi.stubGlobal('fetch', vi.fn(async () => ok({ authenticated: true, user: user() })));
  await authService.adoptSession('synthetic-source-entry');
  publishShellProject({ id: PROGRAM, title: 'Original project' });
  sources = [source];
  documents = () => ok({ success: true, documents: [documentRow] });
  apiRequest.mockReset().mockImplementation(async (_method: string, path: string) => {
    if (path.startsWith('/api/authoring/docs?')) return documents();
    if (path.startsWith(`/api/c2c/projects/${PROGRAM}/sources`)) return ok({ success: true, projectId: PROGRAM, sources,
      total: sources.length, currentTotal: sources.length, page: { limit: 50, offset: 0 }, window: { shown: sources.length, truncated: false } });
    if (path === `/api/c2c/projects/${PROGRAM}`) return ok({ id: PROGRAM, name: 'Original project', code: 'P191' });
    return ok({ success: true, data: { tree: [] } });
  });
});
afterEach(() => { cleanup(); clearEditorTarget(); clearShellProject(); __resetCeremonies(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });
function mutations() { return apiRequest.mock.calls.filter(([method]) => method !== 'GET'); }
async function chooseDocument() {
  await screen.findByRole('option', { name: documentRow.title });
  fireEvent.change(screen.getByLabelText('Working document'), { target: { value: DOC } });
}
async function action(onNav = vi.fn()) {
  const view = render(<SourceAssemblyAction programId={PROGRAM} sources={selectors()} titles={[source.title]} onNav={onNav} />);
  fireEvent.click(screen.getByRole('button', { name: 'Build in editor' }));
  await chooseDocument();
  return { ...view, onNav };
}
function surfaceProps(id: string): SurfaceViewProps { return { surface: { id, label: id } as SurfaceViewProps['surface'], onNav: vi.fn(), onAsk: vi.fn(), segment: 'biopharma' }; }
function evidence() {
  const view = render(<ProjectHome {...surfaceProps('project-home')} />);
  const tab = Array.from(document.querySelectorAll<HTMLButtonElement>('.pj-lc-stage')).find(row => row.textContent?.trim() === 'Evidence');
  if (!tab) throw new Error('Missing existing Evidence stage');
  fireEvent.click(tab);
  return view;
}
describe('source-first entry in the existing Data Room rail', () => {
  it('offers assembly for retained readable data without requiring original bytes', async () => {
    render(<DataRoomSourcesPanel programId={PROGRAM} />);
    fireEvent.click(await screen.findByText(source.title));
    expect(screen.getByRole('button', { name: 'Build in editor' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Work on document' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('hands only the explicitly pinned ProjectHome sources to the shared chooser', async () => {
    sources = [source, { ...source, id: 13, title: 'Second selected source' }];
    evidence();
    await screen.findByLabelText(`Use ${source.title} as context`);
    expect(screen.queryByTestId('data-room-build-selected')).toBeNull();
    fireEvent.click(screen.getByLabelText('Use Second selected source as context'));
    fireEvent.click(within(screen.getByTestId('data-room-build-selected')).getByRole('button', { name: 'Build in editor' }));
    await chooseDocument();
    const dialog = within(screen.getByTestId('source-assembly-dialog'));
    expect(dialog.getByText(/Second selected source/)).toBeTruthy();
    expect(dialog.queryByText(new RegExp(source.title))).toBeNull();
    expect(mutations()).toHaveLength(0);
  });
  it('refuses a sixth explicit pin without silently dropping a source', async () => {
    sources = Array.from({ length: 6 }, (_, index) => ({ ...source, id: 12 + index, title: `Source ${index + 1}` }));
    evidence();
    await screen.findByLabelText('Use Source 1 as context');
    const before = apiRequest.mock.calls.filter(([, path]) => String(path).startsWith('/api/authoring/')).length;
    for (const row of sources) fireEvent.click(screen.getByLabelText(`Use ${row.title} as context`));
    const entry = within(screen.getByTestId('data-room-build-selected'));
    expect((entry.getByRole('button', { name: 'Build in editor' }) as HTMLButtonElement).disabled).toBe(true);
    expect(entry.getByText(/Select up to 5 sources.*6 are selected/)).toBeTruthy();
    expect(apiRequest.mock.calls.filter(([, path]) => String(path).startsWith('/api/authoring/'))).toHaveLength(before);
  });
  it('retains the selected Vault UUID namespace instead of converting it into a Data Room id', async () => {
    const normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, path: string) => path === `/api/c2c/project-vault/${PROGRAM}`
      ? ok({ success: true, data: { program: 'Original project', spine: 'eCTD', tree: [{ id: 'uploads', code: 'UPLOADS', label: 'Uploaded files', children: [
        { id: `up-${VAULT}`, docId: VAULT, src: 'upload', title: 'Selected Vault file.pdf', num: '', type: 'Report', status: 'unfiled', pct: null, owner: '', ver: 'v2', updated: '', preview: '', hash: source.checksum, originalFileAvailable: false },
      ] }], unavailable: [] } }) : normal(method, path));
    render(<Vault {...surfaceProps('vault')} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Build in editor' }));
    await chooseDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    await waitFor(() => expect(peekEditorTarget()?.assemblySources?.sources).toEqual([{ kind: 'vault', documentId: VAULT, expectedChecksum: source.checksum }]));
    expect(mutations()).toHaveLength(0);
  });
});

describe('shared read-only source target chooser', () => {
  it('does not offer an explicit section-only read as a whole-document build target', async () => {
    documents = () => ok({ success: true, documents: [{ ...documentRow, readScope: 'sections' }] });
    render(<SourceAssemblyDialog programId={PROGRAM} sources={selectors()} onClose={vi.fn()} />);
    await screen.findByText('No working documents are available in this project.');
    expect(screen.queryByRole('option', { name: documentRow.title })).toBeNull();
    expect(mutations()).toHaveLength(0);
  });
  it('withdraws a whole-document build target when the fresh list confirms section-only access', async () => {
    const view = await action();
    documents = () => ok({ success: true, documents: [{ ...documentRow, readScope: 'sections' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    await screen.findByText(/That working document is no longer available/);
    expect(view.onNav).not.toHaveBeenCalled();
    expect(peekEditorTarget()).toBeNull();
    expect(mutations()).toHaveLength(0);
  });
  it('opens the exact project/document with selected identities and no write or generation', async () => {
    const view = await action();
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    await waitFor(() => expect(view.onNav).toHaveBeenCalledWith('document-authoring'));
    expect(peekEditorTarget()).toMatchObject({ docId: DOC, programId: PROGRAM, assemblySources: { version: 1, sources: selectors() } });
    expect(apiRequest.mock.calls.filter(([, path]) => String(path).startsWith('/api/authoring/docs?'))).toHaveLength(2);
    expect(JSON.stringify(peekEditorTarget())).not.toContain(source.title);
    expect(mutations()).toHaveLength(0);
  });
  it('holds an unavailable target after the fresh read instead of opening another document', async () => {
    await action();
    documents = () => ok({ success: true, documents: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    await screen.findByText(/That working document is no longer available/);
    expect(peekEditorTarget()).toBeNull();
    expect(mutations()).toHaveLength(0);
  });
  it('refuses a foreign scoped document list rather than presenting it as empty', async () => {
    documents = () => ok({ success: true, documents: [{ ...documentRow, program_id: OTHER }] });
    render(<SourceAssemblyDialog programId={PROGRAM} sources={selectors()} onClose={vi.fn()} />);
    await screen.findByRole('alert');
    expect(screen.queryByRole('option', { name: documentRow.title })).toBeNull();
    expect(screen.queryByText('No working documents are available in this project.')).toBeNull();
  });
  it('offers the existing-editor creation remedy without dispatching a pre-mount creator or writing', async () => {
    documents = () => ok({ success: true, documents: [] });
    const onNav = vi.fn(); const create = vi.fn();
    window.addEventListener('c2c:new-document', create);
    render(<SourceAssemblyDialog programId={PROGRAM} sources={selectors()} onClose={vi.fn()} onNav={onNav} />);
    await screen.findByText('No working documents are available in this project.');
    fireEvent.click(screen.getByRole('button', { name: 'Open document editor' }));
    expect(onNav).toHaveBeenCalledWith('document-authoring');
    expect(create).not.toHaveBeenCalled();
    expect(peekEditorTarget()).toBeNull(); expect(mutations()).toHaveLength(0);
    window.removeEventListener('c2c:new-document', create);
  });
  it('does not publish while another governed form is open', async () => {
    const view = await action(); const release = registerCeremonyOpen();
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    await screen.findByText(/Finish or cancel the open governed form/);
    expect(view.onNav).not.toHaveBeenCalled(); expect(peekEditorTarget()).toBeNull(); release();
  });
});

describe('source chooser late results stay in the original context', () => {
  it.each(['project round trip', 'account change', 'organization change', 'unmount'])('refuses a delayed final target read after %s', async change => {
    const view = await action(); const pending = deferred<Response>(); documents = () => pending.promise;
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    if (change === 'project round trip') act(() => { publishShellProject({ id: OTHER }); publishShellProject({ id: PROGRAM }); });
    if (change === 'account change' || change === 'organization change') {
      vi.stubGlobal('fetch', vi.fn(async () => ok({ authenticated: true, user: change === 'account change' ? user('192') : user('191', '20') })));
      await act(async () => { await authService.adoptSession('synthetic-replacement'); });
    }
    if (change === 'unmount') view.unmount();
    await act(async () => { pending.resolve(ok({ success: true, documents: [documentRow] })); await pending.promise; });
    expect(view.onNav).not.toHaveBeenCalled(); expect(peekEditorTarget()).toBeNull();
    if (change !== 'unmount') expect(screen.queryByRole('option', { name: documentRow.title })).toBeNull();
  });
  it('discards a late target list when the selected source changes', async () => {
    const pending = deferred<Response>(); documents = () => pending.promise;
    const view = render(<SourceAssemblyDialog programId={PROGRAM} sources={selectors()} onClose={vi.fn()} />);
    documents = () => ok({ success: true, documents: [] });
    view.rerender(<SourceAssemblyDialog programId={PROGRAM} sources={[{ kind: 'data-room', sourceId: 13 }]} onClose={vi.fn()} />);
    await act(async () => { pending.resolve(ok({ success: true, documents: [documentRow] })); await pending.promise; });
    expect(screen.queryByRole('option', { name: documentRow.title })).toBeNull(); expect(peekEditorTarget()).toBeNull();
  });
});

describe('existing editor target channel validates and owns source references', () => {
  it('deep-copies at publication and at every read', () => {
    const selected = selectors();
    setEditorTarget({ docType: null, docId: DOC, programId: PROGRAM, assemblySources: { version: 1, sources: selected } });
    selected[0].sourceId = 99;
    const target = peekEditorTarget()!;
    expect(target.assemblySources?.sources[0]).toMatchObject({ sourceId: 12 });
    const received = target.assemblySources!.sources[0];
    if (received.kind === 'data-room') received.sourceId = 100;
    expect(peekEditorTarget()?.assemblySources?.sources[0]).toMatchObject({ sourceId: 12 });
  });
  it.each(malformedSelections)('rejects malformed selections instead of a plain-target fallback: $name', ({ sources: selected }) => {
    const invalid: EditorAssemblySources = { version: 1, sources: selected };
    setEditorTarget({ docType: null, docId: DOC, programId: PROGRAM, assemblySources: invalid });
    expect(peekEditorTarget()).toBeNull();
    window.C2C_EDITOR_TARGET = { docType: null, docId: DOC, programId: PROGRAM, setAt: Date.now(), assemblySources: invalid } as EditorTarget;
    expect(peekEditorTarget()).toBeNull();
  });
  it('requires the exact document/project and does not manufacture source intent from copied URLs', () => {
    setEditorTarget({ docType: null, programId: PROGRAM, assemblySources: { version: 1, sources: selectors() } });
    expect(peekEditorTarget()).toBeNull();
    expect(editorTargetFromSearch(`?documentId=${DOC}&program=${PROGRAM}&assemblySources=untrusted`)?.assemblySources).toBeUndefined();
  });
});

describe('source publisher ownership before receiver mount', () => {
  it.each(['project round trip', 'account change', 'organization change', 'session replacement'])('retires a published source target after %s before the editor mounts', async change => {
    setEditorTarget({ docType: null, docId: DOC, programId: PROGRAM, assemblySources: { version: 1, sources: selectors() } });
    expect(peekEditorTarget()?.assemblySources?.sources).toEqual(selectors());
    if (change === 'project round trip') {
      publishShellProject({ id: OTHER }); publishShellProject({ id: PROGRAM });
    } else {
      vi.stubGlobal('fetch', vi.fn(async () => ok({ authenticated: true, user: change === 'account change' ? user('192') : change === 'organization change' ? user('191', '20') : user() })));
      await authService.adoptSession('synthetic-later-session');
    }
    expect(peekEditorTarget()).toBeNull();
    expect(mutations()).toHaveLength(0);
  });
  it('keeps a legitimate handoff after the chooser closes and its component unmounts', async () => {
    const view = await action();
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    await waitFor(() => expect(view.onNav).toHaveBeenCalledWith('document-authoring'));
    expect(screen.queryByTestId('source-assembly-dialog')).toBeNull();
    view.unmount();
    expect(peekEditorTarget()).toMatchObject({ docId: DOC, programId: PROGRAM, assemblySources: { version: 1, sources: selectors() } });
    expect(mutations()).toHaveLength(0);
  });
  it('registers ownership before the existing editor-target event is delivered', () => {
    const received: Array<EditorTarget | null> = [];
    const listen = () => received.push(peekEditorTarget());
    window.addEventListener(EDITOR_TARGET_EVENT, listen);
    try { setEditorTarget({ docType: null, docId: DOC, programId: PROGRAM, assemblySources: { version: 1, sources: selectors() } }); }
    finally { window.removeEventListener(EDITOR_TARGET_EVENT, listen); }
    expect(received).toHaveLength(1);
    expect(received[0]?.assemblySources?.sources).toEqual(selectors());
  });
  it('refuses an unregistered raw source-target copy', () => {
    setEditorTarget({ docType: null, docId: DOC, programId: PROGRAM, assemblySources: { version: 1, sources: selectors() } });
    window.C2C_EDITOR_TARGET = { ...window.C2C_EDITOR_TARGET! };
    expect(peekEditorTarget()).toBeNull();
  });
  it('preserves ordinary target behavior across project visits', () => {
    setEditorTarget({ docType: null, docId: DOC, programId: PROGRAM });
    publishShellProject({ id: OTHER }); publishShellProject({ id: PROGRAM });
    expect(peekEditorTarget()).toMatchObject({ docId: DOC, programId: PROGRAM });
  });
});
