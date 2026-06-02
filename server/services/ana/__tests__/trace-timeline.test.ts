/**
 * Tests for trace-timeline — the projection behind GET
 * /api/ana-ri/threads/:threadId/timeline. It turns persisted chat_messages rows
 * into a stable per-turn view of which tools ran and how grounding came out.
 *
 * The contract f16a46e promised "7 trace-timeline tests"; the source shipped
 * without them. This restores that coverage: defensiveness (never throws on bad
 * input), assistant-only filtering, JSON-string metadata, and the
 * unsupported-as-array-or-number normalization.
 */
import { describe, it, expect } from 'vitest';
import { buildTraceTimeline, type TimelineRow } from '../trace-timeline.js';

describe('buildTraceTimeline', () => {
  it('projects a full assistant turn (tools + grounding)', () => {
    const rows: TimelineRow[] = [
      {
        id: 42,
        role: 'assistant',
        created_at: '2026-06-01T12:00:00.000Z',
        metadata: {
          toolTrace: [{ label: 'Searched precedents', status: 'success', resultSummary: '3 matches' }],
          grounding: { checked: 2, grounded: 1, unsupported: [{ kind: 'nct', text: 'NCT99999999' }] },
        },
      },
    ];
    const out = buildTraceTimeline(rows);
    expect(out).toHaveLength(1);
    expect(out[0].messageId).toBe('42');
    expect(out[0].at).toBe('2026-06-01T12:00:00.000Z');
    expect(out[0].tools).toEqual([
      { label: 'Searched precedents', status: 'success', resultSummary: '3 matches' },
    ]);
    expect(out[0].grounding).toEqual({ checked: 2, grounded: 1, unsupported: 1 });
  });

  it('accepts metadata as a JSON string (node-pg jsonb passthrough)', () => {
    const rows: TimelineRow[] = [
      {
        id: 7,
        role: 'assistant',
        created_at: '2026-06-01T12:00:00.000Z',
        metadata: JSON.stringify({ grounding: { checked: 1, grounded: 1, unsupported: [] } }),
      },
    ];
    const out = buildTraceTimeline(rows);
    expect(out).toHaveLength(1);
    expect(out[0].grounding).toEqual({ checked: 1, grounded: 1, unsupported: 0 });
    expect(out[0].tools).toEqual([]);
  });

  it('includes a tools-only turn with null grounding', () => {
    const rows: TimelineRow[] = [
      {
        id: 1,
        role: 'assistant',
        metadata: { toolTrace: [{ label: 'Fetched template', status: 'success', resultSummary: '' }] },
      },
    ];
    const out = buildTraceTimeline(rows);
    expect(out).toHaveLength(1);
    expect(out[0].grounding).toBeNull();
  });

  it('skips user and non-assistant rows', () => {
    const rows: TimelineRow[] = [
      { id: 1, role: 'user', metadata: { grounding: { checked: 1, grounded: 1, unsupported: 0 } } },
    ];
    expect(buildTraceTimeline(rows)).toHaveLength(0);
  });

  it('skips rows with nothing to show or malformed metadata', () => {
    const rows: TimelineRow[] = [
      { id: 1, role: 'assistant', metadata: {} },
      { id: 2, role: 'assistant', metadata: '{not valid json' },
      { id: 3, role: 'assistant', metadata: null },
    ];
    expect(buildTraceTimeline(rows)).toHaveLength(0);
  });

  it('normalizes unsupported given as a number rather than an array', () => {
    const rows: TimelineRow[] = [
      { id: 1, role: 'assistant', metadata: { grounding: { checked: 5, grounded: 2, unsupported: 3 } } },
    ];
    expect(buildTraceTimeline(rows)[0].grounding).toEqual({ checked: 5, grounded: 2, unsupported: 3 });
  });

  it('null-safes a missing id and a bad timestamp', () => {
    const rows: TimelineRow[] = [
      {
        role: 'assistant',
        created_at: 'not-a-real-date',
        metadata: { grounding: { checked: 1, grounded: 0, unsupported: 1 } },
      },
    ];
    const out = buildTraceTimeline(rows);
    expect(out[0].messageId).toBeNull();
    expect(out[0].at).toBeNull();
  });

  it('returns an empty timeline for empty input', () => {
    expect(buildTraceTimeline([])).toEqual([]);
  });
});
