/**
 * "New KRI" against real PostgreSQL (PGlite), with the route's own INSERT and the KRI table's own migrations.
 *
 * GA-S8-01: POST /api/mdx/rbm-kris answered 500 for every body. The INSERT used $11 twice, once as
 * current_value (numeric) and once bare in `CASE WHEN $11 IS NULL`, and PostgreSQL refuses a parameter it deduces
 * two types for (42P08). A mocked pool cannot see that, which is how it shipped; this suite runs the statement.
 * Admission is a controlled collaborator: it is covered by rbm-current-project-admission.test.ts.
 */
import { readFileSync } from 'node:fs';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  query: null as unknown as (sql: string, args?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>,
}));
vi.mock('../../db', () => ({ pool: {
  query: (sql: string, args?: unknown[]) => h.query(sql, args),
  connect: async () => ({ query: h.query, release: vi.fn() }),
} }));
vi.mock('../../services/rbm/rbm-access', () => ({
  rbmRequestAdmission: (_req: unknown, _res: unknown, next: () => void) => next(),
  recheckRbmWrite: async () => undefined,
}));

import router from '../mdx-rbm';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
let db: PGlite;

function app() {
  const a = express(); a.use(express.json());
  a.use((req, _res, next) => { Object.assign(req, { user: { id: 3, organizationId: 7, role: 'admin' }, dbClient: { query: h.query } }); next(); });
  a.use('/api/mdx', router); return a;
}

beforeAll(async () => {
  db = new PGlite();
  h.query = async (sql, args) => db.query<Record<string, unknown>>(sql, args);
  await db.exec('CREATE TABLE organizations(id integer PRIMARY KEY); CREATE TABLE users(id integer PRIMARY KEY); INSERT INTO organizations VALUES (7); INSERT INTO users VALUES (3);');
  for (const file of ['20260629_rbm_surfaces.sql', '20260630_rbm_kri_values.sql', '20260726_rbm_metric_ingestion.sql']) {
    await db.exec(readFileSync(new URL(`../../../migrations/${file}`, import.meta.url), 'utf8'));
  }
}, 60_000);
afterAll(async () => { await db?.close(); });

describe('POST /api/mdx/rbm-kris on real PostgreSQL', () => {
  it('saves an indicator that has no reading yet: not evaluated, and no evaluation time', async () => {
    const res = await request(app()).post('/api/mdx/rbm-kris').send({
      programId: PROGRAM, name: 'Protocol deviation rate', unit: '%', direction: 'higher_worse', thresholdAmber: 5, thresholdRed: 10,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const row = (await db.query<Record<string, unknown>>('SELECT * FROM rbm_kris WHERE name = $1', ['Protocol deviation rate'])).rows[0];
    expect(row.status).toBe('not_evaluated');
    expect(row.current_value).toBeNull();
    expect(row.evaluated_at).toBeNull();
  });

  it('saves an indicator with a reading: the engine\'s status, and the time it was evaluated', async () => {
    const res = await request(app()).post('/api/mdx/rbm-kris').send({
      programId: PROGRAM, name: 'Open query aging', unit: 'days', direction: 'higher_worse', thresholdAmber: 14, thresholdRed: 21, currentValue: 25,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const row = (await db.query<Record<string, unknown>>('SELECT * FROM rbm_kris WHERE name = $1', ['Open query aging'])).rows[0];
    expect(row.status).toBe('red');
    expect(Number(row.current_value)).toBe(25);
    expect(row.evaluated_at).not.toBeNull();
  });
});
