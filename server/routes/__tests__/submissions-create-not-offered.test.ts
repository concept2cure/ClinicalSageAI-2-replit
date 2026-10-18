/**
 * POST /api/submissions refuses a market the platform does not offer (filing-
 * spine design review, item 6, 2026-10-15). The market statement said "Not
 * offered: the UK has no IND application type" and a UK IND could still be
 * created. The statement is the server's own (market-support.ts), read from the
 * active rule packs; a market it offers is created as before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-create-not-offered-secret-32';
});

const db = vi.hoisted(() => ({ query: vi.fn() }));
const sharedPool = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db.js', async (importOriginal) => ({ ...(await importOriginal<object>()), pool: sharedPool }));
vi.mock('../../db', async (importOriginal) => ({ ...(await importOriginal<object>()), pool: sharedPool }));
const { createSubmission } = vi.hoisted(() => ({ createSubmission: vi.fn() }));
vi.mock('../../services/submission-service/submission-service', async (importOriginal) => ({
  ...(await importOriginal<object>()), createSubmission,
}));

import request from 'supertest';
import express from 'express';
import { expandRoleClaims } from '../../middleware/auth';
import submissionsRouter from '../submissions';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 3, userId: 3, organizationId: 7, role: 'member', roles: expandRoleClaims('regulatory-author', undefined) };
  req.dbClient = db;
  next();
});
app.use('/api/submissions', submissionsRouter);

const PACKS = ['ind:fda', 'ind:mhra', 'nda:fda', 'maa:ema'].map((k) => {
  const [doc_type, agency] = k.split(':');
  return { doc_type, agency, version: 'v', label: k };
});
const body = (applicationType: string, primaryRegion: string) => ({
  title: 'T', programId: '11111111-1111-4111-8111-111111111111', applicationType, clientType: 'pharma', primaryRegion,
});

beforeEach(() => {
  db.query.mockReset();
  createSubmission.mockReset();
  db.query.mockImplementation(async (sql: string) => (/c2c_rule_packs/.test(sql) ? { rows: PACKS } : { rows: [] }));
  createSubmission.mockResolvedValue({ id: 77 });
});

describe('POST /api/submissions — a market the platform does not offer', () => {
  it('refuses a UK IND with the statement, and creates nothing', async () => {
    const res = await request(app).post('/api/submissions').send(body('ind', 'uk'));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('MARKET_NOT_OFFERED');
    expect(res.body.error.message).toMatch(/the UK has no IND/);
    expect(createSubmission).not.toHaveBeenCalled();
  });

  it('creates a US IND as before', async () => {
    const res = await request(app).post('/api/submissions').send(body('ind', 'fda'));
    expect(res.status).toBe(201);
    expect(createSubmission).toHaveBeenCalledTimes(1);
  });
});
