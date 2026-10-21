// @vitest-environment jsdom
/** Actual existing editor/build controller/transports; synthetic HTTP only. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import type { AssemblyPlan, AssemblyPreviewInput, AssemblySection } from '@shared/authoring/assembly';
import type { AssemblySourceManifest, AssemblySourceSelector } from '@shared/authoring/assembly-sources';
import type { SavedAssemblySources } from '@shared/authoring/saved-assembly-sources';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => ({ ...(await original<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { displayName: 'Saved source author', email: 'saved@example.test' } }) }));
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
import { DocumentWorkbench } from '../DocumentWorkbench';
import { authService } from '@/services/portal/authService';
import { clearEditorTarget, setEditorTarget } from '../../editorTarget';
import { publishShellProject } from '../../shellProject';
import { __resetCeremonies, registerCeremonyOpen } from '../../ceremony';

const PROGRAM = '11111111-1111-4111-8111-111111111381';
const DOC = '22222222-2222-4222-8222-222222222381';
const SECTION = '33333333-3333-4333-8333-333333333381';
const NEXT = '33333333-3333-4333-8333-333333333382';
const TEMPLATE = '44444444-4444-4444-8444-444444444381';
const VAULT = '55555555-5555-4555-8555-555555555381';
const EVENT = '66666666-6666-4666-8666-666666666381';
const AT = '2026-10-18T01:00:00.000Z';
const selectors: AssemblySourceSelector[] = [{ kind: 'data-room', sourceId: 31, expectedChecksum: 'a'.repeat(64) }, { kind: 'vault', documentId: VAULT }];
const historical: AssemblySourceManifest = { version: 1, programId: PROGRAM, fingerprint: 'b'.repeat(64), limitations: ['Historical reference intent; not citations.'],
  entries: selectors.map((source, index) => ({ source, title: index ? 'Historical Vault report' : 'Historical retained study',
    contentHash: 'a'.repeat(64), extractedTextSha256: 'c'.repeat(64), version: 'v2', originalFileAvailable: false,
    disposition: 'keep_data', span: { start: 10, end: 110, totalChars: 400, sha256: 'd'.repeat(64) } })) };
const freshManifest: AssemblySourceManifest = { ...historical, fingerprint: 'e'.repeat(64),
  entries: historical.entries.map(entry => ({ ...entry, span: { start: 200, end: 300, totalChars: 400, sha256: 'f'.repeat(64) } })) };
const savedRecord: SavedAssemblySources = { version: 1, docId: DOC, programId: PROGRAM, record: { eventId: EVENT, recordedAt: AT, manifest: historical } };
const doc = { id: DOC, title: 'Saved reference working document', module: 'M3', product_code: null, status: 'DRAFT', updated_at: AT, section_count: 1 };
const section: AssemblySection = { id: SECTION, doc_id: DOC, code: '3.2.S.1', title: 'Existing saved section', content: '<p>Existing authored text.</p>', order_index: 3, updated_at: AT };
const nextSection: AssemblySection = { id: NEXT, doc_id: DOC, code: '3.2.S.2', title: 'Missing manufacture section', content: '', order_index: 4, updated_at: AT };
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
let savedReply: () => Response | Promise<Response>;
let commitReply: (input: AssemblyPreviewInput) => Response | Promise<Response>;
let storedSections: AssemblySection[];
function plan(input: AssemblyPreviewInput): AssemblyPlan {
  return { version: 1, docId: DOC, programId: PROGRAM, templateId: TEMPLATE, selection: input.selection,
    targetSnapshot: 'current-target', templateSnapshot: 'current-template', fingerprint: 'fresh-build-plan',
    templateName: 'Organization section template', draftRegion: 'FDA', limitations: [], gaps: [],
    ...(input.sources ? { sources: freshManifest } : {}), rows: [section, nextSection].map(row => ({ code: row.code,
      title: row.title, content: row.content, ordering: row.order_index, disposition: row.id === SECTION ? 'preserve' : 'append',
      ...(row.id === SECTION ? { existingSectionId: SECTION } : {}), aiDraftable: true, aiDraftableReason: 'Narrative section.', gaps: [] })) };
}
for (const prototype of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  prototype.getClientRects ??= () => [];
  prototype.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}
const user = { id: '381', organizationId: '38', organizationName: null, email: 'saved@example.test', firstName: 'Saved', lastName: 'Author', displayName: 'Saved source author', roles: ['author'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false };
const sessionToken = (userId: number, visit: string) => `fixture.${btoa(JSON.stringify({ userId, organizationId: 38, visit }))}.synthetic`;
beforeEach(async () => {
  localStorage.clear(); sessionStorage.clear(); clearEditorTarget(); __resetCeremonies();
  vi.stubGlobal('fetch', vi.fn(async () => ok({ authenticated: true, user })));
  await authService.adoptSession(sessionToken(381, 'saved-source')); publishShellProject({ id: PROGRAM });
  storedSections = [section]; savedReply = () => ok({ success: true, data: savedRecord });
  commitReply = input => { storedSections = [section, nextSection]; return ok({ success: true,
    data: { docId: DOC, programId: PROGRAM, plan: plan(input), sections: storedSections } }); };
  apiRequest.mockReset().mockImplementation(async (method: string, url: string, input?: AssemblyPreviewInput) => {
    if (url.includes('/assembly/sources?')) return savedReply();
    if (url === '/api/authoring/templates') return ok({ success: true, templates: [{ id: TEMPLATE, name: 'Organization section template' }] });
    if (method === 'POST' && url.endsWith('/assembly/preview')) return ok({ success: true, data: plan(input!) });
    if (method === 'POST' && url.endsWith('/assembly/commit')) return commitReply(input!);
    if (method === 'POST' && url.endsWith('/ai/draft')) return ok({ success: true, draft: { content: 'Fresh selected-source candidate.', draftId: 'fresh-candidate', metadata: {} } });
    if (url.startsWith('/api/authoring/docs?')) return ok({ success: true, documents: [{ ...doc, program_id: PROGRAM }] });
    if (url === `/api/authoring/docs/${DOC}`) return ok({ success: true, document: { ...doc, client_program_id: PROGRAM } });
    if (url === `/api/authoring/docs/${DOC}/sections`) return ok({ success: true, sections: storedSections });
    if (url.startsWith('/api/c2c/documents/')) return ok({}, 404);
    return ok({ success: true, sources: [], comments: [], revisions: [], events: [] });
  });
});
afterEach(() => { cleanup(); __resetCeremonies(); clearEditorTarget(); localStorage.clear(); sessionStorage.clear(); publishShellProject({ id: '' }); vi.unstubAllGlobals(); });
function editor() { return document.querySelector('.tiptap') as HTMLElement & { editor: Editor }; }
function savedReads() { return apiRequest.mock.calls.filter(([method, path]) => method === 'GET' && String(path).includes('/assembly/sources?')); }
function posts(suffix = '') { return apiRequest.mock.calls.filter(([method, path]) => method === 'POST' && String(path).endsWith(suffix)); }
async function mounted() {
  const view = render(<DocumentWorkbench docs={[doc]} docsState="ready" status="all" programId={PROGRAM} onNav={vi.fn()} reloadDocs={vi.fn(async () => undefined)} />);
  await waitFor(() => expect(editor()?.textContent).toContain('Existing authored text.'));
  return view;
}
async function openBuild() {
  fireEvent.click(screen.getByText('Build document or section'));
  return screen.findByRole('button', { name: 'Check saved sources' });
}
async function inspectSaved() {
  fireEvent.click(await openBuild());
  const reuse = await screen.findByRole('button', { name: 'Use saved sources' });
  await waitFor(() => expect((reuse as HTMLButtonElement).disabled).toBe(false));
  return reuse;
}
async function freshPreview(withAna: boolean) {
  const template = screen.getByLabelText('Template');
  await waitFor(() => expect((template as HTMLSelectElement).options.length).toBe(2));
  fireEvent.change(template, { target: { value: TEMPLATE } });
  await waitFor(() => expect(posts('/assembly/preview')).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: 'Preview build' }));
  await waitFor(() => expect(posts('/assembly/preview')).toHaveLength(2));
  await screen.findByTestId('assembly-plan');
  fireEvent.change(screen.getByLabelText('Reason for build'), { target: { value: 'Create a fresh build from checked historical references.' } });
  if (withAna) fireEvent.click(screen.getByLabelText('Draft empty eligible sections with AnA'));
}
async function checkSettled(count: number) {
  await waitFor(() => expect(savedReads()).toHaveLength(count));
  await waitFor(() => expect((screen.getByRole('button', { name: 'Check saved sources' }) as HTMLButtonElement).disabled).toBe(false));
}
function noAdoptionOrWrite() {
  expect(screen.queryByTestId('assembly-selected-sources')).toBeNull();
  expect(posts()).toHaveLength(0); expect(editor().textContent).toContain('Existing authored text.');
}

describe('saved references reopen in the one actual editor', () => {
  it.each([false, true])('checks history without selecting it, freshly reuses it and previews before building (AnA=%s)', async withAna => {
    const first = await mounted(); first.unmount(); await mounted();
    expect(savedReads()).toHaveLength(0); expect(posts()).toHaveLength(0);
    const original = editor(); const reuse = await inspectSaved();
    expect(screen.queryByTestId('assembly-selected-sources')).toBeNull();
    expect(savedReads()).toHaveLength(1); expect(posts()).toHaveLength(0);
    expect(screen.getByText('Historical retained study')).toBeTruthy();
    fireEvent.click(reuse);
    await screen.findByTestId('assembly-selected-sources');
    expect(savedReads()).toHaveLength(2); expect(posts()).toHaveLength(0);
    expect((screen.getByLabelText('Reason for build') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Draft empty eligible sections with AnA') as HTMLInputElement).checked).toBe(false);
    await freshPreview(withAna);
    for (const call of posts('/assembly/preview')) expect(call[2].sources).toEqual(selectors);
    fireEvent.click(screen.getByRole('button', { name: 'Build document' }));
    await screen.findByText(/Structure built in this document|candidate retained for individual review/i);
    expect(posts('/assembly/commit')[0][2].sources).toEqual(selectors);
    if (withAna) {
      await waitFor(() => expect(posts('/ai/draft')).toHaveLength(1));
      expect(posts('/ai/draft')[0][2].sources).toEqual(freshManifest);
    } else expect(posts('/ai/draft')).toHaveLength(0);
    expect(posts('/accept')).toHaveLength(0); expect(editor()).toBe(original);
    expect(original.textContent).toContain('Existing authored text.');
    expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
  });
});

describe('historical checks fail closed in the actual editor', () => {
  it('distinguishes an admitted empty history from a failed read without selecting or changing text', async () => {
    savedReply = () => ok({ success: true, data: { ...savedRecord, record: null } });
    await mounted(); fireEvent.click(await openBuild()); await checkSettled(1);
    noAdoptionOrWrite(); expect(screen.queryByText('Historical retained study')).toBeNull();
    expect(screen.getByText('No source-based build references are recorded for this document.')).toBeTruthy();
    savedReply = () => ok({ success: false, error: 'SAVED_ASSEMBLY_SOURCES_UNAVAILABLE', message: 'Saved references could not be verified.' }, 503);
    fireEvent.click(screen.getByRole('button', { name: 'Check saved sources' })); await checkSettled(2);
    noAdoptionOrWrite(); expect(screen.queryByText('Historical retained study')).toBeNull();
    expect(within(screen.getByTestId('saved-assembly-sources')).getByRole('alert').textContent).toContain('Saved references could not be verified.');
    expect(screen.queryByText('No source-based build references are recorded for this document.')).toBeNull();
  });

  it.each(['malformed manifest', 'foreign scoped success'])('does not publish or adopt %s', async mode => {
    savedReply = () => ok({ success: true, data: mode === 'foreign scoped success'
      ? { ...savedRecord, docId: '22222222-2222-4222-8222-222222222382' }
      : { ...savedRecord, record: { ...savedRecord.record, manifest: { ...historical, entries: [] } } } });
    await mounted(); fireEvent.click(await openBuild()); await checkSettled(1);
    const reuse = screen.queryByRole('button', { name: 'Use saved sources' }); if (reuse) fireEvent.click(reuse);
    noAdoptionOrWrite(); expect(savedReads()).toHaveLength(1);
    expect(screen.queryByText('Historical retained study')).toBeNull();
  });

  it('refuses a newer saved event during reuse instead of silently selecting it', async () => {
    await mounted(); const reuse = await inspectSaved();
    savedReply = () => ok({ success: true, data: { ...savedRecord,
      record: { ...savedRecord.record, eventId: '66666666-6666-4666-8666-666666666382' } } });
    fireEvent.click(reuse); await checkSettled(2);
    noAdoptionOrWrite();
  });
});

describe('reuse respects the current editor and selection owner', () => {
  it('lets dirty authors inspect but blocks reuse while text or a ceremony owns the editor', async () => {
    const view = await mounted(); const reuse = await inspectSaved();
    act(() => { editor().editor.commands.insertContent('Local work remains here. '); });
    expect((reuse as HTMLButtonElement).disabled).toBe(true); fireEvent.click(reuse);
    expect(savedReads()).toHaveLength(1); expect(editor().textContent).toContain('Local work remains here.');
    view.unmount(); await mounted(); const cleanReuse = await inspectSaved();
    const close = registerCeremonyOpen(); fireEvent.click(cleanReuse); close();
    expect(savedReads()).toHaveLength(2); noAdoptionOrWrite();
  });

  it('gives a new catalogue selection precedence over a delayed historical check', async () => {
    const pending = deferred<Response>(); savedReply = () => pending.promise;
    await mounted(); fireEvent.click(await openBuild());
    const sources: AssemblySourceSelector[] = [{ kind: 'data-room', sourceId: 32 }];
    act(() => setEditorTarget({ docType: null, docId: DOC, programId: PROGRAM, assemblySources: { version: 1, sources } }));
    await waitFor(() => expect(screen.getByTestId('assembly-selected-sources').textContent).toContain('Data Room source 32'));
    await act(async () => { pending.resolve(ok({ success: true, data: savedRecord })); await pending.promise; });
    expect(screen.queryByText('Historical retained study')).toBeNull();
    const reuse = screen.queryByRole('button', { name: 'Use saved sources' }); if (reuse) fireEvent.click(reuse);
    expect(savedReads()).toHaveLength(1); expect(posts()).toHaveLength(0);
    expect(screen.getByTestId('assembly-selected-sources').textContent).toContain('Data Room source 32');
  });

  it('keeps an unresolved structural write held after checking historical references', async () => {
    await mounted(); await openBuild(); await freshPreview(false);
    commitReply = () => ok({ success: false, message: 'Outcome unconfirmed.' }, 502);
    fireEvent.click(screen.getByRole('button', { name: 'Build document' }));
    await screen.findByRole('button', { name: 'Check saved document' });
    fireEvent.click(screen.getByRole('button', { name: 'Check saved sources' })); await checkSettled(1);
    const reuse = screen.getByRole('button', { name: 'Use saved sources' });
    expect((reuse as HTMLButtonElement).disabled).toBe(true); fireEvent.click(reuse);
    expect(savedReads()).toHaveLength(1); expect(posts('/assembly/commit')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Check saved document' })).toBeTruthy();
    expect(posts('/ai/draft')).toHaveLength(0);
  });
});

describe('late saved references cannot revive a prior scope', () => {
  it.each(['project visit', 'account session'])('suppresses a doubled check across %s ABA', async mode => {
    const pending = deferred<Response>(); savedReply = () => pending.promise;
    await mounted(); const check = await openBuild();
    act(() => { fireEvent.click(check); fireEvent.click(check); });
    expect(savedReads()).toHaveLength(1);
    if (mode === 'project visit') act(() => { publishShellProject({ id: '11111111-1111-4111-8111-111111111382' }); publishShellProject({ id: PROGRAM }); });
    else {
      vi.stubGlobal('fetch', vi.fn(async () => ok({ authenticated: true, user: { ...user, id: '382' } })));
      await act(async () => { await authService.adoptSession(sessionToken(382, 'another-session')); });
      vi.stubGlobal('fetch', vi.fn(async () => ok({ authenticated: true, user })));
      await act(async () => { await authService.adoptSession(sessionToken(381, 'restored-session')); });
    }
    await act(async () => { pending.resolve(ok({ success: true, data: savedRecord })); await pending.promise; });
    expect(screen.queryByText('Historical retained study')).toBeNull(); noAdoptionOrWrite();
  });
});

describe('manual draft review retains its buffer during a saved-source reuse', () => {
  it('blocks late reuse after the draft pane opens, then permits a fresh explicit check after closing it', async () => {
    await mounted(); const reuse = await inspectSaved();
    const pending = deferred<Response>(); savedReply = () => pending.promise;
    fireEvent.click(reuse); await waitFor(() => expect(savedReads()).toHaveLength(2));
    fireEvent.click(screen.getByTestId('ai-draft-open'));
    fireEvent.click(await screen.findByTestId('ai-draft-generate'));
    const body = await screen.findByTestId('ai-draft-body') as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: 'My retained manual review edits.' } });
    await act(async () => { pending.resolve(ok({ success: true, data: savedRecord })); await pending.promise; });
    await checkSettled(2);
    expect(body.value).toBe('My retained manual review edits.');
    expect(screen.queryByTestId('assembly-selected-sources')).toBeNull();
    expect(posts('/assembly/commit')).toHaveLength(0); expect(posts('/accept')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    savedReply = () => ok({ success: true, data: savedRecord });
    fireEvent.click(screen.getByRole('button', { name: 'Check saved sources' })); await checkSettled(3);
    fireEvent.click(screen.getByRole('button', { name: 'Use saved sources' }));
    await screen.findByTestId('assembly-selected-sources');
    expect(savedReads()).toHaveLength(4); expect(posts('/ai/draft')).toHaveLength(1);
  });
});
