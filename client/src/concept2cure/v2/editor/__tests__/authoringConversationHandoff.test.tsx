// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { originWithSavedVersion, type AskOrigin } from '../askAnaToDraft';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: { displayName: 'Author', email: 'author@test.co' } }) }));
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));
vi.mock('../ProjectFilesPanel', () => ({ ProjectFilesPanel: ({ onAsk }: { onAsk?: (text: string) => void }) => <button type="button" onClick={() => onAsk?.('Review data room source 17 with read_project_document.')}>Ask about saved source</button> }));
import { DocumentAuthoring } from '../../surfaces/DocumentAuthoring';
import { clearEditorTarget } from '../../editorTarget';

const DOC = 'dddddddd-0000-4000-8000-000000000001';
const SEC = 'aaaaaaaa-0000-4000-8000-000000000001';
const PID = 'bbbbbbbb-0000-4000-8000-000000000001';
const AT = '2026-10-13T10:00:00Z';
const SAVED_AT = '2026-10-13T11:00:00Z';
const doc = { id: DOC, title: 'Stability summary', module: 'M3', status: 'draft', updated_at: AT, section_count: 1 };
const section = { id: SEC, doc_id: DOC, code: '3.2.P.8.1', title: 'Stability Summary', content: '<p>Stable for 18 months.</p>', order_index: 0, updated_at: AT };
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
type Handoff = { id: string; prefill: string; sendOnArrival: boolean; origin: AskOrigin };
const handoff = () => (window as unknown as { C2C_CONVO?: Handoff }).C2C_CONVO;
for (const prototype of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  prototype.getClientRects ??= () => [];
  prototype.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}

beforeEach(() => {
  window.C2C_PROJECT = { id: PID } as typeof window.C2C_PROJECT;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: { content?: string }) => {
    if (url.startsWith('/api/authoring/docs?')) return ok({ documents: [doc] });
    if (url === `/api/authoring/docs/${DOC}`) return ok({ document: doc });
    if (url === `/api/authoring/docs/${DOC}/sections`) return ok({ sections: [section] });
    if (method === 'PATCH' && url === `/api/authoring/sections/${SEC}`) return ok({ section: { ...section, content: body?.content, updated_at: SAVED_AT } });
    if (url.startsWith('/api/c2c/documents/')) return ok({}, 404);
    return ok({ success: true });
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete window.C2C_PROJECT; delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO; clearEditorTarget(); localStorage.clear(); });

async function mount(dirty = false) {
  const onNav = vi.fn();
  render(<DocumentAuthoring onNav={onNav} segment="biotech" surface={{ id: 'document-authoring', label: 'Authoring' } as never} />);
  await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('18 months'));
  if (dirty) {
    const editor = (document.querySelector('.tiptap') as unknown as { editor: Editor }).editor;
    act(() => { editor.commands.insertContent('Unsaved private note. '); });
    await screen.findByLabelText('Reason for change');
  }
  return onNav;
}
function review() {
  fireEvent.click(screen.getByText('Review with AnA'));
  fireEvent.click(screen.getByRole('button', { name: 'Prepare targeted fixes' }));
}

describe('new editor asks use the guarded canonical conversation', () => {
  it('prefills the current conversation with exact saved identity and sends nothing on arrival', async () => {
    const onNav = await mount();
    review();
    expect(onNav).toHaveBeenCalledWith('conversation-thread');
    expect(handoff()).toMatchObject({ id: 'current', sendOnArrival: false, origin: {
      authoringDocument: { docId: DOC, programId: PID, sectionId: SEC },
      authoringContext: { projectId: PID, artifactId: DOC, sectionId: SEC, sectionUpdatedAt: AT },
    } });
    expect(handoff()?.prefill).toContain('read_authoring_section');
    expect(JSON.stringify(handoff())).not.toContain(section.content);
    expect(vi.mocked(globalThis.fetch).mock.calls.some(([url]) => String(url).includes('/api/ana-ri/stream'))).toBe(false);
  });

  it('holds dirty work without writing the handoff, and Cancel keeps both work and location', async () => {
    const onNav = await mount(true);
    review();
    await screen.findByRole('alertdialog', { name: 'Unsaved changes in 3.2.P.8.1' });
    expect(handoff()).toBeUndefined();
    expect(onNav).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.querySelector('.tiptap')?.textContent).toContain('Unsaved private note.');
    expect(handoff()).toBeUndefined();
    expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
  });

  it('uses the same leave guard for saved source requests, excluding unsaved text after explicit leave', async () => {
    const onNav = await mount(true);
    fireEvent.click(screen.getByTestId('vault-rail-open'));
    fireEvent.click(screen.getByRole('button', { name: 'Ask about saved source' }));
    await screen.findByRole('alertdialog', { name: 'Unsaved changes in 3.2.P.8.1' });
    expect(handoff()).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Leave without saving' }));
    expect(onNav).toHaveBeenCalledWith('conversation-thread');
    expect(handoff()?.prefill).toContain('source 17');
    expect(handoff()?.origin.authoringContext?.sectionUpdatedAt).toBe(AT);
    expect(JSON.stringify(handoff())).not.toContain('Unsaved private note.');
    expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
  });
});

describe('save disposition supplies only a confirmed saved version', () => {
  it('overlays the returned PATCH timestamp before navigation instead of waiting for a React render', async () => {
    const onNav = await mount(true);
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Correct duration wording' } });
    review();
    fireEvent.click(await screen.findByRole('button', { name: 'Save and continue' }));
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('conversation-thread'));
    expect(handoff()?.origin.authoringContext?.sectionUpdatedAt).toBe(SAVED_AT);
    expect(handoff()?.origin.moduleContext?.sectionUpdatedAt).toBe(SAVED_AT);
    expect(JSON.stringify(handoff())).not.toContain('Unsaved private note.');
  });

  it('keeps the editor and pending handoff intact when the deliberate save is refused', async () => {
    const onNav = await mount(true);
    const normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, url: string, body?: unknown) => method === 'PATCH' ? Promise.reject(new Error('Save refused')) : normal(method, url, body));
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Correct duration wording' } });
    review();
    fireEvent.click(await screen.findByRole('button', { name: 'Save and continue' }));
    await screen.findByText(/Save failed/);
    expect(onNav).not.toHaveBeenCalled();
    expect(handoff()).toBeUndefined();
    expect(document.querySelector('.tiptap')?.textContent).toContain('Unsaved private note.');
  });

  it('removes an obsolete timestamp if the successful save response names no confirmed version', () => {
    const origin: AskOrigin = { surfaceId: 'document-authoring', label: 'Authoring', authoringContext: { projectId: PID, workflowStage: 'section-workspace', sectionId: SEC, sectionUpdatedAt: AT } };
    expect(originWithSavedVersion(origin, { sectionId: SEC, updatedAt: null }).authoringContext?.sectionUpdatedAt).toBeUndefined();
    expect(originWithSavedVersion(origin, { sectionId: 'other', updatedAt: SAVED_AT })).toBe(origin);
    const newerOrigin = { ...origin, authoringContext: { ...origin.authoringContext!, sectionUpdatedAt: SAVED_AT } };
    expect(originWithSavedVersion(newerOrigin, { sectionId: SEC, updatedAt: AT })).toBe(newerOrigin);
  });
});
