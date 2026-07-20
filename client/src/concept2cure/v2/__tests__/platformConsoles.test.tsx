// @vitest-environment jsdom
/**
 * Master Administration + Business Center ↔ /api/admin wiring.
 *
 * Locks the internal-console contract (HANDOFF_TO_DESIGN_master_admin_
 * business_center.md): NO fixtures — a 403 renders a non-leaky access-denied
 * (no estate data, no counts), a 200 renders the real payload, governed
 * mutations capture a reason (min 3 chars) before the PATCH fires, and money
 * arrives as integer cents but renders as currency.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UiSurface } from '@shared/constants/ui-surface-registry';

import { MasterAdmin } from '../surfaces/MasterAdmin';
import { BusinessCenter } from '../surfaces/BusinessCenter';

const SURFACE = { id: 'master-admin', label: 'Master Administration' } as unknown as UiSurface;

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function res(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    blob: async () => new Blob(['x']),
  } as unknown as Response;
}

const OVERVIEW = {
  tenants: { total: 12, active: 10, suspended: 2, new_30d: 3 },
  users: { total: 87, active: 80, suspended: 7, active_30d: 61, new_30d: 9 },
  usage: { credits_30d: 4210, events_30d: 900 },
  modules: { enabled: 44 },
  audit: { last_24h: 51, last_7d: 302 },
  tiers: [
    { tier: 'professional', count: 7 },
    { tier: 'enterprise', count: 5 },
  ],
  generatedAt: '2026-07-20T00:00:00Z',
};

const FLAGS = {
  flags: [
    {
      id: 1,
      feature_key: 'deep-research-v2',
      description: 'Second-generation research pipeline',
      enabled: true,
      enabled_for_organization_ids: [4, 9],
      enabled_for_client_workspace_ids: [],
      updated_at: '2026-07-01T00:00:00Z',
    },
  ],
};

const EXEC = {
  portfolio: {
    clients: 12,
    activeClients: 10,
    mrrCents: 1_234_500,
    monthlyCostRunRateCents: 400_000,
    grossMarginCents: 834_500,
    grossMarginPct: 67.6,
  },
  risk: {
    lossMakingClients: 1,
    lossMakers: [
      { organizationId: 9, name: 'Meridian Dx', revenueCents: 10_000, costCents: 25_000, marginCents: -15_000 },
    ],
    revenueConcentrationTop5Pct: 74.2,
  },
  topClients: [{ organizationId: 4, name: 'Bright Biosciences', revenueCents: 500_000, sharePct: 40.5 }],
  tierMix: [{ tier: 'professional', clients: 7, revenueCents: 700_000 }],
  note: 'Revenue is modeled from the tier price card; cost is metered usage × owner rates.',
  generatedAt: '2026-07-20T00:00:00Z',
};

const noop = () => {};
const mountMaster = () =>
  render(<MasterAdmin surface={SURFACE} onAsk={noop} onNav={noop} segment="biotech" />);
const mountBusiness = () =>
  render(<BusinessCenter surface={SURFACE} onAsk={noop} onNav={noop} segment="biotech" />);

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
});

describe('MasterAdmin — access states', () => {
  it('renders a non-leaky access-denied on 403 (no estate data)', async () => {
    fetchMock.mockResolvedValue(res(403, { error: 'Platform administrator access required.' }));
    mountMaster();
    expect(await screen.findByText('Restricted console')).toBeTruthy();
    // Non-leaky: none of the estate numbers or section tables render.
    expect(screen.queryByText('Clients')).toBeNull();
    expect(screen.queryByText('12')).toBeNull();
  });

  it('routes to sign-in on 401', async () => {
    fetchMock.mockResolvedValue(res(401, { error: 'unauthenticated' }));
    mountMaster();
    expect(await screen.findByText('Sign in required')).toBeTruthy();
    const link = screen.getByText('Go to sign-in') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/concept2cure/login');
  });

  it('renders live estate KPIs on 200', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/admin/master/overview')) return res(200, OVERVIEW);
      return res(200, {});
    });
    mountMaster();
    expect(await screen.findByText('Clients')).toBeTruthy();
    expect(await screen.findByText('12')).toBeTruthy(); // tenants.total
    expect(screen.getByText('10 active -- 2 suspended')).toBeTruthy();
    expect(screen.getByText('4,210')).toBeTruthy(); // credits_30d formatted
  });
});

describe('MasterAdmin — governed feature-flag toggle', () => {
  it('captures a reason (min 3 chars) before the PATCH fires', async () => {
    const patches: Array<{ url: string; body: unknown }> = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'PATCH') {
        patches.push({ url: u, body: JSON.parse(String(init.body)) });
        return res(200, { feature_key: 'deep-research-v2', enabled: false });
      }
      if (u.includes('/overview')) return res(200, OVERVIEW);
      if (u.includes('/feature-flags')) return res(200, FLAGS);
      return res(200, {});
    });
    mountMaster();
    await screen.findByText('Clients');

    fireEvent.click(screen.getByText('Feature flags'));
    expect(await screen.findByText('deep-research-v2')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Disable deep-research-v2 globally'));

    // The governed dialog opens; confirm stays disabled until a reason exists.
    expect(await screen.findByText('Disable deep-research-v2 globally', { selector: '.t' })).toBeTruthy();
    const confirm = screen.getByText('Disable flag') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(patches).toHaveLength(0);

    fireEvent.change(screen.getByPlaceholderText(/Reason for change|Client requested/i), {
      target: { value: 'Rolling back after incident 4821' },
    });
    await waitFor(() => expect((screen.getByText('Disable flag') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText('Disable flag'));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].url).toContain('/api/admin/master/feature-flags/deep-research-v2');
    expect(patches[0].body).toEqual({ enabled: false, reason: 'Rolling back after incident 4821' });
  });
});

describe('BusinessCenter — owner/finance console', () => {
  it('renders a non-leaky access-denied on 403', async () => {
    fetchMock.mockResolvedValue(res(403, { error: 'Business Center access required.' }));
    mountBusiness();
    expect(await screen.findByText('Restricted console')).toBeTruthy();
    expect(screen.queryByText(/\$/)).toBeNull(); // no money leaks through
  });

  it('renders cents as currency, margins with tone, and the loss-maker table', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/executive-summary')) return res(200, EXEC);
      return res(200, {});
    });
    mountBusiness();
    expect(await screen.findByText('$12,345.00')).toBeTruthy(); // MRR from 1_234_500 cents
    // Appears as both a KPI label and the risk-table section title.
    expect(screen.getAllByText('Loss-making clients').length).toBeGreaterThan(0);
    expect(screen.getByText('Meridian Dx')).toBeTruthy();
    expect(screen.getByText('-$150.00')).toBeTruthy(); // signed margin
    expect(screen.getByText('74.2%')).toBeTruthy(); // concentration
  });
});
