// @vitest-environment jsdom
/**
 * AnA's work record.
 *
 * Two things are being pinned here, and the second matters more than the first.
 *
 * 1. That the work is SHOWN. `useAnaChat` already captured every deterministic
 *    tool AnA called — label, agentic-loop round, status — and the shell rail
 *    rendered one line of body text, so a three-engine two-round investigation
 *    presented to the user as the word "Thinking…".
 *
 * 2. That nothing is shown which did not happen. A progress display is the
 *    easiest place in a product to start lying: a turn that ran nothing must
 *    not sprout reassuring rows, and a step that failed must say so rather
 *    than disappear. Making the work legible is worth nothing if the record is
 *    decorated, so the honesty cases are as load-bearing as the rendering ones.
 */

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { AnaActivity } from '../AnaActivity';
import type { AnaToolCall } from '../../components/ana/useAnaChat';

afterEach(cleanup);

const call = (over: Partial<AnaToolCall> = {}): AnaToolCall => ({
  name: 'compute_sample_size',
  label: 'Sample size — biostatistics engine',
  status: 'success',
  ...over,
});

describe('AnaActivity — the work is visible while it happens', () => {
  it('names each tool AnA actually ran, under its real label', () => {
    render(
      <AnaActivity
        streaming
        phase="Generating response…"
        toolCalls={[
          call(),
          call({ name: 'check_dossier_consistency', label: 'Dossier consistency sweep' }),
        ]}
      />,
    );

    // The regression: these were captured and rendered nowhere.
    expect(screen.getByText('Sample size — biostatistics engine')).toBeTruthy();
    expect(screen.getByText('Dossier consistency sweep')).toBeTruthy();
    expect(screen.getByText('Generating response…')).toBeTruthy();
  });

  it('announces the live phase politely rather than assertively', () => {
    // An assertive region would interrupt the answer as it streams in, which
    // is the one thing a screen-reader user is actually trying to hear.
    const { container } = render(<AnaActivity streaming phase="Loading project memory…" />);

    const live = container.querySelector('[aria-live]');
    expect(live?.getAttribute('aria-live')).toBe('polite');
    expect(live?.textContent).toContain('Loading project memory…');
  });

  it('separates the rounds so going back for more reads as exactly that', () => {
    render(
      <AnaActivity
        streaming
        toolCalls={[
          call({ round: 1, label: 'Precedent search' }),
          call({ round: 2, label: 'Citation coverage' }),
        ]}
      />,
    );

    expect(screen.getByText('First pass')).toBeTruthy();
    expect(screen.getByText(/Went back · round 2/)).toBeTruthy();
  });

  it('states how the question was read', () => {
    render(<AnaActivity streaming lens="risk" toolCalls={[call()]} />);

    expect(screen.getByText(/weighing the risk/)).toBeTruthy();
  });

  it('reports the deliverable it produced, without needing to be expanded', () => {
    // A produced artifact is an outcome, not a step. Steps live inside the
    // disclosure; outcomes have to be visible on the collapsed line.
    render(<AnaActivity toolCalls={[call()]} draftTitle="Clinical Overview 2.5" />);

    expect(screen.getByRole('button').textContent).toContain('drafted Clinical Overview 2.5');
  });

  it('names the deliverable as a step too once the record is open', () => {
    render(<AnaActivity streaming toolCalls={[call()]} draftTitle="Clinical Overview 2.5" />);

    expect(screen.getByText(/Drafted Clinical Overview 2\.5/)).toBeTruthy();
  });

  it('is open while streaming and collapsed once the answer has landed', () => {
    const { rerender, container } = render(<AnaActivity streaming toolCalls={[call()]} />);
    // In flight: no toggle, the record is simply open — that is the point.
    expect(container.querySelector('.ana-activity-toggle')).toBeNull();
    expect(screen.getByText('Sample size — biostatistics engine')).toBeTruthy();

    rerender(<AnaActivity toolCalls={[call()]} />);
    const toggle = container.querySelector('.ana-activity-toggle');
    expect(toggle).toBeTruthy();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Sample size — biostatistics engine')).toBeNull();
    expect(toggle?.textContent).toContain('1 check run');
  });
});

describe('AnaActivity — it never claims work that did not happen', () => {
  it('renders nothing at all for a settled turn that did no reportable work', () => {
    // The plain-answer case. No tools, no lens, no draft — so no record, rather
    // than an empty frame implying something ought to be there.
    const { container } = render(<AnaActivity />);

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while streaming when there is no phase and nothing to report', () => {
    const { container } = render(<AnaActivity streaming />);

    expect(container.firstChild).toBeNull();
  });

  it('shows a failed step as failed instead of dropping it', () => {
    render(
      <AnaActivity
        toolCalls={[call({ status: 'error', label: 'Precedent search' })]}
      />,
    );

    const toggle = screen.getByRole('button');
    // Visible in the summary without expanding: a failure the user has to open
    // a disclosure to discover is a failure the product is hiding.
    expect(toggle.textContent).toContain('1 failed');
  });

  it('counts only settled steps as run, never the one still in flight', () => {
    render(
      <AnaActivity
        toolCalls={[call({ status: 'success' }), call({ status: 'running', name: 'x' })]}
      />,
    );

    expect(screen.getByRole('button').textContent).toContain('1 check run');
  });
});
