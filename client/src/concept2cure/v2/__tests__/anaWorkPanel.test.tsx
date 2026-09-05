// @vitest-environment jsdom
/**
 * AnA at work — the live dock.
 *
 * What is pinned is the same pair as the activity record: that the work is
 * SHOWN (numbered phases, the step in flight, a running clock, the tools and
 * their durations, the background queue) and that nothing is shown which did
 * not happen (no phases for a turn that reported none, no queue for a read
 * that failed, no "finished" for a turn that was stopped).
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { AnaWorkPanel } from '../AnaWorkPanel';
import type { AgentActivityView } from '../useAgentActivity';
import type { AnaChatMessage } from '../../components/ana/useAnaChat';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const T0 = 1_700_000_000_000;

function liveTurn(over: Partial<AnaChatMessage> = {}): AnaChatMessage[] {
  return [
    { id: 'u1', role: 'user', text: 'How many patients do I need?', sentAt: T0 },
    {
      id: 'a1',
      role: 'assistant',
      text: '',
      streaming: true,
      sentAt: T0,
      progress: [
        { phase: 'orchestrating', label: 'Planning response…', status: 'done', startedAt: T0, endedAt: T0 + 800 },
        { phase: 'loading_context', label: 'Loading project memory…', status: 'done', startedAt: T0 + 800, endedAt: T0 + 2_000 },
        { phase: 'running_tools', label: 'Running 2 steps…', status: 'active', startedAt: T0 + 2_000 },
      ],
      toolCalls: [
        { name: 'search_literature', label: 'Searching the literature', status: 'success', round: 1, latencyMs: 2_340 },
        { name: 'compute_sample_size', label: 'Sample size — biostatistics engine', status: 'running', round: 1, startedAt: T0 + 2_100, input: { alpha: 0.05 } },
      ],
      ...over,
    },
  ];
}

const queueReady = (items: AgentActivityView['summary'] extends infer S ? (S extends { items: infer I } ? I : never) : never): AgentActivityView => ({
  state: 'ready',
  summary: { activeCount: 1, stalledCount: 1, recentlyCompletedCount: 0, items },
  readAt: T0,
  refresh: vi.fn(),
});

describe('AnaWorkPanel — the work is visible while it happens', () => {
  it('numbers the phases the turn actually reported and marks the one in flight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 59_000);
    render(<AnaWorkPanel messages={liveTurn()} streaming />);

    const list = screen.getByRole('list', { name: 'Progress' });
    const items = list.querySelectorAll('li');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('Planning response…');
    expect(items[2].textContent).toContain('Running 2 steps…');
    expect(items[2].getAttribute('aria-current')).toBe('step');
    expect(items[0].getAttribute('aria-current')).toBeNull();
    // The step in flight is named under the active phase.
    expect(items[2].textContent).toContain('Sample size — biostatistics engine');
  });

  it('runs a clock while the turn is live and stops it when the turn ends', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 57_000);
    const { rerender } = render(<AnaWorkPanel messages={liveTurn()} streaming />);
    expect(screen.getByText('Still working · 57s')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByText('Still working · 1m 00s')).toBeTruthy();

    // Finished: the elapsed line freezes on the recorded end, not the clock.
    const done = liveTurn({ streaming: false, text: 'You need 214 patients.', completedAt: T0 + 72_000 });
    rerender(<AnaWorkPanel messages={done} streaming={false} />);
    expect(screen.getByText('Finished in 1m 12s')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText('Finished in 1m 12s')).toBeTruthy();
  });

  it('says a turn that timed out or lost its connection did not finish — never "Finished"', () => {
    // Neither path sets `stopped` (that is the person's own stop); both close
    // the record with the last phase marked stopped.
    const cut = liveTurn({
      streaming: false,
      completedAt: T0 + 90_000,
      progress: [
        { phase: 'orchestrating', label: 'Planning response…', status: 'done', startedAt: T0, endedAt: T0 + 800 },
        { phase: 'running_tools', label: 'Running 2 steps…', status: 'stopped', startedAt: T0 + 800, endedAt: T0 + 90_000 },
      ],
      warnings: ['Response timed out'],
    });
    render(<AnaWorkPanel messages={cut} streaming={false} />);
    expect(screen.getByText('Did not finish · 1m 30s')).toBeTruthy();
    expect(screen.queryByText(/Finished in/)).toBeNull();
  });

  it('opens Outputs itself when the first output lands, and still lets the person collapse it', () => {
    const { rerender } = render(<AnaWorkPanel messages={liveTurn()} streaming />);
    const header = () => screen.getByRole('button', { name: /^Outputs/ });
    expect(header().getAttribute('aria-expanded')).toBe('false');
    rerender(
      <AnaWorkPanel
        messages={liveTurn({ generatedDraft: { title: 'Clinical Overview 2.5', content: '#' } })}
        streaming
      />,
    );
    expect(header().getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(header());
    // The regression: `open || outputs.length > 0` made this a button that did nothing.
    expect(header().getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(header().getAttribute('aria-controls') as string)?.hasAttribute('hidden')).toBe(true);
  });

  it('says a stopped turn was stopped, never finished', () => {
    const stopped = liveTurn({ streaming: false, stopped: true, completedAt: T0 + 30_000 });
    render(<AnaWorkPanel messages={stopped} streaming={false} />);
    expect(screen.getByText('Stopped after 30s')).toBeTruthy();
    expect(screen.queryByText(/Finished in/)).toBeNull();
  });

  it('shows the paused state with its clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 20_000);
    render(<AnaWorkPanel messages={liveTurn()} streaming runStatus="paused" />);
    expect(screen.getByText('Paused · 20s')).toBeTruthy();
  });

  it('lists every tool with its server-measured duration and an inputs disclosure', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 5_000);
    render(<AnaWorkPanel messages={liveTurn()} streaming />);
    // Tools starts closed — its rows restate the Work queue in forensic
    // form — so the section is opened first, like a person would.
    const tools = screen.getByRole('button', { name: /^Tools/ });
    expect(tools.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(tools);
    // Summary line built from the real labels.
    expect(
      screen.getByText('Searching the literature, sample size — biostatistics engine · 2 tools'),
    ).toBeTruthy();
    expect(screen.getByText('2.3s')).toBeTruthy();
    // The inputs are behind a disclosure, never inline: mounted (so the
    // button's aria-controls resolves) but hidden until opened.
    const inputs = screen.getByText(/"alpha": 0.05/);
    expect(inputs.hasAttribute('hidden')).toBe(true);
    const inputsBtn = screen.getByRole('button', { name: 'Inputs' });
    expect(inputsBtn.getAttribute('aria-controls')).toBe(inputs.id);
    fireEvent.click(inputsBtn);
    expect(inputs.hasAttribute('hidden')).toBe(false);
    expect(inputs.getAttribute('role')).toBe('region');
  });

  it('shows steers waiting for the next round', () => {
    render(<AnaWorkPanel messages={liveTurn()} streaming pendingSteers={['Use the FDA guidance, not EMA']} />);
    expect(screen.getByText('Use the FDA guidance, not EMA')).toBeTruthy();
    expect(screen.getByText('queued')).toBeTruthy();
  });
});

describe('AnaWorkPanel — nothing is shown that did not happen', () => {
  it('renders no phases for a turn that reported none, and no fabricated steps', () => {
    const bare: AnaChatMessage[] = [
      { id: 'u1', role: 'user', text: 'Hello' },
      { id: 'a1', role: 'assistant', text: 'Hello. What are we working on?', completedAt: T0 + 900, sentAt: T0 },
    ];
    render(<AnaWorkPanel messages={bare} streaming={false} />);
    expect(screen.queryByRole('list', { name: 'Progress' })).toBeNull();
    expect(screen.getByText('This turn did not report its phases.')).toBeTruthy();
    expect(screen.getByText('This turn needed no tool steps.')).toBeTruthy();
    expect(screen.getByText('No tools were called this turn.')).toBeTruthy();
  });

  it('is honest before the first turn', () => {
    render(<AnaWorkPanel messages={[]} streaming={false} />);
    expect(screen.getByText(/AnA has not started a turn/)).toBeTruthy();
  });

  it('reports a failed queue read as a failure, not an empty queue', () => {
    const refresh = vi.fn();
    render(
      <AnaWorkPanel
        messages={liveTurn()}
        streaming
        queue={{ state: 'error', summary: null, readAt: null, refresh }}
      />,
    );
    expect(screen.getByText("Couldn't read the background queue.")).toBeTruthy();
    expect(screen.queryByText(/reports no background investigations/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('renders the background queue the server reported, stalled runs included', () => {
    render(
      <AnaWorkPanel
        messages={liveTurn()}
        streaming
        queue={queueReady([
          { id: 'i1', question: 'Precedent for accelerated approval in DMD', status: 'running — 4 tool calls so far', toolCalls: 4, startedAt: null, completedAt: null },
          { id: 'i2', question: 'CMC comparability precedent', status: 'stalled — no heartbeat since restart', toolCalls: 0, startedAt: null, completedAt: null },
        ])}
      />,
    );
    expect(screen.getByText('1 running · 1 stalled · 0 finished in the last day')).toBeTruthy();
    expect(screen.getByText('Precedent for accelerated approval in DMD')).toBeTruthy();
    expect(screen.getByText(/stalled — no heartbeat since restart/)).toBeTruthy();
  });

  it('says the queue is not shown when no read was wired, rather than showing an empty one', () => {
    render(<AnaWorkPanel messages={liveTurn()} streaming />);
    expect(screen.getByText('Not shown on this surface.')).toBeTruthy();
  });
});

describe('AnaWorkPanel — outputs and context', () => {
  it('lists drafts with their save state and governed actions waiting for sign-off', () => {
    const msgs = liveTurn({
      streaming: false,
      completedAt: T0 + 5_000,
      generatedDraft: { title: 'Clinical Overview 2.5', content: '#', artifactId: 'art_1', version: 2 },
      pendingSignoffs: [{ command: 'seal_document', params: {}, reason: 'Part 11' } as never],
    });
    render(<AnaWorkPanel messages={msgs} streaming={false} />);
    expect(screen.getByText('Drafted Clinical Overview 2.5')).toBeTruthy();
    expect(screen.getByText('Saved · version 2')).toBeTruthy();
    expect(screen.getByText('1 governed action waiting for sign-off')).toBeTruthy();
  });

  it('leaves draft rows to a host that lists them as artifact cards', () => {
    const msgs = liveTurn({
      streaming: false,
      completedAt: T0 + 5_000,
      generatedDraft: { title: 'Clinical Overview 2.5', content: '#', artifactId: 'art_1', version: 2 },
      executedActions: [{ label: 'Validated the draft', actionType: 'run_validation', executed: true }],
    });
    render(<AnaWorkPanel messages={msgs} streaming={false} omitDrafts />);
    expect(screen.queryByText('Drafted Clinical Overview 2.5')).toBeNull();
    expect(screen.getByText('Validated the draft')).toBeTruthy();
  });

  it('shows the grounding context it was given and nothing it was not', () => {
    render(
      <AnaWorkPanel
        messages={liveTurn({ effortUsed: 'thorough', detectedLens: 'risk' })}
        streaming
        context={{ project: 'ONC-221 · Phase II', module: 'CMC', engine: 'Balanced' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Context/ }));
    expect(screen.getByText('ONC-221 · Phase II')).toBeTruthy();
    expect(screen.getByText('CMC')).toBeTruthy();
    expect(screen.getByText('thorough')).toBeTruthy();
    // The lens is a classifier code on the wire; the row says it as a phrase.
    expect(screen.getByText('a risk question')).toBeTruthy();
    expect(screen.queryByText('risk')).toBeNull();
    expect(screen.queryByText('Surface')).toBeNull();
  });

  it('keeps every section header pointing at an element that exists, open or collapsed', () => {
    const { container } = render(<AnaWorkPanel messages={liveTurn()} streaming />);
    const headers = container.querySelectorAll('.ana-work-sec-h');
    expect(headers.length).toBe(5);
    // Titles are real headings, so a screen reader can browse to them.
    expect(container.querySelectorAll('h3.ana-work-sec-hh').length).toBe(5);
    for (const h of headers) {
      const id = h.getAttribute('aria-controls') as string;
      const body = document.getElementById(id);
      expect(body).not.toBeNull();
      // Collapsed bodies stay in the DOM, hidden — never unmounted.
      expect(body!.hasAttribute('hidden')).toBe(h.getAttribute('aria-expanded') === 'false');
    }
    // Collapse one and the reference still resolves.
    fireEvent.click(screen.getByRole('button', { name: /^Progress/ }));
    const progress = screen.getByRole('button', { name: /^Progress/ });
    expect(progress.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(progress.getAttribute('aria-controls') as string)?.hasAttribute('hidden')).toBe(true);
  });

  it('speaks the same placeholder the list shows before the first phase arrives', () => {
    const { container } = render(
      <AnaWorkPanel
        messages={liveTurn({ progress: [], statusPhase: 'Planning response…' })}
        streaming
        announce
      />,
    );
    expect(container.querySelector('[aria-live]')?.textContent).toContain('Planning response…');
  });

  it('owns a single polite live region only when asked to announce', () => {
    const { container, rerender } = render(<AnaWorkPanel messages={liveTurn()} streaming />);
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(0);
    rerender(<AnaWorkPanel messages={liveTurn()} streaming announce />);
    const live = container.querySelectorAll('[aria-live]');
    expect(live).toHaveLength(1);
    expect(live[0].getAttribute('aria-live')).toBe('polite');
    expect(live[0].textContent).toContain('Running 2 steps…');
  });
});
