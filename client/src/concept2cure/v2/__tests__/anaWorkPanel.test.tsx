// @vitest-environment jsdom
/**
 * AnA's progress — the panel.
 *
 * What is pinned is the same pair as the activity record: that the work is
 * SHOWN (her plan or the phases on one rail, the step in flight, a running
 * clock, what the session used, the background queue) and that nothing is
 * shown which did not happen (no steps for a turn that reported none, no count
 * for a plan she did not declare, no "done" for a step she did not finish, a
 * failed read said as failed, no "finished" for a turn that was stopped).
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

  it('adds Outputs only once there is an output, never an empty section', () => {
    const { rerender } = render(<AnaWorkPanel messages={liveTurn()} streaming />);
    expect(screen.queryByRole('heading', { name: 'Outputs' })).toBeNull();
    rerender(
      <AnaWorkPanel
        messages={liveTurn({ generatedDraft: { title: 'Clinical Overview 2.5', content: '#' } })}
        streaming
      />,
    );
    expect(screen.getByRole('heading', { name: 'Outputs' })).toBeTruthy();
    expect(screen.getByText('Drafted Clinical Overview 2.5')).toBeTruthy();
    // Still in flight: the save is not reported yet, and is not claimed.
    expect(screen.getByText('Save not yet reported')).toBeTruthy();
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

  it('leaves tool durations and inputs to the transcript, never repeats them here', () => {
    render(<AnaWorkPanel messages={liveTurn()} streaming />);
    // The forensic detail is behind each step's own chevron in AnaActivity.
    expect(screen.queryByText(/"alpha": 0.05/)).toBeNull();
    expect(screen.queryByText('2.3s')).toBeNull();
    // The tools she called are one line under "Used in this session".
    expect(screen.getByRole('heading', { name: 'Used in this session' })).toBeTruthy();
    expect(screen.getByText('Searching the literature, Sample size — biostatistics engine')).toBeTruthy();
  });

  it('shows steers waiting for the next round', () => {
    render(<AnaWorkPanel messages={liveTurn()} streaming pendingSteers={['Use the FDA guidance, not EMA']} />);
    expect(screen.getByText('Waiting for the next round')).toBeTruthy();
    expect(screen.getByText('Use the FDA guidance, not EMA')).toBeTruthy();
  });

});

describe('AnaWorkPanel — her plan', () => {
  it('shows her declared plan on the rail, the current step marked, and counts nothing she did not declare', () => {
    render(
      <AnaWorkPanel
        messages={liveTurn({
          plan: [
            { title: 'Read the protocol synopsis', status: 'completed' },
            { title: 'Run the sample-size engine', status: 'in_progress' },
            { title: 'Draft the justification', status: 'pending' },
          ],
        })}
        streaming
      />,
    );
    // Her plan replaces the phase list: the phases are still in the transcript.
    expect(screen.queryByRole('list', { name: 'Progress' })).toBeNull();
    const items = screen.getByRole('list', { name: 'Plan' }).querySelectorAll('li');
    expect(items).toHaveLength(3);
    expect(items[1].getAttribute('aria-current')).toBe('step');
    // State in words for assistive tech, not colour alone.
    expect(items[0].textContent).toContain('done');
    expect(items[1].textContent).toContain('in progress');
    expect(items[2].textContent).toContain('not started');
    // The step in flight is named under the current plan step.
    expect(items[1].textContent).toContain('Sample size — biostatistics engine');
  });

  it('never shows an unfinished step as done once the turn has ended', () => {
    render(
      <AnaWorkPanel
        messages={liveTurn({
          streaming: false,
          stopped: true,
          completedAt: T0 + 30_000,
          plan: [
            { title: 'Read the protocol synopsis', status: 'completed' },
            { title: 'Run the sample-size engine', status: 'in_progress' },
            { title: 'Draft the justification', status: 'pending' },
          ],
        })}
        streaming={false}
      />,
    );
    const items = screen.getByRole('list', { name: 'Plan' }).querySelectorAll('li');
    expect(items[1].textContent).toContain('not finished');
    expect(items[1].getAttribute('aria-current')).toBeNull();
    expect(items[2].textContent).toContain('not started');
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
    expect(screen.getByText('This turn did not report its steps.')).toBeTruthy();
    // No plan, no tools: no invented rows, and no "Used in this session".
    expect(screen.queryByRole('list', { name: 'Plan' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Used in this session' })).toBeNull();
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

  it('adds no Background section when no read was wired, or the queue is empty', () => {
    const { rerender } = render(<AnaWorkPanel messages={liveTurn()} streaming />);
    expect(screen.queryByRole('heading', { name: 'Background' })).toBeNull();
    rerender(<AnaWorkPanel messages={liveTurn()} streaming queue={queueReady([])} />);
    expect(screen.queryByRole('heading', { name: 'Background' })).toBeNull();
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

});

describe('AnaWorkPanel — used in this session', () => {
  it('says what the session used — only what reached the model, and a failed read as failed', () => {
    const msgs = liveTurn({
      effortUsed: 'thorough',
      detectedLens: 'risk',
      contextUsed: {
        uploads: [
          { fileId: 'f1', fileName: 'Protocol v3.pdf', mimeType: 'application/pdf', read: 'content' },
          { fileId: 'f2', fileName: 'SAP.docx', mimeType: 'application/octet-stream', read: 'name_only' },
        ],
        unresolvedUploads: 1,
        memory: [
          { layer: 'project_memory', title: 'Estimand decision' },
          { layer: 'project_memory', title: 'Stability arm' },
        ],
        memoryStatus: 'read',
      },
    });
    render(
      <AnaWorkPanel
        messages={msgs}
        streaming
        context={{ project: 'ONC-221 · Phase II', module: 'CMC', engine: 'Balanced' }}
      />,
    );
    expect(screen.getByText('Protocol v3.pdf +1')).toBeTruthy();
    expect(screen.getByText('1 read by name only · 1 could not be opened')).toBeTruthy();
    expect(screen.getByText('Read · Estimand decision, Stability arm')).toBeTruthy();
    expect(screen.getByText('ONC-221 · Phase II · CMC · Balanced · thorough effort')).toBeTruthy();
    // The lens belongs to the turn's record in the transcript, not here.
    expect(screen.queryByText(/a risk question/)).toBeNull();
  });

  it('says memory could not be read rather than that nothing matched', () => {
    render(
      <AnaWorkPanel
        messages={liveTurn({ contextUsed: { uploads: [], unresolvedUploads: 0, memory: [], memoryStatus: 'unavailable' } })}
        streaming
      />,
    );
    expect(screen.getByText('Could not be read')).toBeTruthy();
    expect(screen.queryByText(/Nothing in memory matched/)).toBeNull();
  });

  it('says nothing about memory when no turn reported what it read', () => {
    render(<AnaWorkPanel messages={liveTurn()} streaming />);
    expect(screen.queryByText('Memory')).toBeNull();
  });

});

describe('AnaWorkPanel — structure and announcements', () => {
  it('is one h2 over h3 sections, each present only when it has something to say', () => {
    const { container } = render(
      <AnaWorkPanel messages={liveTurn({ generatedDraft: { title: 'IB', content: '#' } })} streaming />,
    );
    expect(container.querySelectorAll('h2')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Progress' })).toBeTruthy();
    const h3 = [...container.querySelectorAll('h3')].map((h) => h.textContent);
    expect(h3).toEqual(['Outputs', 'Used in this session']);
  });

  it('offers a close only when the host asks for one', () => {
    const onClose = vi.fn();
    const { rerender } = render(<AnaWorkPanel messages={liveTurn()} streaming />);
    expect(screen.queryByRole('button', { name: 'Close progress' })).toBeNull();
    rerender(<AnaWorkPanel messages={liveTurn()} streaming onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close progress' }));
    expect(onClose).toHaveBeenCalledTimes(1);
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
