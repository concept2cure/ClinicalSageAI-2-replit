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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';

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
    const { container } = render(
      <AnaActivity
        streaming
        phase="Generating response…"
        toolCalls={[
          call(),
          call({ name: 'check_dossier_consistency', label: 'Dossier consistency sweep' }),
        ]}
      />,
    );

    // Scoped to the visible record on purpose. The phase also appears in the
    // screen-reader live region, and that duplication is the design — sighted
    // users read the rows, AT hears the one narrow region. A document-wide
    // query would make the a11y affordance look like a rendering bug.
    const body = within(container.querySelector('.ana-activity-body') as HTMLElement);

    // The regression: these were captured and rendered nowhere.
    expect(body.getByText('Sample size — biostatistics engine')).toBeTruthy();
    expect(body.getByText('Dossier consistency sweep')).toBeTruthy();
    expect(body.getByText('Generating response…')).toBeTruthy();
  });

  it('announces status through exactly one polite region', () => {
    // One. The visible phase row must NOT also be live: the rail transcript
    // used to be a live region too, and nested live regions are undefined
    // across assistive tech.
    const { container } = render(<AnaActivity streaming phase="Loading project memory…" />);

    const live = container.querySelectorAll('[aria-live]');
    expect(live.length).toBe(1);
    expect(live[0].getAttribute('aria-live')).toBe('polite');
    expect(live[0].textContent).toContain('Loading project memory…');
    // Assertive would interrupt the answer as it streams, which is the thing a
    // screen-reader user is actually trying to hear.
    expect(container.querySelector('[aria-live="assertive"]')).toBeNull();
  });

  it('keeps the live region mounted when there is nothing to say', () => {
    // A region that appears in the same paint as its first text is the
    // documented case screen readers fail to announce, so it exists from the
    // start and only its contents change.
    const { container } = render(<AnaActivity streaming phase="" toolCalls={[call()]} />);

    const live = container.querySelector('[aria-live]');
    expect(live).toBeTruthy();
    expect(live?.textContent).toBe('');
  });

  it('speaks the outcomes, not just the phase', () => {
    // Failures and deliverables are status changes. The rows are not in a live
    // region, so if these were not routed here they would never be announced.
    const { container } = render(
      <AnaActivity
        toolCalls={[call({ status: 'error', message: 'AnA could not finish the search.' })]}
        draftTitle="Clinical Overview 2.5"
      />,
    );

    const spoken = container.querySelector('[aria-live]')?.textContent ?? '';
    expect(spoken).toContain('1 step did not complete');
    expect(spoken).toContain('Drafted Clinical Overview 2.5');
  });

  it('points the disclosure at the region it controls', () => {
    const { container } = render(<AnaActivity toolCalls={[call()]} />);

    const toggle = container.querySelector('.ana-activity-toggle') as HTMLButtonElement;
    const controls = toggle?.getAttribute('aria-controls');
    expect(controls).toBeTruthy();

    // getElementById, not querySelector('#…'): React.useId() emits colons, which
    // are CSS combinator syntax, and jsdom exposes no global CSS.escape to quote
    // them with. The id lookup takes the string literally, which is what an AT
    // resolving aria-controls does anyway.
    // Resolves while collapsed too — a reference that only exists once the
    // disclosure is open is a dangling one the rest of the time.
    expect(document.getElementById(controls!)).toBeTruthy();
    expect(document.getElementById(controls!)?.hasAttribute('hidden')).toBe(true);
    act(() => { toggle.click(); });
    expect(document.getElementById(controls!)).toBeTruthy();
    expect(document.getElementById(controls!)?.hasAttribute('hidden')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
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

    expect(screen.getByText(/Reading this as a risk question/)).toBeTruthy();
  });

  it('reports the deliverable it produced, without needing to be expanded', () => {
    // A produced artifact is an outcome, not a step. Steps live inside the
    // disclosure; outcomes have to be visible on the collapsed line.
    render(<AnaActivity toolCalls={[call()]} draftTitle="Clinical Overview 2.5" />);

    expect(screen.getByRole('button').textContent).toContain('Drafted Clinical Overview 2.5');
  });

  it('names the deliverable as a step too once the record is open', () => {
    const { container } = render(
      <AnaActivity streaming toolCalls={[call()]} draftTitle="Clinical Overview 2.5" />,
    );

    // Again scoped: the draft is spoken in the live region AND shown as a row.
    const body = within(container.querySelector('.ana-activity-body') as HTMLElement);
    expect(body.getByText(/Drafted Clinical Overview 2\.5/)).toBeTruthy();
  });

  it('shows the newest stretch of her reasoning while she is still thinking', () => {
    const { container } = render(
      <AnaActivity
        streaming
        thinking={'Considering the endpoint.\nThe non-inferiority margin is the thing that decides this.'}
      />,
    );

    const think = container.querySelector('.ana-activity-think');
    // The regression: reasoning was streamed, accumulated, handed to this
    // component and rendered nowhere. Asserted as presence FIRST, so removing
    // the block fails with "expected null to be truthy" rather than an
    // assertion-shape error that reads like a broken test.
    expect(think).toBeTruthy();
    expect(think!.textContent).toContain('non-inferiority margin');
    expect(think?.classList.contains('is-live')).toBe(true);
  });

  it('shows her reasoning verbatim, never a summary of it', () => {
    // A paraphrase would be this component inventing a thought she did not
    // have — the same defect as inventing a step she did not run.
    const thought = 'Two arms at 1:1 gives 348 per arm, which the site count will not support.';
    const { container } = render(<AnaActivity thinking={thought} />);

    // act(), so the state update is flushed before the assertion reads the DOM.
    act(() => { (container.querySelector('.ana-activity-toggle') as HTMLButtonElement).click(); });
    expect(container.querySelector('.ana-activity-think')?.textContent).toBe(thought);
  });

  it('lets a keyboard reach the reasoning it has to scroll to read', () => {
    // The block is capped at 240px and scrolls. Without a tab stop a sighted
    // mouse user gets the whole deliberation and a keyboard-only user gets the
    // top of it with no way to know more exists.
    const { container } = render(<AnaActivity thinking={'a\n'.repeat(400)} />);
    act(() => { (container.querySelector('.ana-activity-toggle') as HTMLButtonElement).click(); });

    const think = container.querySelector('.ana-activity-think');
    expect(think?.getAttribute('tabindex')).toBe('0');
    // A tab stop with a role and no name is an unlabelled landmark.
    expect(think?.getAttribute('aria-label')).toBeTruthy();
  });

  it('does not add an empty tab stop for the live thought, which does not scroll', () => {
    const { container } = render(<AnaActivity streaming thinking="still weighing it" />);

    expect(container.querySelector('.ana-activity-think')?.getAttribute('tabindex')).toBeNull();
  });

  it('cuts a long live thought at a word boundary and marks the cut', () => {
    const long = `${'deliberating '.repeat(40)}the margin decides it.`;
    const { container } = render(<AnaActivity streaming thinking={long} />);

    const shown = container.querySelector('.ana-activity-think')?.textContent ?? '';
    expect(shown.startsWith('…')).toBe(true);
    // A half-word reads as a rendering bug, so the cut lands between words.
    expect(shown.slice(1).startsWith('deliberating')).toBe(true);
    expect(shown).toContain('the margin decides it.');
    expect(shown.length).toBeLessThanOrEqual(182);
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
    // Collapsed: the record stays in the DOM, hidden, so the toggle's
    // aria-controls keeps pointing at something that exists.
    const body = container.querySelector('.ana-activity-body') as HTMLElement;
    expect(body.hasAttribute('hidden')).toBe(true);
    expect(body.id).toBe(toggle?.getAttribute('aria-controls'));
    expect(toggle?.textContent).toContain('1 step completed');
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

  it('reports a failed step in the words the server wrote, not the raw payload', () => {
    // The server composes a sentence naming the step and the consequence.
    // `result` is the uncapped tool payload and must never reach the rail —
    // internal identifiers in customer copy is a defect this repo has had.
    render(
      <AnaActivity
        streaming
        toolCalls={[
          call({
            status: 'error',
            label: 'Literature search',
            message: "AnA couldn't finish searching the literature. She'll continue with what she has.",
            result: '{"error":"ECONNREFUSED","host":"internal-svc.cluster.local:8080"}',
          }),
        ]}
      />,
    );

    expect(screen.getByText(/She'll continue with what she has/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('ECONNREFUSED');
    expect(document.body.textContent).not.toContain('internal-svc');
  });

  it('counts only settled steps as run, never the one still in flight', () => {
    render(
      <AnaActivity
        toolCalls={[call({ status: 'success' }), call({ status: 'running', name: 'x' })]}
      />,
    );

    expect(screen.getByRole('button').textContent).toContain('1 step completed');
  });
});

describe('AnaActivity — the clock', () => {
  it('runs a clock beside the live phase and freezes the recorded duration once settled', () => {
    vi.useFakeTimers();
    const t0 = 1_700_000_000_000;
    vi.setSystemTime(t0 + 57_000);
    const { container, rerender } = render(
      <AnaActivity streaming phase="Running 2 steps…" startedAt={t0} toolCalls={[call({ status: 'running' })]} />,
    );
    const phaseRow = () => container.querySelector('.ana-activity-phase') as HTMLElement;
    expect(phaseRow().textContent).toContain('Running 2 steps…');
    expect(phaseRow().textContent).toContain('57s');

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(phaseRow().textContent).toContain('1m 00s');

    // Settled with a recorded end: the collapsed line names the duration, and
    // it does not move with the clock afterwards.
    rerender(<AnaActivity phase="" startedAt={t0} completedAt={t0 + 72_000} toolCalls={[call()]} />);
    const toggle = () => container.querySelector('.ana-activity-toggle') as HTMLElement;
    expect(toggle().textContent).toContain('in 1m 12s');
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(toggle().textContent).toContain('in 1m 12s');
    vi.useRealTimers();
  });

  it('claims no duration for a settled turn with no recorded end', () => {
    const { container } = render(<AnaActivity startedAt={1_700_000_000_000} toolCalls={[call()]} />);
    const toggle = container.querySelector('.ana-activity-toggle') as HTMLElement;
    expect(toggle.textContent).not.toMatch(/ in \d/);
  });
});
