/**
 * POST /api/510k/estar/build — entitlement gate contract.
 *
 * The device_assembly_readiness capability (min tier: standard) is enforced on
 * the producing routes via requireEntitlement, mode ENTITLEMENTS_ENFORCE:
 *   off (default) — the gate is inert, requests reach the handler untouched;
 *   warn          — allowed through with the X-Entitlement-Warning header;
 *   on            — an unentitled org is refused 403 NOT_ENTITLED BEFORE the
 *                   handler runs; an entitled org passes.
 *
 * "Reached the handler" is proven with an invalid body → the handler's own zod
 * 400, so no export machinery has to run. Auth + db are mocked; the middleware's
 * tier lookup and the resolver's toggle read run against the mocked pool.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({
  db: {},
  pool: { query: (...a: unknown[]) => query(...a) },
}));

vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: any, next: () => void) => {
    req.user = { id: 3, role: 'admin', organizationId: 7 };
    next();
  },
}));

// The draft renderer pulls puppeteer-cluster/pdfkit at import time; the gate
// tests never render, so keep the module graph light.
vi.mock('../../export/renderers', () => ({ renderPdfBuffersFor510k: vi.fn() }));

let app: express.Express;

beforeEach(async () => {
  query.mockReset();
  delete process.env.ENTITLEMENTS_ENFORCE;
  query.mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (s.includes('FROM organizations')) return { rows: orgRows };
    return { rows: [] };
  });
  const router = (await import('../510k-estar-routes')).default;
  app = express();
  app.use(express.json());
  app.use('/api/510k/estar', router);
});
afterEach(() => {
  delete process.env.ENTITLEMENTS_ENFORCE;
});

let orgRows: Array<{ tier: string | null }> = [];

const postBuild = (body: object = {}) =>
  request(app).post('/api/510k/estar/build').send(body);

describe("ENTITLEMENTS_ENFORCE=off (today's default)", () => {
  it('reaches the handler (zod 400 on an invalid body), no entitlement queries', async () => {
    orgRows = [{ tier: 'free' }];
    const res = await postBuild({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request payload');
    // No tier lookup ran. (The pool is not untouched overall — the tamper-proof
    // audit module bootstraps its schema through it at import — so assert on
    // the entitlement gate's own statement, not on total call count.)
    const tierLookups = query.mock.calls.filter((c) => String(c[0]).includes('FROM organizations'));
    expect(tierLookups).toHaveLength(0);
  });
});

describe('ENTITLEMENTS_ENFORCE=on', () => {
  beforeEach(() => {
    process.env.ENTITLEMENTS_ENFORCE = 'on';
  });

  it('403s an unentitled org with the NOT_ENTITLED contract, before the handler', async () => {
    orgRows = [{ tier: 'free' }];
    const res = await postBuild({});
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: 'NOT_ENTITLED',
      capability: 'device_assembly_readiness',
      requiredTier: 'standard',
    });
    // The handler's zod validation never ran (its 400 would have won otherwise).
    expect(res.body.error).not.toBe('Invalid request payload');
  });

  it('an entitled org passes the gate and reaches the handler', async () => {
    orgRows = [{ tier: 'standard' }];
    const res = await postBuild({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request payload');
  });
});

describe('ENTITLEMENTS_ENFORCE=warn', () => {
  it('allows an unentitled org through with the warning header', async () => {
    process.env.ENTITLEMENTS_ENFORCE = 'warn';
    orgRows = [{ tier: 'free' }];
    const res = await postBuild({});
    expect(res.status).toBe(400); // handler reached
    expect(res.headers['x-entitlement-warning']).toContain('device_assembly_readiness');
  });
});
