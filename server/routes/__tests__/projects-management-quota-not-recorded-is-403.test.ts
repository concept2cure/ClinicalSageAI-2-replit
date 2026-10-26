/** The retired HTTP creator cannot reach the deferred quota service. Canonical
 * intake quota/anchor tests live under routes/c2c; atomic quota tests remain. */
import express from 'express';
import request from 'supertest';
import { expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({ create: vi.fn(), insert: vi.fn() }));
vi.mock('../../db', () => ({ db: { select: vi.fn(), insert: H.insert, delete: vi.fn(), update: vi.fn() } }));
vi.mock('../../services/rules-engine', () => ({ emitRuleEvent: vi.fn() }));
vi.mock('../../services/atomicQuotaService.js', () => ({ atomicCreateProject: H.create }));
import router from '../projects-management';

it('a stale project-create request is not a quota-service backdoor', async () => {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenantContext = { organizationId: 1, clientWorkspaceId: 1 };
    req.user = { id: 1, organizationId: 1 }; next();
  });
  app.use('/api/projects', router);
  const res = await request(app).post('/api/projects').send({ name: 'Stale project', organizationId: 1 });
  expect(res.status).toBe(404);
  expect(H.create).not.toHaveBeenCalled();
  expect(H.insert).not.toHaveBeenCalled();
});
