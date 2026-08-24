/**
 * Tenant-isolation contract test — the shared response-cache middleware.
 *
 * Third finding from the sweep that started at the Nano Banana response cache,
 * and the one that had not fired yet.
 *
 * `cacheResponse` in server/middleware/enterprise-performance.ts left the whole
 * cache key to its caller. Four routes in server/routes/concept2cure.ts built
 * theirs from `(req as any).organizationId` — a field the global /api auth gate
 * never sets. It sets req.tenantId, req.user.organizationId and
 * req.tenantContext.organizationId; `req.organizationId` is written only by
 * enterprise-security's own auth path and one evidence route. So those keys
 * stringified to `projects:undefined`, `artifacts:undefined` and so on: one
 * bucket for every tenant on the instance.
 *
 * Nothing leaked, and only for one reason — the middleware bypasses the cache
 * outright for any request carrying an authorization or cookie header unless
 * the route opts in with `allowAuthorizedRequestCaching`, and no route did. The
 * defect was a live trap rather than a live leak: setting that flag on any of
 * those four routes would have turned `…:undefined` into a cross-tenant cache
 * on portfolio and artifact listings.
 *
 * The fix moves tenant scoping into the middleware, where a call site cannot
 * get it wrong: the key is prefixed with the organization from the canonical
 * accessor, and a route that opts in without a resolvable organization is not
 * cached at all.
 *
 * The first two tests below fail against the pre-fix middleware.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const ORG_A = 7;
const ORG_B = 991;

let cacheResponse: any;

beforeEach(async () => {
  // apiCache is module-global; a fresh module per test keeps one test's entry
  // from answering the next test's read.
  vi.resetModules();
  cacheResponse = (await import('../../middleware/enterprise-performance')).cacheResponse;
});

/**
 * Build an app whose single cached route reports which organization the handler
 * actually ran for, so a cross-tenant hit is visible in the body.
 */
function buildApp(opts: {
  allowAuthorizedRequestCaching?: boolean;
  keyGenerator?: (req: Request) => string;
}) {
  const principal: { orgId: number | null } = { orgId: ORG_A };
  let handlerCalls = 0;

  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // What the global /api auth gate writes. Note it does NOT set
    // req.organizationId — that absence is the whole finding.
    if (principal.orgId != null) {
      (req as any).user = { id: 1, organizationId: principal.orgId };
      (req as any).tenantId = principal.orgId;
    }
    next();
  });
  app.get(
    '/api/c2c/projects',
    cacheResponse({
      ttl: 30_000,
      allowAuthorizedRequestCaching: opts.allowAuthorizedRequestCaching,
      keyGenerator: opts.keyGenerator ?? (() => 'projects'),
    }),
    (_req: Request, res: Response) => {
      handlerCalls += 1;
      res.json({ servedFor: principal.orgId, call: handlerCalls });
    },
  );

  const get = (as: number | null) => {
    principal.orgId = as;
    // A real caller is authenticated, so the bearer header is always present.
    return request(app).get('/api/c2c/projects').set('Authorization', 'Bearer stub');
  };

  return { get, calls: () => handlerCalls };
}

describe('cacheResponse — cross-tenant isolation', () => {
  it('does not serve one organization a response cached for another', async () => {
    const { get, calls } = buildApp({ allowAuthorizedRequestCaching: true });

    const first = await get(ORG_A);
    expect(first.status).toBe(200);
    expect(first.body.servedFor).toBe(ORG_A);

    const second = await get(ORG_B);
    expect(second.status).toBe(200);
    // The decisive assertion: organization B must be served its own response.
    expect(second.headers['x-cache']).not.toBe('HIT');
    expect(second.body.servedFor).toBe(ORG_B);
    expect(calls()).toBe(2);
  });

  it('does not cache an opted-in route when no organization resolves', async () => {
    const { get, calls } = buildApp({ allowAuthorizedRequestCaching: true });

    const first = await get(null);
    expect(first.status).toBe(200);
    const second = await get(null);
    expect(second.status).toBe(200);

    // No verified organization → no cache participation. A shared "undefined"
    // bucket is exactly what must not happen here.
    expect(second.headers['x-cache']).not.toBe('HIT');
    expect(calls()).toBe(2);
  });

  it('still caches a repeat for the same organization', async () => {
    const { get, calls } = buildApp({ allowAuthorizedRequestCaching: true });

    await get(ORG_A);
    const second = await get(ORG_A);

    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body.servedFor).toBe(ORG_A);
    expect(calls()).toBe(1);
  });

  it('keeps the default posture: an authorized request is not cached at all', async () => {
    const { get, calls } = buildApp({}); // no allowAuthorizedRequestCaching

    await get(ORG_A);
    const second = await get(ORG_A);

    expect(second.headers['x-cache']).toBeUndefined();
    expect(calls()).toBe(2);
  });

  it('is not fooled by a keyGenerator that reads the unset req.organizationId', async () => {
    // The exact shape the four concept2cure.ts routes used. Even if a call site
    // reintroduces it, the middleware's own prefix keeps tenants apart.
    const { get, calls } = buildApp({
      allowAuthorizedRequestCaching: true,
      keyGenerator: req => `projects:${(req as any).organizationId}`,
    });

    await get(ORG_A);
    const second = await get(ORG_B);

    expect(second.body.servedFor).toBe(ORG_B);
    expect(calls()).toBe(2);
  });
});
