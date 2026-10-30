/**
 * A meeting on a submission is recorded or moved only by someone who may
 * change that submission's project (P-39 step 4, 2026-10-30). The org editor
 * gate alone let any editor record a meeting on a program they cannot open.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { createInteractionTx, admit, query } = vi.hoisted(() => ({
  createInteractionTx: vi.fn(async () => ({ id: 3 })),
  admit: vi.fn(),
  query: vi.fn(),
}));
vi.mock('../../services/ha-interactions/ha-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/ha-interactions/ha-service')>()),
  createInteractionTx,
}));
const client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
vi.mock('../../db', () => ({ pool: { connect: vi.fn(async () => client), query: vi.fn() } }));
vi.mock('../../db/requestDb', () => ({ requestPgClient: () => ({ query }) }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: vi.fn(async () => ({ actionId: 'a1' })), verifyReauth: vi.fn() }));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn() }));
vi.mock('../../middleware/orgMembership', () => ({ requireEditorAccessForWrites: (_q: Request, _s: Response, n: NextFunction) => n() }));
vi.mock('../c2c/project-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../c2c/project-access')>()),
  requireProjectAdmission: (...a: unknown[]) => admit(...a),
}));

import router from '../ha-interactions';
import { ProjectAdmissionRefusal } from '../c2c/project-access';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: 7 };
    next();
  });
  a.use('/api/ha-interactions', router);
  return a;
}
const body = { interactionType: 'pre_ind', agency: 'fda', title: 'Pre-IND meeting', submissionId: 41, reason: 'Meeting granted by FDA' };

beforeEach(() => {
  createInteractionTx.mockClear(); admit.mockReset(); query.mockReset();
  query.mockResolvedValue({ rows: [{ id: 12 }] }); // the submission's project
});

describe('POST /api/ha-interactions/interactions', () => {
  it("is refused, with nothing recorded, when the person may not change the submission's project", async () => {
    admit.mockRejectedValue(new ProjectAdmissionRefusal(403, 'PROJECT_PERMISSION_DENIED', 'You do not have edit permission on this project.'));
    const r = await request(app()).post('/api/ha-interactions/interactions').send(body);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('PROJECT_PERMISSION_DENIED');
    expect(admit).toHaveBeenCalledWith(expect.anything(), '12', true);
    expect(createInteractionTx).not.toHaveBeenCalled();
  });

  it('records it when the project admits the write', async () => {
    admit.mockResolvedValue({});
    const r = await request(app()).post('/api/ha-interactions/interactions').send(body);
    expect(r.status).toBe(201);
    expect(createInteractionTx).toHaveBeenCalledTimes(1);
  });

  it('refuses a submission that is not one of a project here, and a date that is not a date', async () => {
    query.mockResolvedValue({ rows: [] });
    expect((await request(app()).post('/api/ha-interactions/interactions').send(body)).status).toBe(404);
    const bad = await request(app()).post('/api/ha-interactions/interactions').send({ ...body, scheduledDate: 'next week' });
    expect(bad.status).toBe(400);
    expect(createInteractionTx).not.toHaveBeenCalled();
  });
});
