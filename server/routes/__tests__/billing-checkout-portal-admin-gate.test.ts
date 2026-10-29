/**
 * POST /api/billing/checkout, /dtc-checkout and /portal — who may buy, change
 * or manage the organisation's subscription (D2, fold billing into Licensing,
 * Part 1b; docs/evidence/D2-ONE-ANA/2026-10-29/fold-billing/).
 *
 * All three answered any authenticated member. A member could open a Stripe
 * Checkout that bills the organisation, activate the free tier, or open the
 * Stripe customer portal: payment methods, cancellation, and the invoice
 * history the invoice route itself refuses a member since Part 1. The lock
 * panel tells a member that buying is not theirs to do; the routes did not
 * agree. INFORMATION_ARCHITECTURE.md (Administration) names server role gates
 * on exactly these three and /invoices.
 *
 * They now take requireRole(...BILLING_ADMIN_ROLES), the invoice route's guard,
 * and the session's `billing:admin` permission is derived from the same list,
 * so Licensing and onboarding offer checkout and the portal to exactly the
 * roles admitted here. GET /status stays readable by every member: a member
 * still sees which subscription the organisation is on.
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  checkout: vi.fn(),
  dtc: vi.fn(),
  portal: vi.fn(),
  status: vi.fn(),
}));
vi.mock('../../services/billing.js', async (original) => ({
  ...(await original<typeof import('../../services/billing')>()),
  createCheckoutSession: h.checkout,
  createDTCCheckoutSession: h.dtc,
  createPortalSession: h.portal,
  getSubscriptionStatus: h.status,
}));
vi.mock('../../middleware/auth.js', async (original) => ({
  ...(await original<typeof import('../../middleware/auth')>()),
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    if (req.get('x-test-user') !== 'none') {
      (req as Request & { user: unknown }).user = { id: 3, organizationId: 7, role: req.get('x-test-role') ?? 'admin' };
    }
    next();
  },
}));

import billing from '../billing';
import { sessionPermissions } from '../../middleware/orgMembership';
import { BILLING_ADMIN_PERMISSION } from '../../../shared/constants/permissions';

const app = express();
app.use(express.json());
app.use('/api/billing', billing);

const ROUTES = [
  { path: '/api/billing/checkout', body: { tier: 'standard', billingCycle: 'monthly', seats: 3 }, service: () => h.checkout },
  { path: '/api/billing/dtc-checkout', body: { tier: 'standard', billingCycle: 'monthly' }, service: () => h.dtc },
  { path: '/api/billing/portal', body: { returnUrl: 'https://app.test/concept2cure/licensing' }, service: () => h.portal },
] as const;

beforeEach(() => {
  h.checkout.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.test/c/1', sessionId: 'cs_1' });
  h.dtc.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.test/c/2', sessionId: 'cs_2' });
  h.portal.mockReset().mockResolvedValue('https://billing.stripe.test/p/1');
  h.status.mockReset().mockResolvedValue({ tier: 'professional', paymentStatus: 'active', seats: 5, billingCycle: 'annual' });
});

const post = (path: string, body: object, role = 'admin') => request(app).post(path).set('x-test-role', role).send(body);

describe.each(ROUTES)('$path', ({ path, body, service }) => {
  it.each(['member', 'viewer', 'manager', 'approver', 'reviewer', 'user', 'business_admin'])(
    'refuses %s before anything is created',
    async (role) => {
      const res = await post(path, body, role);
      expect(res.status).toBe(403);
      expect(service()).not.toHaveBeenCalled();
    },
  );

  it.each(['admin', 'owner'])('admits %s, for the organisation in the token only', async (role) => {
    const res = await post(path, { ...body, organizationId: 999 }, role);
    expect(res.status).toBe(200);
    expect(service()).toHaveBeenCalledTimes(1);
    const arg = service().mock.calls[0][0];
    expect(typeof arg === 'object' ? (arg as { organizationId: number }).organizationId : arg).toBe(7);
  });

  it('agrees with the session permission the screen reads, for every role', async () => {
    for (const role of ['owner', 'admin', 'manager', 'approver', 'reviewer', 'member', 'viewer', 'user']) {
      const res = await post(path, body, role);
      expect(res.status === 200, role).toBe(sessionPermissions(role).includes(BILLING_ADMIN_PERMISSION));
    }
  });

  it('requires the authenticated principal', async () => {
    const res = await request(app).post(path).set('x-test-user', 'none').send(body);
    expect(res.status).toBe(401);
    expect(service()).not.toHaveBeenCalled();
  });
});

describe('what stays open', () => {
  it('a member still reads which subscription the organisation is on', async () => {
    const res = await request(app).get('/api/billing/status').set('x-test-role', 'member');
    expect(res.status).toBe(200);
    expect(res.body.tier).toBe('professional');
  });

  it('the public price list needs no sign-in', async () => {
    const res = await request(app).get('/api/billing/dtc-pricing').set('x-test-user', 'none');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tiers)).toBe(true);
  });
});
