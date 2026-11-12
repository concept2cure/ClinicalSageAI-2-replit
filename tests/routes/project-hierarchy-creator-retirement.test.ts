/** Child creation uses canonical project intake; hierarchy reads/moves remain.
 *
 * S12 (`804956d0db`, 2026-11-09) kept the children read and governed it: it names its program, is admitted as the
 * project page is (program admission, then the anchor's read admission, then the project proven inside the anchor's
 * tree) and reads on the request's tenant-scoped connection, never the shared pool. The admissions are doubled here;
 * their real behaviour under forced row-level security is tests/db/work-projects.dbtest.ts. */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  pool: vi.fn(async () => ({ rows: [] })),
  client: vi.fn(async () => ({ rows: [] })),
  programAccess: vi.fn(async () => ({ projectId: 4 })),
  admit: vi.fn(async () => ({})),
  within: vi.fn(async () => true),
}));
vi.mock('../../server/db', () => ({ db: {}, getPool: () => ({ query: H.pool }) }));
vi.mock('../../server/services/c2c/current-program-access', async (original) => ({
  ...(await original<typeof import('../../server/services/c2c/current-program-access')>()), requireCurrentProgramAccess: H.programAccess,
}));
vi.mock('../../server/routes/c2c/project-access', async (original) => ({
  ...(await original<typeof import('../../server/routes/c2c/project-access')>()), requireProjectAdmission: H.admit,
}));
vi.mock('../../server/services/c2c/program-project-anchor', async (original) => ({
  ...(await original<typeof import('../../server/services/c2c/program-project-anchor')>()), isWithinProgramAnchor: H.within,
}));
import router from '../../server/routes/project-hierarchy';

const PROGRAM = '9a7f0b10-0000-4000-8000-0000000012aa';
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.tenantContext = { organizationId: 1, clientWorkspaceId: 1 };
  req.user = { id: 7, organizationId: 1 };
  req.dbClient = { query: H.client }; next();
});
app.use('/api/project-hierarchy', router);
beforeEach(() => { for (const fn of Object.values(H)) fn.mockClear(); H.within.mockResolvedValue(true); });

describe('hierarchy creator retirement', () => {
  it('refuses the stale child-creation POST without querying or writing', async () => {
    const res = await request(app).post('/api/project-hierarchy/9/children').send({ name: 'Old child' });
    expect(res.status).toBe(404);
    expect(H.pool).not.toHaveBeenCalled();
    expect(H.client).not.toHaveBeenCalled();
  });

  it('retains scoped children reads and the existing move handler', async () => {
    const res = await request(app).get('/api/project-hierarchy/9/children').query({ programId: PROGRAM });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { parentId: 9, programId: PROGRAM, anchorProjectId: 4, children: [], total: 0 } });
    expect(H.programAccess).toHaveBeenCalledWith(expect.anything(), { organizationId: 1, userId: 7, programId: PROGRAM });
    expect(H.admit).toHaveBeenCalledWith(expect.anything(), '4', false, expect.objectContaining({ programId: PROGRAM }));
    expect(H.within).toHaveBeenCalledWith(expect.anything(), 1, 4, 9);
    expect(H.client).toHaveBeenCalledWith(expect.stringContaining('organization_id = $2'), [9, 1]);
    expect(H.pool).not.toHaveBeenCalled();
    expect(router.stack.some((layer: any) => layer.route?.path === '/:projectId/move' && layer.route?.methods?.patch)).toBe(true);
  });

  it('reads the children of a program whose id is not RFC-shaped, as every other program route does', async () => {
    // The GA demo seed's programs (scripts/seed/ga-demo.d/10-risk.mjs BX204_PROGRAM_ID) carry fixed ids whose
    // variant nibble is 4. Postgres holds them as uuid, and the other program routes accept them (guid).
    const seeded = '11111111-2222-3333-4444-000000000204';
    const res = await request(app).get('/api/project-hierarchy/9/children').query({ programId: seeded });
    expect(res.status).toBe(200);
    expect(H.programAccess).toHaveBeenCalledWith(expect.anything(), { organizationId: 1, userId: 7, programId: seeded });
    const notAnId = await request(app).get('/api/project-hierarchy/9/children').query({ programId: 'not-a-program-id' });
    expect(notAnId.status).toBe(400);
    expect(notAnId.body.error.code).toBe('INVALID_CHILDREN_READ');
  });

  it('refuses an unnamed program or a project outside its anchor without reading children', async () => {
    const unnamed = await request(app).get('/api/project-hierarchy/9/children');
    expect(unnamed.status).toBe(400);
    expect(unnamed.body.error.code).toBe('INVALID_CHILDREN_READ');
    expect(H.programAccess).not.toHaveBeenCalled();

    H.within.mockResolvedValue(false);
    const outside = await request(app).get('/api/project-hierarchy/9/children').query({ programId: PROGRAM });
    expect(outside.status).toBe(404);
    expect(outside.body.error.code).toBe('PARENT_NOT_IN_PROGRAM');
    expect(H.client).not.toHaveBeenCalled();
    expect(H.pool).not.toHaveBeenCalled();
  });
});
