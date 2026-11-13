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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiRequestError } from '@/lib/queryClient';
import { authService, type AuthUser } from '@/services/portal/authService';

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

// DTC returns { sessionId, url }; the per-user route returns { checkoutUrl }.
// Mocking both as checkoutUrl hid the broken self-service handoff.
function serve(checkout: unknown = { sessionId: 'cs_test_dtc', url: 'https://checkout.stripe.test/c/1' }, status = STATUS) {
  h.apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/billing/status') return ok(status);
    if (method === 'GET' && url.startsWith('/api/billing/invoices')) return ok({ billingSetUp: false, invoices: [], hasMore: false, nextCursor: null });
    if (method === 'POST' && url === '/api/billing/dtc-checkout') return ok(checkout);
    if (method === 'POST' && url === '/api/billing/checkout') return ok({ checkoutUrl: 'https://checkout.stripe.test/c/enterprise' });
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
  authService.endSession(null); vi.unstubAllGlobals();
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
    expect(open).toHaveBeenCalledWith('https://checkout.stripe.test/c/1', '_blank');
    expect(h.published.licensing?.facts.subscriptionActions).toBe('offered');
  });

  it('preserves the per-user checkoutUrl contract and selected billing cycle', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    serve();
    mount();
    await screen.findAllByText('Current subscription');
    fireEvent.click(screen.getByRole('button', { name: /Enterprise \(per-user\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Monthly' }));
    const choose = screen.getAllByRole('button').find((b) => CHECKOUT.test((b.textContent ?? '').trim()));
    expect(choose).toBeTruthy();
    fireEvent.click(choose as HTMLButtonElement);
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://checkout.stripe.test/c/enterprise', '_blank'));
    expect(h.apiRequest).toHaveBeenCalledWith('POST', '/api/billing/checkout', expect.objectContaining({ billingCycle: 'monthly', seats: 5 }));
    expect(posts().some(([, url]) => url === '/api/billing/dtc-checkout')).toBe(false);
  });

  it('sends the selected annual self-service plan and opens the real url response', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    serve();
    mount();
    await screen.findAllByText('Current subscription');
    fireEvent.click(screen.getAllByRole('button', { name: 'Start 14-day trial' })[0]);
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://checkout.stripe.test/c/1', '_blank'));
    expect(h.apiRequest).toHaveBeenCalledWith('POST', '/api/billing/dtc-checkout', { tier: 'standard', billingCycle: 'annual' });
  });

  it('reports a successful response with no payment link without opening a tab', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    serve({ sessionId: 'cs_test_missing_url' });
    mount();
    await screen.findAllByText('Current subscription');
    fireEvent.click(screen.getAllByRole('button', { name: 'Start 14-day trial' })[0]);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Checkout did not return a payment link'));
    expect(open).not.toHaveBeenCalled();
  });

  it.each([{ sessionId: 'cs_test_bad_url', url: {} }, { sessionId: 'cs_test_blank_url', url: '  ' }, { sessionId: 'free', url: '/concept2cure?welcome=true' }])('refuses a malformed paid handoff without claiming activation: %j', async (checkout) => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    serve(checkout);
    mount();
    await screen.findAllByText('Current subscription');
    fireEvent.click(screen.getAllByRole('button', { name: 'Start 14-day trial' })[0]);
    expect((await screen.findByRole('alert')).textContent).toContain('Checkout did not return a payment link');
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByText('Free subscription activated')).toBeNull();
  });

  it('shows a checkout refusal and never claims activation', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    serve();
    const serveRequest = h.apiRequest.getMockImplementation()!;
    h.apiRequest.mockImplementation(async (method: string, url: string, body: unknown) => {
      if (method === 'POST' && url === '/api/billing/dtc-checkout') {
        throw new ApiRequestError('Billing is unavailable. Try again.', 503);
      }
      return serveRequest(method, url, body);
    });
    mount();
    await screen.findAllByText('Current subscription');
    fireEvent.click(screen.getAllByRole('button', { name: 'Start 14-day trial' })[0]);
    expect((await screen.findByRole('alert')).textContent).toContain('Billing is unavailable. Try again.');
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByText('Free subscription activated')).toBeNull();
  });

});

describe('free activation and billing availability', () => {
  it('treats the free response as activation and reloads the persisted subscription without opening its internal url', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    let activated = false;
    h.apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/billing/status') return ok({ ...STATUS, tier: activated ? 'free' : 'standard', paymentStatus: activated ? 'active' : 'incomplete' });
      if (method === 'GET' && url.startsWith('/api/billing/invoices')) return ok({ billingSetUp: false, invoices: [], hasMore: false, nextCursor: null });
      if (method === 'POST' && url === '/api/billing/dtc-checkout') {
        activated = true;
        return ok({ sessionId: 'free', url: 'http://localhost:3000/concept2cure?welcome=true' });
      }
      throw new Error(`unexpected ${method} ${url}`);
    });
    mount();
    await screen.findAllByText('Current subscription');
    fireEvent.click(screen.getByRole('button', { name: 'Start free' }));
    await screen.findByText('Free subscription activated');
    await waitFor(() => expect(h.apiRequest.mock.calls.filter(([method, url]) => method === 'GET' && url === '/api/billing/status')).toHaveLength(2));
    await waitFor(() => expect(screen.getByText('Researcher').closest('.lic-card')?.textContent).toContain('Current subscription'));
    expect(open).not.toHaveBeenCalled();
  });

  it('preserves a refused paid-to-free change without refreshing or claiming activation', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    serve(undefined, { ...STATUS, tier: 'standard' });
    const serveRequest = h.apiRequest.getMockImplementation()!;
    h.apiRequest.mockImplementation(async (method: string, url: string, body: unknown) => {
      if (method === 'POST' && url === '/api/billing/dtc-checkout') {
        throw new ApiRequestError('Manage your current subscription in the billing portal.', 409);
      }
      return serveRequest(method, url, body);
    });
    mount();
    await screen.findAllByText('Current subscription');
    fireEvent.click(screen.getByRole('button', { name: 'Start free' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Manage your current subscription in the billing portal.');
    expect(screen.queryByText('Free subscription activated')).toBeNull();
    expect(h.apiRequest.mock.calls.filter(([method, url]) => method === 'GET' && url === '/api/billing/status')).toHaveLength(1);
    expect(open).not.toHaveBeenCalled();
  });

  /* 2026-11-06, the founder's Codespace click-through: with no billing record, "Manage billing" answered a click with
     a red "Billing portal unavailable · Failed to create portal session", beside the page's own "Billing is not set
     up". The control now says so before it is clicked. */
  it('with no billing record yet, Manage billing is unavailable and says why, and nothing is sent', async () => {
    h.apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/billing/status') return ok({ ...STATUS, billingAccount: false });
      if (method === 'GET' && url.startsWith('/api/billing/invoices')) return ok({ billingSetUp: false, invoices: [], hasMore: false, nextCursor: null });
      throw new Error(`unexpected ${method} ${url}`);
    });
    mount();
    const manage = await screen.findByRole('button', { name: /Manage billing/ });
    expect((manage as HTMLButtonElement).disabled).toBe(true);
    expect(manage.getAttribute('aria-describedby')).toBe('lic-billing-not-set-up');
    expect(screen.getByText('Billing is set up the first time a subscription is checked out.')).toBeTruthy();
    fireEvent.click(manage);
    expect(posts().some(([, url]) => url === '/api/billing/portal')).toBe(false);
  });
});

const ACTOR = { id: '7', organizationId: '1', displayName: 'Original Billing Administrator', email: 'original@example.invalid',
  roles: ['admin'], permissions: ['governed:write', 'billing:admin'] } as AuthUser;
const startBillingSession = () => authService.setToken('fixture-original-billing-session', ACTOR, 'fixture-original-refresh', 3600);
const statusReads = () => h.apiRequest.mock.calls.filter(([method, url]) => method === 'GET' && url === '/api/billing/status').length;
type BillingAction = 'free' | 'dtc' | 'per-user' | 'portal';
const billingReply = (action: BillingAction) => action === 'free' ? { sessionId: 'free', url: '/concept2cure?welcome=true' }
  : action === 'portal' ? { portalUrl: 'https://billing.stripe.test/p/original' }
    : action === 'per-user' ? { checkoutUrl: 'https://checkout.stripe.test/c/original' }
      : { sessionId: 'cs_test_original', url: 'https://checkout.stripe.test/c/original' };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function pendingBilling(action: BillingAction, delayedJson = false) {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null), response = deferred<Response>(), body = deferred<unknown>();
  const json = vi.fn(() => body.promise);
  const target = action === 'portal' ? '/api/billing/portal' : action === 'per-user' ? '/api/billing/checkout' : '/api/billing/dtc-checkout';
  serve(undefined, action === 'free' ? { ...STATUS, tier: 'standard', paymentStatus: 'incomplete' } : STATUS);
  const fallback = h.apiRequest.getMockImplementation()!;
  h.apiRequest.mockImplementation((method: string, url: string, payload: unknown) => method === 'POST' && url === target
    ? response.promise : fallback(method, url, payload));
  mount(); await screen.findAllByText('Current subscription');
  if (action === 'per-user') fireEvent.click(screen.getByRole('button', { name: /Enterprise \(per-user\)/ }));
  const choose = action === 'portal' ? await screen.findByRole('button', { name: /Manage billing/ })
    : action === 'free' ? await screen.findByRole('button', { name: 'Start free' })
      : screen.getAllByRole('button').find(button => CHECKOUT.test((button.textContent ?? '').trim()) && !/free/i.test(button.textContent ?? ''));
  expect(choose).toBeTruthy(); fireEvent.click(choose!);
  await waitFor(() => expect(posts().filter(([, url]) => url === target)).toHaveLength(1));
  if (delayedJson) { await act(async () => response.resolve({ ok: true, status: 200, json } as unknown as Response)); expect(json).toHaveBeenCalledOnce(); }
  return { open, response, settle: () => delayedJson ? body.resolve(billingReply(action)) : response.resolve(ok(billingReply(action))) };
}
async function rereadAccount(user: AuthUser) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ authenticated: true, user }),
    { status: 200, headers: { 'Content-Type': 'application/json' } })));
  const guard = authService.captureSessionReadGuard();
  await act(async () => { expect((await authService.refreshUser()).success).toBe(true); });
  expect(guard.sameRevision()).toBe(true);
}

describe('billing responses stay with the account and access that requested them', () => {
  beforeEach(startBillingSession);

  it.each(['free', 'portal'] as const)('does not dispatch %s while session adoption is pending', async action => {
    serve(undefined, { ...STATUS, tier: 'standard', paymentStatus: 'incomplete' }); mount();
    await screen.findAllByText('Current subscription');
    const choose = await screen.findByRole('button', { name: action === 'free' ? 'Start free' : /Manage billing/ });
    const probe = deferred<Response>(); vi.stubGlobal('fetch', vi.fn(() => probe.promise));
    const adoption = authService.adoptSession('fixture-pending-session');
    expect(authService.captureSessionReadGuard().sameRevision()).toBe(false);
    try {
      fireEvent.click(choose);
      await act(async () => {}); expect(posts()).toHaveLength(0); expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      await act(async () => { probe.resolve(new Response(JSON.stringify({ authenticated: false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } })); expect(await adoption).toBeNull(); });
    }
  });

  it.each(['account', 'organization', 'session', 'permissions', 'roles', 'sign-out'] as const)('discards delayed free activation after a %s change', async change => {
    const pending = await pendingBilling('free');
    if (change === 'account') authService.setToken('fixture-next', { ...ACTOR, id: '8' }, 'fixture-next-refresh', 3600);
    if (change === 'organization') authService.setToken('fixture-next', { ...ACTOR, organizationId: '2' }, 'fixture-next-refresh', 3600);
    if (change === 'session') authService.setToken('fixture-replacement', { ...ACTOR }, 'fixture-next-refresh', 3600);
    if (change === 'permissions') await rereadAccount({ ...ACTOR, permissions: [] });
    if (change === 'roles') await rereadAccount({ ...ACTOR, roles: ['member'] });
    if (change === 'sign-out') authService.endSession(null);
    const before = statusReads(); await act(async () => pending.settle());
    expect(screen.queryByText('Free subscription activated')).toBeNull(); expect(screen.queryByRole('alert')).toBeNull();
    expect(statusReads()).toBe(before); expect(pending.open).not.toHaveBeenCalled(); expect(posts()).toHaveLength(1);
  });

  it('fences an account change during delayed free-response JSON parsing', async () => {
    const pending = await pendingBilling('free', true);
    authService.setToken('fixture-next', { ...ACTOR, id: '8' }, 'fixture-next-refresh', 3600);
    const before = statusReads(); await act(async () => pending.settle());
    expect(screen.queryByText('Free subscription activated')).toBeNull(); expect(statusReads()).toBe(before);
    expect(pending.open).not.toHaveBeenCalled(); expect(posts()).toHaveLength(1);
  });

  it.each(['dtc', 'per-user', 'portal'] as const)('does not open a delayed %s handoff for another account', async action => {
    const pending = await pendingBilling(action);
    authService.setToken('fixture-next', { ...ACTOR, id: '8' }, 'fixture-next-refresh', 3600);
    await act(async () => pending.settle());
    expect(pending.open).not.toHaveBeenCalled(); expect(screen.queryByRole('alert')).toBeNull(); expect(posts()).toHaveLength(1);
  });

  it.each(['free', 'portal'] as const)('does not disclose a delayed %s refusal to a replacement account', async action => {
    const pending = await pendingBilling(action);
    authService.setToken('fixture-next', { ...ACTOR, id: '8' }, 'fixture-next-refresh', 3600);
    const before = statusReads(); await act(async () => pending.response.reject(new ApiRequestError('Original-account billing refusal', 409)));
    expect(screen.queryByRole('alert')).toBeNull(); expect(screen.queryByText(/Original-account billing refusal/)).toBeNull();
    expect(pending.open).not.toHaveBeenCalled(); expect(statusReads()).toBe(before); expect(posts()).toHaveLength(1);
  });
});

describe('billing responses survive ordinary refresh in the same session', () => {
  beforeEach(startBillingSession);

  it.each(['free', 'dtc', 'per-user', 'portal'] as const)('accepts the pending %s result after actual bearer refresh', async action => {
    const pending = await pendingBilling(action), guard = authService.captureSessionReadGuard();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ accessToken: 'fixture-rotated-bearer',
      refreshToken: 'fixture-rotated-refresh', expiresIn: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    expect(guard.sameRevision()).toBe(true); expect(guard.credentialsCurrent()).toBe(false);
    const before = statusReads(); await act(async () => pending.settle());
    if (action === 'free') {
      expect(screen.getByText('Free subscription activated')).toBeTruthy(); expect(statusReads()).toBe(before + 1); expect(pending.open).not.toHaveBeenCalled();
    } else {
      expect(pending.open).toHaveBeenCalledOnce(); expect(pending.open).toHaveBeenCalledWith(action === 'portal'
        ? 'https://billing.stripe.test/p/original' : 'https://checkout.stripe.test/c/original', '_blank');
    }
    expect(posts()).toHaveLength(1);
  });

  it('accepts a pending free result after an unchanged account-object reread', async () => {
    const pending = await pendingBilling('free'); await rereadAccount({ ...ACTOR });
    const before = statusReads(); await act(async () => pending.settle());
    expect(screen.getByText('Free subscription activated')).toBeTruthy(); expect(statusReads()).toBe(before + 1);
    expect(pending.open).not.toHaveBeenCalled(); expect(posts()).toHaveLength(1);
  });
});
