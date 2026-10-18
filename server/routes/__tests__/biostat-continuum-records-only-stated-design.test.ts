/**
 * The biostat continuum records the protocol it was given, and a SAP it cannot
 * build is refused by name rather than drafted around an invented input.
 *
 * POST /api/biostat/continuum/initialize stored `sampleSize: req.body.sampleSize
 * || 200`, so a thread opened without a sample size carried 200 into every SAP
 * drafted from it. PUT /continuum/:threadId/sap then answered any failure as a
 * 500. The real continuum and SAP services run here; only the database and the
 * session are replaced.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

const S = vi.hoisted(() => ({
  inserts: [] as Array<Record<string, unknown>>,
  thread: null as null | Record<string, unknown>,
}));

vi.mock('../../db', () => {
  const q = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: async () => [],
    limit: async () => (S.thread ? [S.thread] : []),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        S.inserts.push(v);
        return { returning: async () => [{ id: 17, ...v }] };
      },
    }),
    update: () => ({ set: (v: Record<string, unknown>) => ({ where: () => ({ returning: async () => [{ ...S.thread, ...v }] }) }) }),
  });
  return { pool: { query: q, connect: vi.fn() }, getPool: () => ({ query: q, connect: vi.fn() }), db: chain };
});

vi.mock('../../middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/auth')>();
  return {
    ...actual,
    authenticateToken: (req: any, _res: any, next: any) => {
      req.user = { id: 1, organizationId: 7 };
      next();
    },
  };
});

const { default: biostatRouter } = await import('../biostatPlatform');

const app = express();
app.use(express.json());
app.use('/api/biostat', biostatRouter);

beforeEach(() => {
  S.inserts.length = 0;
  S.thread = null;
  // A SAP with a protocol id is written under data/sap; not from a test.
  vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
});

describe('POST /api/biostat/continuum/initialize', () => {
  it('records no sample size when none was given', async () => {
    const res = await request(app)
      .post('/api/biostat/continuum/initialize')
      .send({ title: 'NSCLC P3', indication: 'NSCLC', phase: 'Phase 3', endpoints: ['Overall survival'] });
    expect(res.status).toBe(200);
    const snapshot = S.inserts[0]?.protocolSnapshot as Record<string, unknown>;
    expect(snapshot.sampleSize, 'a sample size nobody gave was recorded').toBeUndefined();
  });

  it('refuses a sample size it cannot use rather than storing it', async () => {
    const res = await request(app)
      .post('/api/biostat/continuum/initialize')
      .send({ title: 'NSCLC P3', indication: 'NSCLC', phase: 'Phase 3', endpoints: ['OS'], sampleSize: 'about two hundred' });
    expect(res.status).toBe(400);
    expect(S.inserts).toEqual([]);
  });

  it('records the sample size that was given', async () => {
    await request(app)
      .post('/api/biostat/continuum/initialize')
      .send({ title: 'NSCLC P3', indication: 'NSCLC', phase: 'Phase 3', endpoints: ['OS'], sampleSize: 450 });
    expect((S.inserts[0].protocolSnapshot as Record<string, unknown>).sampleSize).toBe(450);
  });
});

describe('PUT /api/biostat/continuum/:threadId/sap', () => {
  it('refuses, naming the input, a SAP for a thread whose protocol has no sample size', async () => {
    S.thread = {
      id: 9,
      organizationId: 7,
      protocolId: null,
      protocolSnapshot: { title: 'NSCLC P3', indication: 'NSCLC', phase: 'Phase 3', primaryEndpoint: 'Overall survival' },
    };
    const res = await request(app).put('/api/biostat/continuum/9/sap').send({});
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(422);
    expect(res.body.details).toMatchObject({ fields: ['sample_size'] });
  });

  it('drafts the SAP from what the protocol states, and says what was not recorded', async () => {
    S.thread = {
      id: 9,
      organizationId: 7,
      protocolId: null,
      protocolSnapshot: { title: 'NSCLC P3', indication: 'NSCLC', phase: 'Phase 3', primaryEndpoint: 'Overall survival', sampleSize: 450 },
    };
    const res = await request(app).put('/api/biostat/continuum/9/sap').send({});
    expect(res.status).toBe(200);
    expect(res.body.data.sapContent).toContain('Sample Size: 450 participants (dropout rate not specified');
    expect(res.body.data.assumptionCapture).toMatchObject({ recorded: false, reason: 'no_project_context' });
  });
});
