// @vitest-environment jsdom
/**
 * Steering a run that is already under way.
 *
 * WHAT WENT WRONG
 * The server has supported mid-run human control since run control shipped:
 * `POST /api/ana-ri/stream/:runId/control` takes pause / resume / cancel /
 * interject, the agentic loop applies it at its round-boundary checkpoint, and
 * an accepted steer is spliced into the next round AND written into the
 * decision lineage. `useAnaChat` exposes all four as `pause`, `resume`, `stop`
 * and `interject`.
 *
 * The v2 rail referenced none of them — zero occurrences of any of the four.
 * So a reviewer watching AnA work a question the wrong way could only wait for
 * her to finish. Capability existed at both ends and the wiring between them
 * was nobody's job, which is the same gap that hid the tool calls, the
 * reasoning and the answer's caveats.
 *
 * WHAT IS PINNED
 * That each control reaches the hook, and — the honesty half — that the copy
 * never promises an instant stop. Control lands at a ROUND BOUNDARY, so a
 * label saying otherwise would be the interface overstating what the server
 * does.
 *
 * WHERE
 * These cases ran on the right rail's strip and its own steer box. The rail is
 * gone (docs/design/ONE_ANA_ONE_CANVAS.md, slice 9); they run on the
 * conversation, where the strip keeps Pause, Resume and Stop and the composer
 * is the one box that steers (slice 4, oneBoxDuringRun.test.tsx). Which strip
 * appears before a run is controllable, and none when nothing runs, is pinned
 * in anaRunControlStrip.test.tsx.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { AnaChatMessage, UseAnaChatReturn } from '../../components/ana/useAnaChat';

vi.mock('../dataConnect', () => ({
  connected: () => false,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock('../../../utils/authToken', () => ({ getAuthHeaders: () => ({ Authorization: 'Bearer t' }) }));
/* The conversation screen's private chat — never the one acted on here. */
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: [],
    isStreaming: false,
    isLoadingThread: false,
    threadId: null,
    runStatus: null,
    runHold: null,
    pendingSteers: [],
    pause: vi.fn(),
    resume: vi.fn(),
    interject: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    send: vi.fn(),
    loadThread: vi.fn(),
  }),
}));

import { ConversationThread } from '../surfaces/ConversationThread';

const RUNNING: AnaChatMessage[] = [
  { id: 'u1', role: 'user', text: 'Compare the endpoints' } as AnaChatMessage,
  { id: 'a1', role: 'assistant', text: '', streaming: true, sentAt: 1_000 } as AnaChatMessage,
];

function shellChat(over: Partial<UseAnaChatReturn> = {}): UseAnaChatReturn {
  return {
    messages: RUNNING,
    isStreaming: true,
    send: vi.fn(async () => undefined),
    stop: vi.fn(),
    runStatus: 'running',
    runHold: null,
    pause: vi.fn(async () => true),
    resume: vi.fn(async () => true),
    interject: vi.fn(async () => true),
    pendingSteers: [],
    reset: vi.fn(),
    loadThread: vi.fn(async () => undefined),
    threadId: 'thread-1',
    isLoadingThread: false,
    ...over,
  } as UseAnaChatReturn;
}

async function mount(chat: UseAnaChatReturn) {
  const utils = render(
    <ConversationThread
      surface={{ id: 'conversation-thread', label: 'Conversation' } as never}
      segment="biotech"
      onNav={vi.fn()}
      shellChat={chat}
    />,
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return utils;
}

const steerBox = () => screen.getByLabelText('Steer this run') as HTMLTextAreaElement;
const steer = (v: string) => {
  const box = steerBox();
  fireEvent.change(box, { target: { value: v } });
  fireEvent.keyDown(box, { key: 'Enter' });
  return box;
};

beforeEach(() => {
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
});

describe('mid-run control reaches the conversation', () => {
  it('pauses the run', async () => {
    const chat = shellChat();
    await mount(chat);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(chat.pause).toHaveBeenCalledTimes(1);
  });

  it('offers Resume, not Pause, once paused', async () => {
    const chat = shellChat({ runStatus: 'paused' });
    await mount(chat);
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(chat.resume).toHaveBeenCalledTimes(1);
  });

  it('stops the run', async () => {
    const chat = shellChat();
    await mount(chat);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(chat.stop).toHaveBeenCalledTimes(1);
  });

  it('does not double-send while the first steer is still in flight', async () => {
    let release!: (v: boolean) => void;
    const chat = shellChat({ interject: vi.fn(() => new Promise<boolean>((r) => { release = r; })) });
    await mount(chat);
    const box = steer('narrow to Class III');
    // The text is still on screen while the server is deciding — a second Enter
    // in that window must not queue the same instruction again.
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(chat.interject).toHaveBeenCalledTimes(1);
    await act(async () => { release(true); });
    expect(box.value).toBe('');
  });

  it('refuses to send an empty steer', async () => {
    const chat = shellChat();
    await mount(chat);
    expect((screen.getByTestId('ct-steer-send') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(steerBox(), { key: 'Enter' });
    expect(chat.interject).not.toHaveBeenCalled();
  });

  it('pause never promises an instant stop', async () => {
    // Pause still lands at a round boundary, deliberately: killing a tool in
    // flight to pause throws the work away and then has to redo it. "Paused"
    // alone would claim the step stopped dead, which is not what pause does.
    const { container } = await mount(shellChat({ runStatus: 'paused' }));
    expect(container.querySelector('.ana-runctl-state')?.textContent).toContain('after this step');
  });

  it("stop does not borrow pause's promise — it cuts the step in flight", async () => {
    // Stop aborts generation and abandons the tool in flight, so copy saying
    // "after this step" would understate it in the other direction.
    const { container } = await mount(shellChat({ runStatus: 'cancelled' }));
    expect(container.querySelector('.ana-runctl-state')?.textContent ?? '').not.toContain('after this step');
  });

  it('never claims stopped before the server has said so', async () => {
    // Abort is not instantaneous. The terminal word belongs to the server's
    // acknowledgement; until then the state is in progress.
    const { container } = await mount(shellChat({ runStatus: 'cancelled' }));
    const state = container.querySelector('.ana-runctl-state')?.textContent ?? '';
    expect(state).toMatch(/Stopping/);
    expect(state).not.toMatch(/\bStopped\b/);
  });
});

/**
 * A steer the server REFUSED is not a steer that was sent.
 *
 * `interject` answers `false` on a 404 (the run is already gone), a 409, a
 * validation refusal and on a thrown fetch. A box that emptied on any of those
 * looked exactly like success. An accepted steer still clears; a refused one
 * keeps the text so it can be resent without retyping, and the refusal is
 * stated. A handler that reports nothing is treated as accepted — telling
 * someone their steer failed on no evidence is its own fabrication.
 */
describe('a steer the server refused says so, and keeps the text', () => {
  it('KEEPS the text, says it was not sent, and marks the box invalid', async () => {
    await mount(shellChat({ interject: vi.fn().mockResolvedValue(false) }));
    const box = steer('narrow to Class III');
    await act(async () => {});
    expect(box.value).toBe('narrow to Class III');
    expect(screen.getByText(/Not sent — AnA did not accept this steer/)).toBeTruthy();
    expect(box.getAttribute('aria-invalid')).toBe('true');
  });

  it('treats a thrown handler as a refusal, not a send', async () => {
    await mount(shellChat({ interject: vi.fn().mockRejectedValue(new Error('network')) }));
    const box = steer('stop citing 2019');
    await act(async () => {});
    expect(box.value).toBe('stop citing 2019');
    expect(screen.getByText(/Not sent/)).toBeTruthy();
  });

  it('treats a handler that reports nothing as accepted (unchanged contract)', async () => {
    await mount(shellChat({ interject: vi.fn().mockResolvedValue(undefined) as unknown as UseAnaChatReturn['interject'] }));
    const box = steer('shorter');
    await act(async () => {});
    expect(box.value).toBe('');
    expect(screen.queryByText(/Not sent/)).toBeNull();
  });

  it('clears the refusal once the person edits the text again', async () => {
    await mount(shellChat({ interject: vi.fn().mockResolvedValue(false) }));
    const box = steer('narrow to Class III');
    await act(async () => {});
    expect(screen.getByText(/Not sent/)).toBeTruthy();
    fireEvent.change(box, { target: { value: 'narrow to Class II' } });
    expect(screen.queryByText(/Not sent/)).toBeNull();
  });
});
