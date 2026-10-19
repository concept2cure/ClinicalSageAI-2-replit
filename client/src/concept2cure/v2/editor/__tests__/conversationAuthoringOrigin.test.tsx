// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UseAnaChatReturn } from '../../../components/ana/useAnaChat';
import { prefillConversation, type AskOrigin } from '../askAnaToDraft';
import { readOriginDocument, snapshotEditorOrigin, originTurnContext } from '../authoringConversationOrigin';

const apiRequest = vi.hoisted(() => vi.fn());
const canvas = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('../../dataConnect', () => ({ connected: () => false, EmptyState: ({ title }: { title: string }) => <div>{title}</div> }));
vi.mock('../DocumentCanvas', () => ({ DocumentCanvas: (props: { docId: string; focusSectionId?: string }) => { canvas(props); return <div data-testid="saved-canvas">{props.docId}</div>; } }));
vi.mock('../../../components/ana/useAnaChat', () => ({ useAnaChat: () => ({ messages: [], isStreaming: false, isLoadingThread: false, threadId: null, runStatus: null, pendingSteers: [], send: vi.fn(), reset: vi.fn(), loadThread: vi.fn() }) }));
import { ConversationThread } from '../../surfaces/ConversationThread';

const DOC = 'dddddddd-0000-4000-8000-000000000001';
const SEC = 'aaaaaaaa-0000-4000-8000-000000000002';
const PID = 'bbbbbbbb-0000-4000-8000-000000000001';
const OTHER = 'bbbbbbbb-0000-4000-8000-000000000002';
const origin: AskOrigin = {
  surfaceId: 'document-authoring', label: 'Authoring',
  authoringDocument: { docId: DOC, programId: PID, sectionId: SEC },
  authoringContext: { projectId: PID, workflowStage: 'section-workspace', artifactId: DOC, sectionId: SEC, sectionUpdatedAt: '2026-10-13T10:00:00Z' },
  moduleContext: { documentId: DOC, sectionId: SEC, savedRecordOnly: true },
};
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const fixture = () => ok({ documents: [{ id: DOC, title: 'Verified saved document', source: 'person' }] });
const isOriginInventory = (url: string) => url.includes('/api/authoring/docs?status=all&programId=');
function chat(over: Partial<UseAnaChatReturn> = {}): UseAnaChatReturn {
  return { messages: [], isStreaming: false, isLoadingThread: false, threadId: 'thread-1', runStatus: null,
    pendingSteers: [], send: vi.fn(async () => undefined), reset: vi.fn(), loadThread: vi.fn(async () => undefined),
    stop: vi.fn(), pause: vi.fn(async () => true), resume: vi.fn(async () => true), interject: vi.fn(async () => true), ...over } as UseAnaChatReturn;
}
const props = { onNav: vi.fn(), segment: 'biotech', surface: { id: 'conversation-thread', label: 'Conversation' } as never };
function mount(shellChat = chat()) {
  prefillConversation('Review the saved section.', origin, vi.fn());
  return { shellChat, ...render(<ConversationThread {...props} shellChat={shellChat} />) };
}
const send = () => fireEvent.keyDown(screen.getByRole('textbox', { name: 'Reply to AnA' }), { key: 'Enter' });

beforeEach(() => {
  window.C2C_PROJECT = { id: PID } as typeof window.C2C_PROJECT;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_method: string, url: string) => isOriginInventory(url) ? fixture() : ok({ documents: [], activities: [] }));
  canvas.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete window.C2C_PROJECT; delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO; window.history.replaceState({}, '', '/'); });

describe('saved Authoring arrivals wait for explicit submission', () => {
  it('continues the current conversation and opens the exact canonical canvas after inventory verification', async () => {
    const { shellChat } = mount();
    await screen.findByTestId('saved-canvas');
    expect(canvas.mock.calls.at(-1)?.[0]).toMatchObject({ docId: DOC, programId: PID, focusSectionId: SEC });
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/authoring/docs?status=all&programId=${PID}`);
    expect((screen.getByRole('textbox', { name: 'Reply to AnA' }) as HTMLTextAreaElement).value).toBe('Review the saved section.');
    const composer = screen.getByRole('textbox', { name: 'Reply to AnA' });
    expect(composer.getAttribute('aria-expanded')).toBeNull();
    expect(composer.getAttribute('aria-haspopup')).toBe('listbox');
    const progress = screen.getByRole('button', { name: /AnA's progress/ });
    expect(progress.getAttribute('aria-expanded')).toBe('false');
    expect(progress.getAttribute('aria-controls')).toBeNull();
    expect(shellChat.send).not.toHaveBeenCalled();
    expect(shellChat.reset).not.toHaveBeenCalled();
    expect(shellChat.loadThread).not.toHaveBeenCalled();
    send();
    expect(shellChat.send).toHaveBeenCalledWith('Review the saved section.', [], expect.objectContaining({ authoringContext: origin.authoringContext, moduleContext: origin.moduleContext, screenName: 'document-authoring' }));
  });

  it('leaves a scoped question queued until an existing run finishes instead of steering without its saved context', async () => {
    const running = chat({ isStreaming: true, runStatus: 'running' });
    const { rerender } = mount(running);
    await screen.findByTestId('saved-canvas');
    send();
    expect(running.send).not.toHaveBeenCalled();
    expect(running.interject).not.toHaveBeenCalled();
    const idle = { ...running, isStreaming: false, runStatus: null };
    rerender(<ConversationThread {...props} shellChat={idle} />);
    send();
    expect(idle.send).toHaveBeenCalledWith('Review the saved section.', [], expect.objectContaining({ authoringContext: origin.authoringContext }));
  });

  it('supports the AnA toolbar without an invented prompt or automatic turn', async () => {
    const shellChat = chat();
    prefillConversation('', origin, vi.fn());
    render(<ConversationThread {...props} shellChat={shellChat} />);
    await screen.findByTestId('saved-canvas');
    expect((screen.getByRole('textbox', { name: 'Reply to AnA' }) as HTMLTextAreaElement).value).toBe('');
    expect(shellChat.send).not.toHaveBeenCalled();
    expect(shellChat.reset).not.toHaveBeenCalled();
  });

  it('retains a saved document without an active section instead of inventing a section identity', () => {
    const noSection: AskOrigin = { surfaceId: 'document-authoring', label: 'Authoring',
      authoringDocument: { docId: DOC, programId: PID },
      authoringContext: { projectId: PID, artifactId: DOC, workflowStage: 'section-workspace' },
      moduleContext: { documentId: DOC, documentTitle: 'Saved record', savedRecordOnly: true },
    };
    const snapshot = snapshotEditorOrigin(PID, noSection);
    expect(snapshot.read).toMatchObject({ state: 'ready', document: { docId: DOC, programId: PID } });
    expect(snapshot.origin.authoringContext?.sectionId).toBeUndefined();
    expect(originTurnContext(snapshot.origin, snapshot.read, PID)?.authoringContext?.artifactId).toBe(DOC);
    expect(snapshotEditorOrigin(17, noSection).read.state).toBe('error');
  });
});

describe('unverified origin context fails closed and has recovery', () => {
  it('withholds source identity and canvas until a real retry verifies the saved record', async () => {
    apiRequest.mockResolvedValue(ok({ documents: [], count: 1, nextOffset: 1 }));
    const { shellChat } = mount();
    await screen.findByRole('alert');
    expect(screen.queryByTestId('saved-canvas')).toBeNull();
    send();
    expect(shellChat.send).not.toHaveBeenCalled();
    apiRequest.mockResolvedValue(fixture());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByTestId('saved-canvas');
    send();
    expect(shellChat.send).toHaveBeenCalledWith('Review the saved section.', [], expect.objectContaining({ authoringContext: origin.authoringContext }));
  });

  it('rejects a changed project before reading and allows removing the unverified source context', async () => {
    window.C2C_PROJECT = { id: OTHER } as typeof window.C2C_PROJECT;
    const { shellChat } = mount();
    await screen.findByRole('alert');
    expect(apiRequest.mock.calls.some(([, url]) => isOriginInventory(url))).toBe(false);
    expect(screen.queryByTestId('saved-canvas')).toBeNull();
    send();
    expect(shellChat.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Do not send what Authoring shows with this question' }));
    send();
    expect(shellChat.send).toHaveBeenCalledWith('Review the saved section.', []);
  });

  it('invalidates a verified origin and closes its retained canvas when the open project changes', async () => {
    const { shellChat, rerender } = mount();
    await screen.findByTestId('saved-canvas');
    window.C2C_PROJECT = { id: OTHER } as typeof window.C2C_PROJECT;
    rerender(<ConversationThread {...props} shellChat={shellChat} />);
    await screen.findByRole('alert');
    expect(screen.queryByTestId('saved-canvas')).toBeTruthy();
    expect(canvas.mock.calls.at(-1)?.[0]).toMatchObject({ docId: DOC, expanded: false });
    send();
    expect(shellChat.send).not.toHaveBeenCalled();
    expect(await readOriginDocument(origin, OTHER)).toMatchObject({ state: 'error' });
  });

  it('ignores an old project verification that completes after the project has changed', async () => {
    let finish!: (response: Response) => void;
    apiRequest.mockImplementation((_method: string, url: string) => isOriginInventory(url) ? new Promise<Response>(resolve => { finish = resolve; }) : Promise.resolve(ok({ documents: [] })));
    const { shellChat, rerender } = mount();
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    window.C2C_PROJECT = { id: OTHER } as typeof window.C2C_PROJECT;
    rerender(<ConversationThread {...props} shellChat={shellChat} />);
    await screen.findByRole('alert');
    await act(async () => { finish(fixture()); });
    expect(screen.queryByTestId('saved-canvas')).toBeNull();
    send();
    expect(shellChat.send).not.toHaveBeenCalled();
  });

  it('does not reopen a removed attachment when its outstanding verification eventually returns', async () => {
    let finish!: (response: Response) => void;
    apiRequest.mockImplementation((_method: string, url: string) => isOriginInventory(url) ? new Promise<Response>(resolve => { finish = resolve; }) : Promise.resolve(ok({ documents: [] })));
    const { shellChat } = mount();
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Do not send what Authoring shows with this question' }));
    send();
    await act(async () => { finish(fixture()); });
    expect(screen.queryByTestId('saved-canvas')).toBeNull();
    expect(shellChat.send).toHaveBeenCalledWith('Review the saved section.', []);
  });
});
