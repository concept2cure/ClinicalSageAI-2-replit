/**
 * POST /api/fda-forms/project/:projectId/generate-stage/:stage drafts each of
 * the stage's forms under its FDAFormsRegistry key, names a stage form the
 * registry does not define as not supported without attempting it, and refuses
 * a stage it does not define.
 *
 * What the route used to do (until 2026-10-15): its stage map listed
 * 'form_3514', 'form_3601', … — ids no registry key matches (the registry's are
 * 'FDA_3514', …) — so every form of every stage failed to draft ("Form
 * form_3514 not found in registry"), and the run reported each as an error.
 * Forms 3429, 3500A, 3419 and 3417, which the registry does not define, were
 * attempted the same way. A stage it did not define answered 200 success with
 * nothing drafted.
 *
 * The database and the orchestration service are doubles; the router, the form
 * generator and the registry are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { getTableName } from 'drizzle-orm';

const S = vi.hoisted(() => ({ rows: {} as Record<string, Array<Record<string, unknown>>> }));

function chain(table: unknown) {
  const name = getTableName(table as Parameters<typeof getTableName>[0]);
  const read = (): Promise<Array<Record<string, unknown>>> => Promise.resolve(S.rows[name] ?? []);
  return { where: () => Object.assign(read(), { limit: () => read() }) };
}

vi.mock('../../db', () => ({
  db: {
    select: () => ({ from: (table: unknown) => chain(table) }),
    execute: async () => ({ rows: [] }),
  },
}));
vi.mock('../../services/DocumentOrchestrationService', () => ({ default: class {} }));

import router from '../fda-forms.routes';
import FDAFormGenerator from '../../services/FDAFormGenerator';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: 7 };
    next();
  });
  a.use('/api/fda-forms', router);
  return a;
}

beforeEach(() => {
  vi.restoreAllMocks();
  S.rows = {
    fda_510k_projects: [{ id: 1, projectId: 12, organizationId: 7, deviceName: 'Widget', metadata: {} }],
    projects: [{ id: 12 }],
    organizations: [{ id: 7, name: 'Acme Devices' }],
    fda_510k_stage_progress: [],
    project_charters: [],
  };
});

type StageResult = { formId: string | null; formNumber: string; status: string; reason?: string };

describe('POST /api/fda-forms/project/:projectId/generate-stage/:stage', () => {
  it("drafts each of the stage's forms under its registry key", async () => {
    const r = await request(app()).post('/api/fda-forms/project/12/generate-stage/0');

    const results = r.body.results as StageResult[];
    expect(results.map((x) => [x.formId, x.status]), 'a stage form was drafted under an id the registry does not hold').toEqual([
      ['FDA_3514', 'success'],
      ['FDA_3601', 'success'],
    ]);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it('names a stage form the registry does not define as not supported, and does not attempt it', async () => {
    const draft = vi.spyOn(FDAFormGenerator.prototype, 'generateSmartForm');
    const r = await request(app()).post('/api/fda-forms/project/12/generate-stage/4');

    expect(draft, 'a form the registry does not define was attempted').not.toHaveBeenCalled();
    expect(r.body.results).toEqual([
      { formId: null, formNumber: '3429', status: 'not_supported', reason: expect.stringMatching(/3429.*not in the forms registry/) },
      { formId: null, formNumber: '3500A', status: 'not_supported', reason: expect.stringMatching(/3500A.*not in the forms registry/) },
    ]);
    expect(r.status).toBe(207);
    expect(r.body).toMatchObject({ success: false, totalGenerated: 0, totalNotSupported: 2, totalFailed: 0 });
  });

  it('refuses a stage it does not define, naming it', async () => {
    const r = await request(app()).post('/api/fda-forms/project/12/generate-stage/9');

    expect(r.status, 'an undefined stage answered as a run that drafted nothing').toBe(400);
    expect(r.body.error).toMatch(/stage/i);
  });
});
