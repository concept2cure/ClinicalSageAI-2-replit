/**
 * Tests for AnA tool-trace memory (server/services/ana/tool-trace.ts).
 */

import { describe, it, expect } from 'vitest';
import {
  summarizeToolResult,
  buildTraceEntry,
  collectTracesFromHistory,
  formatTraceForContext,
  type ToolTraceEntry,
} from '../../server/services/ana/tool-trace';

describe('summarizeToolResult', () => {
  it('summarizes known result shapes', () => {
    expect(summarizeToolResult(JSON.stringify({ totalMatches: 3, matches: [] }))).toBe('3 matches');
    expect(summarizeToolResult(JSON.stringify({ totalMatches: 1 }))).toBe('1 match');
    expect(summarizeToolResult(JSON.stringify({ counts: { sections: 8, headings: 6 } }))).toBe('8 sections; 6 headings');
    expect(summarizeToolResult(JSON.stringify({ summary: { added: 1, removed: 2, modified: 1, unchanged: 4 } })))
      .toBe('1 added, 2 removed, 1 modified');
    expect(summarizeToolResult(JSON.stringify({ error: 'boom' }))).toBe('error: boom');
    expect(summarizeToolResult(JSON.stringify({ note: 'no handler' }))).toBe('no handler');
  });

  it('falls back to truncated text for non-JSON or opaque results', () => {
    expect(summarizeToolResult('just some plain text')).toBe('just some plain text');
    const long = 'x'.repeat(400);
    expect(summarizeToolResult(long, 50).length).toBeLessThanOrEqual(50);
    expect(summarizeToolResult(long, 50)).toContain('…');
  });
});

describe('buildTraceEntry', () => {
  it('captures the tool, label, status and a result summary', () => {
    const e = buildTraceEntry('search_document', 'Searching the document for "x"', 'success',
      JSON.stringify({ totalMatches: 2 }));
    expect(e).toEqual({
      tool: 'search_document',
      label: 'Searching the document for "x"',
      status: 'success',
      resultSummary: '2 matches',
    });
  });
});

describe('collectTracesFromHistory', () => {
  const trace: ToolTraceEntry[] = [
    { tool: 'extract_document_structure', label: 'Analyzing the document structure', status: 'success', resultSummary: '8 sections' },
  ];

  it('extracts traces from assistant message metadata, most recent last', () => {
    const history = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'done', metadata: { toolTrace: trace } },
      { role: 'user', content: 'more' },
      { role: 'assistant', content: 'done2', metadata: { toolTrace: [{ tool: 'search_document', label: 'Searching', status: 'success', resultSummary: '1 match' }] } },
    ];
    const out = collectTracesFromHistory(history);
    expect(out.map(e => e.label)).toEqual(['Analyzing the document structure', 'Searching']);
  });

  it('ignores messages without a trace and caps the number of entries', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      role: 'assistant', content: 'x',
      metadata: { toolTrace: [{ tool: 't', label: `L${i}`, status: 'success', resultSummary: 'r' }] },
    }));
    const out = collectTracesFromHistory([{ role: 'user', content: 'x' }, ...many], 12);
    expect(out).toHaveLength(12);
    expect(out[out.length - 1].label).toBe('L29'); // most recent kept
  });

  it('returns nothing when no message carries a trace', () => {
    expect(collectTracesFromHistory([{ role: 'assistant', content: 'plain' }])).toEqual([]);
  });
});

describe('formatTraceForContext', () => {
  it('formats a continuity note and marks non-success entries', () => {
    const note = formatTraceForContext([
      { tool: 'a', label: 'Analyzing the document structure', status: 'success', resultSummary: '8 sections' },
      { tool: 'b', label: 'Searching the document for "x"', status: 'error', resultSummary: 'error: bad regex' },
    ]);
    expect(note).toContain('already run earlier');
    expect(note).toContain('- Analyzing the document structure: 8 sections');
    expect(note).toContain('- Searching the document for "x" [error]: error: bad regex');
  });

  it('returns an empty string when there is nothing to carry forward', () => {
    expect(formatTraceForContext([])).toBe('');
  });
});
