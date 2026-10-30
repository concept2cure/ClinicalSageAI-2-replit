// @vitest-environment jsdom
/** Independent actual Workbench/Project files/chooser/build flow; synthetic HTTP. */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import type { AssemblyPlan, AssemblyPreviewInput, AssemblySection } from '@shared/authoring/assembly';
import type { AssemblySourceManifest, AssemblySourceSelector } from '@shared/authoring/assembly-sources';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => ({ ...(await original<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { displayName: 'Project file author', email: 'project-files@example.test' } }) }));
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
import { DocumentWorkbench, type DocumentWorkbenchProps } from '../DocumentWorkbench';
import { authService } from '@/services/portal/authService';
import { clearEditorTarget, setEditorTarget } from '../../editorTarget';
import { publishShellProject } from '../../shellProject';
import { __resetCeremonies, registerCeremonyOpen } from '../../ceremony';

const PROGRAM = '11111111-1111-4111-8111-111111111381';
const CURRENT = '22222222-2222-4222-8222-222222222381';
const TARGET = '22222222-2222-4222-8222-222222222382';
const SECTION = '33333333-3333-4333-8333-333333333381';
const NEXT = '33333333-3333-4333-8333-333333333382';
const TEMPLATE = '44444444-4444-4444-8444-444444444381';
const VAULT = '55555555-5555-4555-8555-555555555381';
const OTHER_VAULT = '55555555-5555-4555-8555-555555555382';
const LATER_VAULT = '55555555-5555-4555-8555-555555555383';
const OTHER_PROGRAM = '11111111-1111-4111-8111-111111111382';
const HASH = 'a'.repeat(64);
const AT = '2026-10-18T01:00:00Z';
const selector: AssemblySourceSelector = { kind: 'vault', documentId: VAULT, expectedChecksum: HASH };
const manifestFor = (sources: AssemblySourceSelector[]): AssemblySourceManifest => ({ version: 1, programId: PROGRAM, fingerprint: 'c'.repeat(64), limitations: ['Selected excerpts need scientific review.'],
  entries: sources.map(source => ({ source, title: 'Exact retained Vault report', contentHash: HASH, extractedTextSha256: 'd'.repeat(64), version: '2',
    originalFileAvailable: false, disposition: 'keep_data', span: { start: 11, end: 111, totalChars: 400, sha256: 'e'.repeat(64) } })) });
const manifest = manifestFor([selector]);
const currentDoc = { id: CURRENT, client_program_id: PROGRAM, title: 'Current working document', module: 'M3', product_code: null, status: 'DRAFT', updated_at: AT, section_count: 1 };
const targetDoc = { ...currentDoc, id: TARGET, title: 'Vault assembly target' };
const currentSection: AssemblySection = { id: SECTION, doc_id: CURRENT, code: '3.2.S.1', title: 'Current general information', content: '<p>Existing saved current work.</p>', order_index: 0, updated_at: AT };
const targetSection: AssemblySection = { id: NEXT, doc_id: TARGET, code: '3.2.S.1', title: 'Target general information', content: '', order_index: 0, updated_at: AT };
const upload = { id: `up-${VAULT}`, docId: VAULT, title: 'Exact retained Vault report', src: 'upload', num: '3.2.S.1', type: 'REPORT', status: 'filed', pct: 100,
  owner: '', ver: '2', updated: '', preview: 'Retained source', hash: HASH, originalFileAvailable: false, disposition: 'keep_data' };
const vault = { success: true, data: { program: 'Source program', documentCount: 2, tree: [{ id: 'module-3', code: 'M3', label: 'Module 3', children: [upload,
  { ...upload, id: `up-${OTHER_VAULT}`, docId: OTHER_VAULT, title: 'Another Vault report', hash: 'b'.repeat(64) }] }] } };
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const readBodies = new Map<string, unknown>([
  [`/api/c2c/project-vault/${PROGRAM}`, vault], [`/api/c2c/projects/${PROGRAM}`, { id: PROGRAM, name: 'Source program' }],
  ['/api/authoring/templates', { success: true, templates: [{ id: TEMPLATE, name: 'Vault source template', module: 'M3' }] }],
  [`/api/authoring/docs/${CURRENT}`, { success: true, document: currentDoc }], [`/api/authoring/docs/${TARGET}`, { success: true, document: targetDoc }],
  [`/api/authoring/docs/${CURRENT}/sections`, { success: true, sections: [currentSection] }], [`/api/authoring/docs/${TARGET}/sections`, { success: true, sections: [targetSection] }],
]);
function plan(input: AssemblyPreviewInput): AssemblyPlan {
  return { version: 1, docId: TARGET, programId: PROGRAM, templateId: TEMPLATE, selection: input.selection,
    targetSnapshot: 'saved-target', templateSnapshot: 'saved-template', fingerprint: 'assembly-fingerprint', templateName: 'Vault source template', draftRegion: 'FDA',
    limitations: [], gaps: [], ...(input.sources ? { sources: manifestFor(input.sources) } : {}), rows: [{ code: targetSection.code, title: targetSection.title,
      content: '', ordering: 0, disposition: 'preserve', existingSectionId: NEXT, aiDraftable: true, aiDraftableReason: 'Narrative section.', gaps: [] }] };
}
for (const prototype of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  prototype.getClientRects ??= () => [];
  prototype.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}
const bearer = `fixture.${btoa(JSON.stringify({ userId: 381, organizationId: 38 }))}.synthetic`;
const headers = { Authorization: `Bearer ${bearer}`, 'x-organization-id': '38' };
const user = { id: '381', organizationId: '38', organizationName: null, email: 'project-files@example.test', firstName: 'Project', lastName: 'Author', displayName: 'Project file author', roles: ['author'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false };
beforeEach(async () => {
  localStorage.clear(); sessionStorage.clear(); clearEditorTarget(); __resetCeremonies();
  vi.stubGlobal('fetch', vi.fn(async () => ok({ authenticated: true, user })));
  await authService.adoptSession(bearer); publishShellProject({ id: PROGRAM, title: 'Source program' });
  apiRequest.mockReset().mockImplementation(async (method: string, path: string, input?: AssemblyPreviewInput) => {
    const request = new URL(path, 'http://localhost');
    if (readBodies.has(request.pathname)) {
      if (/^\/api\/authoring\/docs\/[^/]+(?:\/sections)?$/.test(request.pathname)) {
        expect(request.searchParams.get('programId')).toBe(PROGRAM);
      }
      return ok(readBodies.get(request.pathname));
    }
    if (path.startsWith(`/api/c2c/projects/${PROGRAM}/sources?`)) return ok({ sources: [], projectId: PROGRAM, total: 0, currentTotal: 0 });
    if (method === 'POST' && path.endsWith('/assembly/preview')) return ok({ success: true, data: plan(input!) });
    if (method === 'POST' && path.endsWith('/assembly/commit')) return ok({ success: true, data: { docId: TARGET, programId: PROGRAM, plan: plan(input!), sections: [targetSection] } });
    if (method === 'POST' && path.endsWith('/ai/draft')) return ok({ success: true, draft: { content: 'Vault-source candidate for review', draftId: 'vault-candidate', metadata: {}, check: null } });
    if (path.startsWith('/api/authoring/docs?')) return ok({ success: true, documents: [currentDoc, targetDoc].map(doc => ({ ...doc, program_id: PROGRAM, readScope: 'document' })) });
    if (path.startsWith('/api/c2c/documents/')) return ok({}, 404);
    return ok({ success: true, sources: [], revisions: [], events: [], comments: [] });
  });
});
afterEach(() => { cleanup(); authService.endSession(null); __resetCeremonies(); clearEditorTarget(); localStorage.clear(); sessionStorage.clear(); publishShellProject({ id: '' }); vi.unstubAllGlobals(); });
function editor() { return document.querySelector('.tiptap') as HTMLElement & { editor: Editor }; }
function postCalls(suffix: string) { return apiRequest.mock.calls.filter(([method, path]) => method === 'POST' && String(path).endsWith(suffix)); }
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve }; }
async function mounted(overrides: Partial<DocumentWorkbenchProps> = {}) {
  const props: DocumentWorkbenchProps = { docs: [currentDoc, targetDoc], docsState: 'ready', status: 'all', programId: PROGRAM,
    onNav: vi.fn(), reloadDocs: vi.fn(async () => undefined), ...overrides };
  const view = render(<DocumentWorkbench {...props} />);
  await waitFor(() => expect(editor()?.textContent).toContain('Existing saved current work.'));
  fireEvent.click(screen.getByTestId('vault-rail-open'));
  const rail = await screen.findByRole('complementary', { name: 'Project files' });
  fireEvent.click(await within(rail).findByRole('button', { name: /Exact retained Vault report/ }));
  return { ...view, rail, props };
}
async function chooseWorkingDocument(rail: HTMLElement) {
  fireEvent.click(within(rail).getByRole('button', { name: 'Build in editor' }));
  const target = await screen.findByLabelText('Working document');
  await waitFor(() => expect((target as HTMLSelectElement).options.length).toBe(3));
  fireEvent.change(target, { target: { value: TARGET } });
}
async function openTarget(rail: HTMLElement) {
  await chooseWorkingDocument(rail); fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
  await screen.findByRole('heading', { level: 1, name: 'Target general information' });
}
async function chooseTemplate() {
  const input = await screen.findByLabelText('Template');
  await waitFor(() => expect((input as HTMLSelectElement).options.length).toBe(2));
  fireEvent.change(input, { target: { value: TEMPLATE } });
  await waitFor(() => expect(postCalls('/assembly/preview')).toHaveLength(1));
}
async function explicitBuild(withAna: boolean) {
  await chooseTemplate(); fireEvent.click(screen.getByRole('button', { name: 'Preview build' }));
  await waitFor(() => expect(postCalls('/assembly/preview')).toHaveLength(2));
  fireEvent.change(screen.getByLabelText('Reason for build'), { target: { value: 'Assemble the selected exact Vault source for review.' } });
  if (withAna) fireEvent.click(screen.getByLabelText('Draft empty eligible sections with AnA'));
  fireEvent.click(screen.getByRole('button', { name: 'Build document' }));
  await waitFor(() => expect(postCalls('/assembly/commit')).toHaveLength(1));
  if (withAna) await screen.findByRole('button', { name: 'Review 3.2.S.1' });
  else await screen.findByText(/Structure built in this document/i);
}

describe('Project files source assembly reaches the one editor', () => {
  it('offers Build in editor on the selected real Vault upload beside the actual document', async () => {
    const { rail } = await mounted();
    expect(within(rail).getByTestId('pf-selected').textContent).toContain('Exact retained Vault report');
    expect(within(rail).getByRole('button', { name: 'Build in editor' })).toBeTruthy();
    expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
    expect(postCalls('/assembly/preview')).toHaveLength(0); expect(postCalls('/assembly/commit')).toHaveLength(0); expect(postCalls('/ai/draft')).toHaveLength(0);
  });
  it.each([false, true])('keeps the exact Vault identity through read-only selection and explicit build (AnA=%s)', async withAna => {
    const { rail, props } = await mounted();
    expect((within(rail).getByRole('button', { name: 'Work on document' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(rail).getByRole('button', { name: 'Build in editor' }) as HTMLButtonElement).disabled).toBe(false);
    await openTarget(rail);
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
    expect(screen.getByTestId('assembly-selected-sources').textContent).toContain(VAULT);
    expect(screen.getByTestId('assembly-selected-sources').textContent).not.toContain(`up-${VAULT}`);
    expect(props.onNav).not.toHaveBeenCalled(); expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
    await explicitBuild(withAna);
    for (const call of postCalls('/assembly/preview')) {
      expect(call[2].sources).toEqual([selector]); expect(call[3]).toEqual(headers);
    }
    expect(postCalls('/assembly/commit')[0][2].sources).toEqual([selector]);
    expect(postCalls('/assembly/commit')[0][3]).toEqual(headers);
    expect(postCalls('/ai/draft')).toHaveLength(withAna ? 1 : 0);
    if (withAna) {
      expect(postCalls('/ai/draft')[0][2].sources).toEqual(manifest);
      fireEvent.click(screen.getByRole('button', { name: 'Review 3.2.S.1' }));
      expect((await screen.findByTestId('ai-draft-body') as HTMLTextAreaElement).value).toContain('Vault-source candidate for review');
      expect(editor().textContent).not.toContain('Vault-source candidate for review');
    }
    expect(postCalls('/accept')).toHaveLength(0); expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
  });
});
describe('Project files handoff reuses the actual editor guards', () => {
  it('preserves current source selection and dirty text on Stay, then adopts only after an explicit guarded leave', async () => {
    const { rail, props } = await mounted();
    act(() => setEditorTarget({ docType: null, docId: CURRENT, programId: PROGRAM, assemblySources: { version: 1, sources: [{ kind: 'data-room', sourceId: 99 }] } }));
    await screen.findByRole('button', { name: 'Clear selected sources' });
    const original = editor(); act(() => { original.editor.commands.insertContent('Retain my current unsaved reasoning. '); });
    await chooseWorkingDocument(rail); fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    await screen.findByRole('alertdialog', { name: 'Unsaved changes in 3.2.S.1' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(editor()).toBe(original); expect(original.textContent).toContain('Retain my current unsaved reasoning.');
    expect(screen.getByTestId('assembly-selected-sources').textContent).toContain('Data Room source 99');
    expect(screen.getByTestId('assembly-selected-sources').textContent).not.toContain(VAULT);
    expect(props.onNav).not.toHaveBeenCalled(); expect(postCalls('/assembly/preview')).toHaveLength(0);
    await chooseWorkingDocument(rail); fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
    await screen.findByRole('heading', { level: 1, name: 'Target general information' });
    expect(screen.getByTestId('assembly-selected-sources').textContent).toContain(VAULT);
    expect(postCalls('/assembly/commit')).toHaveLength(0); expect(postCalls('/ai/draft')).toHaveLength(0);
    await chooseTemplate(); expect(postCalls('/assembly/preview')[0][2].sources).toEqual([selector]);
  });
  it('honors the existing ceremony guard without disturbing the current canvas', async () => {
    const { rail } = await mounted(); const original = editor(); await chooseWorkingDocument(rail); const close = registerCeremonyOpen();
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    await screen.findByText('Finish or cancel the open governed form, then open this build.');
    expect(editor()).toBe(original); expect(screen.queryByRole('button', { name: 'Clear selected sources' })).toBeNull();
    expect(postCalls('/assembly/preview')).toHaveLength(0); close();
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    await screen.findByRole('heading', { level: 1, name: 'Target general information' });
    expect(screen.getByTestId('assembly-selected-sources').textContent).toContain(VAULT);
  });
  it('does not publish a delayed chooser result after the project is left and revisited', async () => {
    const { rail } = await mounted(); const original = editor(); await chooseWorkingDocument(rail);
    const base = apiRequest.getMockImplementation()!; const pending = deferred<Response>();
    apiRequest.mockImplementation((method: string, path: string, input?: AssemblyPreviewInput) => path.startsWith('/api/authoring/docs?') ? pending.promise : base(method, path, input));
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    await screen.findByRole('button', { name: 'Checking document…' });
    act(() => { publishShellProject({ id: OTHER_PROGRAM }); publishShellProject({ id: PROGRAM }); });
    await act(async () => { pending.resolve(ok({ success: true, documents: [currentDoc, targetDoc].map(doc => ({ ...doc, program_id: PROGRAM })) })); await pending.promise; });
    expect(editor()).toBe(original); expect(screen.queryByRole('button', { name: 'Clear selected sources' })).toBeNull();
    expect(screen.getByText(/project, selected sources or signed-in account changed/i)).toBeTruthy();
    expect(postCalls('/assembly/preview')).toHaveLength(0); expect(postCalls('/ai/draft')).toHaveLength(0);
  });
  it('holds the current canvas when its rail project differs from the current shell project', async () => {
    const { rail } = await mounted(); const original = editor(); const readsBefore = apiRequest.mock.calls.filter(([, path]) => String(path).startsWith('/api/authoring/docs?')).length;
    act(() => publishShellProject({ id: OTHER_PROGRAM }));
    fireEvent.click(within(rail).getByRole('button', { name: 'Build in editor' }));
    await screen.findByText(/project, selected sources or signed-in account changed/i);
    expect(editor()).toBe(original); expect(screen.queryByRole('button', { name: 'Clear selected sources' })).toBeNull();
    expect(apiRequest.mock.calls.filter(([, path]) => String(path).startsWith('/api/authoring/docs?'))).toHaveLength(readsBefore);
    expect(postCalls('/assembly/preview')).toHaveLength(0); expect(postCalls('/ai/draft')).toHaveLength(0);
  });
  it('does not bind an old pending source choice after the selected Vault upload changes', async () => {
    const { rail } = await mounted(); const original = editor(); await chooseWorkingDocument(rail);
    const base = apiRequest.getMockImplementation()!; const pending = deferred<Response>();
    apiRequest.mockImplementation((method: string, path: string, input?: AssemblyPreviewInput) => path.startsWith('/api/authoring/docs?') ? pending.promise : base(method, path, input));
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    await screen.findByRole('button', { name: 'Checking document…' });
    fireEvent.click(within(rail).getByRole('button', { name: /Another Vault report/ }));
    await act(async () => { pending.resolve(ok({ success: true, documents: [currentDoc, targetDoc].map(doc => ({ ...doc, program_id: PROGRAM })) })); await pending.promise; });
    expect(editor()).toBe(original); expect(screen.queryByTestId('source-assembly-dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear selected sources' })).toBeNull();
    expect(within(rail).getByTestId('pf-selected').textContent).toContain('Another Vault report');
    expect(postCalls('/assembly/preview')).toHaveLength(0); expect(postCalls('/ai/draft')).toHaveLength(0);
  });
  it('carries a later search page UUID through the same chooser without inventing a checksum or Data Room identity', async () => {
    const { rail } = await mounted(); const base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, path: string, input?: AssemblyPreviewInput) => {
      if (path.startsWith(`/api/c2c/project-vault/${PROGRAM}/search?`)) {
        const offset = new URL(path, 'https://synthetic.test').searchParams.get('offset');
        return Promise.resolve(ok({ success: true, data: { total: 2, offset: Number(offset), results: [{ id: offset === '0' ? VAULT : LATER_VAULT,
          title: offset === '0' ? 'Search result one' : 'Later-page Vault report', documentType: 'REPORT', snippet: 'Retained scientific excerpt', current: true, originalFileAvailable: false, disposition: 'keep_data' }] } }));
      }
      return base(method, path, input);
    });
    fireEvent.change(within(rail).getByLabelText('Search the project vault'), { target: { value: 'report' } });
    await within(rail).findByText('1 of 2 matches'); fireEvent.click(within(rail).getByRole('button', { name: 'More results' }));
    fireEvent.click(await within(rail).findByRole('button', { name: /Later-page Vault report/ }));
    await openTarget(rail); await chooseTemplate();
    expect(postCalls('/assembly/preview')[0][2].sources).toEqual([{ kind: 'vault', documentId: LATER_VAULT }]);
    expect(apiRequest.mock.calls.some(([method, path]) => method === 'GET' && String(path).endsWith('offset=1'))).toBe(true);
    expect(postCalls('/assembly/commit')).toHaveLength(0); expect(postCalls('/ai/draft')).toHaveLength(0);
  });
});
