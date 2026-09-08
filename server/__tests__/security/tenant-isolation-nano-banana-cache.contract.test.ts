/**
 * Tenant-isolation contract test — Nano Banana response cache.
 *
 * Regression guard for a cross-tenant data leak in
 * server/middleware/nanoBananaGuard.ts. The response cache was a process-global
 * Map keyed on `sha256(prompt|style|quality)` with no tenant scoping, mounted on
 * both POST /generate and POST /chat:
 *
 *   Sponsor A generates from a prompt naming an unannounced programme.
 *   Sponsor B, a different company on the same instance, sends the same string
 *   and is served A's response with `X-NanoBanana-Cache: HIT`.
 *
 * The same key also omitted `count` and `conversationHistory`, so it leaked
 * inside a tenant too (colleague B receiving a reply computed from colleague A's
 * private conversation) and returned the wrong result for a legitimate repeat.
 *
 * Each `it` below fails against the pre-fix middleware and passes after it. The
 * routes rely on the global /api auth gate, so identity is injected here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { ORG_A, ORG_B, USER_A1, USER_A2, USER_B1, service } = vi.hoisted(() => ({
  ORG_A: 7,
  ORG_B: 991,
  USER_A1: 11,
  USER_A2: 12,
  USER_B1: 21,
  service: {
    generateImage: vi.fn(),
    generatePresentation: vi.fn(),
    chatWithNanoBanana: vi.fn(),
    isConfigured: vi.fn(() => true),
  },
}));

vi.mock('../../services/nanoBananaService', () => service);

/**
 * Identity injected by the test harness, standing in for what the global /api
 * auth gate writes onto the request from the verified JWT.
 */
const principal: { orgId: number | null; userId: number | null } = {
  orgId: ORG_A,
  userId: USER_A1,
};

let app: express.Express;

/** Distinct payload per service call, so a stale cache hit is visible. */
let generateCalls = 0;
let chatCalls = 0;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  generateCalls = 0;
  chatCalls = 0;

  service.generateImage.mockImplementation(async () => {
    generateCalls += 1;
    return {
      images: [`image-for-call-${generateCalls}`],
      model: 'stub',
      servedTo: `${principal.orgId}/${principal.userId}`,
    };
  });
  service.chatWithNanoBanana.mockImplementation(async () => {
    chatCalls += 1;
    return {
      text: `reply-for-call-${chatCalls}`,
      images: [],
      servedTo: `${principal.orgId}/${principal.userId}`,
    };
  });
  service.isConfigured.mockReturnValue(true);

  const guard = await import('../../middleware/nanoBananaGuard');
  guard.__clearNanoBananaState();

  const router = (await import('../../routes/nanoBanana')).default;
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (principal.orgId != null) {
      (req as any).user = { id: principal.userId, organizationId: principal.orgId };
      (req as any).userId = principal.userId;
      (req as any).tenantId = principal.orgId;
      // The quota is per-caller and the free tier allows 5 images/day; these
      // tests issue more than that across principals, so pin an unrestricted
      // tier and keep the assertions about caching, not rate limiting.
      (req as any).userTier = 'admin';
    }
    next();
  });
  app.use('/api/nano-banana', router);
});

/** POST as a given principal. */
async function post(
  path: string,
  body: Record<string, unknown>,
  as: { orgId: number | null; userId: number | null },
) {
  principal.orgId = as.orgId;
  principal.userId = as.userId;
  return request(app).post(`/api/nano-banana${path}`).send(body);
}

describe('Nano Banana cache — cross-tenant isolation', () => {
  it('does not serve one organization a cached response produced for another', async () => {
    const body = { prompt: 'phase 3 readout deck cover, ACME-401', quality: 'fast' };

    const first = await post('/generate', body, { orgId: ORG_A, userId: USER_A1 });
    expect(first.status).toBe(200);
    expect(first.headers['x-nanobanana-cache']).toBe('MISS');
    expect(first.body.servedTo).toBe(`${ORG_A}/${USER_A1}`);

    const second = await post('/generate', body, { orgId: ORG_B, userId: USER_B1 });
    expect(second.status).toBe(200);
    // The decisive assertion: sponsor B must not receive sponsor A's payload.
    expect(second.headers['x-nanobanana-cache']).toBe('MISS');
    expect(second.body.servedTo).toBe(`${ORG_B}/${USER_B1}`);
    expect(second.body.images).not.toEqual(first.body.images);
    expect(service.generateImage).toHaveBeenCalledTimes(2);
  });

  it('does not serve one user a cached response produced for a colleague', async () => {
    const body = { prompt: 'internal-only pipeline diagram', quality: 'fast' };

    const first = await post('/generate', body, { orgId: ORG_A, userId: USER_A1 });
    const second = await post('/generate', body, { orgId: ORG_A, userId: USER_A2 });

    expect(second.headers['x-nanobanana-cache']).toBe('MISS');
    expect(second.body.images).not.toEqual(first.body.images);
  });

  it('still caches a genuine repeat from the same organization and user', async () => {
    const body = { prompt: 'same caller, same request', quality: 'fast' };

    const first = await post('/generate', body, { orgId: ORG_A, userId: USER_A1 });
    const second = await post('/generate', body, { orgId: ORG_A, userId: USER_A1 });

    expect(second.headers['x-nanobanana-cache']).toBe('HIT');
    expect(second.body.images).toEqual(first.body.images);
    // The cost-control purpose survives: the provider was called once.
    expect(service.generateImage).toHaveBeenCalledTimes(1);
  });
});

describe('Nano Banana cache — key covers the whole request', () => {
  it('treats a different image count as a different request', async () => {
    const one = await post(
      '/generate',
      { prompt: 'four variants please', count: 1 },
      { orgId: ORG_A, userId: USER_A1 },
    );
    const four = await post(
      '/generate',
      { prompt: 'four variants please', count: 4 },
      { orgId: ORG_A, userId: USER_A1 },
    );

    expect(four.headers['x-nanobanana-cache']).toBe('MISS');
    expect(four.body.images).not.toEqual(one.body.images);
    expect(service.generateImage).toHaveBeenCalledTimes(2);
  });

  it('treats a different conversation history as a different /chat request', async () => {
    const first = await post(
      '/chat',
      { message: 'summarise where we left off', conversationHistory: [{ role: 'user', text: 'ACME-401 tox findings' }] },
      { orgId: ORG_A, userId: USER_A1 },
    );
    const second = await post(
      '/chat',
      { message: 'summarise where we left off', conversationHistory: [{ role: 'user', text: 'BETA-9 enrolment' }] },
      { orgId: ORG_A, userId: USER_A1 },
    );

    expect(second.headers['x-nanobanana-cache']).toBe('MISS');
    expect(second.body.response).not.toEqual(first.body.response);
    expect(service.chatWithNanoBanana).toHaveBeenCalledTimes(2);
  });

  it('never lets /chat and /generate share a cache entry', async () => {
    // One body that both routes accept: /generate reads `prompt`, /chat reads
    // `message`. Under a route-less key these two collide.
    const body = { prompt: 'shared string', message: 'shared string' };

    const generated = await post('/generate', body, { orgId: ORG_A, userId: USER_A1 });
    const chatted = await post('/chat', body, { orgId: ORG_A, userId: USER_A1 });

    expect(chatted.headers['x-nanobanana-cache']).toBe('MISS');
    expect(chatted.body.response).toBe('reply-for-call-1');
    expect(generated.body.images).toEqual(['image-for-call-1']);
  });

  it('ignores property order — a reordered body is the same request', async () => {
    const first = await post(
      '/generate',
      { prompt: 'order independent', style: 'schematic', quality: 'fast' },
      { orgId: ORG_A, userId: USER_A1 },
    );
    const second = await post(
      '/generate',
      { quality: 'fast', prompt: 'order independent', style: 'schematic' },
      { orgId: ORG_A, userId: USER_A1 },
    );

    expect(second.headers['x-nanobanana-cache']).toBe('HIT');
    expect(second.body.images).toEqual(first.body.images);
  });
});

describe('Nano Banana cache — fail closed without a verified identity', () => {
  it('does not read from or write to the cache when no organization resolves', async () => {
    const body = { prompt: 'no identity on this request' };

    const first = await post('/generate', body, { orgId: null, userId: null });
    expect(first.status).toBe(200);
    expect(first.headers['x-nanobanana-cache']).toBe('BYPASS');

    // A second identity-less request must not be answered from the first.
    const second = await post('/generate', body, { orgId: null, userId: null });
    expect(second.headers['x-nanobanana-cache']).toBe('BYPASS');
    expect(second.body.images).not.toEqual(first.body.images);
    expect(service.generateImage).toHaveBeenCalledTimes(2);
  });

  it('never lets an identity-less request pick up an authenticated tenant entry', async () => {
    const body = { prompt: 'sponsor A confidential subject' };

    const authed = await post('/generate', body, { orgId: ORG_A, userId: USER_A1 });
    const anonymous = await post('/generate', body, { orgId: null, userId: null });

    expect(anonymous.headers['x-nanobanana-cache']).toBe('BYPASS');
    expect(anonymous.body.images).not.toEqual(authed.body.images);
  });
});
