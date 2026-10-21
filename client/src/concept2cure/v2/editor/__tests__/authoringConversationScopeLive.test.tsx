// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import type { UseAnaChatReturn } from '../../../components/ana/useAnaChat';
import { prefillConversation } from '../askAnaToDraft';
import { originForSavedSection } from '../authoringConversationOrigin';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(),
  useAuth: () => ({ user: { displayName: 'Author', email: 'author@test.co' } }) }));
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));
import { ConversationThread } from '../../surfaces/ConversationThread';

const DOC = 'dddddddd-0000-4000-8000-000000000001';
const SEC = 'aaaaaaaa-0000-4000-8000-000000000001';
const PID = 'bbbbbbbb-0000-4000-8000-000000000001';
const OTHER = 'bbbbbbbb-0000-4000-8000-000000000002';
const AT = '2026-10-13T10:00:00Z';
const SAVED_AT = '2026-10-13T11:00:00Z';
const doc = { id: DOC, title: 'Stability summary', module: 'M3', status: 'draft', updated_at: AT, section_count: 1 };
const section = { id: SEC, doc_id: DOC, code: '3.2.P.8.1', title: 'Stability Summary', content: '<p>Stable for 18 months.</p>', order_index: 0, updated_at: AT };
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
const props = { onNav: vi.fn(), segment: 'biotech', surface: { id: 'conversation-thread', label: 'Conversation' } as never };
function chat(): UseAnaChatReturn {
  return { messages: [], isStreaming: false, isLoadingThread: false, threadId: 'thread-1', runStatus: null,
    pendingSteers: [], send: vi.fn(async () => undefined), reset: vi.fn(), loadThread: vi.fn(async () => undefined),
    stop: vi.fn(), pause: vi.fn(async () => true), resume: vi.fn(async () => true), interject: vi.fn(async () => true) } as UseAnaChatReturn;
}
for (const prototype of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  prototype.getClientRects ??= () => [];
  prototype.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}
beforeEach(() => {
  window.C2C_PROJECT = { id: PID } as typeof window.C2C_PROJECT;
  prefillConversation('Review the saved section.', originForSavedSection(doc, section, PID), vi.fn());
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
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete window.C2C_PROJECT; delete window.C2C_CONVO; localStorage.clear(); });
function editorNode() { return document.querySelector('.tiptap') as HTMLElement & { editor: Editor }; }
async function mountedCanvas() {
  const shellChat = chat();
  const rendered = render(<ConversationThread {...props} shellChat={shellChat} />);
  await waitFor(() => expect(editorNode()?.textContent).toContain('18 months'));
  return { shellChat, ...rendered };
}
function typeLocalNote() {
  act(() => { editorNode().editor.commands.insertContent('Unsaved local note. '); });
  fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Correct duration wording' } });
}

it('retains the same dirty TipTap buffer across a project switch and return, without saving or sending old-project context', async () => {
  const { shellChat, rerender } = await mountedCanvas();
  typeLocalNote();
  const retained = editorNode();
  window.C2C_PROJECT = { id: OTHER } as typeof window.C2C_PROJECT;
  rerender(<ConversationThread {...props} shellChat={shellChat} />);
  await screen.findByRole('alert');
  expect(editorNode()).toBe(retained);
  expect(editorNode().textContent).toContain('Unsaved local note.');
  expect(screen.getByTestId('dc-expanded').getAttribute('hidden')).not.toBeNull();
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Reply to AnA' }), { key: 'Enter' });
  expect(shellChat.send).not.toHaveBeenCalled();
  expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
  window.C2C_PROJECT = { id: PID } as typeof window.C2C_PROJECT;
  rerender(<ConversationThread {...props} shellChat={shellChat} />);
  await waitFor(() => expect(screen.getByTestId('dc-expanded').getAttribute('hidden')).toBeNull());
  expect(editorNode()).toBe(retained);
  expect(editorNode().textContent).toContain('Unsaved local note.');
  expect((screen.getByLabelText('Reason for change') as HTMLInputElement).value).toBe('Correct duration wording');
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Reply to AnA' }), { key: 'Enter' });
  expect(shellChat.send).toHaveBeenCalledWith('Review the saved section.', [], expect.objectContaining({ authoringContext: expect.objectContaining({ projectId: PID, artifactId: DOC, sectionId: SEC, sectionUpdatedAt: AT }) }));
  expect(JSON.stringify(vi.mocked(shellChat.send).mock.calls)).not.toContain('Unsaved local note.');
});

it('sends the confirmed saved version when the person saves in the canonical canvas before the first Enter', async () => {
  const { shellChat } = await mountedCanvas();
  typeLocalNote();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy());
  expect(shellChat.send).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Reply to AnA' }), { key: 'Enter' });
  expect(shellChat.send).toHaveBeenCalledWith('Review the saved section.', [], expect.objectContaining({
    authoringContext: expect.objectContaining({ sectionId: SEC, sectionUpdatedAt: SAVED_AT }),
    moduleContext: expect.objectContaining({ sectionId: SEC, sectionUpdatedAt: SAVED_AT }),
  }));
  expect(JSON.stringify(vi.mocked(shellChat.send).mock.calls)).not.toContain('Unsaved local note.');
});

it('keeps a newer confirmed saved version when the canvas is closed before the first Enter', async () => {
  const { shellChat } = await mountedCanvas();
  typeLocalNote();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy());
  fireEvent.click(screen.getByTestId('dc-back'));
  await waitFor(() => expect(screen.getByTestId('dc-expanded').getAttribute('hidden')).not.toBeNull());
  expect(shellChat.send).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Reply to AnA' }), { key: 'Enter' });
  expect(shellChat.send).toHaveBeenCalledWith('Review the saved section.', [], expect.objectContaining({
    authoringContext: expect.objectContaining({ sectionId: SEC, sectionUpdatedAt: SAVED_AT }),
    moduleContext: expect.objectContaining({ sectionId: SEC, sectionUpdatedAt: SAVED_AT }),
  }));
});
