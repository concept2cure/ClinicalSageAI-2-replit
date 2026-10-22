/**
 * The transmittal log's totals describe the whole log, not the page it returns.
 *
 * 2026-10-08 (W5/D7, sweep HS-8). GET /api/mdx/gateways/transmittals returns
 * the newest 100 rows by default and reported meta.count = rows.length, with no
 * total and no sign that older rows were left out. The surface showed that
 * count as the size of the log, and AnA was handed byStatus and
 * awaitingAcknowledgement computed from the page — so an organisation with 130
 * transmittals, the 30 oldest still unacknowledged, read as "100 logged, none
 * awaiting acknowledgement". The route now counts every row the filters match
 * (total, hasMore, byStatus, awaitingAcknowledgement) beside the page it
 * returns. The real router and its real SQL run here on PGlite; only the
 * actor-name lookup is a stand-in (its tenant scoping is pinned elsewhere).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';

const { db } = vi.hoisted(() => ({ db: { current: null as PGlite | null } }));

vi.mock('../../../db', () => ({
  pool: { query: (sql: string, params: unknown[] = []) => db.current!.query(sql, params) },
  getPool: () => ({ query: (sql: string, params: unknown[] = []) => db.current!.query(sql, params) }),
  db: {},
}));

import gatewayRouter from '../../../routes/mdx-submission-gateway';

const migration = (name: string) =>
  readFileSync(new URL(`../../../../migrations/${name}`, import.meta.url), 'utf8');

const ORG = 7;

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: 11, organizationId: ORG, role: 'viewer' };
    next();
  });
  a.use('/api/mdx', gatewayRouter);
  return a;
}

beforeAll(async () => {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY, name text);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY);
    CREATE TABLE c2c_submission_packages (id serial PRIMARY KEY);
    INSERT INTO organizations (id) VALUES (7), (8);
    INSERT INTO users (id, name) VALUES (11, 'Dr Ada Lovelace');
    CREATE FUNCTION public.actor_name(p_user_id integer) RETURNS TABLE (name text, email text)
      LANGUAGE sql STABLE AS $$ SELECT u.name, NULL::text FROM users u WHERE u.id = p_user_id $$;
  `);
  await pg.exec(migration('20260509_submission_gateways.sql'));
  // 130 transmittals for this organisation: the 30 OLDEST were delivered and
  // never acknowledged; the 100 newest were acknowledged. Plus one row of
  // another organisation, which no total may count.
  await pg.exec(`
    INSERT INTO submission_transmittals (organization_id, region, gateway, format, status, submitted_by, submitted_at, ack_received_at)
    SELECT 7, 'fda', 'esg', 'ectd',
           CASE WHEN g <= 30 THEN 'in_transit' ELSE 'received' END,
           11,
           TIMESTAMPTZ '2026-01-01' + g * INTERVAL '1 hour',
           CASE WHEN g <= 30 THEN NULL ELSE TIMESTAMPTZ '2026-01-01' + g * INTERVAL '1 hour' + INTERVAL '5 minutes' END
      FROM generate_series(1, 130) AS g;
    INSERT INTO submission_transmittals (organization_id, region, gateway, format, status, submitted_at)
    VALUES (8, 'fda', 'esg', 'ectd', 'in_transit', TIMESTAMPTZ '2026-06-01');
  `);
  // Two older rows the agency will never acknowledge: a send refused for its
  // credentials before anything left the platform, and one rolled back. Neither
  // has an acknowledgement, and neither awaits one — submitted_at is NOT NULL
  // DEFAULT now(), so "sent with no acknowledgement" counted both.
  await pg.exec(`
    INSERT INTO submission_transmittals (organization_id, region, gateway, format, status, error_class, submitted_at)
    VALUES (7, 'fda', 'esg', 'ectd', 'rejected', 'auth', TIMESTAMPTZ '2025-12-01'),
           (7, 'fda', 'esg', 'ectd', 'rolled_back', NULL, TIMESTAMPTZ '2025-12-02');
  `);
  db.current = pg;
}, 60_000);

afterAll(async () => {
  await db.current?.close();
});

describe('GET /api/mdx/gateways/transmittals — totals over every matching row', () => {
  it('a page of 100 says the log holds 132, that more exist, and that the 30 in transit await acknowledgement', async () => {
    const res = await request(app()).get('/api/mdx/gateways/transmittals');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toHaveLength(100);
    expect(res.body.data[0].submitted_by_name).toBe('Dr Ada Lovelace');
    expect(res.body.data.some((r: { status: string }) => r.status === 'in_transit')).toBe(false);
    expect(res.body.meta).toEqual({
      count: 100,
      total: 132,
      hasMore: true,
      byStatus: { received: 100, in_transit: 30, rejected: 1, rolled_back: 1 },
      // Not the rejected or rolled-back rows: the agency acknowledges neither.
      awaitingAcknowledgement: 30,
      signing: expect.any(Object),
    });
  });

  it('the totals follow the filters, and a page that holds every match says so', async () => {
    const res = await request(app()).get('/api/mdx/gateways/transmittals?status=in_transit');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(30);
    expect(res.body.meta).toEqual({
      count: 30, total: 30, hasMore: false, byStatus: { in_transit: 30 }, awaitingAcknowledgement: 30,
      signing: expect.any(Object),
    });
  });

  it('an explicit limit pages the rows, never the totals', async () => {
    const res = await request(app()).get('/api/mdx/gateways/transmittals?limit=5');
    expect(res.body.data).toHaveLength(5);
    expect(res.body.meta).toMatchObject({ count: 5, total: 132, hasMore: true, awaitingAcknowledgement: 30 });
  });

  it('an empty log is a count of zero, not a missing one', async () => {
    const res = await request(app()).get('/api/mdx/gateways/transmittals?region=ema');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ count: 0, total: 0, hasMore: false, byStatus: {}, awaitingAcknowledgement: 0, signing: expect.any(Object) });
  });
});
