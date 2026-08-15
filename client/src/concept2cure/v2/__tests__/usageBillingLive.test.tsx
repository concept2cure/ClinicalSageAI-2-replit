// @vitest-environment jsdom
/**
 * UsageBilling ↔ /api/billing wiring (usage/limits + invoices + credits).
 *
 * Locks the FIXTURE-FREE contract of surfaces/UsageBilling.tsx — every panel
 * renders real persisted data, an honest empty state, or an honest error
 * state, and never a fabricated fixture or a legacy "Live"/"Sample data" pill:
 *  - GET /usage/limits → plan label, session window %, weekly buckets render
 *    live; an idle session (resetsAt null) is stated, never a fabricated
 *    countdown; a malformed/partial snapshot shows an honest empty state
 *  - GET /invoices → date/amount(→total)/status mapped to the display shape,
 *    hostedUrl drives a real View link; an empty list shows an honest empty
 *  - GET /credits → balanceCents→balance + auto-reload settings, truthfully
 *  - the per-category "Usage credits" pools have no backend (the credit ledger
 *    is one flat balance) → that card shows an honest empty, never a fixture
 *  - a failed fetch → each panel shows its honest error state (fail-closed)
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { UiSurface } from '@shared/constants/ui-surface-registry';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

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
    expect(screen.queryByText('AnA Builder')).toBeNull(); // no fixture bucket
    // Fixture-free contract: real values render directly, with no legacy
    // "Live"/"Sample data" provenance pills anywhere on the surface.
    expect(screen.queryByText('Live')).toBeNull();
    expect(screen.queryByText('Sample data')).toBeNull();
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

  it('renders honest empty states on a malformed snapshot (never a fixture)', async () => {
    mockLive({ '/api/billing/usage/limits': { plan: 'enterprise', weekly: 'nope' } });
    mount('usage');
    // No session + a non-array weekly → each panel guards its own slice and
    // shows its honest empty state instead of crashing or faking a fixture.
    expect(await screen.findByText('No plan usage yet')).toBeTruthy();
    expect(screen.getByText('No weekly usage yet')).toBeTruthy();
    expect(screen.queryByText('AnA Builder')).toBeNull(); // no fixture bucket
    expect(screen.queryByText('professional plan')).toBeNull(); // no fixture tier
    expect(screen.queryByText('Sample data')).toBeNull();
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
    // Fixture-free: the real balance / auto-reload / invoice values render
    // directly — no legacy "Live"/"Sample data" provenance pills.
    expect(screen.queryByText('Live')).toBeNull();
    expect(screen.queryByText('Sample data')).toBeNull();
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

  it('renders an honest empty state on an empty invoice list (never a fixture)', async () => {
    mockLive({ '/api/billing/invoices': { invoices: [], hasMore: false, total: 0 } });
    mount('billing');
    // Empty invoices → the invoices panel shows its honest empty state; the
    // live balance still renders on its own promise. No fixture row, no pills.
    expect(await screen.findByText('No invoices yet')).toBeTruthy();
    expect(await screen.findByText('$12.34')).toBeTruthy(); // live balance
    expect(screen.queryByText('$16.70')).toBeNull(); // no fixture row
    expect(screen.queryByText('Sample data')).toBeNull();
    expect(screen.queryByText('Live')).toBeNull();
  });
});

describe('UsageBilling — service unreachable', () => {
  it('renders honest error states when the billing service is unreachable', async () => {
    apiRequest.mockRejectedValue(new Error('network down'));
    mount('billing');
    // Every panel fails to an honest error state — never a fabricated fixture.
    expect(await screen.findByText("Couldn't load your balance")).toBeTruthy();
    expect(screen.getByText("Couldn't load auto-reload")).toBeTruthy();
    expect(screen.getByText("Couldn't load invoices")).toBeTruthy();
    expect(screen.queryByText('$20.64')).toBeNull(); // no fixture balance
    expect(screen.queryByText('Sample data')).toBeNull();
    expect(screen.queryByText('Live')).toBeNull();
  });
});
