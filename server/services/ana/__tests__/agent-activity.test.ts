/**
 * Tests — live agent activity: the pure summarizer (active / stalled /
 * recently-finished counts over investigation rows) and the proactive greeting
 * block builder. No DB touched.
 */

import { describe, it, expect } from 'vitest';

import {
  summarizeAgentActivity,
  buildAgentActivityPromptBlock,
  RECENTLY_COMPLETED_WINDOW_MS,
} from '../agent-activity.js';
import type { InvestigationRow } from '../deep-investigation.js';

const NOW = new Date('2026-07-24T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const min = 60_000;

const row = (over: Partial<InvestigationRow>): InvestigationRow => ({
  id: 'i1',
  status: 'running',
  question: 'Deep dive on predicate landscape',
  progress: [],
  result_text: null,
  error: null,
  tool_call_count: 3,
  model: null,
  provider: null,
  created_at: ago(20 * min),
  started_at: ago(19 * min),
  heartbeat_at: ago(1 * min),
  completed_at: null,
  ...over,
});

describe('summarizeAgentActivity', () => {
  it('counts a live run as active (recent heartbeat)', () => {
    const s = summarizeAgentActivity([row({ heartbeat_at: ago(1 * min) })], NOW);
    expect(s.activeCount).toBe(1);
    expect(s.stalledCount).toBe(0);
  });

  it('counts an orphaned run as stalled, not active', () => {
    const s = summarizeAgentActivity([row({ heartbeat_at: ago(30 * min) })], NOW);
    expect(s.activeCount).toBe(0);
    expect(s.stalledCount).toBe(1);
    expect(s.items[0].status).toContain('stalled');
  });

  it('counts a just-finished run as recently completed', () => {
    const s = summarizeAgentActivity(
      [row({ status: 'completed', completed_at: ago(10 * min), heartbeat_at: ago(10 * min) })],
      NOW,
    );
    expect(s.recentlyCompletedCount).toBe(1);
    expect(s.activeCount).toBe(0);
  });

  it('does not count an old completed run as recent', () => {
    const s = summarizeAgentActivity(
      [row({ status: 'completed', completed_at: ago(RECENTLY_COMPLETED_WINDOW_MS + min) })],
      NOW,
    );
    expect(s.recentlyCompletedCount).toBe(0);
  });

  it('truncates a long question and carries honest status per item', () => {
    const s = summarizeAgentActivity([row({ question: 'x'.repeat(300) })], NOW);
    expect(s.items[0].question.endsWith('…')).toBe(true);
    expect(s.items[0].question.length).toBeLessThan(150);
  });
});

describe('buildAgentActivityPromptBlock', () => {
  it('says nothing when there is no active or recent work (no greeting clutter)', () => {
    expect(buildAgentActivityPromptBlock(summarizeAgentActivity([], NOW))).toBe('');
    // A single stalled run alone is not "active or recent" work to announce.
    const stalledOnly = summarizeAgentActivity([row({ heartbeat_at: ago(30 * min) })], NOW);
    expect(buildAgentActivityPromptBlock(stalledOnly)).toBe('');
  });

  it('announces active work and points at check_deep_investigation', () => {
    const block = buildAgentActivityPromptBlock(summarizeAgentActivity([row({}), row({ id: 'i2' })], NOW));
    expect(block).toContain('2 background deep investigations are still running');
    expect(block).toContain('check_deep_investigation');
  });

  it('announces a freshly-finished memo', () => {
    const block = buildAgentActivityPromptBlock(
      summarizeAgentActivity(
        [row({ status: 'completed', completed_at: ago(5 * min), heartbeat_at: ago(5 * min) })],
        NOW,
      ),
    );
    expect(block).toContain('finished recently');
    expect(block).toContain('research memo is ready');
  });

  it('honors the tone floor (no exclamation marks, no emoji)', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    const block = buildAgentActivityPromptBlock(
      summarizeAgentActivity(
        [row({}), row({ id: 'i2', status: 'completed', completed_at: ago(5 * min) })],
        NOW,
      ),
    );
    expect(block).not.toContain('!');
    expect(block).not.toMatch(emoji);
  });
});
