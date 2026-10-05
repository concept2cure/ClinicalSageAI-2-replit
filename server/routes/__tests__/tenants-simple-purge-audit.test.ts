/**
 * POST /api/tenants/:id/purge hands the purge what its audit row records
 * (P1-23 part, DP-10 residual).
 *
 * The purge writes one chained audit row naming who purged, from where, and on
 * what evidence (server/services/tenant/tenant-offboarding.ts). The route is
 * where "who" and "from where" are known: these cases pin that it passes the
 * authenticated platform administrator, the request's IP and user agent, that
 * an unattributable purge is answered as a refusal rather than a conflict, and
 * that a purge which failed (its audit row refused, say) answers 500 with no
 * error text.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@localhost:5432/test';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { authState, purgeTenant, grantQuery } = vi.hoisted(() => ({
  authState: { user: null as Record<string, unknown> | null },
  purgeTenant: vi.fn(),
  grantQuery: vi.fn(),
}));

vi.mock('postgres', () => ({ default: () => Object.assign(() => Promise.resolve([]), {}) }));
vi.mock('../../auth', () => ({
  authMiddleware: (req: Request, res: Response, next: NextFunction) => {
    if (!authState.user) return res.status(401).json({ error: 'unauthorized' });
    (req as unknown as { user: unknown }).user = authState.user;
    // server/auth.ts sets req.userId; the platform-grant lookup keys on it.
    (req as unknown as { userId: unknown }).userId = authState.user.id;
    next();
  },
}));
// Platform standing is an active platform_role_grants row, as in production —
// the request role is the tenant membership role and is not read (D6,
// docs/evidence/D6/2026-10-05-platform-standing/).
vi.mock('../../db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../db')>()),
  query: grantQuery,
}));
vi.mock('../../services/tenant/tenant-offboarding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/tenant/tenant-offboarding')>()),
  purgeTenant,
}));

const ORG = 515;
let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  authState.user = { id: 11, organizationId: 1, role: 'super_admin', roles: ['super_admin'] };
  // User 11 is the platform administrator by its grant row, not by `role` above.
  grantQuery.mockImplementation(async (sql: string, params?: unknown[]) => ({
    rows: /FROM platform_role_grants/.test(sql) && params?.[0] === 11
      && Array.isArray(params[1]) && (params[1] as string[]).includes('super_admin')
      ? [{ '?column?': 1 }] : [],
  }));
  purgeTenant.mockResolvedValue({
    organizationId: ORG,
    name: 'Acme Bio',
    status: 'purged',
    purgedAt: new Date('2026-10-01T06:00:00Z'),
    deletedRows: { projects: 4 },
    storageErasure: { objects: 0, deleted: 0, notDeleted: [] },
  });
  const router = (await import('../tenants-simple')).default;
  app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use('/api/tenants', router);
});

const post = () =>
  request(app)
    .post(`/api/tenants/${ORG}/purge`)
    .set('x-confirm-purge', `purge-org-${ORG}`)
    .set('x-forwarded-for', '203.0.113.9')
    .set('user-agent', 'ops-console/1.0')
    .send({ finalExportDigest: 'sha256:abc' });

describe('POST /api/tenants/:id/purge — what the audit row is told', () => {
  it('passes the platform administrator, and the request’s IP and user agent', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(purgeTenant).toHaveBeenCalledTimes(1);
    expect(purgeTenant.mock.calls[0][1]).toMatchObject({
      organizationId: ORG,
      purgedByUserId: 11,
      preconditions: { finalExportDigest: 'sha256:abc' },
      auditContext: { ipAddress: '203.0.113.9', userAgent: 'ops-console/1.0' },
    });
    expect(res.body.deletedRows).toEqual({ projects: 4 });
  });

  it('answers an unattributable purge as a refusal (403), not a conflict', async () => {
    const { OffboardingStateError } = await import('../../services/tenant/tenant-offboarding');
    purgeTenant.mockRejectedValueOnce(new OffboardingStateError('PURGE_ACTOR_REQUIRED', 'No actor'));
    const res = await post();
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PURGE_ACTOR_REQUIRED');
  });

  it('answers a failed purge (its audit row refused) with 500 and no error text', async () => {
    purgeTenant.mockRejectedValueOnce(new Error('audit store refused the row: permission denied for audit_logs'));
    const res = await post();
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/audit store|permission denied|audit_logs/);
  });
});
