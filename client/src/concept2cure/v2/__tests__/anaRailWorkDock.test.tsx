// @vitest-environment jsdom
/**
 * The work dock in the shell rail.
 *
 * Pinned: the dock renders from the raw turns the rail is handed; its own
 * close control hands keyboard focus back to the header toggle before the
 * dock unmounts (otherwise focus falls to <body>); the toggle re-shows it;
 * and the choice is remembered under the one key every host shares.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../dataConnect', () => ({
  useLive: () => ({ data: null, sample: true, loading: false }),
  connected: () => false,
  SampleTag: ({ sample }: { sample: boolean }) => <span>{sample ? 'Sample data' : 'Live'}</span>,
}));

import { AnaRail } from '../Shell';
import { WORK_DOCK_KEY } from '../workDock';
import type { AnaChatMessage } from '../../components/ana/useAnaChat';

afterEach(() => cleanup());
beforeEach(() => {
  localStorage.removeItem(WORK_DOCK_KEY);
  (globalThis.fetch as any) = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
});

const T0 = 1_700_000_000_000;
const turns: AnaChatMessage[] = [
  { id: 'u1', role: 'user', text: 'How many patients?', sentAt: T0 },
  {
    id: 'a1',
    role: 'assistant',
    text: '',
    streaming: true,
    sentAt: T0,
    progress: [{ phase: 'running_tools', label: 'Running 1 step…', status: 'active', startedAt: T0 }],
    toolCalls: [{ name: 'compute_sample_size', label: 'Sample size — biostatistics engine', status: 'running', round: 1 }],
  },
];

function renderRail(work = true) {
  return render(
    <AnaRail
      open
      setOpen={() => {}}
      surface={{ id: 'cmc', label: 'CMC' }}
      segment="biotech"
      mode="standard"
      setMode={() => {}}
      messages={[{ role: 'user', body: 'How many patients?' }, { role: 'ana', body: '' }]}
      onSend={() => {}}
      onAct={() => {}}
      streaming
      runStatus="running"
      work={work ? { messages: turns, pendingSteers: [] } : undefined}
    />,
  );
}

describe('AnaRail — the work dock', () => {
  it('shows the dock with the live turn by default', () => {
    renderRail();
    expect(screen.getByText('AnA at work')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Progress' }).textContent).toContain('Running 1 step…');
  });

  it('renders no dock and no toggle when the rail has no chat instance', () => {
    renderRail(false);
    expect(screen.queryByText('AnA at work')).toBeNull();
    expect(screen.queryByRole('button', { name: /AnA at work/ })).toBeNull();
  });

  it("hands focus to the header toggle when the dock's own close control is used", () => {
    renderRail();
    // Two controls share the name while the dock is open — the header toggle
    // and the dock's own close — and this test is about the second.
    const close = screen
      .getAllByRole('button', { name: 'Hide AnA at work' })
      .find((b) => b.classList.contains('ana-work-x')) as HTMLButtonElement;
    expect(close).toBeTruthy();
    close.focus();
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    expect(screen.queryByText('AnA at work')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Show AnA at work' });
    expect(document.activeElement).toBe(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    // Remembered under the shared key, so every host honours it.
    expect(localStorage.getItem(WORK_DOCK_KEY)).toBe('hidden');
    fireEvent.click(toggle);
    expect(screen.getByText('AnA at work')).toBeTruthy();
    expect(localStorage.getItem(WORK_DOCK_KEY)).toBe('shown');
  });
});
