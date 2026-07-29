/**
 * Tests for the trace timeline projection (server/services/ana/trace-timeline.ts).
 */

import { describe, it, expect } from 'vitest';
import { buildTraceTimeline } from '../../server/services/ana/trace-timeline';

const trace = [
  { tool: 'extract_document_structure', label: 'Analyzing the document structure', status: 'success', resultSummary: '8 sections' },
  { tool: 'search_document', label: 'Searching', status: 'error', resultSummary: 'error: bad regex' },
];

describe('buildTraceTimeline', () => {
  it('projects an assistant turn with tools and a grounding verdict', () => {
    const rows = [
      {
        id: 7,
        role: 'assistant',
        created_at: '2026-06-01T12:00:00.000Z',
        metadata: { toolTrace: trace, grounding: { checked: 3, grounded: 2, unsupported: [{ kind: 'nct', text: 'NCT09999999' }] } },
      },
    ];
    expect(buildTraceTimeline(rows)).toEqual([
      {
        messageId: '7',
        at: '2026-06-01T12:00:00.000Z',
        tools: [
          { label: 'Analyzing the document structure', status: 'success', resultSummary: '8 sections' },
          { label: 'Searching', status: 'error', resultSummary: 'error: bad regex' },
        ],
        grounding: { checked: 3, grounded: 2, unsupported: 1 },
      },
    ]);
  });

  it('handles metadata stored as a JSON string', () => {
    const rows = [{ id: 1, role: 'assistant', metadata: JSON.stringify({ toolTrace: trace }) }];
    const out = buildTraceTimeline(rows);
    expect(out).toHaveLength(1);
    expect(out[0].tools).toHaveLength(2);
    expect(out[0].grounding).toBeNull();
  });

  it('includes a grounding-only turn (no tools)', () => {
    const rows = [{ id: 2, role: 'assistant', metadata: { grounding: { checked: 1, grounded: 1, unsupported: [] } } }];
    const out = buildTraceTimeline(rows);
    expect(out[0].tools).toEqual([]);
    expect(out[0].grounding).toEqual({ checked: 1, grounded: 1, unsupported: 0 });
  });

  it('skips user messages, messages with no metadata, and empty-metadata turns', () => {
    const rows = [
      { id: 1, role: 'user', content: 'hi', metadata: { toolTrace: trace } }, // user — skipped
      { id: 2, role: 'assistant', metadata: null },                            // no metadata — skipped
      { id: 3, role: 'assistant', metadata: { toolTrace: [], grounding: null } }, // nothing to show — skipped
      { id: 4, role: 'assistant', metadata: { toolTrace: trace } },            // kept
    ];
    const out = buildTraceTimeline(rows);
    expect(out.map(e => e.messageId)).toEqual(['4']);
  });

  it('counts unsupported whether it is an array or a number, and tolerates missing fields', () => {
    const rows = [
      { id: 1, role: 'assistant', metadata: { grounding: { checked: 2, grounded: 0, unsupported: 2 } } },
      { id: 2, role: 'assistant', metadata: { toolTrace: [{ label: 'X' }] } },
    ];
    const out = buildTraceTimeline(rows);
    expect(out[0].grounding).toEqual({ checked: 2, grounded: 0, unsupported: 2 });
    expect(out[1].tools[0]).toEqual({ label: 'X', status: 'success', resultSummary: '' });
  });

  it('nulls an unparseable timestamp and a missing id rather than throwing', () => {
    const rows = [{ role: 'assistant', created_at: 'not-a-date', metadata: { toolTrace: trace } }];
    const out = buildTraceTimeline(rows);
    expect(out[0].messageId).toBeNull();
    expect(out[0].at).toBeNull();
  });

  it('returns an empty array for no rows', () => {
    expect(buildTraceTimeline([])).toEqual([]);
  });
});
