/**
 * The `/api/mdx` gate is bound to two sub-trees, not to the whole prefix.
 *
 * Twenty-plus routers are stacked on `/api/mdx`. Two of them — ana-drafts and
 * vault — query the global pool with no tenant scope of their own and must be
 * authenticated. They were gated with
 * `app.use('/api/mdx', requireTenantContext, router)`, which reads as "gate this
 * router" and is not that: path-mounted middleware runs for every request
 * matching the prefix, whichever router ends up serving it. So the gate applied
 * to all of them, and `/api/mdx/notifications/unread-count` — mounted with no
 * auth by design — answered 401 whenever tenant context was unresolved. That is
 * the 500-then-401 alternation reported as BP-02.
 *
 * These tests use a real Express app rather than the bootstrap module, because
 * the property under test belongs to Express's routing semantics: the mistake is
 * easy to reintroduce anywhere in the codebase, and a test that only pinned this
 * one file would not say why.
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

/** Stand-in for `requireTenantContext`: 401 when no tenant is resolvable. */
const requireTenantContext = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.headers['x-tenant']) return next();
  return res.status(401).json({ error: 'no tenant context' });
};

function gatedRouter() {
  const r = express.Router();
  r.get('/ana-drafts', (_req, res) => res.json({ ok: 'drafts' }));
  return r;
}

function openRouter() {
  const r = express.Router();
  r.get('/notifications/unread-count', (_req, res) => res.json({ unread: 3 }));
  return r;
}

describe('the shape that caused BP-02', () => {
  const app = express();
  app.use('/api/mdx', requireTenantContext, gatedRouter());
  app.use('/api/mdx', openRouter());

  it('gates a route owned by a different router — this is the defect', async () => {
    // Not an aspiration: this asserts the OLD behaviour so the difference below
    // is visible. Bundling middleware with one router does not scope it.
    const res = await request(app).get('/api/mdx/notifications/unread-count');
    expect(res.status).toBe(401);
  });
});

describe('the shape in use now', () => {
  const app = express();
  app.use('/api/mdx/ana-drafts', requireTenantContext);
  app.use('/api/mdx/vault', requireTenantContext);
  app.use('/api/mdx', gatedRouter());
  app.use('/api/mdx', openRouter());

  it('leaves an unauthenticated route unauthenticated', async () => {
    const res = await request(app).get('/api/mdx/notifications/unread-count');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ unread: 3 });
  });

  it('still refuses the gated sub-tree without tenant context', async () => {
    // The gate must not have been loosened in the course of narrowing it.
    const res = await request(app).get('/api/mdx/ana-drafts');
    expect(res.status).toBe(401);
  });

  it('admits the gated sub-tree once tenant context is present', async () => {
    const res = await request(app).get('/api/mdx/ana-drafts').set('x-tenant', '7');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: 'drafts' });
  });
});

describe('the real bootstrap keeps the gate off the shared prefix', () => {
  it('binds requireTenantContext to sub-trees, never to bare /api/mdx', async () => {
    const { readFileSync } = await import('node:fs');
    const raw = readFileSync(
      new URL('../register-inline-routes.ts', import.meta.url),
      'utf8',
    );
    // Strip comments first. The block above this mount quotes the defective
    // call verbatim so a reader can see what was wrong — a scan that reads
    // comments as code would fail on the explanation of the bug it is
    // checking for. (The `check-internals-in-copy` gate made the mirror-image
    // mistake this week, reading code as prose.)
    const src = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map(l => l.replace(/\/\/.*$/, ''))
      .join('\n');
    // The exact regression: a gate bundled with a router on the bare prefix.
    expect(src).not.toMatch(/app\.use\(\s*['"]\/api\/mdx['"]\s*,\s*requireTenantContext/);
    // And the sub-tree gates are present.
    expect(src).toMatch(/app\.use\(\s*['"]\/api\/mdx\/ana-drafts['"]\s*,\s*requireTenantContext\s*\)/);
    expect(src).toMatch(/app\.use\(\s*['"]\/api\/mdx\/vault['"]\s*,\s*requireTenantContext\s*\)/);
  });
});
