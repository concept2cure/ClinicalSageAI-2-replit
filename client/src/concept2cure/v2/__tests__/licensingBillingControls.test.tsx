// @vitest-environment jsdom
/**
 * Licensing offers checkout and the billing portal to billing administrators
 * only (D2, fold billing into Licensing, Part 1b;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-billing/).
 *
 * POST /api/billing/checkout, /dtc-checkout and /portal now refuse anyone the
 * billing guard does not admit (billing-checkout-portal-admin-gate.test.ts).
 * Before, every member was offered "Manage billing", "Start 14-day trial",
 * "Choose …", and could open each. A control the server refuses is a doomed
 * click, so the screen reads the session's `billing:admin` permission, derived
 * from the same role list, and a member is told who chooses the subscription.
 * What stays for everyone: the catalogue, the cycle and model switches (view
 * state), the plan status, and "Ask AnA about Enterprise", which buys nothing.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  user: { permissions: ['governed:write', 'billing:admin'] } as { permissions?: string[] } | null,
  published: {} as Record<string, { summary: string; facts: Record<string, unknown>; availableActions?: string[] } | null>,
}));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: h.apiRequest,
}));
vi.mock('@/services/portal/authService', async (original) => ({
  ...(await original<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => h.user,
}));
vi.mock('../surfaceContext', async (original) => ({
  ...(await original<typeof import('../surfaceContext')>()),
  usePublishSurfaceContext: (id: string, ctx: (typeof h.published)[string]) => {
    h.published[id] = ctx;
  },
}));

import { LicensingSurface } from '../surfaces/LicensingSurface';

const STATUS = { tier: 'free', paymentStatus: 'active', billingCycle: 'monthly', seats: 1, currentPeriodEnd: null };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

function serve() {
  h.apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/billing/status') return ok(STATUS);
    if (method === 'GET' && url.startsWith('/api/billing/invoices')) return ok({ billingSetUp: false, invoices: [], hasMore: false, nextCursor: null });
    if (method === 'POST' && url === '/api/billing/dtc-checkout') return ok({ checkoutUrl: 'https://checkout.stripe.test/c/1' });
    if (method === 'POST' && url === '/api/billing/portal') return ok({ portalUrl: 'https://billing.stripe.test/p/1' });
    throw new Error(`unexpected ${method} ${url}`);
  });
}

const mount = () =>
  render(<LicensingSurface surface={{ id: 'licensing', label: 'Compare subscriptions' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" />);
const posts = () => h.apiRequest.mock.calls.filter(([m]) => m !== 'GET');
const CHECKOUT = /^(Start \d+-day trial|Start free|Choose\b)/;

afterEach(() => {
  cleanup();
  h.apiRequest.mockReset();
  h.user = { permissions: ['governed:write', 'billing:admin'] };
  h.published = {};
  vi.restoreAllMocks();
});

describe('a member', () => {
  it('is offered no checkout and no billing portal, and is told who chooses the subscription', async () => {
    h.user = { permissions: ['governed:write'] };
    serve();
    mount();
    expect((await screen.findAllByText('Current subscription')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Manage billing/ })).toBeNull();
    expect(screen.queryAllByRole('button').filter((b) => CHECKOUT.test((b.textContent ?? '').trim()))).toEqual([]);
    expect(screen.getByText(/Invoices and subscription changes are for billing administrators/)).toBeTruthy();
    // Viewing the catalogue is everyone's.
    fireEvent.click(screen.getByRole('button', { name: /Enterprise \(per-user\)/ }));
    expect(screen.getAllByRole('button', { name: /Ask AnA about Enterprise/ }).length).toBeGreaterThan(0);
    expect(posts()).toEqual([]);
  });

  it('AnA is told the subscription acts are not this viewer’s', async () => {
    h.user = { permissions: [] };
    serve();
    mount();
    await screen.findAllByText('Current subscription');
    await waitFor(() => expect(h.published.licensing?.facts.subscriptionActions).toBeTruthy());
    expect(h.published.licensing?.facts.subscriptionActions).toMatch(/billing administrators/);
    expect((h.published.licensing?.availableActions ?? []).join(' ')).not.toMatch(/opens Stripe checkout/);
  });
});

describe('a billing administrator', () => {
  it('is offered Manage billing and checkout, and each reaches its route', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    serve();
    mount();
    expect((await screen.findAllByText('Current subscription')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Invoices and subscription changes are for billing administrators/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Manage billing/ }));
    await waitFor(() => expect(h.apiRequest).toHaveBeenCalledWith('POST', '/api/billing/portal', expect.anything()));

    const start = screen.getAllByRole('button').find((b) => CHECKOUT.test((b.textContent ?? '').trim()) && !/free/i.test(b.textContent ?? ''));
    expect(start, 'a paid checkout control').toBeTruthy();
    fireEvent.click(start as HTMLButtonElement);
    await waitFor(() => expect(h.apiRequest).toHaveBeenCalledWith('POST', '/api/billing/dtc-checkout', expect.anything()));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
    expect(h.published.licensing?.facts.subscriptionActions).toBe('offered');
  });
});
