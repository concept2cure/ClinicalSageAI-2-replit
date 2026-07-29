/**
 * Tests for regulatory guidance retrieval — the prompt formatter and the
 * fail-soft semantics (retrieval never throws, never fabricates). The pgvector
 * query and embedding client are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const embedMock = vi.fn();
const queryMock = vi.fn();

vi.mock('../../db/runtime', () => ({
  getPool: () => ({ query: queryMock }),
}));
vi.mock('../enhancedEmbeddingService', () => ({
  getEmbeddingService: () => ({ embed: embedMock }),
}));

import { retrieveGuidance, formatGuidanceForPrompt } from '../regulatory-guidance-retrieval';

describe('regulatory-guidance-retrieval', () => {
  beforeEach(() => {
    embedMock.mockReset();
    queryMock.mockReset();
    embedMock.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns mapped guidance snippets from the corpus', async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: 7,
          title: 'FDA Guidance: Clinical Evidence',
          source: 'FDA',
          entry_type: 'GUIDELINE',
          content: 'Adequate and well-controlled studies...',
          similarity: '0.82',
        },
      ],
    });
    const out = await retrieveGuidance('claim defensibility', { organizationId: 5 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: '7', source: 'FDA', entryType: 'GUIDELINE', similarity: 0.82 });
  });

  it('returns [] for an empty query without hitting the DB', async () => {
    const out = await retrieveGuidance('   ');
    expect(out).toEqual([]);
    expect(embedMock).not.toHaveBeenCalled();
  });

  it('fails soft (returns []) when embedding/DB throws — never fabricates', async () => {
    embedMock.mockRejectedValue(new Error('no OpenAI key'));
    const out = await retrieveGuidance('regulatory route viability');
    expect(out).toEqual([]);
  });

  it('formats snippets into a citable prompt block, empty string when none', () => {
    expect(formatGuidanceForPrompt([])).toBe('');
    const block = formatGuidanceForPrompt([
      { id: '1', title: 'ICH E6(R2)', source: 'ICH', entryType: 'GUIDELINE', excerpt: 'GCP...', similarity: 0.9 },
    ]);
    expect(block).toMatch(/\[G1\]/);
    expect(block).toMatch(/ICH E6/);
  });
});
