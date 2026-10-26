// @vitest-environment jsdom
/** Actual Workbench, canonical assembly controller and AI review; synthetic HTTP only. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AssemblyCommitData, AssemblyPreviewInput, AssemblySection } from '@shared/authoring/assembly';

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

import { DocumentWorkbench } from '../DocumentWorkbench';
import { PID, DOC, SEC, SECOND, THIRD, TEMPLATE, OTHER, SECTIONS_READ, doc, section, emptySection, thirdSection, template, plan, deferred, ok, user, bearer, editorNode, mounted, localEdit, assemblyUi } from './workbenchAssemblyBuild.testSupport';
import { authService } from '@/services/portal/authService';
import { setAuthToken } from '@/utils/authToken';
import { publishShellProject } from '../../shellProject';
import { clearEditorTarget, setEditorTarget } from '../../editorTarget';
import { surfaceLeaveRefusal } from '../../navParams';
import { registerCeremonyOpen } from '../../ceremony';

const { aiCalls, assemblyCalls, previewBuild, buildDocument } = assemblyUi(apiRequest);
let savedSections: AssemblySection[];
let previewReply: (input: AssemblyPreviewInput) => Response | Promise<Response>;
let commitReply: (input: AssemblyPreviewInput) => Response | Promise<Response>;
let draftReply: (sectionId: string) => Response | Promise<Response>;
function commit(input: AssemblyPreviewInput): AssemblyCommitData {
  const build = plan(input);
  const sections = [section, emptySection, thirdSection].filter(row => build.rows.some(item => item.code === row.code));
  savedSections = [...new Map([...savedSections, ...sections].map(row => [row.id, row])).values()];
  return { docId: DOC, programId: PID, plan: build, sections };
}
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
    const pathname = new URL(url, 'http://localhost').pathname;
    if (url === '/api/authoring/templates') return ok({ success: true, templates: [template] });
    if (method === 'POST' && url.endsWith('/assembly/preview')) return previewReply(body!);
    if (method === 'POST' && url.endsWith('/assembly/commit')) return commitReply(body!);
    const draftSection = url.match(/\/sections\/([^/]+)\/ai\/draft$/)?.[1];
    if (method === 'POST' && draftSection) return draftReply(draftSection);
    if (url.startsWith('/api/authoring/docs?')) return ok({ success: true, documents: [{ ...doc, program_id: PID }] });
    if (pathname === `/api/authoring/docs/${DOC}`) return ok({ success: true, document: doc });
    if (pathname === `/api/authoring/docs/${DOC}/sections`) return ok({ success: true, sections: savedSections });
    if (url.includes('/sources')) return ok({ sources: [] });
    if (url.startsWith('/api/c2c/documents/')) return ok({}, 404);
    return ok({ success: true });
  });
});
afterEach(() => {
  cleanup(); localStorage.clear(); sessionStorage.clear(); clearEditorTarget();
  publishShellProject({ id: '' }); vi.unstubAllGlobals();
});
describe('assembly is reachable in the one existing editor', () => {
  it('offers a build disclosure for the exact open saved document', async () => {
    await mounted();
    expect(screen.getByText('Build document or section')).toBeTruthy();
    expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
  });

  it.each([false, true])('keeps the selected build and exact template through metadata search, with AnA %s', async withAna => {
    const normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method, url, ...args) => url === '/api/authoring/templates'
      ? Promise.resolve(ok({ success: true, globalCatalog: 'ok', templates: [
        { ...template, regions: ['FDA'], description: 'Stored stability reference' },
        { id: 'japan-preparation', name: 'Diagnostic reference', regions: ['JP'], template_type: 'PMDA' },
      ] })) : normal(method, url, ...args));
    await mounted(); const original = editorNode();
    const build = await previewBuild(undefined, withAna);
    const before = screen.getByTestId('assembly-plan').textContent;
    const count = apiRequest.mock.calls.length;
    const search = screen.getByRole('searchbox', { name: 'Search templates' }) as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'PMDA' } });
    expect(screen.getByText('1 of 2 templates')).toBeTruthy();
    const picker = screen.getByLabelText('Template') as HTMLSelectElement;
    expect(picker.value).toBe(TEMPLATE);
    expect(within(picker).getByRole('option', { name: template.name }).closest('optgroup')?.label).toBe('Selected template');
    expect(within(picker).queryByRole('option', { name: '(blank document)' })).toBeNull();
    expect(screen.getByTestId('assembly-plan').textContent).toBe(before);
    expect((screen.getByLabelText('Reason for build') as HTMLInputElement).value).toBe('Assemble the selected saved template sections.');
    expect(build.disabled).toBe(false); expect(apiRequest.mock.calls).toHaveLength(count);
    fireEvent.click(screen.getByRole('button', { name: 'Clear template search' }));
    expect(document.activeElement).toBe(search);
    expect(screen.getByText('2 of 2 templates')).toBeTruthy();
    expect(picker.value).toBe(TEMPLATE); expect(apiRequest.mock.calls).toHaveLength(count);
    fireEvent.click(build);
    if (withAna) await screen.findByText(/2 candidates retained for individual review/);
    else await screen.findByText(/Structure built in this document/);
    expect(assemblyCalls('commit')).toHaveLength(1);
    expect(assemblyCalls('commit')[0][2]).toMatchObject({ templateId: TEMPLATE, programId: PID, fingerprint: 'fingerprint-181' });
    expect(aiCalls()).toHaveLength(withAna ? 2 : 0);
    expect(apiRequest.mock.calls.some(([, url]) => String(url).endsWith('/accept'))).toBe(false);
    expect(editorNode()).toBe(original); expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
    expect(original.textContent).toContain('Existing saved stability evidence.');
  });

  it('holds template search and selection when the current editor has unsaved changes', async () => {
    await mounted(); await previewBuild();
    const search = screen.getByRole('searchbox', { name: 'Search templates' }) as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'stability' } });
    localEdit();
    expect(search.disabled).toBe(true);
    expect((screen.getByLabelText('Template') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Clear template search' }) as HTMLButtonElement).disabled).toBe(true);
    expect(search.value).toBe('stability'); expect(editorNode().textContent).toContain('Unsaved local work.');
    expect(assemblyCalls('commit')).toHaveLength(0);
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
    const reads = apiRequest.mock.calls.filter(([, url]) => url === SECTIONS_READ).length;
    await act(async () => setEditorTarget({ docType: null, docId: DOC, code: emptySection.code, programId: PID }));
    expect(apiRequest.mock.calls.filter(([, url]) => url === SECTIONS_READ)).toHaveLength(reads);
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
      if (method === 'GET' && url === SECTIONS_READ && ++reads === 2) {
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
      method === 'GET' && url === SECTIONS_READ && ++reads === 2
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
      method === 'GET' && new URL(url, 'http://localhost').pathname === `/api/authoring/docs/${DOC}`
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
      method === 'GET' && new URL(url, 'http://localhost').pathname === `/api/authoring/docs/${DOC}/sections` ? refresh.promise : normal(method, url, input));
    await buildDocument(true);
    await waitFor(() => expect(apiRequest.mock.calls.filter(([method, url]) => method === 'GET' && url === `/api/authoring/docs/${DOC}/sections?programId=${PID}`)).toHaveLength(2));
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

describe('saved text does not starve later assembly candidates in the existing panel', () => {
  it.each(['initial saved-row race', 'explicit retry after refusal'])('preserves newly saved text and prepares the later candidate after %s', async mode => {
    await mounted();
    const savedText = '<p>Human-authored protocol saved before preparation.</p>';
    const preserveProtocol = () => {
      savedSections = savedSections.map(row => row.id === SECOND ? { ...row, content: savedText } : row);
    };
    if (mode === 'initial saved-row race') {
      const normal = apiRequest.getMockImplementation()!;
      let changed = false;
      apiRequest.mockImplementation((method: string, url: string, body?: AssemblyPreviewInput) => {
        // The structure refresh sees the confirmed empty receipt. Another save
        // lands before the queue's separate exact saved-section inspection.
        const result = normal(method, url, body);
        if (method === 'GET' && url === SECTIONS_READ && assemblyCalls('commit').length && !changed) {
          preserveProtocol(); changed = true;
        }
        return result;
      });
      await buildDocument(true);
    } else {
      draftReply = () => ok({ success: false, message: 'Synthetic first preparation refused.' }, 503);
      await buildDocument(true);
      await screen.findByText('Synthetic first preparation refused.');
      expect(aiCalls().map(([, url]) => url)).toEqual([`/api/authoring/sections/${SECOND}/ai/draft`]);
      preserveProtocol();
      draftReply = sectionId => ok({ success: true, draft: { content: `Retained candidate for ${sectionId}.`, draftId: `draft-${sectionId}`, metadata: {} } });
      fireEvent.click(screen.getByRole('button', { name: 'Retry remaining candidates' }));
    }
    const candidates = await screen.findByTestId('assembly-candidates');
    const preserved = within(candidates).getByText(`${emptySection.code} ${emptySection.title}`).closest('li')!;
    await waitFor(() => expect(preserved.textContent).toContain(`${emptySection.title} · preserved`));
    expect(within(preserved).getByText('Saved text now exists. It was preserved; no new candidate was generated.')).toBeTruthy();
    expect(within(candidates).queryByRole('button', { name: `Review ${emptySection.code}` })).toBeNull();
    fireEvent.click(await within(candidates).findByRole('button', { name: `Review ${thirdSection.code}` }));
    await screen.findByTestId('ai-draft-panel');
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe(`Retained candidate for ${THIRD}.`);
    fireEvent.change(screen.getByTestId('ai-draft-body'), { target: { value: 'Human-reviewed stability data.' } });
    fireEvent.change(screen.getByPlaceholderText('Accepted AI draft'), { target: { value: 'Checked against the source evidence.' } });
    expect((screen.getByTestId('ai-draft-accept') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe('Human-reviewed stability data.');
    expect((screen.getByPlaceholderText('Accepted AI draft') as HTMLInputElement).value).toBe('Checked against the source evidence.');
    expect(aiCalls().map(([, url]) => url)).toEqual([
      ...(mode === 'explicit retry after refusal' ? [`/api/authoring/sections/${SECOND}/ai/draft`] : []),
      `/api/authoring/sections/${THIRD}/ai/draft`,
    ]);
    expect(savedSections.find(row => row.id === SECOND)?.content).toBe(savedText);
    expect(savedSections.find(row => row.id === THIRD)?.content).toBe('');
    expect(assemblyCalls('commit')).toHaveLength(1);
    expect(apiRequest.mock.calls.some(([, url]) => String(url).endsWith('/accept'))).toBe(false);
    expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Retry remaining candidates' })).toBeNull();
    expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
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
    if (method === 'GET' && url === SECTIONS_READ) { reading = true; return pending.promise; }
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
