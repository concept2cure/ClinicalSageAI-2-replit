/**
 * /api/cortex keeps the session's tenant context; it never takes a tenant or a
 * workspace from a request header (IAM-15 residual, plan P1-7;
 * docs/evidence/D6/2026-10-01-tranche-4/P1-7-P1-27-residuals/).
 *
 * cortex-unified.ts's router-level `extractTenantContext` REPLACED
 * `req.tenantContext` — the verified one the auth boundary publishes
 * (middleware/establishRequestTenantScope.ts: organizationId, organizationUuid,
 * userId, role) — with `{ organizationId, clientWorkspaceId, module }`, where
 * `clientWorkspaceId` was the caller's `x-client-workspace-id` header, unverified,
 * and `organizationUuid` was gone. That is the state in which the nine
 * `tenantContext?.organizationUuid || req.headers['x-org-uuid']` fallbacks that
 * b1618c69 removed handed the header to a WHERE clause. The router runs for
 * every /api/cortex path, so whatever it writes is also what the next handler
 * sees when a path falls through it — /api/cortex/management is mounted AFTER
 * it (bootstrap/register-document-routes.ts), so every management request
 * passed through this rewrite.
 *
 * Mounted as production mounts it, with the auth boundary's published context
 * stood in for (no database here: the context is what is under test).
 */
import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('../../db.js', () => {
  const pool = { query: (...args: unknown[]) => queryMock(...args) };
  return { pool, getPool: () => pool, db: {}, getDb: () => ({}) };
});
vi.mock('../../db', () => {
  const pool = { query: (...args: unknown[]) => queryMock(...args) };
  return { pool, getPool: () => pool, db: {}, getDb: () => ({}) };
});
vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const ORG_A = 4101;

type Ctx = Record<string, unknown> | undefined;

/** Stand-in for the auth boundary: a verified session and the context it publishes. */
function session(ctx: Ctx) {
  return (req: any, _res: unknown, next: () => void) => {
    req.user = { id: 7, userId: 7, organizationId: ORG_A, role: 'user' };
    if (ctx) req.tenantContext = { ...ctx };
    next();
  };
}

let cortexUnified: express.Router;

async function queryRouteMounted(router: express.Router): Promise<void> {
  const stack = (router as unknown as { stack: Array<{ match?: (p: string) => boolean }> }).stack;
  for (let i = 0; i < 200; i++) {
    // A path-less router.use() layer matches every path; only the /query mount
    // matches '/query' and not an unrelated path.
    if (stack.some(l => l.match?.('/query') && !l.match?.('/not-a-mount'))) return;
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error('cortex-unified never mounted /query');
}

beforeAll(async () => {
  cortexUnified = (await import('../cortex-unified')).default;
  const { initializeCortexAPI } = await import('../cortexQueryRoutes');
  initializeCortexAPI({ query: (...a: unknown[]) => queryMock(...a) } as any);
  await queryRouteMounted(cortexUnified);
}, 60_000);

/** cortex-unified, then a handler mounted after it the way /management is. */
function app(ctx: Ctx) {
  const a = express();
  a.use(express.json());
  a.use('/api', session(ctx));
  a.use('/api/cortex', cortexUnified);
  a.use('/api/cortex/management', (req: any, res) => {
    res.json({ tenantContext: req.tenantContext ?? null });
  });
  return a;
}

const VERIFIED = {
  organizationId: String(ORG_A),
  organizationUuid: UUID_A,
  userId: 7,
  role: 'user',
};

describe('/api/cortex tenant context is the session’s, never a header', () => {
  it('keeps the session’s organisation uuid when the request names another tenant', async () => {
    const res = await request(app(VERIFIED))
      .get('/api/cortex/management/probe')
      .set('x-org-uuid', UUID_B)
      .set('x-client-workspace-id', '999');
    expect(res.status).toBe(200);
    expect(res.body.tenantContext.organizationUuid).toBe(UUID_A);
    expect(res.body.tenantContext.organizationId).toBe(String(ORG_A));
    expect(res.body.tenantContext.userId).toBe(7);
  });

  it('never publishes a workspace taken from the x-client-workspace-id header', async () => {
    const res = await request(app(VERIFIED))
      .get('/api/cortex/management/probe')
      .set('x-client-workspace-id', '999');
    expect(res.status).toBe(200);
    expect(res.body.tenantContext.clientWorkspaceId ?? null).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('999');
  });

  it('a session with no organisation uuid does not get one from the x-org-uuid header', async () => {
    const res = await request(app({ organizationId: String(ORG_A), userId: 7, role: 'user' }))
      .get('/api/cortex/management/probe')
      .set('x-org-uuid', UUID_B);
    expect(res.status).toBe(200);
    expect(res.body.tenantContext.organizationUuid ?? null).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain(UUID_B);
  });

  it('the tenant-keyed query route refuses (403) a session with no tenant scope, header or not', async () => {
    queryMock.mockClear();
    const res = await request(app({ organizationId: String(ORG_A), userId: 7, role: 'user' }))
      .post('/api/cortex/query/query')
      .set('x-org-uuid', UUID_B)
      .send({ query: 'probe', mode: 'graph' });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain(UUID_B);
    // Refused before any query: the header never reached a WHERE clause.
    expect(queryMock).not.toHaveBeenCalled();
  });
});
