// @vitest-environment jsdom
/**
 * One place to type to AnA during a run.
 *
 * docs/design/ONE_ANA_ONE_CANVAS.md, slice 4. In a real browser on 2026-10-07
 * and again on 2026-10-08 (docs/evidence/D2-ONE-ANA/2026-10-08/0-screens/
 * 05-conversation-after-ask.marked.png; ana-1-canvas-opens/screens/
 * 1440-b-document-appears.png) the conversation screen showed three boxes at
 * once while AnA worked: "Reply to AnA", the run strip's "Steer this run…"
 * and the drive strip's "Ask or steer AnA…". Now the composer is the one box:
 * while a run that can take a steer is in flight it steers it, with the rules
 * the strip's box kept.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AnaChatMessage } from '../../components/ana/useAnaChat';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }) }));

const state = {
  isStreaming: true,
  runStatus: 'running' as string | null,
  runHold: null as unknown,
  interject: vi.fn(async (_m: string) => true as boolean),
  send: vi.fn(),
};
const MESSAGES: AnaChatMessage[] = [
  { id: 'u1', role: 'user', text: 'Draft the Module 2.5 overview.' } as AnaChatMessage,
  { id: 'a1', role: 'assistant', text: 'Working on it.', isStreaming: true } as unknown as AnaChatMessage,
];
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: MESSAGES,
    isStreaming: state.isStreaming,
    isLoadingThread: false,
    loadThread: vi.fn().mockResolvedValue(undefined),
    send: state.send,
    interject: state.interject,
    runStatus: state.runStatus,
    runHold: state.runHold,
    turnRunPolicy: 'auto',
    pendingSteers: [],
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    threadId: 'thread-1',
  }),
}));

import { ConversationThread } from '../surfaces/ConversationThread';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};

beforeEach(() => {
  (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'thread-1' };
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response);
  state.isStreaming = true;
  state.runStatus = 'running';
  state.runHold = null;
  state.interject.mockReset();
  state.interject.mockResolvedValue(true);
  state.send.mockReset();
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
});

const typingBoxes = () => Array.from(document.querySelectorAll('textarea, input[type="text"]'));

describe('during a run, one box', () => {
  it('there is exactly one place to type to AnA, and it steers the run', async () => {
    render(<ConversationThread {...PROPS} />);
    expect(typingBoxes()).toHaveLength(1);
    const box = screen.getByLabelText('Steer this run') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Use the 2024 PK data, not 2023.' } });
    fireEvent.click(screen.getByTestId('ct-steer-send'));
    await waitFor(() => expect(state.interject).toHaveBeenCalledWith('Use the 2024 PK data, not 2023.'));
    expect(state.send).not.toHaveBeenCalled();
    await waitFor(() => expect(box.value).toBe(''));
  });

  it('a refused steer keeps its text and says so', async () => {
    state.interject.mockResolvedValue(false);
    render(<ConversationThread {...PROPS} />);
    const box = screen.getByLabelText('Steer this run') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Stop citing the draft protocol.' } });
    fireEvent.click(screen.getByTestId('ct-steer-send'));
    expect(await screen.findByText(/Not sent — AnA did not accept this steer/)).toBeTruthy();
    expect(box.value).toBe('Stop citing the draft protocol.');
  });

  it('under a Manual hold it is "Do this instead": the step shown will not run', async () => {
    state.runStatus = 'paused';
    state.runHold = { reason: 'manual', next: [{ label: 'Search the Vault' }] };
    render(<ConversationThread {...PROPS} />);
    expect(screen.getByLabelText('Tell AnA what to do instead')).toBeTruthy();
    expect(screen.getByTestId('ct-steer-send').textContent).toBe('Do this instead');
    expect(screen.getByText('The step shown will not run.')).toBeTruthy();
  });

  it('when AnA is idle it is the ordinary composer again', async () => {
    state.isStreaming = false;
    state.runStatus = null;
    render(<ConversationThread {...PROPS} />);
    expect(screen.getByLabelText('Reply to AnA')).toBeTruthy();
    expect(screen.queryByTestId('ct-steer-send')).toBeNull();
  });
});
