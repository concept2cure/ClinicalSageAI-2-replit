/**
 * AnA's endpoint commands report what was read and what was not. They never
 * report a score a language model typed.
 *
 * ── What the commands used to say (until 2026-10-15) ────────────────────────
 * recommend_endpoints answered `success: true` with "Generated N endpoint
 * recommendation(s) for X", whatever had been read. The recommender swallowed
 * an unreadable CSR corpus into an empty list and backfilled it from the model,
 * so a corpus outage read as N model endpoints, or "Generated 0", with nothing
 * saying the corpus was never read.
 *
 * evaluate_endpoint answered `Endpoint "X" scored N/100 for Y`, where N was a
 * number the model typed with no rubric behind it (CLAUDE.md Rule 2).
 *
 * The real recommender runs behind the commands. Its database, the literature
 * search and the model are doubles.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { hf, academic, holder } = vi.hoisted(() => ({
  hf: { queryHuggingFace: vi.fn() },
  academic: { searchAcademicKnowledge: vi.fn(), getRecentlyProcessedDocuments: vi.fn() },
  holder: { db: null as unknown },
}));
const dbDouble = vi.hoisted(() => ({
  get db() { return holder.db; },
  pool: { query: async () => ({ rows: [], rowCount: 0 }) },
  getPool: () => ({ query: async () => ({ rows: [], rowCount: 0 }) }),
  getDb: () => holder.db,
}));
vi.mock('../../../db', () => dbDouble);
vi.mock('../../../db.js', () => dbDouble);
vi.mock('../../../huggingface-service', () => ({ huggingFaceService: hf }));
vi.mock('../../academic-document-processor', () => ({ academicDocumentProcessor: academic }));

import { recommendEndpoints, evaluateEndpoint } from '../command-executor';

const ctx = { userId: 41, organizationId: 7 } as Parameters<typeof recommendEndpoints>[0];

function emptyCorpus() {
  const chain: Record<string, unknown> = {};
  for (const step of ['from', 'where', 'orderBy', 'limit', 'innerJoin']) chain[step] = () => chain;
  chain.then = (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve([]).then(resolve, reject);
  return { select: () => chain };
}

beforeEach(() => {
  vi.clearAllMocks();
  holder.db = emptyCorpus();
  academic.searchAcademicKnowledge.mockResolvedValue([]);
  academic.getRecentlyProcessedDocuments.mockReturnValue([{ id: 'doc-1' }]); // a loaded literature store
  hf.queryHuggingFace.mockResolvedValue('["Change from baseline in eGFR at month 12"]');
});

describe('recommend_endpoints', () => {
  it('says the CSR corpus could not be read, instead of reporting what the model generated', async () => {
    holder.db = {
      select: () => {
        throw new Error('relation "csr_reports" does not exist');
      },
    };

    const result = await recommendEndpoints(ctx, { indication: 'Fabry disease' });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/could not read the CSR endpoint corpus/i);
  });

  it('says which recommendations a language model proposed and which sources were unavailable', async () => {
    academic.searchAcademicKnowledge.mockRejectedValue(new Error('embedding service down'));

    const result = await recommendEndpoints(ctx, { indication: 'Fabry disease' });

    expect(result.success).toBe(true);
    expect(result.message).not.toMatch(/^Generated/);
    expect(result.message).toMatch(/1 proposed by a language model with no corpus evidence/);
    expect(result.message).toMatch(/literature search unavailable \(the literature search failed\)/);
    expect(result.message).toMatch(/CSR corpus no matches/);
  });
});

describe('evaluate_endpoint', () => {
  it('reports no score, rather than the number the model typed', async () => {
    hf.queryHuggingFace.mockResolvedValue('{"score": 72, "feedback": "Clear and measurable."}');

    const result = await evaluateEndpoint(ctx, {
      endpoint: 'Overall survival at 24 months',
      indication: 'Non-small cell lung cancer',
    });

    expect(result.success).toBe(true);
    expect(result.message).not.toMatch(/scored \d|\/100/);
    expect(result.message).toMatch(/not scored/i);
    expect((result.data as { evaluation: { score: unknown } }).evaluation.score).toBeNull();
  });

  it('fails when the model request fails, instead of succeeding with an error message as feedback', async () => {
    hf.queryHuggingFace.mockRejectedValue(new Error('AI gateway unavailable'));

    const result = await evaluateEndpoint(ctx, {
      endpoint: 'Overall survival at 24 months',
      indication: 'Non-small cell lung cancer',
    });

    expect(result.success).toBe(false);
  });
});
