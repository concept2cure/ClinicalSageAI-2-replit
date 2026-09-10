/**
 * GraphRAG entity extraction — a keyword sweep must not enter the knowledge
 * graph looking like a model extraction.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * `extractEntities` has two paths. The model path runs the extraction prompt
 * over the document. The fallback, `fallbackEntityExtraction`, is a HARDCODED
 * list of 15 drug names, 14 disease names and 16 gene symbols matched by regex;
 * it cannot find an entity outside those 45 strings, and it returns no
 * relationships at all.
 *
 * Both wrote to knowledge_graph_nodes with `metadata: {}`, so nothing recorded
 * which had run. Worse, the lexicon path stamped `confidence: 0.8` while the
 * model path defaulted to `0.7` — a substring match on the literal token
 * "aspirin" outranked everything the model actually read. Any downstream reader
 * ranking by confidence would systematically prefer the keyword matches.
 *
 * For a regulatory knowledge graph over customer documents that is a
 * fabrication risk rather than a quality one: the graph asserted entity
 * findings it had not made.
 *
 * Three ways the fallback could be reached silently, all of them now explicit:
 * no API key, a thrown error, and — the one with no error at all — a non-200
 * whose body has no `choices`, which
 * `JSON.parse(… || '{"entities":[],"relationships":[]}')` turned into a
 * successful extraction that found nothing.
 *
 * The same change routed the call through the governed AI gateway (WO-6): it
 * had been posting up to 8,000 characters of ingested regulatory document text
 * straight to the provider, where the gateway's PII/PHI screen never saw it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { completeSpy } = vi.hoisted(() => ({ completeSpy: vi.fn() }));

vi.mock('../../lib/unified-ai-client', () => ({
  aiComplete: completeSpy,
  ai: { complete: completeSpy },
  default: { complete: completeSpy },
}));

vi.mock('pg', () => ({
  Pool: class {
    query = vi.fn().mockResolvedValue({ rows: [] });
  },
}));

const { __testing } = await import('../graphrag');

/** Text containing tokens the lexicon knows, so the fallback returns something. */
const DOC = 'Patient received pembrolizumab for melanoma; BRCA1 status was assessed.';

beforeEach(() => {
  completeSpy.mockReset();
});

describe('extractEntities records how each entity was found', () => {
  it('stamps model-extracted entities as extraction: model', async () => {
    completeSpy.mockResolvedValue(
      JSON.stringify({
        entities: [{ type: 'drug', name: 'pembrolizumab', confidence: 0.9 }],
        relationships: [{ type: 'TREATS', confidence: 0.8, evidence: 'received for melanoma' }],
      }),
    );

    const out = await __testing.extractEntities(DOC);

    expect(out.method).toBe('model');
    expect(out.entities[0]?.metadata).toMatchObject({ extraction: 'model' });
    expect(out.relationships[0]?.metadata).toMatchObject({ extraction: 'model' });
  });

  it('stamps lexicon hits as extraction: lexicon when the call throws', async () => {
    completeSpy.mockRejectedValue(new Error('gateway unavailable'));

    const out = await __testing.extractEntities(DOC);

    expect(out.method).toBe('lexicon');
    expect(out.entities.length).toBeGreaterThan(0);
    for (const e of out.entities) expect(e.metadata).toMatchObject({ extraction: 'lexicon' });
  });

  it('falls back rather than reporting an empty extraction on an unusable reply', async () => {
    // The provider-error shape: a body with no usable content. The old code
    // parsed the `||` default and returned zero entities as a SUCCESS, so an
    // outage looked exactly like a document containing nothing of interest.
    completeSpy.mockResolvedValue('');

    const out = await __testing.extractEntities(DOC);

    expect(out.method).toBe('lexicon');
    expect(out.entities.length).toBeGreaterThan(0);
  });

  it('falls back when the reply parses but carries no entities array', async () => {
    completeSpy.mockResolvedValue(JSON.stringify({ error: 'rate limited' }));

    const out = await __testing.extractEntities(DOC);
    expect(out.method).toBe('lexicon');
  });

  it('scores a lexicon hit BELOW every model default', async () => {
    completeSpy.mockRejectedValue(new Error('down'));
    const lexicon = await __testing.extractEntities(DOC);

    completeSpy.mockResolvedValue(
      JSON.stringify({ entities: [{ type: 'drug', name: 'pembrolizumab' }], relationships: [] }),
    );
    const model = await __testing.extractEntities(DOC);

    // 0.7 is the model path's default when the model omits a confidence — the
    // weakest model result there is. A 45-word substring match must not beat it.
    const lexiconMax = Math.max(...lexicon.entities.map(e => e.confidence ?? 0));
    const modelDefault = model.entities[0]?.confidence ?? 0;
    expect(lexiconMax).toBeLessThan(modelDefault);
  });

  /**
   * The success path must still be able to return nothing. A document with no
   * entities in it is a legitimate result, and a fallback that fired on every
   * empty extraction would flood the graph with keyword matches from documents
   * the model had correctly read as containing no entities.
   */
  it('accepts a genuinely empty model result without falling back', async () => {
    completeSpy.mockResolvedValue(JSON.stringify({ entities: [], relationships: [] }));

    const out = await __testing.extractEntities(DOC);

    expect(out.method).toBe('model');
    expect(out.entities).toHaveLength(0);
  });

  it('caps the document text sent to the provider', async () => {
    completeSpy.mockResolvedValue(JSON.stringify({ entities: [], relationships: [] }));

    await __testing.extractEntities('x'.repeat(50_000));

    const user = completeSpy.mock.calls[0][0].messages.find(
      (m: { role: string }) => m.role === 'user',
    );
    expect(user.content.length).toBeLessThanOrEqual(8_000);
  });
});
