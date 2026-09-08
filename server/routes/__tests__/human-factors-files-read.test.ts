/**
 * GET + POST /api/human-factors — the HFE/UE file read + write path.
 *
 * The route is thin: guard the org, delegate to the real hf_engineering_files
 * service, and (on read) join the org's hazard-related use scenarios from the
 * existing c2c_hf_scenarios store. Locks: 403 without org; GET projects the
 * real-store file + scenarios with meta.source = hf_engineering_files; GET
 * fail-closed to an honest empty envelope on a missing store (42P01); POST records
 * a file (the real write path), audited HF_FILE_RECORDED; POST 400 on invalid
 * input. (The full store round-trip is proven in
 * hf-files-service.pglite.integration.test.ts; the scenario write contract in
 * human-factors-write.test.ts.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { createHfFile, listHfFiles, HfFileValidationError, logAction, query } = vi.hoisted(() => {
  class HfFileValidationError extends Error {}
  return { createHfFile: vi.fn(), listHfFiles: vi.fn(), HfFileValidationError, logAction: vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })), query: vi.fn() };
});
vi.mock('../../services/human-factors/hf-files-service', () => ({ createHfFile, listHfFiles, HfFileValidationError }));
vi.mock('../../services/auditService', () => ({ default: { logAction } }));
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('../../middleware/auth', () => ({
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import hfRouter from '../human-factors';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: 55 };
    next();
  });
  app.use('/api/human-factors', hfRouter);
  return app;
}

beforeEach(() => { createHfFile.mockReset(); listHfFiles.mockReset(); logAction.mockReset(); query.mockReset(); });

describe('GET /api/human-factors', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/human-factors');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORG_REQUIRED');
    expect(listHfFiles).not.toHaveBeenCalled();
  });

  it('projects the real-store file + scenarios, source = hf_engineering_files', async () => {
    listHfFiles.mockResolvedValueOnce([
      { id: 'hf-1', device: 'DxAssay — RT-PCR companion diagnostic', framework: 'IEC 62366-1', present: { useSpecification: true, hfeUeReport: false } },
    ]);
    query.mockResolvedValueOnce({
      rows: [{ task: 'Result interpretation', useError: 'Misread borderline', potentialHarmSeverity: 'critical', mitigated: false }],
    });
    const res = await request(appWith(9)).get('/api/human-factors');
    expect(res.status).toBe(200);
    expect(listHfFiles).toHaveBeenCalledWith(9);
    // Scenario read is org + file scoped.
    expect(query.mock.calls[0][1]).toEqual([9, 'hf-1']);
    expect(res.body.data.device).toBe('DxAssay — RT-PCR companion diagnostic');
    expect(res.body.data.present.useSpecification).toBe(true);
    expect(res.body.data.scenarios).toHaveLength(1);
    expect(res.body.data.scenarios[0].task).toBe('Result interpretation');
    expect(res.body.meta.source).toBe('hf_engineering_files');
    expect(res.body.meta.count).toBe(1);
  });

  it('honest empty envelope when the org has no file', async () => {
    listHfFiles.mockResolvedValueOnce([]);
    const res = await request(appWith(9)).get('/api/human-factors');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(res.body.meta.count).toBe(0);
    expect(res.body.meta.source).toBe('hf_engineering_files');
    expect(query).not.toHaveBeenCalled(); // no scenario read without a file
  });

  it('fails closed to an empty envelope when the store is missing (42P01)', async () => {
    listHfFiles.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(9)).get('/api/human-factors');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(res.body.meta.pendingStore).toBe(true);
  });
});

describe('POST /api/human-factors', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).post('/api/human-factors').send({ device: 'DxAssay' });
    expect(res.status).toBe(403);
    expect(createHfFile).not.toHaveBeenCalled();
  });

  it('records a file, returns its shape, and audits HF_FILE_RECORDED', async () => {
    createHfFile.mockResolvedValueOnce({
      id: 'hf-9', device: 'DxAssay — RT-PCR companion diagnostic', framework: 'IEC 62366-1',
      present: { useSpecification: true },
    });
    const res = await request(appWith(9)).post('/api/human-factors').send({
      device: 'DxAssay — RT-PCR companion diagnostic', framework: 'IEC 62366-1', present: { useSpecification: true },
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('hf-9');
    expect(res.body.data.device).toBe('DxAssay — RT-PCR companion diagnostic');
    expect(res.body.data.scenarios).toEqual([]); // a fresh file has no scenarios yet
    // Service called with parsed body + acting user as createdBy; audited.
    expect(createHfFile).toHaveBeenCalledWith(9, expect.objectContaining({
      device: 'DxAssay — RT-PCR companion diagnostic', createdBy: 55,
    }));
    expect(logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'HF_FILE_RECORDED', resourceType: 'hf_engineering_file', resourceId: 'hf-9',
    }));
  });

  it('400 on invalid input', async () => {
    createHfFile.mockRejectedValueOnce(new HfFileValidationError('device is required.'));
    const res = await request(appWith(9)).post('/api/human-factors').send({ present: {} });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(logAction).not.toHaveBeenCalled();
  });
});
