// @vitest-environment jsdom
/** Actual Project files, shared chooser and target channel; synthetic HTTP only. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { VaultDoc } from '../../fixtures/vault-data';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { ProjectFilesPanel } from '../ProjectFilesPanel';
import { SourceAssemblyAction } from '../SourceAssemblyDialog';
import { VaultSourceBuildAction } from '../VaultSourceBuildAction';
import { authService } from '@/services/portal/authService';
import { clearEditorTarget, peekEditorTarget } from '../../editorTarget';
import { clearShellProject, publishShellProject } from '../../shellProject';
import { __resetCeremonies } from '../../ceremony';

const PROGRAM = '11111111-1111-4111-8111-111111111481';
const OTHER = '11111111-1111-4111-8111-111111111482';
const DOC = '22222222-2222-4222-8222-222222222481';
const VAULT = '33333333-3333-4333-8333-333333333481';
const HASH = 'ab'.repeat(32);
const source: VaultDoc = { id: `up-${VAULT}`, docId: VAULT, src: 'upload', title: 'Retained Vault report', num: '',
  type: 'Report', status: 'unfiled', pct: null, owner: '', ver: 'v2', updated: '', preview: '', hash: HASH,
  originalFileAvailable: false, disposition: 'keep_data' };
const working = { id: DOC, title: 'Existing working document', program_id: PROGRAM, status: 'DRAFT', readScope: 'document' };
const user = { id: '481', organizationId: '48', organizationName: null, email: 'files@example.test', firstName: 'Files',
  lastName: 'Author', displayName: 'Files author', roles: ['author'], permissions: [], mfaEnabled: false,
  mfaMethods: [], mustChangePassword: false };
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const bearer = (visit = 'initial', id = 481) => `fixture.${btoa(JSON.stringify({ userId: id, organizationId: 48, visit }))}.synthetic`;
let tree: VaultDoc[];
let documents: () => Response | Promise<Response>;
let search: (path: string) => Response;
beforeEach(async () => {
  localStorage.clear(); sessionStorage.clear(); clearEditorTarget(); __resetCeremonies();
  vi.stubGlobal('fetch', vi.fn(async () => ok({ authenticated: true, user })));
  await authService.adoptSession(bearer()); publishShellProject({ id: PROGRAM });
  tree = [source]; documents = () => ok({ success: true, documents: [working] });
  search = () => ok({ success: true, data: { results: [], total: 0 } });
  apiRequest.mockReset().mockImplementation(async (_method: string, path: string) => {
    if (path === `/api/c2c/project-vault/${PROGRAM}`) return ok({ success: true, data: { tree } });
    if (path.startsWith(`/api/c2c/project-vault/${PROGRAM}/search?`)) return search(path);
    if (path.startsWith('/api/authoring/docs?')) return documents();
    throw new Error(`Unexpected synthetic request ${path}`);
  });
});
afterEach(() => { cleanup(); clearEditorTarget(); clearShellProject(); __resetCeremonies(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });
function panel(onNav?: (id: string) => void) {
  return render(<ProjectFilesPanel programId={PROGRAM} programName="Effective project" fireToast={vi.fn()} onNav={onNav}
    sectionOpen={false} projectSources={[{ id: 481, title: 'Same-byte Data Room identity', checksum: HASH,
      extractionStatus: 'extracted', textAvailable: true, isCurrent: true, dataEligible: true, originalFileAvailable: false }]} />);
}
async function selectSource(title = source.title) {
  fireEvent.click(await screen.findByRole('button', { name: name => name.includes(title) }));
  return within(await screen.findByTestId('pf-selected'));
}
async function chooseTarget() {
  await screen.findByRole('option', { name: working.title });
  fireEvent.change(screen.getByLabelText('Working document'), { target: { value: DOC } });
}
const writes = () => apiRequest.mock.calls.filter(([method]) => method !== 'GET');
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }

describe('Project files Vault assembly entry', () => {
  it.each(['local', 'external'])('opens the shared chooser from a retained upload in a %s host', async host => {
    const onNav = host === 'external' ? vi.fn() : undefined; panel(onNav);
    const selected = await selectSource();
    expect((selected.getByRole('button', { name: 'Work on document' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(await selected.findByRole('button', { name: 'Build in editor' }));
    await chooseTarget();
    expect(peekEditorTarget()).toBeNull(); expect(writes()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    await waitFor(() => expect(peekEditorTarget()).toMatchObject({ docId: DOC, programId: PROGRAM,
      assemblySources: { version: 1, sources: [{ kind: 'vault', documentId: VAULT, expectedChecksum: HASH }] } }));
    if (onNav) expect(onNav).toHaveBeenCalledExactlyOnceWith('document-authoring');
    expect(writes()).toHaveLength(0);
  });

  it('hands off an exact upload from a later search page without inventing a checksum', async () => {
    tree = [];
    const hit = (id: string, title: string) => ({ id, title, fileName: null, documentType: 'Report', size: null,
      folderId: null, ctdSection: null, placementStatus: 'unfiled', snippet: null, current: true, originalFileAvailable: false });
    search = path => {
      const offset = Number(new URL(path, 'http://synthetic.test').searchParams.get('offset'));
      return ok({ success: true, data: { offset, total: 26, results: offset === 25 ? [hit(VAULT, 'Later retained result')]
        : Array.from({ length: 25 }, (_, index) => hit(`44444444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`, `Earlier result ${index + 1}`)) } });
    };
    panel(); fireEvent.change(screen.getByLabelText('Search the project vault'), { target: { value: 'retained' } });
    fireEvent.click(await screen.findByRole('button', { name: 'More results' }));
    const selected = await selectSource('Later retained result');
    fireEvent.click(selected.getByRole('button', { name: 'Build in editor' })); await chooseTarget();
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    await waitFor(() => expect(peekEditorTarget()?.assemblySources?.sources).toEqual([{ kind: 'vault', documentId: VAULT }]));
    expect(apiRequest.mock.calls.some(([, path]) => String(path).includes('offset=25'))).toBe(true);
    expect(writes()).toHaveLength(0);
  });

  it.each([{ disposition: 'remove_data' as const }, { disposition: 'supersede' as const }, { earlierVersion: true }])(
    'refuses an upload excluded from active data use: %j', async availability => {
      tree = [{ ...source, ...availability }]; panel(); const selected = await selectSource();
      const build = selected.getByRole('button', { name: 'Build in editor' }) as HTMLButtonElement;
      expect(build.disabled).toBe(true); fireEvent.click(build);
      expect(selected.getByText(/Build in editor: This source is excluded/)).toBeTruthy();
      expect(screen.queryByTestId('source-assembly-dialog')).toBeNull(); expect(writes()).toHaveLength(0);
    },
  );

  it.each([{ docId: `up-${VAULT}` }, { hash: 'not-a-checksum' }])('refuses malformed source identity without coercion: %j', async invalid => {
    tree = [{ ...source, ...invalid }]; panel(); const selected = await selectSource();
    const build = selected.getByRole('button', { name: 'Build in editor' }) as HTMLButtonElement;
    expect(build.disabled).toBe(true); fireEvent.click(build);
    expect(selected.getByText(/selected source identities could not be verified/)).toBeTruthy();
    expect(screen.queryByTestId('source-assembly-dialog')).toBeNull(); expect(peekEditorTarget()).toBeNull(); expect(writes()).toHaveLength(0);
  });

  it.each([{ src: 'authored' as const }, { docId: undefined }])('offers no upload build for a row without the exact upload identity: %j', async invalid => {
    tree = [{ ...source, ...invalid }]; panel(); const selected = await selectSource();
    expect(selected.queryByRole('button', { name: 'Build in editor' })).toBeNull(); expect(writes()).toHaveLength(0);
  });

  it('offers no source build without an explicit effective project', () => {
    render(<VaultSourceBuildAction source={source} programId={null} />);
    expect(screen.queryByRole('button', { name: 'Build in editor' })).toBeNull(); expect(apiRequest).not.toHaveBeenCalled();
  });

  it('does not substitute the new shell project for a held effective project', async () => {
    publishShellProject({ id: OTHER }); panel(); const selected = await selectSource();
    fireEvent.click(selected.getByRole('button', { name: 'Build in editor' }));
    await screen.findByText(/The project, selected sources or signed-in account changed/);
    expect(apiRequest.mock.calls.some(([, path]) => String(path).startsWith('/api/authoring/docs?'))).toBe(false);
    expect(apiRequest.mock.calls.some(([, path]) => String(path).includes(OTHER))).toBe(false);
    expect(peekEditorTarget()).toBeNull(); expect(writes()).toHaveLength(0);
  });
});

describe('source launch eligibility ownership', () => {
  it.each(['availability', 'disabled'])('retires a pending chooser across %s ABA', async mode => {
    const props = { programId: PROGRAM, sources: [{ kind: 'vault' as const, documentId: VAULT }], onNav: vi.fn() };
    const view = render(<SourceAssemblyAction {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Build in editor' })); await chooseTarget();
    const pending = deferred<Response>(); documents = () => pending.promise;
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    view.rerender(<SourceAssemblyAction {...props} disabled={mode === 'disabled'} unavailable={mode === 'availability' ? 'Source withdrawn.' : null} />);
    view.rerender(<SourceAssemblyAction {...props} />);
    await act(async () => { pending.resolve(ok({ success: true, documents: [working] })); await pending.promise; });
    expect(peekEditorTarget()).toBeNull(); expect(props.onNav).not.toHaveBeenCalled();
    expect(screen.queryByTestId('source-assembly-dialog')).toBeNull(); expect(writes()).toHaveLength(0);
    documents = () => ok({ success: true, documents: [working] });
    fireEvent.click(screen.getByRole('button', { name: 'Build in editor' })); await chooseTarget();
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    await waitFor(() => expect(peekEditorTarget()?.assemblySources?.sources).toEqual(props.sources));
    expect(props.onNav).toHaveBeenCalledExactlyOnceWith('document-authoring'); expect(writes()).toHaveLength(0);
  });

  it.each(['project visit', 'account session', 'selected source'])('refuses a delayed target read after the %s changes', async mode => {
    const props = { programId: PROGRAM, sources: [{ kind: 'vault' as const, documentId: VAULT }], onNav: vi.fn() };
    const view = render(<SourceAssemblyAction {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Build in editor' })); await chooseTarget();
    const pending = deferred<Response>(); documents = () => pending.promise;
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    if (mode === 'project visit') act(() => { publishShellProject({ id: OTHER }); publishShellProject({ id: PROGRAM }); });
    if (mode === 'account session') {
      vi.stubGlobal('fetch', vi.fn(async () => ok({ authenticated: true, user: { ...user, id: '482' } })));
      await act(async () => { await authService.adoptSession(bearer('replacement', 482)); });
    }
    if (mode === 'selected source') view.rerender(<SourceAssemblyAction {...props} sources={[{ kind: 'vault', documentId: DOC }]} />);
    await act(async () => { pending.resolve(ok({ success: true, documents: [working] })); await pending.promise; });
    expect(peekEditorTarget()).toBeNull(); expect(props.onNav).not.toHaveBeenCalled(); expect(writes()).toHaveLength(0);
  });
});
