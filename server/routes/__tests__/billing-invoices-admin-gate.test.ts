/**
 * GET /api/billing/invoices — who may read the organisation's invoices, and what
 * the read says when there is nothing to read (D2, fold billing into Licensing,
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-billing/).
 *
 * The route answered any authenticated member of the tenant: an invited
 * colleague, a viewer, read the Stripe invoice list (amounts, statuses, the
 * hosted invoice and PDF links). The seat, weekly-limit and auto-reload writes
 * beside it in the same file were already `requireRole('admin', 'owner')`. The
 * read now takes the same guard, through BILLING_ADMIN_ROLES, and the session
 * derives BILLING_ADMIN_PERMISSION from that list so the screen offers the
 * list to exactly the roles admitted here (session-permissions.test.ts).
 *
 * An organisation with no Stripe customer answered `{ invoices: [], total: 0 }`,
 * the same body as one whose customer has never been invoiced. Those are two
 * facts: "billing is not set up" and "no invoices yet". It now says which.
 * `total` was the length of the page, not a total; the cursor for the next page
 * was never returned, so a client could not page at all.
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn(), list: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: h.query }, db: {} }));
vi.mock('stripe', () => ({
  default: class FakeStripe {
    invoices = { list: h.list };
  },
}));
vi.mock('../../middleware/auth.js', async (original) => ({
  ...(await original<typeof import('../../middleware/auth')>()),
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    if (req.get('x-test-user') !== 'none') {
      (req as Request & { user: unknown }).user = {
        id: 3,
        organizationId: req.get('x-test-org') === 'none' ? undefined : 7,
        role: req.get('x-test-role') ?? 'admin',
      };
    }
    next();
  },
}));

import billing from '../billing-dashboard';
import { sessionPermissions } from '../../middleware/orgMembership';
import { BILLING_ADMIN_PERMISSION } from '../../../shared/constants/permissions';

const app = express();
app.use(express.json());
app.use('/api/billing', billing);

function stripeInvoice(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    number: `INV-${id}`,
    created: 1782900000,
    amount_due: 4250,
    amount_paid: 4250,
    status: 'paid',
    invoice_pdf: null,
    hosted_invoice_url: `https://stripe.test/${id}`,
    currency: 'usd',
    period_start: null,
    period_end: null,
    ...over,
  };
}

let customer: string | null = 'cus_7';
beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fold_billing';
  customer = 'cus_7';
  h.query.mockReset();
  h.list.mockReset();
  h.query.mockImplementation(async (sql: string) => {
    if (/SELECT stripe_customer_id FROM organizations/.test(sql)) return { rows: [{ stripe_customer_id: customer }] };
    return { rows: [] };
  });
  h.list.mockResolvedValue({ data: [stripeInvoice('in_2'), stripeInvoice('in_1')], has_more: false });
});

const get = (path = '/api/billing/invoices', role = 'admin') => request(app).get(path).set('x-test-role', role);

describe('who may read the invoice list', () => {
  it.each(['member', 'viewer', 'manager', 'approver', 'reviewer', 'user'])(
    'refuses %s before reading anything',
    async (role) => {
      const res = await get('/api/billing/invoices', role);
      expect(res.status).toBe(403);
      expect(h.query).not.toHaveBeenCalled();
      expect(h.list).not.toHaveBeenCalled();
      expect(JSON.stringify(res.body)).not.toContain('INV-');
    },
  );

  it.each(['admin', 'owner'])('admits %s', async (role) => {
    const res = await get('/api/billing/invoices', role);
    expect(res.status).toBe(200);
    expect(res.body.invoices).toHaveLength(2);
  });

  it('agrees with the session permission the screen reads, for every role', async () => {
    for (const role of ['owner', 'admin', 'manager', 'approver', 'reviewer', 'member', 'viewer', 'user']) {
      const res = await get('/api/billing/invoices', role);
      expect(res.status === 200, role).toBe(sessionPermissions(role).includes(BILLING_ADMIN_PERMISSION));
    }
  });

  it('requires the authenticated principal', async () => {
    const res = await request(app).get('/api/billing/invoices').set('x-test-user', 'none');
    expect(res.status).toBe(401);
    expect(h.list).not.toHaveBeenCalled();
  });

  it('requires an organisation context, and reads only its own customer', async () => {
    const none = await request(app).get('/api/billing/invoices').set('x-test-org', 'none');
    expect(none.status).toBe(401);
    expect(h.query).not.toHaveBeenCalled();

    await get('/api/billing/invoices?organizationId=999');
    const lookup = h.query.mock.calls.find(([sql]) => /stripe_customer_id/.test(sql));
    expect(lookup?.[1]).toEqual([7]);
  });
});

describe('what the read says', () => {
  it('says billing is not set up when the organisation has no Stripe customer, and asks Stripe nothing', async () => {
    customer = null;
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ billingSetUp: false, invoices: [], hasMore: false, nextCursor: null });
    expect(h.list).not.toHaveBeenCalled();
  });

  it('says billing is set up when the list is merely empty', async () => {
    h.list.mockResolvedValue({ data: [], has_more: false });
    const res = await get();
    expect(res.body).toEqual({ billingSetUp: true, invoices: [], hasMore: false, nextCursor: null });
  });

  it('projects each Stripe invoice, amounts in major units', async () => {
    const res = await get();
    expect(res.body.invoices[0]).toEqual({
      id: 'in_2',
      number: 'INV-in_2',
      date: new Date(1782900000 * 1000).toISOString(),
      amount: 42.5,
      amountPaid: 42.5,
      status: 'paid',
      pdfUrl: null,
      hostedUrl: 'https://stripe.test/in_2',
      currency: 'usd',
      periodStart: null,
      periodEnd: null,
    });
  });

  it('does not call the page length a total', async () => {
    const res = await get();
    expect(res.body).not.toHaveProperty('total');
  });

  it('a failed Stripe read is an error, never an empty list', async () => {
    h.list.mockRejectedValue(new Error('stripe down'));
    const res = await get();
    expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty('invoices');
    expect(JSON.stringify(res.body)).not.toContain('stripe down');
  });
});

describe('paging', () => {
  it('asks Stripe for one page of the organisation’s customer, ten by default', async () => {
    await get();
    expect(h.list).toHaveBeenCalledWith({ customer: 'cus_7', limit: 10 });
  });

  it('returns the cursor for the next page when Stripe has more, and none on the last page', async () => {
    h.list.mockResolvedValue({ data: [stripeInvoice('in_9'), stripeInvoice('in_8')], has_more: true });
    const more = await get('/api/billing/invoices?limit=2');
    expect(more.body).toMatchObject({ billingSetUp: true, hasMore: true, nextCursor: 'in_8' });

    h.list.mockResolvedValue({ data: [stripeInvoice('in_7')], has_more: false });
    const last = await get('/api/billing/invoices?limit=2&startingAfter=in_8');
    expect(h.list).toHaveBeenLastCalledWith({ customer: 'cus_7', limit: 2, starting_after: 'in_8' });
    expect(last.body).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it('clamps the page size to 1..100', async () => {
    await get('/api/billing/invoices?limit=500');
    expect(h.list).toHaveBeenLastCalledWith({ customer: 'cus_7', limit: 100 });
    await get('/api/billing/invoices?limit=0');
    expect(h.list).toHaveBeenLastCalledWith({ customer: 'cus_7', limit: 10 });
  });

  it.each(['abc', 'in_1;drop', 'cus_7', 'in_', ' in_1'])('refuses a cursor that is not an invoice id (%j)', async (cursor) => {
    const res = await get(`/api/billing/invoices?startingAfter=${encodeURIComponent(cursor)}`);
    expect(res.status).toBe(400);
    expect(h.list).not.toHaveBeenCalled();
  });
});
