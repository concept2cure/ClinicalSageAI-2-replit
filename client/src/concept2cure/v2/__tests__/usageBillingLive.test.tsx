// @vitest-environment jsdom
/**
 * UsageBilling ↔ /api/billing wiring (usage/limits + invoices + credits).
 *
 * Locks the honest live adoption added to surfaces/UsageBilling.tsx:
 *  - GET /usage/limits adopted → plan label, session window %, weekly buckets
 *    (label→metric, pctUsed, resetsAt→reset) render live with Live pills;
 *    an idle session (resetsAt null) is stated, never a fabricated countdown
 *  - GET /invoices adopted → date/amount(→total)/status mapped to the display
 *    shape, hostedUrl drives a real View link; an empty or malformed list
 *    fails closed to the fixture
 *  - GET /credits adopted → balanceCents→balance, auto-reload settings
 *    (enabled/thresholdCents/topupCents) rendered truthfully
 *  - the per-category "Usage credits" pools have no backend concept (the
 *    credit ledger is one flat balance) → that panel stays Sample even when
 *    everything else is live
 *  - offline → fixtures + Sample-data pills everywhere (fail-closed)
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { UiSurface } from '@shared/constants/ui-surface-registry';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { UsageBilling } from '../surfaces/UsageBilling';

function surfaceOf(id: string): UiSurface {
  return {
    id, label: id, navTier: 'workspace', layoutMode: id, group: 'workspace',
    uiKit: null, apiPrefixes: [], anaToolFamilies: [], sharedContract: null,
    discoveryCatalog: null, readiness: 'routes-ready', compliance: [],
  } as unknown as UiSurface;
}

// Real shapes: UsageLimitsSnapshot (services/usage-windows.ts), the Stripe
// invoice projection and { balanceCents, ledger, autoReload } (billing-dashboard.ts).
const LIMITS = {
  plan: 'enterprise',
  planLabel: 'Enterprise',
  session: {
    id: 'session', label: 'Current session', windowHours: 5,
    usedCostCents: 1000, usedTokens: 52000, budgetCostCents: 5000,
    pctUsed: 20, resetsAt: new Date(Date.now() + 145 * 60000).toISOString(),
  },
  weekly: [
    {
      id: 'all-models', label: 'All models', usedCostCents: 18500, usedTokens: 900000,
      budgetCostCents: 50000, pctUsed: 37, resetsAt: '2026-07-19T08:00:00.000Z',
    },
    {
      id: 'premium-models', label: 'Premium models (Opus)', usedCostCents: 2000,
      usedTokens: 80000, budgetCostCents: 25000, pctUsed: 8, resetsAt: '2026-07-19T08:00:00.000Z',
    },
  ],
  lastUpdated: new Date().toISOString(),
};

const INVOICES_RES = {
  invoices: [
    {
      id: 'in_1', number: 'INV-0042', date: '2026-07-01T10:00:00.000Z',
      amount: 42.5, amountPaid: 42.5, status: 'paid',
      pdfUrl: null, hostedUrl: 'https://stripe.example/inv_1', currency: 'usd',
      periodStart: null, periodEnd: null,
    },
    {
      id: 'in_2', number: 'INV-0041', date: '2026-06-01T10:00:00.000Z',
      amount: 19, amountPaid: 0, status: 'open',
      pdfUrl: null, hostedUrl: null, currency: 'usd',
      periodStart: null, periodEnd: null,
    },
  ],
  hasMore: false,
  total: 2,
};

const CREDITS_RES = {
  balanceCents: 1234,
  ledger: [],
  autoReload: {
    organizationId: 7, enabled: true, thresholdCents: 1000, topupCents: 2500,
    updatedBy: null, reason: null, updatedAt: null,
  },
};

function ok(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as Response;
}

/** All three GETs resolve live; per-URL payload overridable per test. */
function mockLive(overrides: Record<string, unknown> = {}) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method !== 'GET') throw new Error(`unexpected ${method} ${url}`);
    if (url === '/api/billing/usage/limits') return ok(overrides[url] ?? LIMITS);
    if (url === '/api/billing/invoices') return ok(overrides[url] ?? INVOICES_RES);
    if (url === '/api/billing/credits') return ok(overrides[url] ?? CREDITS_RES);
    throw new Error(`unexpected GET ${url}`);
  });
}

const noop = () => {};
const mount = (id: 'usage' | 'billing') =>
  render(<UsageBilling surface={surfaceOf(id)} onAsk={noop} onNav={noop} segment="biotech" />);

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('UsageBilling — live plan usage (/api/billing/usage/limits)', () => {
  it('adopts the snapshot: plan label, session window, weekly buckets', async () => {
    mockLive();
    mount('usage');
    expect(await screen.findByText('Enterprise plan')).toBeTruthy();
    // session resets in ~2 hr 25 min (derived from the real resetsAt)
    expect(screen.getByText(/Resets in 2 hr 2\d min/)).toBeTruthy();
    expect(screen.getByText('20% used')).toBeTruthy();
    // weekly: label→metric, pctUsed — live bucket names, not the fixture's
    expect(screen.getByText('Premium models (Opus)')).toBeTruthy();
    expect(screen.getByText('37% used')).toBeTruthy();
    expect(screen.queryByText('AnA Builder')).toBeNull(); // fixture bucket gone
    // session + weekly cards live; per-category credit pools have no backend
    // (flat credit_ledger balance) → that card stays honestly Sample
    expect(screen.getAllByText('Live')).toHaveLength(2);
    expect(screen.getAllByText('Sample data')).toHaveLength(1);
    expect(screen.getByText('Deep-research credits')).toBeTruthy();
  });

  it('states an idle session honestly instead of fabricating a countdown', async () => {
    mockLive({
      '/api/billing/usage/limits': {
        ...LIMITS,
        session: { ...LIMITS.session, pctUsed: 0, resetsAt: null },
      },
    });
    mount('usage');
    expect(await screen.findByText(/No active session/)).toBeTruthy();
    expect(screen.queryByText(/Resets in 2 hr/)).toBeNull();
  });

  it('fails closed to the fixture on a malformed snapshot', async () => {
    mockLive({ '/api/billing/usage/limits': { plan: 'enterprise', weekly: 'nope' } });
    mount('usage');
    expect(await screen.findByText('AnA Builder')).toBeTruthy(); // fixture bucket
    expect(screen.getByText('professional plan')).toBeTruthy(); // fixture tier
    expect(screen.getAllByText('Sample data')).toHaveLength(3); // no Live claims
    expect(screen.queryByText('Live')).toBeNull();
  });
});

describe('UsageBilling — live billing (/api/billing/invoices + /credits)', () => {
  it('adopts balance, auto-reload and mapped invoice rows', async () => {
    mockLive();
    mount('billing');
    // balanceCents → dollars
    expect(await screen.findByText('$12.34')).toBeTruthy();
    // autoReload thresholdCents/topupCents → the real amounts
    expect(screen.getByText(/Top off to \$25 when your balance is \$10/)).toBeTruthy();
    // invoices: date → "Jul 1, 2026", amount → total, status capitalized
    expect(screen.getByText('Jul 1, 2026')).toBeTruthy();
    expect(screen.getByText('$42.50')).toBeTruthy();
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();
    // hostedUrl → a real link; the row without any URL gets no dead control
    const views = screen.getAllByText('View');
    expect(views).toHaveLength(1);
    expect(views[0].getAttribute('href')).toBe('https://stripe.example/inv_1');
    // all three billing panels live, nothing presented as sample
    expect(screen.getAllByText('Live')).toHaveLength(3);
    expect(screen.queryAllByText('Sample data')).toHaveLength(0);
  });

  it('renders a disabled auto-reload truthfully as Off', async () => {
    mockLive({
      '/api/billing/credits': {
        ...CREDITS_RES,
        autoReload: { ...CREDITS_RES.autoReload, enabled: false },
      },
    });
    mount('billing');
    expect(
      await screen.findByText(/Off — when enabled, tops off to \$25 when your balance is \$10/),
    ).toBeTruthy();
  });

  it('fails closed to the fixture on an empty invoice list (never blank)', async () => {
    mockLive({ '/api/billing/invoices': { invoices: [], hasMore: false, total: 0 } });
    mount('billing');
    expect(await screen.findByText('$16.70')).toBeTruthy(); // fixture row
    // invoices card wears the Sample pill while balance/auto-reload stay live
    expect(screen.getAllByText('Sample data')).toHaveLength(1);
    expect(screen.getAllByText('Live')).toHaveLength(2);
  });
});

describe('UsageBilling — offline', () => {
  it('fails closed to fixtures with Sample-data pills everywhere', async () => {
    apiRequest.mockRejectedValue(new Error('network down'));
    mount('billing');
    expect(await screen.findByText('$20.64')).toBeTruthy(); // fixture balance
    expect(screen.getAllByText('Sample data')).toHaveLength(3);
    expect(screen.queryByText('Live')).toBeNull();
  });
});
