// @vitest-environment jsdom
/**
 * Tests for the live agent surface (client half):
 *   - hasSurfacedActivity / describeActivitySummary / normalizeActivity — the
 *     pure gate + copy + coercion (mirrors the server greeting gate).
 *   - AgentActivityCard — renders only when work is active or fresh; hides on a
 *     lone stalled run; honest status text; tone floor (no emoji, no "!").
 *
 * Plain DOM assertions (no jest-dom) to match the sibling tests in this dir.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import {
  AgentActivityCard,
  describeActivitySummary,
  composeInvestigationPrompt,
  isCompletedStatus,
} from '../AgentActivityCard';
import {
  hasSurfacedActivity,
  normalizeActivity,
  EMPTY_ACTIVITY,
  type AgentActivitySummary,
} from '../useAgentActivity';

afterEach(cleanup);

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

const summary = (over: Partial<AgentActivitySummary>): AgentActivitySummary => ({
  ...EMPTY_ACTIVITY,
  ...over,
});

const item = (over: Partial<AgentActivitySummary['items'][number]>) => ({
  id: 'i1',
  question: 'Predicate landscape for a Class II CGM',
  status: 'running (3 steps)',
  toolCalls: 3,
  startedAt: '2026-07-24T12:00:00Z',
  completedAt: null,
  ...over,
});

describe('hasSurfacedActivity (gate mirrors the greeting gate)', () => {
  it('is false when nothing is active or recent', () => {
    expect(hasSurfacedActivity(EMPTY_ACTIVITY)).toBe(false);
    expect(hasSurfacedActivity(null)).toBe(false);
    expect(hasSurfacedActivity(undefined)).toBe(false);
  });

  it('is false for a lone stalled run (not worth announcing)', () => {
    expect(hasSurfacedActivity(summary({ stalledCount: 1 }))).toBe(false);
  });

  it('is true when work is active or finished recently', () => {
    expect(hasSurfacedActivity(summary({ activeCount: 1 }))).toBe(true);
    expect(hasSurfacedActivity(summary({ recentlyCompletedCount: 1 }))).toBe(true);
  });
});

describe('describeActivitySummary', () => {
  it('pluralizes and joins the running/ready parts', () => {
    expect(describeActivitySummary(summary({ activeCount: 1 }))).toBe('1 investigation running');
    expect(describeActivitySummary(summary({ activeCount: 2 }))).toBe('2 investigations running');
    expect(describeActivitySummary(summary({ recentlyCompletedCount: 1 }))).toBe(
      '1 research memo ready',
    );
    expect(
      describeActivitySummary(summary({ activeCount: 2, recentlyCompletedCount: 1 })),
    ).toBe('2 investigations running · 1 research memo ready');
  });
});

describe('normalizeActivity (never throws on junk)', () => {
  it('coerces a well-formed payload', () => {
    const s = normalizeActivity({
      activeCount: 1,
      stalledCount: 0,
      recentlyCompletedCount: 2,
      items: [{ id: 'x', question: 'q', status: 'running', toolCalls: 4 }],
    });
    expect(s.activeCount).toBe(1);
    expect(s.recentlyCompletedCount).toBe(2);
    expect(s.items[0]).toMatchObject({ id: 'x', question: 'q', status: 'running', toolCalls: 4 });
    expect(s.items[0].startedAt).toBeNull();
  });

  it('returns a safe empty summary for garbage', () => {
    expect(normalizeActivity(null)).toEqual(EMPTY_ACTIVITY);
    expect(normalizeActivity('nope')).toEqual(EMPTY_ACTIVITY);
    expect(normalizeActivity({ items: 'not-an-array' }).items).toEqual([]);
  });
});

describe('AgentActivityCard — rendering', () => {
  it('renders nothing when there is no active or recent work', () => {
    const { container } = render(<AgentActivityCard summary={EMPTY_ACTIVITY} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders nothing for a lone stalled run', () => {
    const { container } = render(
      <AgentActivityCard summary={summary({ stalledCount: 1, items: [item({ status: 'stalled (orphaned by a restart)' })] })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('announces active work in a polite live region with the question', () => {
    render(
      <AgentActivityCard
        summary={summary({ activeCount: 1, items: [item({})] })}
      />,
    );
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText('Background AI work')).toBeTruthy();
    expect(screen.getByText('1 investigation running')).toBeTruthy();
    expect(screen.getByText(/Predicate landscape/)).toBeTruthy();
    expect(screen.getByText('running (3 steps)')).toBeTruthy();
  });

  it('announces a freshly-finished memo', () => {
    render(
      <AgentActivityCard
        summary={summary({
          recentlyCompletedCount: 1,
          items: [item({ status: 'completed', completedAt: '2026-07-24T12:30:00Z' })],
        })}
      />,
    );
    expect(screen.getByText('1 research memo ready')).toBeTruthy();
  });

  it('sorts stalled runs last and honors maxItems', () => {
    render(
      <AgentActivityCard
        maxItems={2}
        summary={summary({
          activeCount: 1,
          recentlyCompletedCount: 1,
          items: [
            item({ id: 'a', status: 'stalled (orphaned by a restart)', question: 'Stalled run' }),
            item({ id: 'b', status: 'running (2 steps)', question: 'Live run' }),
            item({ id: 'c', status: 'completed', question: 'Finished run' }),
          ],
        })}
      />,
    );
    // With maxItems=2 the two non-stalled runs win; the stalled one is dropped.
    expect(screen.getByText('Live run')).toBeTruthy();
    expect(screen.getByText('Finished run')).toBeTruthy();
    expect(screen.queryByText('Stalled run')).toBeNull();
  });

  it('honors the tone floor (no emoji, no exclamation marks)', () => {
    const { container } = render(
      <AgentActivityCard
        summary={summary({
          activeCount: 2,
          recentlyCompletedCount: 1,
          items: [item({}), item({ id: 'i2', status: 'completed', question: 'BLA filing risk' })],
        })}
      />,
    );
    const text = container.textContent || '';
    expect(text.includes('!')).toBe(false);
    expect(EMOJI.test(text)).toBe(false);
  });
});

describe('isCompletedStatus', () => {
  it('is true only for a run that produced a memo', () => {
    expect(isCompletedStatus('completed')).toBe(true);
    expect(isCompletedStatus('finished')).toBe(true);
    expect(isCompletedStatus('running (3 steps)')).toBe(false);
    expect(isCompletedStatus('queued')).toBe(false);
  });

  it('never treats a stalled run as finished (it has no memo)', () => {
    expect(
      isCompletedStatus('stalled — the server restarted while this was running; start a fresh investigation'),
    ).toBe(false);
  });
});

describe('composeInvestigationPrompt', () => {
  it('asks for the memo when the run finished, carrying the investigation id', () => {
    const prompt = composeInvestigationPrompt(item({ id: 'abc-123', status: 'completed' }));
    expect(prompt).toContain('investigation_id abc-123');
    expect(prompt).toContain('research memo');
    expect(prompt).toContain('Predicate landscape for a Class II CGM');
  });

  it('asks where a live run stands rather than for a memo it does not have', () => {
    const prompt = composeInvestigationPrompt(item({ id: 'abc-123' }));
    expect(prompt).toContain('investigation_id abc-123');
    expect(prompt).toContain('stand');
    expect(prompt).not.toContain('research memo');
  });

  it('asks for status (not a memo) on a stalled run', () => {
    const prompt = composeInvestigationPrompt(
      item({ status: 'stalled — the server restarted while this was running' }),
    );
    expect(prompt).not.toContain('research memo');
    expect(prompt).toContain('honest status');
  });

  it('stays readable when the run has no recorded question', () => {
    const prompt = composeInvestigationPrompt(item({ question: '' }));
    expect(prompt).not.toContain('""');
    expect(prompt).toContain('investigation_id i1');
  });

  it('honors the tone floor (no exclamation marks, no emoji)', () => {
    const prompt = composeInvestigationPrompt(item({ status: 'completed' }));
    expect(prompt.includes('!')).toBe(false);
    expect(EMOJI.test(prompt)).toBe(false);
  });
});

describe('AgentActivityCard — opening a run', () => {
  it('stays read-only (no buttons) when no handler is passed', () => {
    render(<AgentActivityCard summary={summary({ activeCount: 1, items: [item({})] })} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('makes each listed run a button and passes the clicked run up', () => {
    const onOpen = vi.fn();
    render(
      <AgentActivityCard
        summary={summary({ activeCount: 1, items: [item({})] })}
        onOpenInvestigation={onOpen}
      />,
    );
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0]![0]).toMatchObject({ id: 'i1' });
  });

  it('names the action by its outcome so it is unambiguous to a screen reader', () => {
    render(
      <AgentActivityCard
        summary={summary({
          activeCount: 1,
          recentlyCompletedCount: 1,
          items: [
            item({ id: 'live', question: 'Live run' }),
            item({ id: 'done', question: 'Done run', status: 'completed' }),
          ],
        })}
        onOpenInvestigation={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Read the research memo: Done run' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check progress: Live run' })).toBeTruthy();
  });
});
