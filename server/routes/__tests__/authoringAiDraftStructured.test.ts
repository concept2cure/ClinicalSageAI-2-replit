/**
 * Authoring AI-draft — structured generation → parked paraphrase assertions
 * (source-attribution Phase 4b).
 *
 * The draft endpoint now asks the model for a JSON envelope
 * `{ content, attributions: [{ quote, src }] }`, maps each SRC-n back to the
 * canonical cre_evidence_sources.id of the chunk at that position, and parks the
 * resulting {quote, sourceId} claims with the draft. This pins two things:
 *   - a well-formed envelope maps SRC-n → source id, drops out-of-range claims,
 *     and parks the rest as assertions;
 *   - a NON-JSON response degrades to plain prose with no assertions, so a
 *     malformed model reply can never break drafting.
 *
 * The heavy attribution logic is proven elsewhere; here we assert the wiring by
 * capturing what createDraftCandidate is asked to park.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, getGateway, getEmbeddingService, resolveIds, createDraftCandidate } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  getGateway: vi.fn(),
  getEmbeddingService: vi.fn(),
  resolveIds: vi.fn(),
  // The rest parameter is what gives the mock a call signature: with a
  // zero-arg implementation its recorded calls type as the empty tuple, so
  // neither the spread below nor a positional read of mock.calls compiles.
  createDraftCandidate: vi.fn(async (..._a: unknown[]) => ({ id: 'draft-1', expiresAt: 'later' })),
}));

vi.mock('../../db', () => ({
  pool: { query: (...a: unknown[]) => mockQuery(...a) },
  getPool: () => ({ query: (...a: unknown[]) => mockQuery(...a) }),
  query: (...a: unknown[]) => mockQuery(...a),
  db: {},
}));
vi.mock('../../services/ai-gateway/gateway.js', () => ({ getGateway }));
vi.mock('../../services/enhancedEmbeddingService.js', () => ({ getEmbeddingService }));
vi.mock('../../services/clinical-regulatory-evidence/retrieval-source-link.js', () => ({
  resolveEvidenceSourceIdsByArtifact: (...a: unknown[]) => resolveIds(...a),
}));
vi.mock('../../services/clinical-regulatory-evidence/draft-candidate-store.js', () => ({
  createDraftCandidate: (...a: unknown[]) => createDraftCandidate(...a),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-authoring-structured';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ sub: 'u1', organizationId: 7, email: 'author@test.co' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
  return `Bearer ${token}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

function sectionExists() {
  mockQuery.mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('d.status')) return { rowCount: 1, rows: [{ status: null }] }; // edit guard
    if (s.includes('authoring_sections')) {
      return {
        rowCount: 1,
        rows: [{ id: 'S1', doc_id: 'D1', code: '3.2.S', title: 'Drug Substance', content: '', order_index: 0, module: 'M3', product_code: 'ABC-123' }],
      };
    }
    return { rowCount: 0, rows: [] };
  });
}

// Two retrieved chunks: SRC-1 ↔ artifact 'art-1', SRC-2 ↔ 'art-2'.
function retrievalWithTwoSources() {
  getEmbeddingService.mockReturnValue({
    searchHybrid: async () => [
      { id: 'a1', content: 'Chunk one text.', title: 'Doc A', sourceId: 'art-1', score: 1 },
      { id: 'a2', content: 'Chunk two text.', title: 'Doc B', sourceId: 'art-2', score: 1 },
    ],
  });
  resolveIds.mockResolvedValue(new Map([['art-1', 101], ['art-2', 202]]));
}

describe('authoring AI-draft — structured generation (Phase 4b)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    getGateway.mockReset();
    getEmbeddingService.mockReset();
    resolveIds.mockReset();
    createDraftCandidate.mockClear();
  });

  it('parks the model’s SRC-mapped paraphrase assertions from a JSON envelope', async () => {
    sectionExists();
    retrievalWithTwoSources();
    getGateway.mockReturnValue({
      getEnabledProviders: () => ['anthropic'],
      route: async () => ({
        content: JSON.stringify({
          content: 'Sentence from A. Sentence from B. My own analysis.',
          attributions: [
            { quote: 'Sentence from A.', src: 1 },
            { quote: 'Sentence from B.', src: 2 },
            { quote: 'A ghost citation.', src: 9 }, // out of range — must be dropped
          ],
        }),
        model: 'claude-x',
        provider: 'anthropic',
      }),
    });

    const res = await request(makeApp())
      .post('/api/authoring/sections/S1/ai/draft')
      .set('Authorization', await bearer())
      .send({ region: 'FDA' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.draft?.draftId).toBe('draft-1');

    // createDraftCandidate(tenantId, sectionId, content, sources, actor, exec, generator, assertions)
    expect(createDraftCandidate).toHaveBeenCalledTimes(1);
    const call = createDraftCandidate.mock.calls[0];
    expect(call[2]).toBe('Sentence from A. Sentence from B. My own analysis.'); // clean prose, no [SRC-n]
    expect(call[7]).toEqual([
      { quote: 'Sentence from A.', sourceId: 101 },
      { quote: 'Sentence from B.', sourceId: 202 },
    ]);
  });

  it('degrades to plain prose with no assertions when the model does not return JSON', async () => {
    sectionExists();
    retrievalWithTwoSources();
    getGateway.mockReturnValue({
      getEnabledProviders: () => ['anthropic'],
      route: async () => ({
        content: 'Just some prose, not JSON at all.',
        model: 'claude-x',
        provider: 'anthropic',
      }),
    });

    const res = await request(makeApp())
      .post('/api/authoring/sections/S1/ai/draft')
      .set('Authorization', await bearer())
      .send({ region: 'FDA' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const call = createDraftCandidate.mock.calls[0];
    expect(call[2]).toBe('Just some prose, not JSON at all.'); // raw response used as content
    expect(call[7]).toEqual([]); // no assertions
  });
});
