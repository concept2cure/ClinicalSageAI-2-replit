/**
 * The biostatistics routers read the caller's organization as a positive
 * integer, or not at all.
 *
 * S12 biotech sweep, finding 58 (2026-11-09): the access token carried
 * organizationId as the string "2", and server/routes/ana-biostats.ts passed it
 * on as text, so authoring's project access refused every "Save as a working
 * document" with a 503. 44f25b3fdb fixed that router and 098899e6ae made the
 * claim a number where it is set. The two sibling routers the finding named —
 * biostatPlatform.ts and biostat-design-stats.ts — still had their own copy of
 * the resolver, which returned whatever truthy claim arrived: a malformed one
 * ("seven") reached the continuum service and was written as the row's
 * organization. Both now read it through the one resolver every other route
 * uses (server/types/auth-request.ts, resolveOrgId).
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const S = vi.hoisted(() => ({
  org: 7 as unknown,
  inserts: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../db', () => {
  const q = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: async () => [],
    limit: async () => [],
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        S.inserts.push(v);
        return { returning: async () => [{ id: 17, ...v }] };
      },
    }),
  });
  return { pool: { query: q, connect: vi.fn() }, getPool: () => ({ query: q, connect: vi.fn() }), db: chain };
});

vi.mock('../../middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/auth')>();
  return {
    ...actual,
    authenticateToken: (req: any, _res: any, next: any) => {
      req.user = { id: 1, organizationId: S.org };
      next();
    },
  };
});

const { default: biostatRouter } = await import('../biostatPlatform');

const app = express();
app.use(express.json());
app.use('/api/biostat', biostatRouter);

const initialize = () =>
  request(app)
    .post('/api/biostat/continuum/initialize')
    .send({ title: 'NSCLC P3', indication: 'NSCLC', phase: 'Phase 3', endpoints: ['OS'], sampleSize: 450 });

const ocExact = () =>
  request(app)
    .post('/api/biostat/adaptive/oc-exact')
    .send({ informationFractions: [0.5, 1], alpha: 0.025, drifts: [0, 2.8] });

beforeEach(() => {
  S.inserts.length = 0;
  S.org = 7;
});

describe('biostatPlatform.ts', () => {
  it('an organization carried as text ("7") is recorded as the number 7', async () => {
    S.org = '7';
    const res = await initialize();
    expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
    expect(S.inserts[0]?.organizationId).toBe(7);
  });

  it.each([['seven'], [0], [-1], [null]])('an organization claim of %j reaches no service and writes nothing', async (claim) => {
    S.org = claim;
    const res = await initialize();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(S.inserts).toEqual([]);
  });
});

describe('biostat-design-stats.ts', () => {
  it('a numeric organization carried as text is admitted', async () => {
    S.org = '7';
    const res = await ocExact();
    expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
  });

  it.each([['seven'], [0], [-1]])('an organization claim of %j is refused before anything is computed', async (claim) => {
    S.org = claim;
    const res = await ocExact();
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
