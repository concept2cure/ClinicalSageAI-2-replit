/**
 * A feature toggle trusts the X-Client-ID workspace only when the workspace is
 * the session's organisation's own.
 *
 * Security audit 2026-09-24, IAM-15 (plan P1-7, second half): the workspace
 * id in tenantContext comes straight from the client's X-Client-ID header
 * (middleware/tenantContext.ts), and this middleware handed it to the toggle
 * resolution unchecked, so a toggle enabled for one organisation's workspace
 * opened for any caller who named that workspace id. The organisation itself
 * is the session's, so the fix is one ownership read before the id counts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const service = vi.hoisted(() => ({
  isFeatureEnabled: vi.fn(async (..._args: any[]) => true),
  // Workspace 5 belongs to organisation 7; nothing else does.
  workspaceInOrganization: vi.fn(async (workspaceId: number, organizationId: number) => workspaceId === 5 && organizationId === 7),
}));
vi.mock('../../services/featureToggleService', () => ({ FeatureToggleService: service }));
vi.mock('../../utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }, default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { requireFeature } from '../featureToggleMiddleware';

function app(organizationId: string | null, clientWorkspaceId: string | null) {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).tenantContext = { organizationId, organizationUuid: null, clientWorkspaceId, module: null };
    next();
  });
  a.get('/gated', requireFeature('UNIFIED_REGULATORY_SUBMISSIONS'), (_req, res) => res.json({ reached: true }));
  return a;
}

beforeEach(() => {
  service.isFeatureEnabled.mockClear();
  service.workspaceInOrganization.mockClear();
});

describe('requireFeature and the X-Client-ID workspace', () => {
  it('resolves with the workspace when it is the organisation\'s own', async () => {
    const res = await request(app('7', '5')).get('/gated');
    expect(res.status).toBe(200);
    expect(service.workspaceInOrganization).toHaveBeenCalledWith(5, 7);
    expect(service.isFeatureEnabled).toHaveBeenCalledWith('UNIFIED_REGULATORY_SUBMISSIONS', 7, 5);
  });

  it('ignores a workspace of another organisation and resolves at organisation level', async () => {
    const res = await request(app('7', '9')).get('/gated');
    expect(res.status).toBe(200);
    expect(service.workspaceInOrganization).toHaveBeenCalledWith(9, 7);
    expect(service.isFeatureEnabled).toHaveBeenCalledWith('UNIFIED_REGULATORY_SUBMISSIONS', 7, undefined);
  });

  it('never trusts a workspace id when the session has no organisation to check it against', async () => {
    await request(app(null, '5')).get('/gated');
    expect(service.workspaceInOrganization).not.toHaveBeenCalled();
    expect(service.isFeatureEnabled).toHaveBeenCalledWith('UNIFIED_REGULATORY_SUBMISSIONS', undefined, undefined);
  });

  it('makes no ownership read when no workspace header was sent', async () => {
    await request(app('7', null)).get('/gated');
    expect(service.workspaceInOrganization).not.toHaveBeenCalled();
    expect(service.isFeatureEnabled).toHaveBeenCalledWith('UNIFIED_REGULATORY_SUBMISSIONS', 7, undefined);
  });

  it('a non-numeric workspace header is not a workspace', async () => {
    await request(app('7', 'abc')).get('/gated');
    expect(service.workspaceInOrganization).not.toHaveBeenCalled();
    expect(service.isFeatureEnabled).toHaveBeenCalledWith('UNIFIED_REGULATORY_SUBMISSIONS', 7, undefined);
  });

  it('a feature that is off is 404, whichever workspace was named', async () => {
    service.isFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app('7', '5')).get('/gated');
    expect(res.status).toBe(404);
  });
});
