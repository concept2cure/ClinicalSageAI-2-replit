/**
 * GET/POST /api/labeling-smpc — EU SmPC QRD section authoring + readiness.
 *
 * Locks: 403 without org; the { data: { sections, ready, completenessPct,
 * outstanding } } envelope with live readiness from the persisted statuses;
 * only FINAL required sections count; fail-closed all-missing skeleton on 42P01;
 * POST validation + refreshed readiness; 503 on write to a missing store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import smpcRouter from '../labeling-smpc.routes';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/labeling-smpc', smpcRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/labeling-smpc', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/labeling-smpc');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORG_REQUIRED');
  });

  it('returns the QRD tree with live readiness from persisted statuses (only final counts)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { section_number: '1', status: 'final' },
        { section_number: '4.1', status: 'draft' }, // draft is not ready
      ],
    });
    const res = await request(appWith(7)).get('/api/labeling-smpc');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const { data } = res.body;
    expect(data.sections.length).toBeGreaterThan(20); // full QRD tree
    expect(data.ready).toBe(false);
    expect(data.finalRequired).toBe(1);
    expect(data.outstanding).toContain('4.1'); // draft doesn't satisfy readiness
    expect(data.sections.find((s: { number: string }) => s.number === '4.1').status).toBe('draft');
  });

  it('fails closed to the all-missing skeleton on a missing store (42P01)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/labeling-smpc');
    expect(res.status).toBe(200);
    expect(res.body.data.ready).toBe(false);
    expect(res.body.data.finalRequired).toBe(0);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});

describe('POST /api/labeling-smpc', () => {
  it('rejects an unknown section or status', async () => {
    const r1 = await request(appWith(7)).post('/api/labeling-smpc').send({ sectionNumber: '99', status: 'final' });
    expect(r1.status).toBe(400);
    const r2 = await request(appWith(7)).post('/api/labeling-smpc').send({ sectionNumber: '4.1', status: 'signed' });
    expect(r2.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('sets a section status and returns refreshed readiness', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // upsert
      .mockResolvedValueOnce({ rows: [{ section_number: '4.1', status: 'final' }] }); // re-read
    const res = await request(appWith(7)).post('/api/labeling-smpc').send({ sectionNumber: '4.1', status: 'final' });
    expect(res.status).toBe(200);
    expect(res.body.data.sections.find((s: { number: string }) => s.number === '4.1').status).toBe('final');
    expect(res.body.meta.updated).toBe(true);
  });

  it('503 PENDING_STORE when the store is missing (42P01)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).post('/api/labeling-smpc').send({ sectionNumber: '4.1', status: 'final' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PENDING_STORE');
  });
});
