// @vitest-environment jsdom
/**
 * The run-control strip, in one place, with Manual's copy (row 74, slice S4).
 *
 * The strip (pause / resume / steer / stop) lived inside the rail, so the
 * conversation screen — where the front door lands, and where the rail is not
 * drawn — had no way to answer a Manual hold: AnA would stop before her next
 * step and wait for a "Run this step" nothing on screen could press. It is now
 * one component (AnaWorkSections.tsx RunControlStrip), rendered by the rail
 * where it was and mounted above the conversation screen's composer.
 *
 * Under a Manual hold it says what she is waiting on and offers exactly the
 * three answers the server understands: Run this step (resume), Do this
 * instead (a steer, which replaces the step — and says the step shown will
 * not run), and Stop. A hold that ran out says so, with nothing to press.
 * A person's own pause reads as it always did (anaRunControl.test.tsx).
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { UseAnaChatReturn } from '../../components/ana/useAnaChat';
import { MAX_PAUSE_MS } from '@shared/ana/run-control-limits';

vi.mock('../dataConnect', () => ({
  connected: () => false,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock('../../../utils/authToken', () => ({ getAuthHeaders: () => ({ Authorization: 'Bearer t' }) }));
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

import { RunControlStrip } from '../AnaWorkSections';
import { ConversationThread } from '../surfaces/ConversationThread';

afterEach(cleanup);

const HOLD = { reason: 'manual' as const, next: ['Running a search - EMA register'] };

function shellChat(over: Partial<UseAnaChatReturn> = {}): UseAnaChatReturn {
  return {
    messages: [
      { id: 'u1', role: 'user', text: 'Compare the endpoints' },
      { id: 'a1', role: 'assistant', text: '', streaming: true, sentAt: 1_000 },
    ] as UseAnaChatReturn['messages'],
    isStreaming: true,
    send: vi.fn(async () => undefined),
    stop: vi.fn(),
    runStatus: 'paused',
    runHold: HOLD,
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

async function mountThread(chat: UseAnaChatReturn) {
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
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

describe('the conversation screen answers a Manual hold', () => {
  it('says she is waiting, names the next step, and offers the three answers', async () => {
    const chat = shellChat();
    const { container } = await mountThread(chat);
    const strip = container.querySelector('.ana-runctl');
    expect(strip).not.toBeNull();
    // Above the composer, so the answer sits where the person types.
    const wrap = container.querySelector('.ct-composer-wrap');
    expect(strip!.compareDocumentPosition(wrap!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Waiting for you before the next step')).toBeTruthy();
    expect(screen.getByText('Next: Running a search - EMA register')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Run this step' }));
    expect(chat.resume).toHaveBeenCalledTimes(1);

    const box = screen.getByPlaceholderText('Or tell AnA what to do instead') as HTMLInputElement;
    fireEvent.change(box, { target: { value: 'Search the EMA register' } });
    fireEvent.click(screen.getByRole('button', { name: 'Do this instead' }));
    expect(chat.interject).toHaveBeenCalledWith('Search the EMA register');
    expect(screen.getByText('The step shown will not run.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(chat.stop).toHaveBeenCalledTimes(1);
  });

  it('a hold that ran out says so, with nothing to press', async () => {
    const { container } = await mountThread(shellChat({ runStatus: null, runHold: { reason: 'expired', next: HOLD.next } }));
    expect(screen.getByText('Stopped waiting for you')).toBeTruthy();
    expect(container.querySelectorAll('.ana-runctl button')).toHaveLength(0);
  });

  it('offers only Stop before the run is controllable, as the rail does', async () => {
    await mountThread(shellChat({ runStatus: null, runHold: null }));
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.queryByLabelText('Steer this run')).toBeNull();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
  });

  it('no strip when nothing is running', async () => {
    const { container } = await mountThread(shellChat({ isStreaming: false, runStatus: null, runHold: null, messages: [] }));
    expect(container.querySelector('.ana-runctl')).toBeNull();
  });
});

describe('the strip on its own', () => {
  it('lists at most three next steps, then how many more', () => {
    render(
      <RunControlStrip
        streaming
        runStatus="paused"
        runHold={{ reason: 'manual', next: ['A', 'B', 'C', 'D', 'E'] }}
        onResume={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByText('Next: A; B; C; +2')).toBeTruthy();
  });

  it("a person's pause is unchanged: Paused after this step, Resume, Steer", () => {
    render(<RunControlStrip streaming runStatus="paused" runHold={{ reason: 'person', next: [] }} onResume={vi.fn()} onSteer={vi.fn()} onStop={vi.fn()} />);
    expect(screen.getByText('Paused after this step')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
    expect(screen.getByLabelText('Steer this run')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Run this step' })).toBeNull();
  });
});

describe('review follow-through: the hold is announced, timed and tied to its step', () => {
  it('announces the hold once to assistive technology, with the step, and says when it ends', () => {
    const { container } = render(
      <RunControlStrip streaming runStatus="paused" runHold={HOLD} onResume={vi.fn()} onSteer={vi.fn()} onStop={vi.fn()} />,
    );
    const live = container.querySelector('.ana-runctl [aria-live="polite"]');
    expect(live?.textContent).toBe('AnA is waiting for you before: Running a search - EMA register');
    expect(screen.getByText(`If nobody answers within ${MAX_PAUSE_MS / 60_000} minutes, the turn ends.`)).toBeTruthy();
  });

  it('Run this step and Do this instead are described by the step they act on', () => {
    render(<RunControlStrip streaming runStatus="paused" runHold={HOLD} onResume={vi.fn()} onSteer={vi.fn()} onStop={vi.fn()} />);
    const nextId = screen.getByText('Next: Running a search - EMA register').id;
    expect(nextId).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Run this step' }).getAttribute('aria-describedby')).toContain(nextId);
    expect(screen.getByLabelText('Tell AnA what to do instead').getAttribute('aria-describedby')).toContain(nextId);
  });

  it('while a Manual turn is working, the steer box says a steer replaces her next step', () => {
    render(<RunControlStrip streaming runStatus="running" runPolicy="manual" onPause={vi.fn()} onSteer={vi.fn()} onStop={vi.fn()} />);
    const help = screen.getByText(
      'Under Manual, a steer sent now replaces her next step unless that step needs your approval; a replaced step does not run.',
    );
    expect(screen.getByLabelText('Steer this run').getAttribute('aria-describedby')).toContain(help.id);
  });

  it('…and says nothing of the kind under Auto', () => {
    render(<RunControlStrip streaming runStatus="running" runPolicy="auto" onPause={vi.fn()} onSteer={vi.fn()} onStop={vi.fn()} />);
    expect(screen.queryByText(/replaces her next step/)).toBeNull();
  });

  it('the conversation screen passes the turn policy to the strip, and the hold to its chip', async () => {
    const { container, unmount } = await mountThread(shellChat({ runStatus: 'running', runHold: null, turnRunPolicy: 'manual' }));
    expect(screen.getByText(/replaces her next step/)).toBeTruthy();
    unmount();
    const held = await mountThread(shellChat());
    expect(held.container.querySelector('.ana-step-chip')?.textContent).toContain('Waiting for you');
    void container;
  });
});

describe('one strip in the codebase', () => {
  it('only AnaWorkSections.tsx defines .ana-runctl markup', () => {
    const root = path.resolve(__dirname, '..', '..');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === '__tests__' || e.name === 'node_modules') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e.name) && /className="ana-runctl"/.test(fs.readFileSync(full, 'utf8'))) {
          hits.push(path.relative(root, full));
        }
      }
    };
    walk(root);
    expect(hits).toEqual([path.join('v2', 'AnaWorkSections.tsx')]);
  });
});
