/**
 * Authoring AI-draft — a missing or failing provider is a refusal, never a
 * template (VSR-001 §8 F-10; URS-AUTH-012).
 *
 * POST /api/authoring/sections/:id/ai/draft used to answer HTTP 200
 * `success:false, degraded:true, source:'template'` carrying a full hardcoded
 * section skeleton when no AI provider was configured. A client that keyed on
 * the draft body — and the one in the product did — rendered it as a draft.
 * The working agreement is "fail closed, never fabricate": a deployment with
 * no enabled provider refuses with 503 GATEWAY_UNAVAILABLE (the same code AnA
 * answers with) and NO draft body; any other gateway failure refuses with its
 * own classified code; only a model-produced draft is ever returned, and it
 * says so with `source: 'model'`.
 *
 * The router carries its own §11 JWT gate, so the test signs a real HS256 token
 * with the test secret rather than stubbing auth. A non-numeric subject means
 * the live org-membership re-check is skipped (no numeric membership to check).
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, getGateway, getEmbeddingService, gatewayErrors } = vi.hoisted(() => {
  /* The gateway module is mocked, and gateway-error-map.ts imports its error
     classes from that same module — so the classes the route matches with
     `instanceof` are these, and the ones the tests throw must be these too. */
  class GatewayPolicyError extends Error {}
  class GatewayAbortedError extends Error {}
  class GatewayNoProviderError extends Error {}
  class GatewayAllProvidersFailedError extends Error {}
  return {
    mockQuery: vi.fn(),
    getGateway: vi.fn(),
    getEmbeddingService: vi.fn(() => ({ searchHybrid: async () => [] as unknown[] })),
    gatewayErrors: {
      GatewayPolicyError,
      GatewayAbortedError,
      GatewayNoProviderError,
      GatewayAllProvidersFailedError,
    },
  };
});

vi.mock('../../db', () => ({
  pool: { query: (...a: unknown[]) => mockQuery(...a) },
  getPool: () => ({ query: (...a: unknown[]) => mockQuery(...a) }),
  query: (...a: unknown[]) => mockQuery(...a),
  db: {},
}));
vi.mock('../../services/ai-gateway/gateway.js', () => ({ getGateway, ...gatewayErrors }));
vi.mock('../../services/enhancedEmbeddingService.js', () => ({ getEmbeddingService }));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-authoring-no-provider';
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
}

async function draft() {
  return request(makeApp())
    .post('/api/authoring/sections/S1/ai/draft')
    .set('Authorization', await bearer())
    .send({ region: 'FDA' });
}

/** The words the deleted fallback used — none of them may appear anywhere in a
 *  refusal, in any field. */
const TEMPLATE_MARKERS = /template|QUALITY OVERALL SUMMARY|\[Detailed information/i;

describe('authoring AI-draft — no provider / failing provider is a refusal', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    getGateway.mockReset();
    getEmbeddingService.mockClear();
    sectionExists();
  });

  it('no enabled provider → 503 GATEWAY_UNAVAILABLE and no draft body at all', async () => {
    getGateway.mockReturnValue({
      getEnabledProviders: () => [] as string[],
      route: vi.fn(async () => {
        throw new Error('route() must not be called with no provider');
      }),
    });

    const res = await draft();

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBe('GATEWAY_UNAVAILABLE');
    // No draft, no template, no "degraded" half-answer — nothing to adopt.
    expect(res.body).not.toHaveProperty('draft');
    expect(res.body).not.toHaveProperty('degraded');
    expect(res.body).not.toHaveProperty('source');
    expect(JSON.stringify(res.body)).not.toMatch(TEMPLATE_MARKERS);
    // The refusal names the deployment, not the network, so a user reads the
    // right cause.
    expect(String(res.body.error?.message)).toMatch(/no ai provider is configured/i);
  });

  it('a provider failure refuses with its classified code — never a template', async () => {
    getGateway.mockReturnValue({
      getEnabledProviders: () => ['anthropic'],
      route: async () => {
        throw new gatewayErrors.GatewayAllProvidersFailedError('anthropic: 429 rate limit exceeded');
      },
    });

    const res = await draft();

    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBe('RATE_LIMITED');
    expect(res.body).not.toHaveProperty('draft');
    expect(JSON.stringify(res.body)).not.toMatch(TEMPLATE_MARKERS);
  });

  it('a provider that answers with no content is INVALID_AI_RESPONSE, not a template', async () => {
    getGateway.mockReturnValue({
      getEnabledProviders: () => ['anthropic'],
      route: async () => ({ content: '', model: 'claude-x', provider: 'anthropic' }),
    });

    const res = await draft();

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBe('INVALID_AI_RESPONSE');
    expect(res.body).not.toHaveProperty('draft');
    expect(JSON.stringify(res.body)).not.toMatch(TEMPLATE_MARKERS);
  });

  it('a fault of ours (not the gateway) is a 500, still with no draft body', async () => {
    getGateway.mockReturnValue({
      getEnabledProviders: () => ['anthropic'],
      route: async () => {
        throw new TypeError('boom');
      },
    });

    const res = await draft();

    expect(res.status).toBe(500);
    // serverError's envelope: a stable code and a sentence, internals withheld.
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(res.body.success).not.toBe(true);
    expect(res.body).not.toHaveProperty('draft');
    expect(JSON.stringify(res.body)).not.toMatch(TEMPLATE_MARKERS);
  });

  it('a provider that drafts → 200 with the model draft, source "model"', async () => {
    getGateway.mockReturnValue({
      getEnabledProviders: () => ['anthropic'],
      route: async () => ({
        content: 'A drafted paragraph about the drug substance.',
        model: 'claude-x',
        provider: 'anthropic',
      }),
    });

    const res = await draft();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.source).toBe('model');
    expect(res.body.draft?.content).toBe('A drafted paragraph about the drug substance.');
    expect(res.body.draft?.metadata?.model).toBe('claude-x');
    expect(res.body.draft?.metadata?.provider).toBe('anthropic');
    expect(res.body.draft?.metadata?.source).toBe('model');
    expect(res.body).not.toHaveProperty('degraded');
  });
});
