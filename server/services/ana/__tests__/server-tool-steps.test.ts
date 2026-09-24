/**
 * A web search AnA ran appears in her work trace, and says only what is true.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * The gateway dropped server-tool blocks, so a turn that searched the web looked
 * exactly like one that did not. The answer still carried citations — which made
 * it worse: the sources were present while the step that found them was absent,
 * so the trace looked complete and was wrong. The gateway now collects the
 * blocks; this module decides what the trace SAYS about them.
 *
 * ── The two ways to get it wrong ──────────────────────────────────────────────
 *  1. Fabrication. A label naming a search term nobody searched for, or a
 *     source list padded out from a result shape we do not recognise, is an
 *     invented record in the one place a reviewer trusts to be literal.
 *  2. A long list presented as complete. If eight of thirty results are shown,
 *     the trace must say twenty-two were left out.
 */
import { describe, it, expect } from 'vitest';

import {
  describeServerToolStep,
  summariseServerToolResult,
  MAX_LISTED_SOURCES,
} from '../server-tool-steps.js';

describe('the label says what was actually done', () => {
  it('names the query a web search used', () => {
    expect(describeServerToolStep({ name: 'web_search', input: { query: 'FDA Q8(R2) 2026' } })).toBe(
      'Searching the web for "FDA Q8(R2) 2026"',
    );
  });

  it('names the page a web fetch read', () => {
    expect(describeServerToolStep({ name: 'web_fetch', input: { url: 'https://fda.gov/q8' } })).toBe(
      'Reading https://fda.gov/q8',
    );
  });

  it('does NOT invent a query it was never given', () => {
    // The result block can arrive without its use (the gateway records an
    // unmatched result rather than dropping it), so there may be no input at
    // all. "Searching the web for undefined" — or worse, a guessed term — would
    // be a fabricated record.
    expect(describeServerToolStep({ name: 'web_search' })).toBe('Searching the web');
    expect(describeServerToolStep({ name: 'web_search', input: { query: '   ' } })).toBe('Searching the web');
    expect(describeServerToolStep({ name: 'web_fetch', input: {} })).toBe('Reading a web page');
  });

  it('describes an unfamiliar server tool plainly rather than guessing at it', () => {
    expect(describeServerToolStep({ name: 'code_execution' })).toBe('Running code_execution');
  });
});

describe('the summary records what was consulted, not its text', () => {
  it('lists the sources a search returned', () => {
    const s = summariseServerToolResult({
      name: 'web_search',
      result: [
        { type: 'web_search_result', url: 'https://fda.gov/q8', title: 'Q8(R2)', encrypted_content: 'x' },
        { type: 'web_search_result', url: 'https://ich.org/q8', title: 'ICH Q8' },
      ],
    });
    expect(s).toEqual({
      ok: true,
      tool: 'web_search',
      sources: [
        { title: 'Q8(R2)', url: 'https://fda.gov/q8' },
        { title: 'ICH Q8', url: 'https://ich.org/q8' },
      ],
      omitted: 0,
    });
  });

  it('keeps a fetched document out of the trace, and keeps its source', () => {
    // A fetch returns the whole page. The trace needs to know WHICH page, not
    // to carry its text through the event stream on every read.
    const s = summariseServerToolResult({
      name: 'web_fetch',
      result: {
        type: 'web_fetch_result',
        url: 'https://fda.gov/q8',
        document: { title: 'Q8(R2) Guidance', source: { type: 'text', data: 'a very long page…' } },
      },
    });
    expect(s).toEqual({
      ok: true,
      tool: 'web_fetch',
      sources: [{ title: 'Q8(R2) Guidance', url: 'https://fda.gov/q8' }],
      omitted: 0,
    });
    expect(JSON.stringify(s)).not.toContain('a very long page');
  });

  it('SAYS how many it left out, rather than presenting a long list as complete', () => {
    const results = Array.from({ length: MAX_LISTED_SOURCES + 5 }, (_, i) => ({
      url: `https://example.gov/${i}`,
      title: `Result ${i}`,
    }));
    const s = summariseServerToolResult({ name: 'web_search', result: results });
    expect(s.ok && s.sources).toHaveLength(MAX_LISTED_SOURCES);
    expect(s.ok && s.omitted).toBe(5);
  });

  it('lists nothing — rather than a guess — for a shape it does not recognise', () => {
    // Fabricating a source out of an unfamiliar payload is the failure this
    // module is shaped around. An empty list is honest; an invented one is not.
    const s = summariseServerToolResult({ name: 'web_search', result: [{ foo: 'bar' }, 42, null] });
    expect(s).toEqual({ ok: true, tool: 'web_search', sources: [], omitted: 0 });
  });

  it('lists nothing for a step whose result never arrived', () => {
    const s = summariseServerToolResult({ name: 'web_search', input: { query: 'x' } });
    expect(s).toEqual({ ok: true, tool: 'web_search', sources: [], omitted: 0 });
  });
});

describe('a failed server tool is reported as a failure', () => {
  it('carries the error code a failed search returned', () => {
    // A failed web search is an HTTP 200 with an error OBJECT where a success
    // would be a list. Nothing raised, so the shape is the whole signal.
    expect(
      summariseServerToolResult({
        name: 'web_search',
        isError: true,
        result: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' },
      }),
    ).toEqual({ ok: false, tool: 'web_search', errorCode: 'max_uses_exceeded' });
  });

  it('is still a failure when no code came with it', () => {
    expect(summariseServerToolResult({ name: 'web_fetch', isError: true, result: [] })).toEqual({
      ok: false,
      tool: 'web_fetch',
    });
  });

  it('never lists sources for a failed step', () => {
    // A failure that also showed sources would read as a partial success.
    const s = summariseServerToolResult({
      name: 'web_search',
      isError: true,
      result: [{ url: 'https://fda.gov/q8', title: 'Q8' }],
    });
    expect(s.ok).toBe(false);
    expect((s as any).sources).toBeUndefined();
  });
});

describe('the stream route puts the step in the trace, and closes it', () => {
  // Read from source: the route handler is ~2,300 lines behind a live gateway,
  // and what is at stake here is two properties of the wiring, not the handler.
  const STREAM = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', '..', '..', 'routes', 'ana-ri', 'stream.ts'),
    'utf8',
  ) as string;
  const HELPER = (() => {
    const start = STREAM.indexOf('const emitServerToolSteps =');
    return start === -1 ? '' : STREAM.slice(start, STREAM.indexOf('\n    };', start));
  })();

  it('emits for the first model call AND every agentic round', () => {
    // Server tools run INSIDE a model call, so each call that returns any must
    // report them. Only the first would miss every search after round one.
    expect(STREAM).toMatch(/emitServerToolSteps\(gwResponse, 1\);/);
    expect(STREAM).toMatch(/emitServerToolSteps\(roundResponse, round\);/);
  });

  it('emits the result right after the use, so the row never spins forever', () => {
    // The client opens a "running" row on tool_use and resolves it on the
    // matching tool_result. The work is already finished by the time we learn
    // of it, so emitting only the use would leave a spinner claiming work in
    // progress that is over.
    const useAt = HELPER.indexOf("type: 'tool_use'");
    const resultAt = HELPER.indexOf("type: 'tool_result'");
    expect(useAt).toBeGreaterThan(-1);
    expect(resultAt).toBeGreaterThan(useAt);
  });

  it('reports a failed search as a failure, not a success', () => {
    expect(HELPER).toMatch(/step\.isError \? 'error' : 'success'/);
  });

  it('forwards the summary, not the raw result', () => {
    // A fetch result is an entire document.
    expect(HELPER).toMatch(/summariseServerToolResult\(step\)/);
    expect(HELPER).not.toMatch(/result: JSON\.stringify\(step\.result\)/);
  });
});
