/**
 * The two governed HFE/UE writes the v2 surface's safety-critical controls need.
 *
 * PATCH /scenarios/:id/mitigate is the write behind "Mitigate", and it is the
 * one that can move the IEC 62366-1 §5.9 summative-evaluation gate from BLOCKED
 * to CLEAR. Before it existed the button called setState and nothing else, so a
 * reviewer could watch that gate clear on screen against a record that still said
 * blocked. It is therefore governed like accepting agency label text: a
 * 21 CFR 11.10(e) reason for change is REQUIRED, and the audit entry carries both
 * sides of the change plus the severity of the task that was cleared.
 *
 * PATCH /elements is the write behind the HFE/UE element tiles, which drive a
 * file-completeness percentage. Completeness is still DERIVED from `present` on
 * read and never stored, so the figure and the record cannot drift.
 *
 * Locks below: the reason gate REFUSES (that is the check that matters — it is
 * shown failing, not only passing), 404 vs 409 are distinguished, the audit entry
 * carries the reason, and an unknown element key is rejected rather than written.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { query, logAction, listHfFiles, setHfFileElements, createHfFile, HfFileValidationError } =
  vi.hoisted(() => {
    class HfFileValidationError extends Error {}
    return {
      query: vi.fn(),
      logAction: vi.fn(),
      listHfFiles: vi.fn(),
      setHfFileElements: vi.fn(),
      createHfFile: vi.fn(),
      HfFileValidationError,
    };
  });

vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('../../services/auditService', () => ({ default: { logAction } }));
vi.mock('../../services/human-factors/hf-files-service', () => ({
  createHfFile,
  listHfFiles,
  setHfFileElements,
  HfFileValidationError,
  HF_ELEMENT_KEYS: [
    'useSpecification', 'userProfiles', 'useEnvironments', 'userInterfaceCharacteristics',
    'knownUseProblems', 'hazardRelatedUseScenarios', 'criticalTasks', 'formativeEvaluation',
    'summativeEvaluation', 'hfeUeReport',
  ],
}));
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

const MITIGATED_ROW = {
  id: 'hfs-1',
  task: 'Low-glucose alert response',
  useError: 'Alert dismissed without acting',
  potentialHarmSeverity: 'critical',
  mitigated: true,
};

const REASON = 'Alarm escalation redesign verified in formative round 3; risk control RC-14 documented';

beforeEach(() => {
  query.mockReset(); logAction.mockReset();
  listHfFiles.mockReset(); setHfFileElements.mockReset();
});

describe('PATCH /api/human-factors/scenarios/:id/mitigate', () => {
  it('403 without org context, and nothing is read or written', async () => {
    const res = await request(appWith(null))
      .patch('/api/human-factors/scenarios/hfs-1/mitigate')
      .send({ reasonForChange: REASON });
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('REFUSES a mitigation with no reason for change — nothing is written', async () => {
    const res = await request(appWith(7))
      .patch('/api/human-factors/scenarios/hfs-1/mitigate')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
    expect(query).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
  });

  it('REFUSES a reason too short to be one', async () => {
    const res = await request(appWith(7))
      .patch('/api/human-factors/scenarios/hfs-1/mitigate')
      .send({ reasonForChange: 'typo' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
    expect(query).not.toHaveBeenCalled();
  });

  it('records the mitigation org-scoped and audits it WITH the reason', async () => {
    query.mockResolvedValueOnce({ rows: [MITIGATED_ROW] });
    const res = await request(appWith(7))
      .patch('/api/human-factors/scenarios/hfs-1/mitigate')
      .send({ reasonForChange: REASON });

    expect(res.status).toBe(200);
    expect(res.body.data.mitigated).toBe(true);
    // The UPDATE is tenant-scoped and only flips a row that is NOT yet mitigated.
    const [sql, args] = query.mock.calls[0];
    expect(String(sql)).toContain('mitigated = false');
    expect(args).toEqual([7, 'hfs-1']);

    expect(logAction).toHaveBeenCalledTimes(1);
    const entry = logAction.mock.calls[0][0];
    expect(entry.action).toBe('HF_USE_SCENARIO_MITIGATED');
    expect(entry.organizationId).toBe(7);
    expect(entry.details.reasonForChange).toBe(REASON);
    // Both sides of the change, and the severity of what was cleared.
    expect(entry.details.previousMitigated).toBe(false);
    expect(entry.details.mitigated).toBe(true);
    expect(entry.details.potentialHarmSeverity).toBe('critical');
  });

  it('404 for a scenario that is not this org’s — never audited as a mitigation', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // update matched nothing
    query.mockResolvedValueOnce({ rows: [] }); // and the row does not exist here
    const res = await request(appWith(7))
      .patch('/api/human-factors/scenarios/hfs-nope/mitigate')
      .send({ reasonForChange: REASON });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(logAction).not.toHaveBeenCalled();
  });

  it('409 ALREADY_MITIGATED rather than a second audit entry for the same control', async () => {
    query.mockResolvedValueOnce({ rows: [] });                    // update matched nothing
    query.mockResolvedValueOnce({ rows: [{ mitigated: true }] }); // because it is already true
    const res = await request(appWith(7))
      .patch('/api/human-factors/scenarios/hfs-1/mitigate')
      .send({ reasonForChange: REASON });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_MITIGATED');
    expect(logAction).not.toHaveBeenCalled();
  });

  it('42P01 → 503 PENDING_STORE (fails closed, not silently)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: '42P01' }));
    const res = await request(appWith(7))
      .patch('/api/human-factors/scenarios/hfs-1/mitigate')
      .send({ reasonForChange: REASON });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PENDING_STORE');
  });
});

describe('PATCH /api/human-factors/elements', () => {
  it('rejects an element key the framework does not have — nothing is written', async () => {
    const res = await request(appWith(7))
      .patch('/api/human-factors/elements')
      .send({ element: 'somethingElse', present: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_ELEMENT');
    expect(setHfFileElements).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean value', async () => {
    const res = await request(appWith(7))
      .patch('/api/human-factors/elements')
      .send({ element: 'useEnvironments', present: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_BODY');
    expect(setHfFileElements).not.toHaveBeenCalled();
  });

  it('409 NO_FILE when the org has no HFE/UE file to record against', async () => {
    listHfFiles.mockResolvedValueOnce([]);
    const res = await request(appWith(7))
      .patch('/api/human-factors/elements')
      .send({ element: 'useEnvironments', present: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_FILE');
    expect(setHfFileElements).not.toHaveBeenCalled();
  });

  it('merges the element onto the stored map, returns what was STORED, and audits both sides', async () => {
    listHfFiles.mockResolvedValueOnce([
      { id: 'hf-1', device: 'BX-204 CGM', framework: 'IEC 62366-1', present: { useSpecification: true } },
    ]);
    setHfFileElements.mockResolvedValueOnce({
      id: 'hf-1', device: 'BX-204 CGM', framework: 'IEC 62366-1',
      present: { useSpecification: true, useEnvironments: true },
    });

    const res = await request(appWith(7))
      .patch('/api/human-factors/elements')
      .send({ element: 'useEnvironments', present: true });

    expect(res.status).toBe(200);
    expect(setHfFileElements).toHaveBeenCalledWith(7, 'hf-1', {
      useSpecification: true, useEnvironments: true,
    });
    // The response is the STORED map, so the surface's derived completeness
    // cannot disagree with the record.
    expect(res.body.data.present).toEqual({ useSpecification: true, useEnvironments: true });
    // And no completeness figure is stored anywhere.
    expect(JSON.stringify(res.body)).not.toContain('completeness');

    const entry = logAction.mock.calls[0][0];
    expect(entry.action).toBe('HF_FILE_ELEMENT_SET');
    expect(entry.details).toMatchObject({ element: 'useEnvironments', previousPresent: false, present: true });
  });
});
