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

/* The request's own pinned client, as establishRequestTenantScope attaches it
   (2026-10-11): the route reads the active packs through requestPgClient(req),
   not the shared pool. `sharedPool` stands in for the shared pool and must stay
   untouched — a second path to the database is what ci:requestdb-coverage
   exists to prevent. */
const db = vi.hoisted(() => ({ query: vi.fn() }));
const sharedPool = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db.js', async (importOriginal) => ({ ...(await importOriginal<object>()), pool: sharedPool }));
vi.mock('../../db', async (importOriginal) => ({ ...(await importOriginal<object>()), pool: sharedPool }));

import request from 'supertest';
import express from 'express';
import { expandRoleClaims } from '../../middleware/auth';
import submissionsRouter from '../submissions';
import { VALID_PROGRAM_TYPES } from '../c2c/project-intake';
import { FILING_CATALOG } from '../../../shared/regulatory/filing-catalog';
import { programTypeFor } from '../../../shared/constants/domain/filing-application-type';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 3, userId: 3, organizationId: 7, role: 'member', roles: expandRoleClaims('member', undefined) };
  req.dbClient = db;
  next();
});
app.use('/api/submissions', submissionsRouter);

const PACKS = ['nda:fda', 'maa:ema', 'jnda:pmda'].map((k) => {
  const [doc_type, agency] = k.split(':');
  return { doc_type, agency, version: 'v', label: k };
});

beforeEach(() => {
  db.query.mockReset();
  sharedPool.query.mockReset();
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
    expect(by.US).toBe('Module 1 to the agency\'s headings');
    expect(by.CA).toBe('No outline, no transmit channel');
    expect(by.BR).toBe('Not supported');
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(String(db.query.mock.calls[0][0])).toMatch(/superseded_by IS NULL/);
    expect(sharedPool.query, 'the route reached for the shared pool').not.toHaveBeenCalled();
  });

  it('with a market, states that one', async () => {
    const res = await request(app).get('/api/submissions/market-support?applicationType=maa&market=eu');
    expect(res.status).toBe(200);
    expect(res.body.markets).toHaveLength(1);
    expect(res.body.markets[0]).toMatchObject({ region: 'EU', summary: 'Module 1 without the agency\'s headings, no transmit channel', buildable: false });
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

/* Biotech sweep (2026-11-09): the New project picker asked once per application type and again per (type, agency)
   the first round did not name, ~87 parallel reads per open, because this route took one type while
   readMarketSupport already took a list. A comma-separated list of types is answered by type, from one pack read. */
describe('GET /api/submissions/market-support with a list of application types', () => {
  it('answers every listed type by type, each exactly as its own single read answers it, from one pack read', async () => {
    const res = await request(app).get('/api/submissions/market-support?applicationType=nda,maa,csr');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['applicationTypes', 'asOf', 'byType']);
    expect(res.body.applicationTypes).toEqual(['nda', 'maa', 'csr']);
    expect(Object.keys(res.body.byType)).toEqual(['nda', 'maa', 'csr']);
    expect(db.query).toHaveBeenCalledTimes(1);
    for (const t of ['nda', 'maa', 'csr']) {
      const single = await request(app).get(`/api/submissions/market-support?applicationType=${t}`);
      expect(res.body.byType[t], t).toEqual(single.body.markets);
    }
    expect(sharedPool.query).not.toHaveBeenCalled();
  });

  it('states each listed type at each listed market, as the market was asked', async () => {
    const res = await request(app).get(`/api/submissions/market-support?applicationType=${encodeURIComponent('csr,mdr')}&market=${encodeURIComponent('ICH / Global,EU / Notified Body')}`);
    expect(res.status).toBe(200);
    for (const t of ['csr', 'mdr']) {
      expect(res.body.byType[t].map((m: { market: string }) => m.market), t).toEqual(['ICH / Global', 'EU / Notified Body']);
    }
    expect(db.query).toHaveBeenCalledTimes(1);
    const single = await request(app).get(`/api/submissions/market-support?applicationType=mdr&market=${encodeURIComponent('EU / Notified Body')}`);
    expect(res.body.byType.mdr[1]).toEqual(single.body.markets[0]);
  });

  it('one type at a list of markets keeps the single answer, one row per market as asked', async () => {
    const res = await request(app).get(`/api/submissions/market-support?applicationType=mdr&market=${encodeURIComponent('EU / Notified Body,National competent authority')}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['applicationType', 'asOf', 'markets']);
    expect(res.body.markets.map((m: { market: string }) => m.market)).toEqual(['EU / Notified Body', 'National competent authority']);
  });

  it('repeats no type and no market', async () => {
    const res = await request(app).get('/api/submissions/market-support?applicationType=nda,nda,maa&market=FDA,FDA');
    expect(res.status).toBe(200);
    expect(res.body.applicationTypes).toEqual(['nda', 'maa']);
    expect(res.body.byType.nda).toHaveLength(1);
  });

  it('refuses a type the platform does not know, naming it, before any read', async () => {
    const res = await request(app).get('/api/submissions/market-support?applicationType=nda,not_a_type');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(res.body.error.message).toContain('not_a_type');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('takes every type the platform knows in one read, and refuses a list longer than 100 entries before any read', async () => {
    const all = await request(app).get(`/api/submissions/market-support?applicationType=${[...VALID_PROGRAM_TYPES].join(',')}`);
    expect(all.status).toBe(200);
    expect(Object.keys(all.body.byType).sort()).toEqual([...VALID_PROGRAM_TYPES].sort());
    expect(db.query).toHaveBeenCalledTimes(1);
    expect((await request(app).get(`/api/submissions/market-support?applicationType=${Array(100).fill('nda').join(',')}`)).status).toBe(200);
    db.query.mockClear();
    const res = await request(app).get(`/api/submissions/market-support?applicationType=${Array(101).fill('nda').join(',')}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('every type the New project picker can ask, for every catalog filing in every lane, is a type the list accepts', () => {
    // The picker asks programTypeFor of each catalog row, with the lane the wizard is in (Projects.tsx SEG2REG keys).
    const lanes = ['biotech', 'pharma', 'medtech', 'diagnostics', 'cro', 'health'];
    const asked = new Set(FILING_CATALOG.flatMap((e) => lanes.map((lane) =>
      programTypeFor({ id: e.id, label: e.id, pathway: e.pathwayKey || 'ctd' }, lane))));
    expect([...asked].filter((t) => !VALID_PROGRAM_TYPES.has(t))).toEqual([]);
    expect(asked.size).toBeLessThanOrEqual(100);
  });

  it('keeps the single-type answer exactly as it was for every existing caller', async () => {
    const res = await request(app).get('/api/submissions/market-support?applicationType=nda&market=FDA');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['applicationType', 'asOf', 'markets']);
    expect(res.body.applicationType).toBe('nda');
    expect(res.body.markets).toHaveLength(1);
    // A type outside the known list is still answered, as before, with the server's own refusal on the row.
    const unknown = await request(app).get('/api/submissions/market-support?applicationType=blocked&market=FDA');
    expect(unknown.status).toBe(200);
    expect(unknown.body.markets[0].offer.tier).toBe('not_offered');
  });
});

/* L9's asks, 2026-11-09: never split by position alone, and cap the product of the two lists. */
describe('GET /api/submissions/market-support keys answers and caps the product', () => {
  it('keys each answer by its own type and market, and refuses answers out of step with the request', async () => {
    const { marketSupportByType } = await import('../submissions');
    const inputs = [{ applicationType: 'nda', market: 'FDA' }, { applicationType: 'maa', market: 'EMA' }];
    const row = (applicationType: string, market: string) => ({ applicationType, market, offer: 'x' });
    expect(marketSupportByType(inputs, [row('nda', 'FDA'), row('maa', 'EMA')])).toEqual({ nda: [row('nda', 'FDA')], maa: [row('maa', 'EMA')] });
    expect(marketSupportByType(inputs, [row('maa', 'EMA'), row('nda', 'FDA')])).toBeNull();
    expect(marketSupportByType(inputs, [row('nda', 'FDA')])).toBeNull();
    expect(marketSupportByType(inputs, [row('nda', 'FDA'), row('maa', 'FDA')])).toBeNull();
  });

  it('refuses more type and market pairs than can be read at once, in words, before any read', async () => {
    const markets = Array.from({ length: 26 }, (_, i) => `M${i}`).join(',');
    const res = await request(app).get(`/api/submissions/market-support?applicationType=${[...VALID_PROGRAM_TYPES].join(',')}&market=${markets}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/at most 1600 can be read at once/);
  });
});
