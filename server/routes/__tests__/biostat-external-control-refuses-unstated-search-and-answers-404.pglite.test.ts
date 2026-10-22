/**
 * The external-control routes refuse a search they were not given terms for,
 * match the terms they were given literally, and answer a control that does
 * not exist as 404.
 *
 * What the code used to do (2026-10-15):
 *  - POST /api/biostat/external-control/search passed `indication` and
 *    `endpoints?.[0]` on unchecked, and searchHistoricalArms built
 *    `'%' + params.indication + '%'`. A request without them searched for the
 *    text "undefined" and answered 200 { arms: [] } — "no arms" for a search
 *    nobody stated. A '%' or '_' in a term was a LIKE wildcard, so the
 *    indication "%" matched every arm.
 *  - validateControl, generateRegulatoryPackage and getControl threw a plain
 *    Error("Synthetic control N not found"), which the routes answered 500,
 *    and a controlId that is not a number reached Postgres as NaN (500).
 *
 * The real router over the real service, on PGlite tables built from the
 * Drizzle definitions.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { armLevelData, syntheticControls, propensityModels } from '../../../shared/schema';

const h = vi.hoisted(() => ({ pg: null as unknown as { query: (t: string, p?: unknown[]) => Promise<unknown> }, db: null as unknown }));
vi.mock('../../db', () => ({
  get db() {
    return h.db;
  },
  pool: { query: (t: string, p?: unknown[]) => h.pg.query(t, p), connect: vi.fn() },
  getPool: () => ({ query: (t: string, p?: unknown[]) => h.pg.query(t, p), connect: vi.fn() }),
}));

vi.mock('../../middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/auth')>();
  return {
    ...actual,
    authenticateToken: (req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = { id: 1, organizationId: ORG };
      next();
    },
  };
});

const ORG = 7;

/** CREATE TABLE from the drizzle definition (columns and types only). */
function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}`);
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

let pg: PGlite;
let app: express.Express;

beforeAll(async () => {
  pg = new PGlite();
  h.pg = pg;
  h.db = drizzle(pg);
  for (const t of [armLevelData, syntheticControls, propensityModels]) {
    await pg.exec(ddlOf(t as unknown as PgTable));
  }
  const arm = (name: string, indication: string, endpoint: string) =>
    pg.query(
      `INSERT INTO arm_level_data (arm_name, arm_type, indication, endpoint, n, organization_id)
       VALUES ($1, 'control', $2, $3, 120, $4)`,
      [name, indication, endpoint, ORG],
    );
  await arm('Placebo A', 'NSCLC stage IV', 'Overall survival');
  await arm('Placebo B', 'Type 2 diabetes', 'HbA1c change from baseline');

  const { default: biostatRouter } = await import('../biostatPlatform');
  app = express();
  app.use(express.json());
  app.use('/api/biostat', biostatRouter);
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

const search = (body: Record<string, unknown>) =>
  request(app).post('/api/biostat/external-control/search').send(body);

describe('POST /api/biostat/external-control/search', () => {
  it('refuses a search with no indication, naming it', async () => {
    const res = await search({ endpoints: ['Overall survival'] });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual({ fields: ['indication'] });
  });

  it('refuses a search with no endpoint, naming it', async () => {
    for (const body of [{ indication: 'NSCLC' }, { indication: 'NSCLC', endpoints: [] }, { indication: 'NSCLC', endpoints: ['  '] }]) {
      const res = await search(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.details).toEqual({ fields: ['endpoints'] });
    }
  });

  it('matches stated terms case-insensitively as substrings', async () => {
    const res = await search({ indication: 'nsclc', endpoints: ['overall SURVIVAL'] });
    expect(res.status).toBe(200);
    expect(res.body.data.arms.map((a: { armName: string }) => a.armName)).toEqual(['Placebo A']);
  });

  it('treats % and _ in a term as the characters, not as wildcards', async () => {
    const everything = await search({ indication: '%', endpoints: ['%'] });
    expect(everything.status).toBe(200);
    expect(everything.body.data.arms).toEqual([]);

    const underscore = await search({ indication: 'NSCLC_stage', endpoints: ['Overall_survival'] });
    expect(underscore.status).toBe(200);
    expect(underscore.body.data.arms).toEqual([]);
  });
});

describe('a synthetic control that does not exist is 404; a controlId that is not a positive integer is 400', () => {
  const routes = [
    { route: 'GET /external-control/:controlId', call: (id: string) => request(app).get(`/api/biostat/external-control/${id}`) },
    { route: 'POST /external-control/:controlId/validate', call: (id: string) => request(app).post(`/api/biostat/external-control/${id}/validate`).send({}) },
    { route: 'GET /external-control/:controlId/regulatory-package', call: (id: string) => request(app).get(`/api/biostat/external-control/${id}/regulatory-package`) },
  ];

  it.each(routes)('$route for an unknown control is 404', async ({ call }) => {
    const res = await call('999');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Synthetic control 999 not found/);
  });

  it.each(routes)('$route for a controlId that is not a positive integer is 400', async ({ call }) => {
    for (const id of ['abc', '0', '-2', '1.5']) {
      const res = await call(id);
      expect(res.status, `controlId ${id}`).toBe(400);
      expect(res.body.error).toMatch(/controlId/);
    }
  });
});
