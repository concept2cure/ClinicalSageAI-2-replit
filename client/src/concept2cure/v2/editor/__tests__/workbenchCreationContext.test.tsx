// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import type { AuthoringCreateExportProps } from '../../surfaces/AuthoringCreateExport';

const apiRequest = vi.hoisted(() => vi.fn());
const creation = vi.hoisted(() => ({ current: null as (AuthoringCreateExportProps & {
  programId?: string | null; programSwitchHeld?: boolean;
  noticeContainer?: HTMLElement | null;
  onCheckCreation?: (kind: 'document' | 'section') => boolean | Promise<boolean>;
}) | null }));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Author', email: 'author@example.test' } }),
  authService: { getUser: () => ({ id: 41 }) },
}));
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: (props: AuthoringCreateExportProps) => {
  creation.current = props;
  return null;
} }));
import { DocumentWorkbench, type DocumentWorkbenchProps } from '../DocumentWorkbench';
import { clearEditorTarget, peekEditorTarget } from '../../editorTarget';

const PID = 'bbbbbbbb-0000-4000-8000-000000000001';
const OTHER = 'bbbbbbbb-0000-4000-8000-000000000002';
const DOC = 'dddddddd-0000-4000-8000-000000000001';
const CREATED = 'dddddddd-0000-4000-8000-000000000002';
const SEC = 'aaaaaaaa-0000-4000-8000-000000000001';
const NEW_SEC = 'aaaaaaaa-0000-4000-8000-000000000002';
const AT = '2026-10-14T10:00:00Z';
const doc = { id: DOC, title: 'Saved overview', module: 'M3', product_code: null,
  section_count: 1, status: 'DRAFT', updated_at: AT };
const section = { id: SEC, doc_id: DOC, code: '3.2.P.8.1', title: 'Stability summary',
  content: '<p>Stable for 18 months.</p>', order_index: 0, updated_at: AT };
const nextSection = { ...section, id: NEW_SEC, code: '3.2.P.8.2', title: 'New stability section', content: '<p>New saved section.</p>', order_index: 1 };
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
for (const prototype of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  prototype.getClientRects ??= () => [];
  prototype.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}
beforeEach(() => {
  localStorage.clear(); clearEditorTarget(); creation.current = null;
  window.C2C_PROJECT = { id: PID } as typeof window.C2C_PROJECT;
  apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => {
    if (url === `/api/authoring/docs/${DOC}`) return ok({ document: doc });
    if (url === `/api/authoring/docs/${DOC}/sections`) return ok({ sections: [section] });
    if (url === `/api/authoring/docs/${CREATED}/sections`) return ok({ sections: [{ ...nextSection, doc_id: CREATED }] });
    if (url.includes('/sources')) return ok({ sources: [] });
    if (url.startsWith('/api/c2c/documents/')) return ok({}, 404);
    return ok({ success: true });
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});
afterEach(() => {
  cleanup(); localStorage.clear(); vi.unstubAllGlobals(); clearEditorTarget();
  delete window.C2C_PROJECT;
});

function editorNode() { return document.querySelector('.tiptap') as HTMLElement & { editor: Editor }; }
function typeLocalNote() {
  act(() => { editorNode().editor.commands.insertContent('Unsaved local note. '); });
}
async function mounted(overrides: Partial<DocumentWorkbenchProps> = {}) {
  const props: DocumentWorkbenchProps = { docs: [doc], docsState: 'ready', status: 'all',
    programId: PID, onNav: vi.fn(), reloadDocs: vi.fn(async () => undefined),
    refreshCreationContext: vi.fn(async () => true), ...overrides };
  const view = render(<DocumentWorkbench {...props} />);
  await waitFor(() => expect(editorNode()?.textContent).toContain('18 months'));
  return { props, ...view };
}
async function createdDocument() {
  await act(async () => { await creation.current!.onDocCreated({ id: CREATED, title: 'Created working copy' }); });
}

describe('creation stays in the existing editor host context', () => {
  it('places creation notices outside the horizontally scrolling header actions', async () => {
    await mounted();
    const host = screen.getByTestId('authoring-creation-notices');
    expect(creation.current?.noticeContainer).toBe(host);
    expect(host.closest('header')).toBeNull();
    expect(host.closest('.ed-doc-actions')).toBeNull();
  });

  it.each([PID, null])('passes the effective project %s and held-switch refusal to creation', async programId => {
    await mounted({ programId, programSwitchHeld: true });
    expect(creation.current?.programId).toBe(programId);
    expect(creation.current?.programSwitchHeld).toBe(true);
  });

  it.each(['filtered', 'pinned'])('opens the exact created ID from a %s host through the existing editor handoff', async host => {
    const { props } = await mounted(host === 'filtered' ? { status: 'APPROVED' } : { pinnedDocId: DOC });
    await createdDocument();
    expect(peekEditorTarget()).toMatchObject({ docId: CREATED, programId: PID });
    expect(props.onNav).toHaveBeenCalledWith('document-authoring');
    expect(apiRequest.mock.calls.some(([method]) => method === 'POST')).toBe(false);
  });

  it('opens the exact created document after a clean all-status list refresh', async () => {
    const { props } = await mounted({ docs: [doc, { ...doc, id: CREATED, title: 'Created working copy' }] });
    await createdDocument();
    await waitFor(() => expect(editorNode()?.textContent).toContain('New saved section.'));
    expect(props.reloadDocs).toHaveBeenCalledOnce();
    expect(props.onNav).not.toHaveBeenCalled();
  });

  it.each(['filtered', 'pinned'])('retains dirty work and permits a confirmed-ID open retry in a %s host', async host => {
    const { props } = await mounted(host === 'filtered' ? { status: 'APPROVED' } : { pinnedDocId: DOC });
    typeLocalNote();
    const original = editorNode();
    await createdDocument();
    await screen.findByRole('alertdialog', { name: 'Unsaved changes in 3.2.P.8.1' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(editorNode()).toBe(original);
    expect(original.textContent).toContain('Unsaved local note.');
    expect(props.onNav).not.toHaveBeenCalled();
    await createdDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
    expect(peekEditorTarget()).toMatchObject({ docId: CREATED, programId: PID });
    expect(props.onNav).toHaveBeenCalledWith('document-authoring');
    expect(apiRequest.mock.calls.some(([method]) => method === 'POST' || method === 'PATCH')).toBe(false);
  });

  it('consults the current dirty editor after a document-list refresh', async () => {
    const refresh = deferred<void>();
    await mounted({ reloadDocs: vi.fn(() => refresh.promise), docs: [doc, { ...doc, id: CREATED, title: 'Created working copy' }] });
    act(() => { creation.current!.onDocCreated({ id: CREATED, title: 'Created working copy' }); });
    typeLocalNote();
    const original = editorNode();
    await act(async () => { refresh.resolve(); await refresh.promise; });
    await screen.findByRole('alertdialog', { name: 'Unsaved changes in 3.2.P.8.1' });
    expect(editorNode()).toBe(original);
    expect(original.textContent).toContain('Unsaved local note.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(editorNode()).toBe(original);
  });

  it.each(['project round trip', 'unmount'])('suppresses a delayed creation open after %s', async change => {
    const refresh = deferred<void>();
    const { props, rerender, unmount } = await mounted({ reloadDocs: vi.fn(() => refresh.promise),
      docs: [doc, { ...doc, id: CREATED, title: 'Created working copy' }] });
    act(() => { creation.current!.onDocCreated({ id: CREATED, title: 'Created working copy' }); });
    if (change === 'unmount') unmount();
    else {
      rerender(<DocumentWorkbench {...props} programId={OTHER} />);
      rerender(<DocumentWorkbench {...props} />);
    }
    await act(async () => { refresh.resolve(); await refresh.promise; });
    expect(props.onNav).not.toHaveBeenCalled();
    expect(peekEditorTarget()).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    if (change !== 'unmount') expect(editorNode()?.textContent).toContain('18 months');
  });
});

describe('created sections use the current leave decision after the refresh', () => {
  it('retains text typed while the section refresh is pending', async () => {
    await mounted();
    const refresh = deferred<Response>();
    apiRequest.mockImplementationOnce(() => refresh.promise);
    act(() => { creation.current!.onSectionCreated({ id: NEW_SEC, code: nextSection.code }); });
    typeLocalNote();
    const original = editorNode();
    await act(async () => { refresh.resolve(ok({ sections: [section, nextSection] })); await refresh.promise; });
    await screen.findByRole('alertdialog', { name: 'Unsaved changes in 3.2.P.8.1' });
    expect(editorNode()).toBe(original);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(original.textContent).toContain('Unsaved local note.');
    expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
  });

  it('opens the returned section after a clean refresh', async () => {
    await mounted();
    apiRequest.mockImplementationOnce(async () => ok({ sections: [section, nextSection] }));
    await act(async () => { await creation.current!.onSectionCreated({ id: NEW_SEC, code: nextSection.code }); });
    await waitFor(() => expect(editorNode()?.textContent).toContain('New saved section.'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('ignores an older section refresh after a project round trip', async () => {
    const { props, rerender } = await mounted();
    const refresh = deferred<Response>();
    apiRequest.mockImplementationOnce(() => refresh.promise);
    act(() => { creation.current!.onSectionCreated({ id: NEW_SEC, code: nextSection.code }); });
    rerender(<DocumentWorkbench {...props} programId={OTHER} />);
    rerender(<DocumentWorkbench {...props} />);
    await act(async () => { refresh.resolve(ok({ sections: [section, nextSection] })); await refresh.promise; });
    expect(editorNode()?.textContent).toContain('18 months');
    expect(editorNode()?.textContent).not.toContain('New saved section.');
  });

  it('does not select the created section when its refresh fails', async () => {
    await mounted();
    apiRequest.mockImplementationOnce(async () => ok({}, 503));
    await act(async () => { await creation.current!.onSectionCreated({ id: NEW_SEC, code: nextSection.code }); });
    expect(screen.getByText('Couldn’t load sections.')).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(apiRequest.mock.calls.some(([method]) => method === 'POST' || method === 'PATCH')).toBe(false);
  });
});

it('completes the current section read when the host filter changes while the first read is pending', async () => {
  const refresh = deferred<Response>();
  const normal = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation((method: string, url: string) => url === `/api/authoring/docs/${DOC}/sections`
    ? refresh.promise : normal(method, url));
  const props: DocumentWorkbenchProps = { docs: [doc], docsState: 'ready', status: 'all',
    programId: PID, onNav: vi.fn(), reloadDocs: vi.fn(async () => undefined) };
  const { rerender } = render(<DocumentWorkbench {...props} />);
  await waitFor(() => expect(apiRequest.mock.calls.some(([, url]) => url === `/api/authoring/docs/${DOC}/sections`)).toBe(true));
  rerender(<DocumentWorkbench {...props} status="DRAFT" />);
  await act(async () => { refresh.resolve(ok({ sections: [section] })); await refresh.promise; });
  await waitFor(() => expect(editorNode()?.textContent).toContain('18 months'));
});

describe('unknown creation checks refresh the existing host', () => {
  it.each([
    { name: 'failed response', body: {}, status: 503 },
    { name: 'missing sections', body: { success: true }, status: 200 },
    { name: 'unsuccessful response', body: { success: false, sections: [section] }, status: 200 },
    { name: 'foreign section', body: { success: true, sections: [{ ...section, doc_id: CREATED }] }, status: 200 },
    { name: 'missing structure fields', body: { success: true, sections: [section], structure: {} }, status: 200 },
    { name: 'malformed duplicate codes', body: { success: true, sections: [section], structure: { duplicateCodes: {}, outOfOrder: false, suggestedOrder: [] } }, status: 200 },
  ])('does not confirm recovery after $name', async ({ body, status }) => {
    await mounted();
    apiRequest.mockImplementationOnce(async () => ok(body, status));
    let confirmed: unknown;
    await act(async () => { confirmed = await creation.current!.onCheckCreation!('section'); });
    expect(confirmed).toBe(false);
    expect(apiRequest.mock.calls.some(([method]) => method === 'POST' || method === 'PATCH')).toBe(false);
  });

  it('confirms a current verified section read without navigation or a write', async () => {
    const { props } = await mounted();
    apiRequest.mockImplementationOnce(async () => ok({ success: true, sections: [section] }));
    let confirmed: unknown;
    await act(async () => { confirmed = await creation.current!.onCheckCreation!('section'); });
    expect(confirmed).toBe(true);
    expect(props.onNav).not.toHaveBeenCalled();
    expect(apiRequest.mock.calls.some(([method]) => method === 'POST' || method === 'PATCH')).toBe(false);
  });

  it('shows all statuses when checking documents from a narrowed list', async () => {
    const onStatusChange = vi.fn();
    await mounted({ status: 'APPROVED', onStatusChange });
    expect(creation.current?.onCheckCreation).toBeTypeOf('function');
    await act(async () => { await creation.current!.onCheckCreation!('document'); });
    expect(onStatusChange).toHaveBeenCalledWith('all');
    expect(apiRequest.mock.calls.some(([method]) => method === 'POST')).toBe(false);
  });

  it('confirms the pinned host read without navigating or discarding dirty work', async () => {
    const { props } = await mounted({ pinnedDocId: DOC });
    typeLocalNote();
    expect(creation.current?.onCheckCreation).toBeTypeOf('function');
    let confirmed: unknown;
    await act(async () => { confirmed = await creation.current!.onCheckCreation!('document'); });
    expect(confirmed).toBe(true);
    expect(props.refreshCreationContext).toHaveBeenCalledOnce();
    expect(props.onNav).not.toHaveBeenCalled();
    expect(peekEditorTarget()).toBeNull();
    expect(editorNode().textContent).toContain('Unsaved local note.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('refreshes the current document sections without repeating a creation or changing the selected editor', async () => {
    await mounted();
    const original = editorNode();
    const readsBefore = apiRequest.mock.calls.filter(([, url]) => url === `/api/authoring/docs/${DOC}/sections`).length;
    apiRequest.mockImplementationOnce(async () => ok({ success: true, sections: [section] }));
    expect(creation.current?.onCheckCreation).toBeTypeOf('function');
    await act(async () => { await creation.current!.onCheckCreation!('section'); });
    expect(apiRequest.mock.calls.filter(([, url]) => url === `/api/authoring/docs/${DOC}/sections`)).toHaveLength(readsBefore + 1);
    expect(editorNode()).toBe(original);
    expect(apiRequest.mock.calls.some(([method]) => method === 'POST')).toBe(false);
  });

  it('refuses a held project recovery without another read', async () => {
    const { props } = await mounted({ programSwitchHeld: true });
    const reads = apiRequest.mock.calls.length;
    expect(await creation.current!.onCheckCreation!('document')).toBe(false);
    expect(await creation.current!.onCheckCreation!('section')).toBe(false);
    expect(apiRequest.mock.calls).toHaveLength(reads);
    expect(props.refreshCreationContext).not.toHaveBeenCalled();
  });

  it('does not confirm an old section recovery after a project round trip', async () => {
    const { props, rerender } = await mounted();
    const refresh = deferred<Response>();
    apiRequest.mockImplementationOnce(() => refresh.promise);
    let checking: boolean | Promise<boolean> = false;
    act(() => { checking = creation.current!.onCheckCreation!('section'); });
    rerender(<DocumentWorkbench {...props} programId={OTHER} />);
    rerender(<DocumentWorkbench {...props} />);
    let confirmed: unknown;
    await act(async () => { refresh.resolve(ok({ success: true, sections: [section] })); confirmed = await checking; });
    expect(confirmed).toBe(false);
    expect(props.onNav).not.toHaveBeenCalled();
  });
});
