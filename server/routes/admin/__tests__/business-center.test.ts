/**
 * Route-level tests for the Business Center API.
 *
 * DB / audit / auth are mocked so these exercise the real router + the real
 * requireBusinessAdmin guard: the finance access boundary, the cost-accounting
 * math (revenue from the tier card, cost from usage × rate), CSV export, and
 * governed rate-card edits.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const logActionMock = vi.fn();

vi.mock('../../../db', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));
// Default: Stripe unconfigured → empty map → modeled revenue everywhere. Tests
// that want actual invoiced revenue override getInvoicedRevenueCentsByOrg below.
const invoicedByOrgMock = vi.fn(async () => new Map<number, number>());
vi.mock('../../../services/billing/stripe-revenue', () => ({
  stripeConfigured: () => false,
  getInvoicedRevenueCentsByOrg: (...args: unknown[]) => invoicedByOrgMock(...(args as [])),
}));
vi.mock('../../../services/auditService', () => ({
  default: { logAction: (...args: unknown[]) => logActionMock(...args) },
}));
vi.mock('../../../auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    const hdr = req.headers['x-test-user'];
    if (hdr) {
      const u = JSON.parse(hdr);
      req.user = u;
      req.userRole = u.role;
      req.userEmail = u.email;
      req.userId = u.id;
    }
    next();
  },
}));

import router from '../business-center';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/business', router);
  return app;
}

const BIZ = JSON.stringify({ id: 1, role: 'business_admin', email: 'owner@x.io' });
const SUPPORT = JSON.stringify({ id: 2, role: 'support', email: 's@x.io' });

beforeEach(() => {
  queryMock.mockReset();
  logActionMock.mockReset();
  invoicedByOrgMock.mockReset();
  invoicedByOrgMock.mockImplementation(async () => new Map<number, number>());
  queryMock.mockImplementation((sql: string) => {
    // Guard's async grant fallback (when sync role/email checks fail): no grant,
    // so support-user 403 cases stay 403.
    if (/platform_role_grants/.test(sql)) return Promise.resolve({ rows: [] });
    if (/FROM platform_cost_rates/.test(sql)) return Promise.resolve({ rows: [] }); // use defaults
    if (/FROM tier_pricing/.test(sql)) return Promise.resolve({ rows: [] }); // use defaults
    if (/INSERT INTO platform_cost_rates/.test(sql))
      return Promise.resolve({ rows: [{ cost_key: 'deep_research', unit_cost_cents: 30, unit: 'credit', updated_at: 'now' }] });
    if (/INSERT INTO tier_pricing/.test(sql))
      return Promise.resolve({ rows: [{ tier: 'standard', monthly_price_cents: 60000, per_seat_cents: 0, updated_at: 'now' }] });
    if (/FROM organizations/.test(sql))
      return Promise.resolve({ rows: [{ id: 1, name: 'Acme', slug: 'acme', tier: 'standard', status: 'active', seats: 0 }] });
    if (/FROM usage_records/.test(sql))
      return Promise.resolve({ rows: [{ organization_id: 1, feature_id: 'deep_research', credits: 100 }] });
    return Promise.resolve({ rows: [{}] });
  });
});

describe('access boundary (stricter than Master Admin)', () => {
  it('401s an unauthenticated request', async () => {
    const res = await request(makeApp()).get('/api/admin/business/cost-accounting');
    expect(res.status).toBe(401);
  });

  it('403s a support user', async () => {
    const res = await request(makeApp())
      .get('/api/admin/business/cost-accounting')
      .set('x-test-user', SUPPORT);
    expect(res.status).toBe(403);
  });

  it('200s a business admin', async () => {
    const res = await request(makeApp())
      .get('/api/admin/business/cost-accounting')
      .set('x-test-user', BIZ);
    expect(res.status).toBe(200);
  });
});

describe('cost accounting math', () => {
  it('computes revenue from the tier card and cost from usage × rate', async () => {
    const res = await request(makeApp())
      .get('/api/admin/business/cost-accounting')
      .set('x-test-user', BIZ);
    expect(res.status).toBe(200);
    const acme = res.body.clients.find((c: any) => c.organizationId === 1);
    // standard default monthly = 49900c; 100 deep_research credits × 25c = 2500c
    expect(acme.revenueCents).toBe(49900);
    expect(acme.revenueSource).toBe('modeled');
    expect(acme.costCents).toBe(2500);
    expect(acme.marginCents).toBe(47400);
    expect(res.body.totals.revenueCents).toBe(49900);
    expect(res.body.totals.costCents).toBe(2500);
    expect(res.body.revenueModel).toBe('modeled');
  });

  it('rolls up a platform P&L', async () => {
    const res = await request(makeApp())
      .get('/api/admin/business/pnl')
      .set('x-test-user', BIZ);
    expect(res.status).toBe(200);
    expect(res.body.revenueCents).toBe(49900);
    expect(res.body.marginCents).toBe(47400);
    expect(res.body.byTier[0]).toMatchObject({ tier: 'standard', clients: 1 });
  });

  it('exports CSV and audits the export', async () => {
    const res = await request(makeApp())
      .get('/api/admin/business/cost-accounting.csv')
      .set('x-test-user', BIZ);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.split('\n')[0]).toContain('revenue_usd,cost_usd,margin_usd');
    expect(logActionMock).toHaveBeenCalledOnce();
  });
});

describe('actual invoiced revenue (Stripe) overrides the modeled tier card', () => {
  it('uses Stripe amount_paid and marks revenueSource=stripe when available', async () => {
    invoicedByOrgMock.mockImplementation(async () => new Map([[1, 80000]]));
    const res = await request(makeApp())
      .get('/api/admin/business/cost-accounting')
      .set('x-test-user', BIZ);
    expect(res.status).toBe(200);
    const acme = res.body.clients.find((c: any) => c.organizationId === 1);
    expect(acme.revenueCents).toBe(80000); // actual invoiced, NOT modeled 49900
    expect(acme.revenueSource).toBe('stripe');
    // margin = invoiced revenue - cost (100 deep_research × 25c = 2500c)
    expect(acme.costCents).toBe(2500);
    expect(acme.marginCents).toBe(77500);
    expect(res.body.totals.revenueCents).toBe(80000);
    expect(res.body.revenueModel).toBe('stripe');
  });

  it('falls back to modeled revenue for orgs absent from the Stripe map', async () => {
    // Map present but does not include org 1 → modeled fallback.
    invoicedByOrgMock.mockImplementation(async () => new Map([[999, 12345]]));
    const res = await request(makeApp())
      .get('/api/admin/business/cost-accounting')
      .set('x-test-user', BIZ);
    expect(res.status).toBe(200);
    const acme = res.body.clients.find((c: any) => c.organizationId === 1);
    expect(acme.revenueCents).toBe(49900);
    expect(acme.revenueSource).toBe('modeled');
    expect(res.body.revenueModel).toBe('modeled');
  });

  it('treats a Stripe-reported zero as actual (revenueSource=stripe, revenue 0)', async () => {
    invoicedByOrgMock.mockImplementation(async () => new Map([[1, 0]]));
    const res = await request(makeApp())
      .get('/api/admin/business/cost-accounting')
      .set('x-test-user', BIZ);
    expect(res.status).toBe(200);
    const acme = res.body.clients.find((c: any) => c.organizationId === 1);
    expect(acme.revenueCents).toBe(0);
    expect(acme.revenueSource).toBe('stripe');
    // margin = 0 - 2500c cost
    expect(acme.marginCents).toBe(-2500);
  });
});

describe('rate cards', () => {
  it('lists cost rates merged over defaults', async () => {
    const res = await request(makeApp())
      .get('/api/admin/business/cost-rates')
      .set('x-test-user', BIZ);
    expect(res.status).toBe(200);
    const dr = res.body.rates.find((r: any) => r.costKey === 'deep_research');
    expect(dr).toMatchObject({ unitCostCents: 25, source: 'default' });
  });

  it('rejects a cost-rate update without a reason', async () => {
    const res = await request(makeApp())
      .patch('/api/admin/business/cost-rates/deep_research')
      .set('x-test-user', BIZ)
      .send({ unitCostCents: 30 });
    expect(res.status).toBe(400);
    expect(logActionMock).not.toHaveBeenCalled();
  });

  it('updates a cost rate and audits it', async () => {
    const res = await request(makeApp())
      .patch('/api/admin/business/cost-rates/deep_research')
      .set('x-test-user', BIZ)
      .send({ unitCostCents: 30, reason: 'vendor price increase' });
    expect(res.status).toBe(200);
    expect(logActionMock).toHaveBeenCalledOnce();
    expect(logActionMock.mock.calls[0][0]).toMatchObject({ resourceType: 'platform_cost_rate' });
  });

  it('404s a tier-pricing update for an unknown tier', async () => {
    const res = await request(makeApp())
      .patch('/api/admin/business/tier-pricing/platinum')
      .set('x-test-user', BIZ)
      .send({ monthlyPriceCents: 100000, reason: 'new tier' });
    expect(res.status).toBe(404);
  });

  it('updates tier pricing and audits it', async () => {
    const res = await request(makeApp())
      .patch('/api/admin/business/tier-pricing/standard')
      .set('x-test-user', BIZ)
      .send({ monthlyPriceCents: 60000, reason: 'annual price review' });
    expect(res.status).toBe(200);
    expect(logActionMock).toHaveBeenCalledOnce();
    expect(logActionMock.mock.calls[0][0]).toMatchObject({ resourceType: 'tier_pricing' });
  });
});

describe('metering coverage (cost-accuracy audit)', () => {
  it('403s a support user', async () => {
    const res = await request(makeApp())
      .get('/api/admin/business/metering-coverage')
      .set('x-test-user', SUPPORT);
    expect(res.status).toBe(403);
  });

  it('flags usage with no explicit rate and rates with no usage', async () => {
    queryMock.mockImplementation((sql: string) => {
      if (/FROM usage_records/.test(sql))
        return Promise.resolve({
          rows: [
            { feature_id: 'deep_research', credits: 100, events: 10, last_seen: 'now' },
            { feature_id: 'mystery_feature', credits: 40, events: 4, last_seen: 'now' },
          ],
        });
      if (/FROM platform_cost_rates/.test(sql)) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [{}] });
    });
    const res = await request(makeApp())
      .get('/api/admin/business/metering-coverage')
      .set('x-test-user', BIZ);
    expect(res.status).toBe(200);
    const leaked = res.body.gaps.usageWithoutExplicitRate.map((g: any) => g.featureId);
    expect(leaked).toContain('mystery_feature'); // priced at 'default' → mispricing risk
    expect(leaked).not.toContain('deep_research'); // has an explicit rate
    expect(res.body.gaps.ratedButNoUsage).toEqual(
      expect.arrayContaining(['csr_builder', 'ctd_builder'])
    );
    expect(res.body.healthy).toBe(false);
  });

  it('reports healthy when every metered feature is explicitly rated and used', async () => {
    queryMock.mockImplementation((sql: string) => {
      if (/FROM usage_records/.test(sql))
        return Promise.resolve({
          rows: [
            { feature_id: 'deep_research', credits: 1, events: 1, last_seen: 'now' },
            { feature_id: 'csr_builder', credits: 1, events: 1, last_seen: 'now' },
            { feature_id: 'ctd_builder', credits: 1, events: 1, last_seen: 'now' },
          ],
        });
      if (/FROM platform_cost_rates/.test(sql)) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [{}] });
    });
    const res = await request(makeApp())
      .get('/api/admin/business/metering-coverage')
      .set('x-test-user', BIZ);
    expect(res.status).toBe(200);
    expect(res.body.gaps.usageWithoutExplicitRate).toEqual([]);
    expect(res.body.gaps.ratedButNoUsage).toEqual([]);
    expect(res.body.healthy).toBe(true);
  });
});

describe('access roster (designated personnel)', () => {
  it('403s a support user', async () => {
    const res = await request(makeApp())
      .get('/api/admin/business/access')
      .set('x-test-user', SUPPORT);
    expect(res.status).toBe(403);
  });

  it('reports role holders + allowlist from the guard source of truth', async () => {
    process.env.BUSINESS_CENTER_EMAILS = 'owner@x.io, finance@x.io';
    queryMock.mockImplementation((sql: string) => {
      if (/FROM organization_users/.test(sql))
        return Promise.resolve({
          rows: [{ id: 1, email: 'owner@x.io', name: 'Owner', status: 'active', role: 'business_admin', organization_name: 'Acme' }],
        });
      return Promise.resolve({ rows: [{}] });
    });
    const res = await request(makeApp())
      .get('/api/admin/business/access')
      .set('x-test-user', BIZ);
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(expect.arrayContaining(['owner', 'business_admin', 'super_admin']));
    expect(res.body.allowlistEmails).toEqual(['finance@x.io', 'owner@x.io']);
    expect(res.body.roleHolders[0]).toMatchObject({ email: 'owner@x.io', role: 'business_admin' });
    delete process.env.BUSINESS_CENTER_EMAILS;
  });
});

describe('executive summary', () => {
  it('403s a support user', async () => {
    const res = await request(makeApp())
      .get('/api/admin/business/executive-summary')
      .set('x-test-user', SUPPORT);
    expect(res.status).toBe(403);
  });

  it('rolls up portfolio MRR, margin, and concentration', async () => {
    const res = await request(makeApp())
      .get('/api/admin/business/executive-summary')
      .set('x-test-user', BIZ);
    expect(res.status).toBe(200);
    // 1 client, standard tier (49900c), 100 deep_research credits × 25c = 2500c
    expect(res.body.portfolio).toMatchObject({
      clients: 1,
      activeClients: 1,
      mrrCents: 49900,
      monthlyCostRunRateCents: 2500,
      grossMarginCents: 47400,
    });
    expect(res.body.risk.lossMakingClients).toBe(0);
    expect(res.body.risk.revenueConcentrationTop5Pct).toBe(100);
    expect(res.body.topClients[0]).toMatchObject({ name: 'Acme', sharePct: 100 });
  });

  it('flags a loss-making client (cost > revenue)', async () => {
    queryMock.mockImplementation((sql: string) => {
      if (/FROM platform_cost_rates/.test(sql)) return Promise.resolve({ rows: [] });
      if (/FROM tier_pricing/.test(sql)) return Promise.resolve({ rows: [] });
      if (/FROM organizations/.test(sql))
        return Promise.resolve({
          rows: [{ id: 1, name: 'Acme', slug: 'acme', tier: 'standard', status: 'active', seats: 0 }],
        });
      if (/FROM usage_records/.test(sql))
        // 3000 deep_research credits × 25c = 75000c cost > 49900c revenue
        return Promise.resolve({ rows: [{ organization_id: 1, feature_id: 'deep_research', credits: 3000 }] });
      return Promise.resolve({ rows: [{}] });
    });
    const res = await request(makeApp())
      .get('/api/admin/business/executive-summary')
      .set('x-test-user', BIZ);
    expect(res.status).toBe(200);
    expect(res.body.risk.lossMakingClients).toBe(1);
    expect(res.body.risk.lossMakers[0]).toMatchObject({ organizationId: 1, marginCents: -25100 });
  });
});
