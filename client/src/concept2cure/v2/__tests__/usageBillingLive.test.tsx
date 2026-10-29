// @vitest-environment jsdom
/**
 * UsageBilling ↔ /api/billing wiring (usage/limits).
 *
 * Locks the FIXTURE-FREE contract of surfaces/UsageBilling.tsx — every panel
 * renders real persisted data, an honest empty state, or an honest error
 * state, and never a fabricated fixture or a legacy "Live"/"Sample data" pill:
 *  - GET /usage/limits → plan label, session window %, weekly buckets render
 *    live; an idle session (resetsAt null) is stated, never a fabricated
 *    countdown; a malformed/partial snapshot shows an honest empty state
 *  - the invoice list is not here: it moved to Licensing, for billing
 *    administrators (fold billing into Licensing, 2026-10-29). Its cases moved
 *    with it, to licensingInvoices.test.tsx
 *  - the credit ledger is never spent (credit-ledger.ts debitCredits has no
 *    caller), so no credit balance, auto-reload or per-category credit card is
 *    shown as if metered, and GET /credits is not read (settings/integrity
 *    audit 2026-10-17, finding 4)
 *  - a failed fetch → each panel shows its honest error state (fail-closed)
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { UiSurface } from '@shared/constants/ui-surface-registry';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { UsageBilling } from '../surfaces/UsageBilling';
import { __resetSurfaceActionBus, applySurfaceAction } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

function surfaceOf(id: string): UiSurface {
  return {
    id, label: id, navTier: 'workspace', layoutMode: id, group: 'workspace',
    uiKit: null, apiPrefixes: [], anaToolFamilies: [], sharedContract: null,
    discoveryCatalog: null, readiness: 'routes-ready', compliance: [],
  } as unknown as UiSurface;
}

// Real shapes: UsageLimitsSnapshot (services/usage-windows.ts) and
// { balanceCents, ledger, autoReload } (billing-dashboard.ts).
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

const CREDITS_RES = {
  balanceCents: 1234,
  ledger: [{ id: 1, entryType: 'grant', amountCents: 1234, description: 'Pilot allocation', createdAt: '2026-07-01T10:00:00.000Z' }],
  autoReload: {
    organizationId: 7, enabled: true, thresholdCents: 1000, topupCents: 2500,
    updatedBy: null, reason: null, updatedAt: null,
  },
};

function ok(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as Response;
}

/** The GETs resolve live; per-URL payload overridable per test. An invoice
    read is answered too, so a regression that reads it again is caught by the
    call assertions below rather than hidden as a failed fetch. */
function mockLive(overrides: Record<string, unknown> = {}) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method !== 'GET') throw new Error(`unexpected ${method} ${url}`);
    if (url === '/api/billing/usage/limits') return ok(overrides[url] ?? LIMITS);
    if (url.startsWith('/api/billing/invoices')) return ok({ billingSetUp: true, invoices: [], hasMore: false, nextCursor: null });
    if (url === '/api/billing/credits') return ok(overrides[url] ?? CREDITS_RES);
    throw new Error(`unexpected GET ${url}`);
  });
}
const invoiceReads = () => apiRequest.mock.calls.filter(([, url]) => String(url).startsWith('/api/billing/invoices'));

const noop = () => {};
const mount = (id: 'usage' | 'billing') =>
  render(<UsageBilling surface={surfaceOf(id)} onAsk={noop} onNav={noop} segment="biotech" />);

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  __resetSurfaceActionBus();
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

describe('UsageBilling — the invoice list moved to Licensing', () => {
  it.each(['usage', 'billing'] as const)('mounted as %s, reads no invoices and offers no Billing tab', async (id) => {
    mockLive();
    const { container } = mount(id);
    expect(await screen.findByText('Enterprise plan')).toBeTruthy();
    expect(invoiceReads()).toHaveLength(0);
    const tabs = screen.getAllByRole('button').map((b) => (b.textContent ?? '').trim());
    expect(tabs).toContain('Usage');
    expect(tabs).toContain('Rate limits');
    expect(tabs).not.toContain('Billing');
    expect(container.textContent).not.toMatch(/Invoices|No invoices yet/);
  });

  /* Settings/integrity audit 2026-10-17, finding 4. Nothing debits the credit
     ledger, so a balance shown here never moves with use: a "$12.34 current
     balance" with auto-reload "when your balance is $10" presented an
     unmetered number as metering. */
  it('shows no credit balance, auto-reload or credit pools — the ledger is never spent', async () => {
    mockLive();
    mount('usage');
    expect(await screen.findByText('Enterprise plan')).toBeTruthy();
    expect(screen.queryByText('$12.34')).toBeNull();
    expect(screen.queryByText(/Auto-reload/)).toBeNull();
    expect(screen.queryByText('Current balance')).toBeNull();
    expect(screen.queryByRole('button', { name: /buy more/i })).toBeNull();
    expect(apiRequest).not.toHaveBeenCalledWith('GET', '/api/billing/credits');
  });

  it('the usage tab shows no per-category credit card', async () => {
    mockLive();
    const { container } = mount('usage');
    expect(await screen.findByText('Enterprise plan')).toBeTruthy();
    expect(container.textContent).not.toMatch(/usage credits/i);
  });

  it('points to Compare subscriptions, where the invoices are', async () => {
    mockLive();
    const onNav = vi.fn();
    render(<UsageBilling surface={surfaceOf('usage')} onAsk={noop} onNav={onNav} segment="biotech" />);
    await screen.findByText('Enterprise plan');
    screen.getByRole('button', { name: /Compare subscriptions/ }).click();
    expect(onNav).toHaveBeenCalledWith('licensing');
  });
});

describe('UsageBilling — service unreachable', () => {
  it('renders honest error states when the billing service is unreachable', async () => {
    apiRequest.mockRejectedValue(new Error('network down'));
    mount('usage');
    // Every panel fails to an honest error state — never a fabricated fixture.
    expect(await screen.findByText("Couldn't load plan usage")).toBeTruthy();
    expect(screen.getByText("Couldn't load weekly limits")).toBeTruthy();
    expect(screen.queryByText('No plan usage yet')).toBeNull();
    expect(screen.queryByText('$20.64')).toBeNull(); // no fixture balance
    expect(screen.queryByText('Sample data')).toBeNull();
    expect(screen.queryByText('Live')).toBeNull();
  });
});

describe("AnA's tab action after the move", () => {
  function openTab(tab: string) {
    const resolved = resolveSurfaceAction('usage.open-tab', { tab });
    if (!resolved.ok) throw new Error(resolved.error);
    let outcome: { status: string; detail?: string; reason?: string } = { status: '' };
    act(() => {
      outcome = applySurfaceAction(resolved.directive, vi.fn()) as typeof outcome;
    });
    return outcome;
  }

  it('opens the tabs the screen has, and says where the invoices went instead of opening one it does not', async () => {
    mockLive();
    mount('usage');
    await screen.findByText('Enterprise plan');
    expect(openTab('limits').status).toBe('applied');
    expect(await screen.findByText('Rate limits by tier')).toBeTruthy();
    const billing = openTab('billing');
    expect(billing.status).not.toBe('applied');
    expect(billing.reason).toMatch(/Compare subscriptions/);
    expect(invoiceReads()).toHaveLength(0);
  });
});
