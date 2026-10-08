/**
 * GET /api/submissions/market-support states what the platform can carry for
 * each market of an application type (FILING_SPINE.md F19). The statement is
 * composed by services/regulatory/market-support.ts from the active rule packs,
 * read once; no model is involved.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-market-support-secret-32ch';
});

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db.js', async (importOriginal) => ({ ...(await importOriginal<object>()), pool: db }));
vi.mock('../../db', async (importOriginal) => ({ ...(await importOriginal<object>()), pool: db }));

import request from 'supertest';
import express from 'express';
import { expandRoleClaims } from '../../middleware/auth';
import submissionsRouter from '../submissions';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 3, userId: 3, organizationId: 7, role: 'member', roles: expandRoleClaims('member', undefined) };
  next();
});
app.use('/api/submissions', submissionsRouter);

const PACKS = ['nda:fda', 'maa:ema', 'jnda:pmda'].map((k) => {
  const [doc_type, agency] = k.split(':');
  return { doc_type, agency, version: 'v', label: k };
});

beforeEach(() => {
  db.query.mockReset();
  db.query.mockResolvedValue({ rows: PACKS });
});

describe('GET /api/submissions/market-support', () => {
  it('without a market, states every region the platform names for the application type, from one pack read', async () => {
    const res = await request(app).get('/api/submissions/market-support?applicationType=nda');
    expect(res.status).toBe(200);
    expect(res.body.applicationType).toBe('nda');
    expect(res.body.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.markets).toHaveLength(12);
    const by = Object.fromEntries(res.body.markets.map((m: { region: string; summary: string }) => [m.region, m.summary]));
    expect(by.US).toBe('Structured Module 1');
    expect(by.CA).toBe('No outline, no channel');
    expect(by.BR).toBe('Unmapped');
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(String(db.query.mock.calls[0][0])).toMatch(/superseded_by IS NULL/);
  });

  it('with a market, states that one', async () => {
    const res = await request(app).get('/api/submissions/market-support?applicationType=maa&market=eu');
    expect(res.status).toBe(200);
    expect(res.body.markets).toHaveLength(1);
    expect(res.body.markets[0]).toMatchObject({ region: 'EU', summary: 'Flat Module 1, no channel', buildable: false });
  });

  it('refuses a request with no application type', async () => {
    const res = await request(app).get('/api/submissions/market-support');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('a failed pack read is a failure, never a market with no outline', async () => {
    db.query.mockRejectedValueOnce(new Error('connection reset'));
    const res = await request(app).get('/api/submissions/market-support?applicationType=nda&market=FDA');
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.markets).toBeUndefined();
  });
});
