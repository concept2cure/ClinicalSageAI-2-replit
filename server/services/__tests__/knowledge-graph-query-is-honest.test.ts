/**
 * The biostatistics knowledge graph reports what it found, not a figure it made up.
 *
 * ── The defects ──────────────────────────────────────────────────────────────
 * `queryGraph` is two model calls around three deterministic lookups, and it
 * misreported all three ways it can go wrong:
 *
 *   1. It returned `confidence = Math.min(0.95, 0.5 + nodes.length * 0.05)`.
 *      That is a count of matched rows rescaled to look like a probability. A
 *      sponsor reading "confidence 0.85" beside a regulatory-precedent answer
 *      is reading the number 7, with no calibration behind it of any kind.
 *      CLAUDE.md RULE 2: numbers come from deterministic engines. This one came
 *      from a formula chosen to land in [0.1, 0.95].
 *
 *   2. The query parser's failure was swallowed. `ai.complete` rejecting fell
 *      back to `{ searchTerms: [], nodeTypes: [] }`, which matches no node, so
 *      an outage came out as a successful query that found nothing — an error
 *      rendered as an empty result. The graph could hold every answer and the
 *      sponsor would be told there was none.
 *
 *   3. The synthesis failure threw away the deterministic part. The nodes and
 *      edges are real DB rows; the prose is narration over them. A rejecting
 *      narration call rejected the whole query, so the sponsor lost the rows
 *      too.
 *
 * Added 2026-10-13 alongside the knowledge-graph panel, which is the first
 * client code to reach any of these routes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTableName } from 'drizzle-orm';

const S = vi.hoisted(() => ({
  complete: vi.fn(),
  nodeRows: [] as Array<Record<string, unknown>>,
  edgeRows: [] as Array<Record<string, unknown>>,
  wheres: 0,
}));

/**
 * A drizzle chain whose `.where()` is both awaitable and `.limit()`-able,
 * because the service uses it both ways.
 */
function rowsFor(table: unknown) {
  // Match the suffix, not a substring: "knowledge" itself ends in "edge".
  return getTableName(table as Parameters<typeof getTableName>[0]).endsWith('_edges') ? S.edgeRows : S.nodeRows;
}

vi.mock('../../db', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          S.wheres += 1;
          const rows = rowsFor(table);
          return Object.assign(Promise.resolve(rows), { limit: async () => rows });
        },
      }),
    }),
  },
}));
vi.mock('../../lib/unified-ai-client', () => ({ ai: { complete: S.complete } }));

import service from '../biostat-knowledge-graph-service';

const PARSED = JSON.stringify({
  nodeTypes: ['statistical_method'],
  searchTerms: ['MMRM'],
  edgeTypes: ['method_used_for_endpoint'],
  intent: 'find_methods',
});

const NODE = {
  id: 7,
  nodeType: 'statistical_method',
  name: 'MMRM',
  description: null,
  properties: {},
  sourceCount: 2,
};

/** The extraction call resolves, then the synthesis call. */
function aiAnswers({ parse, synth }: { parse?: string | Error; synth?: string | Error }) {
  let n = 0;
  S.complete.mockImplementation(async () => {
    n += 1;
    const v = n === 1 ? parse : synth;
    if (v instanceof Error) throw v;
    return v ?? '';
  });
}

beforeEach(() => {
  S.complete.mockReset();
  S.nodeRows = [NODE];
  S.edgeRows = [];
  S.wheres = 0;
});

describe('queryGraph', () => {
  it('control — a parsed query returns the rows it matched', async () => {
    aiAnswers({ parse: PARSED, synth: 'MMRM is used for repeated measures.' });
    const r = await service.queryGraph('what method for HbA1c', 9);
    expect(r.nodes).toHaveLength(1);
    expect(r.answer).toBe('MMRM is used for repeated measures.');
  });

  it('reports no "confidence": a matched-row count is not a probability', async () => {
    aiAnswers({ parse: PARSED, synth: 'Narration.' });
    const r = await service.queryGraph('what method for HbA1c', 9);
    expect(r).not.toHaveProperty('confidence');
  });

  it('reports the counts it actually has, and they are counts', async () => {
    aiAnswers({ parse: PARSED, synth: 'Narration.' });
    const r = await service.queryGraph('what method for HbA1c', 9);
    expect(r.matchedNodeCount).toBe(r.nodes.length);
    expect(r.matchedEdgeCount).toBe(r.edges.length);
    expect(Number.isInteger(r.matchedNodeCount)).toBe(true);
  });

  it('says the answer is narration over the rows, not a derived figure', async () => {
    aiAnswers({ parse: PARSED, synth: 'Narration.' });
    const r = await service.queryGraph('q', 9);
    expect(r.answerIsNarration).toBe(true);
  });

  /* ── 2. A failed parser is not an empty graph ───────────────────────────── */

  it('a failed query parser still searches, on the sponsor\'s own words', async () => {
    aiAnswers({ parse: new Error('upstream 503'), synth: 'Narration.' });
    const r = await service.queryGraph('MMRM', 9);
    expect(S.wheres).toBeGreaterThan(0);
    expect(r.nodes).toHaveLength(1);
  });

  it('a failed query parser is reported, so "nothing matched" is never its disguise', async () => {
    aiAnswers({ parse: new Error('upstream 503'), synth: 'Narration.' });
    const r = await service.queryGraph('MMRM', 9);
    expect(r.parsedByModel).toBe(false);
    expect(r.parseNote).toMatch(/not.*(parsed|run)|fell back/i);
  });

  it('a successful parse says so', async () => {
    aiAnswers({ parse: PARSED, synth: 'Narration.' });
    const r = await service.queryGraph('q', 9);
    expect(r.parsedByModel).toBe(true);
  });

  /* ── 3. A failed narration does not discard the real rows ──────────────── */

  it('a failed narration keeps the rows and says the prose is missing', async () => {
    aiAnswers({ parse: PARSED, synth: new Error('upstream 503') });
    const r = await service.queryGraph('q', 9);
    expect(r.nodes).toHaveLength(1);
    expect(r.answer).toBeNull();
    expect(r.answerUnavailableReason).toMatch(/\S/);
  });

  it('an empty narration is null, never the string "No answer could be generated."', async () => {
    aiAnswers({ parse: PARSED, synth: '' });
    const r = await service.queryGraph('q', 9);
    expect(r.answer).toBeNull();
    expect(r.answerUnavailableReason).toMatch(/\S/);
  });

  /* ── 4. An empty question is refused before a model is paid for it ──────── */

  it('refuses an empty query instead of asking a model about nothing', async () => {
    aiAnswers({ parse: PARSED, synth: 'Narration.' });
    await expect(service.queryGraph('   ', 9)).rejects.toMatchObject({ name: 'ComputationRefusal' });
    expect(S.complete).not.toHaveBeenCalled();
  });
});
