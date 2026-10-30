// @vitest-environment jsdom
/** Independent actual editor/target/controller/transport checks; synthetic HTTP only. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import type { AssemblyPlan, AssemblyPreviewInput, AssemblySection } from '@shared/authoring/assembly';
import type { AssemblySourceManifest, AssemblySourceSelector } from '@shared/authoring/assembly-sources';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => ({ ...(await original<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { displayName: 'Source author', email: 'sources@example.test' } }) }));
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
import { DocumentWorkbench, type DocumentWorkbenchProps } from '../DocumentWorkbench';
import { authService } from '@/services/portal/authService';
import { clearEditorTarget, peekEditorTarget, setEditorTarget } from '../../editorTarget';
import { publishShellProject } from '../../shellProject';
import { __resetCeremonies, registerCeremonyOpen } from '../../ceremony';
import { SourceAssemblyAction } from '../SourceAssemblyDialog';

const PROGRAM = '11111111-1111-4111-8111-111111111281';
const PRIOR = '22222222-2222-4222-8222-222222222281';
const TARGET = '22222222-2222-4222-8222-222222222282';
const SECTION = '33333333-3333-4333-8333-333333333281';
const NEXT = '33333333-3333-4333-8333-333333333282';
const TEMPLATE = '44444444-4444-4444-8444-444444444281';
const VAULT = '55555555-5555-4555-8555-555555555281';
const AT = '2026-10-17T23:00:00Z';
const selectors: AssemblySourceSelector[] = [{ kind: 'data-room', sourceId: 12, expectedChecksum: 'a'.repeat(64) },
  { kind: 'vault', documentId: VAULT, expectedChecksum: 'b'.repeat(64) }];
const manifest: AssemblySourceManifest = { version: 1, programId: PROGRAM, fingerprint: 'c'.repeat(64), limitations: ['Selected excerpts require scientific review.'],
  entries: selectors.map((source, index) => ({ source, title: index ? 'Saved Vault report' : 'Retained Data Room source',
    contentHash: index ? 'b'.repeat(64) : 'a'.repeat(64), extractedTextSha256: 'd'.repeat(64), version: '2',
    originalFileAvailable: index === 1, disposition: 'keep_data', span: { start: 11, end: 111, totalChars: 400, sha256: 'e'.repeat(64) } })) };
const priorDoc = { id: PRIOR, title: 'Current working document', module: 'M3', product_code: null, status: 'DRAFT', updated_at: AT, section_count: 1 };
const targetDoc = { ...priorDoc, id: TARGET, title: 'Selected assembly target', section_count: 2 };
const priorSection: AssemblySection = { id: SECTION, doc_id: PRIOR, code: '3.2.S.1', title: 'Saved current section', content: '<p>Existing saved current work.</p>', order_index: 0, updated_at: AT };
const targetSections: AssemblySection[] = [
  { id: NEXT, doc_id: TARGET, code: '3.2.S.1', title: 'Target general information', content: '', order_index: 0, updated_at: AT },
  { id: '33333333-3333-4333-8333-333333333283', doc_id: TARGET, code: '3.2.S.2', title: 'Target manufacture', content: '', order_index: 1, updated_at: AT },
];
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
let commitReply: (input: AssemblyPreviewInput) => Response | Promise<Response>;
let draftRegion: AssemblyPlan['draftRegion'];
let draftingGuidance: string;
function plan(input: AssemblyPreviewInput): AssemblyPlan {
  return { version: 1, docId: TARGET, programId: PROGRAM, templateId: TEMPLATE, selection: input.selection,
    targetSnapshot: 'saved-target', templateSnapshot: 'saved-template', fingerprint: 'assembly-fingerprint',
    templateName: 'Source-led organization template', draftRegion, limitations: [], gaps: [],
    ...(input.sources ? { sources: manifest } : {}), rows: targetSections.map(section => ({ code: section.code, title: section.title,
      content: '', ordering: section.order_index, disposition: 'preserve', existingSectionId: section.id,
      aiDraftable: true, aiDraftableReason: 'Narrative section.', ...(draftingGuidance ? { draftingGuidance } : {}), gaps: ['Scientific text remains to be written.'] })) };
}
for (const prototype of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  prototype.getClientRects ??= () => [];
  prototype.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}
const user = { id: '281', organizationId: '28', organizationName: null, email: 'sources@example.test', firstName: 'Source', lastName: 'Author', displayName: 'Source author', roles: ['author'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false };
beforeEach(async () => {
  localStorage.clear(); sessionStorage.clear(); clearEditorTarget(); __resetCeremonies();
  vi.stubGlobal('fetch', vi.fn(async () => ok({ authenticated: true, user })));
  await authService.adoptSession(`fixture.${btoa(JSON.stringify({ userId: 281, organizationId: 28 }))}.synthetic`); publishShellProject({ id: PROGRAM });
  draftRegion = 'FDA'; draftingGuidance = '';
  commitReply = input => ok({ success: true, data: { docId: TARGET, programId: PROGRAM, plan: plan(input), sections: targetSections } });
  apiRequest.mockReset().mockImplementation(async (method: string, url: string, input?: AssemblyPreviewInput) => {
    const pathname = new URL(url, 'http://localhost').pathname;
    if (url === '/api/authoring/templates') return ok({ success: true, templates: [{ id: TEMPLATE, name: 'Source-led organization template', module: 'M3' }] });
    if (method === 'POST' && url.endsWith('/assembly/preview')) return ok({ success: true, data: plan(input!) });
    if (method === 'POST' && url.endsWith('/assembly/commit')) return commitReply(input!);
    if (method === 'POST' && url.endsWith('/ai/draft')) return ok({ success: true, draft: { content: `Candidate ${url}`, draftId: `draft-${url}`, metadata: {}, check: null } });
    if (url.startsWith('/api/authoring/docs?')) return ok({ success: true, documents: [priorDoc, targetDoc].map(doc => ({ ...doc, program_id: PROGRAM, readScope: 'document' })) });
    if (pathname === `/api/authoring/docs/${PRIOR}` || pathname === `/api/authoring/docs/${TARGET}`) return ok({ success: true, document: { ...(pathname.endsWith(PRIOR) ? priorDoc : targetDoc), client_program_id: PROGRAM } });
    if (pathname === `/api/authoring/docs/${PRIOR}/sections`) return ok({ success: true, sections: [priorSection] });
    if (pathname === `/api/authoring/docs/${TARGET}/sections`) return ok({ success: true, sections: targetSections });
    if (url.startsWith('/api/c2c/documents/')) return ok({}, 404);
    return ok({ success: true, sources: [], revisions: [], events: [], comments: [] });
  });
});
afterEach(() => { cleanup(); __resetCeremonies(); clearEditorTarget(); localStorage.clear(); sessionStorage.clear(); publishShellProject({ id: '' }); vi.unstubAllGlobals(); });
function editor() { return document.querySelector('.tiptap') as HTMLElement & { editor: Editor }; }
function postCalls(suffix: string) { return apiRequest.mock.calls.filter(([method, path]) => method === 'POST' && String(path).endsWith(suffix)); }
function handoff(sources = selectors) { act(() => { setEditorTarget({ docType: null, docId: TARGET, programId: PROGRAM, assemblySources: { version: 1, sources } }); }); }
async function mounted(overrides: Partial<DocumentWorkbenchProps> = {}) {
  const props: DocumentWorkbenchProps = { docs: [priorDoc, targetDoc], docsState: 'ready', status: 'all', programId: PROGRAM,
    onNav: vi.fn(), reloadDocs: vi.fn(async () => undefined), ...overrides };
  const view = render(<><SourceAssemblyAction programId={PROGRAM} sources={selectors} titles={manifest.entries.map(entry => entry.title)} />
    <DocumentWorkbench {...props} /></>);
  await waitFor(() => expect(editor()?.textContent).toContain('Existing saved current work.'));
  return { ...view, props };
}
async function chooseTemplate() {
  const input = await screen.findByLabelText('Template');
  await waitFor(() => expect((input as HTMLSelectElement).options.length).toBe(2));
  fireEvent.change(input, { target: { value: TEMPLATE } });
  await waitFor(() => expect(postCalls('/assembly/preview')).toHaveLength(1));
}
async function chooseTargetOnly() {
  fireEvent.click(screen.getByRole('button', { name: 'Build in editor' }));
  const working = await screen.findByLabelText('Working document');
  await waitFor(() => expect((working as HTMLSelectElement).options.length).toBe(3));
  fireEvent.change(working, { target: { value: TARGET } });
  fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
}
async function chooseFromCatalogue() {
  await chooseTargetOnly();
  await screen.findByRole('heading', { level: 1, name: 'Target general information' });
}
async function prepareCandidates() {
  await chooseFromCatalogue(); await chooseTemplate();
  fireEvent.click(screen.getByRole('button', { name: 'Preview build' }));
  await waitFor(() => expect(postCalls('/assembly/preview')).toHaveLength(2));
  fireEvent.change(screen.getByLabelText('Reason for build'), { target: { value: 'Assemble selected source candidates for review.' } });
  fireEvent.click(screen.getByLabelText('Draft empty eligible sections with AnA'));
  fireEvent.click(screen.getByRole('button', { name: 'Build document' }));
  await screen.findByText(/2 candidates retained for individual review/i);
}

describe('source-first intent reaches the one actual document editor', () => {
  it.each(['detail', 'sections'])('blocks a source-first structure action when the current %s read admits only sections', async projection => {
    const normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, url: string, input?: AssemblyPreviewInput) => {
      const pathname = new URL(url, 'http://localhost').pathname;
      if (method === 'GET' && projection === 'detail' && pathname === `/api/authoring/docs/${TARGET}`)
        return ok({ success: true, document: { ...targetDoc, readScope: 'sections', sourceMetadataState: 'unavailable' } });
      if (method === 'GET' && projection === 'sections' && pathname === `/api/authoring/docs/${TARGET}/sections`)
        return ok({ success: true, sections: targetSections, readScope: 'sections' });
      return normal(method, url, input);
    });
    await mounted(); await chooseFromCatalogue();
    const assembly = within(screen.getByLabelText('Document assembly'));
    expect(assembly.getByText(/Whole-document actions require the full document/)).toBeTruthy();
    expect((assembly.getByRole('button', { name: 'Preview build' }) as HTMLButtonElement).disabled).toBe(true);
    expect(postCalls('/assembly/preview')).toHaveLength(0);
    expect(postCalls('/assembly/commit')).toHaveLength(0);
    expect(postCalls('/ai/draft')).toHaveLength(0);
  });
  it.each([['FDA', false], ['EMA', true], ['PMDA', false], ['Health Canada', true]] as const)('retains %s drafting inputs and exact sources through chooser, build, review switches and regeneration (consumeDeepLinks=%s)', async (region, consumeDeepLinks) => {
    draftRegion = region; draftingGuidance = `Use the recorded ${region} template guidance; identify missing scientific evidence.`;
    await mounted({ consumeDeepLinks }); await chooseFromCatalogue();
    expect(postCalls('/assembly/preview')).toHaveLength(0);
    expect(postCalls('/assembly/commit')).toHaveLength(0);
    expect(postCalls('/ai/draft')).toHaveLength(0);
    await chooseTemplate();
    expect(postCalls('/assembly/preview')[0][2]).toMatchObject({ programId: PROGRAM, sources: selectors });
    fireEvent.click(screen.getByRole('button', { name: 'Preview build' }));
    await waitFor(() => expect(postCalls('/assembly/preview')).toHaveLength(2));
    fireEvent.change(screen.getByLabelText('Reason for build'), { target: { value: 'Assemble with these exact selected evidence sources.' } });
    fireEvent.click(screen.getByLabelText('Draft empty eligible sections with AnA'));
    fireEvent.change(screen.getByLabelText('Draft requirements (optional)'), { target: { value: '  Preserve units and distinguish missing evidence.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Build document' }));
    await waitFor(() => expect(postCalls('/ai/draft')).toHaveLength(2));
    expect(postCalls('/assembly/commit')[0][2]).toMatchObject({ sources: selectors });
    for (const call of postCalls('/ai/draft')) expect(call[2].sources).toEqual(manifest);
    const originalInputs = globalThis.structuredClone(postCalls('/ai/draft')[0][2]);
    expect(originalInputs).toMatchObject({ tone: 'professional', region, requirements: 'Preserve units and distinguish missing evidence.', sources: manifest });
    expect(JSON.parse(originalInputs.context.split('\n')[1])).toMatchObject({ kind: 'template-reference', templateId: TEMPLATE,
      sectionCode: targetSections[0].code, guidance: draftingGuidance });
    expect(originalInputs.context).toContain('BEGIN_TEMPLATE_REFERENCE_JSON');
    expect(originalInputs.context).toContain('END_TEMPLATE_REFERENCE_JSON');
    expect(postCalls('/accept')).toHaveLength(0);
    expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
    await screen.findByText(/2 candidates retained for individual review/i);
    fireEvent.change(screen.getByLabelText('Draft requirements (optional)'), { target: { value: 'Different instructions for a future assembly build.' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Review 3.2.S.1' }));
    await screen.findByTestId('ai-draft-body');
    fireEvent.click(screen.getByRole('button', { name: 'Review 3.2.S.2' }));
    await waitFor(() => expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toContain(targetSections[1].id));
    fireEvent.click(within(screen.getByTestId('ai-draft-panel')).getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('ai-draft-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review 3.2.S.1' }));
    await waitFor(() => expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toContain(NEXT));
    fireEvent.click(screen.getByTestId('ai-draft-regenerate'));
    await waitFor(() => expect(postCalls('/ai/draft')).toHaveLength(3));
    expect(postCalls('/ai/draft')[2][2].sources).toEqual(manifest);
    expect(postCalls('/ai/draft')[2][2]).toEqual(originalInputs);
    expect(postCalls('/assembly/commit')).toHaveLength(1);
    expect(postCalls('/accept')).toHaveLength(0);
    expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
    expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
  });

  it('does not bind sources after cancelling the actual dirty-work navigation', async () => {
    await mounted(); const original = editor();
    act(() => { original.editor.commands.insertContent('Unsaved source-independent note. '); });
    handoff();
    await screen.findByRole('alertdialog', { name: 'Unsaved changes in 3.2.S.1' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(editor()).toBe(original); expect(original.textContent).toContain('Unsaved source-independent note.');
    expect(screen.queryByRole('button', { name: 'Clear selected sources' })).toBeNull();
    expect(postCalls('/assembly/preview')).toHaveLength(0);
    fireEvent.click(screen.getByText('Selected assembly target'));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
    await screen.findByRole('heading', { level: 1, name: 'Target general information' });
    expect(screen.queryByRole('button', { name: 'Clear selected sources' })).toBeNull();
    handoff();
    await chooseTemplate();
    expect(postCalls('/assembly/preview')[0][2]).toMatchObject({ sources: selectors });
  });

  it('refuses source binding while a governed ceremony owns the current editor', async () => {
    await mounted(); const original = editor(); const close = registerCeremonyOpen();
    handoff();
    expect(editor()).toBe(original);
    expect(screen.queryByRole('button', { name: 'Clear selected sources' })).toBeNull();
    expect(postCalls('/assembly/preview')).toHaveLength(0);
    close(); handoff();
    await screen.findByRole('heading', { level: 1, name: 'Target general information' });
    await chooseTemplate();
    expect(postCalls('/assembly/preview')[0][2]).toMatchObject({ sources: selectors });
  });
});

describe('a changed source selection cannot become broad retrieval', () => {
  it('does not generate through an old open review after a new explicit source handoff', async () => {
    await mounted(); await prepareCandidates();
    fireEvent.click(screen.getByRole('button', { name: 'Review 3.2.S.1' }));
    await screen.findByTestId('ai-draft-body');
    handoff([{ kind: 'data-room', sourceId: 13, expectedChecksum: 'f'.repeat(64) }]);
    await waitFor(() => expect(screen.getByTestId('assembly-selected-sources').textContent).toContain('Data Room source 13'));
    if (!screen.queryByTestId('ai-draft-panel')) fireEvent.click(screen.getByTestId('ai-draft-open'));
    const generate = screen.queryByTestId('ai-draft-generate') ?? screen.queryByTestId('ai-draft-regenerate');
    if (generate) fireEvent.click(generate);
    await act(async () => { await Promise.resolve(); });
    expect(postCalls('/ai/draft')).toHaveLength(2);
    expect(postCalls('/accept')).toHaveLength(0);
    expect(screen.getByTestId('assembly-candidates').textContent).toMatch(/earlier source selection/i);
  });

  it('does not adopt a delayed old-selection regeneration into a new selection', async () => {
    await mounted(); await prepareCandidates();
    fireEvent.click(screen.getByRole('button', { name: 'Review 3.2.S.1' }));
    await screen.findByTestId('ai-draft-body');
    const original = apiRequest.getMockImplementation()!; const pending = deferred<Response>();
    apiRequest.mockImplementation((method: string, path: string, input?: AssemblyPreviewInput) =>
      method === 'POST' && path.endsWith('/ai/draft') ? pending.promise : original(method, path, input));
    fireEvent.click(screen.getByTestId('ai-draft-regenerate'));
    await waitFor(() => expect(postCalls('/ai/draft')).toHaveLength(3));
    expect(postCalls('/ai/draft')[2][2].sources).toEqual(manifest);
    handoff([{ kind: 'data-room', sourceId: 13, expectedChecksum: 'f'.repeat(64) }]);
    await waitFor(() => expect(screen.getByTestId('assembly-selected-sources').textContent).toContain('Data Room source 13'));
    await act(async () => { pending.resolve(ok({ success: true, draft: { content: 'Late wrong-selection candidate.', draftId: 'late-old-selection' } })); await pending.promise; });
    expect(screen.queryByDisplayValue('Late wrong-selection candidate.')).toBeNull();
    expect(postCalls('/accept')).toHaveLength(0);
  });
});

describe('source changes preserve unresolved structural writes', () => {
  it('keeps a lost commit held after another source handoff and an explicit clear', async () => {
    await mounted(); await chooseFromCatalogue(); await chooseTemplate();
    fireEvent.click(screen.getByRole('button', { name: 'Preview build' }));
    await waitFor(() => expect(postCalls('/assembly/preview')).toHaveLength(2));
    fireEvent.change(screen.getByLabelText('Reason for build'), { target: { value: 'Assemble explicitly selected source references.' } });
    const pending = deferred<Response>(); commitReply = () => pending.promise;
    fireEvent.click(screen.getByRole('button', { name: 'Build document' }));
    await waitFor(() => expect(postCalls('/assembly/commit')).toHaveLength(1));
    handoff([{ kind: 'data-room', sourceId: 13, expectedChecksum: 'f'.repeat(64) }]);
    await screen.findByText(/Document structure is still being built/i);
    expect(screen.getByTestId('assembly-selected-sources').textContent).toContain('Data Room source 12');
    expect(screen.getByTestId('assembly-selected-sources').textContent).not.toContain('Data Room source 13');
    await act(async () => { pending.resolve(new Response('unconfirmed response', { status: 502 })); await pending.promise; });
    await screen.findByRole('button', { name: 'Check saved document' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear selected sources' }));
    expect(screen.getByRole('button', { name: 'Check saved document' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Preview build' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Build document' }));
    expect(postCalls('/assembly/commit')).toHaveLength(1);
    expect(postCalls('/ai/draft')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Check saved document' }));
    await screen.findByText(/cannot identify the interrupted request/i);
    expect(postCalls('/assembly/commit')).toHaveLength(1);
    expect(screen.queryByText('Data Room source 13')).toBeNull();
    handoff([{ kind: 'data-room', sourceId: 13, expectedChecksum: 'f'.repeat(64) }]);
    await waitFor(() => expect(screen.getByTestId('assembly-selected-sources').textContent).toContain('Data Room source 13'));
    expect(postCalls('/assembly/commit')).toHaveLength(1);
    expect(postCalls('/ai/draft')).toHaveLength(0);
  });
});

describe('deferred source navigation retains its original scope', () => {
  it('preserves dirty text when the project is left and revisited before the leave decision', async () => {
    await mounted(); const original = editor();
    act(() => { original.editor.commands.insertContent('Retained through a project visit. '); });
    handoff();
    await screen.findByRole('alertdialog', { name: 'Unsaved changes in 3.2.S.1' });
    act(() => { publishShellProject({ id: '11111111-1111-4111-8111-111111111282' }); publishShellProject({ id: PROGRAM }); });
    fireEvent.click(screen.getByRole('button', { name: 'Leave without saving' }));
    expect(editor()).toBe(original);
    expect(original.textContent).toContain('Retained through a project visit.');
    expect(screen.queryByRole('button', { name: 'Clear selected sources' })).toBeNull();
    expect(screen.getByText(/source handoff context changed/i)).toBeTruthy();
    expect(postCalls('/assembly/preview')).toHaveLength(0);
    expect(postCalls('/ai/draft')).toHaveLength(0);
  });
});

describe('a pinned canvas hands a different selected target to the full existing editor', () => {
  it('retains dirty work on Stay and preserves exact source intent after an accepted handoff', async () => {
    const view = await mounted({ docs: [priorDoc], pinnedDocId: PRIOR }); const original = editor();
    act(() => { original.editor.commands.insertContent('Retained pinned-canvas work. '); });
    await chooseTargetOnly();
    await screen.findByRole('alertdialog', { name: 'Unsaved changes in 3.2.S.1' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(editor()).toBe(original); expect(original.textContent).toContain('Retained pinned-canvas work.');
    expect(view.props.onNav).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Clear selected sources' })).toBeNull();
    await chooseTargetOnly();
    fireEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
    await waitFor(() => expect(view.props.onNav).toHaveBeenCalledWith('document-authoring'));
    expect(view.props.onNav).toHaveBeenCalledTimes(1);
    expect(peekEditorTarget()).toMatchObject({ docId: TARGET, programId: PROGRAM, assemblySources: { version: 1, sources: selectors } });
    expect(postCalls('/assembly/commit')).toHaveLength(0);
    view.unmount();
    render(<DocumentWorkbench {...view.props} docs={[priorDoc, targetDoc]} pinnedDocId={undefined} consumeDeepLinks />);
    await screen.findByRole('heading', { level: 1, name: 'Target general information' });
    await chooseTemplate();
    expect(postCalls('/assembly/preview')[0][2]).toMatchObject({ sources: selectors });
    expect(postCalls('/ai/draft')).toHaveLength(0);
    expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
  });
});
