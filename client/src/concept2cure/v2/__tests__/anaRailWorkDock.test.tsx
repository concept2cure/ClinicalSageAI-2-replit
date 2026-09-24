// @vitest-environment jsdom
/**
 * AnA's progress panel in the shell rail.
 *
 * Pinned: the panel renders from the raw turns the rail is handed; the header
 * chip is its ONE control (the panel carries no close of its own here); the
 * chip counts only a plan AnA declared; and the choice is remembered under the
 * one key every host shares.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
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

describe('AnaRail — the progress panel', () => {
  it('shows the panel with the live turn by default', () => {
    renderRail();
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Progress' }).textContent).toContain('Running 1 step…');
  });

  it('renders a turn as every host does: her work, then the answer, then the output', () => {
    render(
      <AnaRail
        open
        setOpen={() => {}}
        surface={{ id: 'cmc', label: 'CMC' }}
        segment="biotech"
        mode="standard"
        setMode={() => {}}
        messages={[
          { role: 'user', body: 'Draft the synopsis' },
          {
            role: 'ana',
            body: 'The synopsis is drafted.',
            activity: { toolCalls: [{ name: 'search_literature', label: 'Searching the literature', status: 'success' }] },
            output: { generatedDraft: { title: 'CSR synopsis', content: '# Synopsis' } },
          },
        ]}
        onSend={() => {}}
        onAct={() => {}}
      />,
    );
    const record = document.querySelector('.ana-activity') as Element;
    const answer = screen.getByText('The synopsis is drafted.');
    const card = document.querySelector('.ana-out') as Element;
    expect(record.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(answer.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders no panel and no chip when the rail has no chat instance', () => {
    renderRail(false);
    expect(screen.queryByRole('heading', { name: 'Progress' })).toBeNull();
    expect(screen.queryByRole('button', { name: /AnA's progress/ })).toBeNull();
  });

  it('has one control for the panel — the header chip — and remembers the choice', () => {
    renderRail();
    // No second close inside the panel: it sits directly beneath the chip,
    // and two affordances a few pixels apart for one non-primary action was
    // the design defect this pins.
    expect(screen.queryByRole('button', { name: 'Close progress' })).toBeNull();
    const chip = screen.getByRole('button', { name: /AnA's progress/ });
    // No plan declared: the chip counts nothing.
    expect(chip.textContent).toContain('Working');
    expect(chip.textContent).not.toMatch(/of \d/);
    // A disclosure: it says the panel is open and names the panel it opened.
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    const panelId = chip.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)?.querySelector('h2')?.textContent).toBe('Progress');
    chip.focus();
    fireEvent.click(chip);
    expect(screen.queryByRole('heading', { name: 'Progress' })).toBeNull();
    // The chip stays mounted, so focus never falls to <body>.
    expect(document.activeElement).toBe(chip);
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    // Nothing to name once the panel is gone: no dangling reference.
    expect(chip.hasAttribute('aria-controls')).toBe(false);
    // Remembered under the shared key, so every host honours it.
    expect(localStorage.getItem(WORK_DOCK_KEY)).toBe('hidden');
    fireEvent.click(chip);
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeTruthy();
    expect(localStorage.getItem(WORK_DOCK_KEY)).toBe('shown');
  });

  it('counts her declared plan on the chip, and only that', () => {
    const planned: AnaChatMessage[] = [
      turns[0],
      {
        ...turns[1],
        plan: [
          { title: 'Read the protocol synopsis', status: 'completed' },
          { title: 'Run the sample-size engine', status: 'in_progress' },
          { title: 'Draft the justification', status: 'pending' },
        ],
      },
    ];
    render(
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
        work={{ messages: planned, pendingSteers: [] }}
      />,
    );
    expect(screen.getByRole('button', { name: /AnA's progress/ }).textContent).toContain('Step 2 of 3');
    const plan = screen.getByRole('list', { name: 'Plan' });
    const items = plan.querySelectorAll('li');
    expect(items).toHaveLength(3);
    expect(items[1].getAttribute('aria-current')).toBe('step');
    expect(items[0].textContent).toContain('done');
    expect(items[2].textContent).toContain('not started');
  });
});

describe('the chip\'s open look follows the attribute it sets', () => {
  it('styles the open chip by aria-expanded — the attribute the component sets — never aria-pressed', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../styles/app-v2.css'), 'utf8');
    expect(css).toMatch(/\.ana-step-chip\[aria-expanded="true"\]\{/);
    expect(css).not.toMatch(/\.ana-step-chip\[aria-pressed/);
  });
});
