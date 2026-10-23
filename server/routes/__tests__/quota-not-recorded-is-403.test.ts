/**
 * A create refused because the organization's limit is not recorded is a 403
 * that carries the service's code, message and details.
 *
 * What the routes used to do (until 2026-10-15): atomicQuotaService refuses a
 * NULL max_projects / max_users with QUOTA_NOT_RECORDED, and POST
 * /api/projects-management, POST /api/tenant-users and POST
 * /api/tenant-users/invitations/:id/accept fell through to 400 — "your request
 * is malformed" — for a well-formed request the organization's licence record
 * cannot decide, and dropped the details naming the missing ceiling.
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const REFUSAL = {
  success: false,
  error: 'QUOTA_NOT_RECORDED',
  message: 'The project limit is not recorded for this organization, so nothing was created.',
  details: { current: 3, maximum: null, remaining: null },
};

vi.mock('../../services/atomicQuotaService.js', () => ({
  atomicCreateProject: vi.fn(async () => REFUSAL),
  atomicCreateUser: vi.fn(async () => REFUSAL),
  atomicAcceptInvitation: vi.fn(async () => REFUSAL),
}));
vi.mock('../../db', () => {
  const query = vi.fn(async (sql: string) => {
    if (/FROM organization_users WHERE user_id/i.test(sql)) return { rows: [{ role: 'admin' }], rowCount: 1 };
    if (/invitations_for_member/i.test(sql)) return { rows: [{ organization_id: 7, status: 'pending' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  return { pool: { query }, transaction: vi.fn(), db: {} };
});
vi.mock('../../services/tenant/verified-org-scope', () => ({
  inVerifiedOrgScope: (_req: unknown, _org: unknown, _role: unknown, fn: () => unknown) => fn(),
}));
vi.mock('../../middleware/auth', () => ({ invalidateOrgMembershipCache: vi.fn() }));
vi.mock('../../middleware/requirePlatformAdmin', () => ({ holdsPlatformRole: vi.fn(async () => false) }));
vi.mock('../../services/tenant/invitation-delivery', () => ({ issueInvitation: vi.fn(), reissueForUnredeemedInvitee: vi.fn(async () => null) }));
vi.mock('../../services/password-setup-token', () => ({
  resolveAppBaseUrl: () => 'https://app.example.test',
  PublicOriginNotConfiguredError: class extends Error {},
}));
vi.mock('../../services/seat-licensing.js', () => ({
  checkSeatAvailability: async () => ({ allowed: true, state: 'ok', seatsPurchased: 10, seatsConsumed: 1 }),
  isSeatEnforcementOn: () => false,
}));

const { default: tenantUsers } = await import('../tenant-users');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, { user: { id: 42, organizationId: 7 }, userId: 42, tenantId: 7 });
  next();
});
app.use('/api/tenant-users', tenantUsers);

const expectRefusal = (res: request.Response) => {
  expect(res.status).toBe(403);
  expect(res.body).toEqual({ success: false, error: 'QUOTA_NOT_RECORDED', message: REFUSAL.message, details: REFUSAL.details });
};

describe('QUOTA_NOT_RECORDED is 403', () => {
  it('POST /api/tenant-users', async () => {
    const res = await request(app).post('/api/tenant-users').send({ email: 'new@example.test', name: 'New Member', role: 'member', organizationId: 7 });
    expectRefusal(res);
  });

  it('POST /api/tenant-users/invitations/:id/accept', async () => {
    const res = await request(app).post('/api/tenant-users/invitations/31/accept').send({});
    expectRefusal(res);
  });
});
