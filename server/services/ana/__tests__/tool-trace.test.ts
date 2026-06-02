/**
 * Tests for tool-trace — the pure core of AnA's cross-turn tool memory. These
 * functions decide what AnA "remembers" she already did, so a regression here
 * either makes her repeat work or carry forward a wrong summary. The grounding
 * verdict persistence path (buildAssistantMetadata) is also covered, since that
 * is what the trace-timeline read API and the next-turn grounding chip rely on.
 */
import { describe, it, expect } from 'vitest';
import {
  summarizeToolResult,
  buildTraceEntry,
  collectTracesFromHistory,
  formatTraceForContext,
  buildAssistantMetadata,
  type ToolTraceEntry,
} from '../tool-trace.js';

describe('summarizeToolResult', () => {
  it('truncates non-JSON content', () => {
    expect(summarizeToolResult('plain text result')).toBe('plain text result');
  });

  it('collapses whitespace and truncates past the max with an ellipsis', () => {
    const long = 'word '.repeat(100);
    const out = summarizeToolResult(long, 40);
    expect(out).toHaveLength(40);
    expect(out.endsWith('…')).toBe(true);
  });

  it('surfaces an error field first', () => {
    expect(summarizeToolResult('{"error":"target not found"}')).toBe('error: target not found');
  });

  it('returns a short note when the payload is essentially just a note', () => {
    expect(summarizeToolResult('{"note":"nothing to do"}')).toBe('nothing to do');
    expect(summarizeToolResult('{"note":"ok","x":1}')).toBe('ok');
  });

  it('pluralizes match counts correctly', () => {
    expect(summarizeToolResult('{"totalMatches":3}')).toBe('3 matches');
    expect(summarizeToolResult('{"totalMatches":1}')).toBe('1 match');
  });

  it('summarizes structure counts', () => {
    expect(summarizeToolResult('{"counts":{"sections":5,"headings":2}}')).toBe(
      '5 sections; 2 headings'
    );
  });

  it('summarizes a diff, dropping zero-count fields', () => {
    expect(
      summarizeToolResult('{"summary":{"added":2,"removed":0,"modified":1}}')
    ).toBe('2 added, 1 modified');
  });

  it('summarizes a results array', () => {
    expect(summarizeToolResult('{"results":[1,2,3]}')).toBe('3 results');
    expect(summarizeToolResult('{"results":[1]}')).toBe('1 result');
  });

  it('handles a JSON primitive that is not an object', () => {
    expect(summarizeToolResult('"42"')).toBe('42');
  });
});

describe('buildTraceEntry', () => {
  it('builds an entry with a summarized result', () => {
    const e = buildTraceEntry('search_docs', 'Searched documents', 'success', '{"totalMatches":2}');
    expect(e).toEqual({
      tool: 'search_docs',
      label: 'Searched documents',
      status: 'success',
      resultSummary: '2 matches',
    });
  });
});

describe('collectTracesFromHistory', () => {
  it('collects entries from prior assistant metadata', () => {
    const history = [
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: 'done',
        metadata: { toolTrace: [{ tool: 't', label: 'Ran search', status: 'success', resultSummary: '2 matches' }] },
      },
    ];
    const out = collectTracesFromHistory(history);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('Ran search');
  });

  it('skips messages without a tool trace', () => {
    const history = [{ role: 'assistant', content: 'no tools', metadata: {} }];
    expect(collectTracesFromHistory(history)).toHaveLength(0);
  });

  it('skips malformed entries lacking a string label', () => {
    const history = [
      { role: 'assistant', content: 'x', metadata: { toolTrace: [{ tool: 't' }, null, 'nope'] } },
    ];
    expect(collectTracesFromHistory(history)).toHaveLength(0);
  });

  it('caps the collected entries to the most recent maxEntries', () => {
    const trace = Array.from({ length: 20 }, (_, i) => ({
      tool: `t${i}`,
      label: `Step ${i}`,
      status: 'success' as const,
      resultSummary: 's',
    }));
    const history = [{ role: 'assistant', content: 'x', metadata: { toolTrace: trace } }];
    const out = collectTracesFromHistory(history, 12);
    expect(out).toHaveLength(12);
    expect(out[out.length - 1].label).toBe('Step 19'); // most recent kept
    expect(out[0].label).toBe('Step 8');
  });
});

describe('formatTraceForContext', () => {
  it('returns an empty string when there is nothing to carry forward', () => {
    expect(formatTraceForContext([])).toBe('');
  });

  it('formats a success entry without a status marker', () => {
    const entries: ToolTraceEntry[] = [
      { tool: 't', label: 'Ran search', status: 'success', resultSummary: '3 matches' },
    ];
    const out = formatTraceForContext(entries);
    expect(out).toContain('Ran search: 3 matches');
    expect(out).not.toContain('[success]');
  });

  it('marks non-success entries with their status', () => {
    const entries: ToolTraceEntry[] = [
      { tool: 't', label: 'Lookup', status: 'error', resultSummary: 'error: boom' },
    ];
    expect(formatTraceForContext(entries)).toContain('Lookup [error]: error: boom');
  });
});

describe('buildAssistantMetadata', () => {
  it('returns undefined when there is nothing worth storing', () => {
    expect(buildAssistantMetadata([], null)).toBeUndefined();
  });

  it('stores the tool trace when present', () => {
    const trace: ToolTraceEntry[] = [
      { tool: 't', label: 'Ran search', status: 'success', resultSummary: 's' },
    ];
    expect(buildAssistantMetadata(trace, null)).toEqual({ toolTrace: trace });
  });

  it('does not store a grounding verdict when nothing was checked', () => {
    expect(buildAssistantMetadata([], { checked: 0, grounded: 0, unsupported: [] })).toBeUndefined();
  });

  it('stores the grounding verdict when claims were checked', () => {
    const grounding = { checked: 2, grounded: 1, unsupported: [{ kind: 'nct', text: 'NCT99999999' }] };
    expect(buildAssistantMetadata([], grounding)).toEqual({ grounding });
  });

  it('stores both trace and grounding when both are present', () => {
    const trace: ToolTraceEntry[] = [
      { tool: 't', label: 'Ran search', status: 'success', resultSummary: 's' },
    ];
    const grounding = { checked: 1, grounded: 1, unsupported: [] };
    expect(buildAssistantMetadata(trace, grounding)).toEqual({ toolTrace: trace, grounding });
  });
});
