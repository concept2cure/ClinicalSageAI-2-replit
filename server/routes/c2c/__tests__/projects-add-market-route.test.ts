/**
 * POST /api/c2c/projects/:id/markets (docs/design/FILING_SPINE.md F22): the
 * route's own decisions. A stated reason is required, only someone who may
 * change the project adds a market, and the service's refusal is the answer,
 * by its status and code, with the transaction rolled back. What the service
 * writes is held on PGlite in add-project-market.pglite.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
const release = vi.fn();
vi.mock('../../../db.js', () => ({
  pool: {
    query: (...a: unknown[]) => query(...a),
    connect: async () => ({ query: (...a: unknown[]) => query(...a), release }),
  },
}));
vi.mock('../../../services/c2c/current-program-access', async (original) => {
  const real = await original<typeof import('../../../services/c2c/current-program-access')>();
  return { ...real, ...(await import('./support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
});
const { addProjectMarket } = vi.hoisted(() => ({ addProjectMarket: vi.fn() }));
vi.mock('../../../services/c2c/add-project-market.js', async (original) => {
  const real = await original<typeof import('../../../services/c2c/add-project-market')>();
  return { ...real, addProjectMarket };
});

import projectsRouter from '../projects';
import { AddMarketRefusal } from '../../../services/c2c/add-project-market';
import { clearSeats, seatMember, seatProgram } from './support/current-member';

const ID = 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05';
const ORG = 7;
const LEAD = 3;
const OTHER = 99;
const BODY = { agency: 'EMA', applicationType: 'maa', reason: 'The EU filing starts this quarter' };

function appAs(userId: number, role: string) {
  seatMember(ORG, userId, role);
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const r = req as unknown as Record<string, unknown>;
    r.organizationId = ORG; r.userId = userId; r.userRole = role;
    r.dbClient = { query: (...a: unknown[]) => query(...a) };
    next();
  });
  app.use('/api/c2c/projects', projectsRouter);
  return app;
}

const sql = () => query.mock.calls.map((c) => String(c[0]));
const post = (userId: number, role: string, body: Record<string, unknown>) =>
  request(appAs(userId, role)).post(`/api/c2c/projects/${ID}/markets`).send(body);

beforeEach(() => {
  query.mockReset();
  release.mockReset();
  addProjectMarket.mockReset();
  query.mockImplementation(async (text: string) =>
    /lead_user_id/.test(String(text)) ? { rows: [{ lead_user_id: LEAD }] } : { rows: [] });
  clearSeats();
  seatProgram(ORG, ID);
});

describe('POST /:id/markets', () => {
  it('adds the market for the project lead, with the stated reason, and commits', async () => {
    addProjectMarket.mockResolvedValue({ documentId: 'doc_m', sectionCount: 12, submissionId: 56, agency: 'EMA' });
    const res = await post(LEAD, 'member', BODY);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ok: true, documentId: 'doc_m', submissionId: 56 });
    expect(addProjectMarket).toHaveBeenCalledWith(expect.objectContaining({
      orgId: ORG, userId: LEAD, programId: ID, agency: 'EMA', applicationType: 'maa', reason: BODY.reason,
    }));
    expect(sql()).toContain('COMMIT');
  });

  it('a market with no stated reason is refused, and nothing is attempted', async () => {
    const res = await post(LEAD, 'member', { agency: 'EMA', applicationType: 'maa' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('REASON_REQUIRED');
    expect(addProjectMarket).not.toHaveBeenCalled();
  });

  it('someone who may not change the project is refused, and nothing is attempted', async () => {
    const res = await post(OTHER, 'member', BODY);
    expect(res.status).toBe(403);
    expect(addProjectMarket).not.toHaveBeenCalled();
    expect(sql()).not.toContain('COMMIT');
  });

  it("the service's refusal is the answer, and the transaction is rolled back", async () => {
    addProjectMarket.mockRejectedValue(new AddMarketRefusal(422, 'MARKET_NOT_OFFERED', 'Not offered: the UK has no IND application type. Nothing was added.'));
    const res = await post(LEAD, 'member', { ...BODY, agency: 'MHRA', applicationType: 'ind' });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'MARKET_NOT_OFFERED', message: 'Not offered: the UK has no IND application type. Nothing was added.' });
    expect(sql()).toContain('ROLLBACK');
    expect(sql()).not.toContain('COMMIT');
  });
});
