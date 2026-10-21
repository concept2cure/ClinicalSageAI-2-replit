// @vitest-environment jsdom
/** Actual Workbench, canonical assembly controller and AI review; synthetic HTTP only. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import type { AssemblyCommitData, AssemblyPlan, AssemblyPreviewInput, AssemblySection } from '@shared/authoring/assembly';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => ({
  ...(await original<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { displayName: 'Synthetic author', email: 'assembly@example.test' } }),
}));
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));

import { DocumentWorkbench, type DocumentWorkbenchProps } from '../DocumentWorkbench';
import { authService } from '@/services/portal/authService';
import { setAuthToken } from '@/utils/authToken';
import { publishShellProject } from '../../shellProject';
import { clearEditorTarget, setEditorTarget } from '../../editorTarget';
import { surfaceLeaveRefusal } from '../../navParams';
import { registerCeremonyOpen } from '../../ceremony';

const PID = 'bbbbbbbb-0000-4000-8000-000000000181';
const DOC = 'dddddddd-0000-4000-8000-000000000181';
const SEC = 'aaaaaaaa-0000-4000-8000-000000000181';
const SECOND = 'aaaaaaaa-0000-4000-8000-000000000182';
const THIRD = 'aaaaaaaa-0000-4000-8000-000000000183';
const TEMPLATE = 'cccccccc-0000-4000-8000-000000000181';
const OTHER = 'bbbbbbbb-0000-4000-8000-000000000182';
const AT = '2026-10-17T20:00:00Z';
const doc = { id: DOC, title: 'Assembly working document', module: 'M3', product_code: null,
  section_count: 1, status: 'DRAFT', updated_at: AT, client_program_id: PID };
const section = { id: SEC, doc_id: DOC, code: '3.2.P.8.1', title: 'Existing stability summary',
  content: '<p>Existing saved stability evidence.</p>', order_index: 7, updated_at: AT };
const emptySection = { id: SECOND, doc_id: DOC, code: '3.2.P.8.2', title: 'Post-approval stability protocol',
  content: '', order_index: 8, updated_at: AT };
const thirdSection = { ...emptySection, id: THIRD, code: '3.2.P.8.3', title: 'Stability data', order_index: 9 };
const template = { id: TEMPLATE, name: 'Organization stability assembly', module: 'M3' };
let savedSections: AssemblySection[];
let previewReply: (input: AssemblyPreviewInput) => Response | Promise<Response>;
let commitReply: (input: AssemblyPreviewInput) => Response | Promise<Response>;
let draftReply: (sectionId: string) => Response | Promise<Response>;
function plan(input: AssemblyPreviewInput): AssemblyPlan {
  const all = [section, emptySection, thirdSection];
  const selection = input.selection;
  const selected = selection.target === 'document' ? all : all.filter(row => row.code === selection.code);
  return { version: 1, docId: DOC, programId: PID, templateId: TEMPLATE, selection: input.selection,
    targetSnapshot: 'target-snapshot', templateSnapshot: 'template-snapshot', fingerprint: 'fingerprint-181',
    templateName: template.name, draftRegion: 'FDA', limitations: ['Working text requires human review.'], gaps: [],
    rows: selected.map(row => ({ code: row.code, title: row.title, content: row.content, ordering: row.order_index,
      disposition: row.id === SEC ? 'preserve' : 'append', ...(row.id === SEC ? { existingSectionId: SEC } : {}),
      aiDraftable: true, aiDraftableReason: 'Text drafting is permitted.', gaps: row.content ? [] : ['Scientific content is missing.'] })) };
}
function commit(input: AssemblyPreviewInput): AssemblyCommitData {
  const build = plan(input);
  const sections = [section, emptySection, thirdSection].filter(row => build.rows.some(item => item.code === row.code));
  savedSections = [...new Map([...savedSections, ...sections].map(row => [row.id, row])).values()];
  return { docId: DOC, programId: PID, plan: build, sections };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const user = (id = '181', organizationId = '18') => ({ id, organizationId, organizationName: null,
  email: 'assembly@example.test', firstName: 'Synthetic', lastName: 'Author', displayName: 'Synthetic author',
  roles: ['author'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false });
const bearer = (userId = '181', organizationId = '18', visit = 'original') =>
  `fixture.${btoa(JSON.stringify({ userId: Number(userId), organizationId: Number(organizationId), visit }))}.synthetic`;
function editorNode() { return document.querySelector('.tiptap') as HTMLElement & { editor: Editor }; }
for (const prototype of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  prototype.getClientRects ??= () => [];
  prototype.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}
beforeEach(async () => {
  localStorage.clear(); sessionStorage.clear(); clearEditorTarget();
  vi.stubGlobal('fetch', vi.fn(async () => ok({ authenticated: true, user: user() })));
  await authService.adoptSession(bearer());
  publishShellProject({ id: PID });
  savedSections = [section];
  previewReply = input => ok({ success: true, data: plan(input) });
  commitReply = input => ok({ success: true, data: commit(input) });
  draftReply = sectionId => ok({ success: true, draft: { content: `Retained candidate for ${sectionId}.`, draftId: `draft-${sectionId}`, metadata: {}, check: null } });
  apiRequest.mockReset().mockImplementation(async (method: string, url: string, body?: AssemblyPreviewInput) => {
    if (url === '/api/authoring/templates') return ok({ success: true, templates: [template] });
    if (method === 'POST' && url.endsWith('/assembly/preview')) return previewReply(body!);
    if (method === 'POST' && url.endsWith('/assembly/commit')) return commitReply(body!);
    const draftSection = url.match(/\/sections\/([^/]+)\/ai\/draft$/)?.[1];
    if (method === 'POST' && draftSection) return draftReply(draftSection);
    if (url.startsWith('/api/authoring/docs?')) return ok({ success: true, documents: [{ ...doc, program_id: PID }] });
    if (url === `/api/authoring/docs/${DOC}`) return ok({ success: true, document: doc });
    if (url === `/api/authoring/docs/${DOC}/sections`) return ok({ success: true, sections: savedSections });
    if (url.includes('/sources')) return ok({ sources: [] });
    if (url.startsWith('/api/c2c/documents/')) return ok({}, 404);
    return ok({ success: true });
  });
});
afterEach(() => {
  cleanup(); localStorage.clear(); sessionStorage.clear(); clearEditorTarget();
  publishShellProject({ id: '' }); vi.unstubAllGlobals();
});
async function mounted(overrides: Partial<DocumentWorkbenchProps> = {}) {
  const props: DocumentWorkbenchProps = { docs: [doc], docsState: 'ready', status: 'all',
    programId: PID, onNav: vi.fn(), reloadDocs: vi.fn(async () => undefined), ...overrides };
  const view = render(<DocumentWorkbench {...props} />);
  await waitFor(() => expect(editorNode()?.textContent).toContain('Existing saved stability evidence.'));
  return { props, ...view };
}
function localEdit() { act(() => { editorNode().editor.commands.insertContent('Unsaved local work. '); }); }
function aiCalls() { return apiRequest.mock.calls.filter(([method, url]) => method === 'POST' && String(url).includes('/ai/draft')); }
function assemblyCalls(stage: 'preview' | 'commit') { return apiRequest.mock.calls.filter(([method, url]) => method === 'POST' && String(url).endsWith(`/assembly/${stage}`)); }
async function previewBuild(targetCode?: string, withAna = false) {
  fireEvent.click(screen.getByText('Build document or section'));
  const templateInput = await screen.findByLabelText('Template');
  await waitFor(() => expect((templateInput as HTMLSelectElement).options.length).toBeGreaterThan(1));
  fireEvent.change(templateInput, { target: { value: TEMPLATE } });
  await waitFor(() => expect(assemblyCalls('preview')).toHaveLength(1));
  await screen.findByRole('option', { name: `${emptySection.code} ${emptySection.title}` });
  if (targetCode) fireEvent.change(screen.getByLabelText('Build target'), { target: { value: targetCode } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview build' }));
  await waitFor(() => expect(assemblyCalls('preview')).toHaveLength(2));
  fireEvent.change(screen.getByLabelText('Reason for build'), { target: { value: 'Assemble the selected saved template sections.' } });
  if (withAna) fireEvent.click(screen.getByLabelText('Draft empty eligible sections with AnA'));
  const build = screen.getByRole('button', { name: targetCode ? 'Build section' : 'Build document' }) as HTMLButtonElement;
  await waitFor(() => expect(build.disabled).toBe(false));
  return build;
}
async function buildDocument(withAna = false) {
  const build = await previewBuild(undefined, withAna);
  fireEvent.click(build);
  await waitFor(() => expect(assemblyCalls('commit')).toHaveLength(1));
}

describe('assembly is reachable in the one existing editor', () => {
  it('offers a build disclosure for the exact open saved document', async () => {
    await mounted();
    expect(screen.getByText('Build document or section')).toBeTruthy();
    expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
  });

  it('previews and builds without AnA in the exact document while preserving the selected editor and saved text', async () => {
    await mounted();
    const original = editorNode();
    await buildDocument();
    await screen.findByText(/Structure built in this document/);
    expect(assemblyCalls('commit')[0]).toEqual(['POST', `/api/authoring/docs/${DOC}/assembly/commit`, {
      programId: PID, templateId: TEMPLATE, selection: { target: 'document' }, fingerprint: 'fingerprint-181',
      reason: 'Assemble the selected saved template sections.',
    }, { Authorization: `Bearer ${bearer()}`, 'x-organization-id': '18' }]);
    expect(editorNode()).toBe(original);
    expect(original.textContent).toContain('Existing saved stability evidence.');
    expect(savedSections[0]).toEqual(section);
    expect(aiCalls()).toHaveLength(0);
    expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
  });

  it('assembles only the explicitly selected template section and keeps the current saved editor selected', async () => {
    await mounted();
    const original = editorNode();
    fireEvent.click(await previewBuild(emptySection.code));
    await screen.findByText(/Structure built in this document/);
    expect(assemblyCalls('commit')[0][2]).toMatchObject({ selection: { target: 'section', code: emptySection.code } });
    expect(savedSections.map(row => row.id)).toEqual([SEC, SECOND]);
    expect(editorNode()).toBe(original);
    expect(aiCalls()).toHaveLength(0);
  });

  it.each(['lost response', 'wrong document', 'malformed rows'])('holds a %s commit and requires an explicit saved-record check before a deliberate new preview', async mode => {
    await mounted();
    commitReply = input => {
      const data = commit(input);
      if (mode === 'lost response') throw new TypeError('Synthetic lost assembly response');
      return ok({ success: true, data: mode === 'wrong document' ? { ...data, docId: 'foreign-document' }
        : { ...data, sections: [{ ...data.sections[0], doc_id: 'foreign-document' }] } });
    };
    await buildDocument();
    const check = await screen.findByRole('button', { name: 'Check saved document' });
    fireEvent.click(screen.getByRole('button', { name: 'Build document' }));
    expect(assemblyCalls('commit')).toHaveLength(1);
    fireEvent.click(check);
    await screen.findByText(/cannot identify.*interrupted request/i);
    expect(assemblyCalls('commit')).toHaveLength(1);
    expect(aiCalls()).toHaveLength(0);
    expect(editorNode().textContent).toContain('Existing saved stability evidence.');
  });
});

describe('structural assembly retains the actual editor host', () => {
  it('refuses Back while the commit is pending and releases a confirmed structure normally', async () => {
    const onBack = vi.fn(); const pending = deferred<Response>(); commitReply = () => pending.promise;
    await mounted({ embedded: { onBack }, consumeDeepLinks: true });
    const original = editorNode(); await buildDocument();
    fireEvent.click(screen.getByTestId('workbench-back'));
    expect(onBack).not.toHaveBeenCalled(); expect(editorNode()).toBe(original);
    const input = assemblyCalls('commit')[0][2] as AssemblyPreviewInput;
    await act(async () => pending.resolve(ok({ success: true, data: commit(input) })));
    await screen.findByText(/Structure built in this document/);
    fireEvent.click(screen.getByTestId('workbench-back'));
    expect(onBack).toHaveBeenCalledOnce(); expect(assemblyCalls('commit')).toHaveLength(1);
  });

  it('refuses Back and an exact linked-section replacement while the commit remains unknown', async () => {
    const onBack = vi.fn();
    commitReply = input => { commit(input); throw new TypeError('Synthetic lost assembly response'); };
    await mounted({ embedded: { onBack }, consumeDeepLinks: true });
    await buildDocument(); await screen.findByRole('button', { name: 'Check saved document' });
    fireEvent.click(screen.getByTestId('workbench-back'));
    expect(onBack).not.toHaveBeenCalled();
    const reads = apiRequest.mock.calls.filter(([, url]) => url === `/api/authoring/docs/${DOC}/sections`).length;
    await act(async () => setEditorTarget({ docType: null, docId: DOC, code: emptySection.code, programId: PID }));
    expect(apiRequest.mock.calls.filter(([, url]) => url === `/api/authoring/docs/${DOC}/sections`)).toHaveLength(reads);
    expect(editorNode().getAttribute('aria-label')).toContain(section.code);
    expect(editorNode().textContent).toContain('Existing saved stability evidence.');
    expect(assemblyCalls('commit')).toHaveLength(1); expect(aiCalls()).toHaveLength(0);
  });

  it.each(['503', 'malformed'])('retains uncertainty when the actual host recovery read is %s after a verified inspection', async mode => {
    const onBack = vi.fn();
    commitReply = input => { commit(input); throw new TypeError('Synthetic lost assembly response'); };
    await mounted({ embedded: { onBack } }); await buildDocument();
    const check = await screen.findByRole('button', { name: 'Check saved document' });
    const normal = apiRequest.getMockImplementation()!; let reads = 0;
    apiRequest.mockImplementation((method: string, url: string, body?: AssemblyPreviewInput) => {
      if (method === 'GET' && url === `/api/authoring/docs/${DOC}/sections` && ++reads === 2) {
        return mode === '503' ? ok({ success: false }, 503)
          : ok({ success: true, sections: [{ ...section, doc_id: 'foreign-document' }] });
      }
      return normal(method, url, body);
    });
    fireEvent.click(check);
    await waitFor(() => expect(reads).toBe(2));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Check saved document' }) as HTMLButtonElement).disabled).toBe(false));
    expect(surfaceLeaveRefusal()).toMatch(/build|assembly|structur/i);
    fireEvent.click(screen.getByTestId('workbench-back'));
    expect(onBack).not.toHaveBeenCalled(); expect(assemblyCalls('commit')).toHaveLength(1);
    expect(aiCalls()).toHaveLength(0);
  });

  it('refuses a direct project switch without replaying it after the commit finishes', async () => {
    const pending = deferred<Response>(); commitReply = () => pending.promise;
    const view = await mounted(); await buildDocument();
    const onContinue = vi.fn(); const onCancel = vi.fn();
    view.rerender(<DocumentWorkbench {...view.props} programSwitchHeld pendingProgramSwitch={{ id: OTHER, label: 'Other project', onContinue, onCancel }} />);
    expect(onCancel).toHaveBeenCalledOnce(); expect(onContinue).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    const input = assemblyCalls('commit')[0][2] as AssemblyPreviewInput;
    await act(async () => pending.resolve(ok({ success: true, data: commit(input) })));
    view.rerender(<DocumentWorkbench {...view.props} />);
    expect(onContinue).not.toHaveBeenCalled(); expect(assemblyCalls('commit')).toHaveLength(1);
  });

  it.each(['account', 'bearer', 'refresh'] as const)('checks %s ownership before applying a delayed actual host recovery read', async transition => {
    authService.setToken(bearer(), user(), 'synthetic-refresh', 3600);
    const onBack = vi.fn();
    commitReply = input => { commit(input); throw new TypeError('Synthetic lost assembly response'); };
    await mounted({ embedded: { onBack } }); await buildDocument();
    const check = await screen.findByRole('button', { name: 'Check saved document' });
    const pending = deferred<Response>(); const normal = apiRequest.getMockImplementation()!; let reads = 0;
    apiRequest.mockImplementation((method: string, url: string, body?: AssemblyPreviewInput) =>
      method === 'GET' && url === `/api/authoring/docs/${DOC}/sections` && ++reads === 2
        ? pending.promise : normal(method, url, body));
    fireEvent.click(check); await waitFor(() => expect(reads).toBe(2));
    const session = authService.captureSessionReadGuard();
    await act(async () => {
      if (transition === 'account') authService.setToken(bearer('182'), user('182'), 'replacement-refresh', 3600);
      else if (transition === 'bearer') setAuthToken(bearer('182'));
      else {
        vi.stubGlobal('fetch', vi.fn(async () => ok({ accessToken: bearer('181', '18', 'refreshed'), refreshToken: 'next-refresh', expiresIn: 3600 })));
        expect(await authService.refreshToken()).toBe(true);
        expect(session.sameRevision()).toBe(true);
      }
    });
    const content = 'Text returned by the delayed host recovery read.';
    await act(async () => pending.resolve(ok({ success: true, sections: [{ ...section, content }] })));
    if (transition === 'refresh') {
      await screen.findByText(/cannot identify.*interrupted request/i);
    } else {
      expect(editorNode().textContent).toContain('Existing saved stability evidence.');
      expect(editorNode().textContent).not.toContain(content);
    }
    fireEvent.click(screen.getByTitle('Read the whole document'));
    if (transition === 'refresh') expect(await screen.findByText(content)).toBeTruthy();
    else expect(screen.queryByText(content)).toBeNull();
    fireEvent.click(screen.getByTestId('workbench-back'));
    expect(onBack).toHaveBeenCalledOnce(); expect(assemblyCalls('commit')).toHaveLength(1);
  });
});

describe('assembly follows the current server edit decision', () => {
  it('stops a previewed build when current server edit authority is refused', async () => {
    const reason = 'Editing needs an editing role in this organization. Your current organization access is read-only.';
    let allowed = true;
    const normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, url: string, input?: AssemblyPreviewInput) =>
      method === 'GET' && url === `/api/authoring/docs/${DOC}`
        ? ok({ success: true, document: doc, access: { edit: { allowed, reason: allowed ? null : reason } } })
        : normal(method, url, input));
    const view = await mounted();
    await previewBuild(undefined, true);
    allowed = false;
    view.rerender(<DocumentWorkbench {...view.props} docs={[{ ...doc, status: 'IN_REVIEW' }]} />);
    await waitFor(() => expect(editorNode().getAttribute('contenteditable')).toBe('false'));
    const assembly = within(screen.getByLabelText('Document assembly'));
    expect(assembly.getByText(reason)).toBeTruthy();
    const build = assembly.getByRole('button', { name: 'Build document' }) as HTMLButtonElement;
    expect(build.disabled).toBe(true);
    fireEvent.click(build);
    expect(assemblyCalls('commit')).toHaveLength(0);
    expect(aiCalls()).toHaveLength(0);
    expect(editorNode().textContent).toContain('Existing saved stability evidence.');
    expect(assembly.queryByText(/This document is frozen/)).toBeNull();
  });
});

describe('assembly late results preserve current work and scope', () => {
  it('retains text typed while a structural commit is pending and does not start AnA afterwards', async () => {
    await mounted();
    const pending = deferred<Response>();
    commitReply = () => pending.promise;
    await buildDocument(true);
    const original = editorNode();
    localEdit();
    const input = assemblyCalls('commit')[0][2] as AssemblyPreviewInput;
    await act(async () => { pending.resolve(ok({ success: true, data: commit(input) })); await pending.promise; });
    expect(editorNode()).toBe(original);
    expect(original.textContent).toContain('Unsaved local work.');
    expect(aiCalls()).toHaveLength(0);
    expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
    expect(screen.getByLabelText('Document assembly').textContent).toMatch(/confirmed saved.*Context changed before drafting/i);
    expect((screen.getByRole('button', { name: 'Retry remaining candidates' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('retains edits typed during the confirmed build refresh and does not begin later generation', async () => {
    await mounted();
    const refresh = deferred<Response>();
    const normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, url: string, input?: AssemblyPreviewInput) =>
      method === 'GET' && url === `/api/authoring/docs/${DOC}/sections` ? refresh.promise : normal(method, url, input));
    await buildDocument(true);
    await waitFor(() => expect(apiRequest.mock.calls.filter(([method, url]) => method === 'GET' && url === `/api/authoring/docs/${DOC}/sections`)).toHaveLength(2));
    const original = editorNode();
    localEdit();
    await act(async () => { refresh.resolve(ok({ success: true, sections: savedSections })); await refresh.promise; });
    expect(editorNode()).toBe(original);
    expect(original.textContent).toContain('Unsaved local work.');
    expect(aiCalls()).toHaveLength(0);
    expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
  });

  it.each(['project round trip', 'account change', 'organization change', 'unmount'])('suppresses a delayed confirmed build after %s', async mode => {
    const view = await mounted();
    const pending = deferred<Response>();
    commitReply = () => pending.promise;
    await buildDocument(true);
    if (mode === 'project round trip') act(() => { publishShellProject({ id: OTHER }); publishShellProject({ id: PID }); });
    if (mode === 'account change' || mode === 'organization change') {
      vi.stubGlobal('fetch', vi.fn(async () => ok({ authenticated: true,
        user: mode === 'account change' ? user('182') : user('181', '19') })));
      await act(async () => { await authService.adoptSession('synthetic-other-author'); });
    }
    if (mode === 'unmount') view.unmount();
    const input = assemblyCalls('commit')[0][2] as AssemblyPreviewInput;
    await act(async () => { pending.resolve(ok({ success: true, data: commit(input) })); await pending.promise; });
    expect(aiCalls()).toHaveLength(0);
    expect(view.props.reloadDocs).not.toHaveBeenCalled();
    expect(view.props.onNav).not.toHaveBeenCalled();
    expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
    if (mode !== 'unmount') expect(editorNode().textContent).toContain('Existing saved stability evidence.');
  });
});

describe('automatic AnA preparation retains individual review in the existing panel', () => {
  it('starts exact empty sections sequentially and never accepts generated candidates automatically', async () => {
    await mounted();
    const first = deferred<Response>();
    draftReply = sectionId => sectionId === SECOND ? first.promise
      : ok({ success: true, draft: { content: 'Second retained candidate.', draftId: 'candidate-third', metadata: {} } });
    await buildDocument(true);
    await waitFor(() => expect(aiCalls()).toHaveLength(1));
    expect(aiCalls()[0][1]).toBe(`/api/authoring/sections/${SECOND}/ai/draft`);
    await act(async () => { first.resolve(ok({ success: true, draft: { content: 'First retained candidate.', draftId: 'candidate-second', metadata: {} } })); await first.promise; });
    await screen.findByRole('button', { name: `Review ${thirdSection.code}` });
    expect(aiCalls().map(([, url]) => url)).toEqual([`/api/authoring/sections/${SECOND}/ai/draft`, `/api/authoring/sections/${THIRD}/ai/draft`]);
    expect(apiRequest.mock.calls.some(([, url]) => String(url).endsWith('/accept'))).toBe(false);
    expect(editorNode().textContent).toContain('Existing saved stability evidence.');
    fireEvent.click(screen.getByRole('button', { name: `Review ${emptySection.code}` }));
    await screen.findByTestId('ai-draft-panel');
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe('First retained candidate.');
    expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
  });

  it('keeps candidate edits and stated reasons across review switches and asks before leaving dirty editor work', async () => {
    await mounted();
    await buildDocument(true);
    fireEvent.click(await screen.findByRole('button', { name: `Review ${emptySection.code}` }));
    await screen.findByTestId('ai-draft-panel');
    fireEvent.change(screen.getByTestId('ai-draft-body'), { target: { value: 'Human-edited first candidate.' } });
    fireEvent.change(screen.getByPlaceholderText('Accepted AI draft'), { target: { value: 'Checked against the stability evidence.' } });
    fireEvent.click(screen.getByRole('button', { name: `Review ${thirdSection.code}` }));
    await waitFor(() => expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toContain(THIRD));
    fireEvent.click(screen.getByRole('button', { name: `Review ${emptySection.code}` }));
    await waitFor(() => expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe('Human-edited first candidate.'));
    expect((screen.getByPlaceholderText('Accepted AI draft') as HTMLInputElement).value).toBe('Checked against the stability evidence.');
    localEdit();
    const dirtyEditor = editorNode();
    fireEvent.click(screen.getByRole('button', { name: `Review ${thirdSection.code}` }));
    await screen.findByRole('alertdialog', { name: `Unsaved changes in ${emptySection.code}` });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(editorNode()).toBe(dirtyEditor);
    expect(dirtyEditor.textContent).toContain('Unsaved local work.');
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe('Human-edited first candidate.');
    expect((screen.getByTestId('ai-draft-accept') as HTMLButtonElement).disabled).toBe(true);
    expect(apiRequest.mock.calls.some(([, url]) => String(url).endsWith('/accept'))).toBe(false);
  });

  it('retains an already reviewed candidate when the next queued section completes', async () => {
    await mounted();
    const second = deferred<Response>();
    draftReply = sectionId => sectionId === THIRD ? second.promise
      : ok({ success: true, draft: { content: 'First candidate ready while queue continues.', draftId: 'first-ready', metadata: {} } });
    await buildDocument(true);
    await waitFor(() => expect(aiCalls()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: `Review ${emptySection.code}` }));
    await screen.findByTestId('ai-draft-panel');
    fireEvent.change(screen.getByTestId('ai-draft-body'), { target: { value: 'Edits made while second generation is pending.' } });
    fireEvent.change(screen.getByPlaceholderText('Accepted AI draft'), { target: { value: 'Evidence checked during preparation.' } });
    await act(async () => { second.resolve(ok({ success: true, draft: { content: 'Second ready later.', draftId: 'second-later', metadata: {} } })); await second.promise; });
    await screen.findByRole('button', { name: `Review ${thirdSection.code}` });
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe('Edits made while second generation is pending.');
    expect((screen.getByPlaceholderText('Accepted AI draft') as HTMLInputElement).value).toBe('Evidence checked during preparation.');
    expect(apiRequest.mock.calls.some(([, url]) => String(url).endsWith('/accept'))).toBe(false);
  });

  it('reports a provider refusal truthfully and retains the completed candidate without an automatic retry', async () => {
    await mounted();
    draftReply = sectionId => sectionId === SECOND
      ? ok({ success: true, draft: { content: 'Completed candidate before refusal.', draftId: 'kept-candidate', metadata: {} } })
      : ok({ success: false, message: 'Synthetic provider unavailable; no candidate was produced.' }, 503);
    await buildDocument(true);
    await screen.findByText(/Synthetic provider unavailable/);
    expect(aiCalls()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: `Review ${emptySection.code}` }));
    await screen.findByTestId('ai-draft-panel');
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe('Completed candidate before refusal.');
    expect(apiRequest.mock.calls.some(([, url]) => String(url).endsWith('/accept'))).toBe(false);
    expect(aiCalls()).toHaveLength(2);
  });
});

it('refuses retained candidate navigation when a governed ceremony opens during its exact read', async () => {
  await mounted(); await buildDocument(true);
  await screen.findByText(/2 candidates retained for individual review/);
  const pending = deferred<Response>(); const normal = apiRequest.getMockImplementation()!;
  let reading = false;
  apiRequest.mockImplementation((method: string, url: string, body?: AssemblyPreviewInput) => {
    if (method === 'GET' && url === `/api/authoring/docs/${DOC}/sections`) { reading = true; return pending.promise; }
    return normal(method, url, body);
  });
  fireEvent.click(screen.getByRole('button', { name: `Review ${emptySection.code}` }));
  await waitFor(() => expect(reading).toBe(true));
  const release = registerCeremonyOpen();
  try {
    await act(async () => pending.resolve(ok({ success: true, sections: savedSections })));
    expect(screen.queryByTestId('ai-draft-panel')).toBeNull();
    expect(editorNode().getAttribute('aria-label')).toContain(section.code);
  } finally { release(); }
});
