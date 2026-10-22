// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UseAnaChatReturn } from '../../../components/ana/useAnaChat';
import type { EditorBridge } from '../DocumentWorkbench';
import { prefillConversation, type AskOrigin } from '../askAnaToDraft';
import { editorScopeRefusal, originTurnContext } from '../authoringConversationOrigin';

const apiRequest = vi.hoisted(() => vi.fn());
const probe = vi.hoisted(() => ({ bridge: null as EditorBridge | null }));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('../../dataConnect', () => ({ connected: () => false, EmptyState: ({ title }: { title: string }) => <div>{title}</div> }));
vi.mock('../../../components/ana/useAnaChat', () => ({ useAnaChat: () => ({ messages: [], isStreaming: false, isLoadingThread: false, threadId: null, runStatus: null, pendingSteers: [], send: vi.fn(), reset: vi.fn(), loadThread: vi.fn() }) }));
vi.mock('../DocumentCanvas', async () => {
  const { useEffect } = await import('react');
  return { DocumentCanvas: (props: { docId: string; expanded: boolean; onExpandedChange: (open: boolean) => void; onEditorBridge?: (id: string, bridge: EditorBridge | null, open: boolean) => void }) => {
    const { docId, expanded, onEditorBridge } = props;
    useEffect(() => {
      onEditorBridge?.(docId, probe.bridge, expanded);
      return () => onEditorBridge?.(docId, null, false);
    }, [docId, expanded, onEditorBridge]);
    return <section data-testid="scope-canvas"><button type="button" onClick={() => props.onExpandedChange(true)}>Open saved canvas</button></section>;
  } };
});
import { ConversationThread } from '../../surfaces/ConversationThread';

const DOC = 'dddddddd-0000-4000-8000-000000000001';
const SEC = 'aaaaaaaa-0000-4000-8000-000000000001';
const PID = 'bbbbbbbb-0000-4000-8000-000000000001';
const OTHER = 'bbbbbbbb-0000-4000-8000-000000000002';
const EARLIER = '2026-10-13T10:00:00Z';
const LATEST = '2026-10-13T10:10:00Z';
const QUALIFIED = { status: 'recorded', id: 'eeeeeeee-0000-4000-8000-000000000001', sha256: 'b'.repeat(64),
  servedBy: [{ provider: 'anthropic', model: 'qualified-test-model', qualified: true, approvedForHighRisk: true, pq: 'pending' }] };
const origin: AskOrigin = {
  surfaceId: 'document-authoring', label: 'Authoring',
  authoringDocument: { docId: DOC, programId: PID, sectionId: SEC },
  authoringContext: { projectId: PID, workflowStage: 'section-workspace', artifactId: DOC, sectionId: SEC, sectionUpdatedAt: EARLIER },
  moduleContext: { documentId: DOC, sectionId: SEC, sectionUpdatedAt: EARLIER, savedRecordOnly: true },
};
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const props = { onNav: vi.fn(), segment: 'biotech', surface: { id: 'conversation-thread', label: 'Conversation' } as never };
function chat(): UseAnaChatReturn {
  return { messages: [], isStreaming: false, isLoadingThread: false, threadId: 'thread-1', runStatus: null,
    pendingSteers: [], send: vi.fn(async () => undefined), reset: vi.fn(), loadThread: vi.fn(async () => undefined),
    stop: vi.fn(), pause: vi.fn(async () => true), resume: vi.fn(async () => true), interject: vi.fn(async () => true) } as UseAnaChatReturn;
}
function savedBridge(sectionId = SEC): EditorBridge {
  return { docId: DOC, sectionId, sectionCode: sectionId === SEC ? '2.5.1' : '2.5.2', sectionTitle: 'Saved section', editable: true,
    insert: vi.fn(() => true), propose: vi.fn(async () => ({ ok: true as const })),
    authoringContext: { projectId: PID, artifactId: DOC, sectionId, sectionUpdatedAt: LATEST, workflowStage: 'section-workspace' },
    moduleContext: { documentId: DOC, sectionId, sectionUpdatedAt: LATEST, savedRecordOnly: true },
  };
}
function submit(text = 'Review the saved section.') {
  const composer = screen.getByRole('textbox', { name: 'Reply to AnA' });
  fireEvent.change(composer, { target: { value: text } });
  fireEvent.keyDown(composer, { key: 'Enter' });
}
function ordinaryCanvasChat(answer?: string): UseAnaChatReturn {
  const shellChat = chat();
  shellChat.messages = [{ id: 'saved-turn', role: 'assistant', text: 'Saved document', generatedDraft: {
    title: 'Saved document', content: '', documentType: 'overview', authoringDocId: DOC, programId: PID,
  } }, ...(answer ? [{ id: 'answer-turn', role: 'assistant', text: answer, turnRecord: QUALIFIED }] : [])] as UseAnaChatReturn['messages'];
  return shellChat;
}

beforeEach(() => {
  window.C2C_PROJECT = { id: PID } as typeof window.C2C_PROJECT;
  probe.bridge = savedBridge();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => ok({ documents: [{ id: DOC, title: 'Saved document' }], activities: [] }));
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete window.C2C_PROJECT; delete window.C2C_CONVO; window.history.replaceState({}, '', '/'); });

describe('canonical authoring context follows the verified saved canvas', () => {
  it('uses the newer saved canvas version on the first explicit send instead of the earlier handoff snapshot', async () => {
    prefillConversation('Review the saved section.', origin, vi.fn());
    const shellChat = chat();
    render(<ConversationThread {...props} shellChat={shellChat} />);
    await screen.findByTestId('scope-canvas');
    await waitFor(() => expect(document.querySelector('[data-canvas-expanded="true"]')).toBeTruthy());
    expect(shellChat.send).not.toHaveBeenCalled();
    submit();
    expect(shellChat.send).toHaveBeenCalledWith('Review the saved section.', [], expect.objectContaining({
      authoringContext: probe.bridge!.authoringContext, moduleContext: probe.bridge!.moduleContext,
    }));
  });

  it('uses the currently open section rather than an earlier section attached on arrival', async () => {
    probe.bridge = savedBridge('aaaaaaaa-0000-4000-8000-000000000002');
    prefillConversation('Review the saved section.', origin, vi.fn());
    const shellChat = chat();
    render(<ConversationThread {...props} shellChat={shellChat} />);
    await screen.findByTestId('scope-canvas');
    await waitFor(() => expect(document.querySelector('[data-canvas-expanded="true"]')).toBeTruthy());
    submit();
    expect(shellChat.send).toHaveBeenCalledWith('Review the saved section.', [], expect.objectContaining({ authoringContext: probe.bridge!.authoringContext }));
  });

  it('withholds a prior-project ordinary canvas from the next turn after the shell project changes', async () => {
    window.C2C_CONVO = { id: 'current' };
    const shellChat = ordinaryCanvasChat();
    const { rerender } = render(<ConversationThread {...props} shellChat={shellChat} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open saved canvas' }));
    await waitFor(() => expect(document.querySelector('[data-canvas-expanded="true"]')).toBeTruthy());
    window.C2C_PROJECT = { id: OTHER } as typeof window.C2C_PROJECT;
    rerender(<ConversationThread {...props} shellChat={shellChat} />);
    submit('Review the current project.');
    expect(shellChat.send).toHaveBeenCalledWith('Review the current project.', []);
    expect(probe.bridge?.insert).not.toHaveBeenCalled();
    expect(probe.bridge?.propose).not.toHaveBeenCalled();
  });
});

describe('retained editor sources preserve intentional omission and scope guards', () => {
  it('does not retarget an attached section from a different section retained in a hidden canvas', () => {
    const bridge = savedBridge('aaaaaaaa-0000-4000-8000-000000000002');
    const read = { state: 'ready' as const, document: { docId: DOC, programId: PID, sectionId: SEC, title: 'Saved document' } };
    expect(originTurnContext(origin, read, PID, bridge, false)?.authoringContext).toBe(origin.authoringContext);
    expect(originTurnContext(null, read, PID, bridge, false)).toBeNull();
  });

  it('refuses a bridge whose saved identity does not match its document and section', () => {
    const bridge = savedBridge();
    bridge.authoringContext = { ...bridge.authoringContext!, sectionId: 'aaaaaaaa-0000-4000-8000-000000000002' };
    expect(editorScopeRefusal(bridge, PID)).toContain('could not be verified');
    expect(editorScopeRefusal(savedBridge(), 17)).toContain('Open this document’s project');
  });

  it('does not reintroduce the live authoring bridge into a question whose source attachment was removed', async () => {
    prefillConversation('Review the saved section.', origin, vi.fn());
    const shellChat = chat();
    render(<ConversationThread {...props} shellChat={shellChat} />);
    await screen.findByTestId('scope-canvas');
    await waitFor(() => expect(document.querySelector('[data-canvas-expanded="true"]')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Do not send what Authoring shows with this question' }));
    submit();
    expect(shellChat.send).toHaveBeenCalledWith('Review the saved section.', []);
  });

  it('keeps an insertion disabled after explicitly reopening a canvas from another project', async () => {
    window.C2C_CONVO = { id: 'current' };
    const shellChat = ordinaryCanvasChat('A proposed paragraph.');
    const { rerender } = render(<ConversationThread {...props} shellChat={shellChat} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open saved canvas' }));
    window.C2C_PROJECT = { id: OTHER } as typeof window.C2C_PROJECT;
    rerender(<ConversationThread {...props} shellChat={shellChat} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open saved canvas' }));
    const insert = screen.getByRole('button', { name: 'Insert into 2.5.1 as tracked suggestion' }) as HTMLButtonElement;
    expect(insert.disabled).toBe(true);
    expect(document.getElementById(insert.getAttribute('aria-describedby') ?? '')?.textContent).toContain('Open this document’s project');
    fireEvent.click(insert);
    expect(probe.bridge?.insert).not.toHaveBeenCalled();
  });

  it('keeps a remedy disabled after explicitly reopening a canvas from another project', async () => {
    window.C2C_CONVO = { id: 'current' };
    const remedy = { sectionId: SEC, baseUpdatedAt: LATEST, quote: 'Original paragraph', replacement: 'Revised paragraph', reason: 'Align with the saved evidence.' };
    const shellChat = ordinaryCanvasChat(`A proposed fix.\n\n\`\`\`authoring-remedy\n${JSON.stringify(remedy)}\n\`\`\``);
    const { rerender } = render(<ConversationThread {...props} shellChat={shellChat} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open saved canvas' }));
    window.C2C_PROJECT = { id: OTHER } as typeof window.C2C_PROJECT;
    rerender(<ConversationThread {...props} shellChat={shellChat} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open saved canvas' }));
    const apply = screen.getByRole('button', { name: 'Apply as tracked suggestion' }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(document.getElementById(apply.getAttribute('aria-describedby') ?? '')?.textContent).toContain('Open this document’s project');
    fireEvent.click(apply);
    expect(probe.bridge?.propose).not.toHaveBeenCalled();
  });
});
