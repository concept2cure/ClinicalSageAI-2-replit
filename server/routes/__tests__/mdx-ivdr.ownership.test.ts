import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));
vi.mock('../../services/auditService', () => ({ default: { logAction: vi.fn() } }));

import router from '../mdx-ivdr';

const PROGRAM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 42, organizationId: 7 };
    next();
  });
  instance.use('/api/mdx', router);
  return instance;
}

beforeEach(() => query.mockReset());

function expectOnlyOwnershipRead(table: string) {
  expect(query).toHaveBeenCalledTimes(1);
  expect(String(query.mock.calls[0][0])).toContain(table);
  expect(query.mock.calls[0][1]).toEqual(expect.arrayContaining([7]));
}

describe('MDx IVDR linked-resource ownership', () => {
  it('rejects a foreign program before classification creation', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app()).post('/api/mdx/ivdr/classifications').send({
      programId: PROGRAM, deviceName: 'Assay A', ivdrClass: 'C', rationale: 'Rule 3',
    });
    expect(res.status).toBe(404);
    expectOnlyOwnershipRead('regulatory_programs');
  });

  it('rejects a foreign program before PER creation', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app()).post('/api/mdx/ivdr/per').send({
      programId: PROGRAM, deviceName: 'Assay A', perVersion: '1.0', artifactId: 91,
    });
    expect(res.status).toBe(404);
    expectOnlyOwnershipRead('regulatory_programs');
  });

  it('rejects a foreign artifact before PER creation', async () => {
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }).mockResolvedValueOnce({ rows: [] });
    const res = await request(app()).post('/api/mdx/ivdr/per').send({
      programId: PROGRAM, deviceName: 'Assay A', perVersion: '1.0', artifactId: 91,
    });
    expect(res.status).toBe(404);
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1][0])).toContain('concept2cure_artifacts');
    expect(query.mock.calls[1][1]).toEqual([91, 7]);
    expect(query.mock.calls.some((call) => String(call[0]).includes('INSERT INTO ivdr_per_documents'))).toBe(false);
  });

  it('rejects reassignment of a classification to a foreign program', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app()).patch('/api/mdx/ivdr/classifications/12').send({ programId: PROGRAM });
    expect(res.status).toBe(404);
    expectOnlyOwnershipRead('regulatory_programs');
  });

  it('rejects reassignment of a PER to a foreign artifact', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app()).patch('/api/mdx/ivdr/per/12').send({ artifactId: 91 });
    expect(res.status).toBe(404);
    expectOnlyOwnershipRead('concept2cure_artifacts');
  });
});

describe('MDx IVDR PER lifecycle', () => {
  it('requires every new PER to begin as draft', async () => {
    const res = await request(app()).post('/api/mdx/ivdr/per').send({
      deviceName: 'Assay A', perVersion: '1.0', perStatus: 'approved',
    });
    expect(res.status).toBe(422);
    expect(query).not.toHaveBeenCalled();
  });

  it('allows the governed draft to review transition', async () => {
    query.mockResolvedValueOnce({ rows: [{ per_status: 'draft' }] })
      .mockResolvedValueOnce({ rows: [{ id: 12, per_status: 'review' }] });
    const res = await request(app()).patch('/api/mdx/ivdr/per/12').send({ perStatus: 'review' });
    expect(res.status).toBe(200);
    const update = query.mock.calls[1];
    expect(String(update[0])).toContain('AND per_status =');
    expect(update[1]).toEqual(['review', 12, 7, 'draft']);
  });

  it('rejects reverse and skipped transitions', async () => {
    query.mockResolvedValueOnce({ rows: [{ per_status: 'draft' }] });
    const res = await request(app()).patch('/api/mdx/ivdr/per/12').send({ perStatus: 'approved' });
    expect(res.status).toBe(409);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('prevents approved content from being silently overwritten', async () => {
    query.mockResolvedValueOnce({ rows: [{ per_status: 'approved' }] });
    const res = await request(app()).patch('/api/mdx/ivdr/per/12').send({ benefitRiskConclusion: 'replacement' });
    expect(res.status).toBe(409);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('permits approved to superseded without rewriting content', async () => {
    query.mockResolvedValueOnce({ rows: [{ per_status: 'approved' }] })
      .mockResolvedValueOnce({ rows: [{ id: 12, per_status: 'superseded' }] });
    const res = await request(app()).patch('/api/mdx/ivdr/per/12').send({ perStatus: 'superseded' });
    expect(res.status).toBe(200);
  });

  it('detects a stale concurrent status update', async () => {
    query.mockResolvedValueOnce({ rows: [{ per_status: 'review' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app()).patch('/api/mdx/ivdr/per/12').send({ perStatus: 'approved' });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toMatch(/concurrently/i);
  });
});
