/** The legacy POST is retired before workspace/quota creation. Canonical
 * quota and accepted-anchor behavior is proved by c2c/projects create tests. */
import { describe, expect, it, vi } from 'vitest';

const { atomicCreateProject, insert } = vi.hoisted(() => ({ atomicCreateProject: vi.fn(), insert: vi.fn() }));

vi.mock('../../db', () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ id: 1 }]) })) })) })),
    insert, delete: vi.fn(), update: vi.fn(),
  },
}));
vi.mock('@shared/schema', () => ({
  auditEvents: {},
  projects: { id: { name: 'id' }, organizationId: { name: 'organization_id' }, clientWorkspaceId: { name: 'client_workspace_id' } },
  clientWorkspaces: { id: { name: 'id' }, organizationId: { name: 'organization_id' } },
  organizations: { id: { name: 'id' } },
}));
vi.mock('../../services/rules-engine', () => ({ emitRuleEvent: vi.fn(async () => undefined) }));
vi.mock('../../services/atomicQuotaService.js', () => ({ atomicCreateProject }));

describe('the retired legacy project creator', () => {
  it.each([1, 999])('returns 404 and never reaches quota creation for body org %s', async organizationId => {
    const express = (await import('express')).default;
    const request = (await import('supertest')).default;
    const router = (await import('../projects-management')).default;
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.tenantContext = { organizationId: 1, clientWorkspaceId: 1 };
      req.user = { id: 7, organizationId: 1 }; next();
    });
    app.use('/api/projects', router);
    const response = await request(app).post('/api/projects').send({ name: 'Retired creator', type: 'regulatory_submission', organizationId });
    expect(response.status).toBe(404);
    expect(atomicCreateProject).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
