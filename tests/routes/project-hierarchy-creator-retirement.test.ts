/** Child creation uses canonical project intake; hierarchy reads/moves remain. */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({ query: vi.fn(async () => ({ rows: [] })) }));
vi.mock('../../server/db', () => ({ db: {}, getPool: () => ({ query: H.query }) }));
import router from '../../server/routes/project-hierarchy';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.tenantContext = { organizationId: 1, clientWorkspaceId: 1 };
  req.user = { id: 7, organizationId: 1 }; next();
});
app.use('/api/project-hierarchy', router);
beforeEach(() => H.query.mockClear());

describe('hierarchy creator retirement', () => {
  it('refuses the stale child-creation POST without querying or writing', async () => {
    const res = await request(app).post('/api/project-hierarchy/9/children').send({ name: 'Old child' });
    expect(res.status).toBe(404);
    expect(H.query).not.toHaveBeenCalled();
  });

  it('retains scoped children reads and the existing move handler', async () => {
    const res = await request(app).get('/api/project-hierarchy/9/children');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ parentId: 9, children: [], total: 0 });
    expect(H.query).toHaveBeenCalledWith(expect.stringContaining('organization_id = $2'), [9, 1]);
    expect(router.stack.some((layer: any) => layer.route?.path === '/:projectId/move' && layer.route?.methods?.patch)).toBe(true);
  });
});
