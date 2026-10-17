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

const { mockQuery, getGateway, getEmbeddingService, resolveIds, createDraftCandidate, searchPassages, loadSource, resolveVault } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  getGateway: vi.fn(),
  getEmbeddingService: vi.fn(),
  resolveIds: vi.fn(),
  searchPassages: vi.fn(), loadSource: vi.fn(), resolveVault: vi.fn(),
  // The rest parameter is what gives the mock a call signature: with a
  // zero-arg implementation its recorded calls type as the empty tuple, so
  // neither the spread below nor a positional read of mock.calls compiles.
  createDraftCandidate: vi.fn(async (..._a: unknown[]) => ({ id: 'draft-1', expiresAt: 'later' })),
}));

vi.mock('../../db', () => ({
  pool: { query: (...a: unknown[]) => mockQuery(...a) },
  getPool: () => ({ query: (...a: unknown[]) => mockQuery(...a) }),
  query: (...a: unknown[]) => mockQuery(...a),
  // The real router verifies the numeric JWT principal and reads this owned
  // membership; source readers and providers remain isolated unit doubles.
  db: { select: () => {
    const chain = { from: () => chain, leftJoin: () => chain, where: () => chain,
      limit: async () => [{ role: 'member', orgUuid: '77777777-7777-4777-8777-777777777777' }] };
    return chain;
  } },
}));
vi.mock('../../services/ai-gateway/gateway.js', () => ({ getGateway }));
vi.mock('../../services/enhancedEmbeddingService.js', () => ({ getEmbeddingService }));
vi.mock('../../services/vault/document-passage-search.js', () => ({ searchDocumentPassages: searchPassages }));
vi.mock('../../services/vault/document-catalog.service.js', () => ({ loadDocumentForOrg: loadSource }));
vi.mock('../../services/clinical-regulatory-evidence/retrieval-source-link.js', () => ({
  resolveEvidenceSourceIdsByArtifact: (...a: unknown[]) => resolveIds(...a),
  resolveEvidenceSourceIdsByVaultDocuments: (...a: unknown[]) => resolveVault(...a),
}));
vi.mock('../../services/clinical-regulatory-evidence/draft-candidate-store.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/clinical-regulatory-evidence/draft-candidate-store.js')>()),
  createDraftCandidate: (...a: unknown[]) => createDraftCandidate(...a),
}));
// This file isolates structured-envelope plumbing. Fresh project admission is
// exercised through actual SQL/HTTP in authoringAssemblyDraftSafety.pglite.test.
vi.mock('../../services/ana/project-scope-admission', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/ana/project-scope-admission')>()),
  admitAnaProjectScope: async (_q: unknown, input: { projectRef: string }) => ({ projectId: 42, programId: input.projectRef, projectRef: input.projectRef }),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-authoring-structured';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import { runWithTenantScope } from '../../db/tenantStore';
import router from '../authoring.router';

const ORG_UUID = '77777777-7777-4777-8777-777777777777';
const PROGRAM = '88888888-8888-4888-8888-888888888888';
const DOC_A = '11111111-1111-4111-8111-111111111111';
const DOC_B = '22222222-2222-4222-8222-222222222222';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ sub: '5', type: 'access', organizationId: 7, email: 'author@test.co' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
  return `Bearer ${token}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  // In production every /api request passes the global auth boundary, which
  // opens the session's tenant scope before this router runs; the draft's
  // retrieval takes its tenant key from that scope (server/db/currentTenant.ts).
  app.use((req, _res, next) => {
    Object.assign(req, { dbClient: { query: (...args: unknown[]) => mockQuery(...args) } });
    return runWithTenantScope(
      { tenantId: '7', orgUuid: ORG_UUID, role: 'member', source: 'request', caller: 'authoring-structured.test' },
      () => next()
    );
  });
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
        rows: [{ id: 'S1', doc_id: 'D1', code: '3.2.S', title: 'Drug Substance', content: '', order_index: 0, module: 'M3', product_code: 'ABC-123', client_program_id: PROGRAM }],
      };
    }
    return { rowCount: 0, rows: [] };
  });
}

// Two retrieved chunks: SRC-1 ↔ artifact 'art-1', SRC-2 ↔ 'art-2'.
function retrievalWithTwoSources() {
  searchPassages.mockResolvedValue({ hits: [
    { documentId: DOC_A, text: 'Chunk one text.', documentTitle: 'Doc A', locator: null },
    { documentId: DOC_B, text: 'Chunk two text.', documentTitle: 'Doc B', locator: null },
  ], coverage: null, ranking: 'text' });
  loadSource.mockImplementation(async (id: string) => ({ id, programId: PROGRAM, contentHash: 'a'.repeat(64), version: '1', catalog: { contentHash: 'a'.repeat(64), status: 'extracted' } }));
  resolveVault.mockResolvedValue(new Map([[DOC_A, 101], [DOC_B, 202]]));
  resolveIds.mockResolvedValue(new Map([['cre_source:101', 101], ['cre_source:202', 202]]));
}

describe('authoring AI-draft — structured generation (Phase 4b)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    getGateway.mockReset();
    getEmbeddingService.mockReset();
    resolveIds.mockReset();
    searchPassages.mockReset();
    loadSource.mockReset();
    resolveVault.mockReset();
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
    const sourceExecutor = searchPassages.mock.calls[0][0];
    expect(sourceExecutor).toEqual(expect.objectContaining({ query: expect.any(Function) }));
    expect(searchPassages).toHaveBeenCalledWith(sourceExecutor, expect.objectContaining({ userId: 5, organizationId: 7 }), { limit: 5, programId: PROGRAM });
    for (const documentId of [DOC_A, DOC_B]) {
      expect(loadSource).toHaveBeenCalledWith(documentId, 7, { executor: sourceExecutor, userId: 5, programId: PROGRAM, currentOnly: true });
    }
    const call = createDraftCandidate.mock.calls[0];
    expect(call[4]).toBe('5');
    expect(call[6]).toMatchObject({ vaultSources: { programId: PROGRAM, retrievedBy: 5 } });
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
