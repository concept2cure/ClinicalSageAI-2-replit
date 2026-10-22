/**
 * POST /api/projects-management answers a create the organization's recorded
 * limit cannot decide with 403 QUOTA_NOT_RECORDED, carrying the service's
 * message and details.
 *
 * What it used to do (until 2026-10-15): only QUOTA_EXCEEDED was mapped (403,
 * error 'Quota exceeded'); atomicCreateProject's QUOTA_NOT_RECORDED for a NULL
 * max_projects fell through to 400 without its details.
 */
import { describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../../../tests/setup';

const REFUSAL = {
  success: false,
  error: 'QUOTA_NOT_RECORDED',
  message: 'The project limit is not recorded for this organization, so nothing was created.',
  details: { current: 3, maximum: null, remaining: null },
};

vi.mock('../../db', () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ id: 1 }]) })) })) })),
    insert: vi.fn(), delete: vi.fn(), update: vi.fn(),
  },
}));
vi.mock('@shared/schema', () => ({
  auditEvents: {},
  projects: { id: { name: 'id' }, organizationId: { name: 'organization_id' }, clientWorkspaceId: { name: 'client_workspace_id' } },
  clientWorkspaces: { id: { name: 'id' }, organizationId: { name: 'organization_id' } },
  organizations: { id: { name: 'id' } },
}));
vi.mock('../../services/rules-engine', () => ({ emitRuleEvent: vi.fn(async () => undefined) }));
vi.mock('../../services/atomicQuotaService.js', () => ({ atomicCreateProject: vi.fn(async () => REFUSAL) }));

describe('POST /api/projects-management — QUOTA_NOT_RECORDED', () => {
  it('is 403 with the service code, message and details', async () => {
    const router = (await import('../projects-management')).default;
    const layer = router.stack.find((l: any) => l.route?.path === '/' && l.route?.methods?.post) as any;
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    const req = createMockRequest({ body: { name: 'Quota Project', type: 'regulatory_submission', priority: 'medium', organizationId: 1 } }) as any;
    req.ip = '127.0.0.1';
    req.get = vi.fn(() => 'vitest');
    req.user = { organizationId: 1 };
    req.tenantContext = { organizationId: 1, clientWorkspaceId: 1 };
    req.headers = { 'x-organization-id': '1', 'x-client-workspace-id': '1' };
    const res = createMockResponse();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'QUOTA_NOT_RECORDED', message: REFUSAL.message, details: REFUSAL.details });
  });
});
