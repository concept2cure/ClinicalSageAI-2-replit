/**
 * Authoring AI-draft — template-fallback honesty.
 *
 * When no AI provider is enabled the /ai/draft endpoint falls back to a
 * hardcoded section skeleton. That fallback used to report success:true and
 * "Draft template generated successfully", which told the caller a model had
 * produced compliance-ready content when in fact it returned a static template
 * with bracketed placeholders. This pins the honest contract: the fallback no
 * longer reports plain success, and it marks itself degraded / source=template
 * so callers know it was not model-generated.
 *
 * The router carries its own §11 JWT gate, so the test signs a real HS256 token
 * with the test secret rather than stubbing auth. A non-numeric subject means
 * the live org-membership re-check is skipped (no numeric membership to check).
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, getGateway, getEmbeddingService } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  // No enabled providers → the endpoint never generates via AI and must fall
  // through to the hardcoded-template path.
  getGateway: vi.fn(() => ({ getEnabledProviders: () => [] as string[] })),
  // Data Room retrieval returns nothing (and is non-fatal regardless).
  getEmbeddingService: vi.fn(() => ({ searchHybrid: async () => [] as unknown[] })),
}));

vi.mock('../../db', () => ({
  pool: { query: (...a: unknown[]) => mockQuery(...a) },
  getPool: () => ({ query: (...a: unknown[]) => mockQuery(...a) }),
  query: (...a: unknown[]) => mockQuery(...a),
  db: {},
}));
vi.mock('../../services/ai-gateway/gateway.js', () => ({ getGateway }));
vi.mock('../../services/enhancedEmbeddingService.js', () => ({ getEmbeddingService }));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-authoring-draft';
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

describe('authoring AI-draft — template fallback honesty', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    getGateway.mockClear();
    getEmbeddingService.mockClear();
  });

  it('does NOT report plain success on the hardcoded-template fallback path', async () => {
    mockQuery.mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes('FROM authoring_sections')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'S1',
              doc_id: 'D1',
              code: '3.2.S',
              title: 'Drug Substance',
              content: '',
              order_index: 0,
              module: 'M3',
              product_code: 'ABC-123',
            },
          ],
        };
      }
      return { rowCount: 0, rows: [] };
    });

    const res = await request(makeApp())
      .post('/api/authoring/sections/S1/ai/draft')
      .set('Authorization', await bearer())
      .send({ region: 'FDA' });

    expect(res.status).toBe(200);
    // The fallback must not masquerade as a model-generated draft.
    expect(res.body.success).not.toBe(true);
    // It marks itself as a degraded, template-sourced result.
    expect(res.body.degraded).toBe(true);
    expect(res.body.source).toBe('template');
    // The old "generated successfully" wording is gone.
    expect(String(res.body.message)).not.toMatch(/generated successfully/i);
    // The skeleton is still returned so a caller may adopt it knowingly.
    expect(typeof res.body.draft?.content).toBe('string');
    expect(res.body.draft?.metadata?.model).toBe('template-based');
  });
});
